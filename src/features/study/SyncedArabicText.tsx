import React, { useMemo, useSyncExternalStore } from 'react';
import { audioQueueService, type WordSyncSnapshot } from '../../services/audioQueueService';
import type { ThemeMode } from '../../types/quran';
import type { TajweedRuleDef, TajweedWord } from '../../types/tajweed';
import { mapQulWordIndexToDisplay, tokenizeArabicWithWaqf } from '../../utils/wordSyncUtils';
import { splitTrailingWaqf, WaqfMarkSpan } from '../../utils/waqfTextUtils';
import { TajweedText } from './TajweedText';

const WAQF_CHAR_DETECT_REGEX = /[\u06d6-\u06dc]/;

const NOOP_SUBSCRIBE = () => () => {};

const EMPTY_WORD_SYNC: WordSyncSnapshot = {
  activeWordIndex: null,
  surah: null,
  ayah: null,
  phase: null,
  qulWordCount: null,
  reciterKey: null,
};

const GET_EMPTY_WORD_SYNC = () => EMPTY_WORD_SYNC;

/**
 * Yalnızca `enabled === true` iken `audioQueueService.subscribeWordSync` kanalına abone olur.
 * Çalınmayan diğer tüm ayetler sıfır abonelik ve sıfır yeniden çizim (0 re-render) ile kalır.
 */
export function useActiveWordSync(enabled: boolean): WordSyncSnapshot {
  return useSyncExternalStore(
    enabled ? audioQueueService.subscribeWordSync : NOOP_SUBSCRIBE,
    enabled ? audioQueueService.getWordSyncSnapshot : GET_EMPTY_WORD_SYNC,
  );
}

interface SyncedVerseArabicProps {
  text: string;
  surahNo: number;
  ayahNo: number;
  isPlaying: boolean;
  wordSyncEnabled: boolean;
  useTajweed: boolean;
  tajweedWords?: TajweedWord[] | null;
  tajweedRules?: Record<string, TajweedRuleDef>;
  theme: ThemeMode;
  isBesmele?: boolean;
}

/**
 * Mushaf, Ayet Kartları ve Kitap modlarında Arapça metni (Tecvitli veya normal Türk hattı)
 * sıfır satır kayması (Zero Layout Shift) ile kelime bazlı karaoke vurgulu ve
 * dokun-öğren Secâvend vakıf işaretli olarak çizer.
 */
export const SyncedVerseArabic: React.FC<SyncedVerseArabicProps> = ({
  text,
  surahNo,
  ayahNo,
  isPlaying,
  wordSyncEnabled,
  useTajweed,
  tajweedWords,
  tajweedRules,
  theme,
  isBesmele = false,
}) => {
  const shouldTrack = isPlaying && wordSyncEnabled;
  const sync = useActiveWordSync(shouldTrack);

  const isMatched =
    shouldTrack &&
    sync.activeWordIndex !== null &&
    (isBesmele
      ? sync.phase === 'besmele' && sync.surah === surahNo
      : sync.phase === 'ar' && sync.surah === surahNo && sync.ayah === ayahNo);

  const rawQulWordIdx = isMatched ? sync.activeWordIndex : null;
  const hasWaqfMarks = useMemo(() => !useTajweed && WAQF_CHAR_DETECT_REGEX.test(text), [text, useTajweed]);

  // Normal (Tecvitsiz) modda yalnızca karaoke aktifse veya ayette Secâvend durak işareti varsa tokenize et
  const plainTokens = useMemo(() => {
    if (useTajweed) return null;
    if (!shouldTrack && !hasWaqfMarks) return null;
    return tokenizeArabicWithWaqf(text);
  }, [text, useTajweed, shouldTrack, hasWaqfMarks]);

  // 1. Renkli Tecvit Aktif
  if (useTajweed && tajweedWords && tajweedWords.length > 0 && tajweedRules) {
    const mappedWordIdx =
      rawQulWordIdx !== null
        ? mapQulWordIndexToDisplay(rawQulWordIdx, sync.qulWordCount, tajweedWords.length)
        : null;

    return (
      <TajweedText
        words={tajweedWords}
        rules={tajweedRules}
        theme={theme}
        activeWordIndex={mappedWordIdx}
        surahNo={isBesmele ? 1 : surahNo}
        ayahNo={isBesmele ? 1 : ayahNo}
      />
    );
  }

  // 2. Normal Türk Mushaf Hattı — Aktif kelime yoksa ve durak işareti yoksa düz metin (0 ekstra DOM düğümü)
  if ((!shouldTrack || rawQulWordIdx === null) && !hasWaqfMarks) {
    return <>{text}</>;
  }

  if (!plainTokens || plainTokens.length === 0) {
    return <>{text}</>;
  }

  const mappedPlainIdx =
    shouldTrack && rawQulWordIdx !== null
      ? mapQulWordIndexToDisplay(rawQulWordIdx, sync.qulWordCount, plainTokens.length)
      : null;

  return (
    <>
      {plainTokens.map((token, idx) => {
        const { body, waqf } = splitTrailingWaqf(token);
        const isActiveWord = mappedPlainIdx !== null && idx + 1 === mappedPlainIdx;
        return (
          <React.Fragment key={idx}>
            {isActiveWord ? (
              <span className="karaoke-word-active">{body}</span>
            ) : (
              body
            )}
            {waqf && <WaqfMarkSpan waqf={waqf} />}
            {idx < plainTokens.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </>
  );
};

