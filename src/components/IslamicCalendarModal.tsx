import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  BookOpen,
  BookOpenCheck,
  Calendar,
  ExternalLink,
  Sparkles,
  X,
} from 'lucide-react';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import {
  getHijriOffset,
  getIslamicCalendarSnapshot,
  setHijriOffset,
  subscribeHijriOffset,
  type HijriDayOffset,
} from '../utils/islamicCalendar';

const OFFSET_OPTIONS: readonly { value: HijriDayOffset; label: string }[] = [
  { value: -1, label: '-1' },
  { value: 0, label: '0 (Diyanet)' },
  { value: 1, label: '+1' },
];

export const IslamicCalendarModal: React.FC = () => {
  const {
    isCalendarModalOpen,
    closeCalendarModal,
    openHatimModal,
    navigateToStudy,
  } = useAppStore();

  const hijriOffset = useSyncExternalStore(subscribeHijriOffset, getHijriOffset);

  useBackButtonGuard('islamic_calendar_modal', isCalendarModalOpen, closeCalendarModal);

  useEffect(() => {
    if (!isCalendarModalOpen) return;
    return acquireBodyScrollLock();
  }, [isCalendarModalOpen]);

  useEffect(() => {
    if (!isCalendarModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        sfxService.play('click');
        closeCalendarModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCalendarModalOpen, closeCalendarModal]);

  const snapshot = useMemo(() => {
    if (!isCalendarModalOpen) return null;
    return getIslamicCalendarSnapshot(new Date(), hijriOffset);
  }, [isCalendarModalOpen, hijriOffset]);

  if (!isCalendarModalOpen || !snapshot) return null;

  const { gregorian, hijri, rumi, holyDay, moonPhase, dailyJuz } = snapshot;

  const handleOpenDailyJuz = () => {
    sfxService.play('click');
    closeCalendarModal();
    navigateToStudy({
      page: dailyJuz.startPage,
      viewMode: 'mushaf',
      ensureArabicVisible: true,
    });
  };

  const handleOpenHatim = () => {
    sfxService.play('click');
    closeCalendarModal();
    openHatimModal();
  };

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="islamic-calendar-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          sfxService.play('click');
          closeCalendarModal();
        }
      }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Sabit Üst Başlık */}
        <div
          className="px-4 py-3 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2.5 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="islamic-calendar-modal-title"
                className="text-sm sm:text-base font-extrabold tracking-tight truncate"
              >
                Takvim Yaprağı
              </h2>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                Hicrî · Milâdî · Rûmî Takvim ve Günün Cüzü
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              closeCalendarModal();
            }}
            aria-label="Takvim penceresini kapat"
            className="min-w-[38px] min-h-[38px] w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-colors hover:opacity-85 shrink-0 touch-manipulation"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Kaydırılabilir Orta Gövde */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-3.5">
          {/* 1. Öne Çıkan Hicrî Tarih Kartı */}
          <section
            className="rounded-2xl border p-4 sm:p-5 space-y-2.5 text-center relative overflow-hidden"
            style={{
              background:
                'linear-gradient(155deg, var(--brand-primary-soft) 0%, var(--bg-surface-soft) 68%, var(--brand-accent-soft) 100%)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span
                className="inline-flex items-center gap-1.5 font-bold"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span aria-hidden="true" className="text-sm leading-none">
                  {moonPhase.symbol}
                </span>
                <span>{moonPhase.label}</span>
              </span>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span
                  className="px-2 py-0.5 rounded-md border font-extrabold tabular-nums"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  {hijri.monthLength} Gün
                </span>
                {holyDay && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-extrabold"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      borderColor: 'rgba(217, 119, 6, 0.35)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>{holyDay.name}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="py-1 space-y-1">
              <p
                className="text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                Hicrî Tarih
              </p>
              <p
                className="text-xl sm:text-2xl font-extrabold tracking-tight leading-snug"
                style={{ color: 'var(--text-primary)' }}
              >
                {hijri.formattedTr}
              </p>
              <p
                dir="rtl"
                lang="ar"
                className="text-lg sm:text-xl leading-relaxed"
                style={{
                  fontFamily: '"Scheherazade New", "Amiri Quran", serif',
                  color: 'var(--text-secondary)',
                }}
              >
                {hijri.formattedAr}
              </p>
            </div>
          </section>

          {/* 2. Milâdî ve Rûmî Tarih Şeridi */}
          <section className="grid grid-cols-2 gap-2">
            <div
              className="rounded-xl border p-3 space-y-0.5 min-w-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p
                className="text-[10.5px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Milâdî
              </p>
              <p
                className="text-xs sm:text-[13px] font-extrabold leading-snug"
                style={{ color: 'var(--text-primary)' }}
              >
                {gregorian.formattedFullTr}
              </p>
            </div>

            <div
              className="rounded-xl border p-3 space-y-0.5 min-w-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p
                className="text-[10.5px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Rûmî
              </p>
              <p
                className="text-xs sm:text-[13px] font-extrabold leading-snug"
                style={{ color: 'var(--text-primary)' }}
              >
                {rumi.formattedTr}
              </p>
            </div>
          </section>

          {/* 3. Günün Mukabele Cüzü Kartı */}
          <section
            className="rounded-2xl border p-3.5 sm:p-4 space-y-3"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: dailyJuz.isCombinedFinalDay
                ? 'rgba(217, 119, 6, 0.35)'
                : 'var(--border-subtle)',
            }}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className="text-[10.5px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {dailyJuz.isRamazan ? 'Ramazan Mukabelesi' : 'Günün Mukabele Cüzü'}
                </p>
                <span
                  className="text-[11px] font-bold tabular-nums whitespace-nowrap"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Sayfa {dailyJuz.startPage}–{dailyJuz.endPage} · {dailyJuz.totalPages} Sayfa
                </span>
              </div>

              <h3
                className="text-sm sm:text-[15px] font-extrabold tracking-tight leading-snug"
                style={{ color: 'var(--text-primary)' }}
              >
                {dailyJuz.isCombinedFinalDay
                  ? `${dailyJuz.label} (Hatim Tamamlama Günü)`
                  : `Günün Tavsiye Cüzü: ${dailyJuz.label}`}
              </h3>

              {dailyJuz.note && (
                <p
                  className="text-[11.5px] leading-relaxed px-2.5 py-2 rounded-lg border mt-1.5"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    borderColor: 'rgba(217, 119, 6, 0.28)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  {dailyJuz.note}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenDailyJuz}
                className="min-h-[40px] px-3 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95 whitespace-nowrap touch-manipulation"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Cüzü Oku</span>
              </button>

              <button
                type="button"
                onClick={handleOpenHatim}
                className="min-h-[40px] px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:border-[var(--brand-primary)] whitespace-nowrap touch-manipulation"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                <BookOpenCheck
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--brand-primary-text)' }}
                />
                <span>Hatim Planı</span>
              </button>
            </div>
          </section>

          {/* 4. Hicrî Gün Farkı Ayarı (Kompakt Tek Satır) */}
          <section
            className="rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2.5"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="min-w-0">
              <p
                className="text-xs font-extrabold leading-snug"
                style={{ color: 'var(--text-primary)' }}
              >
                Hicrî Gün Farkı
              </p>
              <p className="text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                Rü&apos;yet takvimi ayarı
              </p>
            </div>

            <div
              className="inline-flex items-center p-0.5 rounded-lg border shrink-0"
              role="radiogroup"
              aria-label="Hicrî gün farkı"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {OFFSET_OPTIONS.map((opt) => {
                const active = hijriOffset === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      sfxService.play('click');
                      setHijriOffset(opt.value);
                    }}
                    className="min-h-[30px] px-2.5 rounded-md text-[11px] font-extrabold transition-colors cursor-pointer whitespace-nowrap touch-manipulation"
                    style={{
                      backgroundColor: active ? 'var(--brand-primary)' : 'transparent',
                      color: active ? '#FFFFFF' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Zarif Alt Bağlantı */}
        <div
          className="px-4 py-2.5 sm:px-5 sm:py-3 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))] border-t flex items-center justify-center shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <a
            href="https://www.muallimun.com/takvim/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sfxService.play('click')}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-bold transition-opacity hover:opacity-100 opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>Detaylı Takvim &amp; Namaz Vakitleri</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
};
