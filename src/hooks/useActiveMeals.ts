import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { findMealById, isExtraMealId } from '../config/mealsConfig';
import { dataService } from '../services/dataService';
import { useAppStore } from '../store/useAppStore';
import type { CombinedVerse, MealDefinition, MealVerse } from '../types/quran';

export interface ActiveMealsState {
  primaryMeal: MealDefinition;
  secondaryMeal: MealDefinition;
  isDual: boolean;
  isLoadingExtra: boolean;
  extraLoadError: boolean;
  getPrimaryVerse: (verse: CombinedVerse) => MealVerse | null;
  getSecondaryVerse: (verse: CombinedVerse) => MealVerse | null;
  resolveMealVerse: (verse: CombinedVerse, mealId: string) => MealVerse | null;
}

/**
 * Aktif 1. Ana Meal ve (çift meal açıksa) 2. Karşılaştırma Meali'ni 24 meal kataloğu üzerinden çözer.
 * Yalnızca ekranda görünen sureler (surahNos) için m3..m24 seçiliyse `mx/sXXX.json` dosyasını
 * tembel olarak yükler ve bellek önbelleğinde tutar.
 */
export function useActiveMeals(surahNos: readonly number[]): ActiveMealsState {
  const { settings, manifest } = useAppStore();
  const extraVersion = useSyncExternalStore(
    dataService.subscribeExtraMeals,
    dataService.getExtraMealsVersion,
  );

  const primaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const secondaryMeal = useMemo(
    () => findMealById(settings.secondaryMealId, manifest),
    [settings.secondaryMealId, manifest],
  );
  const isDual = settings.mealDisplayMode === 'dual' || settings.preferredMeal === 'both';

  const needsExtra =
    isExtraMealId(primaryMeal.id) || (isDual && isExtraMealId(secondaryMeal.id));

  const surahKey = useMemo(() => {
    const uniq = Array.from(
      new Set(surahNos.filter((n) => Number.isInteger(n) && n >= 1 && n <= 114)),
    ).sort((a, b) => a - b);
    return uniq.join(',');
  }, [surahNos]);

  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!needsExtra || !surahKey) {
      setLoadingKey(null);
      setErrorKey(null);
      return;
    }

    const targets = surahKey
      .split(',')
      .map((s) => Number(s))
      .filter((s) => Number.isInteger(s) && s >= 1 && s <= 114);

    const missing = targets.filter((s) => !dataService.hasExtraMealsLoaded(s));
    if (missing.length === 0) {
      setLoadingKey(null);
      setErrorKey(null);
      return;
    }

    let cancelled = false;
    setLoadingKey(surahKey);
    setErrorKey(null);

    Promise.allSettled(missing.map((s) => dataService.loadExtraMealsForSurah(s))).then((results) => {
      if (cancelled) return;
      const hadError = results.some((r) => r.status === 'rejected');
      setLoadingKey(null);
      setErrorKey(hadError ? surahKey : null);
    });

    return () => {
      cancelled = true;
    };
  }, [needsExtra, surahKey, extraVersion]);

  const resolveMealVerse = useCallback(
    (verse: CombinedVerse, mealId: string): MealVerse | null => {
      // extraVersion bağımlılığı, mx/sXXX.json yüklendiğinde callback referansını tazeler
      void extraVersion;
      return dataService.getMealVerse(verse.surah, verse.ayah, mealId, verse);
    },
    [extraVersion],
  );

  const getPrimaryVerse = useCallback(
    (verse: CombinedVerse): MealVerse | null => resolveMealVerse(verse, primaryMeal.id),
    [resolveMealVerse, primaryMeal.id],
  );

  const getSecondaryVerse = useCallback(
    (verse: CombinedVerse): MealVerse | null => resolveMealVerse(verse, secondaryMeal.id),
    [resolveMealVerse, secondaryMeal.id],
  );

  const isLoadingExtra = needsExtra && loadingKey === surahKey && surahKey.length > 0;
  const extraLoadError = needsExtra && errorKey === surahKey && surahKey.length > 0;

  return {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    extraLoadError,
    getPrimaryVerse,
    getSecondaryVerse,
    resolveMealVerse,
  };
}
