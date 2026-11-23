import React from 'react';
import { toArabicIndicDigits } from '../services/dataService';
import type { ThemeMode } from '../types/quran';

/** Arapça ayet metninin sonunda hâlihazırda durak/rakam bulunup bulunmadığını denetler. */
export const ENDS_WITH_ARABIC_AYAH_MARKER = /[\u0660-\u0669\u06DD﴿﴾]\s*$/;

export interface AyahEndMarkerProps {
  ayahNo: number;
  /** Ayet şu an sesli olarak okunuyor mu? */
  isPlaying?: boolean;
  /** Kelime takibi (karaoke) aktif mi? Aktifken kehribar vurgu uygulanır. */
  isWordSyncActive?: boolean;
  /** Seçili, yer imli veya tilâvet secdesi vurgulu durum */
  isHighlighted?: boolean;
  /** Ayet satırının kendi dolgu vurgusu olmadığında oynatılan durağa yumuşak zemin uygular */
  highlightPlayingBg?: boolean;
  /** Aktif tema (koyu tema kontrast uyumu için) */
  theme?: ThemeMode;
  /** Mushaf akışı (0.76em) veya kart/odak görünümü (0.78em) ölçeği */
  size?: 'mushaf' | 'card';
  /** Opsiyonel araç ipucu metni */
  title?: string;
  /** Opsiyonel tıklama etkileşimi */
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  /** Opsiyonel ek CSS sınıfları */
  className?: string;
}

/**
 * Klasik tezhipli Mushaf ayet sonu durak rozeti.
 * Mushaf ve Kartlar görünümlerindeki birebir aynı Arapça hat glifi (`arabic-text` + `\uFD3F...\uFD3E`
 * ve Doğu Arapça rakamlar `٠١٢٣٤٥٦٧٨٩`) ile parantezsiz, simetrik ve taşmasız olarak render edilir.
 */
export const AyahEndMarker: React.FC<AyahEndMarkerProps> = ({
  ayahNo,
  isPlaying = false,
  isWordSyncActive = false,
  isHighlighted = false,
  highlightPlayingBg = false,
  theme = 'cream',
  size = 'mushaf',
  title,
  onClick,
  className = '',
}) => {
  const isWordSyncPlaying = isPlaying && isWordSyncActive;
  const isDark = theme === 'dark';

  const color = isWordSyncPlaying
    ? 'var(--brand-accent-text)'
    : isPlaying
      ? 'var(--brand-primary-text)'
      : isHighlighted
        ? 'var(--brand-accent-text)'
        : 'var(--brand-primary-text)';

  const backgroundColor = isWordSyncPlaying
    ? isDark
      ? 'rgba(251, 191, 36, 0.16)'
      : 'rgba(245, 158, 11, 0.16)'
    : isPlaying && highlightPlayingBg
      ? isDark
        ? 'rgba(16, 185, 129, 0.18)'
        : 'rgba(15, 118, 110, 0.12)'
      : 'transparent';

  const boxShadow = isWordSyncPlaying
    ? isDark
      ? '0 0 0 2px rgba(251, 191, 36, 0.16)'
      : '0 0 0 2px rgba(245, 158, 11, 0.16)'
    : isPlaying && highlightPlayingBg
      ? isDark
        ? '0 0 0 2px rgba(16, 185, 129, 0.18)'
        : '0 0 0 2px rgba(15, 118, 110, 0.12)'
      : 'none';

  const sizeClass = size === 'card' ? 'text-[0.78em]' : 'text-[0.76em]';
  const interactiveProps = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as unknown as React.MouseEvent<HTMLSpanElement>);
          }
        },
      }
    : {};

  return (
    <span
      dir="rtl"
      title={title}
      {...interactiveProps}
      className={`arabic-text inline-flex items-center justify-center shrink-0 mx-[0.18em] ${sizeClass} font-normal leading-none whitespace-nowrap select-none align-middle rounded-md transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`.trim()}
      style={{
        color,
        backgroundColor,
        boxShadow,
      }}
    >
      {'\uFD3F'}
      {toArabicIndicDigits(ayahNo)}
      {'\uFD3E'}
    </span>
  );
};
