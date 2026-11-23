import { getSurahMaxAyah } from './quranBounds';

export type DeepLinkTabTarget = 'reader' | 'fihrist' | 'memorize' | 'exam' | 'games';
export type DeepLinkGuideTab = 'quickstart' | 'modules' | 'offline_backup' | 'shortcuts';

export type UrlDeepLinkTarget =
  | { kind: 'verse'; surah: number; ayah: number }
  | { kind: 'page'; page: number }
  | { kind: 'juz'; juz: number }
  | { kind: 'tab'; tab: DeepLinkTabTarget }
  | { kind: 'guide'; guideTab: DeepLinkGuideTab };

export const PUBLIC_SITE_ORIGIN = 'https://kuran.muallimun.net';
export const PUBLIC_SITE_HOST = 'kuran.muallimun.net';

function parseStrictPositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeGuideTab(raw: string): DeepLinkGuideTab {
  const value = raw.trim().toLowerCase();
  if (value === 'modules' || value === 'moduller') return 'modules';
  if (value === 'offline_backup' || value === 'offline' || value === 'yedek') {
    return 'offline_backup';
  }
  if (value === 'shortcuts' || value === 'kisayollar') return 'shortcuts';
  return 'quickstart';
}

function normalizeTabParam(raw: string | null): DeepLinkTabTarget | null {
  if (!raw) return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

  if (normalized === 'okuma' || normalized === 'reader' || normalized === 'mushaf') {
    return 'reader';
  }
  if (normalized === 'fihrist' || normalized === 'arastirma' || normalized === 'defter') {
    return 'fihrist';
  }
  if (normalized === 'ezber' || normalized === 'memorize' || normalized === 'hafizlik') {
    return 'memorize';
  }
  if (normalized === 'sinav' || normalized === 'exam' || normalized === 'test') {
    return 'exam';
  }
  if (normalized === 'oyunlar' || normalized === 'oyun' || normalized === 'games') {
    return 'games';
  }
  return null;
}

/**
 * URL sorgu parametrelerini (?s=2&a=255, ?p=42, ?juz=30, ?tab=ezber, ?rehber=1)
 * güvenli sınır denetimiyle çözümler. Geçersiz veya boş sorguda null döner.
 */
export function parseInitialUrlTarget(search: string): UrlDeepLinkTarget | null {
  if (!search || search.trim() === '' || search.trim() === '?') return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const guideRaw = params.get('rehber') ?? params.get('guide');
  if (guideRaw !== null && guideRaw.trim() !== '' && guideRaw.trim() !== '0' && guideRaw.trim().toLowerCase() !== 'false') {
    return {
      kind: 'guide',
      guideTab: normalizeGuideTab(guideRaw),
    };
  }

  const surahRaw = parseStrictPositiveInt(params.get('s') ?? params.get('surah') ?? params.get('sure'));
  if (surahRaw !== null && surahRaw >= 1 && surahRaw <= 114) {
    const maxAyah = getSurahMaxAyah(surahRaw);
    const ayahRaw = parseStrictPositiveInt(params.get('a') ?? params.get('ayah') ?? params.get('ayet'));
    const ayah = ayahRaw !== null ? Math.min(maxAyah, Math.max(1, ayahRaw)) : 1;
    return {
      kind: 'verse',
      surah: surahRaw,
      ayah,
    };
  }

  const pageRaw = parseStrictPositiveInt(params.get('p') ?? params.get('page') ?? params.get('sayfa'));
  if (pageRaw !== null && pageRaw >= 1 && pageRaw <= 604) {
    return {
      kind: 'page',
      page: pageRaw,
    };
  }

  const juzRaw = parseStrictPositiveInt(params.get('juz') ?? params.get('cuz'));
  if (juzRaw !== null && juzRaw >= 1 && juzRaw <= 30) {
    return {
      kind: 'juz',
      juz: juzRaw,
    };
  }

  const tabTarget = normalizeTabParam(params.get('tab') ?? params.get('sekme'));
  if (tabTarget) {
    return {
      kind: 'tab',
      tab: tabTarget,
    };
  }

  return null;
}

export function parseInitialPathnameTarget(pathname: string): UrlDeepLinkTarget | null {
  if (!pathname || pathname === '/') return null;
  const trimmed = pathname.replace(/\/+$/, '');
  const lastSegment = trimmed.split('/').pop() ?? '';
  const tabTarget = normalizeTabParam(lastSegment);
  if (tabTarget) {
    return { kind: 'tab', tab: tabTarget };
  }
  return null;
}

export function isReaderSubroutePath(pathname: string): boolean {
  return /\/(mushaf|okuma|reader)\/?$/i.test(pathname);
}

export function isKnownAppSubroutePath(pathname: string): boolean {
  return /\/(mushaf|okuma|reader|fihrist|arastirma|defter|ezber|memorize|hafizlik|sinav|exam|test|oyunlar|oyun|games)\/?$/i.test(
    pathname,
  );
}

export function hasInitialDeepLinkTarget(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    parseInitialUrlTarget(window.location.search) !== null ||
    parseInitialPathnameTarget(window.location.pathname) !== null
  );
}

export function buildVerseShareUrl(surah: number, ayah: number): string {
  const safeSurah = Math.min(114, Math.max(1, Math.trunc(surah) || 1));
  const maxAyah = getSurahMaxAyah(safeSurah);
  const safeAyah = Math.min(maxAyah, Math.max(1, Math.trunc(ayah) || 1));
  return `${PUBLIC_SITE_ORIGIN}/?s=${safeSurah}&a=${safeAyah}`;
}

export function formatVerseShareDisplayUrl(surah: number, ayah: number): string {
  const safeSurah = Math.min(114, Math.max(1, Math.trunc(surah) || 1));
  const maxAyah = getSurahMaxAyah(safeSurah);
  const safeAyah = Math.min(maxAyah, Math.max(1, Math.trunc(ayah) || 1));
  return `${PUBLIC_SITE_HOST}/?s=${safeSurah}&a=${safeAyah}`;
}
