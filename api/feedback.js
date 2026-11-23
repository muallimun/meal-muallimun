/**
 * Muallimun Kur'an & Meal — Sunucu Köprülü İletişim & Geri Bildirim Uç Noktası
 * POST /api/feedback
 *
 * - Geliştirici e-posta adresini veya hedef webhook adresini istemciye ifşa etmez.
 * - IP bazlı bellek içi hız sınırı (dakikada en fazla 5 istek, LRU maks 2000 IP).
 * - 16 KB gövde sınırı, honeypot bot filtresi, alan doğrulama ve Google Sheets formül koruması.
 */

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_TRACKED_IPS = 2000;
const UPSTREAM_TIMEOUT_MS = 10 * 1000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FORMULA_PREFIX_REGEX = /^[=+\-@\t\r]/;

/** @type {Map<string, number[]>} */
const ipRateLimitMap = new Map();

/**
 * IP adresini vekil (proxy) başlıklarından güvenli biçimde çözümler.
 * @param {import('http').IncomingMessage & { headers?: Record<string, string | string[] | undefined>, socket?: { remoteAddress?: string } }} req
 */
function resolveClientIp(req) {
  const headers = req.headers || {};
  const candidates = [
    headers['x-vercel-forwarded-for'],
    headers['x-real-ip'],
    headers['cf-connecting-ip'],
    headers['x-forwarded-for'],
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const text = Array.isArray(raw) ? raw.join(',') : String(raw);
    const parts = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (/^[a-fA-F0-9:.]{3,64}$/.test(part)) {
        return part;
      }
    }
  }

  const remote = req.socket?.remoteAddress;
  if (typeof remote === 'string' && remote.trim()) {
    return remote.trim().slice(0, 64);
  }
  return 'unknown';
}

/**
 * IP bazlı hız sınırı kontrolü (LRU tahliyeli).
 * @param {string} ip
 * @param {number} now
 */
function checkRateLimit(ip, now) {
  const existing = ipRateLimitMap.get(ip);
  const recent = (existing || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (existing) {
    // LRU tazeleme: silip sona ekle
    ipRateLimitMap.delete(ip);
  }

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRateLimitMap.set(ip, recent);
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  ipRateLimitMap.set(ip, recent);

  // Maksimum 2000 IP üst sınırı (en eski kayıtları temizle)
  while (ipRateLimitMap.size > MAX_TRACKED_IPS) {
    const oldestKey = ipRateLimitMap.keys().next().value;
    if (oldestKey === undefined) break;
    ipRateLimitMap.delete(oldestKey);
  }

  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Google Sheets formül enjeksiyonuna karşı hücre metnini korur.
 * @param {string} value
 */
function sanitizeSheetCell(value) {
  const clean = String(value ?? '')
    .replace(/\0/g, '')
    .trim();
  if (!clean) return '';
  return FORMULA_PREFIX_REGEX.test(clean) ? `'${clean}` : clean;
}

/**
 * İstek gövdesini 16 KB sınırını aşmadan okur ve JSON olarak ayrıştırır.
 * @param {any} req
 */
async function readJsonBody(req) {
  const contentLengthHeader = req.headers?.['content-length'];
  if (contentLengthHeader !== undefined) {
    const declaredLength = Number(Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return { errorStatus: 413, errorMessage: 'Gönderilen veri boyutu izin verilen sınırı aşıyor.' };
    }
  }

  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        return { errorStatus: 413, errorMessage: 'Gönderilen veri boyutu izin verilen sınırı aşıyor.' };
      }
      try {
        return { data: JSON.parse(req.body) };
      } catch {
        return { errorStatus: 400, errorMessage: 'Geçersiz JSON istek gövdesi.' };
      }
    }
    if (typeof req.body === 'object' && !Array.isArray(req.body)) {
      const serialized = JSON.stringify(req.body);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
        return { errorStatus: 413, errorMessage: 'Gönderilen veri boyutu izin verilen sınırı aşıyor.' };
      }
      return { data: req.body };
    }
    return { errorStatus: 400, errorMessage: 'Geçersiz JSON istek gövdesi.' };
  }

  return new Promise((resolve) => {
    let totalBytes = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        resolve({
          errorStatus: 413,
          errorMessage: 'Gönderilen veri boyutu izin verilen sınırı aşıyor.',
        });
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({ errorStatus: 400, errorMessage: 'Boş istek gövdesi gönderilemez.' });
        return;
      }
      try {
        resolve({ data: JSON.parse(raw) });
      } catch {
        resolve({ errorStatus: 400, errorMessage: 'Geçersiz JSON istek gövdesi.' });
      }
    });

    req.on('error', () => {
      if (settled) return;
      settled = true;
      resolve({ errorStatus: 400, errorMessage: 'İstek gövdesi okunamadı.' });
    });
  });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, val] of Object.entries(extraHeaders)) {
    res.setHeader(key, val);
  }
  res.end(JSON.stringify(payload));
}

function readOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(
      res,
      405,
      { ok: false, error: 'Yalnızca POST istekleri kabul edilir.' },
      { Allow: 'POST' },
    );
  }

  const clientIp = resolveClientIp(req);
  const rateCheck = checkRateLimit(clientIp, Date.now());
  if (!rateCheck.allowed) {
    return sendJson(
      res,
      429,
      {
        ok: false,
        error: `Çok sık gönderim yapıldı. Lütfen ${rateCheck.retryAfterSec} saniye sonra tekrar deneyin.`,
      },
      { 'Retry-After': String(rateCheck.retryAfterSec) },
    );
  }

  const bodyResult = await readJsonBody(req);
  if (bodyResult.errorStatus) {
    return sendJson(res, bodyResult.errorStatus, {
      ok: false,
      error: bodyResult.errorMessage,
    });
  }

  const body = bodyResult.data;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendJson(res, 400, { ok: false, error: 'Geçersiz form verisi.' });
  }

  // Honeypot bot koruması: gizli website alanı doluysa sessizce başarılı dön
  const honeypot = readOptionalString(body.website);
  if (honeypot.length > 0) {
    return sendJson(res, 200, { ok: true });
  }

  const name = readOptionalString(body.name);
  const email = readOptionalString(body.email);
  const category = readOptionalString(body.category) || 'Genel Geri Bildirim';
  const contextRef = readOptionalString(body.contextRef);
  const message = readOptionalString(body.message);
  const pageUrl = readOptionalString(body.pageUrl);
  const metaInfo = readOptionalString(body.metaInfo);

  if (name.length < 3 || name.length > 100) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Lütfen adınızı ve soyadınızı en az 3, en fazla 100 karakter olacak şekilde girin.',
    });
  }

  if (!email || email.length > 150 || !EMAIL_REGEX.test(email)) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Lütfen geçerli bir e-posta adresi girin.',
    });
  }

  if (category.length > 150) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Kategori bilgisi izin verilen uzunluğu aşıyor.',
    });
  }

  if (contextRef.length > 250) {
    return sendJson(res, 400, {
      ok: false,
      error: 'İlgili bölüm / referans alanı en fazla 250 karakter olabilir.',
    });
  }

  if (message.length < 10 || message.length > 3000) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Mesajınız en az 10, en fazla 3000 karakter olmalıdır.',
    });
  }

  if (pageUrl.length > 500 || metaInfo.length > 300) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Teknik bağlam bilgisi izin verilen sınırı aşıyor.',
    });
  }

  const webhookUrl = (
    process.env.FEEDBACK_SCRIPT_URL ||
    process.env.VITE_FEEDBACK_SCRIPT_URL ||
    ''
  ).trim();

  if (!webhookUrl) {
    return sendJson(res, 503, {
      ok: false,
      error: 'İletişim servisi yapılandırması henüz tamamlanmadı.',
    });
  }

  let parsedWebhookUrl;
  try {
    parsedWebhookUrl = new URL(webhookUrl);
  } catch {
    return sendJson(res, 503, {
      ok: false,
      error: 'İletişim servisi yapılandırması henüz tamamlanmadı.',
    });
  }

  if (parsedWebhookUrl.protocol !== 'https:') {
    return sendJson(res, 503, {
      ok: false,
      error: 'İletişim servisi yapılandırması henüz tamamlanmadı.',
    });
  }

  const outboundPayload = {
    submittedAt: new Date().toISOString(),
    app: 'kuran.muallimun.net',
    name: sanitizeSheetCell(name),
    email: sanitizeSheetCell(email),
    category: sanitizeSheetCell(category),
    contextRef: sanitizeSheetCell(contextRef),
    message: sanitizeSheetCell(message),
    pageUrl: sanitizeSheetCell(pageUrl),
    metaInfo: sanitizeSheetCell(metaInfo),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(parsedWebhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(outboundPayload),
      redirect: 'follow',
      signal: controller.signal,
    });

    const rawText = await upstreamRes.text();
    const trimmed = rawText.trim();
    const isHtmlResponse =
      /^<!doctype html/i.test(trimmed) ||
      /^<html[\s>]/i.test(trimmed) ||
      trimmed.includes('accounts.google.com');

    if (!upstreamRes.ok || isHtmlResponse) {
      return sendJson(res, 502, {
        ok: false,
        error: 'Bildirim servisi şu anda yanıt veremiyor. Lütfen daha sonra tekrar deneyin.',
      });
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(trimmed);
      } catch {
        // JSON formatında olmayan düz metin yanıtları başarılı kabul edilir
      }
      if (parsedJson && typeof parsedJson === 'object' && parsedJson.ok === false) {
        return sendJson(res, 502, {
          ok: false,
          error: 'Bildirim servisi şu anda yanıt veremiyor. Lütfen daha sonra tekrar deneyin.',
        });
      }
    }

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    const isTimeout = err && typeof err === 'object' && err.name === 'AbortError';
    return sendJson(res, isTimeout ? 504 : 502, {
      ok: false,
      error: isTimeout
        ? 'İletişim servisi yanıt vermekte gecikti. Lütfen kısa bir süre sonra tekrar deneyin.'
        : 'Bağlantı sorunu nedeniyle mesajınız iletilemedi. Lütfen tekrar deneyin.',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
