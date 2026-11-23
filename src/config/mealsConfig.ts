import type {
  BesmeleInfo,
  ManifestData,
  MealCategory,
  MealDefinition,
  MealStorageType,
} from '../types/quran';

export const DEFAULT_PRIMARY_MEAL_ID = 'm1';
export const DEFAULT_SECONDARY_MEAL_ID = 'm2';
export const DEFAULT_FAVORITE_MEAL_IDS: readonly string[] = ['m1', 'm2', 'm3', 'm5'];

export interface MealCategoryMeta {
  id: MealCategory;
  label: string;
  shortLabel: string;
  description: string;
}

export const MEAL_CATEGORIES: readonly MealCategoryMeta[] = [
  {
    id: 'resmi',
    label: 'Resmî / Diyanet',
    shortLabel: 'Resmî',
    description: 'Diyanet Vakfı ve Diyanet İşleri Başkanlığı mealleri',
  },
  {
    id: 'klasik',
    label: 'Klasik Mealler',
    shortLabel: 'Klasik',
    description: 'Cumhuriyet dönemi klasik müfessir ve âlim mealleri',
  },
  {
    id: 'cagdas',
    label: 'Çağdaş & Akademik',
    shortLabel: 'Çağdaş',
    description: 'Modern dönem akademik ve açıklamalı mealler',
  },
  {
    id: 'evrensel',
    label: 'Arapça & Evrensel',
    shortLabel: 'Arapça & Evrensel',
    description: 'Arapça klasik/kolay tefsirler ve İngilizce meal',
  },
] as const;

/**
 * 27 Eserlik Meal & Tefsir Kataloğu (Resmî: 4 · Klasik: 7 · Çağdaş: 13 · Arapça & Evrensel: 3)
 * m1 ve m2 mevcut m1/ ve m2/ klasörlerinden; m3..m27 tembel yüklemeli mx/sXXX.json paketinden gelir.
 */
export const MEALS_CATALOG: readonly MealDefinition[] = [
  // ============================================================================
  // Resmî / Diyanet (4)
  // ============================================================================
  {
    id: 'm1',
    slug: 'diyanet-vakfi',
    label: 'Diyanet Vakfı Meali (TDV)',
    shortLabel: 'TDV',
    category: 'resmi',
    hasAudio: true,
    audioSource: 'tdv',
    storage: 'm1',
    hasFootnotes: true,
  },
  {
    id: 'm2',
    slug: 'diyanet-isleri-yeni',
    label: 'Diyanet İşleri Meali (Yeni)',
    shortLabel: 'DİB Yeni',
    category: 'resmi',
    hasAudio: true,
    audioSource: 'dib',
    storage: 'm2',
    hasFootnotes: true,
  },
  {
    id: 'm3',
    slug: 'kuran-yolu',
    label: "Kur'an Yolu (Diyanet İşleri)",
    shortLabel: "Kur'an Yolu",
    category: 'resmi',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
    hasFootnotes: true,
  },
  {
    id: 'm4',
    slug: 'diyanet-isleri-eski',
    label: 'Diyanet İşleri Meali (Eski)',
    shortLabel: 'DİB Eski',
    category: 'resmi',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },

  // ============================================================================
  // Klasik Mealler (7)
  // ============================================================================
  {
    id: 'm5',
    slug: 'elmalili-hamdi-yazir',
    label: 'Elmalılı Hamdi Yazır Meali',
    shortLabel: 'Elmalılı',
    category: 'klasik',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
    hasFootnotes: true,
  },
  {
    id: 'm6',
    slug: 'elmalili-orijinal',
    label: 'Elmalılı Meali (Orijinal)',
    shortLabel: 'Elmalılı (Orj.)',
    category: 'klasik',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm7',
    slug: 'hasan-basri-cantay',
    label: 'Hasan Basri Çantay Meali',
    shortLabel: 'H. B. Çantay',
    category: 'klasik',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
    hasFootnotes: true,
  },
  {
    id: 'm8',
    slug: 'omer-nasuhi-bilmen',
    label: 'Ömer Nasuhi Bilmen Meali',
    shortLabel: 'Ö. N. Bilmen',
    category: 'klasik',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm9',
    slug: 'ismail-hakki-izmirli',
    label: 'İsmail Hakkı İzmirli',
    shortLabel: 'İ. H. İzmirli',
    category: 'klasik',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm10',
    slug: 'besim-atalay',
    label: 'Besim Atalay Meali (1965)',
    shortLabel: 'Besim Atalay',
    category: 'klasik',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm11',
    slug: 'ali-fikri-yavuz',
    label: 'Ali Fikri Yavuz Meali',
    shortLabel: 'Ali Fikri Yavuz',
    category: 'klasik',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },

  // ============================================================================
  // Çağdaş & Akademik (13)
  // ============================================================================
  {
    id: 'm12',
    slug: 'ali-bulac',
    label: 'Ali Bulaç Meali',
    shortLabel: 'Ali Bulaç',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm13',
    slug: 'suleyman-ates',
    label: 'Süleyman Ateş Meali',
    shortLabel: 'Süleyman Ateş',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm14',
    slug: 'bayraktar-bayrakli',
    label: 'Bayraktar Bayraklı Meali',
    shortLabel: 'B. Bayraklı',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm15',
    slug: 'suleymaniye-vakfi',
    label: 'Süleymaniye Vakfı Meali',
    shortLabel: 'Süleymaniye',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
    hasFootnotes: true,
  },
  {
    id: 'm16',
    slug: 'mehmet-okuyan',
    label: 'Mehmet Okuyan Meali',
    shortLabel: 'Mehmet Okuyan',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
    hasFootnotes: true,
  },
  {
    id: 'm17',
    slug: 'muhammed-esed',
    label: 'Muhammed Esed Meali',
    shortLabel: 'Muhammed Esed',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
    hasFootnotes: true,
  },
  {
    id: 'm18',
    slug: 'mustafa-islamoglu',
    label: 'Mustafa İslamoğlu Meali',
    shortLabel: 'M. İslamoğlu',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
    hasFootnotes: true,
  },
  {
    id: 'm19',
    slug: 'yasar-nuri-ozturk',
    label: 'Yaşar Nuri Öztürk Meali',
    shortLabel: 'Y. Nuri Öztürk',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm20',
    slug: 'saffet-bakirci',
    label: 'Saffet Bakırcı Meali (Kısa Meal)',
    shortLabel: 'Saffet Bakırcı',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm21',
    slug: 'ahmet-varol',
    label: 'Ahmet Varol Meali',
    shortLabel: 'Ahmet Varol',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm22',
    slug: 'abdullah-parliyan',
    label: 'Abdullah Parlıyan Meali',
    shortLabel: 'A. Parlıyan',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm23',
    slug: 'saban-piris',
    label: 'Şaban Piriş Meali',
    shortLabel: 'Şaban Piriş',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm24',
    slug: 'edip-yuksel',
    label: 'Edip Yüksel Meali',
    shortLabel: 'Edip Yüksel',
    category: 'cagdas',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },

  // ============================================================================
  // Arapça Tefsir & Evrensel Meal (3)
  // ============================================================================
  {
    id: 'm25',
    slug: 'ar-muyassar',
    label: "et-Tefsîru'l-Müyesser (Arapça Kolay Tefsir)",
    shortLabel: 'Müyesser (AR)',
    category: 'evrensel',
    lang: 'ar',
    dir: 'rtl',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm26',
    slug: 'ar-jalalayn',
    label: "Tefsîru'l-Celâleyn (Arapça Klasik Tefsir)",
    shortLabel: 'Celâleyn (AR)',
    category: 'evrensel',
    lang: 'ar',
    dir: 'rtl',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
  {
    id: 'm27',
    slug: 'en-sahih',
    label: 'Saheeh International (English Translation)',
    shortLabel: 'Saheeh Int. (EN)',
    category: 'evrensel',
    lang: 'en',
    dir: 'ltr',
    hasAudio: false,
    audioSource: null,
    storage: 'mx',
  },
] as const;

function inferShortLabel(id: string, label: string): string {
  if (id === 'm1') return 'TDV';
  if (id === 'm2') return 'DİB Yeni';
  const cleaned = label.replace(/\s*Meali\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 18) return cleaned;
  return cleaned.split(' ').slice(0, 2).join(' ');
}

function inferStorage(id: string, explicit?: MealStorageType): MealStorageType {
  if (explicit === 'm1' || explicit === 'm2' || explicit === 'mx') return explicit;
  if (id === 'm1') return 'm1';
  if (id === 'm2') return 'm2';
  return 'mx';
}

/**
 * Yerleşik meal & tefsir kataloğunu manifest.json -> meals içindeki verilerle birleştirir/günceller.
 */
export function getAllMeals(manifest: ManifestData | null): MealDefinition[] {
  const map = new Map<string, MealDefinition>();
  for (const item of MEALS_CATALOG) {
    map.set(item.id, { ...item });
  }

  if (manifest?.meals) {
    const audioSources = manifest.audioSources ?? {};
    for (const [key, info] of Object.entries(manifest.meals)) {
      if (!info) continue;
      const id = info.id || key;
      const existing = map.get(id);
      const rawAudioKey = info.audioSourceKey ?? info.audioSource ?? existing?.audioSource ?? null;
      const matchedAudio = rawAudioKey ? audioSources[rawAudioKey] : undefined;
      const computedHasAudio =
        info.hasAudio === false
          ? false
          : info.hasAudio === true
            ? Boolean(rawAudioKey)
            : Boolean(rawAudioKey && (matchedAudio?.baseUrl?.trim() || existing?.hasAudio));

      if (existing) {
        const resolvedLang = info.lang ?? existing.lang;
        const resolvedDir = info.dir ?? existing.dir ?? (resolvedLang === 'ar' ? 'rtl' : undefined);
        map.set(id, {
          ...existing,
          slug: info.slug || existing.slug,
          label: info.label?.trim() || existing.label,
          shortLabel: info.shortLabel?.trim() || existing.shortLabel,
          category: info.category ?? existing.category,
          lang: resolvedLang,
          dir: resolvedDir,
          hasAudio: computedHasAudio,
          audioSource: computedHasAudio ? rawAudioKey : null,
          storage: inferStorage(id, info.storage ?? existing.storage),
          hasFootnotes: info.hasFootnotes ?? existing.hasFootnotes,
        });
      } else {
        const label = info.label?.trim() || id.toUpperCase();
        const resolvedLang = info.lang;
        const resolvedDir = info.dir ?? (resolvedLang === 'ar' ? 'rtl' : undefined);
        map.set(id, {
          id,
          slug: info.slug || id,
          label,
          shortLabel: info.shortLabel?.trim() || inferShortLabel(id, label),
          category: info.category ?? 'cagdas',
          lang: resolvedLang,
          dir: resolvedDir,
          hasAudio: computedHasAudio,
          audioSource: computedHasAudio ? rawAudioKey : null,
          storage: inferStorage(id, info.storage),
          hasFootnotes: info.hasFootnotes,
        });
      }
    }
  }

  return Array.from(map.values());
}

export function findMealById(
  id: string | null | undefined,
  manifest: ManifestData | null,
): MealDefinition {
  const all = getAllMeals(manifest);
  if (id) {
    const found = all.find((m) => m.id === id);
    if (found) return found;
  }
  return all.find((m) => m.id === DEFAULT_PRIMARY_MEAL_ID) ?? all[0];
}

export function isExtraMealId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id !== 'm1' && id !== 'm2';
}

export function isRtlMeal(meal: Pick<MealDefinition, 'lang' | 'dir'> | null | undefined): boolean {
  if (!meal) return false;
  return meal.dir === 'rtl' || meal.lang === 'ar';
}

export function getMealLangBadge(
  meal: Pick<MealDefinition, 'lang' | 'dir'> | null | undefined,
): string | null {
  if (!meal) return null;
  if (meal.lang === 'ar' || meal.dir === 'rtl') return 'AR · Tefsir';
  if (meal.lang === 'en') return 'EN · Meal';
  return null;
}

export interface MealTextPresentation {
  isRtl: boolean;
  dir: 'rtl' | 'ltr';
  lang: 'ar' | 'en' | 'tr';
  className: string;
  fontSizePx: number;
  fontFamily?: string;
}

/**
 * Seçili meal/tefsir kaynağının diline ve yönüne göre tutarlı tipografi ve RTL özelliklerini döndürür.
 * - Arapça tefsirler (m25, m26): dir="rtl", lang="ar", text-right, leading-[2.0], Scheherazade New/Amiri, 1.25x punto
 * - İngilizce meal (m27): dir="ltr", lang="en", temiz Latin tipografisi
 * - Türkçe mealler (m1..m24): dir="ltr", lang="tr", mevcut .turkish-reading tipografisi
 */
export function getMealTextPresentation(
  meal: Pick<MealDefinition, 'lang' | 'dir'> | null | undefined,
  baseFontSize: number,
): MealTextPresentation {
  if (isRtlMeal(meal)) {
    return {
      isRtl: true,
      dir: 'rtl',
      lang: 'ar',
      className: 'text-right leading-[2.0] [unicode-bidi:isolate]',
      fontSizePx: Math.round(baseFontSize * 1.25),
      fontFamily: '"Scheherazade New", "Amiri", "Amiri Quran", serif',
    };
  }
  if (meal?.lang === 'en') {
    return {
      isRtl: false,
      dir: 'ltr',
      lang: 'en',
      className: 'turkish-reading text-left',
      fontSizePx: baseFontSize,
    };
  }
  return {
    isRtl: false,
    dir: 'ltr',
    lang: 'tr',
    className: 'turkish-reading',
    fontSizePx: baseFontSize,
  };
}

export interface SpokenMealInfo {
  sourceKey: string;
  mealId: string;
  label: string;
  shortTag: string;
  speakerName?: string;
}

/**
 * Sesli meal kaynağını (ör. 'tdv' -> 'm1', 'dib' -> 'm2' veya manifest.audioSources[key].mealId)
 * ilgili meal kimliği ve okunaklı etiketlerle çözümler.
 */
export function resolveSpokenMealInfo(
  sourceKey: string | null | undefined,
  manifest: ManifestData | null,
): SpokenMealInfo | null {
  if (!sourceKey) return null;
  const manifestSource = manifest?.audioSources?.[sourceKey];
  if (manifestSource && manifestSource.kind !== 'meal') return null;

  let mealId = manifestSource?.mealId ?? null;
  if (!mealId) {
    if (sourceKey === 'tdv') mealId = 'm1';
    else if (sourceKey === 'dib') mealId = 'm2';
    else {
      const matched = getAllMeals(manifest).find((m) => m.audioSource === sourceKey);
      mealId = matched?.id ?? null;
    }
  }
  if (!mealId) return null;

  const mealDef = findMealById(mealId, manifest);
  const label =
    mealId === 'm1'
      ? 'TDV Meali'
      : mealId === 'm2'
        ? 'DİB Yeni Meal'
        : mealDef.shortLabel;
  const shortTag = mealId === 'm1' ? 'TDV' : mealId === 'm2' ? 'DİB Yeni' : mealDef.shortLabel;

  let speakerName = manifestSource?.reciterName;
  if (!speakerName && manifestSource?.label) {
    const paren = manifestSource.label.match(/\(([^)]+)\)/);
    if (paren?.[1]) speakerName = paren[1].trim();
  }
  if (!speakerName) {
    if (sourceKey === 'tdv') speakerName = 'Seyfullah Kartal';
    else if (sourceKey === 'dib') speakerName = 'Mehmet Emin Ay';
  }

  return {
    sourceKey,
    mealId,
    label,
    shortTag,
    speakerName,
  };
}

/**
 * Ekranda gösterilen meal kutusunun o an seslendirilen meal kaynağıyla birebir eşleşip eşleşmediğini döndürür.
 */
export function isDisplayedMealMatchingAudio(params: {
  displayedMealId: string;
  activePhase: 'besmele' | 'ar' | 'meal' | null;
  activeSourceKey: string | null;
  manifest: ManifestData | null;
}): boolean {
  if (params.activePhase !== 'meal') return false;
  const spoken = resolveSpokenMealInfo(params.activeSourceKey, params.manifest);
  if (!spoken) return false;
  return spoken.mealId === params.displayedMealId;
}

export interface MealBesmelePresentation {
  text: string;
  dir: 'ltr' | 'rtl';
  isArabic: boolean;
}

/**
 * "Sadece Meal" modunda gösterilecek Besmele metnini ve yazı yönünü
 * seçili meal/tefsir kaynağına ve diline göre çözümler.
 */
export function resolveMealBesmelePresentation(
  meal: Pick<MealDefinition, 'id' | 'lang' | 'dir'>,
  besmele: BesmeleInfo,
): MealBesmelePresentation {
  if (meal.id === 'm1') {
    return { text: besmele.tdv, dir: 'ltr', isArabic: false };
  }
  if (meal.id === 'm2') {
    return { text: besmele.dib, dir: 'ltr', isArabic: false };
  }
  if (meal.lang === 'ar' || meal.dir === 'rtl') {
    return { text: besmele.ar, dir: 'rtl', isArabic: true };
  }
  if (meal.lang === 'en') {
    return {
      text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
      dir: 'ltr',
      isArabic: false,
    };
  }
  return {
    text: 'Rahmân ve Rahîm olan Allah’ın adıyla.',
    dir: 'ltr',
    isArabic: false,
  };
}
