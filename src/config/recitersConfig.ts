import type {
  ManifestData,
  ReciterCategory,
  ReciterDefinition,
  ReciterFilePattern,
} from '../types/quran';
import type { SegMetaFile } from '../types/wordSync';

export const DEFAULT_RECITER_ID = 'maher_al_muaiqly';

export interface ReciterCategoryMeta {
  id: ReciterCategory;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
}

export const RECITER_CATEGORIES: readonly ReciterCategoryMeta[] = [
  {
    id: 'turk',
    label: '🇹🇷 Türk Kurrâlar',
    shortLabel: 'Türk Kurrâlar',
    emoji: '🇹🇷',
    description: 'Türkiye Mushaf tilaveti ve hatim geleneği',
  },
  {
    id: 'talim',
    label: '🎓 Talim & Tecvit',
    shortLabel: 'Talim & Tecvit',
    emoji: '🎓',
    description: 'Tecvit, mahreç, tekrar boşluklu ve çocuk tekrarlı öğretici okuyuşlar',
  },
  {
    id: 'murattal',
    label: '🕌 Mürattel',
    shortLabel: 'Mürattel',
    emoji: '🕌',
    description: 'Akıcı hatim ve günlük dinleme okuyuşları',
  },
  {
    id: 'mujawwad',
    label: '🎼 Mücevved',
    shortLabel: 'Mücevved',
    emoji: '🎼',
    description: 'Makamlı ve ağır tilavet icraları',
  },
] as const;

/**
 * 4 Kategoride 28 Kur'an Okuyucu (3 Türk Kurrâ + 25 Arap Kurrâ)
 * Varsayılan okuyucu: maher_al_muaiqly (Mâhir el-Muaykilî)
 */
export const RECITERS_CATALOG: readonly ReciterDefinition[] = [
  // ============================================================================
  // Kategori 1 — Türk Kurrâlar (filePattern: 'underscore')
  // ============================================================================
  {
    id: 'hatim',
    label: 'İshak Danış',
    shortLabel: 'İshak Danış',
    category: 'turk',
    styleLabel: 'Hatim',
    baseUrl:
      'https://archive.org/download/ishak-danis-ayet-ayet-hatim-arsivi/Ishak_Danis',
    fallbackBaseUrl:
      'https://dn721808.ca.archive.org/0/items/ishak-danis-ayet-ayet-hatim-arsivi/Ishak_Danis',
    filePattern: 'underscore',
    ext: 'mp3',
  },
  {
    id: 'davut_kaya',
    label: 'Davut Kaya',
    shortLabel: 'Davut Kaya',
    category: 'turk',
    styleLabel: 'Hatim',
    baseUrl:
      'https://archive.org/download/davut-kaya-ayet-ayet-hatim-arsivi/Davut_Kaya',
    fallbackBaseUrl:
      'https://dn711205.ca.archive.org/0/items/davut-kaya-ayet-ayet-hatim-arsivi/Davut_Kaya',
    filePattern: 'underscore',
    ext: 'mp3',
  },
  {
    id: 'osman_sahin',
    label: 'Osman Şahin',
    shortLabel: 'Osman Şahin',
    category: 'turk',
    styleLabel: 'Hatim',
    baseUrl:
      'https://archive.org/download/osman-sahin-ayet-ayet-hatim-arsivi',
    fallbackBaseUrl:
      'https://dn710202.ca.archive.org/0/items/osman-sahin-ayet-ayet-hatim-arsivi',
    filePattern: 'underscore',
    ext: 'mp3',
  },

  // ============================================================================
  // Kategori 2 — Talim & Ezber — Öğretici (filePattern: 'compact')
  // ============================================================================
  {
    id: 'husary_muallim',
    label: 'Mahmud Halîl el-Husrî (Muallim)',
    shortLabel: 'el-Husrî (Muallim)',
    category: 'talim',
    styleLabel: 'Tekrar Boşluklu',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Husary_Muallim_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'minshawy_teacher',
    label: 'Muhammed Sıddîk el-Minşâvî (Muallim)',
    shortLabel: 'el-Minşâvî (Muallim)',
    category: 'talim',
    styleLabel: 'Çocuk Tekrarlı',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Minshawy_Teacher_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'ayman_suwaid',
    label: 'Dr. Eymen Süveyd (Tecvit & Mahreç Talimi)',
    shortLabel: 'Dr. Eymen Süveyd',
    category: 'talim',
    styleLabel: 'Tecvit & Mahreç',
    bitrate: '64k',
    baseUrl: 'https://everyayah.com/data/Ayman_Sowaid_64kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },

  // ============================================================================
  // Kategori 3 — Mücevved — Makamlı Tilavet (filePattern: 'compact')
  // ============================================================================
  {
    id: 'abdul_basit_mujawwad',
    label: 'Abdülbâsıt Abdüssamed (Mücevved)',
    shortLabel: 'Abdülbâsıt (Mücevved)',
    category: 'mujawwad',
    styleLabel: 'Mücevved',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Abdul_Basit_Mujawwad_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'minshawy_mujawwad',
    label: 'Muhammed Sıddîk el-Minşâvî (Mücevved)',
    shortLabel: 'el-Minşâvî (Mücevved)',
    category: 'mujawwad',
    styleLabel: 'Mücevved',
    bitrate: '192k',
    baseUrl: 'https://everyayah.com/data/Minshawy_Mujawwad_192kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },

  // ============================================================================
  // Kategori 4 — Mürattel — Hatim Okuyuşu (filePattern: 'compact')
  // ============================================================================
  {
    id: 'al_afasy',
    label: 'Mişârî Râşid el-Afâsî',
    shortLabel: 'Mişârî el-Afâsî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Alafasy_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'maher_al_muaiqly',
    label: 'Mâhir el-Muaykilî',
    shortLabel: 'Mâhir el-Muaykilî',
    category: 'murattal',
    styleLabel: 'Mürattel · Varsayılan',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/MaherAlMuaiqly128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'as_sudais',
    label: 'Abdurrahman es-Sudeys',
    shortLabel: 'Abdurrahman es-Sudeys',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '192k',
    baseUrl: 'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'ash_shuraym',
    label: 'Suûd eş-Şureym',
    shortLabel: 'Suûd eş-Şureym',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Saood_ash-Shuraym_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'hudhaify',
    label: 'Ali el-Huzeyfî',
    shortLabel: 'Ali el-Huzeyfî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Hudhaify_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'ghamadi',
    label: 'Sa‘d el-Gâmidî',
    shortLabel: 'Sa‘d el-Gâmidî',
    category: 'murattal',
    styleLabel: 'Veri Dostu',
    bitrate: '40k',
    baseUrl: 'https://everyayah.com/data/Ghamadi_40kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'abdul_basit_murattal',
    label: 'Abdülbâsıt Abdüssamed (Mürattel)',
    shortLabel: 'Abdülbâsıt (Mürattel)',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '192k',
    baseUrl: 'https://everyayah.com/data/Abdul_Basit_Murattal_192kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'husary',
    label: 'Mahmud Halîl el-Husrî',
    shortLabel: 'Mahmud el-Husrî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Husary_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'abdullah_basfar',
    label: 'Abdullah Basfar',
    shortLabel: 'Abdullah Basfar',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '192k',
    baseUrl: 'https://everyayah.com/data/Abdullah_Basfar_192kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'nasser_alqatami',
    label: 'Nâsır el-Katâmî',
    shortLabel: 'Nâsır el-Katâmî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Nasser_Alqatami_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'fares_abbad',
    label: 'Fâris Abbâd',
    shortLabel: 'Fâris Abbâd',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '64k',
    baseUrl: 'https://everyayah.com/data/Fares_Abbad_64kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'ash_shaatree',
    label: 'Ebû Bekir eş-Şâtırî',
    shortLabel: 'Ebû Bekir eş-Şâtırî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Abu_Bakr_Ash-Shaatree_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'al_ajamy',
    label: 'Ahmed b. Ali el-Acemî',
    shortLabel: 'Ahmed el-Acemî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'muhammad_jibreel',
    label: 'Muhammed Cibrîl',
    shortLabel: 'Muhammed Cibrîl',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Muhammad_Jibreel_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'muhsin_al_qasim',
    label: 'Abdülmuhsin el-Kâsım',
    shortLabel: 'Abdülmuhsin el-Kâsım',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '192k',
    baseUrl: 'https://everyayah.com/data/Muhsin_Al_Qasim_192kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'al_juhaynee',
    label: 'Abdullah Avvâd el-Cühenî',
    shortLabel: 'Abdullah el-Cühenî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Abdullaah_3awwaad_Al-Juhaynee_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'abdullah_matroud',
    label: 'Abdullah Matrûd',
    shortLabel: 'Abdullah Matrûd',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Abdullah_Matroud_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'ahmed_neana',
    label: 'Ahmed Nuayna',
    shortLabel: 'Ahmed Nuayna',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Ahmed_Neana_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'akram_alalaqimy',
    label: 'Ekrem el-Alâkımî',
    shortLabel: 'Ekrem el-Alâkımî',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Akram_AlAlaqimy_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
  {
    id: 'sahl_yassin',
    label: 'Sehl Yâsîn',
    shortLabel: 'Sehl Yâsîn',
    category: 'murattal',
    styleLabel: 'Mürattel',
    bitrate: '128k',
    baseUrl: 'https://everyayah.com/data/Sahl_Yassin_128kbps',
    filePattern: 'compact',
    ext: 'mp3',
  },
] as const;

function inferArchiveFallback(baseUrl: string): string | undefined {
  const match = baseUrl.match(/\/0\/items\/(.+)$/);
  if (match && match[1]) {
    return `https://archive.org/download/${match[1].replace(/\/+$/, '')}`;
  }
  return undefined;
}

function inferPatternFromUrl(baseUrl: string, explicit?: ReciterFilePattern): ReciterFilePattern {
  if (explicit === 'underscore' || explicit === 'compact') return explicit;
  if (/everyayah\.com/i.test(baseUrl)) return 'compact';
  return 'underscore';
}

function cleanLabelName(label: string): string {
  return label.replace(/\s*\(Hatim\)\s*/gi, '').trim() || label;
}

/**
 * 27 yerleşik okuyucuyu, manifest.json -> audioSources içindeki `kind: 'ar'`
 * kaynaklarıyla birleştirir/günceller.
 */
export function getAllReciters(manifest: ManifestData | null): ReciterDefinition[] {
  const map = new Map<string, ReciterDefinition>();
  for (const item of RECITERS_CATALOG) {
    map.set(item.id, { ...item });
  }

  if (manifest?.audioSources) {
    for (const [key, src] of Object.entries(manifest.audioSources)) {
      if (!src || src.kind !== 'ar' || !src.baseUrl?.trim()) continue;
      const id = src.id || key;
      const rawBase = src.baseUrl.replace(/\/+$/, '');
      const rawFallback = src.fallbackBaseUrl?.replace(/\/+$/, '') || undefined;
      const ephemeralMatch = rawBase.match(/^https?:\/\/[^/]*\.archive\.org\/0\/items\/(.+)$/i);
      const cleanBase =
        ephemeralMatch && ephemeralMatch[1]
          ? `https://archive.org/download/${ephemeralMatch[1].replace(/\/+$/, '')}`
          : rawBase;
      const normalizedFallback =
        ephemeralMatch && ephemeralMatch[1]
          ? rawBase
          : rawFallback && rawFallback !== cleanBase
            ? rawFallback
            : undefined;
      const existing = map.get(id);

      if (existing) {
        const existingFallback =
          existing.fallbackBaseUrl && existing.fallbackBaseUrl !== cleanBase
            ? existing.fallbackBaseUrl
            : undefined;
        map.set(id, {
          ...existing,
          baseUrl: cleanBase,
          fallbackBaseUrl:
            normalizedFallback || existingFallback || inferArchiveFallback(cleanBase),
          filePattern: src.filePattern ?? existing.filePattern,
          bitrate: src.bitrate ?? existing.bitrate,
          styleLabel: src.styleLabel ?? existing.styleLabel,
        });
      } else {
        const displayName = src.reciterName?.trim() || cleanLabelName(src.label);
        const filePattern = inferPatternFromUrl(cleanBase, src.filePattern);
        map.set(id, {
          id,
          label: displayName,
          shortLabel: src.shortLabel?.trim() || displayName,
          category: src.category ?? (filePattern === 'underscore' ? 'turk' : 'murattal'),
          styleLabel: src.styleLabel ?? (filePattern === 'underscore' ? 'Hatim' : 'Mürattel'),
          bitrate: src.bitrate,
          baseUrl: cleanBase,
          fallbackBaseUrl: normalizedFallback || inferArchiveFallback(cleanBase),
          filePattern,
          ext: 'mp3',
        });
      }
    }
  }

  return Array.from(map.values());
}

export function findReciterById(
  id: string | undefined | null,
  manifest: ManifestData | null,
): ReciterDefinition {
  const all = getAllReciters(manifest);
  if (id) {
    const found = all.find((r) => r.id === id);
    if (found) return found;
  }
  return all.find((r) => r.id === DEFAULT_RECITER_ID) ?? all[0];
}

export function formatReciterBadge(reciter: ReciterDefinition): string {
  if (reciter.styleLabel && reciter.bitrate) {
    if (reciter.styleLabel === 'Mürattel' || reciter.styleLabel === 'Mücevved') {
      return reciter.bitrate;
    }
    return `${reciter.styleLabel} · ${reciter.bitrate}`;
  }
  return reciter.styleLabel || reciter.bitrate || '';
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Okuyucunun `filePattern` değerine göre birincil ve (varsa) yedek MP3 URL'lerini üretir:
 * - 'underscore': {baseUrl}/{SSS}_{AAA}.mp3 (Besmele: 001_001.mp3)
 * - 'compact':    {baseUrl}/{SSS}{AAA}.mp3  (Besmele: 001001.mp3)
 */
export function buildReciterAudioUrls(
  source: {
    baseUrl: string;
    fallbackBaseUrl?: string;
    filePattern?: ReciterFilePattern;
    ext?: string;
  },
  surahNo: number,
  ayahNo: number,
): string[] {
  if (!source.baseUrl) return [];
  const ext = source.ext || 'mp3';
  const pattern = source.filePattern ?? 'underscore';
  const fileName =
    pattern === 'compact'
      ? `${pad3(surahNo)}${pad3(ayahNo)}.${ext}`
      : `${pad3(surahNo)}_${pad3(ayahNo)}.${ext}`;

  const primary = `${source.baseUrl.replace(/\/+$/, '')}/${fileName}`;
  const fallback = source.fallbackBaseUrl
    ? `${source.fallbackBaseUrl.replace(/\/+$/, '')}/${fileName}`
    : null;

  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

function foldReciterSearch(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/shuraym/g, 'shuraim')
    .replace(/sureym/g, 'shuraim')
    .replace(/minshawy/g, 'minshawi')
    .replace(/minsavi/g, 'minshawi')
    .replace(/husri/g, 'husary')
    .replace(/muaykili/g, 'muaiqly')
    .replace(/muayqili/g, 'muaiqly');
}

/**
 * Seçili kurrânın `seg/meta.json` içindeki kelime senkronu destekli reciterKey
 * kaydıyla eşleşip eşleşmediğini `matchHints` ve `excludeHints` kurallarıyla çözer.
 */
export function resolveSyncedReciterKey(
  reciter: Pick<
    ReciterDefinition,
    'id' | 'label' | 'shortLabel' | 'baseUrl' | 'styleLabel' | 'category'
  >,
  segMeta: SegMetaFile | null | undefined,
): string | null {
  if (!segMeta || !segMeta.reciters) return null;

  const haystack = foldReciterSearch(
    `${reciter.id} ${reciter.label} ${reciter.shortLabel} ${reciter.baseUrl} ${reciter.styleLabel} ${reciter.category}`,
  );
  const foldedId = foldReciterSearch(reciter.id);

  for (const [key, meta] of Object.entries(segMeta.reciters)) {
    if (!meta) continue;
    const excludes = Array.isArray(meta.excludeHints) ? meta.excludeHints : [];
    const isExcluded = excludes.some((hint) => {
      const h = foldReciterSearch(String(hint || '').trim());
      return Boolean(h && haystack.includes(h));
    });
    if (isExcluded) continue;

    const foldedKey = foldReciterSearch(key);
    if (foldedId === foldedKey) {
      return key;
    }

    const hints = Array.isArray(meta.matchHints) ? meta.matchHints : [];
    const isMatched = hints.some((hint) => {
      const h = foldReciterSearch(String(hint || '').trim());
      return Boolean(h && haystack.includes(h));
    });
    if (isMatched) {
      return key;
    }
  }

  return null;
}

/**
 * `{SSS}`, `{AAA}`, `{S}`, `{A}` yer tutucularını doldurarak birebir zaman senkronlu
 * MP3 URL'sini üretir.
 */
export function buildTemplateAudioUrl(
  template: string,
  surahNo: number,
  ayahNo: number,
): string {
  return template
    .replace(/\{SSS\}/g, pad3(surahNo))
    .replace(/\{AAA\}/g, pad3(ayahNo))
    .replace(/\{S\}/g, String(surahNo))
    .replace(/\{A\}/g, String(ayahNo));
}
