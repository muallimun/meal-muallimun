import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, FileText, Loader2, Printer, StickyNote, X } from 'lucide-react';
import { findMealById } from '../../config/mealsConfig';
import { toArabicIndicDigits } from '../../services/dataService';
import {
  formatRefRangeLabel,
  hydrateFihristItems,
  type HydratedFihristVerse,
  type HydrateSourceItem,
} from '../../services/fihristService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { FihristPrintMode } from '../../types/fihrist';
import { getSurahMap } from '../../utils/poolUtils';

interface PrintableFihristModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: readonly HydrateSourceItem[];
  allowNotesToggle?: boolean;
  defaultPrintMode?: FihristPrintMode;
}

export const PrintableFihristModal: React.FC<PrintableFihristModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  items,
  allowNotesToggle = false,
  defaultPrintMode = 'ar_meal',
}) => {
  const { meta, manifest, settings } = useAppStore();
  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const primaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const secondaryMeal = useMemo(
    () => findMealById(settings.secondaryMealId, manifest),
    [settings.secondaryMealId, manifest],
  );
  const isDual =
    settings.mealDisplayMode === 'dual' && secondaryMeal.id !== primaryMeal.id;

  const [printMode, setPrintMode] = useState<FihristPrintMode>(defaultPrintMode);
  const [includeNotes, setIncludeNotes] = useState<boolean>(allowNotesToggle);
  const [hydratedVerses, setHydratedVerses] = useState<HydratedFihristVerse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPrintMode(defaultPrintMode);
    setIncludeNotes(allowNotesToggle);
  }, [isOpen, defaultPrintMode, allowNotesToggle]);

  // Yazdırma penceresi açıkken mevcut @media print body sınıfını etkinleştir
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('print-exam-active');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('print-exam-active');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || printMode === 'index' || items.length === 0) {
      setHydratedVerses([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    hydrateFihristItems({
      items,
      primaryMealId: primaryMeal.id,
      secondaryMealId: secondaryMeal.id,
      isDual,
      meta,
    })
      .then((res) => {
        if (!cancelled) {
          setHydratedVerses(res);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHydratedVerses([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, printMode, items, primaryMeal.id, secondaryMeal.id, isDual, meta]);

  const groupedBySurah = useMemo(() => {
    const map = new Map<number, { surahNo: number; surahName: string; items: HydrateSourceItem[] }>();
    const order: number[] = [];
    for (const item of items) {
      let grp = map.get(item.surah);
      if (!grp) {
        grp = {
          surahNo: item.surah,
          surahName: surahMap.get(item.surah)?.nameTr ?? `${item.surah}. Sure`,
          items: [],
        };
        map.set(item.surah, grp);
        order.push(item.surah);
      }
      grp.items.push(item);
    }
    return order.map((s) => map.get(s)!);
  }, [items, surahMap]);

  const totalAyahCount = useMemo(
    () => items.reduce((acc, it) => acc + Math.max(1, it.endAyah - it.startAyah + 1), 0),
    [items],
  );

  const dateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  if (!isOpen) return null;

  const handlePrint = () => {
    sfxService.play('click');
    window.print();
  };

  const sheetElement = (
    <div
      className="bg-white text-neutral-900"
      style={{
        fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif',
        color: '#111827',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Üst Başlık */}
      <header className="pb-3.5 mb-5 border-b-2 border-teal-800 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-teal-800 mb-1">
            MUALLİMUN.NET · KUR&apos;AN KONU FİHRİSTİ &amp; ARAŞTIRMA KÂĞIDI
          </p>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-neutral-950 leading-snug">
            {title}
          </h1>
          {subtitle && <p className="text-xs text-neutral-600 mt-1">{subtitle}</p>}
          {printMode !== 'index' && (
            <p className="text-[11px] text-neutral-500 mt-1">
              Meal Kaynağı: <strong className="text-neutral-800">{primaryMeal.label}</strong>
              {isDual ? ` · ${secondaryMeal.label}` : ''}
            </p>
          )}
        </div>

        <div className="text-right shrink-0 text-xs text-neutral-700 tabular-nums border border-neutral-300 rounded-lg px-3 py-2 bg-neutral-50">
          <p className="font-extrabold text-neutral-900">{totalAyahCount} Ayet</p>
          <p className="text-[11px] text-neutral-600 mt-0.5">{dateLabel}</p>
        </div>
      </header>

      {/* Gövde */}
      {printMode === 'index' ? (
        <div className="space-y-2.5">
          {groupedBySurah.map((grp) => (
            <div
              key={grp.surahNo}
              className="print-question-item p-3 rounded-lg border border-neutral-200 bg-neutral-50/50"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-extrabold text-teal-900 min-w-[140px]">
                  {grp.surahName} ({grp.surahNo}):
                </span>
                <span className="text-xs font-semibold text-neutral-800 tabular-nums">
                  {grp.items.map((it) => formatRefRangeLabel(it.startAyah, it.endAyah)).join(', ')}
                </span>
              </div>
              {allowNotesToggle &&
                includeNotes &&
                grp.items.some((it) => Boolean(it.note)) && (
                  <div className="mt-2 pt-2 border-t border-neutral-200 space-y-1">
                    {grp.items
                      .filter((it) => Boolean(it.note))
                      .map((it, idx) => (
                        <p key={`idx-note-${idx}`} className="text-[11px] text-neutral-700">
                          <strong className="text-amber-800">
                            {grp.surahNo}:{formatRefRangeLabel(it.startAyah, it.endAyah)} Notu:
                          </strong>{' '}
                          {it.note}
                        </p>
                      ))}
                  </div>
                )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3.5">
          {hydratedVerses.map((hv) => (
            <article
              key={hv.key}
              className="print-question-item p-3.5 rounded-xl border border-neutral-200 bg-white space-y-2"
            >
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-neutral-200">
                <span className="text-xs font-extrabold text-teal-900 tabular-nums">
                  {hv.surahMeta?.nameTr ?? `${hv.surah}. Sure`} {hv.surah}:{hv.ayah}
                </span>
                <span className="text-[10px] font-semibold text-neutral-500 tabular-nums">
                  {hv.verse.cuz}. Cüz · Sayfa {hv.verse.page}
                </span>
              </div>

              {printMode === 'ar_meal' && (
                <p
                  dir="rtl"
                  className="arabic-text text-right text-neutral-950 leading-[2.15]"
                  style={{ fontSize: '21px' }}
                >
                  {hv.verse.ar.t}{' '}
                  <span className="text-teal-800 text-[0.75em]">
                    ﴿{toArabicIndicDigits(hv.ayah)}﴾
                  </span>
                </p>
              )}

              <p className="text-[12.5px] leading-relaxed text-neutral-800">
                {isDual && (
                  <strong className="text-teal-900 mr-1">[{primaryMeal.shortLabel}]</strong>
                )}
                {hv.primaryMealVerse?.t ?? '—'}
              </p>

              {isDual && hv.secondaryMealVerse?.t && (
                <p className="text-[12.5px] leading-relaxed text-neutral-700 pt-1.5 border-t border-neutral-100">
                  <strong className="text-amber-800 mr-1">[{secondaryMeal.shortLabel}]</strong>
                  {hv.secondaryMealVerse.t}
                </p>
              )}

              {allowNotesToggle && includeNotes && hv.note && (
                <div className="mt-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-neutral-800">
                  <strong className="text-amber-900">Araştırma Notu:</strong> {hv.note}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Alt Bilgi */}
      <footer className="mt-6 pt-3 border-t border-neutral-300 flex items-center justify-between text-[10px] text-neutral-500">
        <span>Muallimun.Net — Kur&apos;an &amp; Meal Eğitim Platformu</span>
        <span>{dateLabel}</span>
      </footer>
    </div>
  );

  return (
    <>
      <div
        className="no-print fixed inset-0 z-[85] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-label="A4 PDF Araştırma Kâğıdı"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="w-full max-w-4xl h-[92dvh] rounded-2xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
          }}
        >
          {/* Üst Bar */}
          <div
            className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Printer className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold truncate">
                  A4 Araştırma &amp; Ders Kâğıdı
                </h3>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {title} · {totalAyahCount} ayet
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || items.length === 0}
                className="min-h-[38px] px-3.5 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Yazdır / PDF</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Kapat"
                className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Çıktı Biçimi Kontrol Şeridi */}
          <div
            className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'index', label: 'Sadece Referans Fihristi', icon: FileText },
                  { id: 'meal', label: 'Sadece Meal', icon: BookOpen },
                  { id: 'ar_meal', label: 'Arapça + Meal', icon: BookOpen },
                ] as const
              ).map((opt) => {
                const active = printMode === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setPrintMode(opt.id);
                    }}
                    className="min-h-[34px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary)'
                        : 'var(--bg-surface-soft)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: active ? '#FFFFFF' : 'var(--text-primary)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {allowNotesToggle && (
              <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => {
                    sfxService.play('click');
                    setIncludeNotes(e.target.checked);
                  }}
                  className="w-4 h-4 accent-teal-700 rounded cursor-pointer"
                />
                <StickyNote className="w-3.5 h-3.5" style={{ color: 'var(--brand-accent-text)' }} />
                <span>Kişisel Notları Dahil Et</span>
              </label>
            )}
          </div>

          {/* Canlı A4 Önizleme */}
          <div
            className="flex-1 overflow-y-auto p-3 sm:p-6 scrollbar-thin"
            style={{ backgroundColor: 'var(--bg-canvas)' }}
          >
            <div className="max-w-[210mm] mx-auto bg-white text-neutral-900 rounded-xl shadow-lg p-5 sm:p-8 border border-neutral-200">
              {isLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2 text-neutral-600">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
                  <p className="text-xs font-bold">A4 baskı önizlemesi hazırlanıyor...</p>
                </div>
              ) : (
                sheetElement
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Yalnızca @media print sırasında görünen gerçek A4 portalı */}
      {typeof document !== 'undefined' &&
        !isLoading &&
        items.length > 0 &&
        createPortal(<div className="print-only-sheet">{sheetElement}</div>, document.body)}
    </>
  );
};
