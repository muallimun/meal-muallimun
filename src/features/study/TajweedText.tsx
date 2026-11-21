import React from 'react';
import { sfxService } from '../../services/sfxService';
import type { ThemeMode } from '../../types/quran';
import type { TajweedActiveSelection, TajweedRuleDef, TajweedWord } from '../../types/tajweed';
import { openTajweedPopover } from './TajweedRulePopover';

interface TajweedTextProps {
  words: TajweedWord[];
  rules: Record<string, TajweedRuleDef>;
  theme: ThemeMode;
  onSelectRule?: (selection: TajweedActiveSelection) => void;
  className?: string;
  interactive?: boolean;
}

/**
 * Arapça OpenType harf birleşmelerini (ligature & shaping) %100 koruyarak
 * renkli tecvit metni oluşturur.
 *
 * KRİTİK: Kelime içi renkli `<span>` elemanlarına SADECE `color` verilir;
 * kesinlikle `padding`, `margin`, `border`, `inline-block` veya farklı
 * `font-family`/`font-size` uygulanmaz.
 */
export const TajweedText: React.FC<TajweedTextProps> = ({
  words,
  rules,
  theme,
  onSelectRule,
  className,
  interactive = true,
}) => {
  return (
    <span className={className} dir="rtl">
      {words.map((word, wordIdx) => (
        <React.Fragment key={wordIdx}>
          <span data-word-index={wordIdx + 1}>
            {word.map((seg, segIdx) => {
              if (typeof seg === 'string') {
                return <React.Fragment key={segIdx}>{seg}</React.Fragment>;
              }

              const [text, code] = seg;
              const rule = rules[code];
              if (!rule) {
                return <React.Fragment key={segIdx}>{text}</React.Fragment>;
              }

              const color = theme === 'dark' ? rule.colorDark : rule.colorLight;

              if (!interactive) {
                return (
                  <span key={segIdx} style={{ color }}>
                    {text}
                  </span>
                );
              }

              return (
                <span
                  key={segIdx}
                  data-tajweed-rule={code}
                  style={{ color }}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const selection: TajweedActiveSelection = {
                      word,
                      rule,
                      rect: {
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        right: rect.right,
                        width: rect.width,
                        height: rect.height,
                      },
                    };
                    sfxService.play('click');
                    if (onSelectRule) {
                      onSelectRule(selection);
                    } else {
                      openTajweedPopover(selection, rules);
                    }
                  }}
                >
                  {text}
                </span>
              );
            })}
          </span>
          {wordIdx < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </span>
  );
};
