import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Check,
  FileText,
  Hash,
  Layers,
  ListOrdered,
  Search,
  X,
} from 'lucide-react';
import { useRukusData } from '../../hooks/useStudyReferenceData';
import { useBackButtonGuard } from '../../services/backStackService';
import { sfxService } from '../../services/sfxService';
import type { MetaData, SurahMeta } from '../../types/quran';
import { formatSafeArabicTitle, formatSurahTitle } from '../../utils/arabicUtils';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import { shouldAutoFocusSearchInput } from '../../utils/deviceUtils';
import { normalizeTurkish } from '../../utils/poolUtils';

export type LocationPickerTab = 'surah' | 'page' | 'juz' | 'ruku' | 'ayah';

interface LocationPickerModalProps {
  isOpen: boolean;
  initialTab?: LocationPickerTab;
  meta: MetaData | null;
  currentSurahNo: number;
  currentPageNo: number;
  currentJuzNo: number;
  currentAyahNo: number;
  minPage: number;
  maxPage: number;
  onSelectSurah: (surahNo: number) => void;
  onSelectPage: (pageNo: number) => void;
  onSelectJuz: (juzNo: number) => void;
  onSelectRuku?: (surahNo: number, startAyah: number) => void;
  onSelectAyah: (ayahNo: number) => void;
  onClose: () => void;
}

const QUICK_PAGES = [1, 50, 100, 200, 300, 400, 500, 582, 604];

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  initialTab = 'surah',
  meta,
  currentSurahNo,
  currentPageNo,
  currentJuzNo,
  currentAyahNo,
  minPage,
  maxPage,
  onSelectSurah,
  onSelectPage,
  onSelectJuz,
  onSelectRuku,
  onSelectAyah,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<LocationPickerTab>(initialTab);
  const [surahQuery, setSurahQuery] = useState('');
  const [pageDraft, setPageDraft] = useState(String(currentPageNo));
  const [ayahDraft, setAyahDraft] = useState('');
  const [rukuScope, setRukuScope] = useState<'surah' | 'all'>('surah');
  const [rukuQuery, setRukuQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pageInputRef = useRef<HTMLInputElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  const { allRukus, getRukusForSurah, isLoading: isLoadingRukus } = useRukusData(
    isOpen && activeTab === 'ruku',
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setSurahQuery('');
    setPageDraft(String(currentPageNo));
    setAyahDraft('');
    setRukuQuery('');
  }, [isOpen, initialTab, currentPageNo]);

  useBackButtonGuard('location_picker_modal', isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    return acquireBodyScrollLock();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !shouldAutoFocusSearchInput()) return;
    const timer = window.setTimeout(() => {
      if (activeTab === 'surah') {
        searchInputRef.current?.focus();
      } else if (activeTab === 'page') {
        pageInputRef.current?.focus();
        pageInputRef.current?.select();
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, activeTab]);

  // Seçili aktif konum öğesini (Sure, Sayfa, Cüz, Rükû, Ayet) açılışta ve sekme değişiminde ortala
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'ruku' && isLoadingRukus) return;
    const rafId = window.requestAnimationFrame(() => {
      const container = listContainerRef.current;
      if (!container) return;
      const activeEl = container.querySelector<HTMLElement>('[data-active-location="true"]');
      if (!activeEl) return;
      try {
        activeEl.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      } catch {
        activeEl.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen, activeTab, rukuScope, isLoadingRukus]);

  const activeSurahMeta: SurahMeta | null = useMemo(() => {
    if (!meta) return null;
    return meta.surahs.find((s) => s.no === currentSurahNo) ?? meta.surahs[0] ?? null;
  }, [meta, currentSurahNo]);

  const filteredSurahs = useMemo(() => {
    if (!meta) return [];
    const q = normalizeTurkish(surahQuery.trim());
    if (!q) return meta.surahs;
    return meta.surahs.filter((s) => {
      const hay = normalizeTurkish(`${s.no} ${s.nameTr} ${s.shortNameTr} ${s.type}`);
      return hay.includes(q);
    });
  }, [meta, surahQuery]);

  const filteredAyahs = useMemo(() => {
    const count = activeSurahMeta?.ayahCount ?? 0;
    if (count === 0) return [];
    const q = ayahDraft.trim();
    const list = Array.from({ length: count }, (_, idx) => idx + 1);
    if (!q) return list;
    return list.filter((n) => String(n).includes(q));
  }, [activeSurahMeta?.ayahCount, ayahDraft]);

  const surahNameMap = useMemo(() => {
    const map = new Map<number, string>();
    if (meta) {
      for (const s of meta.surahs) {
        map.set(s.no, s.nameTr);
      }
    }
    return map;
  }, [meta]);

  const currentSurahRukus = useMemo(
    () => getRukusForSurah(currentSurahNo),
    [getRukusForSurah, currentSurahNo],
  );

  const filteredRukus = useMemo(() => {
    const base = rukuScope === 'surah' ? currentSurahRukus : allRukus;
    const q = normalizeTurkish(rukuQuery.trim());
    if (!q) return base;
    return base.filter((r) => {
      const sName = surahNameMap.get(r.surah) ?? '';
      const hay = normalizeTurkish(
        `${r.no} ${r.surahRuku} ${r.surah} ${sName} ${r.startAyah}-${r.endAyah}`,
      );
      return hay.includes(q);
    });
  }, [rukuScope, currentSurahRukus, allRukus, rukuQuery, surahNameMap]);

  if (!isOpen) return null;

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseInt(pageDraft, 10);
    if (Number.isNaN(parsed)) return;
    sfxService.play('click');
    onSelectPage(Math.max(minPage, Math.min(maxPage, parsed)));
    onClose();
  };

  const tabs: { id: LocationPickerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'surah', label: 'Sure', icon: BookMarked },
    { id: 'page', label: 'Sayfa', icon: FileText },
    { id: 'juz', label: 'Cüz', icon: Layers },
    { id: 'ruku', label: 'Rükû', icon: ListOrdered },
    { id: 'ayah', label: 'Ayet', icon: Hash },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hızlı Konum Seçici"
      className="fixed inset-0 z-[95] flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto md:max-w-2xl lg:max-w-3xl sm:max-h-[86dvh] rounded-none sm:rounded-2xl border-0 sm:border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Üst Başlık */}
        <div
          className="sticky top-0 z-10 px-4 pt-[max(0.625rem,env(safe-area-inset-top,0px))] pb-2.5 sm:py-3 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-soft)',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <BookOpen className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold tracking-tight truncate">
                Konuma Git
              </h2>
              <p className="text-[11px] font-semibold truncate tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {activeSurahMeta ? `${activeSurahMeta.no}. ${activeSurahMeta.shortNameTr}` : 'Kur\'an'} · S. {currentPageNo} · {currentJuzNo}. Cüz
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Konum seçiciyi kapat"
            title="Konum seçiciyi kapat"
            className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5 Sekme: Sure | Sayfa | Cüz | Rükû | Ayet */}
        <div
          className="px-3 sm:px-4 py-2.5 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="grid grid-cols-5 gap-1 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setActiveTab(tab.id);
                  }}
                  className="min-h-[36px] px-1 sm:px-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:block" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sekme İçerikleri */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
        >
          {activeTab === 'surah' && (
            <div className="space-y-2.5">
              <div className="relative">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={surahQuery}
                  onChange={(e) => setSurahQuery(e.target.value)}
                  placeholder="Sure adı veya numarası ara... (ör. Nûr, 24, Yâsîn)"
                  className="w-full min-h-[42px] pl-9 pr-8 rounded-xl border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/35"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                {surahQuery && (
                  <button
                    type="button"
                    onClick={() => setSurahQuery('')}
                    aria-label="Aramayı temizle"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredSurahs.length === 0 ? (
                  <p className="md:col-span-2 text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    Aramanızla eşleşen sure bulunamadı.
                  </p>
                ) : (
                  filteredSurahs.map((s) => {
                    const isCurrent = s.no === currentSurahNo;
                    return (
                      <button
                        key={s.no}
                        type="button"
                        data-active-location={isCurrent ? 'true' : undefined}
                        onClick={() => {
                          sfxService.play('click');
                          onSelectSurah(s.no);
                          onClose();
                        }}
                        className="w-full min-h-[46px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
                        style={{
                          backgroundColor: isCurrent
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: isCurrent ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold tabular-nums shrink-0"
                            style={{
                              backgroundColor: isCurrent
                                ? 'var(--brand-primary)'
                                : 'var(--bg-surface-soft)',
                              color: isCurrent ? '#FFFFFF' : 'var(--brand-primary-text)',
                            }}
                          >
                            {isCurrent ? <Check className="w-3.5 h-3.5" /> : s.no}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold truncate">{s.nameTr}</p>
                            <p
                              className="text-[11px] tabular-nums truncate"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {s.ayahCount} Ayet · S. {s.pageStart} · {s.type}
                            </p>
                          </div>
                        </div>

                        <span
                          className="arabic-title text-lg leading-none shrink-0"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {formatSafeArabicTitle(s.nameAr)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'page' && (
            <div className="space-y-4">
              <form onSubmit={handlePageSubmit} className="space-y-2.5">
                <label
                  htmlFor="loc-picker-page-input"
                  className="block text-xs font-bold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Mushaf Sayfa Numarası ({minPage}–{maxPage})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="loc-picker-page-input"
                    ref={pageInputRef}
                    type="number"
                    min={minPage}
                    max={maxPage}
                    value={pageDraft}
                    onChange={(e) => setPageDraft(e.target.value)}
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl border text-base font-extrabold tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/35"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-5 rounded-xl text-sm font-bold text-white cursor-pointer shrink-0"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Sayfaya Git
                  </button>
                </div>
              </form>

              {activeSurahMeta && (
                <div className="space-y-2">
                  <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                    {formatSurahTitle(activeSurahMeta.nameTr, activeSurahMeta.no)} Sayfaları ({activeSurahMeta.pageStart}–{activeSurahMeta.pageEnd})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(
                      {
                        length: Math.min(
                          24,
                          Math.max(1, activeSurahMeta.pageEnd - activeSurahMeta.pageStart + 1),
                        ),
                      },
                      (_, i) => activeSurahMeta.pageStart + i,
                    ).map((pNo) => {
                      const active = pNo === currentPageNo;
                      return (
                        <button
                          key={pNo}
                          type="button"
                          data-active-location={active ? 'true' : undefined}
                          onClick={() => {
                            sfxService.play('click');
                            onSelectPage(pNo);
                            onClose();
                          }}
                          className="min-h-[36px] min-w-[44px] px-2.5 rounded-xl border text-xs font-extrabold tabular-nums cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary)'
                              : 'var(--bg-surface-soft)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? '#FFFFFF' : 'var(--text-primary)',
                          }}
                        >
                          {pNo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  Hızlı Sayfa Atlama
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PAGES.filter((p) => p >= minPage && p <= maxPage).map((pNo) => (
                    <button
                      key={pNo}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onSelectPage(pNo);
                        onClose();
                      }}
                      className="min-h-[36px] px-3 rounded-xl border text-xs font-bold tabular-nums cursor-pointer"
                      style={{
                        backgroundColor:
                          pNo === currentPageNo
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                        borderColor:
                          pNo === currentPageNo ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        color:
                          pNo === currentPageNo
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-secondary)',
                      }}
                    >
                      Sayfa {pNo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'juz' && (
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
              {(meta?.juzs ?? Array.from({ length: 30 }, (_, i) => ({ no: i + 1 }))).map((j) => {
                const active = j.no === currentJuzNo;
                return (
                  <button
                    key={j.no}
                    type="button"
                    data-active-location={active ? 'true' : undefined}
                    onClick={() => {
                      onSelectJuz(j.no);
                      onClose();
                    }}
                    className="min-h-[46px] px-2 rounded-xl border text-xs font-extrabold tabular-nums flex flex-col items-center justify-center cursor-pointer transition-colors"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary)'
                        : 'var(--bg-surface-soft)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: active ? '#FFFFFF' : 'var(--text-primary)',
                    }}
                  >
                    <span>{j.no}. Cüz</span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'ruku' && (
            <div className="space-y-2.5">
              {/* Kapsam Seçici: Bu Sure / Tüm Kur'an (556) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="inline-flex items-center p-0.5 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setRukuScope('surah');
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: rukuScope === 'surah' ? 'var(--bg-surface)' : 'transparent',
                      color:
                        rukuScope === 'surah'
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-secondary)',
                      boxShadow: rukuScope === 'surah' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    Bu Sure ({currentSurahRukus.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setRukuScope('all');
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: rukuScope === 'all' ? 'var(--bg-surface)' : 'transparent',
                      color:
                        rukuScope === 'all'
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-secondary)',
                      boxShadow: rukuScope === 'all' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    Tüm Kur&apos;an ({allRukus.length || 556})
                  </button>
                </div>

                <span
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Konu Bölümleri (ع)
                </span>
              </div>

              <div className="relative">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  value={rukuQuery}
                  onChange={(e) => setRukuQuery(e.target.value)}
                  placeholder={
                    rukuScope === 'surah'
                      ? 'Rükû veya ayet aralığı ara...'
                      : 'Sure adı, rükû no (1–556) veya ayet ara...'
                  }
                  className="w-full min-h-[40px] pl-9 pr-8 rounded-xl border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/35"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                {rukuQuery && (
                  <button
                    type="button"
                    onClick={() => setRukuQuery('')}
                    aria-label="Rükû aramasını temizle"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isLoadingRukus ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  Rükû listesi yükleniyor...
                </p>
              ) : filteredRukus.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  Eşleşen rükû bölümü bulunamadı.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredRukus.map((r) => {
                    const sName = surahNameMap.get(r.surah) ?? `${r.surah}. Sure`;
                    const isCurrentRuku =
                      r.surah === currentSurahNo &&
                      currentAyahNo >= r.startAyah &&
                      currentAyahNo <= r.endAyah;
                    return (
                      <button
                        key={r.no}
                        type="button"
                        data-active-location={isCurrentRuku ? 'true' : undefined}
                        onClick={() => {
                          sfxService.play('click');
                          if (onSelectRuku) {
                            onSelectRuku(r.surah, r.startAyah);
                          } else {
                            onSelectSurah(r.surah);
                          }
                          onClose();
                        }}
                        className="w-full min-h-[46px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
                        style={{
                          backgroundColor: isCurrentRuku
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: isCurrentRuku
                            ? 'var(--brand-primary)'
                            : 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                            style={{
                              backgroundColor: isCurrentRuku
                                ? 'var(--brand-primary)'
                                : 'var(--bg-surface-soft)',
                              color: isCurrentRuku ? '#FFFFFF' : 'var(--brand-primary-text)',
                            }}
                          >
                            <span className="arabic-title leading-none">ع</span>
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-extrabold truncate">
                              {rukuScope === 'all' ? `${r.surah}. ${sName} · ` : ''}
                              {r.surahRuku}. Rükû
                            </p>
                            <p
                              className="text-[11px] tabular-nums truncate"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {r.startAyah === r.endAyah
                                ? `${r.startAyah}. Ayet`
                                : `${r.startAyah}–${r.endAyah}. Ayetler`}{' '}
                              · {r.ayahCount} Ayet
                            </p>
                          </div>
                        </div>

                        <span
                          className="px-2 py-0.5 rounded-lg text-[11px] font-extrabold tabular-nums shrink-0 border"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          #{r.no}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'ayah' && activeSurahMeta && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                  {activeSurahMeta.no}. {activeSurahMeta.nameTr} ({activeSurahMeta.ayahCount} Ayet)
                </p>
                {activeSurahMeta.ayahCount > 20 && (
                  <input
                    type="number"
                    min={1}
                    max={activeSurahMeta.ayahCount}
                    value={ayahDraft}
                    onChange={(e) => setAyahDraft(e.target.value)}
                    placeholder="Ayet no..."
                    className="w-24 min-h-[36px] px-2.5 rounded-lg border text-base sm:text-xs font-bold tabular-nums focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                )}
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-1.5">
                {filteredAyahs.map((ayahNo) => {
                  const active = ayahNo === currentAyahNo;
                  return (
                    <button
                      key={ayahNo}
                      type="button"
                      data-active-location={active ? 'true' : undefined}
                      onClick={() => {
                        onSelectAyah(ayahNo);
                        onClose();
                      }}
                      className="min-h-[40px] rounded-xl border text-xs font-extrabold tabular-nums cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active
                          ? 'var(--brand-primary)'
                          : 'var(--bg-surface-soft)',
                        borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        color: active ? '#FFFFFF' : 'var(--text-primary)',
                      }}
                    >
                      {ayahNo}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
