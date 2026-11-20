import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Check,
  Filter,
  Grid2x2,
  Layers,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { StudyPreset } from '../types/quran';
import {
  buildJuzQuestionCountMap,
  buildSurahQuestionCountMap,
  computePoolStats,
  formatNumberTr,
  getSurahMap,
  normalizeTurkish,
} from '../utils/poolUtils';

type PoolTab = 'presets' | 'surahs' | 'juzs';

export const PoolSelectorModal: React.FC = () => {
  const {
    isPoolModalOpen,
    closePoolModal,
    studyPool,
    setStudyPool,
    meta,
    questionIndex,
  } = useAppStore();

  const [activeSubTab, setActiveSubTab] = useState<PoolTab>('presets');
  const [draftSurahs, setDraftSurahs] = useState<number[]>(studyPool.selectedSurahs);
  const [draftJuzs, setDraftJuzs] = useState<number[]>(studyPool.selectedJuzs);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithQuestions, setOnlyWithQuestions] = useState(false);

  // Modal her açıldığında mevcut havuzu taslağa kopyala
  useEffect(() => {
    if (isPoolModalOpen) {
      setDraftSurahs(studyPool.selectedSurahs);
      setDraftJuzs(studyPool.selectedJuzs);
      setSearchQuery('');
    }
  }, [isPoolModalOpen, studyPool.selectedSurahs, studyPool.selectedJuzs]);

  // Escape ile kapatma ve arka plan kaydırma kilidi
  useEffect(() => {
    if (!isPoolModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePoolModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPoolModalOpen, closePoolModal]);

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const surahQCounts = useMemo(
    () => buildSurahQuestionCountMap(questionIndex),
    [questionIndex],
  );
  const juzQCounts = useMemo(
    () => buildJuzQuestionCountMap(questionIndex),
    [questionIndex],
  );

  const draftStats = useMemo(
    () =>
      computePoolStats(
        { selectedSurahs: draftSurahs, selectedJuzs: draftJuzs },
        meta,
        questionIndex,
      ),
    [draftSurahs, draftJuzs, meta, questionIndex],
  );

  const filteredSurahs = useMemo(() => {
    if (!meta) return [];
    const normalizedQuery = normalizeTurkish(searchQuery);

    return meta.surahs.filter((s) => {
      const qCount = surahQCounts.get(s.no) ?? s.questionCount;
      if (onlyWithQuestions && qCount <= 0) return false;
      if (!normalizedQuery) return true;

      const haystack = normalizeTurkish(
        `${s.no} ${s.nameTr} ${s.shortNameTr} ${s.type}`,
      );
      return (
        haystack.includes(normalizedQuery) ||
        s.nameAr.includes(searchQuery.trim())
      );
    });
  }, [meta, searchQuery, onlyWithQuestions, surahQCounts]);

  if (!isPoolModalOpen) return null;

  const isPresetActive = (preset: StudyPreset): boolean => {
    const pSurahs = [...(preset.surahs ?? [])].sort((a, b) => a - b);
    const pJuzs = [...(preset.juzs ?? [])].sort((a, b) => a - b);
    const curS = [...draftSurahs].sort((a, b) => a - b);
    const curJ = [...draftJuzs].sort((a, b) => a - b);
    return (
      pSurahs.length === curS.length &&
      pJuzs.length === curJ.length &&
      pSurahs.every((val, i) => val === curS[i]) &&
      pJuzs.every((val, i) => val === curJ[i])
    );
  };

  const handleApplyPreset = (preset: StudyPreset) => {
    sfxService.play('click');
    setDraftSurahs(preset.surahs ? [...preset.surahs] : []);
    setDraftJuzs(preset.juzs ? [...preset.juzs] : []);
  };

  const handleToggleSurah = (surahNo: number) => {
    sfxService.play('click');
    setDraftSurahs((prev) =>
      prev.includes(surahNo) ? prev.filter((n) => n !== surahNo) : [...prev, surahNo],
    );
  };

  const handleToggleJuz = (juzNo: number) => {
    sfxService.play('click');
    setDraftJuzs((prev) =>
      prev.includes(juzNo) ? prev.filter((n) => n !== juzNo) : [...prev, juzNo],
    );
  };

  const handleSelectFilteredSurahs = () => {
    sfxService.play('click');
    const merged = new Set(draftSurahs);
    for (const s of filteredSurahs) {
      merged.add(s.no);
    }
    setDraftSurahs(Array.from(merged));
  };

  const handleClearAll = () => {
    sfxService.play('click');
    setDraftSurahs([]);
    setDraftJuzs([]);
  };

  const handleSave = () => {
    if (draftStats.surahCount === 0) return;
    sfxService.play('success');
    setStudyPool({
      selectedSurahs: draftSurahs,
      selectedJuzs: draftJuzs,
    });
    closePoolModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pool-modal-title"
    >
      {/* Arka Plan Karartma */}
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={closePoolModal}
        aria-hidden="true"
      />

      {/* Modal Gövdesi */}
      <div
        className="relative z-10 w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[86dvh] rounded-t-3xl sm:rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Mobil Tutamaç */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div
            className="w-10 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--border-strong)' }}
          />
        </div>

        {/* Üst Başlık */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="pool-modal-title" className="text-lg font-extrabold tracking-tight truncate">
                Çalışma Havuzu Seçici
              </h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Hazır paketlerden, surelerden veya cüzlerden çalışma kapsamınızı belirleyin.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closePoolModal}
            aria-label="Pencereyi kapat"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Sekmeli Geçiş Çubuğu */}
        <div
          className="px-5 pt-3 pb-3 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="grid grid-cols-3 gap-1 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            {(
              [
                { id: 'presets', label: 'Hazır Paketler', icon: Sparkles },
                { id: 'surahs', label: 'Sure Seçimi', icon: BookMarked },
                { id: 'juzs', label: 'Cüz Seçimi', icon: Grid2x2 },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setActiveSubTab(tab.id);
                  }}
                  className="min-h-[42px] px-2.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-surface)' : 'transparent',
                    color: isActive ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0 hidden sm:inline" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Kaydırılabilir İçerik Gövdesi */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* SEKME 1: HAZIR PAKETLER */}
          {activeSubTab === 'presets' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(meta?.presets ?? []).map((preset) => {
                const active = isPresetActive(preset);
                const stats = computePoolStats(
                  {
                    selectedSurahs: preset.surahs ?? [],
                    selectedJuzs: preset.juzs ?? [],
                  },
                  meta,
                  questionIndex,
                );

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between min-h-[104px] focus-visible:outline-2 focus-visible:outline-teal-600"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm sm:text-base font-extrabold leading-snug">
                        {preset.label}
                      </span>
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: active ? 'var(--brand-primary)' : 'transparent',
                          borderColor: active
                            ? 'var(--brand-primary)'
                            : 'var(--border-strong)',
                          color: '#FFFFFF',
                        }}
                      >
                        {active && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </div>

                    <p
                      className="text-xs font-medium tabular-nums"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatNumberTr(stats.surahCount)} Sure ·{' '}
                      {formatNumberTr(stats.ayahCount)} Ayet ·{' '}
                      <span
                        className="font-bold"
                        style={{
                          color:
                            stats.questionCount > 0
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {formatNumberTr(stats.questionCount)} Hazır Soru
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* SEKME 2: SURE SEÇİMİ */}
          {activeSubTab === 'surahs' && (
            <div className="space-y-4">
              {/* Arama ve Filtre Çubuğu */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Sure adı veya numarası ara (örn. İsrâ, Hucurât, 31)..."
                    className="w-full min-h-[44px] pl-10 pr-9 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/40"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Aramayı temizle"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setOnlyWithQuestions((v) => !v);
                  }}
                  className="min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: onlyWithQuestions
                      ? 'var(--brand-primary)'
                      : 'var(--bg-surface)',
                    borderColor: onlyWithQuestions
                      ? 'var(--brand-primary)'
                      : 'var(--border-strong)',
                    color: onlyWithQuestions ? '#FFFFFF' : 'var(--text-primary)',
                  }}
                >
                  <Filter className="w-4 h-4 shrink-0" />
                  <span>Sadece Sorusu Olanlar</span>
                </button>
              </div>

              {/* Hızlı Toplu Aksiyonlar */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--text-muted)' }} className="tabular-nums">
                  {formatNumberTr(filteredSurahs.length)} sure listeleniyor
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSelectFilteredSurahs}
                    className="font-bold cursor-pointer hover:underline"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    Listelenenleri Seç
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Seçimi Temizle
                  </button>
                </div>
              </div>

              {/* Sure Listesi */}
              {filteredSurahs.length === 0 ? (
                <div
                  className="p-8 rounded-2xl text-center text-sm"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Arama kriterine uygun sure bulunamadı.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredSurahs.map((surah) => {
                    const selected = draftSurahs.includes(surah.no);
                    const qCount = surahQCounts.get(surah.no) ?? surah.questionCount;

                    return (
                      <button
                        key={surah.no}
                        type="button"
                        onClick={() => handleToggleSurah(surah.no)}
                        className="min-h-[58px] p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600"
                        style={{
                          backgroundColor: selected
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: selected
                            ? 'var(--brand-primary)'
                            : 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border"
                            style={{
                              backgroundColor: selected
                                ? 'var(--brand-primary)'
                                : 'transparent',
                              borderColor: selected
                                ? 'var(--brand-primary)'
                                : 'var(--border-strong)',
                              color: '#FFFFFF',
                            }}
                          >
                            {selected && <Check className="w-3.5 h-3.5" />}
                          </span>

                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">
                              <span
                                className="tabular-nums mr-1.5"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {surah.no}.
                              </span>
                              {surah.shortNameTr}
                            </p>
                            <p
                              className="text-xs tabular-nums truncate"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {surah.ayahCount} ayet · {surah.type}
                              {qCount > 0 && (
                                <span
                                  className="font-bold"
                                  style={{ color: 'var(--brand-primary-text)' }}
                                >
                                  {' '}
                                  · {qCount} soru
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <span
                          className="arabic-text text-lg shrink-0 leading-none"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {surah.nameAr.replace(/^سُورَةُ\s+/, '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SEKME 3: CÜZ SEÇİMİ (1-30) */}
          {activeSubTab === 'juzs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>
                  Seçtiğiniz cüzlerdeki tüm ayetler ve sorular havuza eklenir.
                </span>
                {draftJuzs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setDraftJuzs([]);
                    }}
                    className="font-bold cursor-pointer hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Cüzleri Temizle
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {(meta?.juzs ?? []).map((juz) => {
                  const selected = draftJuzs.includes(juz.no);
                  const qCount = juzQCounts.get(juz.no) ?? 0;
                  const startName = surahMap.get(juz.start.s)?.shortNameTr ?? `${juz.start.s}`;
                  const endName = surahMap.get(juz.end.s)?.shortNameTr ?? `${juz.end.s}`;

                  return (
                    <button
                      key={juz.no}
                      type="button"
                      onClick={() => handleToggleJuz(juz.no)}
                      className="min-h-[78px] p-3.5 rounded-xl border text-left flex flex-col justify-between transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600"
                      style={{
                        backgroundColor: selected
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface)',
                        borderColor: selected
                          ? 'var(--brand-primary)'
                          : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-extrabold tabular-nums">
                          {juz.no}. Cüz
                        </span>
                        <span
                          className="w-5 h-5 rounded-md flex items-center justify-center border shrink-0"
                          style={{
                            backgroundColor: selected ? 'var(--brand-primary)' : 'transparent',
                            borderColor: selected
                              ? 'var(--brand-primary)'
                              : 'var(--border-strong)',
                            color: '#FFFFFF',
                          }}
                        >
                          {selected && <Check className="w-3 h-3" />}
                        </span>
                      </div>

                      <p
                        className="text-xs truncate mb-1"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {startName} {juz.start.a} → {endName} {juz.end.a}
                      </p>

                      <p
                        className="text-[11px] tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {formatNumberTr(juz.ayahCount)} ayet
                        {qCount > 0 && (
                          <span
                            className="font-bold"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            {' '}
                            · {formatNumberTr(qCount)} soru
                          </span>
                        )}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sabit Canlı Özet ve Kaydet Çubuğu */}
        <div
          className="px-5 py-4 border-t shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>
              Canlı Havuz Özeti
            </p>
            <p className="text-sm font-extrabold tabular-nums">
              Seçilen: {formatNumberTr(draftStats.surahCount)} Sure{' '}
              <span style={{ color: 'var(--text-muted)' }}>|</span>{' '}
              {formatNumberTr(draftStats.ayahCount)} Ayet{' '}
              <span style={{ color: 'var(--text-muted)' }}>|</span>{' '}
              <span style={{ color: 'var(--brand-primary-text)' }}>
                {formatNumberTr(draftStats.questionCount)} Hazır Soru
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={closePoolModal}
              className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl text-sm font-semibold border cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              Vazgeç
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={draftStats.surahCount === 0}
              className="flex-1 sm:flex-initial min-h-[44px] px-6 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-45 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
