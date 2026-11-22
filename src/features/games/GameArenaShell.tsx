import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  ChevronUp,
  Clock,
  Compass,
  Flame,
  Grid2x2,
  HelpCircle,
  Layers,
  Lightbulb,
  Moon,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Square,
  Star,
  Sun,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { buildReciterAudioUrls, findReciterById } from '../../config/recitersConfig';
import { useAppStore } from '../../store/useAppStore';
import type { ThemeMode } from '../../types/quran';
import type {
  EnrichedGameSurah,
  GameHudUpdate,
  GameId,
  GamePlayerMode,
  GameTempo,
  GameTierId,
} from './gameTypes';
import {
  GAME_DEFINITIONS,
  GAME_TIERS,
  formatClock,
} from './gameTypes';
import { getSurahSpecialSummaryText } from './surahSpecialGroups';

interface GameArenaShellProps {
  gameId: GameId;
  tierId: GameTierId;
  tempo: GameTempo;
  playerMode: GamePlayerMode;
  isMuted: boolean;
  isSummaryOpen: boolean;
  hud: GameHudUpdate;
  allSurahsMap: Map<number, EnrichedGameSurah>;
  onToggleMute: () => void;
  onRestart: () => void;
  onChangeConfig: (patch: {
    tierId?: GameTierId;
    tempo?: GameTempo;
    playerMode?: GamePlayerMode;
  }) => void;
  onClose: () => void;
  children: React.ReactNode;
}

function renderGameBadgeIcon(gameId: GameId) {
  switch (gameId) {
    case 'memory':
      return <Grid2x2 className="w-4 h-4 sm:w-5 sm:h-5" />;
    case 'chain':
      return <Layers className="w-4 h-4 sm:w-5 sm:h-5" />;
    case 'speed':
      return <Zap className="w-4 h-4 sm:w-5 sm:h-5" />;
    case 'compass':
      return <Compass className="w-4 h-4 sm:w-5 sm:h-5" />;
    case 'detective':
    default:
      return <Search className="w-4 h-4 sm:w-5 sm:h-5" />;
  }
}

export const GameArenaShell: React.FC<GameArenaShellProps> = ({
  gameId,
  tierId,
  tempo,
  playerMode,
  isMuted,
  isSummaryOpen,
  hud,
  allSurahsMap,
  onToggleMute,
  onRestart,
  onChangeConfig,
  onClose,
  children,
}) => {
  const { settings, updateSettings, audioPrefs, manifest } = useAppStore();

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isModesOpen, setIsModesOpen] = useState(false);
  const [isMobileNoteSheetOpen, setIsMobileNoteSheetOpen] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioLoadingSurah, setAudioLoadingSurah] = useState<number | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const gameMeta = GAME_DEFINITIONS.find((g) => g.id === gameId) ?? GAME_DEFINITIONS[0];
  const tierMeta = GAME_TIERS.find((t) => t.id === tierId) ?? GAME_TIERS[0];

  const featuredSurah = hud.featuredSurah ?? null;
  const prevNeighbor = featuredSurah ? allSurahsMap.get(featuredSurah.no - 1) : undefined;
  const nextNeighbor = featuredSurah ? allSurahsMap.get(featuredSurah.no + 1) : undefined;

  const stopPreviewAudio = useCallback(() => {
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current.src = '';
      } catch {
        // yoksay
      }
      previewAudioRef.current = null;
    }
    setIsAudioPlaying(false);
    setAudioLoadingSurah(null);
  }, []);

  // Sure değiştiğinde veya bileşen kapandığında tekil önizleme sesini temizle
  useEffect(() => {
    stopPreviewAudio();
  }, [featuredSurah?.no, stopPreviewAudio]);

  useEffect(() => {
    return () => {
      stopPreviewAudio();
    };
  }, [stopPreviewAudio]);

  const handleToggleListen = useCallback(() => {
    if (!featuredSurah) return;
    if (isAudioPlaying) {
      stopPreviewAudio();
      return;
    }

    const reciter = findReciterById(audioPrefs.arabicReciterId, manifest);
    const urls = buildReciterAudioUrls(reciter, featuredSurah.no, 1);
    if (urls.length === 0) return;

    stopPreviewAudio();
    setAudioLoadingSurah(featuredSurah.no);

    let urlIdx = 0;
    const audio = new Audio();
    audio.preload = 'auto';
    previewAudioRef.current = audio;

    const tryPlayCurrent = () => {
      if (urlIdx >= urls.length) {
        stopPreviewAudio();
        return;
      }
      audio.src = urls[urlIdx];
      void audio
        .play()
        .then(() => {
          setAudioLoadingSurah(null);
          setIsAudioPlaying(true);
        })
        .catch(() => {
          urlIdx += 1;
          if (urlIdx < urls.length) {
            tryPlayCurrent();
          } else {
            stopPreviewAudio();
          }
        });
    };

    audio.onended = () => {
      stopPreviewAudio();
    };
    audio.onerror = () => {
      urlIdx += 1;
      if (urlIdx < urls.length) {
        tryPlayCurrent();
      } else {
        stopPreviewAudio();
      }
    };

    tryPlayCurrent();
  }, [audioPrefs.arabicReciterId, featuredSurah, isAudioPlaying, manifest, stopPreviewAudio]);

  const handleCycleTheme = () => {
    const order: ThemeMode[] = ['light', 'cream', 'dark'];
    const idx = order.indexOf(settings.theme);
    const next = order[(idx + 1) % order.length];
    updateSettings({ theme: next });
  };

  const modeLabel =
    playerMode === 'ai'
      ? 'Yapay Zekâya Karşı'
      : playerMode === 'duel'
        ? '2 Oyuncu (Akıllı Tahta)'
        : 'Tek Başına';
  const tempoLabel = tempo === 'timed' ? 'Zaman Yarışı' : 'Sakin Mod';

  // Dairesel SVG geri sayım halkası hesabı
  const hasTurnRing =
    typeof hud.turnRemainingSec === 'number' &&
    typeof hud.turnDurationSec === 'number' &&
    hud.turnDurationSec > 0;
  const ringRadius = 21;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringRatio = hasTurnRing
    ? Math.max(0, Math.min(1, (hud.turnRemainingSec ?? 0) / (hud.turnDurationSec ?? 1)))
    : 1;
  const ringDashOffset = ringCircumference * (1 - ringRatio);
  const ringUrgent = hasTurnRing && (hud.turnRemainingSec ?? 99) <= 5;

  const p1Name = playerMode === 'duel' ? '1. Oyuncu' : 'Sen';
  const p2Name = playerMode === 'duel' ? '2. Oyuncu' : 'Yapay Zekâ';

  const renderInfoNoteBody = (compact?: boolean) => {
    if (!featuredSurah) {
      return (
        <div className="space-y-2.5">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {tierMeta.tipText}
          </p>
          <div
            className="rounded-xl border p-2.5 text-[11px] leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            Bir sureyi eşleştirdiğinizde veya çözdüğünüzde künyesi, komşu sureleri ve ilk ayet tilaveti burada belirir.
          </div>
        </div>
      );
    }

    const specialSummary = getSurahSpecialSummaryText(featuredSurah.no);

    return (
      <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
        {/* Sure Başlığı ve Anlamı */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                {featuredSurah.no}. Sure
              </span>
              <span
                className="text-sm font-extrabold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {featuredSurah.nameTr}
              </span>
            </div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Anlamı: “{featuredSurah.meaningTr}”
            </div>
          </div>

          <span
            dir="rtl"
            className="font-arabic text-xl leading-none shrink-0 pt-0.5"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            {featuredSurah.nameAr}
          </span>
        </div>

        {hud.featuredNote && (
          <div
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              color: 'var(--brand-accent-text)',
            }}
          >
            {hud.featuredNote}
          </div>
        )}

        {/* Vurgulu KÜNYE & ÖZELLİK Kutusu */}
        <div
          className="rounded-xl border p-2.5 space-y-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className="text-[10px] font-extrabold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            KÜNYE &amp; ÖZELLİK
          </div>

          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            <span>{featuredSurah.ayahCount} Ayet</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>{featuredSurah.type}</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>Nüzul: {featuredSurah.nuzulOrder}.</span>
          </div>

          {/* Komşu Sureler */}
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Komşular:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {prevNeighbor ? `${prevNeighbor.no}. ${prevNeighbor.shortNameTr}` : 'Başlangıç'}
            </strong>{' '}
            ← · →{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {nextNeighbor ? `${nextNeighbor.no}. ${nextNeighbor.shortNameTr}` : 'Son Sure'}
            </strong>
          </div>

          {/* Ulûmu'l-Kur'ân Özel Grup Bilgisi */}
          {specialSummary && (
            <div
              className="text-[11px] font-semibold pt-1 border-t"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--brand-accent-text)',
              }}
            >
              {specialSummary}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${gameMeta.title} Oyun Sahnesi`}
      className="fixed inset-0 z-50 w-full h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      {/* ================================================================= */}
      {/* MASAÜSTÜ (lg+) ÜST KONTROL ŞERİDİ (h-14)                          */}
      {/* ================================================================= */}
      <header
        className="hidden lg:flex shrink-0 h-14 px-4 border-b items-center justify-between gap-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Sol: Yeşil İkon Rozeti + Oyun Adı + Arapça Alt Başlık + Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm"
            style={{ backgroundColor: '#0F766E' }}
          >
            {renderGameBadgeIcon(gameId)}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <h1
                className="text-base font-extrabold tracking-tight truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {gameMeta.title}
              </h1>
              <span
                dir="rtl"
                className="font-arabic text-base font-semibold shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {gameMeta.arabicTitle}
              </span>
            </div>
            <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
              {tierMeta.title} · {modeLabel} · {tempoLabel}
            </div>
          </div>
        </div>

        {/* Sağ: Yuvarlak İkon Butonlar + Hap Aksiyon Butonları */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            title="Nasıl Oynanır?"
            aria-label="Nasıl Oynanır"
            className="w-9 h-9 rounded-full border inline-flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleCycleTheme}
            title="Temayı Değiştir (Açık / Krem / Koyu)"
            aria-label="Temayı Değiştir"
            className="w-9 h-9 rounded-full border inline-flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {settings.theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            title={isMuted ? 'Ses Efektlerini Aç' : 'Ses Efektlerini Kapat'}
            aria-label={isMuted ? 'Ses Efektlerini Aç' : 'Ses Efektlerini Kapat'}
            className="w-9 h-9 rounded-full border inline-flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: isMuted ? 'var(--text-muted)' : 'var(--brand-primary-text)',
            }}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <div className="h-5 w-px mx-0.5" style={{ backgroundColor: 'var(--border-subtle)' }} />

          <button
            type="button"
            onClick={onRestart}
            className="h-9 px-3 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Yenile</span>
          </button>

          <button
            type="button"
            onClick={() => setIsModesOpen(true)}
            className="h-9 px-3 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Modlar</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="w-3.5 h-3.5" />
            <span>Çıkış</span>
          </button>
        </div>
      </header>

      {/* ================================================================= */}
      {/* MOBİL (< lg) İNCE ÜST BAR (h-11) + KOMPAKT SKOR ŞERİDİ (h-10)     */}
      {/* ================================================================= */}
      <header
        className="flex lg:hidden shrink-0 h-11 px-2 border-b items-center justify-between gap-1.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Listeye dön"
            className="w-8 h-8 rounded-lg border inline-flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 leading-tight">
            <div
              className="text-xs font-extrabold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {gameMeta.shortTitle}
            </div>
            <div
              className="text-[10px] font-medium truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {tierMeta.shortTitle}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Sesi aç' : 'Sesi kapat'}
            className="w-8 h-8 rounded-lg border inline-flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: isMuted ? 'var(--text-muted)' : 'var(--brand-primary-text)',
            }}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onRestart}
            aria-label="Yeniden başlat"
            className="w-8 h-8 rounded-lg border inline-flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsModesOpen(true)}
            aria-label="Modlar"
            className="w-8 h-8 rounded-lg border inline-flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            aria-label="Nasıl Oynanır"
            className="w-8 h-8 rounded-lg border inline-flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Mobil Tek Satır Kompakt Skor & Tur Şeridi (h-10) */}
      {!isSummaryOpen && (
        <div
          className="flex lg:hidden shrink-0 h-10 px-2 border-b items-center justify-between gap-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Sol: Skorlar */}
          {playerMode === 'single' ? (
            <div className="flex items-center gap-1.5">
              <span
                className="px-2 py-0.5 rounded-md text-xs font-extrabold tabular-nums inline-flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Star className="w-3 h-3" fill="currentColor" />
                {hud.p1Score}p
              </span>
              {hud.combo >= 2 && (
                <span
                  className="px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums inline-flex items-center gap-0.5"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  <Flame className="w-3 h-3" />
                  {hud.combo}x
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums border"
                style={{
                  backgroundColor:
                    hud.activeTurn === 'p1' ? 'rgba(217, 119, 6, 0.14)' : 'var(--bg-surface)',
                  borderColor:
                    hud.activeTurn === 'p1' ? '#D97706' : 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {p1Name}: {hud.p1Score}p
              </span>
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums border"
                style={{
                  backgroundColor:
                    hud.activeTurn === 'p2' ? 'rgba(13, 148, 136, 0.14)' : 'var(--bg-surface)',
                  borderColor:
                    hud.activeTurn === 'p2' ? '#0D9488' : 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {playerMode === 'ai' ? 'YZ' : '2.O'}: {hud.p2Score}p
              </span>
            </div>
          )}

          {/* Orta: Sayaç */}
          <div
            className="px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums inline-flex items-center gap-1 border"
            style={{
              backgroundColor:
                hud.timerUrgent || ringUrgent
                  ? 'rgba(220, 38, 38, 0.12)'
                  : 'var(--bg-surface)',
              borderColor:
                hud.timerUrgent || ringUrgent ? '#DC2626' : 'var(--border-subtle)',
              color: hud.timerUrgent || ringUrgent ? '#DC2626' : 'var(--text-primary)',
            }}
          >
            <Clock className="w-3 h-3" />
            <span>{hasTurnRing ? `${hud.turnRemainingSec}s` : hud.timerText}</span>
          </div>

          {/* Sağ: Hamle / İlerleme */}
          <span
            className="text-[11px] font-bold tabular-nums shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            {hud.progressLabel || `Hamle: ${hud.movesCount}`}
          </span>
        </div>
      )}

      {/* ================================================================= */}
      {/* ANA GÖVDE: ÖZET EKRANI VEYA 2-SÜTUN STÜDYO SAHNESİ                */}
      {/* ================================================================= */}
      {isSummaryOpen ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_350px] gap-0 lg:gap-4 p-2 lg:p-4 overflow-hidden">
          {/* SOL SÜTUN — Zümrüt Çuha Oyun Masası */}
          <section className="game-emerald-table rounded-2xl p-2 sm:p-3 lg:p-4 flex flex-col min-h-0 overflow-hidden relative">
            {children}
          </section>

          {/* SAĞ SÜTUN (Masaüstü lg+) — Skor, Sayaç ve Canlı Bilgi Notu Paneli */}
          <aside className="hidden lg:flex flex-col gap-3 min-h-0 overflow-hidden">
            {/* A) Oyuncu & Rakip Skor Kartları */}
            {playerMode === 'single' ? (
              <div
                className="shrink-0 rounded-2xl border p-3.5 space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: '#D97706' }}
                    >
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                        Tek Başına
                      </div>
                      <div className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                        Kişisel rekor &amp; yıldız hedefi
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-2xl font-black tabular-nums"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    {hud.p1Score}p
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="inline-flex items-center gap-1 font-bold" style={{ color: '#D97706' }}>
                    <Flame className="w-3.5 h-3.5" />
                    <span>Seri: {hud.combo}x</span>
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {hud.progressLabel}
                  </span>
                </div>
              </div>
            ) : (
              <div className="shrink-0 space-y-2">
                {/* 1. Kart: Sen / 1. Oyuncu */}
                <div
                  className="rounded-2xl border-2 px-3.5 py-2.5 flex items-center justify-between gap-2 transition-all"
                  style={{
                    backgroundColor:
                      hud.activeTurn === 'p1'
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface)',
                    borderColor:
                      hud.activeTurn === 'p1' ? '#D97706' : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: '#D97706' }}
                    >
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                        {p1Name}
                      </div>
                      <div
                        className="text-[11px] font-bold"
                        style={{
                          color:
                            hud.activeTurn === 'p1'
                              ? '#B45309'
                              : hud.activeTurn === 'both'
                                ? 'var(--brand-primary-text)'
                                : 'var(--text-muted)',
                        }}
                      >
                        {hud.activeTurn === 'p1'
                          ? 'Sırada'
                          : hud.activeTurn === 'both'
                            ? 'Yarışıyor'
                            : 'Bekliyor'}
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-xl font-black tabular-nums shrink-0"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {hud.p1Score}p
                  </div>
                </div>

                {/* 2. Kart: Yapay Zekâ / 2. Oyuncu */}
                <div
                  className="rounded-2xl border-2 px-3.5 py-2.5 flex items-center justify-between gap-2 transition-all"
                  style={{
                    backgroundColor:
                      hud.activeTurn === 'p2'
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                    borderColor:
                      hud.activeTurn === 'p2' ? '#0D9488' : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: '#0F766E' }}
                    >
                      {playerMode === 'ai' ? (
                        <Bot className="w-4 h-4" />
                      ) : (
                        <Users className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                        {p2Name}
                      </div>
                      <div
                        className="text-[11px] font-bold"
                        style={{
                          color:
                            hud.activeTurn === 'p2' || hud.aiThinking
                              ? 'var(--brand-primary-text)'
                              : hud.activeTurn === 'both'
                                ? 'var(--brand-primary-text)'
                                : 'var(--text-muted)',
                        }}
                      >
                        {hud.aiThinking
                          ? 'Düşünüyor...'
                          : hud.activeTurn === 'p2'
                            ? 'Sırada'
                            : hud.activeTurn === 'both'
                              ? 'Yarışıyor'
                              : 'Bekliyor'}
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-xl font-black tabular-nums shrink-0"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {hud.p2Score}p
                  </div>
                </div>
              </div>
            )}

            {/* B) Dairesel Tur Sayacı + Süre/Hamle Kutuları + Durum Şeridi */}
            <div
              className="shrink-0 rounded-2xl border p-3 space-y-2.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-3">
                {/* SVG Dairesel Geri Sayım Halkası */}
                <div className="relative w-13 h-13 shrink-0 flex items-center justify-center">
                  <svg className="w-13 h-13 -rotate-90" viewBox="0 0 52 52" aria-hidden="true">
                    <circle
                      cx="26"
                      cy="26"
                      r={ringRadius}
                      fill="none"
                      stroke="var(--border-subtle)"
                      strokeWidth="4"
                    />
                    <circle
                      cx="26"
                      cy="26"
                      r={ringRadius}
                      fill="none"
                      stroke={ringUrgent ? '#DC2626' : '#0D9488'}
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringDashOffset}
                      style={{ transition: 'stroke-dashoffset 280ms linear' }}
                    />
                  </svg>
                  <span
                    className="absolute text-xs font-extrabold tabular-nums"
                    style={{ color: ringUrgent ? '#DC2626' : 'var(--text-primary)' }}
                  >
                    {hasTurnRing ? `${hud.turnRemainingSec}s` : '∞'}
                  </span>
                </div>

                {/* Süre & Hamle Kutucukları */}
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div
                    className="rounded-xl border px-2.5 py-1.5"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div
                      className="text-[10px] font-semibold inline-flex items-center gap-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Clock className="w-3 h-3" />
                      <span>Süre</span>
                    </div>
                    <div
                      className="text-sm font-extrabold tabular-nums"
                      style={{ color: hud.timerUrgent ? '#DC2626' : 'var(--text-primary)' }}
                    >
                      {hud.timerText || formatClock(hud.elapsedSec)}
                    </div>
                  </div>

                  <div
                    className="rounded-xl border px-2.5 py-1.5"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div
                      className="text-[10px] font-semibold inline-flex items-center gap-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Shuffle className="w-3 h-3" />
                      <span>Hamle</span>
                    </div>
                    <div
                      className="text-xs font-extrabold tabular-nums truncate mt-0.5"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {hud.movesCount} · {hud.progressLabel}
                    </div>
                  </div>
                </div>
              </div>

              {/* Yönlendirme Şeridi */}
              <div
                className="rounded-xl px-3 py-2 text-xs font-bold leading-snug"
                style={{
                  backgroundColor:
                    hud.activeTurn === 'p2'
                      ? 'var(--brand-primary-soft)'
                      : 'var(--brand-accent-soft)',
                  color:
                    hud.activeTurn === 'p2'
                      ? 'var(--brand-primary-text)'
                      : 'var(--brand-accent-text)',
                }}
              >
                {hud.statusMessage}
              </div>
            </div>

            {/* C) Canlı "💡 Bilgi Notu" & "🔊 Dinle" Öğrenme Kartı */}
            <div
              className="flex-1 min-h-0 rounded-2xl border p-3.5 flex flex-col gap-2.5 overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="shrink-0 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  <Lightbulb className="w-4 h-4" style={{ color: '#D97706' }} />
                  <span>Bilgi Notu</span>
                </div>

                {featuredSurah && (
                  <button
                    type="button"
                    onClick={handleToggleListen}
                    disabled={audioLoadingSurah === featuredSurah.no}
                    className="h-7 px-2.5 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: isAudioPlaying
                        ? '#D97706'
                        : 'var(--brand-primary)',
                      color: '#FFFFFF',
                    }}
                  >
                    {isAudioPlaying ? (
                      <>
                        <Square className="w-3 h-3" fill="currentColor" />
                        <span>Durdur</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>
                          {audioLoadingSurah === featuredSurah.no ? 'Yükleniyor...' : 'Dinle'}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
                {renderInfoNoteBody(false)}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ================================================================= */}
      {/* MOBİL (< lg) ALT KOMPAKT "💡 BİLGİ NOTU" ÇEKMECE ÇUBUĞU (h-11)    */}
      {/* ================================================================= */}
      {!isSummaryOpen && (
        <div
          className="flex lg:hidden shrink-0 h-11 px-2.5 border-t items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setIsMobileNoteSheetOpen(true)}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer"
          >
            <Lightbulb className="w-4 h-4 shrink-0" style={{ color: '#D97706' }} />
            <span
              className="text-xs font-bold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {featuredSurah
                ? `${featuredSurah.no}. ${featuredSurah.shortNameTr} · ${featuredSurah.meaningTr} · ${featuredSurah.ayahCount} Ayet`
                : hud.statusMessage}
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {featuredSurah && (
              <button
                type="button"
                onClick={handleToggleListen}
                className="h-7 px-2 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: isAudioPlaying ? '#D97706' : 'var(--brand-primary)',
                  color: '#FFFFFF',
                }}
              >
                {isAudioPlaying ? (
                  <Square className="w-3 h-3" fill="currentColor" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
                <span>{isAudioPlaying ? 'Dur' : 'Dinle'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMobileNoteSheetOpen(true)}
              className="h-7 px-2 rounded-lg border text-[11px] font-bold inline-flex items-center gap-0.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>Detay</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Mobil Alt Bilgi Notu Çekmecesi (Bottom Sheet) */}
      {isMobileNoteSheetOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/45 flex items-end justify-center lg:hidden"
          onClick={() => setIsMobileNoteSheetOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border-t p-4 space-y-3 max-h-[75dvh] overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                <Lightbulb className="w-4 h-4" style={{ color: '#D97706' }} />
                <span>Bilgi Notu</span>
              </div>
              <div className="flex items-center gap-2">
                {featuredSurah && (
                  <button
                    type="button"
                    onClick={handleToggleListen}
                    className="h-8 px-3 rounded-full text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: isAudioPlaying ? '#D97706' : 'var(--brand-primary)',
                      color: '#FFFFFF',
                    }}
                  >
                    {isAudioPlaying ? (
                      <Square className="w-3 h-3" fill="currentColor" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isAudioPlaying ? 'Durdur' : '1. Ayeti Dinle'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMobileNoteSheetOpen(false)}
                  aria-label="Kapat"
                  className="w-8 h-8 rounded-full border inline-flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {renderInfoNoteBody(true)}
          </div>
        </div>
      )}

      {/* "?" Nasıl Oynanır Modalı */}
      {isHelpOpen && (
        <div
          className="fixed inset-0 z-[75] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setIsHelpOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-5 space-y-3"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5" style={{ color: 'var(--brand-primary-text)' }} />
                <h3 className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {gameMeta.title} — Nasıl Oynanır?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="w-8 h-8 rounded-full border inline-flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {gameMeta.howToPlay}
            </p>
            <div
              className="rounded-xl border p-3 text-xs space-y-1"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Aktif Kademe:</strong> {tierMeta.title}
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Bilgi Notu:</strong> Her çözülen surede sağ panelde (mobilde alt çubukta) künye ve ilk ayet tilaveti açılır.
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="h-9 px-4 rounded-xl text-xs font-extrabold cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }}
              >
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Modlar" Hızlı Kademe / Rakip / Tempo Değiştirici Modalı */}
      {isModesOpen && (
        <div
          className="fixed inset-0 z-[75] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setIsModesOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border p-5 space-y-4 max-h-[85dvh] overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
                Oyun Ayarları &amp; Modlar
              </h3>
              <button
                type="button"
                onClick={() => setIsModesOpen(false)}
                className="w-8 h-8 rounded-full border inline-flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rakip Modu */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Rakip Modu
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {(
                  [
                    { id: 'single', label: 'Tek Başına', icon: <User className="w-3.5 h-3.5" /> },
                    { id: 'ai', label: 'Yapay Zekâ', icon: <Bot className="w-3.5 h-3.5" /> },
                    {
                      id: 'duel',
                      label: '2 Oyuncu',
                      icon: <Users className="w-3.5 h-3.5" />,
                      desktopOnly: true,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChangeConfig({ playerMode: item.id });
                      setIsModesOpen(false);
                    }}
                    className={`${
                      'desktopOnly' in item && item.desktopOnly ? 'hidden lg:inline-flex' : 'inline-flex'
                    } min-h-[40px] px-3 rounded-xl border text-xs font-bold items-center justify-center gap-1.5 cursor-pointer`}
                    style={{
                      backgroundColor:
                        playerMode === item.id
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface-soft)',
                      borderColor:
                        playerMode === item.id ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color:
                        playerMode === item.id
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-primary)',
                    }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tempo */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Tempo
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'calm', label: 'Sakin Mod (Süresiz)' },
                    { id: 'timed', label: 'Zaman Yarışı (Süreli)' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChangeConfig({ tempo: item.id });
                      setIsModesOpen(false);
                    }}
                    className="min-h-[40px] px-3 rounded-xl border text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor:
                        tempo === item.id ? 'var(--brand-accent-soft)' : 'var(--bg-surface-soft)',
                      borderColor: tempo === item.id ? '#D97706' : 'var(--border-subtle)',
                      color:
                        tempo === item.id ? 'var(--brand-accent-text)' : 'var(--text-primary)',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Kademe */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Kademe Değiştir
              </div>
              <div className="grid grid-cols-2 gap-2">
                {GAME_TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onChangeConfig({ tierId: t.id });
                      setIsModesOpen(false);
                    }}
                    className="p-2.5 rounded-xl border text-left cursor-pointer"
                    style={{
                      backgroundColor:
                        tierId === t.id ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
                      borderColor: tierId === t.id ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <div className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      Kademe {t.order}
                    </div>
                    <div className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {t.shortTitle}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
