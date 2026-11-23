import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  ChevronUp,
  Clock,
  Compass,
  Flame,
  FolderKanban,
  Grid2x2,
  HelpCircle,
  Layers,
  Lightbulb,
  ListOrdered,
  Moon,
  PanelRightClose,
  PanelRightOpen,
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
import { previewAudioService } from '../../services/previewAudioService';
import { wakeLockService } from '../../services/wakeLockService';
import { useAppStore } from '../../store/useAppStore';
import type { ThemeMode } from '../../types/quran';
import type {
  EnrichedGameSurah,
  GameHudUpdate,
  GameId,
  GamePlayerMode,
  GamePlayerNames,
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
  playerNames?: GamePlayerNames;
  rawPlayerNames?: GamePlayerNames;
  focusGroupTitle?: string | null;
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
  onChangePlayerNames?: (names: GamePlayerNames) => void;
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
    case 'families':
      return <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5" />;
    case 'group_seq':
      return <ListOrdered className="w-4 h-4 sm:w-5 sm:h-5" />;
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
  playerNames,
  rawPlayerNames,
  focusGroupTitle,
  isMuted,
  isSummaryOpen,
  hud,
  allSurahsMap,
  onToggleMute,
  onRestart,
  onChangeConfig,
  onChangePlayerNames,
  onClose,
  children,
}) => {
  const { settings, updateSettings, audioPrefs, manifest, setIsGameArenaActive } = useAppStore();

  useEffect(() => {
    setIsGameArenaActive(true);
    wakeLockService.ensureLock();
    return () => {
      setIsGameArenaActive(false);
    };
  }, [setIsGameArenaActive]);

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isModesOpen, setIsModesOpen] = useState(false);
  const [isSidePanelHidden, setIsSidePanelHidden] = useState(false);
  const [isMobileNoteSheetOpen, setIsMobileNoteSheetOpen] = useState(false);

  const previewSnap = useSyncExternalStore(
    previewAudioService.subscribe,
    previewAudioService.getSnapshot,
  );

  const gameMeta = GAME_DEFINITIONS.find((g) => g.id === gameId) ?? GAME_DEFINITIONS[0];
  const tierMeta = GAME_TIERS.find((t) => t.id === tierId) ?? GAME_TIERS[0];

  const featuredSurah = hud.featuredSurah ?? null;
  const prevNeighbor = featuredSurah ? allSurahsMap.get(featuredSurah.no - 1) : undefined;
  const nextNeighbor = featuredSurah ? allSurahsMap.get(featuredSurah.no + 1) : undefined;

  const previewKey = featuredSurah ? `game_surah:${featuredSurah.no}` : null;
  const isAudioPlaying =
    previewKey !== null &&
    previewSnap.activeKey === previewKey &&
    previewSnap.status === 'playing';
  const isAudioLoading =
    previewKey !== null &&
    previewSnap.activeKey === previewKey &&
    previewSnap.status === 'loading';

  // Sure değiştiğinde veya bileşen kapandığında bu sahneye ait önizleme sesini temizle
  useEffect(() => {
    const activeKey = previewAudioService.getSnapshot().activeKey;
    if (activeKey && activeKey.startsWith('game_surah:') && activeKey !== previewKey) {
      previewAudioService.stop();
    }
  }, [previewKey]);

  useEffect(() => {
    return () => {
      const activeKey = previewAudioService.getSnapshot().activeKey;
      if (activeKey && activeKey.startsWith('game_surah:')) {
        previewAudioService.stop();
      }
    };
  }, []);

  const handleToggleListen = useCallback(() => {
    if (!featuredSurah || !previewKey) return;
    const reciter = findReciterById(audioPrefs.arabicReciterId, manifest);
    const urls = buildReciterAudioUrls(reciter, featuredSurah.no, 1);
    if (urls.length === 0) return;
    previewAudioService.toggle(previewKey, urls);
  }, [audioPrefs.arabicReciterId, featuredSurah, manifest, previewKey]);

  const handleCycleTheme = () => {
    const order: ThemeMode[] = ['light', 'cream', 'dark'];
    const idx = order.indexOf(settings.theme);
    const next = order[(idx + 1) % order.length];
    updateSettings({ theme: next });
  };

  const modeLabel = playerMode === 'duel' ? '2 Oyuncu' : 'Tek Oyuncu';
  const tempoLabel = tempo === 'timed' ? 'Zaman Yarışı' : 'Sakin Mod';
  const p1Name = playerNames?.p1?.trim() || '1. Oyuncu';
  const p2Name = playerNames?.p2?.trim() || '2. Oyuncu';
  const p1MobileTag = playerNames?.p1 && playerNames.p1.trim() !== '1. Oyuncu' ? playerNames.p1.trim() : '1.O';
  const p2MobileTag = playerNames?.p2 && playerNames.p2.trim() !== '2. Oyuncu' ? playerNames.p2.trim() : '2.O';
  const formatPlayerText = (text?: string) => {
    if (!text) return '';
    return text.replace(/1\. Oyuncu/g, p1Name).replace(/2\. Oyuncu/g, p2Name);
  };

  // Dairesel SVG geri sayım halkası hesabı (kompakt konsol için)
  const hasTurnRing =
    typeof hud.turnRemainingSec === 'number' &&
    typeof hud.turnDurationSec === 'number' &&
    hud.turnDurationSec > 0;
  const ringRadius = 15;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringRatio = hasTurnRing
    ? Math.max(0, Math.min(1, (hud.turnRemainingSec ?? 0) / (hud.turnDurationSec ?? 1)))
    : 1;
  const ringDashOffset = ringCircumference * (1 - ringRatio);
  const ringUrgent = hasTurnRing && (hud.turnRemainingSec ?? 99) <= 5;

  // Tek Oyuncu canlı yıldız hedefi göstergesi
  const liveStarPreview = hud.p1Score >= 70 ? 3 : hud.p1Score >= 35 ? 2 : hud.p1Score > 0 ? 1 : 0;

  const renderInfoNoteBody = (compact?: boolean) => {
    if (!featuredSurah) {
      return (
        <div className="space-y-3">
          {hud.roundContextTitle && (
            <div
              className="text-base font-extrabold leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              {hud.roundContextTitle}
            </div>
          )}
          <p
            className="text-sm xl:text-[15px] leading-relaxed font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {hud.roundContextHint || tierMeta.tipText}
          </p>
          <div
            className="rounded-xl border p-3 text-xs sm:text-[13.5px] leading-relaxed font-medium"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            İlk doğru hamlenizde ilgili surenin Arapça adı, Türkçe anlamı, komşu sureleri ve 1. ayet tilaveti burada açılır.
          </div>
        </div>
      );
    }

    const specialSummary = getSurahSpecialSummaryText(featuredSurah.no);

    return (
      <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
        {/* Sure Başlığı ve Anlamı (Yüksek Okunabilirlik) */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="px-2 py-0.5 rounded-md text-xs font-extrabold tabular-nums"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                {featuredSurah.no}. Sure
              </span>
              <span
                className="text-[17px] xl:text-[18px] font-extrabold leading-tight break-words"
                style={{ color: 'var(--text-primary)' }}
              >
                {featuredSurah.nameTr}
              </span>
            </div>
            <div
              className="text-sm xl:text-[15px] font-semibold leading-snug"
              style={{ color: 'var(--text-secondary)' }}
            >
              Anlamı: “{featuredSurah.meaningTr}”
            </div>
          </div>

          <span
            dir="rtl"
            lang="ar"
            className="font-arabic text-[24px] xl:text-[28px] leading-none shrink-0 pt-0.5"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            {featuredSurah.nameAr}
          </span>
        </div>

        {hud.featuredNote && (
          <div
            className="text-[13.5px] xl:text-sm font-bold leading-snug px-3 py-2 rounded-xl"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              color: 'var(--brand-accent-text)',
            }}
          >
            {formatPlayerText(hud.featuredNote)}
          </div>
        )}

        {/* Vurgulu KÜNYE & ÖZELLİK Kutusu */}
        <div
          className="rounded-xl border p-3 space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className="text-xs font-extrabold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            KÜNYE &amp; ÖZELLİK
          </div>

          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm xl:text-[15px] font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            <span>{featuredSurah.ayahCount} Ayet</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>{featuredSurah.type}</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>Nüzul: {featuredSurah.nuzulOrder}.</span>
          </div>

          {/* Komşu Sureler */}
          <div
            className="text-sm xl:text-[14.5px] leading-snug"
            style={{ color: 'var(--text-secondary)' }}
          >
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
              className="text-[13.5px] xl:text-sm font-bold pt-2 border-t leading-snug"
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
      onPointerDown={() => wakeLockService.ensureLock()}
      onClick={() => wakeLockService.ensureLock()}
      className="fixed inset-0 z-[70] w-full h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col"
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
                lang="ar"
                className="font-arabic text-xl font-bold leading-none shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {gameMeta.arabicTitle}
              </span>
            </div>
            <div className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>
              {focusGroupTitle ? `Odak: ${focusGroupTitle}` : tierMeta.title} · {modeLabel} · {tempoLabel}
            </div>
          </div>
        </div>

        {/* Sağ: Yuvarlak İkon Butonlar + Yan Panel Gizle/Göster + Hap Aksiyon Butonları */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Akıllı Tahta Tam Ekran Modu: Yan Paneli Gizle / Göster (Sadece lg+) */}
          {!isSummaryOpen && (
            <button
              type="button"
              onClick={() => setIsSidePanelHidden((prev) => !prev)}
              title={isSidePanelHidden ? 'Yan Paneli Göster' : 'Yan Paneli Gizle (Tam Genişlik Masa)'}
              aria-label={isSidePanelHidden ? 'Yan Paneli Göster' : 'Yan Paneli Gizle'}
              aria-pressed={isSidePanelHidden}
              className="w-9 h-9 rounded-full border inline-flex items-center justify-center cursor-pointer transition-colors"
              style={{
                backgroundColor: isSidePanelHidden
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: isSidePanelHidden
                  ? 'var(--brand-primary)'
                  : 'var(--border-subtle)',
                color: isSidePanelHidden
                  ? 'var(--brand-primary-text)'
                  : 'var(--text-secondary)',
              }}
            >
              {isSidePanelHidden ? (
                <PanelRightOpen className="w-4 h-4" />
              ) : (
                <PanelRightClose className="w-4 h-4" />
              )}
            </button>
          )}

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
      {/* MOBİL (< lg) İNCE ÜST BAR (h-11) + KOMPAKT SKOR ŞERİDİ (h-9)      */}
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
              className="text-[11px] font-medium truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {focusGroupTitle || tierMeta.shortTitle}
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

      {/* Mobil Tek Satır Kompakt Skor · Seri · Süre · Tur Şeridi (h-9) */}
      {!isSummaryOpen && (
        <div
          className="flex lg:hidden shrink-0 h-9 px-2 border-b items-center justify-between gap-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Sol: Skorlar */}
          {playerMode === 'single' ? (
            <div className="flex items-center gap-1.5 min-w-0">
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
            <div className="flex items-center gap-1 min-w-0">
              <span
                className="px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums border inline-flex items-center gap-1 max-w-[116px]"
                style={{
                  backgroundColor:
                    hud.activeTurn === 'p1' ? 'rgba(13, 148, 136, 0.14)' : 'var(--bg-surface)',
                  borderColor:
                    hud.activeTurn === 'p1' ? '#0D9488' : 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="truncate">{p1MobileTag}:</span>
                <span className="shrink-0">{hud.p1Score}p</span>
              </span>
              <span
                className="px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums border inline-flex items-center gap-1 max-w-[116px]"
                style={{
                  backgroundColor:
                    hud.activeTurn === 'p2' ? 'rgba(217, 119, 6, 0.14)' : 'var(--bg-surface)',
                  borderColor:
                    hud.activeTurn === 'p2' ? '#D97706' : 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="truncate">{p2MobileTag}:</span>
                <span className="shrink-0">{hud.p2Score}p</span>
              </span>
            </div>
          )}

          {/* Orta: Sayaç */}
          <div
            className="px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums inline-flex items-center gap-1 border shrink-0"
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

          {/* Sağ: Tur / İlerleme */}
          <span
            className="text-[11px] font-extrabold tabular-nums shrink-0"
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
        <div
          className={`flex-1 min-h-0 grid grid-cols-1 ${
            isSidePanelHidden
              ? 'lg:grid-cols-1 gap-0'
              : 'lg:grid-cols-[1fr_272px] xl:grid-cols-[1fr_290px] gap-0 lg:gap-3.5'
          } p-2 lg:p-3.5 overflow-hidden`}
        >
          {/* SOL SÜTUN — Zümrüt Çuha Oyun Masası (Mobilde yumuşak dikey kaydırma emniyeti) */}
          <section className="game-emerald-table rounded-2xl p-2.5 sm:p-3 lg:p-4 flex flex-col min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden relative">
            {children}
          </section>

          {/* SAĞ SÜTUN (Masaüstü lg+) — Daraltılmış Birleşik Konsol + Geniş Bilgi Notu */}
          {!isSidePanelHidden && (
            <aside className="hidden lg:flex flex-col gap-3 min-h-0 overflow-hidden">
              {/* A) BİRLEŞİK SKOR, SÜRE & TUR KONSOLU */}
              <div
                className="shrink-0 rounded-2xl border p-3 space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {playerMode === 'single' ? (
                  /* Tek Oyuncu Kompakt Üst Satır */
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: '#0F766E' }}
                      >
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div
                          className="text-xs font-extrabold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Tek Oyuncu
                        </div>
                        <div className="flex items-center gap-0.5 mt-0.5" aria-label="Yıldız hedefi">
                          {[1, 2, 3].map((n) => (
                            <Star
                              key={n}
                              className="w-3.5 h-3.5"
                              style={{
                                color: n <= liveStarPreview ? '#D97706' : 'var(--border-strong)',
                              }}
                              fill={n <= liveStarPreview ? 'currentColor' : 'none'}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className="text-2xl font-black tabular-nums leading-none"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {hud.p1Score}p
                      </div>
                      <div
                        className="text-[11px] font-bold inline-flex items-center gap-0.5 mt-0.5"
                        style={{ color: '#D97706' }}
                      >
                        <Flame className="w-3 h-3" />
                        <span>Seri {hud.combo}x</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 2 Oyuncu Kompakt Yan Yana Skor Şeridi */
                  <div className="grid grid-cols-2 gap-1.5">
                    <div
                      className="rounded-xl border-2 px-2.5 py-2 transition-all"
                      style={{
                        backgroundColor:
                          hud.activeTurn === 'p1'
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                        borderColor:
                          hud.activeTurn === 'p1' ? '#0D9488' : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className="text-[11px] font-extrabold truncate"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {p1Name}
                        </span>
                        <User className="w-3 h-3 shrink-0" style={{ color: '#0F766E' }} />
                      </div>
                      <div
                        className="text-lg font-black tabular-nums leading-tight mt-0.5"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {hud.p1Score}p
                      </div>
                      <div
                        className="text-[10px] font-bold"
                        style={{
                          color:
                            hud.activeTurn === 'p1' || hud.activeTurn === 'both'
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

                    <div
                      className="rounded-xl border-2 px-2.5 py-2 transition-all"
                      style={{
                        backgroundColor:
                          hud.activeTurn === 'p2'
                            ? 'var(--brand-accent-soft)'
                            : 'var(--bg-surface-soft)',
                        borderColor:
                          hud.activeTurn === 'p2' ? '#D97706' : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className="text-[11px] font-extrabold truncate"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          {p2Name}
                        </span>
                        <Users className="w-3 h-3 shrink-0" style={{ color: '#D97706' }} />
                      </div>
                      <div
                        className="text-lg font-black tabular-nums leading-tight mt-0.5"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {hud.p2Score}p
                      </div>
                      <div
                        className="text-[10px] font-bold"
                        style={{
                          color:
                            hud.activeTurn === 'p2' || hud.activeTurn === 'both'
                              ? 'var(--brand-accent-text)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {hud.activeTurn === 'p2'
                          ? 'Sırada'
                          : hud.activeTurn === 'both'
                            ? 'Yarışıyor'
                            : 'Bekliyor'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Kompakt Süre + Tur/Hamle Şeridi (İsteğe bağlı dairesel tur halkası dahil) */}
                <div
                  className="flex items-center gap-2 pt-2 border-t"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {hasTurnRing && (
                    <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
                      <svg className="w-9 h-9 -rotate-90" viewBox="0 0 38 38" aria-hidden="true">
                        <circle
                          cx="19"
                          cy="19"
                          r={ringRadius}
                          fill="none"
                          stroke="var(--border-subtle)"
                          strokeWidth="3.5"
                        />
                        <circle
                          cx="19"
                          cy="19"
                          r={ringRadius}
                          fill="none"
                          stroke={ringUrgent ? '#DC2626' : '#0D9488'}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringDashOffset}
                          style={{ transition: 'stroke-dashoffset 280ms linear' }}
                        />
                      </svg>
                      <span
                        className="absolute text-[10px] font-extrabold tabular-nums"
                        style={{ color: ringUrgent ? '#DC2626' : 'var(--text-primary)' }}
                      >
                        {hud.turnRemainingSec}s
                      </span>
                    </div>
                  )}

                  <div className="flex-1 grid grid-cols-2 gap-1.5 min-w-0">
                    <div
                      className="rounded-lg border px-2 py-1"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div
                        className="text-[11px] font-semibold inline-flex items-center gap-1 leading-none"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Clock className="w-3 h-3" />
                        <span>Süre</span>
                      </div>
                      <div
                        className="text-sm font-extrabold tabular-nums mt-0.5 leading-tight"
                        style={{ color: hud.timerUrgent ? '#DC2626' : 'var(--text-primary)' }}
                      >
                        {hud.timerText || formatClock(hud.elapsedSec)}
                      </div>
                    </div>

                    <div
                      className="rounded-lg border px-2 py-1"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div
                        className="text-[11px] font-semibold inline-flex items-center gap-1 leading-none"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Shuffle className="w-3 h-3" />
                        <span>Tur</span>
                      </div>
                      <div
                        className="text-sm font-extrabold tabular-nums truncate mt-0.5 leading-tight"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {hud.progressLabel || `${hud.movesCount} Hamle`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Yüksek Kontrastlı Yönlendirme Şeridi (13.5px–14px) */}
                <div
                  className="rounded-xl px-3 py-2 text-[13.5px] xl:text-sm font-bold leading-snug"
                  style={{
                    backgroundColor:
                      hud.activeTurn === 'p2'
                        ? 'var(--brand-accent-soft)'
                        : 'var(--brand-primary-soft)',
                    color:
                      hud.activeTurn === 'p2'
                        ? 'var(--brand-accent-text)'
                        : 'var(--brand-primary-text)',
                  }}
                >
                  {formatPlayerText(hud.statusMessage)}
                </div>
              </div>

              {/* B) GENİŞLETİLMİŞ CANLI "💡 Bilgi Notu" & "🔊 Dinle" ÖĞRENME KARTI */}
              <div
                className="flex-1 min-h-0 rounded-2xl border p-3.5 flex flex-col gap-3 overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="shrink-0 flex items-center justify-between gap-2">
                  <div
                    className="inline-flex items-center gap-1.5 text-sm font-extrabold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Lightbulb className="w-4 h-4 shrink-0" style={{ color: '#D97706' }} />
                    <span>Bilgi Notu</span>
                  </div>

                  {featuredSurah && (
                    <button
                      type="button"
                      onClick={handleToggleListen}
                      className="h-8 px-3 rounded-full text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90 shrink-0"
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
                          <span>{isAudioLoading ? 'Yükleniyor...' : 'Dinle'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-0.5">
                  {renderInfoNoteBody(false)}
                </div>
              </div>
            </aside>
          )}
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
                : hud.roundContextTitle || formatPlayerText(hud.statusMessage)}
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {featuredSurah && (
              <button
                type="button"
                onClick={handleToggleListen}
                className="h-7 px-2.5 rounded-full text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
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
                <span>{isAudioPlaying ? 'Dur' : isAudioLoading ? '...' : 'Dinle'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMobileNoteSheetOpen(true)}
              className="h-7 px-2 rounded-lg border text-xs font-bold inline-flex items-center gap-0.5 cursor-pointer"
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
              <div
                className="inline-flex items-center gap-1.5 text-base font-extrabold"
                style={{ color: 'var(--text-primary)' }}
              >
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
                    <span>
                      {isAudioPlaying
                        ? 'Durdur'
                        : isAudioLoading
                          ? 'Yükleniyor...'
                          : '1. Ayeti Dinle'}
                    </span>
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
              className="rounded-xl border p-3 text-xs space-y-1.5"
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

      {/* "Modlar" Hızlı Kademe / Oyuncu / Tempo Değiştirici Modalı */}
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

            {/* Oyuncu Modu */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Oyuncu Modu
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'single', label: 'Tek Oyuncu', icon: <User className="w-3.5 h-3.5" /> },
                    { id: 'duel', label: '2 Oyuncu', icon: <Users className="w-3.5 h-3.5" /> },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChangeConfig({ playerMode: item.id });
                      setIsModesOpen(false);
                    }}
                    className="inline-flex min-h-[42px] px-3 rounded-xl border text-xs font-bold items-center justify-center gap-1.5 cursor-pointer"
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
              {playerMode === 'duel' && onChangePlayerNames && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5">
                  <input
                    type="text"
                    maxLength={20}
                    value={rawPlayerNames?.p1 ?? ''}
                    onChange={(e) =>
                      onChangePlayerNames({
                        p1: e.target.value,
                        p2: rawPlayerNames?.p2 ?? '',
                      })
                    }
                    placeholder="1. Oyuncu (isteğe bağlı)"
                    aria-label="1. Oyuncu adı"
                    className="w-full min-h-[38px] px-3 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-teal-500/35"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <input
                    type="text"
                    maxLength={20}
                    value={rawPlayerNames?.p2 ?? ''}
                    onChange={(e) =>
                      onChangePlayerNames({
                        p1: rawPlayerNames?.p1 ?? '',
                        p2: e.target.value,
                      })
                    }
                    placeholder="2. Oyuncu (isteğe bağlı)"
                    aria-label="2. Oyuncu adı"
                    className="w-full min-h-[38px] px-3 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-500/35"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}
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
                    className="min-h-[42px] px-3 rounded-xl border text-xs font-bold cursor-pointer"
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
                    <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
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
