import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Columns2,
  FileText,
  Search,
  Sparkles,
  Star,
  Volume2,
  X,
} from 'lucide-react';
import {
  findMealById,
  getAllMeals,
  getMealLangBadge,
} from '../config/mealsConfig';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { MealCategory, MealDefinition } from '../types/quran';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { normalizeTurkish } from '../utils/textNormalize';

type MealFilterTab = 'all' | 'favorites' | 'audio' | MealCategory;

function foldSearchText(value: string): string {
  return normalizeTurkish(value)
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

export const MealSelectorModal: React.FC = () => {
  const {
    isMealSelectorOpen,
    mealSelectorTarget,
    closeMealSelector,
    settings,
    setPrimaryMeal,
    setSecondaryMeal,
    setMealDisplayMode,
    toggleFavoriteMeal,
    manifest,
  } = useAppStore();

  const [activeSlot, setActiveSlot] = useState<'primary' | 'secondary'>(mealSelectorTarget);
  const [activeTab, setActiveTab] = useState<MealFilterTab>('all');
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isMealSelectorOpen) {
      setActiveSlot(mealSelectorTarget);
      setQuery('');
    }
  }, [isMealSelectorOpen, mealSelectorTarget]);

  useBackButtonGuard('meal_selector_modal', isMealSelectorOpen, closeMealSelector);

  useEffect(() => {
    if (!isMealSelectorOpen) return;
    return acquireBodyScrollLock();
  }, [isMealSelectorOpen]);

  const allMeals = useMemo(() => getAllMeals(manifest), [manifest]);
  const primaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const secondaryMeal = useMemo(
    () => findMealById(settings.secondaryMealId, manifest),
    [settings.secondaryMealId, manifest],
  );
  const isDual = settings.mealDisplayMode === 'dual' || settings.preferredMeal === 'both';

  const favoriteSet = useMemo(
    () => new Set(settings.favoriteMealIds ?? []),
    [settings.favoriteMealIds],
  );

  const counts = useMemo(() => {
    let resmi = 0;
    let klasik = 0;
    let cagdas = 0;
    let evrensel = 0;
    let audio = 0;
    let favorites = 0;
    for (const m of allMeals) {
      if (m.category === 'resmi') resmi += 1;
      else if (m.category === 'klasik') klasik += 1;
      else if (m.category === 'evrensel') evrensel += 1;
      else cagdas += 1;
      if (m.hasAudio) audio += 1;
      if (favoriteSet.has(m.id)) favorites += 1;
    }
    return { total: allMeals.length, resmi, klasik, cagdas, evrensel, audio, favorites };
  }, [allMeals, favoriteSet]);

  const filteredMeals = useMemo(() => {
    const q = foldSearchText(query);
    const list = allMeals.filter((meal) => {
      if (activeTab === 'favorites' && !favoriteSet.has(meal.id)) return false;
      if (activeTab === 'audio' && !meal.hasAudio) return false;
      if (
        (activeTab === 'resmi' ||
          activeTab === 'klasik' ||
          activeTab === 'cagdas' ||
          activeTab === 'evrensel') &&
        meal.category !== activeTab
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = foldSearchText(
        `${meal.label} ${meal.shortLabel} ${meal.slug} ${meal.id} ${meal.lang ?? ''}`,
      );
      return haystack.includes(q);
    });

    if (activeTab === 'all' && !q) {
      return [...list].sort((a, b) => {
        const aFav = favoriteSet.has(a.id) ? 0 : 1;
        const bFav = favoriteSet.has(b.id) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return 0;
      });
    }
    return list;
  }, [allMeals, activeTab, favoriteSet, query]);

  if (!isMealSelectorOpen) return null;

  const selectedIdForSlot = activeSlot === 'primary' ? primaryMeal.id : secondaryMeal.id;

  const handleSelectMeal = (meal: MealDefinition) => {
    if (activeSlot === 'primary') {
      setPrimaryMeal(meal.id);
      if (!isDual) {
        closeMealSelector();
      }
    } else {
      if (!isDual) {
        setMealDisplayMode('dual');
      }
      setSecondaryMeal(meal.id);
      closeMealSelector();
    }
  };

  const categoryLabelMap: Record<MealCategory, string> = {
    resmi: 'Resmî',
    klasik: 'Klasik',
    cagdas: 'Çağdaş',
    evrensel: 'Arapça & Evrensel',
  };

  const filterTabs: { id: MealFilterTab; label: string }[] = [
    { id: 'all', label: `Tümü (${counts.total})` },
    { id: 'favorites', label: `⭐ Favoriler (${counts.favorites})` },
    { id: 'audio', label: `🔊 Sesli (${counts.audio})` },
    { id: 'resmi', label: `Resmî (${counts.resmi})` },
    { id: 'klasik', label: `Klasik (${counts.klasik})` },
    { id: 'cagdas', label: `Çağdaş (${counts.cagdas})` },
    { id: 'evrensel', label: `Arapça & Evrensel (${counts.evrensel})` },
  ];

  return (
    <div
      className="fixed inset-0 z-[95] flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Meal ve Tefsir Seçici"
      onClick={closeMealSelector}
    >
      <div
        className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto md:max-w-3xl lg:max-w-4xl sm:max-h-[88dvh] rounded-none sm:rounded-2xl border-0 sm:border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık */}
        <div
          className="sticky top-0 z-10 px-4 pt-[max(0.625rem,env(safe-area-inset-top,0px))] pb-2.5 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2.5 shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-soft)',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-extrabold tracking-tight truncate">
                Meal &amp; Tefsir Seçici ({counts.total} Eser)
              </h2>
              <p className="hidden sm:block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {isDual
                  ? `Çift Meal: ${primaryMeal.shortLabel} + ${secondaryMeal.shortLabel}`
                  : `Aktif Meal: ${primaryMeal.label}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeMealSelector}
            aria-label="Meal seçiciyi kapat"
            title="Meal seçiciyi kapat"
            className="w-9 h-9 sm:min-w-[40px] sm:min-h-[40px] rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Tek / Çift Meal + Arama Satırı ve Kategori Filtreleri */}
        <div
          className="px-4 sm:px-5 py-2.5 sm:py-3 border-b space-y-2.5 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Masaüstünde Tek/Çift Meal Anahtarı + Arama Kutusu Aynı Yatay Satırda */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
            {/* Tek / Çift Meal Anahtarı */}
            <div
              className="inline-flex items-center p-0.5 rounded-xl border shrink-0 self-start sm:self-auto"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMealDisplayMode('single');
                  setActiveSlot('primary');
                }}
                className="min-h-[36px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: !isDual ? 'var(--bg-surface)' : 'transparent',
                  color: !isDual ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                  boxShadow: !isDual ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Tek Meal</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMealDisplayMode('dual');
                }}
                className="min-h-[36px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: isDual ? 'var(--bg-surface)' : 'transparent',
                  color: isDual ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                  boxShadow: isDual ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
                <span>Çift Meal (Karşılaştırmalı)</span>
              </button>
            </div>

            {/* Arama Kutusu */}
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Meal, tefsir veya müellif ara... (Elmalılı, Müyesser, Celâleyn, Saheeh)"
                className="w-full min-h-[40px] pl-10 pr-9 rounded-xl border text-base sm:text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Aramayı temizle"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {isDual && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setActiveSlot('primary');
                }}
                className="min-h-[42px] px-3 py-1.5 rounded-xl border text-left transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    activeSlot === 'primary'
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                  borderColor:
                    activeSlot === 'primary' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                }}
              >
                <span
                  className="block text-[10px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  1. Ana Meal
                </span>
                <span className="block text-xs font-bold truncate mt-0.5">
                  {primaryMeal.shortLabel}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setActiveSlot('secondary');
                }}
                className="min-h-[42px] px-3 py-1.5 rounded-xl border text-left transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    activeSlot === 'secondary'
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface-soft)',
                  borderColor:
                    activeSlot === 'secondary' ? 'var(--brand-accent)' : 'var(--border-subtle)',
                }}
              >
                <span
                  className="block text-[10px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--brand-accent-text)' }}
                >
                  2. Karşılaştırma Meali
                </span>
                <span className="block text-xs font-bold truncate mt-0.5">
                  {secondaryMeal.shortLabel}
                </span>
              </button>
            </div>
          )}

          {/* Kategori Çipleri — Masaüstünde kesilmesiz tam wrap, mobilde taşmasız yatay kaydırma */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 pr-4 no-scrollbar md:mx-0 md:px-0 md:pr-0 md:pb-0 md:flex-wrap md:overflow-visible">
            {filterTabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setActiveTab(tab.id);
                  }}
                  className="min-h-[34px] px-3 rounded-xl border text-xs font-bold whitespace-nowrap cursor-pointer transition-colors shrink-0"
                  style={{
                    backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Meal Listesi — Masaüstünde 2 sütunlu ferah eser ızgarası */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3">
          {filteredMeals.length === 0 ? (
            <div
              className="rounded-2xl border p-8 text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-sm font-bold">Aramanızla eşleşen meal bulunamadı.</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Farklı bir müellif adı yazın veya kategori filtresini temizleyin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 content-start">
              {filteredMeals.map((meal) => {
                const isSelected = meal.id === selectedIdForSlot;
                const isPrimaryAssigned = meal.id === primaryMeal.id;
                const isSecondaryAssigned = isDual && meal.id === secondaryMeal.id;
                const isAnyAssigned = isSelected || isPrimaryAssigned || isSecondaryAssigned;
                const isFav = favoriteSet.has(meal.id);

                return (
                  <div
                    key={meal.id}
                    className="rounded-2xl border transition-all flex items-center gap-2 p-2 sm:p-2.5"
                    style={{
                      backgroundColor: isSelected
                        ? activeSlot === 'primary'
                          ? 'var(--brand-primary-soft)'
                          : 'var(--brand-accent-soft)'
                        : isDual && (isPrimaryAssigned || isSecondaryAssigned)
                          ? 'var(--bg-surface-soft)'
                          : 'var(--bg-surface)',
                      borderColor: isSelected
                        ? activeSlot === 'primary'
                          ? 'var(--brand-primary)'
                          : 'var(--brand-accent)'
                        : isDual && isPrimaryAssigned
                          ? 'rgba(15, 118, 110, 0.35)'
                          : isDual && isSecondaryAssigned
                            ? 'rgba(217, 119, 6, 0.35)'
                            : 'var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectMeal(meal)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 text-left cursor-pointer min-h-[44px] px-1"
                    >
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: isSelected
                            ? activeSlot === 'primary'
                              ? 'var(--brand-primary)'
                              : 'var(--brand-accent)'
                            : isAnyAssigned
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface-soft)',
                          borderColor: isSelected ? 'transparent' : 'var(--border-subtle)',
                          color: isSelected
                            ? '#FFFFFF'
                            : isAnyAssigned
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {isAnyAssigned ? (
                          <Check className="w-4 h-4 stroke-[2.5]" />
                        ) : (
                          <BookOpen className="w-4 h-4" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-extrabold truncate">{meal.label}</span>
                          {isDual && isPrimaryAssigned && (
                            <span
                              className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                              style={{
                                backgroundColor: 'var(--brand-primary)',
                                color: '#FFFFFF',
                              }}
                            >
                              1. Meal
                            </span>
                          )}
                          {isDual && isSecondaryAssigned && (
                            <span
                              className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                              style={{
                                backgroundColor: 'var(--brand-accent)',
                                color: '#FFFFFF',
                              }}
                            >
                              2. Meal
                            </span>
                          )}
                        </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {categoryLabelMap[meal.category]}
                        </span>

                        {(() => {
                          const langBadge = getMealLangBadge(meal);
                          if (!langBadge) return null;
                          return (
                            <span
                              className="inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border"
                              style={{
                                backgroundColor:
                                  meal.lang === 'ar'
                                    ? 'var(--brand-accent-soft)'
                                    : 'var(--brand-primary-soft)',
                                borderColor:
                                  meal.lang === 'ar'
                                    ? 'rgba(217, 119, 6, 0.35)'
                                    : 'rgba(15, 118, 110, 0.3)',
                                color:
                                  meal.lang === 'ar'
                                    ? 'var(--brand-accent-text)'
                                    : 'var(--brand-primary-text)',
                              }}
                            >
                              {langBadge}
                            </span>
                          );
                        })()}

                        {meal.hasAudio ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md"
                            style={{
                              backgroundColor: 'var(--brand-primary-soft)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>Sesli</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>Metin</span>
                          </span>
                        )}

                        {meal.hasFootnotes && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            <FileText className="w-3 h-3" />
                            <span>Dipnotlu</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavoriteMeal(meal.id)}
                    aria-label={isFav ? `${meal.shortLabel} favorilerden çıkar` : `${meal.shortLabel} favorilere ekle`}
                    title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                    className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    style={{
                      backgroundColor: isFav ? 'var(--brand-accent-soft)' : 'transparent',
                      color: isFav ? 'var(--brand-accent-text)' : 'var(--text-muted)',
                    }}
                  >
                    <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                  </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alt Bilgi Çubuğu */}
        <div
          className="px-4 sm:px-5 py-2.5 border-t flex items-center justify-between gap-2 text-[11px] shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-soft)',
            color: 'var(--text-muted)',
          }}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Sparkles
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: 'var(--brand-primary-text)' }}
            />
            <span className="truncate">
              Seslendirmesiz meallerde Arapça tilavet ve TDV/DİB sesli meal kesintisiz devam eder.
            </span>
          </span>
          {isDual && (
            <button
              type="button"
              onClick={closeMealSelector}
              className="min-h-[34px] px-3 rounded-lg text-xs font-bold text-white shrink-0 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Tamam
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
