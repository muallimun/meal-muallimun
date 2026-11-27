import React from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Flame,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import type { GameResultPayload, GameTierId } from './gameTypes';
import { GAME_DEFINITIONS, GAME_TIERS, formatClock, getNextTierId } from './gameTypes';
import { getSurahSpecialSummaryText } from './surahSpecialGroups';

interface GameSummaryOverlayProps {
  result: GameResultPayload;
  isNewRecord: boolean;
  onReplay: () => void;
  onNextTier: (nextTierId: GameTierId) => void;
  onExit: () => void;
}

export const GameSummaryOverlay: React.FC<GameSummaryOverlayProps> = ({
  result,
  isNewRecord,
  onReplay,
  onNextTier,
  onExit,
}) => {
  const gameMeta = GAME_DEFINITIONS.find((g) => g.id === result.gameId);
  const tierMeta = GAME_TIERS.find((t) => t.id === result.tierId);
  const nextTierId = getNextTierId(result.tierId);
  const nextTierMeta = nextTierId ? GAME_TIERS.find((t) => t.id === nextTierId) : null;

  const isVersus = result.playerMode === 'duel' && Boolean(result.duel);

  const versusHeadline = (() => {
    if (!result.duel) return '';
    if (result.duel.winner === 'p1') return `${result.duel.p1Label} Önde Tamamladı`;
    if (result.duel.winner === 'p2') return `${result.duel.p2Label} Önde Tamamladı`;
    return 'Dostça Beraberlik';
  })();

  const singleHeadline =
    result.stars === 3
      ? 'Üstün Başarı'
      : result.stars === 2
        ? 'Güzel İlerleme'
        : 'Tamamlandı';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 flex items-start sm:items-center justify-center">
      <div
        className="w-full max-w-2xl rounded-2xl border p-4 sm:p-6 space-y-5 game-pop"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          boxShadow: '0 16px 40px -16px rgba(15, 23, 42, 0.16)',
        }}
      >
        {/* Başlık ve Yıldızlar / Karşılaşma Sonucu */}
        <div className="text-center space-y-2.5">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            <span>{gameMeta?.title}</span>
            <span>·</span>
            <span>{tierMeta?.shortTitle}</span>
            {isNewRecord && result.playerMode !== 'duel' && (
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-bold"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                Yeni Rekor
              </span>
            )}
          </div>

          {isVersus && result.duel ? (
            <>
              <div
                className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor:
                    result.duel.winner === 'p2'
                      ? 'var(--brand-accent-soft)'
                      : 'var(--brand-primary-soft)',
                  color:
                    result.duel.winner === 'p2'
                      ? 'var(--brand-accent-text)'
                      : 'var(--brand-primary-text)',
                }}
              >
                <Users className="w-6 h-6" />
              </div>
              <h2
                className="text-xl sm:text-2xl font-extrabold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {versusHeadline}
              </h2>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 pt-1">
                {[1, 2, 3].map((n) => {
                  const earned = n <= result.stars;
                  return (
                    <div
                      key={n}
                      className="w-11 h-11 rounded-2xl flex items-center justify-center border"
                      style={{
                        backgroundColor: earned
                          ? 'var(--brand-accent-soft)'
                          : 'var(--bg-surface-soft)',
                        borderColor: earned
                          ? 'rgba(217, 119, 6, 0.32)'
                          : 'var(--border-subtle)',
                        color: earned ? '#D97706' : 'var(--text-muted)',
                      }}
                    >
                      <Star
                        className="w-6 h-6"
                        fill={earned ? 'currentColor' : 'none'}
                        strokeWidth={earned ? 1.8 : 1.5}
                      />
                    </div>
                  );
                })}
              </div>
              <h2
                className="text-xl sm:text-2xl font-extrabold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {singleHeadline}
              </h2>
            </>
          )}
        </div>

        {/* Karşılaşma Tablosu veya Tek Oyuncu Metrik Şeridi */}
        {isVersus && result.duel ? (
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-xl border-2 p-3.5 sm:p-4 text-center space-y-1"
              style={{
                backgroundColor:
                  result.duel.winner === 'p1'
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                borderColor:
                  result.duel.winner === 'p1' ? '#0D9488' : 'var(--border-subtle)',
              }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--brand-primary-text)' }}>
                {result.duel.p1Label}
              </div>
              <div
                className="text-3xl font-black tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {result.duel.p1Score}p
              </div>
              <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {result.duel.p1Correct} doğru hamle
              </div>
            </div>

            <div
              className="rounded-xl border-2 p-3.5 sm:p-4 text-center space-y-1"
              style={{
                backgroundColor:
                  result.duel.winner === 'p2'
                    ? 'var(--brand-accent-soft)'
                    : 'var(--bg-surface-soft)',
                borderColor:
                  result.duel.winner === 'p2' ? '#D97706' : 'var(--border-subtle)',
              }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--brand-accent-text)' }}>
                {result.duel.p2Label}
              </div>
              <div
                className="text-3xl font-black tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {result.duel.p2Score}p
              </div>
              <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {result.duel.p2Correct} doğru hamle
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div
              className="rounded-xl border p-3 text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                <Trophy className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary-text)' }} />
                <span>Puan</span>
              </div>
              <div className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {result.score}
              </div>
            </div>

            <div
              className="rounded-xl border p-3 text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                <Target className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary-text)' }} />
                <span>İsabet</span>
              </div>
              <div className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
                %{result.accuracyPct}
              </div>
            </div>

            <div
              className="rounded-xl border p-3 text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                <Flame className="w-3.5 h-3.5" style={{ color: '#D97706' }} />
                <span>En Yüksek Seri</span>
              </div>
              <div className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {result.maxCombo}x
              </div>
            </div>

            <div
              className="rounded-xl border p-3 text-center"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'rgba(13, 148, 136, 0.22)',
              }}
            >
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--brand-primary-text)' }}>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Kazanılan XP</span>
              </div>
              <div className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--brand-primary-text)' }}>
                +{result.earnedXp}
              </div>
            </div>
          </div>
        )}

        {/* Süre ve Kısa Özet Satırı */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          <span>Süre: {formatClock(result.durationSec)}</span>
          <span>·</span>
          <span>Doğru: {result.correctCount}</span>
          <span>·</span>
          <span>Hata: {result.mistakeCount}</span>
          <span>·</span>
          <span className="font-bold" style={{ color: 'var(--brand-primary-text)' }}>
            +{result.earnedXp} XP
          </span>
        </div>

        {/* Öğrendiklerimizi Pekiştirelim */}
        <div
          className="rounded-xl border p-3.5 sm:p-4 space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Öğrendiklerimizi Pekiştirelim
            </h3>
          </div>

          {result.mistakenSurahs.length === 0 ? (
            <div className="flex items-center gap-2 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Award className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              <span>Bu turda karıştırılan sure olmadı. Tüm sure künyelerini hatasız tamamladınız.</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {result.mistakenSurahs.map((surah) => {
                const specialSummary = getSurahSpecialSummaryText(surah.no);
                return (
                  <div
                    key={surah.no}
                    className="rounded-xl border px-3 py-2 flex flex-col gap-0.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="text-xs font-extrabold tabular-nums px-1.5 py-0.5 rounded-md shrink-0"
                          style={{
                            backgroundColor: 'var(--brand-primary-soft)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          {surah.no}.
                        </span>
                        <span
                          className="min-w-0 flex-1 text-sm font-bold leading-snug break-words"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {surah.nameTr}
                        </span>
                      </div>
                      <span
                        dir="rtl"
                        className="font-arabic text-base shrink-0"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {surah.nameAr}
                      </span>
                    </div>

                    <div
                      className="text-xs leading-snug flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {surah.ayahCount} ayet · {surah.type}
                      </span>
                      <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
                        ·
                      </span>
                      <span>
                        Anlamı:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>{surah.meaningTr}</strong>
                      </span>
                    </div>

                    {specialSummary && (
                      <div
                        className="text-[11px] font-medium"
                        style={{ color: 'var(--brand-accent-text)' }}
                      >
                        Özel Grup: {specialSummary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Eylem Butonları */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onExit}
            className="min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            Atölyeye Dön
          </button>

          <button
            type="button"
            onClick={onReplay}
            className="min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Tekrar Oyna</span>
          </button>

          {nextTierId && nextTierMeta && (
            <button
              type="button"
              onClick={() => onNextTier(nextTierId)}
              className="min-h-[44px] px-4 sm:px-5 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
              }}
            >
              <span>Sonraki Kademe: {nextTierMeta.shortTitle}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
