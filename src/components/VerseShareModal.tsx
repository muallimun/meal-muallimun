import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Check,
  Copy,
  Download,
  Loader2,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import { resolveArabicFontFamily } from '../config/assetsConfig';
import {
  findMealById,
  getAllMeals,
  getMealTextPresentation,
  isExtraMealId,
} from '../config/mealsConfig';
import { dataService } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { CombinedVerse, SurahMeta } from '../types/quran';
import { formatSafeArabicTitle, formatSurahTitle } from '../utils/arabicUtils';

type ShareContentMode = 'both' | 'ar' | 'meal';
type ShareCardTheme = 'cream' | 'emerald' | 'dark';

interface VerseShareModalProps {
  verse: CombinedVerse | null;
  surahMeta: SurahMeta | null;
  onClose: () => void;
}

interface CardPalette {
  id: ShareCardTheme;
  label: string;
  bgStart: string;
  bgEnd: string;
  frameOuter: string;
  frameInner: string;
  badgeBg: string;
  badgeText: string;
  arabicColor: string;
  mealColor: string;
  mutedColor: string;
  dividerColor: string;
  previewClass: string;
}

const CARD_PALETTES: Record<ShareCardTheme, CardPalette> = {
  cream: {
    id: 'cream',
    label: 'Krem Mushaf',
    bgStart: '#fdf9f0',
    bgEnd: '#f4ebda',
    frameOuter: '#c8b28a',
    frameInner: '#dfd0b4',
    badgeBg: '#e5f2ef',
    badgeText: '#0f766e',
    arabicColor: '#1b1610',
    mealColor: '#362f25',
    mutedColor: '#756651',
    dividerColor: '#d9c8ab',
    previewClass: 'bg-gradient-to-b from-[#fdf9f0] to-[#f4ebda] text-[#1b1610] border-[#c8b28a]',
  },
  emerald: {
    id: 'emerald',
    label: 'Zümrüt',
    bgStart: '#0b4642',
    bgEnd: '#072b2a',
    frameOuter: '#f59e0b',
    frameInner: 'rgba(245, 158, 11, 0.38)',
    badgeBg: 'rgba(245, 158, 11, 0.18)',
    badgeText: '#fcd34d',
    arabicColor: '#ffffff',
    mealColor: '#e6f4f2',
    mutedColor: '#99d5cd',
    dividerColor: 'rgba(245, 158, 11, 0.35)',
    previewClass: 'bg-gradient-to-b from-[#0b4642] to-[#072b2a] text-white border-[#f59e0b]/70',
  },
  dark: {
    id: 'dark',
    label: 'Gece',
    bgStart: '#10191d',
    bgEnd: '#090f12',
    frameOuter: '#2dd4bf',
    frameInner: 'rgba(45, 212, 191, 0.28)',
    badgeBg: 'rgba(45, 212, 191, 0.15)',
    badgeText: '#5eead4',
    arabicColor: '#f8fafc',
    mealColor: '#d4e2e0',
    mutedColor: '#8aa4a1',
    dividerColor: 'rgba(45, 212, 191, 0.25)',
    previewClass: 'bg-gradient-to-b from-[#10191d] to-[#090f12] text-[#f8fafc] border-[#2dd4bf]/50',
  },
};

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export const VerseShareModal: React.FC<VerseShareModalProps> = ({
  verse,
  surahMeta,
  onClose,
}) => {
  const { settings, manifest } = useAppStore();
  const extraVersion = useSyncExternalStore(
    dataService.subscribeExtraMeals,
    dataService.getExtraMealsVersion,
  );
  const allMeals = useMemo(() => getAllMeals(manifest), [manifest]);
  const [contentMode, setContentMode] = useState<ShareContentMode>('both');
  const [cardTheme, setCardTheme] = useState<ShareCardTheme>('cream');
  const [mealPick, setMealPick] = useState<string>(settings.primaryMealId || 'm1');
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!verse) return;
    setMealPick(settings.primaryMealId || 'm1');
    setCopied(false);
    setStatusMessage(null);
  }, [verse, settings.primaryMealId]);

  useEffect(() => {
    if (!verse || !isExtraMealId(mealPick)) return;
    if (!dataService.hasExtraMealsLoaded(verse.surah)) {
      dataService.loadExtraMealsForSurah(verse.surah).catch(() => {});
    }
  }, [verse, mealPick]);

  useEffect(() => {
    if (!verse) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [verse, onClose]);

  const selectedMealDef = useMemo(
    () => findMealById(mealPick, manifest),
    [mealPick, manifest],
  );

  const activeMealText = useMemo(() => {
    void extraVersion;
    if (!verse) return '';
    const resolved = dataService.getMealVerse(verse.surah, verse.ayah, mealPick, verse);
    return resolved?.t || verse.m1?.t || verse.m2?.t || '';
  }, [verse, mealPick, extraVersion]);

  const activeMealLabel = selectedMealDef.label;
  const surahLabel = surahMeta
    ? `${formatSurahTitle(surahMeta.nameTr, surahMeta.no)}, ${verse?.ayah ?? ''}. Ayet`
    : verse
      ? `${verse.surah}. Sure, ${verse.ayah}. Ayet`
      : '';
  const safeArabicSurah = surahMeta ? formatSafeArabicTitle(surahMeta.nameAr) : '';

  const shareTextPayload = useMemo(() => {
    if (!verse) return '';
    const parts: string[] = [];
    if (contentMode === 'both' || contentMode === 'ar') {
      parts.push(verse.ar.t);
    }
    if (contentMode === 'both' || contentMode === 'meal') {
      if (activeMealText) {
        parts.push(`"${activeMealText}"`);
      }
    }
    const mealSuffix = contentMode === 'ar' ? '' : ` • ${selectedMealDef.label}`;
    parts.push(`— ${surahLabel}${mealSuffix}`);
    parts.push('https://kuran.muallimun.net');
    return parts.join('\n\n');
  }, [verse, contentMode, activeMealText, surahLabel, selectedMealDef.label]);

  if (!verse) return null;

  const palette = CARD_PALETTES[cardTheme];

  const renderCardBlob = async (): Promise<Blob | null> => {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // ignore font wait errors
      }
    }

    const width = 1080;
    const paddingX = 96;
    const contentWidth = width - paddingX * 2;

    const arabicFontStack = resolveArabicFontFamily(settings.arabicFont);
    const turkishFontStack = '"Plus Jakarta Sans", "Inter", system-ui, sans-serif';

    // Ölçüm için geçici canvas
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = width;
    measureCanvas.height = 100;
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) return null;

    const includeAr = contentMode === 'both' || contentMode === 'ar';
    const includeMeal = contentMode === 'both' || contentMode === 'meal';

    const arabicLength = verse.ar.t.length;
    const arabicFontSize =
      contentMode === 'ar'
        ? arabicLength > 260
          ? 42
          : arabicLength > 140
            ? 50
            : 58
        : arabicLength > 260
          ? 38
          : arabicLength > 140
            ? 44
            : 52;
    const arabicLineHeight = Math.round(arabicFontSize * 1.9);

    const mealLength = activeMealText.length;
    const mealFontSize =
      contentMode === 'meal'
        ? mealLength > 340
          ? 30
          : mealLength > 180
            ? 35
            : 40
        : mealLength > 340
          ? 27
          : mealLength > 180
            ? 31
            : 34;
    const mealLineHeight = Math.round(mealFontSize * 1.62);

    let arLines: string[] = [];
    if (includeAr) {
      mCtx.font = `400 ${arabicFontSize}px ${arabicFontStack}`;
      arLines = wrapCanvasText(mCtx, verse.ar.t, contentWidth - 20);
    }

    let mealLines: string[] = [];
    if (includeMeal && activeMealText) {
      mCtx.font = `500 ${mealFontSize}px ${turkishFontStack}`;
      mealLines = wrapCanvasText(mCtx, `“${activeMealText}”`, contentWidth - 20);
    }

    const headerHeight = 205;
    const footerHeight = 160;
    const arBlockHeight = includeAr ? arLines.length * arabicLineHeight + 24 : 0;
    const dividerHeight = includeAr && includeMeal ? 56 : 0;
    const mealBlockHeight = includeMeal ? mealLines.length * mealLineHeight + 36 : 0;
    const dynamicHeight = Math.max(
      1180,
      headerHeight + arBlockHeight + dividerHeight + mealBlockHeight + footerHeight + 120,
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = dynamicHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Arka Plan Gradyanı
    const bgGrad = ctx.createLinearGradient(0, 0, width, dynamicHeight);
    bgGrad.addColorStop(0, palette.bgStart);
    bgGrad.addColorStop(1, palette.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, dynamicHeight);

    // 2. Zarif Çift Çerçeve
    ctx.strokeStyle = palette.frameOuter;
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 42, 42, width - 84, dynamicHeight - 84, 34);
    ctx.stroke();

    ctx.strokeStyle = palette.frameInner;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 56, 56, width - 112, dynamicHeight - 112, 26);
    ctx.stroke();

    // 3. Üst Sure Rozeti
    const badgeText = surahLabel.toUpperCase();
    ctx.font = `700 22px ${turkishFontStack}`;
    const badgeW = Math.min(contentWidth, ctx.measureText(badgeText).width + 64);
    const badgeX = (width - badgeW) / 2;
    const badgeY = 104;
    ctx.fillStyle = palette.badgeBg;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, 54, 27);
    ctx.fill();

    ctx.fillStyle = palette.badgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, width / 2, badgeY + 28);

    // Opsiyonel Arapça Sure Adı
    if (safeArabicSurah) {
      ctx.font = '400 32px "Arakom Nesih", "Şeyh Hamdullah Kitap", Tahoma, sans-serif';
      ctx.fillStyle = palette.mutedColor;
      ctx.direction = 'rtl';
      ctx.fillText(safeArabicSurah, width / 2, badgeY + 92);
      ctx.direction = 'ltr';
    }

    // Dikey ortalama hesabı
    const bodyTotalH = arBlockHeight + dividerHeight + mealBlockHeight;
    const availableStart = headerHeight + 36;
    const availableEnd = dynamicHeight - footerHeight;
    let cursorY =
      availableStart + Math.max(0, (availableEnd - availableStart - bodyTotalH) / 2);

    // 4. Arapça Metin
    if (includeAr && arLines.length > 0) {
      ctx.font = `400 ${arabicFontSize}px ${arabicFontStack}`;
      ctx.fillStyle = palette.arabicColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.direction = 'rtl';

      for (const line of arLines) {
        ctx.fillText(line, width / 2, cursorY);
        cursorY += arabicLineHeight;
      }
      ctx.direction = 'ltr';
      cursorY += 20;
    }

    // 5. Ayırıcı Süs Çizgisi
    if (includeAr && includeMeal) {
      const lineY = cursorY + 20;
      ctx.strokeStyle = palette.dividerColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 140, lineY);
      ctx.lineTo(width / 2 - 24, lineY);
      ctx.moveTo(width / 2 + 24, lineY);
      ctx.lineTo(width / 2 + 140, lineY);
      ctx.stroke();

      ctx.fillStyle = palette.frameOuter;
      ctx.beginPath();
      ctx.arc(width / 2, lineY, 5, 0, Math.PI * 2);
      ctx.fill();

      cursorY += dividerHeight;
    }

    // 6. Türkçe Meal
    if (includeMeal && mealLines.length > 0) {
      ctx.font = `500 ${mealFontSize}px ${turkishFontStack}`;
      ctx.fillStyle = palette.mealColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (const line of mealLines) {
        ctx.fillText(line, width / 2, cursorY);
        cursorY += mealLineHeight;
      }

      ctx.font = `600 22px ${turkishFontStack}`;
      ctx.fillStyle = palette.mutedColor;
      ctx.fillText(`— ${activeMealLabel}`, width / 2, cursorY + 14);
    }

    // 7. Alt İmza
    const footerY = dynamicHeight - 108;
    ctx.strokeStyle = palette.dividerColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX + 80, footerY - 22);
    ctx.lineTo(width - paddingX - 80, footerY - 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 24px ${turkishFontStack}`;
    ctx.fillStyle = palette.badgeText;
    ctx.fillText("Muallimun Kur'an & Meal", width / 2, footerY + 6);

    ctx.font = `500 20px ${turkishFontStack}`;
    ctx.fillStyle = palette.mutedColor;
    ctx.fillText('https://kuran.muallimun.net', width / 2, footerY + 38);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1);
    });
  };

  const handleDownloadPng = async () => {
    setIsRendering(true);
    setStatusMessage(null);
    try {
      const blob = await renderCardBlob();
      if (!blob) {
        setStatusMessage('Kart görseli oluşturulamadı. Lütfen tekrar deneyin.');
        return;
      }
      sfxService.play('success');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `muallimun-s${String(verse.surah).padStart(3, '0')}-a${String(verse.ayah).padStart(3, '0')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatusMessage('PNG ayet kartı indirildi.');
    } catch {
      setStatusMessage('Görsel indirilirken bir sorun oluştu.');
    } finally {
      setIsRendering(false);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareTextPayload);
      sfxService.play('click');
      setCopied(true);
      setStatusMessage('Ayet metni panoya kopyalandı.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatusMessage('Panoya kopyalama izni verilemedi.');
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      await handleCopyText();
      return;
    }

    setIsRendering(true);
    setStatusMessage(null);
    try {
      const blob = await renderCardBlob();
      const fileName = `muallimun-${verse.surah}-${verse.ayah}.png`;
      if (blob && typeof File !== 'undefined') {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: surahLabel,
            text: shareTextPayload,
            files: [file],
          });
          sfxService.play('success');
          return;
        }
      }
      await navigator.share({
        title: surahLabel,
        text: shareTextPayload,
      });
      sfxService.play('success');
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (!isAbort) {
        await handleCopyText();
      }
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verse-share-modal-title"
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand-primary-text)]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ayet Paylaşım Kartı</span>
            </div>
            <h2
              id="verse-share-modal-title"
              className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] truncate"
            >
              {surahLabel}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Paylaşım penceresini kapat"
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-soft)] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gövde */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {/* İçerik Seçici */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Paylaşılacak İçerik
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'both', label: 'Arapça + Meal' },
                  { id: 'ar', label: 'Sadece Arapça' },
                  { id: 'meal', label: 'Sadece Meal' },
                ] as const
              ).map((item) => {
                const active = contentMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setContentMode(item.id);
                    }}
                    className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all cursor-pointer ${
                      active
                        ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                        : 'bg-[var(--bg-surface-soft)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tema ve Meal Kaynağı Seçici */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Kart Teması
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(['cream', 'emerald', 'dark'] as const).map((tKey) => {
                  const p = CARD_PALETTES[tKey];
                  const active = cardTheme === tKey;
                  return (
                    <button
                      key={tKey}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setCardTheme(tKey);
                      }}
                      className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        active
                          ? 'ring-2 ring-[var(--brand-primary)] border-[var(--brand-primary)] text-[var(--text-primary)] bg-[var(--brand-primary-soft)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface-soft)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {contentMode !== 'ar' && (
              <div className="space-y-2">
                <label
                  htmlFor="share-meal-select"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]"
                >
                  Meal &amp; Tefsir Kaynağı ({allMeals.length} Eser)
                </label>
                <select
                  id="share-meal-select"
                  value={mealPick}
                  onChange={(e) => {
                    sfxService.play('click');
                    setMealPick(e.target.value);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border bg-[var(--bg-surface-soft)] text-[var(--text-primary)] border-[var(--border-subtle)] cursor-pointer focus:outline-none focus:border-[var(--brand-primary)]"
                >
                  {allMeals.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Canlı Kart Önizlemesi */}
          <div
            className={`relative rounded-2xl border-2 p-5 sm:p-7 shadow-lg transition-colors ${palette.previewClass}`}
          >
            <div className="rounded-xl border border-current/15 p-4 sm:p-6 flex flex-col items-center text-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <span
                  className="px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-extrabold tracking-wide uppercase"
                  style={{ backgroundColor: palette.badgeBg, color: palette.badgeText }}
                >
                  {surahLabel}
                </span>
                {safeArabicSurah && (
                  <span
                    className="arabic-title text-base sm:text-lg"
                    style={{ color: palette.mutedColor }}
                  >
                    {safeArabicSurah}
                  </span>
                )}
              </div>

              {(contentMode === 'both' || contentMode === 'ar') && (
                <p
                  className="arabic-text text-center w-full break-words"
                  style={{
                    color: palette.arabicColor,
                    fontSize: `${Math.min(34, Math.max(22, settings.arabicFontSize))}px`,
                  }}
                >
                  {verse.ar.t}
                </p>
              )}

              {contentMode === 'both' && (
                <div className="flex items-center justify-center gap-3 w-40 opacity-75">
                  <span className="h-px flex-1" style={{ backgroundColor: palette.dividerColor }} />
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: palette.frameOuter }}
                  />
                  <span className="h-px flex-1" style={{ backgroundColor: palette.dividerColor }} />
                </div>
              )}

              {(contentMode === 'both' || contentMode === 'meal') && activeMealText && (() => {
                const mealPres = getMealTextPresentation(selectedMealDef, 16);
                return (
                  <div className="space-y-2 max-w-xl w-full">
                    <p
                      dir={mealPres.dir}
                      lang={mealPres.lang}
                      className={
                        mealPres.isRtl
                          ? 'text-center leading-[2.0] font-normal'
                          : 'turkish-reading text-sm sm:text-base font-medium leading-relaxed'
                      }
                      style={{
                        color: palette.mealColor,
                        fontFamily: mealPres.fontFamily,
                        fontSize: mealPres.isRtl ? `${mealPres.fontSizePx}px` : undefined,
                      }}
                    >
                      {mealPres.isRtl ? activeMealText : `“${activeMealText}”`}
                    </p>
                    <p className="text-xs font-semibold" style={{ color: palette.mutedColor }}>
                      — {activeMealLabel}
                    </p>
                  </div>
                );
              })()}

              <div className="pt-3 mt-1 border-t border-current/15 w-full flex flex-col items-center">
                <span className="text-xs font-extrabold" style={{ color: palette.badgeText }}>
                  Muallimun Kur’an &amp; Meal
                </span>
                <span className="text-[11px]" style={{ color: palette.mutedColor }}>
                  https://kuran.muallimun.net
                </span>
              </div>
            </div>
          </div>

          {statusMessage && (
            <p className="text-xs font-semibold text-center text-[var(--brand-primary-text)] bg-[var(--brand-primary-soft)] rounded-xl py-2 px-3">
              {statusMessage}
            </p>
          )}
        </div>

        {/* Alt Aksiyon Çubuğu */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-soft)] flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isRendering}
            onClick={() => void handleDownloadPng()}
            className="flex-1 min-w-[175px] min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            {isRendering ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <Download className="w-4.5 h-4.5" />
            )}
            <span>PNG Kart İndir</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyText()}
            className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)] text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[var(--state-success)]" />
                <span>Kopyalandı</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Metni Kopyala</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isRendering}
            onClick={() => void handleNativeShare()}
            className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--brand-primary-text)] hover:border-[var(--brand-primary)] text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Share2 className="w-4 h-4" />
            <span>Paylaş</span>
          </button>
        </div>
      </div>
    </div>
  );
};
