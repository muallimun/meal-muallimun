import React from 'react';
import { sfxService } from '../services/sfxService';
import { openWaqfPopover, resolveWaqfSignDef } from '../services/studyPopoverBus';

/**
 * Bir Arapça kelime ya da tecvit segmentinin EN SONUNDA yer alan Secâvend durak
 * işaretlerini (U+06D6–U+06DC) güvenli biçimde ayırır.
 *
 * - Kelime ortasına dokunulmadığı için Arapça OpenType harf birleşmeleri (cursive joining)
 *   %100 korunur.
 * - Durak işaretinden önce yanlışlıkla gelmiş olabilecek boşluk(lar) veya
 *   ZWNJ/ZWJ karakterleri temizlenerek iki kelime arasında çift boşluk oluşması engellenir.
 */
const TRAILING_WAQF_REGEX = /([ \t\u00a0\u200c\u200d]*)([\u06d6-\u06dc]+)$/;

/**
 * Kelime arası bağımsız durak işaretlerinin önündeki ve ardışık fazla boşlukları
 * tek standart boşluğa indirger (114 sure / tüm görünümler için genel temizleme).
 */
export function normalizeArabicWaqfSpacing(text: string): string {
  if (!text) return '';
  return text
    .replace(/[ \t\u00a0]{2,}/g, ' ')
    .replace(/[ \t\u00a0]+([\u06d6-\u06dc]+)(?=[ \t\u00a0]|$)/g, '$1')
    .replace(/[ \t\u00a0]{2,}/g, ' ')
    .trim();
}

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
  /** Ayet sonu gülünden hemen önceki durak işareti için işaretleyici */
  isEndOfAyah?: boolean;
}

/**
 * Tıklanabilir, taban çizgisinde SIFIR YATAY GENİŞLİK (`width: 0`) kaplayan
 * Secâvend vakıf işareti bileşeni.
 *
 * - Önceki kelimeye `\u2060` (Word Joiner, 0px) ile bağlanır; böylece durak
 *   işareti asla alt satır başına kopmaz ve ekstra `\u00A0` boşluğu üretmez.
 * - İç glif katmanında HarfBuzz/Chromium'un noktalı daire (`◌`) çizmemesi için
 *   baz olarak `\u00A0` kullanılır, ancak dış sarmalayıcı `width: 0; overflow: visible`
 *   olduğu için taban çizgisinde 0px yer kaplar ve `text-align: justify` satırlarda
 *   dev boşluklar oluşturmaz.
 * - Görünmez `::after` dokunma hedefi sayesinde metin akışını itmeden rahatça tıklanır.
 */
export const WaqfMarkSpan: React.FC<WaqfMarkSpanProps> = ({ waqf, isEndOfAyah = false }) => {
  const def = resolveWaqfSignDef(waqf);
  if (!def) {
    return (
      <>
        {'\u2060'}
        <span className="waqf-mark-anchor" data-waqf-end={isEndOfAyah ? '1' : undefined}>
          <span className="waqf-mark-glyph" aria-hidden="true">
            {'\u00A0'}
            {waqf}
          </span>
        </span>
      </>
    );
  }

  const triggerPopover = (target: HTMLElement) => {
    sfxService.play('click');
    const glyphEl = target.firstElementChild as HTMLElement | null;
    const rect =
      glyphEl && glyphEl.getBoundingClientRect().width > 0
        ? glyphEl.getBoundingClientRect()
        : target.getBoundingClientRect();
    openWaqfPopover(def, waqf, rect);
  };

  return (
    <>
      {'\u2060'}
      <span
        data-waqf-sign="1"
        data-waqf-end={isEndOfAyah ? '1' : undefined}
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
        className="waqf-mark-anchor waqf-mark-color focus-visible:outline-2 focus-visible:outline-teal-600"
        style={{ '--waqf-color': def.color } as React.CSSProperties}
      >
        <span className="waqf-mark-glyph" aria-hidden="true">
          {'\u00A0'}
          {waqf}
        </span>
      </span>
    </>
  );
};
