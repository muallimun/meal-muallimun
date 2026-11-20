import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { sfxService } from '../../services/sfxService';
import type { WordMealMode, WordPair } from '../../types/quran';

interface WordMealGridProps {
  ayahId: number;
  words: WordPair[];
  wordMode: Exclude<WordMealMode, 'off'>;
  arabicFontSize?: number;
}

export const WordMealGrid: React.FC<WordMealGridProps> = ({
  ayahId,
  words,
  wordMode,
  arabicFontSize = 24,
}) => {
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());

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
      {isQuiz && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>
            Kendini Dene: Anlamını görmek için kelimelere dokun ({revealedIndices.size}/
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
      )}

      <div className="flex flex-wrap gap-2" dir="rtl">
        {words.map(([arWord, trMeaning], idx) => {
          const isRevealed = !isQuiz || revealedIndices.has(idx);

          return (
            <button
              key={`${ayahId}-${idx}`}
              type="button"
              onClick={() => toggleWord(idx)}
              disabled={!isQuiz}
              className={`min-h-[60px] min-w-[74px] max-w-[160px] px-3 py-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                isQuiz ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'
              }`}
              style={{
                backgroundColor:
                  isQuiz && isRevealed ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                borderColor:
                  isQuiz && isRevealed ? 'var(--brand-primary)' : 'var(--border-subtle)',
              }}
            >
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
            </button>
          );
        })}
      </div>
    </div>
  );
};
