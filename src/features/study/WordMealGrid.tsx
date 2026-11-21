import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Eye, EyeOff, Loader2, Volume2 } from 'lucide-react';
import { sfxService } from '../../services/sfxService';
import { buildWordAudioKey, wordAudioService } from '../../services/wordAudioService';
import type { WordMealMode, WordPair } from '../../types/quran';
import { mapQulWordIndexToDisplay } from '../../utils/wordSyncUtils';
import { useActiveWordSync } from './SyncedArabicText';

interface WordMealGridProps {
  ayahId: number;
  surah?: number;
  ayah?: number;
  words: WordPair[];
  wordMode: Exclude<WordMealMode, 'off'>;
  arabicFontSize?: number;
  isPlayingThisAyah?: boolean;
  wordSyncEnabled?: boolean;
}

export const WordMealGrid: React.FC<WordMealGridProps> = ({
  ayahId,
  surah,
  ayah,
  words,
  wordMode,
  arabicFontSize = 24,
  isPlayingThisAyah = false,
  wordSyncEnabled = true,
}) => {
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());

  const wordAudioState = useSyncExternalStore(
    wordAudioService.subscribe,
    wordAudioService.getSnapshot,
  );

  const shouldTrackSync = Boolean(isPlayingThisAyah && wordSyncEnabled && surah && ayah);
  const sync = useActiveWordSync(shouldTrackSync);

  // Ayet veya mod değiştiğinde gizli durumları sıfırla
  useEffect(() => {
    setRevealedIndices(new Set());
  }, [ayahId, wordMode]);

  if (!words || words.length === 0) {
    return (
      <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
        Bu ayet için kelime-kelime veri bulunmuyor.
      </p>
    );
  }

  const isQuiz = wordMode === 'quiz';
  const allRevealed = isQuiz && revealedIndices.size === words.length;
  const canPlayWordAudio = typeof surah === 'number' && typeof ayah === 'number';

  const syncedDisplayWordIdx =
    shouldTrackSync &&
    sync.phase === 'ar' &&
    sync.surah === surah &&
    sync.ayah === ayah &&
    sync.activeWordIndex !== null
      ? mapQulWordIndexToDisplay(sync.activeWordIndex, sync.qulWordCount, words.length)
      : null;

  const toggleWord = (idx: number) => {
    if (!isQuiz) return;
    sfxService.play('click');
    setRevealedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handlePlayWord = (idx: number) => {
    if (!canPlayWordAudio) return;
    wordAudioService.playWordAudio(surah!, ayah!, idx + 1, words.length);
  };

  const handleToggleAll = () => {
    sfxService.play('click');
    if (allRevealed) {
      setRevealedIndices(new Set());
    } else {
      setRevealedIndices(new Set(words.map((_, idx) => idx)));
    }
  };

  const wordArabicSize = Math.max(18, Math.min(30, Math.round(arabicFontSize * 0.8)));

  return (
    <div className="space-y-2.5">
      {isQuiz ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>
            Kendini Dene: Anlam için karta, telaffuz için 🔊 simgesine dokun ({revealedIndices.size}/
            {words.length})
          </span>
          <button
            type="button"
            onClick={handleToggleAll}
            className="min-h-[32px] px-2.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--brand-primary-text)',
            }}
          >
            {allRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{allRevealed ? 'Tümünü Gizle' : 'Tümünü Göster'}</span>
          </button>
        </div>
      ) : (
        canPlayWordAudio && (
          <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <Volume2 className="w-3 h-3 shrink-0 opacity-75" />
            <span>Telaffuzunu dinlemek için herhangi bir kelimeye dokunun.</span>
          </p>
        )
      )}

      <div className="flex flex-wrap gap-2" dir="rtl">
        {words.map(([arWord, trMeaning], idx) => {
          const wordIndex1Based = idx + 1;
          const isRevealed = !isQuiz || revealedIndices.has(idx);
          const audioKey = canPlayWordAudio
            ? buildWordAudioKey(surah!, ayah!, wordIndex1Based)
            : null;
          const isWordLoading =
            Boolean(audioKey) &&
            wordAudioState.playingKey === audioKey &&
            wordAudioState.status === 'loading';
          const isWordPlaying =
            Boolean(audioKey) &&
            wordAudioState.playingKey === audioKey &&
            wordAudioState.status === 'playing';
          const isKaraokeHighlighted = syncedDisplayWordIdx === wordIndex1Based;
          const isAudioActive = isWordLoading || isWordPlaying || isKaraokeHighlighted;

          return (
            <div
              key={`${ayahId}-${idx}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (isQuiz) {
                  toggleWord(idx);
                } else if (canPlayWordAudio) {
                  handlePlayWord(idx);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (isQuiz) {
                    toggleWord(idx);
                  } else if (canPlayWordAudio) {
                    handlePlayWord(idx);
                  }
                }
              }}
              title={
                isQuiz
                  ? isRevealed
                    ? 'Anlamı gizlemek için dokun'
                    : 'Türkçe anlamı görmek için dokun'
                  : canPlayWordAudio
                    ? 'Kelimenin telaffuzunu dinle'
                    : undefined
              }
              className={`relative min-h-[60px] min-w-[74px] max-w-[160px] px-3 py-2 rounded-xl border flex flex-col items-center justify-center text-center transition-colors select-none ${
                isQuiz || canPlayWordAudio
                  ? 'cursor-pointer hover:border-[var(--brand-primary)]/60 active:scale-[0.98]'
                  : 'cursor-default'
              }`}
              style={{
                backgroundColor: isAudioActive
                  ? 'var(--brand-primary-soft)'
                  : isQuiz && isRevealed
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                borderColor: isAudioActive
                  ? 'var(--brand-primary)'
                  : isQuiz && isRevealed
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                boxShadow: isAudioActive ? '0 0 0 1px var(--brand-primary)' : 'none',
              }}
            >
              {/* Kendini Dene modunda sol üst mini hoparlör butonu (kart gövdesinden bağımsız) */}
              {isQuiz && canPlayWordAudio && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayWord(idx);
                  }}
                  aria-label="Kelimeyi dinle"
                  title="Kelimeyi dinle"
                  className="absolute top-1 left-1 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)]"
                  style={{
                    color:
                      isWordLoading || isWordPlaying
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-muted)',
                  }}
                >
                  {isWordLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Volume2 className={`w-3 h-3 ${isWordPlaying ? 'animate-pulse' : ''}`} />
                  )}
                </button>
              )}

              {/* Açık modda aktif çalma/yükleme ses dalgası göstergesi */}
              {!isQuiz && (isWordLoading || isWordPlaying) && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center pointer-events-none"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {isWordLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Volume2 className="w-3 h-3 animate-pulse" />
                  )}
                </span>
              )}

              <span
                className="arabic-text leading-snug block"
                style={{
                  fontSize: `${wordArabicSize}px`,
                  color: 'var(--text-primary)',
                }}
              >
                {arWord}
              </span>
              <span
                dir="ltr"
                className={`mt-1 text-xs leading-snug font-medium transition-all select-none ${
                  isRevealed ? 'blur-0 opacity-100' : 'blur-[5px] opacity-40'
                }`}
                style={{ color: 'var(--text-secondary)' }}
              >
                {trMeaning}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
