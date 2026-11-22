import React from 'react';
import { sfxService } from '../services/sfxService';
import { openWaqfPopover, resolveWaqfSignDef } from '../services/studyPopoverBus';

/**
 * Bir Arapça kelime ya da tecvit segmentinin EN SONUNDA yer alan Secâvend durak
 * işaretlerini (U+06D6–U+06DC) güvenli biçimde ayırır.
 *
 * Kelime ortasına dokunulmadığı için Arapça OpenType harf birleşmeleri (cursive joining)
 * %100 korunur.
 */
const TRAILING_WAQF_REGEX = /([\u200c\u200d]*)([\u06d6-\u06dc]+)$/;

export function splitTrailingWaqf(text: string): { body: string; waqf: string } {
  if (!text) return { body: '', waqf: '' };
  const match = text.match(TRAILING_WAQF_REGEX);
  if (!match || match.index === undefined) {
    return { body: text, waqf: '' };
  }
  return {
    body: text.slice(0, match.index),
    waqf: match[2],
  };
}

interface WaqfMarkSpanProps {
  waqf: string;
}

/**
 * Tıklanabilir Secâvend vakıf işareti bileşeni.
 *
 * Nonspacing Mark (Mn) olan U+06D6..U+06DC karakterlerinin HarfBuzz/Chromium'da
 * noktalı daire (◌) oluşturmaması için önüne görünmez baz karakter olarak
 * kırılmaz boşluk (\u00A0) eklenir; böylece hem kelimeyle satır sonunda kopmaz
 * hem de temiz bir dokunma hedefi sağlar.
 */
export const WaqfMarkSpan: React.FC<WaqfMarkSpanProps> = ({ waqf }) => {
  const def = resolveWaqfSignDef(waqf);
  if (!def) {
    return <>{waqf}</>;
  }

  const triggerPopover = (target: HTMLElement) => {
    sfxService.play('click');
    openWaqfPopover(def, waqf, target.getBoundingClientRect());
  };

  return (
    <span
      data-waqf-sign="1"
      role="button"
      tabIndex={0}
      title={`${def.nameTr} (${def.actionTr}) — Ayrıntı için dokunun`}
      aria-label={`${def.nameTr}: ${def.actionTr}`}
      onClick={(e) => {
        e.stopPropagation();
        triggerPopover(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          triggerPopover(e.currentTarget);
        }
      }}
      className="waqf-mark-color cursor-pointer rounded-[4px] transition-colors hover:bg-teal-600/15 focus-visible:outline-2 focus-visible:outline-teal-600"
      style={{ '--waqf-color': def.color } as React.CSSProperties}
    >
      {'\u00A0'}
      {waqf}
    </span>
  );
};
