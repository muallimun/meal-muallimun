import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Bot,
  Clock,
  Compass,
  FolderKanban,
  Grid2x2,
  Layers,
  ListOrdered,
  Play,
  Search,
  Sparkles,
  Star,
  User,
  Users,
  Zap,
} from 'lucide-react';
import { audioQueueService } from '../../services/audioQueueService';
import { dataService } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { SurahExtraInfo } from '../../types/fihrist';
import type { GameProgressMap } from './gameProgressStorage';
import {
  getTierEarnedStars,
  getTotalEarnedGameStars,
  loadGameProgress,
  makeGameProgressKey,
} from './gameProgressStorage';
import { GameStageModal } from './GameStageModal';
import type {
  GameId,
  GamePlayerMode,
  GameTempo,
  GameTierId,
} from './gameTypes';
import {
  GAME_DEFINITIONS,
  GAME_TIERS,
  buildEnrichedGameSurahs,
} from './gameTypes';
import { SurahGroupsAtlasModal } from './SurahGroupsAtlasModal';
import type { SurahGroupId } from './surahSpecialGroups';

const MAX_TIER_STARS = GAME_DEFINITIONS.length * 3; // 21 yıldız / kademe
const MAX_TOTAL_STARS = GAME_TIERS.length * MAX_TIER_STARS; // 126 yıldız toplam

export const GamesHubTab: React.FC = () => {
  const { meta, poolStats } = useAppStore();

  const [extrasMap, setExtrasMap] = useState<Map<number, SurahExtraInfo>>(() => new Map());
  const [isLoadingExtras, setIsLoadingExtras] = useState<boolean>(true);
  const [selectedTier, setSelectedTier] = useState<GameTierId>('kademe_1');
  const [tempo, setTempo] = useState<GameTempo>('calm');
  // Varsayılan önerilen mod: Yapay Zekâya Karşı (hem mobil hem masaüstünde aktif)
  const [playerMode, setPlayerMode] = useState<GamePlayerMode>('ai');
  const [progressMap, setProgressMap] = useState<GameProgressMap>(() => loadGameProgress());
  const [activeGameId, setActiveGameId] = useState<GameId | null>(null);
  const [activeFocusGroupId, setActiveFocusGroupId] = useState<SurahGroupId | null>(null);
  const [isAtlasOpen, setIsAtlasOpen] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    dataService
      .getSurahInfoExtrasMap()
      .then((map) => {
        if (alive) {
          setExtrasMap(map);
          setIsLoadingExtras(false);
        }
      })
      .catch(() => {
        if (alive) setIsLoadingExtras(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024) {
        setPlayerMode((prev) => (prev === 'duel' ? 'ai' : prev));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const enrichedSurahs = useMemo(() => {
    if (!meta?.surahs) return [];
    return buildEnrichedGameSurahs(meta.surahs, extrasMap);
  }, [extrasMap, meta?.surahs]);

  const totalEarnedStars = useMemo(() => getTotalEarnedGameStars(progressMap), [progressMap]);
  const activeTierMeta = GAME_TIERS.find((t) => t.id === selectedTier) ?? GAME_TIERS[0];

  const handleLaunchGame = (gameId: GameId, focusGroupId: SurahGroupId | null = null) => {
    if (enrichedSurahs.length === 0) return;
    sfxService.play('click');
    audioQueueService.pause();
    const effectiveMode: GamePlayerMode =
      typeof window !== 'undefined' && window.innerWidth < 1024 && playerMode === 'duel'
        ? 'ai'
        : playerMode;
    setPlayerMode(effectiveMode);
    setActiveFocusGroupId(focusGroupId);
    setActiveGameId(gameId);
  };

  const handleLaunchFromAtlas = (
    groupId: SurahGroupId,
    targetGameId: Extract<GameId, 'families' | 'group_seq'>,
  ) => {
    setIsAtlasOpen(false);
    setSelectedTier('kademe_4');
    handleLaunchGame(targetGameId, groupId);
  };

  const renderGameIcon = (id: GameId) => {
    switch (id) {
      case 'memory':
        return <Grid2x2 className="w-5 h-5" />;
      case 'chain':
        return <Layers className="w-5 h-5" />;
      case 'speed':
        return <Zap className="w-5 h-5" />;
      case 'compass':
        return <Compass className="w-5 h-5" />;
      case 'families':
        return <FolderKanban className="w-5 h-5" />;
      case 'group_seq':
        return <ListOrdered className="w-5 h-5" />;
      case 'detective':
      default:
        return <Search className="w-5 h-5" />;
    }
  };

  const renderGameAccent = (id: GameId) => {
    if (id === 'chain' || id === 'compass' || id === 'group_seq') {
      return {
        soft: 'var(--brand-accent-soft)',
        text: 'var(--brand-accent-text)',
        border: 'rgba(217, 119, 6, 0.25)',
      };
    }
    return {
      soft: 'var(--brand-primary-soft)',
      text: 'var(--brand-primary-text)',
      border: 'rgba(13, 148, 136, 0.24)',
    };
  };

  const launchCtaText =
    playerMode === 'ai'
      ? 'Yapay Zekâya Karşı Oyna'
      : playerMode === 'duel'
        ? '2 Oyunculu Başlat'
        : 'Tek Başına Oyna';

  return (
    <div className="space-y-5">
      {/* Üst Başlık, Atlas Butonu ve İlerleme Özeti */}
      <section
        className="rounded-2xl border p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--brand-primary-text)' }}>
            <Compass className="w-4 h-4" />
            <span>Kur’ân &amp; Mushaf Eğitsel Oyunlar Atölyesi</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            7 Zümrüt Masa Oyunu ile Sureleri Uygulayarak Pekiştirin
          </h2>
          <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            Tek başına, Yapay Zekâya karşı veya Akıllı Tahtada 2 oyunculu — 15 özel sure grubu, canlı Bilgi Notu ve tilavet desteğiyle.
          </p>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          <button
            type="button"
            disabled={isLoadingExtras || enrichedSurahs.length === 0}
            onClick={() => {
              sfxService.play('click');
              setIsAtlasOpen(true);
            }}
            className="min-h-[46px] px-3.5 py-2 rounded-xl border text-xs sm:text-[13px] font-extrabold inline-flex items-center gap-2 cursor-pointer transition-colors hover:opacity-95 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'rgba(217, 119, 6, 0.34)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Sure Grupları Atlası (15 Aile)</span>
          </button>

          <div
            className="rounded-xl border px-3.5 py-2 flex items-center gap-2.5"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: '#D97706',
              }}
            >
              <Star className="w-4 h-4" fill="currentColor" />
            </div>
            <div>
              <div className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Atölye Yıldızları
              </div>
              <div className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {totalEarnedStars} / {MAX_TOTAL_STARS}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1. Kademe Seçici (6 Kademeli Seviye Haritası) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            1. Kademe Seçin
          </h3>
          <span className="text-xs font-semibold" style={{ color: 'var(--brand-primary-text)' }}>
            Seçili: {activeTierMeta.title}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
          {GAME_TIERS.map((tier) => {
            const isSelected = selectedTier === tier.id;
            const earned = getTierEarnedStars(progressMap, tier.id);
            const countText = tier.isActivePool
              ? `${poolStats.effectiveSurahs.length} Sure`
              : tier.surahCountLabel;

            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSelectedTier(tier.id);
                }}
                className="rounded-2xl border p-3 sm:p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between gap-2"
                style={{
                  backgroundColor: isSelected ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                  borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  boxShadow: isSelected
                    ? '0 0 0 1px var(--brand-primary)'
                    : '0 1px 2px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className="text-[10px] sm:text-[11px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--brand-primary)'
                          : 'var(--bg-surface-soft)',
                        color: isSelected ? '#FFFFFF' : 'var(--text-muted)',
                      }}
                    >
                      Kademe {tier.order}
                    </span>
                    <span
                      className="text-[11px] font-bold tabular-nums inline-flex items-center gap-0.5"
                      style={{
                        color: earned > 0 ? '#D97706' : 'var(--text-muted)',
                      }}
                    >
                      <Star className="w-3 h-3" fill={earned > 0 ? 'currentColor' : 'none'} />
                      <span>
                        {earned}/{MAX_TIER_STARS}
                      </span>
                    </span>
                  </div>

                  <div
                    className="text-xs sm:text-sm font-extrabold leading-snug"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {tier.title}
                  </div>
                  <p
                    className="text-[11px] sm:text-xs leading-snug line-clamp-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {tier.subtitle}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span
                    className="text-[10px] sm:text-[11px] font-semibold"
                    style={{
                      color: tier.isSpecialGroups
                        ? 'var(--brand-accent-text)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {countText}
                  </span>
                  {tier.isSpecialGroups && (
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand-accent-text)' }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Üçlü Rakip Sistemi & Tempo Seçimi */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
        {/* 3'lü Rakip Seçici: Tek Başına | Yapay Zekâya Karşı | 2 Oyuncu (Akıllı Tahta) */}
        <div
          className="grid grid-cols-2 lg:inline-flex p-1 rounded-xl border gap-1"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setPlayerMode('single');
            }}
            className="min-h-[38px] px-3 sm:px-3.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: playerMode === 'single' ? 'var(--bg-surface)' : 'transparent',
              color:
                playerMode === 'single' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              boxShadow: playerMode === 'single' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Tek Başına</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setPlayerMode('ai');
            }}
            className="min-h-[38px] px-3 sm:px-3.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: playerMode === 'ai' ? 'var(--bg-surface)' : 'transparent',
              color: playerMode === 'ai' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              boxShadow: playerMode === 'ai' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span>Yapay Zekâya Karşı</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setPlayerMode('duel');
            }}
            className="hidden lg:inline-flex min-h-[38px] px-3.5 rounded-lg text-xs font-bold items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: playerMode === 'duel' ? 'var(--bg-surface)' : 'transparent',
              color: playerMode === 'duel' ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
              boxShadow: playerMode === 'duel' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>2 Oyuncu (Akıllı Tahta)</span>
          </button>
        </div>

        {/* Tempo Seçimi */}
        <div
          className="grid grid-cols-2 sm:inline-flex p-1 rounded-xl border gap-1"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setTempo('calm');
            }}
            className="min-h-[38px] px-3 sm:px-4 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: tempo === 'calm' ? 'var(--bg-surface)' : 'transparent',
              color: tempo === 'calm' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              boxShadow: tempo === 'calm' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Sakin Mod (Süresiz)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setTempo('timed');
            }}
            className="min-h-[38px] px-3 sm:px-4 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: tempo === 'timed' ? 'var(--bg-surface)' : 'transparent',
              color: tempo === 'timed' ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
              boxShadow: tempo === 'timed' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Zaman Yarışı (Süreli)</span>
          </button>
        </div>
      </section>

      {/* 3. 7 Oyun Kartı (Aşama 1 + Aşama 2 + Aşama 3) */}
      <section className="space-y-2.5">
        <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider px-0.5" style={{ color: 'var(--text-muted)' }}>
          2. Oyun Seçin ve Masaya Geçin
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {GAME_DEFINITIONS.map((game) => {
            const accent = renderGameAccent(game.id);
            const record = progressMap[makeGameProgressKey(game.id, selectedTier)];
            const earnedStars = record?.bestStars ?? 0;

            return (
              <div
                key={game.id}
                className="rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  boxShadow: '0 2px 10px -4px rgba(15, 23, 42, 0.06)',
                }}
              >
                <div className="space-y-3">
                  {/* Üst İkon & Yıldız Durumu */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: accent.soft,
                          borderColor: accent.border,
                          color: accent.text,
                        }}
                      >
                        {renderGameIcon(game.id)}
                      </div>
                      {game.stageTag && (
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider"
                          style={{
                            backgroundColor: 'var(--brand-accent-soft)',
                            color: 'var(--brand-accent-text)',
                          }}
                        >
                          {game.stageTag}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 pt-1" aria-label={`${earnedStars} yıldız`}>
                      {[1, 2, 3].map((n) => (
                        <Star
                          key={n}
                          className="w-4 h-4"
                          style={{
                            color: n <= earnedStars ? '#D97706' : 'var(--border-strong)',
                          }}
                          fill={n <= earnedStars ? 'currentColor' : 'none'}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Başlık, Arapça Alt Başlık & Açıklama */}
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4
                        className="text-base font-extrabold tracking-tight"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {game.title}
                      </h4>
                      <span
                        dir="rtl"
                        className="font-arabic text-sm font-semibold shrink-0"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {game.arabicTitle}
                      </span>
                    </div>
                    <p
                      className="text-xs sm:text-[13px] leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {game.subtitle}
                    </p>
                  </div>

                  {/* Odak & Kayıt Bilgisi */}
                  <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <div>Odak: {game.focusLabel}</div>
                    {playerMode === 'duel' && (
                      <div className="font-semibold" style={{ color: 'var(--brand-accent-text)' }}>
                        2 Oyuncu: {game.duelLabel}
                      </div>
                    )}
                    {record && (
                      <div className="tabular-nums font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        En iyi skor: {record.highScore} · İsabet %{record.bestAccuracyPct}
                      </div>
                    )}
                  </div>
                </div>

                {/* Oyna Butonu */}
                <button
                  type="button"
                  disabled={isLoadingExtras || enrichedSurahs.length === 0}
                  onClick={() => handleLaunchGame(game.id)}
                  className="w-full min-h-[44px] rounded-xl text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer transition-opacity hover:opacity-95 disabled:opacity-50"
                  style={{
                    backgroundColor: '#0F766E',
                    color: '#FFFFFF',
                  }}
                >
                  <Play className="w-4 h-4" fill="currentColor" />
                  <span>{launchCtaText}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Görsel Sure Grupları Atlası (15 Aile) */}
      {isAtlasOpen && enrichedSurahs.length > 0 && (
        <SurahGroupsAtlasModal
          allSurahs={enrichedSurahs}
          onPlayWithGroup={handleLaunchFromAtlas}
          onClose={() => setIsAtlasOpen(false)}
        />
      )}

      {/* Zümrüt Masa Tam Ekran Oyun Sahnesi */}
      {activeGameId && enrichedSurahs.length > 0 && (
        <GameStageModal
          gameId={activeGameId}
          initialTierId={selectedTier}
          initialTempo={tempo}
          initialPlayerMode={playerMode}
          focusGroupId={activeFocusGroupId}
          allSurahs={enrichedSurahs}
          activePoolSurahNos={poolStats.effectiveSurahs}
          onProgressUpdated={(nextMap) => setProgressMap(nextMap)}
          onConfigSynced={(patch) => {
            if (patch.tierId) setSelectedTier(patch.tierId);
            if (patch.tempo) setTempo(patch.tempo);
            if (patch.playerMode) setPlayerMode(patch.playerMode);
          }}
          onClose={() => {
            setActiveGameId(null);
            setActiveFocusGroupId(null);
          }}
        />
      )}
    </div>
  );
};
