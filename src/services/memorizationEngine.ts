import type {
  CustomIntensityConfig,
  IntensityProfile,
  MemorizationMethod,
  SessionStep,
  VisibilityMask,
} from '../types/memorization';
import { parseVerseKey } from '../types/memorization';
import type { CombinedVerse } from '../types/quran';

export interface ProfilePresetDefinition {
  id: Exclude<IntensityProfile, 'custom'>;
  label: string;
  tagline: string;
  config: CustomIntensityConfig;
}

export const INTENSITY_PROFILES: Record<
  Exclude<IntensityProfile, 'custom'>,
  ProfilePresetDefinition
> = {
  fast: {
    id: 'fast',
    label: 'Hızlı',
    tagline: 'Deneyimli · 3 yeni · 1 zincir · 2 blok',
    config: {
      newAyahReps: 3,
      chainReps: 1,
      blockRounds: 2,
      windowSize: 5,
    },
  },
  balanced: {
    id: 'balanced',
    label: 'Dengeli',
    tagline: 'Önerilen · 5 yeni · 2 zincir · 3 blok',
    config: {
      newAyahReps: 5,
      chainReps: 2,
      blockRounds: 3,
      windowSize: 5,
    },
  },
  deep: {
    id: 'deep',
    label: 'Sağlam',
    tagline: 'İlk Ezber · 8 yeni · 3 zincir · 5 blok',
    config: {
      newAyahReps: 8,
      chainReps: 3,
      blockRounds: 5,
      windowSize: 5,
    },
  },
};

export function resolveIntensityConfig(
  profile: IntensityProfile,
  customConfig?: Partial<CustomIntensityConfig>,
): CustomIntensityConfig {
  if (profile !== 'custom') {
    return { ...INTENSITY_PROFILES[profile].config };
  }
  const clamp = (v: number | undefined, min: number, max: number, fb: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.round(v)))
      : fb;

  return {
    newAyahReps: clamp(customConfig?.newAyahReps, 1, 30, 5),
    chainReps: clamp(customConfig?.chainReps, 1, 10, 2),
    blockRounds: clamp(customConfig?.blockRounds, 1, 10, 3),
    windowSize: clamp(customConfig?.windowSize, 3, 7, 5),
  };
}

function maskForEncodeRepeat(repIndex: number, totalReps: number): {
  label: string;
  mask: VisibilityMask;
} {
  if (totalReps <= 1) {
    return { label: 'Görerek Kodlama', mask: 'open' };
  }
  const openUntil = Math.ceil(totalReps / 2);
  if (repIndex <= openUntil) {
    return { label: 'Görerek Kodlama', mask: 'open' };
  }
  if (repIndex === totalReps && totalReps >= 3) {
    return { label: 'Ezberden Hatırlama', mask: 'hidden' };
  }
  return { label: 'Ezberden Hatırlama', mask: 'first_word' };
}

function maskForChainRepeat(repIndex: number, totalReps: number): VisibilityMask {
  if (totalReps <= 1) return 'first_word';
  if (repIndex === 1) return 'open';
  if (repIndex === totalReps && totalReps >= 3) return 'hidden';
  return 'first_word';
}

function formatShortAyahRange(keys: string[]): string {
  if (keys.length === 0) return '';
  const first = parseVerseKey(keys[0]);
  if (keys.length === 1) {
    return `${first.ayah}. Ayet`;
  }
  const last = parseVerseKey(keys[keys.length - 1]);
  if (first.surah === last.surah) {
    return `${first.ayah}–${last.ayah}`;
  }
  return `${first.surah}:${first.ayah}–${last.surah}:${last.ayah}`;
}

/**
 * Seçili birim ayetleri, yöntem ve yoğunluk profiline göre saf, öngörülebilir
 * `SessionStep[]` akışını üretir.
 */
export function generateSessionSteps(
  verseKeys: readonly string[],
  method: MemorizationMethod,
  profile: IntensityProfile,
  customConfig?: Partial<CustomIntensityConfig>,
): SessionStep[] {
  if (verseKeys.length === 0) return [];
  const cfg = resolveIntensityConfig(profile, customConfig);
  const steps: SessionStep[] = [];

  const pushStep = (partial: Omit<SessionStep, 'index'>) => {
    steps.push({
      ...partial,
      index: steps.length,
    });
  };

  if (method === 'single') {
    for (let i = 0; i < verseKeys.length; i += 1) {
      const key = verseKeys[i];
      const { ayah } = parseVerseKey(key);
      for (let rep = 1; rep <= cfg.newAyahReps; rep += 1) {
        const { label, mask } = maskForEncodeRepeat(rep, cfg.newAyahReps);
        pushStep({
          phase: 'encode',
          clusterIndex: 0,
          totalClusters: 1,
          verseKeys: [key],
          repeatIndex: rep,
          totalRepeats: cfg.newAyahReps,
          suggestedMask: mask,
          stepLabel: `${label} · ${ayah}. Ayet`,
          shortLabel: `Tekil · ${ayah}. Ayet · Tekrar ${rep}/${cfg.newAyahReps}`,
        });
      }
    }
    return steps;
  }

  if (method === 'block') {
    const allKeys = [...verseKeys];
    const rangeTxt = formatShortAyahRange(allKeys);
    for (let round = 1; round <= cfg.blockRounds; round += 1) {
      const mask: VisibilityMask =
        round === 1
          ? 'open'
          : round === cfg.blockRounds && cfg.blockRounds >= 3
            ? 'hidden'
            : 'first_word';
      pushStep({
        phase: 'block',
        clusterIndex: 0,
        totalClusters: 1,
        verseKeys: allKeys,
        repeatIndex: round,
        totalRepeats: cfg.blockRounds,
        suggestedMask: mask,
        stepLabel: `Toplu Blok Turu (${rangeTxt})`,
        shortLabel: `Blok · ${rangeTxt} · Tur ${round}/${cfg.blockRounds}`,
      });
    }
    return steps;
  }

  // Varsayılan ve ana yöntem: Pencere Sınırlı / Kümeli Kar Topu (snowball)
  const clusters: string[][] = [];
  for (let i = 0; i < verseKeys.length; i += cfg.windowSize) {
    clusters.push(verseKeys.slice(i, i + cfg.windowSize));
  }
  const totalClusters = clusters.length;

  clusters.forEach((chunk, clusterIdx) => {
    const clusterNo = clusterIdx + 1;
    const clusterPrefix = totalClusters > 1 ? `Küme ${clusterNo} · ` : '';

    for (let i = 0; i < chunk.length; i += 1) {
      const currentKey = chunk[i];
      const { ayah } = parseVerseKey(currentKey);

      // 1) Yeni ayet tekil kodlama ve hatırlama tekrarları
      for (let rep = 1; rep <= cfg.newAyahReps; rep += 1) {
        const { label, mask } = maskForEncodeRepeat(rep, cfg.newAyahReps);
        pushStep({
          phase: 'encode',
          clusterIndex: clusterIdx,
          totalClusters,
          verseKeys: [currentKey],
          repeatIndex: rep,
          totalRepeats: cfg.newAyahReps,
          suggestedMask: mask,
          stepLabel: `${label} · ${ayah}. Ayet`,
          shortLabel: `Kar Topu · ${clusterPrefix}${ayah}. Ayet · Tekrar ${rep}/${cfg.newAyahReps}`,
        });
      }

      // 2) Kümenin 2. ayetinden itibaren baştan bu ayete kadar kesintisiz zincir (1..k)
      if (i > 0) {
        const chainKeys = chunk.slice(0, i + 1);
        const chainRange = formatShortAyahRange(chainKeys);
        for (let cRep = 1; cRep <= cfg.chainReps; cRep += 1) {
          pushStep({
            phase: 'link',
            clusterIndex: clusterIdx,
            totalClusters,
            verseKeys: chainKeys,
            repeatIndex: cRep,
            totalRepeats: cfg.chainReps,
            suggestedMask: maskForChainRepeat(cRep, cfg.chainReps),
            stepLabel: `Zincir Bağlama (${chainRange})`,
            shortLabel: `Kar Topu · ${clusterPrefix}Zincir ${chainRange} · Tekrar ${cRep}/${cfg.chainReps}`,
          });
        }
      }
    }

    // 3) Küme sonu Kontrol Noktası (yalnızca birden fazla ayet içeren kümelerde veya çoklu kümede)
    if (chunk.length > 1 || totalClusters > 1) {
      const chunkRange = formatShortAyahRange(chunk);
      pushStep({
        phase: 'checkpoint',
        clusterIndex: clusterIdx,
        totalClusters,
        verseKeys: [...chunk],
        repeatIndex: 1,
        totalRepeats: 1,
        suggestedMask: 'first_word',
        stepLabel:
          totalClusters > 1
            ? `Küme ${clusterNo} Kontrol Noktası (${chunkRange})`
            : `Bölüm Kontrol Noktası (${chunkRange})`,
        shortLabel:
          totalClusters > 1
            ? `Kontrol · Küme ${clusterNo}/${totalClusters}`
            : `Kontrol Noktası · ${chunkRange}`,
      });
    }
  });

  // 4) Birden fazla küme bittiyse tüm birimi baştan sona birleştiren 1–2 final akıcılık turu
  if (totalClusters > 1) {
    const finalRounds = cfg.chainReps >= 2 ? 2 : 1;
    const allKeys = [...verseKeys];
    const allRange = formatShortAyahRange(allKeys);
    for (let fRep = 1; fRep <= finalRounds; fRep += 1) {
      pushStep({
        phase: 'final_flow',
        clusterIndex: totalClusters - 1,
        totalClusters,
        verseKeys: allKeys,
        repeatIndex: fRep,
        totalRepeats: finalRounds,
        suggestedMask: fRep === 1 ? 'first_word' : 'hidden',
        stepLabel: `Final Akıcılık Turu (${allRange})`,
        shortLabel: `Final Akıcılık · Tur ${fRep}/${finalRounds}`,
      });
    }
  }

  return steps;
}

/**
 * Bir kontrol noktasında "Zorlandım -> Bu Kümeyi Tekrarla" seçildiğinde
 * ilgili kümenin ilk adım indeksini bulur.
 */
export function findClusterStartIndex(
  steps: readonly SessionStep[],
  clusterIndex: number,
): number {
  const found = steps.findIndex(
    (s) => s.clusterIndex === clusterIndex && s.phase !== 'final_flow',
  );
  return found >= 0 ? found : 0;
}

/**
 * "İlk Kelime (Fetih)" maskesi için Arapça ayet metnini ilk kelime ve kalan kısım olarak böler.
 * Metin karakter kaybı olmadan ayrılır ki Mushaf satır mizanpajı ve satır yüksekliği korunur.
 */
export function splitFirstArabicWord(verse: CombinedVerse): {
  firstWord: string;
  restText: string;
} {
  const raw = (verse.ar.t ?? '').trim();
  if (!raw) return { firstWord: '', restText: '' };

  const firstSpaceIdx = raw.search(/\s+/);
  if (firstSpaceIdx === -1) {
    // Tek kelimelik ayet (örn. الم, يس, مدهامتان)
    return { firstWord: raw, restText: '' };
  }

  const firstToken = raw.slice(0, firstSpaceIdx);
  const restToken = raw.slice(firstSpaceIdx);
  return {
    firstWord: firstToken,
    restText: restToken,
  };
}

/**
 * Sıradaki ayetin Vasıl (geçiş) kancası için ilk 1–2 kelimesini döndürür.
 */
export function getVaslOpeningHint(verse: CombinedVerse | undefined | null): string {
  if (!verse) return '';
  const wordFromLexicon = verse.words?.[0]?.[0]?.trim();
  if (wordFromLexicon) {
    return wordFromLexicon;
  }
  const { firstWord } = splitFirstArabicWord(verse);
  return firstWord;
}
