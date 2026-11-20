export const LIVE_ASSETS_ORIGIN = 'https://meal-muallimun.vercel.app';
export const LIVE_DATA_BASE_URL = `${LIVE_ASSETS_ORIGIN}/data`;
export const LOCAL_DATA_BASE_URL = '/data';

const envBaseUrl = (import.meta.env.VITE_DATA_BASE_URL as string | undefined)?.trim();

export const HAS_CUSTOM_DATA_BASE_URL = Boolean(envBaseUrl);

/**
 * Merkezi veri taban adresi.
 * VITE_DATA_BASE_URL tanımlıysa onu kullanır, yoksa canlı domain adresini işaret eder.
 * dataService çalışma zamanında aynı kökteki /data erişilebilirliğini de esnek biçimde destekler.
 */
export const DATA_BASE_URL = (envBaseUrl || LIVE_DATA_BASE_URL).replace(/\/+$/, '');

/**
 * Uygulama kendi canlı domaininde (vercel.app veya muallimun.net) mi çalışıyor kontrolü.
 * AI Studio önizleme veya farklı hostlarda yerel statik dosya yoksa Vercel CDN'e sorunsuz düşülmesini sağlar.
 */
export function isNativeMuallimunHost(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname.toLowerCase();
  return host.includes('vercel.app') || host.includes('muallimun.net');
}

export function getFontUrl(fileName: string): string {
  const clean = fileName.replace(/^\/+/, '');
  return isNativeMuallimunHost()
    ? `/fonts/${clean}`
    : `${LIVE_ASSETS_ORIGIN}/fonts/${clean}`;
}

export function getLocalFontUrl(fileName: string): string {
  const clean = fileName.replace(/^\/+/, '');
  return `/fonts/${clean}`;
}

export function getSfxUrl(fileName: string): string {
  const clean = fileName.replace(/^\/+/, '');
  return isNativeMuallimunHost()
    ? `/sfx/${clean}`
    : `${LIVE_ASSETS_ORIGIN}/sfx/${clean}`;
}

export function getLocalSfxUrl(fileName: string): string {
  const clean = fileName.replace(/^\/+/, '');
  return `/sfx/${clean}`;
}

export interface ArabicFontOption {
  id: string;
  label: string;
  fileName: string;
  fontFamily: string;
  description: string;
}

export const ARABIC_FONTS: readonly ArabicFontOption[] = [
  {
    id: 'elfmshf',
    label: 'Elif Mushaf Hattı',
    fileName: 'elfmshf.ttf',
    fontFamily: '"Elif Mushaf Hattı"',
    description: 'Klasik Türkiye mushaf okuma deneyimi (varsayılan)',
  },
  {
    id: 'shaikh-book',
    label: 'Şeyh Hamdullah Kitap',
    fileName: 'ShaikhHamdullahBook.ttf',
    fontFamily: '"Şeyh Hamdullah Kitap"',
    description: 'Dengeli ve akıcı kitap nesih hattı',
  },
  {
    id: 'shaikh-basic',
    label: 'Şeyh Hamdullah Klasik',
    fileName: 'ShaikhHamdullahBasic.ttf',
    fontFamily: '"Şeyh Hamdullah Klasik"',
    description: 'Geleneksel Osmanlı hat zarafeti',
  },
  {
    id: 'suleyman',
    label: 'Süleyman Feyzullah Hattı',
    fileName: 'slymnfyzlgl.ttf',
    fontFamily: '"Süleyman Feyzullah Hattı"',
    description: 'Net harekeli yüksek okunaklı mushaf hattı',
  },
  {
    id: 'hasenat',
    label: 'Hasenât Mushaf Hattı',
    fileName: 'hsnt.TTF',
    fontFamily: '"Hasenât Mushaf Hattı"',
    description: 'Alışılmış bilgisayar ve mobil mushaf hattı',
  },
  {
    id: 'arakom',
    label: 'Arakom Nesih',
    fileName: 'Arakom.ttf',
    fontFamily: '"Arakom Nesih"',
    description: 'Ferah harf aralıklı modern nesih',
  },
  {
    id: 'adwa',
    label: "Edvâü's-Selef",
    fileName: 'adwa-assalaf.ttf',
    fontFamily: "\"Edvâü's-Selef\"",
    description: 'Vurgulu ve belirgin klasik hat',
  },
  {
    id: 'abdo',
    label: 'Abdo Line Modern',
    fileName: 'AbdoLineNormal-Regular.otf',
    fontFamily: '"Abdo Line Modern"',
    description: 'Gençler için sade ve modern çizgiler',
  },
  {
    id: 'winsoft',
    label: 'WinSoft Pro',
    fileName: 'WinSoftPro-Med.otf',
    fontFamily: '"WinSoft Pro"',
    description: 'Orta kalınlıkta yüksek kontrastlı yazı tipi',
  },
] as const;

export interface TurkishFontOption {
  id: string;
  label: string;
  fontStack: string;
  description: string;
}

export const TURKISH_FONTS: readonly TurkishFontOption[] = [
  {
    id: 'plus-jakarta',
    label: 'Plus Jakarta Sans',
    fontStack: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    description: 'Modern, yumuşak ve yüksek okunaklı (varsayılan)',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    fontStack: '"Nunito", system-ui, -apple-system, sans-serif',
    description: 'Gençler ve çocuklar için sıcak yuvarlak hatlar',
  },
  {
    id: 'inter',
    label: 'Inter',
    fontStack: '"Inter", system-ui, -apple-system, sans-serif',
    description: 'Sade, dengeli ve net ekran tipografisi',
  },
  {
    id: 'system',
    label: 'System Sans',
    fontStack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    description: 'Cihazın yerel sistem yazı tipi',
  },
] as const;

export type SfxKey = 'start' | 'click' | 'correct' | 'wrong' | 'success';

export const SFX_BASE_PATH = isNativeMuallimunHost()
  ? '/sfx'
  : `${LIVE_ASSETS_ORIGIN}/sfx`;

export const SFX_MAP: Record<SfxKey, readonly string[]> = {
  start: ['baslangic.mp3'],
  click: ['butonsesi.mp3'],
  correct: ['dogru.mp3', 'bildiniz.mp3'],
  wrong: ['yanliscevap.mp3', 'bilemediniz.mp3'],
  success: ['basari.mp3', 'tebrikler.mp3'],
};

export function resolveArabicFontFamily(label: string): string {
  const found = ARABIC_FONTS.find((f) => f.label === label);
  return found ? `${found.fontFamily}, "Elif Mushaf Hattı", serif` : '"Elif Mushaf Hattı", serif';
}

export function resolveTurkishFontStack(label: string): string {
  const found = TURKISH_FONTS.find((f) => f.label === label);
  return found ? found.fontStack : TURKISH_FONTS[0].fontStack;
}
