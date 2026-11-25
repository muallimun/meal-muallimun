import { useCallback, useEffect, useMemo, useState } from 'react';
import { dataService } from '../services/dataService';
import type { TajweedMetaFile, TajweedRuleDef, TajweedWord } from '../types/tajweed';
import {
  STANDALONE_WAQF_OR_MARKER_RE,
  STANDALONE_WAQF_SIGN_RE,
} from '../utils/wordSyncUtils';

const EMPTY_RULES: Record<string, TajweedRuleDef> = {};

// Modül düzeyi senkron bellek önbelleği (sure geçişlerinde sıfır titreme)
let cachedMeta: TajweedMetaFile | null = null;
const cachedSurahMaps = new Map<number, Map<number, TajweedWord[]>>();

function getTajweedWordText(word: TajweedWord): string {
  let out = '';
  for (let i = 0; i < word.length; i += 1) {
    const seg = word[i];
    out += typeof seg === 'string' ? seg : seg[0];
  }
  return out.trim();
}

/**
 * Tek başına duran vakıf/secâvend/hizb/secde işaretlerini ayrı kelime olarak bırakmak
 * çift boşluğa ve karaoke indeks kaymasına yol açar; bunları bitişik kelimeye birleştirir.
 */
function normalizeTajweedWords(words: TajweedWord[]): TajweedWord[] {
  if (!Array.isArray(words) || words.length === 0) return words;

  const normalized: TajweedWord[] = [];
  let pendingPrefix: TajweedWord | null = null;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!Array.isArray(word) || word.length === 0) continue;

    const text = getTajweedWordText(word);
    if (text && STANDALONE_WAQF_OR_MARKER_RE.test(text)) {
      if (normalized.length > 0) {
        const prev = normalized[normalized.length - 1];
        normalized[normalized.length - 1] = STANDALONE_WAQF_SIGN_RE.test(text)
          ? [...prev, ...word]
          : [...prev, ' ', ...word];
      } else {
        pendingPrefix = pendingPrefix ? [...pendingPrefix, ' ', ...word] : [...word];
      }
    } else if (pendingPrefix) {
      normalized.push([...pendingPrefix, ' ', ...word]);
      pendingPrefix = null;
    } else {
      normalized.push(word);
    }
  }

  if (pendingPrefix) {
    if (normalized.length > 0) {
      const prev = normalized[normalized.length - 1];
      const prefixText = getTajweedWordText(pendingPrefix);
      normalized[normalized.length - 1] = STANDALONE_WAQF_SIGN_RE.test(prefixText)
        ? [...prev, ...pendingPrefix]
        : [...prev, ' ', ...pendingPrefix];
    } else {
      normalized.push(pendingPrefix);
    }
  }

  return normalized;
}

export interface UseTajweedDataResult {
  meta: TajweedMetaFile | null;
  rules: Record<string, TajweedRuleDef>;
  besmele: TajweedWord[] | null;
  isLoading: boolean;
  getVerseWords: (surahNo: number, ayahNo: number) => TajweedWord[] | null;
}

/**
 * Yalnızca `enabled === true` iken `tj/meta.json` ve ekranda görünen surelerin
 * `tj/sXXX.json` dosyalarını tembel (lazy) ve paralel olarak yükler.
 * `enabled === false` iken HİÇBİR ağ isteği göndermez.
 */
export function useTajweedData(
  surahNos: readonly number[],
  enabled: boolean,
): UseTajweedDataResult {
  const surahKey = useMemo(() => {
    const unique = Array.from(
      new Set(surahNos.filter((n) => Number.isInteger(n) && n >= 1 && n <= 114)),
    ).sort((a, b) => a - b);
    return unique.join(',');
  }, [surahNos]);

  const uniqueSurahNos = useMemo(
    () => (surahKey ? surahKey.split(',').map((s) => Number(s)) : []),
    [surahKey],
  );

  const [meta, setMeta] = useState<TajweedMetaFile | null>(() => (enabled ? cachedMeta : null));
  const [cacheVersion, setCacheVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const missingSurahs = uniqueSurahNos.filter((sNo) => !cachedSurahMaps.has(sNo));
    const needMeta = !cachedMeta;

    if (!needMeta && missingSurahs.length === 0) {
      setMeta(cachedMeta);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const tasks: Promise<void>[] = [];

    if (needMeta) {
      tasks.push(
        dataService
          .getTajweedMeta()
          .then((loadedMeta) => {
            if (loadedMeta && typeof loadedMeta === 'object' && loadedMeta.rules) {
              const normalizedMeta: TajweedMetaFile =
                Array.isArray(loadedMeta.besmele) && loadedMeta.besmele.length > 0
                  ? { ...loadedMeta, besmele: normalizeTajweedWords(loadedMeta.besmele) }
                  : loadedMeta;
              cachedMeta = normalizedMeta;
              if (!cancelled) setMeta(normalizedMeta);
            }
          })
          .catch(() => {
            // Hata durumunda normal Arapça metin akışı kesintisiz devam eder
          }),
      );
    } else if (cachedMeta) {
      setMeta(cachedMeta);
    }

    for (const sNo of missingSurahs) {
      tasks.push(
        dataService
          .getTajweedSurah(sNo)
          .then((file) => {
            if (!file || !Array.isArray(file.verses)) return;
            const ayahMap = new Map<number, TajweedWord[]>();
            for (const v of file.verses) {
              if (typeof v?.a === 'number' && Array.isArray(v.w)) {
                ayahMap.set(v.a, normalizeTajweedWords(v.w));
              }
            }
            cachedSurahMaps.set(sNo, ayahMap);
          })
          .catch(() => {
            // Hata durumunda sessizce mevcut normal Arapça metne düşülür
          }),
      );
    }

    void Promise.all(tasks).finally(() => {
      if (!cancelled) {
        setCacheVersion((v) => v + 1);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, uniqueSurahNos]);

  const getVerseWords = useCallback(
    (surahNo: number, ayahNo: number): TajweedWord[] | null => {
      if (!enabled) return null;
      // cacheVersion bağımlılığı yeni sure verisi geldiğinde bileşenlerin güncellenmesini sağlar
      void cacheVersion;
      return cachedSurahMaps.get(surahNo)?.get(ayahNo) ?? null;
    },
    [enabled, cacheVersion],
  );

  if (!enabled) {
    return {
      meta: null,
      rules: EMPTY_RULES,
      besmele: null,
      isLoading: false,
      getVerseWords,
    };
  }

  return {
    meta,
    rules: meta?.rules ?? EMPTY_RULES,
    besmele: meta?.besmele && meta.besmele.length > 0 ? meta.besmele : null,
    isLoading,
    getVerseWords,
  };
}
