import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  Flame,
  Layers,
  ListMusic,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Star,
  Target,
  Trophy,
  Type,
} from 'lucide-react';
import { PwaInstallControl } from '../components/PwaInstallControl';
import { audioQueueService } from '../services/audioQueueService';
import { dataService, resolvePlaylistItemStartLocation } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { SurahMeta } from '../types/quran';
import {
  buildSurahQuestionCountMap,
  formatNumberTr,
  getSurahMap,
} from '../utils/poolUtils';
import { formatSafeArabicTitle } from '../utils/arabicUtils';

interface AyahPreviewData {
  surahNo: number;
  surahNameTr: string;
  surahNameAr: string;
  ayahNo: number;
  cuzNo: number;
  pageNo: number;
  arabicText: string;
  tdvText: string;
  dibText: string;
}

export const HomePage: React.FC = () => {
  const {
    settings,
    studyPool,
    setStudyPool,
    studyProgress,
    audioPrefs,
    audioPlaylists,
    gamification,
    manifest,
    meta,
    questionIndex,
    isLoadingCore,
    coreError,
    retryCoreLoad,
    activateDemoData,
    poolStats,
    setActiveTab,
    navigateToStudy,
    navigateToExam,
    openPoolModal,
    openSettingsModal,
    openIntroSplash,
    openBookmarksDrawer,
    openListeningDrawer,
  } = useAppStore();

  const [previewAyah, setPreviewAyah] = useState<AyahPreviewData | null>(null);
  const [isLoadingAyah, setIsLoadingAyah] = useState(false);
  const [ayahError, setAyahError] = useState<string | null>(null);
  const lastAyahIdRef = useRef<number | null>(null);

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const questionCountBySurah = useMemo(
    () => buildSurahQuestionCountMap(questionIndex),
    [questionIndex],
  );

  const availableQuestionSurahs = useMemo<SurahMeta[]>(() => {
    if (!meta || !questionIndex) return [];
    return questionIndex.availableSurahs
      .map((sNo) => surahMap.get(sNo))
      .filter((s): s is SurahMeta => Boolean(s));
  }, [meta, questionIndex, surahMap]);

  const accuracyPercent = useMemo(() => {
    if (gamification.solvedCount <= 0) return null;
    return Math.round((gamification.correctCount / gamification.solvedCount) * 100);
  }, [gamification.solvedCount, gamification.correctCount]);

  // Havuzdan rastgele bir ayet seç ve yükle
  const fetchRandomAyahFromPool = useCallback(
    async (playSound = false) => {
      if (!meta) return;
      if (playSound) sfxService.play('click');

      const candidateSurahs =
        poolStats.effectiveSurahs.length > 0 ? poolStats.effectiveSurahs : [49, 31, 24, 17];
      const chosenSurahNo =
        candidateSurahs[Math.floor(Math.random() * candidateSurahs.length)] ?? 49;
      const surahInfo = surahMap.get(chosenSurahNo);

      setIsLoadingAyah(true);
      setAyahError(null);

      try {
        const [arFile, m1File, m2File] = await Promise.all([
          dataService.getArabicSurah(chosenSurahNo),
          dataService.getMealSurah('m1', chosenSurahNo),
          dataService.getMealSurah('m2', chosenSurahNo),
        ]);

        if (!arFile.verses.length) {
          throw new Error('Bu surede görüntülenecek ayet bulunamadı.');
        }

        // Çok kısa huruf-u mukattaa ayetlerini mümkünse atla, aynı ayeti üst üste getirme
        const readablePool = arFile.verses.filter(
          (v) => !v.mq && v.id !== lastAyahIdRef.current,
        );
        const poolToPick = readablePool.length > 0 ? readablePool : arFile.verses;
        const pickedAr = poolToPick[Math.floor(Math.random() * poolToPick.length)];

        const m1Verse = m1File.verses.find((v) => v.a === pickedAr.a);
        const m2Verse = m2File.verses.find((v) => v.a === pickedAr.a);

        lastAyahIdRef.current = pickedAr.id;
        setPreviewAyah({
          surahNo: chosenSurahNo,
          surahNameTr: surahInfo?.nameTr ?? `${chosenSurahNo}. Sure`,
          surahNameAr: surahInfo?.nameAr ?? '',
          ayahNo: pickedAr.a,
          cuzNo: pickedAr.c,
          pageNo: pickedAr.p,
          arabicText: pickedAr.t,
          tdvText: m1Verse?.t ?? '',
          dibText: m2Verse?.t ?? '',
        });
      } catch (err) {
        setAyahError(
          err instanceof Error ? err.message : 'Rastgele ayet yüklenirken bir hata oluştu.',
        );
      } finally {
        setIsLoadingAyah(false);
      }
    },
    [meta, poolStats.effectiveSurahs, surahMap],
  );

  // Çekirdek veri hazır olduğunda veya havuz değiştiğinde önizleme ayetini yenile
  const poolSignature = useMemo(
    () => poolStats.effectiveSurahs.join(','),
    [poolStats.effectiveSurahs],
  );

  useEffect(() => {
    if (!meta || isLoadingCore) return;
    fetchRandomAyahFromPool(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, isLoadingCore, poolSignature]);

  const handleToggleSurahInPool = (surahNo: number) => {
    sfxService.play('click');
    const exists = studyPool.selectedSurahs.includes(surahNo);
    const nextSurahs = exists
      ? studyPool.selectedSurahs.filter((n) => n !== surahNo)
      : [...studyPool.selectedSurahs, surahNo];

    // Havuzu tamamen boş bırakma
    if (nextSurahs.length === 0 && studyPool.selectedJuzs.length === 0) {
      return;
    }
    setStudyPool({
      selectedSurahs: nextSurahs,
      selectedJuzs: studyPool.selectedJuzs,
    });
  };

  const handleStartExam = () => {
    navigateToExam();
  };

  const handleFocusSurahAction = (surahNo: number, targetTab: 'reader' | 'exam') => {
    if (!poolStats.effectiveSurahs.includes(surahNo)) {
      setStudyPool({
        selectedSurahs: [...studyPool.selectedSurahs, surahNo],
        selectedJuzs: studyPool.selectedJuzs,
      });
    }
    if (targetTab === 'exam') {
      navigateToExam({ surahNo });
    } else {
      sfxService.play('click');
      navigateToStudy({ surah: surahNo, ayah: 1 });
    }
  };

  const handleOpenPoolReader = () => {
    sfxService.play('click');
    const last = studyProgress.lastRead;
    if (last && poolStats.effectiveSurahs.includes(last.surah)) {
      navigateToStudy({
        surah: last.surah,
        ayah: last.ayah,
        page: last.page,
        viewMode: last.viewMode,
      });
      return;
    }
    const firstSurah = poolStats.effectiveSurahs[0];
    if (firstSurah) {
      navigateToStudy({ surah: firstSurah, ayah: 1 });
    } else {
      setActiveTab('reader');
    }
  };

  // ============================================================================
  // Ağ Hatası Ekranı (+ Demo / Örnek Veri Seçeneği)
  // ============================================================================
  if (coreError && !meta) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <div className="surface-card rounded-2xl p-6 sm:p-8 text-center">
          <div
            className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' }}
          >
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold mb-2">Veri Kaynağına Ulaşılamadı</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
            Kur&apos;an-ı Kerim ve soru bankası verileri şu anda yüklenemedi. İnternet bağlantınızı
            kontrol edip yeniden deneyebilir veya örnek veriyle platformu inceleyebilirsiniz.
          </p>
          <p
            className="text-xs px-3 py-2 rounded-lg mb-6 break-words"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-muted)',
            }}
          >
            {coreError}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={retryCoreLoad}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tekrar Dene</span>
            </button>
            <button
              type="button"
              onClick={activateDemoData}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <span>Örnek Veri ile Devam Et</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Yükleme İskeleti
  // ============================================================================
  if (isLoadingCore && !meta) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-24 rounded-2xl border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div
            className="lg:col-span-7 h-64 rounded-2xl border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          />
          <div
            className="lg:col-span-5 h-64 rounded-2xl border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          />
        </div>
      </div>
    );
  }

  // Seçili surelerin okunaklı kısa özeti
  const activeSurahLabels = poolStats.effectiveSurahs
    .slice(0, 6)
    .map((no) => surahMap.get(no)?.shortNameTr ?? `${no}. Sure`);
  const remainingSurahCount = Math.max(0, poolStats.effectiveSurahs.length - 6);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ====================================================================
          1. Üst Karşılama ve 4 Özet İstatistik Kartı
          ==================================================================== */}
      <section aria-label="Çalışma özeti">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 mb-3">
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--brand-primary-text)' }}>
              Muallimun Kur&apos;an &amp; Meal
            </p>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-balance">
              Bugün hangi sureyle yolculuğa başlıyoruz?
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              Okuma, dinleme ve meal yarışması tek çalışma havuzunda.
            </p>
            <button
              type="button"
              onClick={openIntroSplash}
              className="text-xs font-bold underline underline-offset-4 cursor-pointer whitespace-nowrap"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              İntroyu Göster
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Günlük Seri */}
          <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Günlük Seri
              </span>
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <Flame className="w-4 h-4" />
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight">
                {formatNumberTr(gamification.streakDays)}
                <span
                  className="text-xs font-semibold ml-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  gün
                </span>
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Düzenli çalışma zinciri
              </p>
            </div>
          </div>

          {/* Toplam Puan */}
          <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Toplam Puan
              </span>
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Star className="w-4 h-4" />
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight">
                {formatNumberTr(gamification.totalXp)}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Yarışma ve tekrar puanı
              </p>
            </div>
          </div>

          {/* Çözülen Soru */}
          <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Çözülen Soru
              </span>
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight">
                {formatNumberTr(gamification.solvedCount)}
              </p>
              <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {formatNumberTr(gamification.correctCount)} doğru yanıt
              </p>
            </div>
          </div>

          {/* Doğruluk Oranı */}
          <div className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Doğruluk Oranı
              </span>
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.14)',
                  color: '#10B981',
                }}
              >
                <Target className="w-4 h-4" />
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight">
                {accuracyPercent !== null ? `%${accuracyPercent}` : '—'}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {accuracyPercent !== null ? 'Genel isabet ortalaması' : 'İlk sınavınızla oluşur'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          1.5. Kaldığım Yerden Devam Et & Sayfa Ayraçları Kartı
          ==================================================================== */}
      {studyProgress.lastRead && (() => {
        const lastRead = studyProgress.lastRead;
        const lastSurahMeta = surahMap.get(lastRead.surah);
        const modeLabel =
          lastRead.viewMode === 'mushaf'
            ? 'Mushaf Sayfa Düzeni'
            : lastRead.viewMode === 'book'
              ? 'Kitap Modu'
              : 'Ayet & Karşılaştırmalı Meal';
        const hatimBookmark = studyProgress.pageBookmarks.find((b) => b.isHatim);

        return (
          <section aria-label="Kaldığım yerden devam et">
            <div
              className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ borderColor: 'rgba(15, 118, 110, 0.25)' }}
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <BookMarked className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className="text-xs font-bold"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Kaldığım Yerden Devam Et
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      · {modeLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5">
                    <h3 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                      {lastSurahMeta?.nameTr ?? `${lastRead.surah}. Sure`}
                    </h3>
                    {lastSurahMeta?.nameAr && (
                      <span
                        className="arabic-title text-base leading-none"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {formatSafeArabicTitle(lastSurahMeta.nameAr)}
                      </span>
                    )}
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {lastRead.ayah}. Ayet · Sayfa {lastRead.page}
                    </span>
                    {hatimBookmark && (
                      <span
                        className="text-xs font-semibold tabular-nums"
                        style={{ color: 'var(--brand-accent-text)' }}
                      >
                        · Hatim Ayracı: S.{hatimBookmark.page}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openBookmarksDrawer}
                  className="min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Bookmark className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-accent-text)' }} />
                  <span>
                    Ayraçlar
                    {studyProgress.pageBookmarks.length > 0
                      ? ` (${studyProgress.pageBookmarks.length})`
                      : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    navigateToStudy({
                      surah: lastRead.surah,
                      ayah: lastRead.ayah,
                      page: lastRead.page,
                      viewMode: lastRead.viewMode,
                    });
                  }}
                  className="flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-1.5 shrink-0 transition-transform active:scale-[0.99] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 whitespace-nowrap"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span>Okumaya Devam Et</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ====================================================================
          1.6. Hata Kampı Hatırlatma Kartı (Yanlış Soru Varsa)
          ==================================================================== */}
      {gamification.wrongQuestionIds.length > 0 && (
        <section aria-label="Hata kampı hatırlatması">
          <div
            className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.28)',
              backgroundColor: 'rgba(239, 68, 68, 0.03)',
            }}
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#DC2626',
                }}
              >
                <Target className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold" style={{ color: '#DC2626' }}>
                  Hata Kampı Hatırlatması
                </p>
                <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                  Hata Kampında Seni Bekleyen {formatNumberTr(gamification.wrongQuestionIds.length)}{' '}
                  Soru Var
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Kısa bir telafi çalışmasıyla yanlışlarını kalıcı öğrenmeye dönüştür.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('mistakes')}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-1.5 shrink-0 transition-transform active:scale-[0.99] cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: '#DC2626' }}
            >
              <span>Hemen Temizle</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </section>
      )}

      {/* ====================================================================
          1.7. PWA Kurulum Önerisi (Sadece kurulabilir tarayıcı / iOS'ta görünür)
          ==================================================================== */}
      <PwaInstallControl variant="banner" />

      {/* ====================================================================
          1.8. Dinleme & Çalma Listelerim Hızlı Erişim Kartı
          ==================================================================== */}
      {meta && manifest && audioPlaylists.length > 0 && (
        <section aria-label="Dinleme ve çalma listelerim">
          <div className="surface-card rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <ListMusic className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                    Dinleme &amp; Çalma Listelerim
                  </h3>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    Sure, sayfa, cüz veya özel listelerle döngülü tilavet
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  openListeningDrawer({ initialTab: 'quick' });
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <span>Hızlı Dinle &amp; Listeler</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {audioPlaylists.slice(0, 3).map((playlist) => (
                <div
                  key={playlist.id}
                  className="p-3 rounded-xl border flex items-center justify-between gap-2.5 min-w-0"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openListeningDrawer({ initialTab: 'playlists' });
                    }}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <p className="text-xs sm:text-sm font-extrabold truncate">
                      {playlist.name}
                    </p>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {playlist.items.length} bölüm ·{' '}
                      {playlist.items.map((i) => i.label).slice(0, 2).join(', ')}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!playlist.items.length) return;
                      sfxService.play('click');
                      if (audioPrefs.showTextOnStart) {
                        navigateToStudy(
                          resolvePlaylistItemStartLocation(playlist.items[0], meta),
                        );
                      }
                      void audioQueueService.startSegmentQueue({
                        items: playlist.items,
                        title: playlist.name,
                        context: 'playlist',
                        contextKey: `playlist:${playlist.id}`,
                        manifest,
                        meta,
                        prefs: audioPrefs,
                      });
                    }}
                    disabled={playlist.items.length === 0}
                    aria-label={`${playlist.name} listesini dinle`}
                    title={`${playlist.name} listesini dinle`}
                    className="h-9 px-3 rounded-xl text-xs font-bold text-white flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-45 transition-transform active:scale-95"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Dinle</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ====================================================================
          2. Ana 2-Sütunlu Alan: Aktif Çalışma Havuzu + Rastgele Ayet Önizleme
          ==================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* SOL (7 sütun): Aktif Çalışma Havuzu Kartı */}
        <div className="lg:col-span-7 surface-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-primary)',
                    color: '#FFFFFF',
                  }}
                >
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                    Aktif Çalışma Havuzum
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Okuma, dinleme ve sınav kapsamınız
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openPoolModal}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Havuzu Düzenle</span>
              </button>
            </div>

            {/* 3 Havuz Sayacı */}
            <div
              className="grid grid-cols-3 gap-3 p-4 rounded-xl mb-5 border"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                  Seçili Sure
                </p>
                <p className="text-xl sm:text-2xl font-extrabold tabular-nums">
                  {formatNumberTr(poolStats.surahCount)}
                </p>
              </div>
              <div
                className="border-l pl-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                  Toplam Ayet
                </p>
                <p className="text-xl sm:text-2xl font-extrabold tabular-nums">
                  {formatNumberTr(poolStats.ayahCount)}
                </p>
              </div>
              <div
                className="border-l pl-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                  Hazır Soru
                </p>
                <p
                  className="text-xl sm:text-2xl font-extrabold tabular-nums"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {formatNumberTr(poolStats.questionCount)}
                </p>
              </div>
            </div>

            {/* Seçili Sure ve Cüzlerin Metin Özeti (Zero-Pill Temiz Tipografi) */}
            <div className="space-y-1.5 mb-6 text-sm">
              <p style={{ color: 'var(--text-secondary)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Kapsam:{' '}
                </span>
                {activeSurahLabels.length > 0 ? (
                  <>
                    {activeSurahLabels.join(', ')}
                    {remainingSurahCount > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' '}
                        ve +{formatNumberTr(remainingSurahCount)} sure daha
                      </span>
                    )}
                  </>
                ) : (
                  <span>Henüz sure seçilmedi.</span>
                )}
              </p>
              {studyPool.selectedJuzs.length > 0 && (
                <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  Seçili Cüzler: {studyPool.selectedJuzs.map((j) => `${j}. Cüz`).join(' · ')}
                </p>
              )}
              {poolStats.questionCount === 0 && (
                <p className="text-xs font-medium" style={{ color: 'var(--brand-accent-text)' }}>
                  Bu seçimde henüz hazır sınav sorusu yok; okuma ve meal çalışması yapabilir veya
                  soru bankası bulunan sureleri havuza ekleyebilirsiniz.
                </p>
              )}
            </div>
          </div>

          {/* Ana Aksiyonlar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleStartExam}
              className="flex-1 min-h-[48px] px-5 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Sınav Başlat</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={handleOpenPoolReader}
              className="flex-1 sm:flex-initial min-h-[48px] px-5 py-3 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Meal &amp; Okuma</span>
            </button>
          </div>
        </div>

        {/* SAĞ (5 sütun): Havuzdan Rastgele Ayet Önizleme Kartı */}
        <div className="lg:col-span-5 surface-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base font-extrabold tracking-tight">Havuzdan Bir Ayet</h3>
                {previewAyah && (
                  <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {previewAyah.surahNameTr} · {previewAyah.ayahNo}. Ayet · {previewAyah.cuzNo}.
                    Cüz
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchRandomAyahFromPool(true)}
                disabled={isLoadingAyah}
                aria-label="Havuzdan yeni rastgele ayet getir"
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw
                  className={`w-4 h-4 shrink-0 ${isLoadingAyah ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline whitespace-nowrap">Yeni Ayet</span>
              </button>
            </div>

            {ayahError ? (
              <div
                className="p-4 rounded-xl text-sm"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-secondary)',
                }}
              >
                {ayahError}
              </div>
            ) : !previewAyah ? (
              <div className="space-y-3 py-6 animate-pulse">
                <div
                  className="h-8 rounded-lg w-5/6 ml-auto"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                />
                <div
                  className="h-4 rounded w-full"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                />
                <div
                  className="h-4 rounded w-4/5"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Arapça Metin (Anlık Font & Punto Uyumlu) */}
                <div
                  className="p-4 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <p
                    className="arabic-text text-right break-words"
                    style={{
                      fontSize: `${settings.arabicFontSize}px`,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {previewAyah.arabicText}
                  </p>
                </div>

                {/* Türkçe Meal(ler) (Anlık Meal Tercihi, Font ve Punto Uyumlu) */}
                <div className="space-y-3">
                  {(settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') &&
                    previewAyah.tdvText && (
                      <div>
                        <p
                          className="text-[11px] font-bold mb-1"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          Diyanet Vakfı Meali (TDV)
                        </p>
                        <p
                          className="turkish-reading"
                          style={{
                            fontSize: `${settings.turkishFontSize}px`,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {previewAyah.tdvText}
                        </p>
                      </div>
                    )}

                  {(settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') &&
                    previewAyah.dibText && (
                      <div
                        className={
                          settings.preferredMeal === 'both' ? 'pt-3 border-t' : undefined
                        }
                        style={
                          settings.preferredMeal === 'both'
                            ? { borderColor: 'var(--border-subtle)' }
                            : undefined
                        }
                      >
                        <p
                          className="text-[11px] font-bold mb-1"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          Diyanet İşleri Meali (DİB Yeni)
                        </p>
                        <p
                          className="turkish-reading"
                          style={{
                            fontSize: `${settings.turkishFontSize}px`,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {previewAyah.dibText}
                        </p>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>

          {/* Alt Okuyucuda Aç & Yazı Tipi Kısayolları */}
          <div
            className="mt-5 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {previewAyah ? (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  navigateToStudy({
                    surah: previewAyah.surahNo,
                    ayah: previewAyah.ayahNo,
                    page: previewAyah.pageNo,
                  });
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">Okuyucuda Aç</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                {settings.arabicFont} · {settings.arabicFontSize}px
              </span>
            )}

            <button
              type="button"
              onClick={openSettingsModal}
              className="min-h-[40px] px-2.5 rounded-lg font-bold flex items-center gap-1.5 shrink-0 cursor-pointer hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <Type className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Yazı Tipi ({settings.arabicFontSize}px)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ====================================================================
          3. Soru Bankası Bulunan Sureler Hızlı Erişim Kartları
          ==================================================================== */}
      <section aria-label="Soru bankası bulunan sureler">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold tracking-tight">
              Soru Bankası Bulunan Sureler
            </h3>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              Editoryal soru havuzuna eklenen sureler burada otomatik olarak listelenir.
            </p>
          </div>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            {formatNumberTr(availableQuestionSurahs.length)} Sure ·{' '}
            {formatNumberTr(questionIndex?.items.length ?? 0)} Doğrulanmış Soru
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {availableQuestionSurahs.map((surah) => {
            const qCount = questionCountBySurah.get(surah.no) ?? surah.questionCount;
            const inPool = poolStats.effectiveSurahs.includes(surah.no);
            const directlySelected = studyPool.selectedSurahs.includes(surah.no);

            return (
              <article
                key={surah.no}
                className="surface-card rounded-2xl p-4 flex flex-col justify-between transition-transform hover:-translate-y-0.5"
              >
                <div>
                  {/* Üst Satır: Sure No + Arapça İsim */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums shrink-0"
                      style={{
                        backgroundColor: 'var(--brand-primary-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      {surah.no}
                    </span>

                    <span
                      className="arabic-title text-xl leading-none pt-0.5"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {formatSafeArabicTitle(surah.nameAr)}
                    </span>
                  </div>

                  {/* Sure Adı ve Yalın Metaveri */}
                  <h4 className="text-base font-extrabold tracking-tight mb-1">
                    {surah.nameTr}
                  </h4>
                  <p
                    className="text-xs tabular-nums mb-3"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {surah.type} · {formatNumberTr(surah.ayahCount)} Ayet ·{' '}
                    {surah.cuzs.join(', ')}. Cüz
                  </p>

                  {/* Soru Sayısı Vurgusu (Tıklanabilir Sınav Kısayolu) */}
                  <button
                    type="button"
                    onClick={() => handleFocusSurahAction(surah.no, 'exam')}
                    className="w-full py-2 px-3 rounded-xl flex items-center justify-between text-xs font-bold mb-4 cursor-pointer transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <span>Hazır Soru Bankası</span>
                    <span className="tabular-nums">{formatNumberTr(qCount)} Soru →</span>
                  </button>
                </div>

                {/* Kart Aksiyonları */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleFocusSurahAction(surah.no, 'exam')}
                      className="min-h-[44px] px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95 cursor-pointer"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Trophy className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Sınava Gir</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFocusSurahAction(surah.no, 'reader')}
                      className="min-h-[44px] px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Meal Oku</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSurahInPool(surah.no)}
                    disabled={
                      directlySelected &&
                      studyPool.selectedSurahs.length === 1 &&
                      studyPool.selectedJuzs.length === 0
                    }
                    className="w-full min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: inPool ? 'var(--brand-primary-soft)' : 'transparent',
                      color: inPool ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                    }}
                  >
                    {inPool ? (
                      <>
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Çalışma Havuzunda</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>Havuza Ekle</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
