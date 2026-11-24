import React from 'react';

const ARABIC_CHAR =
  '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';

const ARABIC_SEGMENT_REGEX = new RegExp(
  `(\\(\\s*[${ARABIC_CHAR}][${ARABIC_CHAR}\\s·/—-]*[${ARABIC_CHAR}]?\\s*\\)|[${ARABIC_CHAR}]+(?:\\s+[${ARABIC_CHAR}]+)*)`,
  'g',
);

const ARABIC_TEST_REGEX = new RegExp(`[${ARABIC_CHAR}]`);

export function renderArabicHighlightedText(text: string): React.ReactNode {
  if (!ARABIC_TEST_REGEX.test(text)) return text;
  const parts = text.split(ARABIC_SEGMENT_REGEX);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (ARABIC_TEST_REGEX.test(part)) {
      if (part.startsWith('(') && part.endsWith(')')) {
        const inner = part.slice(1, -1).trim();
        const keepSingleLine = inner.length <= 22;
        return (
          <bdi
            key={idx}
            className={keepSingleLine ? 'whitespace-nowrap inline-block' : 'inline'}
          >
            (
            <span
              dir="rtl"
              lang="ar"
              className="font-arabic inline-block align-baseline text-[1.25em] leading-none font-bold text-[#FDE68A] px-0.5"
            >
              {inner}
            </span>
            )
          </bdi>
        );
      }
      return (
        <bdi key={idx} className="inline-block">
          <span
            dir="rtl"
            lang="ar"
            className="font-arabic inline-block align-baseline text-[1.25em] leading-none font-bold text-[#FDE68A] mx-0.5"
          >
            {part}
          </span>
        </bdi>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

interface StagePromptBannerProps {
  badgeIcon?: React.ReactNode;
  badgeLabel: string;
  prompt: string;
  arabicAccent?: string;
  progressBadge?: string;
  secondaryBadge?: string;
  distractorBadge?: string;
  actionSlot?: React.ReactNode;
  compact?: boolean;
}

export const StagePromptBanner: React.FC<StagePromptBannerProps> = ({
  badgeIcon,
  badgeLabel,
  prompt,
  arabicAccent,
  progressBadge,
  secondaryBadge,
  distractorBadge,
  actionSlot,
  compact = false,
}) => {
  return (
    <div
      className={`shrink-0 w-full rounded-xl bg-black/22 border border-white/15 backdrop-blur-xs ${
        compact ? 'px-3 py-1.5 sm:px-4 sm:py-2' : 'px-3.5 py-2.5 sm:px-5 sm:py-3'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-amber-400 text-amber-950 shrink-0">
              {badgeIcon}
              <span>{badgeLabel}</span>
            </span>

            {arabicAccent && (
              <span
                dir="rtl"
                lang="ar"
                className="font-arabic text-xl sm:text-2xl leading-none font-bold text-[#FDE68A] shrink-0"
              >
                {arabicAccent}
              </span>
            )}

            {distractorBadge && (
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-extrabold px-2 py-0.5 rounded-md bg-white/14 text-amber-200 border border-white/15 shrink-0">
                {distractorBadge}
              </span>
            )}
          </div>

          <h2
            className={`${
              compact
                ? 'text-sm sm:text-base lg:text-[18px]'
                : 'text-base sm:text-lg lg:text-[21px]'
            } font-bold text-[#FFFBEB] leading-snug break-words`}
          >
            {renderArabicHighlightedText(prompt)}
          </h2>
        </div>

        {(progressBadge || secondaryBadge || actionSlot) && (
          <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0 flex-wrap">
            {secondaryBadge && (
              <span className="px-2.5 py-1 rounded-lg bg-white/12 border border-white/15 text-xs sm:text-[13px] font-extrabold tabular-nums text-white whitespace-nowrap">
                {secondaryBadge}
              </span>
            )}
            {progressBadge && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-300/35 text-xs sm:text-[13px] font-extrabold tabular-nums text-[#FDE68A] whitespace-nowrap">
                {progressBadge}
              </span>
            )}
            {actionSlot}
          </div>
        )}
      </div>
    </div>
  );
};
