import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Link2,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  getIconUrl,
  getLocalIconUrl,
  resolveArabicFontFamily,
} from '../config/assetsConfig';
import {
  findMealById,
  getAllMeals,
  getMealTextPresentation,
  isExtraMealId,
} from '../config/mealsConfig';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { dataService } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { CombinedVerse, MealVerse, SurahMeta } from '../types/quran';
import { formatSafeArabicTitle, formatSurahTitle } from '../utils/arabicUtils';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { buildVerseShareUrl, PUBLIC_SITE_HOST } from '../utils/urlDeepLink';

type ShareContentMode = 'both' | 'ar' | 'meal';
type ShareAspectRatio = '4:5' | '9:16' | '1:1';
type ShareCardTheme =
  | 'cream'
  | 'ivory'
  | 'emerald'
  | 'seljuk'
  | 'midnight'
  | 'dark'
  | 'sand'
  | 'olive';

interface VerseShareModalProps {
  verse: CombinedVerse | null;
  surahMeta: SurahMeta | null;
  onClose: () => void;
}

interface AspectPreset {
  id: ShareAspectRatio;
  ratioLabel: string;
  label: string;
  fileTag: string;
  width: number;
  height: number;
}

const CANVAS_WIDTH = 1080;

const ASPECT_PRESETS: readonly AspectPreset[] = [
  {
    id: '4:5',
    ratioLabel: '4:5',
    label: 'Gönderi',
    fileTag: '4x5',
    width: CANVAS_WIDTH,
    height: 1350,
  },
  {
    id: '9:16',
    ratioLabel: '9:16',
    label: 'Hikâye',
    fileTag: '9x16',
    width: CANVAS_WIDTH,
    height: 1920,
  },
  {
    id: '1:1',
    ratioLabel: '1:1',
    label: 'Kare',
    fileTag: '1x1',
    width: CANVAS_WIDTH,
    height: 1080,
  },
] as const;

interface CardPalette {
  id: ShareCardTheme;
  label: string;
  isDark: boolean;
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
}

const CARD_PALETTES: Record<ShareCardTheme, CardPalette> = {
  cream: {
    id: 'cream',
    label: 'Krem Mushaf',
    isDark: false,
    bgStart: '#FDF9F0',
    bgEnd: '#F3E9D6',
    frameOuter: '#C8B28A',
    frameInner: '#DFD0B4',
    badgeBg: '#E5F2EF',
    badgeText: '#0F766E',
    arabicColor: '#1B1610',
    mealColor: '#362F25',
    mutedColor: '#6E5F4B',
    dividerColor: '#D6C3A3',
  },
  ivory: {
    id: 'ivory',
    label: 'İnci Beyazı',
    isDark: false,
    bgStart: '#FFFFFF',
    bgEnd: '#F4F6F5',
    frameOuter: '#CBD5E1',
    frameInner: '#E2E8F0',
    badgeBg: '#E7F5F2',
    badgeText: '#0F766E',
    arabicColor: '#0F172A',
    mealColor: '#334155',
    mutedColor: '#5B6B7F',
    dividerColor: '#CBD5E1',
  },
  emerald: {
    id: 'emerald',
    label: 'Zümrüt Kubbe',
    isDark: true,
    bgStart: '#0B4642',
    bgEnd: '#062927',
    frameOuter: '#F59E0B',
    frameInner: 'rgba(245, 158, 11, 0.38)',
    badgeBg: 'rgba(245, 158, 11, 0.18)',
    badgeText: '#FCD34D',
    arabicColor: '#FFFFFF',
    mealColor: '#E6F4F2',
    mutedColor: '#A7DBD4',
    dividerColor: 'rgba(245, 158, 11, 0.36)',
  },
  seljuk: {
    id: 'seljuk',
    label: 'Selçuklu Çini',
    isDark: true,
    bgStart: '#0E4B63',
    bgEnd: '#082D3D',
    frameOuter: '#38BDF8',
    frameInner: 'rgba(245, 198, 92, 0.35)',
    badgeBg: 'rgba(56, 189, 248, 0.16)',
    badgeText: '#7DD3FC',
    arabicColor: '#F8FAFC',
    mealColor: '#DFF2FA',
    mutedColor: '#A5D5E8',
    dividerColor: 'rgba(56, 189, 248, 0.34)',
  },
  midnight: {
    id: 'midnight',
    label: 'Gece Laciverti',
    isDark: true,
    bgStart: '#131F3A',
    bgEnd: '#091022',
    frameOuter: '#D4AF37',
    frameInner: 'rgba(212, 175, 55, 0.32)',
    badgeBg: 'rgba(212, 175, 55, 0.16)',
    badgeText: '#E8C96D',
    arabicColor: '#FBF8EE',
    mealColor: '#E2E8F0',
    mutedColor: '#A3B1C6',
    dividerColor: 'rgba(212, 175, 55, 0.34)',
  },
  dark: {
    id: 'dark',
    label: 'Gece Siyahı',
    isDark: true,
    bgStart: '#12181B',
    bgEnd: '#090D0F',
    frameOuter: '#2DD4BF',
    frameInner: 'rgba(45, 212, 191, 0.28)',
    badgeBg: 'rgba(45, 212, 191, 0.14)',
    badgeText: '#5EEAD4',
    arabicColor: '#F8FAFC',
    mealColor: '#D4E2E0',
    mutedColor: '#92ADA9',
    dividerColor: 'rgba(45, 212, 191, 0.28)',
  },
  sand: {
    id: 'sand',
    label: 'Sahra Kumtaşı',
    isDark: false,
    bgStart: '#F3E3CE',
    bgEnd: '#E6CEB2',
    frameOuter: '#B08968',
    frameInner: '#C8A889',
    badgeBg: 'rgba(127, 85, 57, 0.14)',
    badgeText: '#6F452B',
    arabicColor: '#26190E',
    mealColor: '#402C1B',
    mutedColor: '#6E5037',
    dividerColor: '#C7A684',
  },
  olive: {
    id: 'olive',
    label: 'Zeytin Yaprağı',
    isDark: false,
    bgStart: '#EEF3EC',
    bgEnd: '#DDE8D9',
    frameOuter: '#52796F',
    frameInner: '#94B4A3',
    badgeBg: 'rgba(47, 82, 69, 0.12)',
    badgeText: '#274C3F',
    arabicColor: '#14261E',
    mealColor: '#264035',
    mutedColor: '#4D6B5E',
    dividerColor: '#A3BEAF',
  },
};

const CARD_PALETTE_ORDER: readonly ShareCardTheme[] = [
  'cream',
  'ivory',
  'emerald',
  'seljuk',
  'midnight',
  'dark',
  'sand',
  'olive',
] as const;

const MIN_TEXT_SCALE = 0.7;
const MAX_TEXT_SCALE = 1.45;
const TEXT_SCALE_STEP = 0.05;
const TURKISH_CANVAS_FONT = '"Plus Jakarta Sans", "Inter", system-ui, sans-serif';
const RTL_TAFSIR_CANVAS_FONT =
  '"Scheherazade New", "Amiri", "Amiri Quran", "Şeyh Hamdullah Kitap", serif';

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sharedMeasureCtx) {
    const c = document.createElement('canvas');
    c.width = CANVAS_WIDTH;
    c.height = 40;
    sharedMeasureCtx = c.getContext('2d');
  }
  return sharedMeasureCtx;
}

let cachedShareIconImg: HTMLImageElement | null | undefined = undefined;
let pendingShareIconPromise: Promise<HTMLImageElement | null> | null = null;

function loadImageWithTimeout(
  url: string,
  useCrossOrigin: boolean,
  timeoutMs = 3500,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (useCrossOrigin) {
      img.crossOrigin = 'anonymous';
    }
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        finish(img);
      } else {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

async function loadShareAppIcon(): Promise<HTMLImageElement | null> {
  if (cachedShareIconImg !== undefined) {
    return cachedShareIconImg;
  }
  if (pendingShareIconPromise) {
    return pendingShareIconPromise;
  }

  pendingShareIconPromise = (async () => {
    const localUrl = getLocalIconUrl('icon-192.png');
    const localImg = await loadImageWithTimeout(localUrl, false);
    if (localImg) {
      cachedShareIconImg = localImg;
      return localImg;
    }

    const remoteUrl = getIconUrl('icon-192.png');
    if (remoteUrl !== localUrl) {
      const remoteImg = await loadImageWithTimeout(remoteUrl, true);
      if (remoteImg) {
        cachedShareIconImg = remoteImg;
        return remoteImg;
      }
    }

    cachedShareIconImg = null;
    return null;
  })().finally(() => {
    pendingShareIconPromise = null;
  });

  return pendingShareIconPromise;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D | null,
  text: string,
  maxWidth: number,
  fallbackAvgCharWidth: number,
): string[] {
  const paragraphs = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const measure = (value: string): number =>
    ctx ? ctx.measureText(value).width : value.length * fallbackAvgCharWidth;

  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let current = words[0];

    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
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
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Muallimun Selçuklu yıldızlı açık Mushaf amblemi (CORS / ikon erişim hatasında vektör yedek)
 */
function drawMuallimunVectorBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  const scale = size / 40;
  ctx.scale(scale, scale);

  // Zümrüt yuvarlatılmış kare zemin
  ctx.fillStyle = '#0F766E';
  drawRoundedRect(ctx, 0, 0, 40, 40, 11);
  ctx.fill();

  // 8 köşeli Selçuklu yıldızı
  ctx.beginPath();
  ctx.moveTo(20, 5.5);
  ctx.lineTo(23.8, 11.2);
  ctx.lineTo(30.5, 9.5);
  ctx.lineTo(28.8, 16.2);
  ctx.lineTo(34.5, 20);
  ctx.lineTo(28.8, 23.8);
  ctx.lineTo(30.5, 30.5);
  ctx.lineTo(23.8, 28.8);
  ctx.lineTo(20, 34.5);
  ctx.lineTo(16.2, 28.8);
  ctx.lineTo(9.5, 30.5);
  ctx.lineTo(11.2, 23.8);
  ctx.lineTo(5.5, 20);
  ctx.lineTo(11.2, 16.2);
  ctx.lineTo(9.5, 9.5);
  ctx.lineTo(16.2, 11.2);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // Açık Mushaf sayfaları
  ctx.beginPath();
  ctx.moveTo(11.5, 15.2);
  ctx.bezierCurveTo(14.5, 14.3, 17.8, 14.8, 20, 16.6);
  ctx.bezierCurveTo(22.2, 14.8, 25.5, 14.3, 28.5, 15.2);
  ctx.bezierCurveTo(29.1, 15.4, 29.5, 15.9, 29.5, 16.5);
  ctx.lineTo(29.5, 26.2);
  ctx.bezierCurveTo(29.5, 26.9, 28.9, 27.4, 28.2, 27.3);
  ctx.bezierCurveTo(25.4, 26.7, 22.3, 27.2, 20, 28.7);
  ctx.bezierCurveTo(17.7, 27.2, 14.6, 26.7, 11.8, 27.3);
  ctx.bezierCurveTo(11.1, 27.4, 10.5, 26.9, 10.5, 26.2);
  ctx.lineTo(10.5, 16.5);
  ctx.bezierCurveTo(10.5, 15.9, 10.9, 15.4, 11.5, 15.2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.fill();

  // Orta cilt çizgisi
  ctx.beginPath();
  ctx.moveTo(20, 16.4);
  ctx.lineTo(20, 27.4);
  ctx.strokeStyle = '#0F766E';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Üst altın nokta
  ctx.beginPath();
  ctx.arc(20, 11.2, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = '#FBBF24';
  ctx.fill();

  ctx.restore();
}

interface ComputedCardLayout {
  width: number;
  targetHeight: number;
  canvasHeight: number;
  paddingX: number;
  contentWidth: number;
  headerHeight: number;
  footerHeight: number;
  arabicFontSize: number;
  arabicLineHeight: number;
  mealFontSize: number;
  mealLineHeight: number;
  arLines: string[];
  mealLines: string[];
  arBlockHeight: number;
  dividerHeight: number;
  mealBlockHeight: number;
  bodyTotalH: number;
  isOverflowExpanded: boolean;
  wasAutoShrunk: boolean;
}

function computeCardLayout(params: {
  aspectRatio: ShareAspectRatio;
  contentMode: ShareContentMode;
  arabicText: string;
  mealText: string;
  isRtlMeal: boolean;
  arabicFontStack: string;
  arabicScale: number;
  mealScale: number;
  hasArabicSurah: boolean;
  measureCtx: CanvasRenderingContext2D | null;
}): ComputedCardLayout {
  const {
    aspectRatio,
    contentMode,
    arabicText,
    mealText,
    isRtlMeal,
    arabicFontStack,
    arabicScale,
    mealScale,
    hasArabicSurah,
    measureCtx,
  } = params;

  const preset = ASPECT_PRESETS.find((p) => p.id === aspectRatio) ?? ASPECT_PRESETS[0];
  const width = preset.width;
  const targetHeight = preset.height;
  const paddingX = 96;
  const contentWidth = width - paddingX * 2;
  const wrapWidth = contentWidth - 20;

  const includeAr = (contentMode === 'both' || contentMode === 'ar') && Boolean(arabicText.trim());
  const includeMeal =
    (contentMode === 'both' || contentMode === 'meal') && Boolean(mealText.trim());

  const aspectFontMultiplier = aspectRatio === '1:1' ? 0.93 : aspectRatio === '9:16' ? 1.05 : 1.0;

  const arabicLen = arabicText.length;
  const baseArabic =
    (contentMode === 'ar'
      ? arabicLen > 280
        ? 44
        : arabicLen > 140
          ? 52
          : 62
      : arabicLen > 280
        ? 38
        : arabicLen > 140
          ? 46
          : 54) * aspectFontMultiplier;

  const mealLen = mealText.length;
  const baseMealRaw =
    (contentMode === 'meal'
      ? mealLen > 360
        ? 30
        : mealLen > 190
          ? 36
          : 42
      : mealLen > 360
        ? 26
        : mealLen > 190
          ? 31
          : 35) * aspectFontMultiplier;

  const baseMeal = isRtlMeal ? baseMealRaw * 1.24 : baseMealRaw;

  const desiredArabicSize = Math.round(baseArabic * arabicScale);
  const desiredMealSize = Math.round(baseMeal * mealScale);

  const minArabicFloor = 28;
  const minMealFloor = isRtlMeal ? 25 : 21;

  const headerHeight =
    (aspectRatio === '9:16' ? 238 : aspectRatio === '1:1' ? 196 : 212) - (hasArabicSurah ? 0 : 28);
  const footerHeight = aspectRatio === '9:16' ? 218 : aspectRatio === '1:1' ? 186 : 196;
  const bodyVerticalMargin = 48;
  const maxBodyFitHeight = Math.max(300, targetHeight - headerHeight - footerHeight - bodyVerticalMargin);

  const mealDisplayText = isRtlMeal ? mealText.trim() : `“${mealText.trim()}”`;
  const mealFontStack = isRtlMeal ? RTL_TAFSIR_CANVAS_FONT : TURKISH_CANVAS_FONT;
  const mealLineHeightFactor = isRtlMeal ? 1.88 : 1.6;
  const arabicLineHeightFactor = 1.88;

  const measureForShrink = (shrink: number) => {
    const arSize = Math.max(minArabicFloor, Math.round(desiredArabicSize * shrink));
    const mSize = Math.max(minMealFloor, Math.round(desiredMealSize * shrink));
    const arLh = Math.round(arSize * arabicLineHeightFactor);
    const mLh = Math.round(mSize * mealLineHeightFactor);

    let arLines: string[] = [];
    if (includeAr) {
      if (measureCtx) {
        measureCtx.font = `400 ${arSize}px ${arabicFontStack}`;
      }
      arLines = wrapCanvasText(measureCtx, arabicText, wrapWidth, arSize * 0.45);
    }

    let mealLines: string[] = [];
    if (includeMeal) {
      if (measureCtx) {
        measureCtx.font = `${isRtlMeal ? '400' : '500'} ${mSize}px ${mealFontStack}`;
      }
      mealLines = wrapCanvasText(
        measureCtx,
        mealDisplayText,
        wrapWidth,
        mSize * (isRtlMeal ? 0.46 : 0.52),
      );
    }

    const arBlockH = includeAr ? arLines.length * arLh + 16 : 0;
    const divH = includeAr && includeMeal ? 54 : 0;
    const mealLabelH = includeMeal ? 44 : 0;
    const mealBlockH = includeMeal ? mealLines.length * mLh + mealLabelH : 0;
    const bodyTotalH = arBlockH + divH + mealBlockH;

    return {
      arabicFontSize: arSize,
      arabicLineHeight: arLh,
      mealFontSize: mSize,
      mealLineHeight: mLh,
      arLines,
      mealLines,
      arBlockHeight: arBlockH,
      dividerHeight: divH,
      mealBlockHeight: mealBlockH,
      bodyTotalH,
    };
  };

  const shrinkSteps = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58];
  let chosen = measureForShrink(1);
  let wasAutoShrunk = false;

  for (let i = 1; i < shrinkSteps.length; i += 1) {
    if (chosen.bodyTotalH <= maxBodyFitHeight) break;
    chosen = measureForShrink(shrinkSteps[i]);
    wasAutoShrunk = true;
  }

  const isOverflowExpanded = chosen.bodyTotalH > maxBodyFitHeight;
  const canvasHeight = isOverflowExpanded
    ? Math.ceil(headerHeight + chosen.bodyTotalH + footerHeight + 76)
    : targetHeight;

  return {
    width,
    targetHeight,
    canvasHeight,
    paddingX,
    contentWidth,
    headerHeight,
    footerHeight,
    ...chosen,
    isOverflowExpanded,
    wasAutoShrunk,
  };
}

const AspectRatioIcon: React.FC<{ ratio: ShareAspectRatio; active: boolean }> = ({
  ratio,
  active,
}) => {
  const strokeClass = active ? 'border-white' : 'border-current opacity-80';
  if (ratio === '4:5') {
    return <span className={`inline-block w-3 h-3.5 rounded-[2px] border-[1.75px] ${strokeClass}`} />;
  }
  if (ratio === '9:16') {
    return <span className={`inline-block w-2.5 h-4 rounded-[2px] border-[1.75px] ${strokeClass}`} />;
  }
  return <span className={`inline-block w-3.5 h-3.5 rounded-[2px] border-[1.75px] ${strokeClass}`} />;
};

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
  const [aspectRatio, setAspectRatio] = useState<ShareAspectRatio>('4:5');
  const [cardTheme, setCardTheme] = useState<ShareCardTheme>('cream');
  const [mealPick, setMealPick] = useState<string>(settings.primaryMealId || 'm1');
  const [arabicScale, setArabicScale] = useState<number>(1);
  const [mealScale, setMealScale] = useState<number>(1);

  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isLoadingExtraMeal, setIsLoadingExtraMeal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fontsReadyTick, setFontsReadyTick] = useState(0);
  const [iconStage, setIconStage] = useState<'local' | 'cdn' | 'vector'>('local');

  const previewCardRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number>(300);

  const canCopyImage = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof ClipboardItem !== 'undefined' &&
      Boolean(navigator.clipboard?.write),
    [],
  );

  useEffect(() => {
    if (!verse) return;
    setMealPick(settings.primaryMealId || 'm1');
    setCopied(false);
    setCopiedLink(false);
    setCopiedImage(false);
    setStatusMessage(null);
  }, [verse, settings.primaryMealId]);

  useEffect(() => {
    if (!verse || !isExtraMealId(mealPick)) {
      setIsLoadingExtraMeal(false);
      return;
    }
    if (dataService.hasExtraMealsLoaded(verse.surah)) {
      setIsLoadingExtraMeal(false);
      return;
    }
    let cancelled = false;
    setIsLoadingExtraMeal(true);
    dataService
      .loadExtraMealsForSurah(verse.surah)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsLoadingExtraMeal(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [verse, mealPick]);

  useEffect(() => {
    if (!verse || !document.fonts?.ready) return;
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (!cancelled) {
          setFontsReadyTick((n) => n + 1);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [verse, settings.arabicFont]);

  useBackButtonGuard('verse_share_modal', Boolean(verse), onClose);

  useEffect(() => {
    if (!verse) return;
    return acquireBodyScrollLock();
  }, [verse]);

  const selectedMealDef = useMemo(
    () => findMealById(mealPick, manifest),
    [mealPick, manifest],
  );

  const resolvedMealInfo = useMemo(() => {
    void extraVersion;
    if (!verse) {
      return {
        mealDef: selectedMealDef,
        mealVerse: null as MealVerse | null,
        text: '',
        isFallback: false,
        isLoading: false,
      };
    }

    const picked = dataService.getMealVerse(verse.surah, verse.ayah, mealPick, verse);
    if (picked && picked.t.trim()) {
      return {
        mealDef: selectedMealDef,
        mealVerse: picked,
        text: picked.t.trim(),
        isFallback: false,
        isLoading: false,
      };
    }

    if (isExtraMealId(mealPick) && isLoadingExtraMeal) {
      return {
        mealDef: selectedMealDef,
        mealVerse: null as MealVerse | null,
        text: '',
        isFallback: false,
        isLoading: true,
      };
    }

    // Seçili eserde bu ayet için kayıt yoksa yedek mealin KENDİ adını ve yönünü kullan (yanlış atfı önle)
    if (verse.m1?.t?.trim()) {
      return {
        mealDef: findMealById('m1', manifest),
        mealVerse: verse.m1,
        text: verse.m1.t.trim(),
        isFallback: mealPick !== 'm1',
        isLoading: false,
      };
    }
    if (verse.m2?.t?.trim()) {
      return {
        mealDef: findMealById('m2', manifest),
        mealVerse: verse.m2,
        text: verse.m2.t.trim(),
        isFallback: mealPick !== 'm2',
        isLoading: false,
      };
    }

    return {
      mealDef: selectedMealDef,
      mealVerse: null as MealVerse | null,
      text: '',
      isFallback: false,
      isLoading: false,
    };
  }, [verse, mealPick, selectedMealDef, extraVersion, isLoadingExtraMeal, manifest]);

  const activeMealText = resolvedMealInfo.text;
  const resolvedMealDef = resolvedMealInfo.mealDef;

  const mealPres = useMemo(
    () => getMealTextPresentation(resolvedMealDef, 16),
    [resolvedMealDef],
  );

  const arabicFontStack = useMemo(
    () => resolveArabicFontFamily(settings.arabicFont),
    [settings.arabicFont],
  );

  const activeMealLabel = resolvedMealDef.label;
  const combinedRange =
    contentMode !== 'ar' &&
    resolvedMealInfo.mealVerse?.mg &&
    resolvedMealInfo.mealVerse.mg[0] !== resolvedMealInfo.mealVerse.mg[1]
      ? resolvedMealInfo.mealVerse.mg
      : null;

  const baseSurahTitle = surahMeta
    ? formatSurahTitle(surahMeta.nameTr, surahMeta.no)
    : verse
      ? `${verse.surah}. Sure`
      : '';

  const surahLabel = verse
    ? combinedRange
      ? `${baseSurahTitle}, ${combinedRange[0]}–${combinedRange[1]}. Ayetler (Birleşik Meal)`
      : `${baseSurahTitle}, ${verse.ayah}. Ayet`
    : '';
  const safeArabicSurah = surahMeta ? formatSafeArabicTitle(surahMeta.nameAr) : '';

  const verseShareUrl = useMemo(
    () => (verse ? buildVerseShareUrl(verse.surah, verse.ayah) : `https://${PUBLIC_SITE_HOST}`),
    [verse],
  );

  const shareTextPayload = useMemo(() => {
    if (!verse) return '';
    const parts: string[] = [];
    if (contentMode === 'both' || contentMode === 'ar') {
      parts.push(verse.ar.t);
    }
    if (contentMode === 'both' || contentMode === 'meal') {
      if (activeMealText) {
        parts.push(mealPres.isRtl ? activeMealText : `"${activeMealText}"`);
      }
    }
    const mealSuffix = contentMode === 'ar' ? '' : ` • ${resolvedMealDef.label}`;
    parts.push(`— ${surahLabel}${mealSuffix}`);
    parts.push(verseShareUrl);
    return parts.join('\n\n');
  }, [verse, contentMode, activeMealText, mealPres.isRtl, surahLabel, resolvedMealDef.label, verseShareUrl]);

  const layout = useMemo(() => {
    void fontsReadyTick;
    return computeCardLayout({
      aspectRatio,
      contentMode,
      arabicText: verse?.ar.t ?? '',
      mealText: activeMealText,
      isRtlMeal: mealPres.isRtl,
      arabicFontStack,
      arabicScale,
      mealScale,
      hasArabicSurah: Boolean(safeArabicSurah),
      measureCtx: getMeasureContext(),
    });
  }, [
    fontsReadyTick,
    aspectRatio,
    contentMode,
    verse?.ar.t,
    activeMealText,
    mealPres.isRtl,
    arabicFontStack,
    arabicScale,
    mealScale,
    safeArabicSurah,
  ]);

  useEffect(() => {
    if (!verse) return;
    const node = previewCardRef.current;
    if (!node) return;

    const updateWidth = () => {
      const next = node.clientWidth;
      if (next > 40) {
        setPreviewWidth(next);
      }
    };

    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [verse, aspectRatio, layout.isOverflowExpanded]);

  if (!verse) return null;

  const palette = CARD_PALETTES[cardTheme];
  const activeAspectPreset = ASPECT_PRESETS.find((p) => p.id === aspectRatio) ?? ASPECT_PRESETS[0];
  const isScaleCustomized =
    Math.abs(arabicScale - 1) > 0.001 || Math.abs(mealScale - 1) > 0.001;

  const previewScale = Math.max(0.15, Math.min(0.45, previewWidth / CANVAS_WIDTH));
  const localIconUrl = getLocalIconUrl('icon-192.png');
  const cdnIconUrl = getIconUrl('icon-192.png');
  const previewIconSrc = iconStage === 'local' ? localIconUrl : cdnIconUrl;

  const adjustArabicScale = (delta: number) => {
    sfxService.play('click');
    setArabicScale((prev) =>
      Number(Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, prev + delta)).toFixed(2)),
    );
  };

  const adjustMealScale = (delta: number) => {
    sfxService.play('click');
    setMealScale((prev) =>
      Number(Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, prev + delta)).toFixed(2)),
    );
  };

  const handleResetScales = () => {
    sfxService.play('click');
    setArabicScale(1);
    setMealScale(1);
  };

  const renderCardBlob = async (forceVectorIcon = false): Promise<Blob | null> => {
    if (typeof document !== 'undefined' && document.fonts) {
      try {
        const fontLoads: Promise<unknown>[] = [];
        if (typeof document.fonts.load === 'function') {
          fontLoads.push(document.fonts.load(`400 48px ${arabicFontStack}`));
          fontLoads.push(document.fonts.load('400 32px "Arakom Nesih"'));
          fontLoads.push(document.fonts.load(`700 22px ${TURKISH_CANVAS_FONT}`));
          fontLoads.push(document.fonts.load(`500 32px ${TURKISH_CANVAS_FONT}`));
          if (mealPres.isRtl) {
            fontLoads.push(document.fonts.load(`400 36px ${RTL_TAFSIR_CANVAS_FONT}`));
          }
        }
        if (fontLoads.length > 0) {
          await Promise.allSettled(fontLoads);
        }
        await document.fonts.ready;
      } catch {
        // ignore font readiness error
      }
    }

    const iconImg = forceVectorIcon ? null : await loadShareAppIcon();

    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = CANVAS_WIDTH;
    measureCanvas.height = 60;
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) return null;

    const currentLayout = computeCardLayout({
      aspectRatio,
      contentMode,
      arabicText: verse.ar.t,
      mealText: activeMealText,
      isRtlMeal: mealPres.isRtl,
      arabicFontStack,
      arabicScale,
      mealScale,
      hasArabicSurah: Boolean(safeArabicSurah),
      measureCtx: mCtx,
    });

    const { width, canvasHeight, paddingX, contentWidth, headerHeight, footerHeight } =
      currentLayout;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Arka Plan Gradyanı
    const bgGrad = ctx.createLinearGradient(0, 0, width, canvasHeight);
    bgGrad.addColorStop(0, palette.bgStart);
    bgGrad.addColorStop(1, palette.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, canvasHeight);

    // 2. Zarif Çift Çerçeve
    ctx.strokeStyle = palette.frameOuter;
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 40, 40, width - 80, canvasHeight - 80, 34);
    ctx.stroke();

    ctx.strokeStyle = palette.frameInner;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 54, 54, width - 108, canvasHeight - 108, 26);
    ctx.stroke();

    // 3. Üst Sure Rozeti
    const badgeText = surahLabel.toUpperCase();
    ctx.font = `700 22px ${TURKISH_CANVAS_FONT}`;
    const badgeW = Math.min(contentWidth, ctx.measureText(badgeText).width + 64);
    const badgeX = (width - badgeW) / 2;
    const badgeY = aspectRatio === '9:16' ? 112 : 96;
    ctx.fillStyle = palette.badgeBg;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, 52, 26);
    ctx.fill();

    ctx.fillStyle = palette.badgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    ctx.fillText(badgeText, width / 2, badgeY + 27);

    // Opsiyonel Arapça Sure Adı
    if (safeArabicSurah) {
      ctx.font = '400 32px "Arakom Nesih", "Şeyh Hamdullah Kitap", Tahoma, sans-serif';
      ctx.fillStyle = palette.mutedColor;
      ctx.direction = 'rtl';
      ctx.fillText(safeArabicSurah, width / 2, badgeY + 86);
      ctx.direction = 'ltr';
    }

    // Dikey ortalama hesabı (Header ile Footer arasında dengeli yerleşim)
    const availableStart = headerHeight + 24;
    const availableEnd = canvasHeight - footerHeight - 16;
    let cursorY =
      availableStart +
      Math.max(0, (availableEnd - availableStart - currentLayout.bodyTotalH) / 2);

    const includeAr =
      (contentMode === 'both' || contentMode === 'ar') && currentLayout.arLines.length > 0;
    const includeMeal =
      (contentMode === 'both' || contentMode === 'meal') && currentLayout.mealLines.length > 0;

    // 4. Arapça Ayet Metni
    if (includeAr) {
      ctx.font = `400 ${currentLayout.arabicFontSize}px ${arabicFontStack}`;
      ctx.fillStyle = palette.arabicColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.direction = 'rtl';

      for (const line of currentLayout.arLines) {
        ctx.fillText(line, width / 2, cursorY);
        cursorY += currentLayout.arabicLineHeight;
      }
      ctx.direction = 'ltr';
      cursorY += 16;
    }

    // 5. Ayırıcı Süs Çizgisi
    if (includeAr && includeMeal) {
      const lineY = cursorY + 22;
      ctx.strokeStyle = palette.dividerColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 140, lineY);
      ctx.lineTo(width / 2 - 22, lineY);
      ctx.moveTo(width / 2 + 22, lineY);
      ctx.lineTo(width / 2 + 140, lineY);
      ctx.stroke();

      ctx.fillStyle = palette.frameOuter;
      ctx.beginPath();
      ctx.arc(width / 2, lineY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      cursorY += currentLayout.dividerHeight;
    }

    // 6. Meal / Tefsir Metni (LTR veya RTL Arapça Tefsir desteği)
    if (includeMeal) {
      const mealFontStack = mealPres.isRtl ? RTL_TAFSIR_CANVAS_FONT : TURKISH_CANVAS_FONT;
      ctx.font = `${mealPres.isRtl ? '400' : '500'} ${currentLayout.mealFontSize}px ${mealFontStack}`;
      ctx.fillStyle = palette.mealColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.direction = mealPres.isRtl ? 'rtl' : 'ltr';

      for (const line of currentLayout.mealLines) {
        ctx.fillText(line, width / 2, cursorY);
        cursorY += currentLayout.mealLineHeight;
      }

      ctx.direction = 'ltr';
      ctx.font = `600 22px ${TURKISH_CANVAS_FONT}`;
      ctx.fillStyle = palette.mutedColor;
      ctx.fillText(`— ${activeMealLabel}`, width / 2, cursorY + 14);
    }

    // 7. Alt İmza (Üstte İnce Çizgi, Ortada Uygulama İkonu + kuran.muallimun.net)
    const footerTopY = canvasHeight - footerHeight;
    const dividerY = footerTopY + 18;
    ctx.strokeStyle = palette.dividerColor;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(paddingX + 110, dividerY);
    ctx.lineTo(width - paddingX - 110, dividerY);
    ctx.stroke();

    const iconSize = 54;
    const iconX = (width - iconSize) / 2;
    const iconY = dividerY + 26;

    if (iconImg) {
      ctx.save();
      drawRoundedRect(ctx, iconX, iconY, iconSize, iconSize, 13);
      ctx.clip();
      ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
      ctx.restore();

      ctx.strokeStyle = palette.frameInner;
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, iconX, iconY, iconSize, iconSize, 13);
      ctx.stroke();
    } else {
      drawMuallimunVectorBadge(ctx, iconX, iconY, iconSize);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.direction = 'ltr';
    ctx.font = `600 22px ${TURKISH_CANVAS_FONT}`;
    ctx.fillStyle = palette.mutedColor;
    ctx.fillText(PUBLIC_SITE_HOST, width / 2, iconY + iconSize + 14);

    try {
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        try {
          canvas.toBlob((result) => resolve(result), 'image/png', 1);
        } catch (err) {
          reject(err);
        }
      });
      return blob;
    } catch {
      // CORS kaynaklı SecurityError durumunda vektör Muallimun amblemi ile yeniden üret
      if (!forceVectorIcon) {
        return renderCardBlob(true);
      }
      return null;
    }
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
      link.download = `muallimun-s${String(verse.surah).padStart(3, '0')}-a${String(verse.ayah).padStart(3, '0')}-${activeAspectPreset.fileTag}.png`;
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

  const handleCopyImage = async () => {
    if (!canCopyImage) return;
    setIsRendering(true);
    setStatusMessage(null);
    try {
      const blob = await renderCardBlob();
      if (!blob) {
        setStatusMessage('Kart görseli oluşturulamadı. Lütfen tekrar deneyin.');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      sfxService.play('success');
      setCopiedImage(true);
      setStatusMessage('Ayet kartı görseli panoya kopyalandı. Doğrudan yapıştırabilirsiniz.');
      window.setTimeout(() => setCopiedImage(false), 2200);
    } catch {
      setStatusMessage('Görsel panoya kopyalanamadı. PNG Kart İndir seçeneğini kullanabilirsiniz.');
    } finally {
      setIsRendering(false);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareTextPayload);
      sfxService.play('click');
      setCopied(true);
      setStatusMessage('Ayet metni ve doğrudan bağlantısı panoya kopyalandı.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatusMessage('Panoya kopyalama izni verilemedi.');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(verseShareUrl);
      sfxService.play('click');
      setCopiedLink(true);
      setStatusMessage('Doğrudan ayet bağlantısı panoya kopyalandı.');
      window.setTimeout(() => setCopiedLink(false), 2000);
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
      const fileName = `muallimun-${verse.surah}-${verse.ayah}-${activeAspectPreset.fileTag}.png`;
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

  const showArabicBlock = contentMode === 'both' || contentMode === 'ar';
  const showMealBlock = (contentMode === 'both' || contentMode === 'meal') && Boolean(activeMealText);

  // Canlı önizlemede tüm metin ve boşlukları 1080px kanvas oranıyla birebir ölçekle
  const px = (canvasPx: number) => `${Math.max(1, canvasPx * previewScale).toFixed(2)}px`;
  const previewCardAspectStyle: React.CSSProperties = layout.isOverflowExpanded
    ? {
        width: 'min(100%, 300px)',
        minHeight: `${Math.round(layout.canvasHeight * previewScale)}px`,
        background: `linear-gradient(155deg, ${palette.bgStart} 0%, ${palette.bgEnd} 100%)`,
      }
    : {
        aspectRatio: `${activeAspectPreset.width} / ${activeAspectPreset.height}`,
        height: '100%',
        maxHeight: '100%',
        maxWidth: '100%',
        background: `linear-gradient(155deg, ${palette.bgStart} 0%, ${palette.bgEnd} 100%)`,
      };

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.NESTED_MODAL} flex items-start md:items-center justify-center bg-black/60 backdrop-blur-xs p-0 md:p-4`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verse-share-modal-title"
    >
      <div
        className="w-full h-[100dvh] md:h-auto md:max-h-[92dvh] md:max-w-4xl flex flex-col rounded-none md:rounded-3xl bg-[var(--bg-surface)] border-0 md:border border-[var(--border-subtle)] shadow-2xl overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--brand-primary-text)]">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Ayet Paylaşım Stüdyosu</span>
            </div>
            <h2
              id="verse-share-modal-title"
              className="text-sm sm:text-base md:text-lg font-extrabold text-[var(--text-primary)] truncate"
            >
              {surahLabel}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Paylaşım penceresini kapat"
            className="inline-flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-soft)] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stüdyo Gövdesi: Masaüstünde Sol Önizleme + Sağ Kontroller; Mobilde Üst Önizleme + Alt Kontroller */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
          {/* Sol / Üst: Canlı Kart Sahnesi */}
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-3.5 md:p-5 bg-[var(--bg-surface-soft)] border-b md:border-b-0 md:border-r border-[var(--border-subtle)] shrink-0 md:shrink md:min-h-0 md:overflow-hidden">
            <div
              className={`w-full flex items-center justify-center ${
                layout.isOverflowExpanded
                  ? 'max-h-[38dvh] md:max-h-[60dvh] overflow-y-auto items-start py-1'
                  : 'h-[34dvh] max-h-[38dvh] md:h-[58dvh] md:max-h-[60dvh]'
              }`}
            >
              <div
                ref={previewCardRef}
                className="relative rounded-2xl shadow-xl transition-[background,border-color] duration-200 flex flex-col overflow-hidden mx-auto"
                style={previewCardAspectStyle}
              >
                {/* Dış & İç Zarif Çift Çerçeve */}
                <div
                  className="pointer-events-none absolute"
                  style={{
                    inset: px(40),
                    border: `${Math.max(1, 3 * previewScale).toFixed(2)}px solid ${palette.frameOuter}`,
                    borderRadius: px(34),
                  }}
                />
                <div
                  className="pointer-events-none absolute"
                  style={{
                    inset: px(54),
                    border: `${Math.max(0.75, 1.5 * previewScale).toFixed(2)}px solid ${palette.frameInner}`,
                    borderRadius: px(26),
                  }}
                />

                {/* Kart İçeriği */}
                <div
                  className="relative z-[1] flex-1 flex flex-col justify-between items-center text-center"
                  style={{
                    paddingLeft: px(96),
                    paddingRight: px(96),
                    paddingTop: px(aspectRatio === '9:16' ? 112 : 96),
                    paddingBottom: px(aspectRatio === '9:16' ? 56 : 44),
                  }}
                >
                  {/* Üst Başlık */}
                  <div
                    className="flex flex-col items-center w-full shrink-0"
                    style={{ gap: px(12) }}
                  >
                    <span
                      className="font-bold uppercase tracking-wide inline-flex items-center justify-center max-w-full truncate"
                      style={{
                        backgroundColor: palette.badgeBg,
                        color: palette.badgeText,
                        fontSize: px(22),
                        paddingLeft: px(30),
                        paddingRight: px(30),
                        paddingTop: px(12),
                        paddingBottom: px(12),
                        borderRadius: px(26),
                        lineHeight: 1.15,
                      }}
                    >
                      {surahLabel}
                    </span>
                    {safeArabicSurah && (
                      <span
                        dir="rtl"
                        lang="ar"
                        className="arabic-title"
                        style={{
                          color: palette.mutedColor,
                          fontSize: px(32),
                          lineHeight: 1.35,
                        }}
                      >
                        {safeArabicSurah}
                      </span>
                    )}
                  </div>

                  {/* Orta Metin Alanı (Dikeyde Dengeli) */}
                  <div
                    className="flex-1 flex flex-col items-center justify-center w-full"
                    style={{
                      paddingTop: px(22),
                      paddingBottom: px(22),
                      gap: px(18),
                    }}
                  >
                    {showArabicBlock && (
                      <p
                        dir="rtl"
                        lang="ar"
                        className="text-center w-full break-words"
                        style={{
                          color: palette.arabicColor,
                          fontFamily: arabicFontStack,
                          fontSize: px(layout.arabicFontSize),
                          lineHeight: 1.88,
                        }}
                      >
                        {verse.ar.t}
                      </p>
                    )}

                    {showArabicBlock && showMealBlock && (
                      <div
                        className="flex items-center justify-center shrink-0"
                        style={{ width: px(280), gap: px(18) }}
                      >
                        <span
                          className="flex-1"
                          style={{
                            height: `${Math.max(1, 2 * previewScale).toFixed(2)}px`,
                            backgroundColor: palette.dividerColor,
                          }}
                        />
                        <span
                          className="rounded-full shrink-0"
                          style={{
                            width: px(9),
                            height: px(9),
                            backgroundColor: palette.frameOuter,
                          }}
                        />
                        <span
                          className="flex-1"
                          style={{
                            height: `${Math.max(1, 2 * previewScale).toFixed(2)}px`,
                            backgroundColor: palette.dividerColor,
                          }}
                        />
                      </div>
                    )}

                    {showMealBlock ? (
                      <div
                        className="flex flex-col items-center w-full"
                        style={{ gap: px(14) }}
                      >
                        <p
                          dir={mealPres.dir}
                          lang={mealPres.lang}
                          className="text-center w-full break-words"
                          style={{
                            color: palette.mealColor,
                            fontFamily: mealPres.isRtl
                              ? RTL_TAFSIR_CANVAS_FONT
                              : TURKISH_CANVAS_FONT,
                            fontWeight: mealPres.isRtl ? 400 : 500,
                            fontSize: px(layout.mealFontSize),
                            lineHeight: mealPres.isRtl ? 1.88 : 1.6,
                          }}
                        >
                          {mealPres.isRtl ? activeMealText : `“${activeMealText}”`}
                        </p>
                        <p
                          className="font-semibold text-center"
                          style={{
                            color: palette.mutedColor,
                            fontSize: px(22),
                            lineHeight: 1.25,
                          }}
                        >
                          — {activeMealLabel}
                        </p>
                      </div>
                    ) : (
                      contentMode !== 'ar' &&
                      resolvedMealInfo.isLoading && (
                        <div
                          className="inline-flex items-center gap-1.5 font-semibold"
                          style={{ color: palette.mutedColor, fontSize: px(22) }}
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Seçili eser yükleniyor…</span>
                        </div>
                      )
                    )}
                  </div>

                  {/* Alt İmza: İnce Çizgi + Uygulama İkonu + kuran.muallimun.net */}
                  <div
                    className="flex flex-col items-center w-full shrink-0"
                    style={{ gap: px(12) }}
                  >
                    <div
                      style={{
                        width: '72%',
                        height: `${Math.max(0.75, 1.25 * previewScale).toFixed(2)}px`,
                        backgroundColor: palette.dividerColor,
                        marginBottom: px(10),
                      }}
                    />

                    <div
                      className="overflow-hidden flex items-center justify-center shrink-0"
                      style={{
                        width: px(54),
                        height: px(54),
                        borderRadius: px(13),
                        border: `${Math.max(0.75, 1.5 * previewScale).toFixed(2)}px solid ${palette.frameInner}`,
                      }}
                    >
                      {iconStage === 'vector' ? (
                        <BrandMark className="w-full h-full" />
                      ) : (
                        <img
                          src={previewIconSrc}
                          alt="Muallimun"
                          className="w-full h-full object-cover block"
                          onError={() => {
                            if (iconStage === 'local' && cdnIconUrl !== localIconUrl) {
                              setIconStage('cdn');
                            } else {
                              setIconStage('vector');
                            }
                          }}
                        />
                      )}
                    </div>

                    <span
                      className="font-semibold tracking-wide"
                      style={{
                        color: palette.mutedColor,
                        fontSize: px(22),
                        lineHeight: 1.15,
                      }}
                    >
                      {PUBLIC_SITE_HOST}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sahne Altı Bilgi Satırı */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
              <span className="tabular-nums">
                {activeAspectPreset.ratioLabel} {activeAspectPreset.label} · {layout.width}×
                {layout.canvasHeight}px
              </span>
              {layout.isOverflowExpanded && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--brand-primary-soft)] text-[var(--brand-primary-text)] font-bold">
                  Uzun ayet: tam metin sığdırıldı
                </span>
              )}
              {contentMode !== 'ar' && resolvedMealInfo.isLoading && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] text-[var(--text-secondary)] font-bold">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Seçili eser yükleniyor…
                </span>
              )}
              {contentMode !== 'ar' && resolvedMealInfo.isFallback && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] font-bold">
                  Seçili eserde kayıt yok · {resolvedMealDef.shortLabel} gösteriliyor
                </span>
              )}
            </div>
          </div>

          {/* Sağ / Alt: Stüdyo Özelleştirme Kontrolleri */}
          <div className="p-4 md:p-5 space-y-4 md:overflow-y-auto md:min-h-0">
            {/* 1. İçerik Seçici */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Paylaşılacak İçerik
              </p>
              <div className="grid grid-cols-3 gap-1.5">
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
                      className={`min-h-[40px] px-2 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
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

            {/* 2. Biçim / En-Boy Oranı */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Kart Biçimi (Oran)
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {ASPECT_PRESETS.map((preset) => {
                  const active = aspectRatio === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setAspectRatio(preset.id);
                      }}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                        active
                          ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                          : 'bg-[var(--bg-surface-soft)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <AspectRatioIcon ratio={preset.id} active={active} />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="text-xs font-extrabold tabular-nums">
                          {preset.ratioLabel}
                        </span>
                        <span
                          className={`text-[10px] font-semibold ${
                            active ? 'text-white/85' : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {preset.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Arka Fon (8 Özgün Muallimun Paleti) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Arka Fon
                </p>
                <span className="text-xs font-extrabold text-[var(--brand-primary-text)]">
                  {palette.label}
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-4 lg:grid-cols-8 gap-2">
                {CARD_PALETTE_ORDER.map((themeKey) => {
                  const p = CARD_PALETTES[themeKey];
                  const active = cardTheme === themeKey;
                  return (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setCardTheme(themeKey);
                      }}
                      title={p.label}
                      aria-label={`Arka fon: ${p.label}`}
                      aria-pressed={active}
                      className={`group relative mx-auto w-9 h-9 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                        active
                          ? 'ring-2 ring-offset-2 ring-[var(--brand-primary)] ring-offset-[var(--bg-surface)] scale-105'
                          : 'hover:scale-105 opacity-90 hover:opacity-100'
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${p.bgStart} 0%, ${p.bgEnd} 100%)`,
                        border: `2px solid ${p.frameOuter}`,
                      }}
                    >
                      {active && (
                        <Check
                          className="w-4 h-4 stroke-[2.75]"
                          style={{ color: p.isDark ? '#FFFFFF' : '#0F172A' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Bağımsız Yazı Boyutlandırma (Âyet + Meal) */}
            <div className="space-y-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Yazı Boyutları
                </p>
                <button
                  type="button"
                  onClick={handleResetScales}
                  disabled={!isScaleCustomized}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-[var(--brand-primary-text)] hover:bg-[var(--brand-primary-soft)] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-default"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Otomatik</span>
                </button>
              </div>

              {contentMode !== 'meal' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--text-primary)]">Âyet Yazısı</span>
                    <span className="font-extrabold tabular-nums text-[var(--brand-primary-text)]">
                      %{Math.round(arabicScale * 100)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustArabicScale(-TEXT_SCALE_STEP)}
                      disabled={arabicScale <= MIN_TEXT_SCALE}
                      aria-label="Âyet yazısını küçült"
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center hover:border-[var(--brand-primary)] cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={Math.round(MIN_TEXT_SCALE * 100)}
                      max={Math.round(MAX_TEXT_SCALE * 100)}
                      step={5}
                      value={Math.round(arabicScale * 100)}
                      onChange={(e) => setArabicScale(Number(e.target.value) / 100)}
                      aria-label="Âyet yazısı boyutu"
                      className="flex-1 accent-[var(--brand-primary)] cursor-pointer h-2"
                    />
                    <button
                      type="button"
                      onClick={() => adjustArabicScale(TEXT_SCALE_STEP)}
                      disabled={arabicScale >= MAX_TEXT_SCALE}
                      aria-label="Âyet yazısını büyüt"
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center hover:border-[var(--brand-primary)] cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {contentMode !== 'ar' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--text-primary)]">Meal Yazısı</span>
                    <span className="font-extrabold tabular-nums text-[var(--brand-primary-text)]">
                      %{Math.round(mealScale * 100)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustMealScale(-TEXT_SCALE_STEP)}
                      disabled={mealScale <= MIN_TEXT_SCALE}
                      aria-label="Meal yazısını küçült"
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center hover:border-[var(--brand-primary)] cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={Math.round(MIN_TEXT_SCALE * 100)}
                      max={Math.round(MAX_TEXT_SCALE * 100)}
                      step={5}
                      value={Math.round(mealScale * 100)}
                      onChange={(e) => setMealScale(Number(e.target.value) / 100)}
                      aria-label="Meal yazısı boyutu"
                      className="flex-1 accent-[var(--brand-primary)] cursor-pointer h-2"
                    />
                    <button
                      type="button"
                      onClick={() => adjustMealScale(TEXT_SCALE_STEP)}
                      disabled={mealScale >= MAX_TEXT_SCALE}
                      aria-label="Meal yazısını büyüt"
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center hover:border-[var(--brand-primary)] cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Meal & Tefsir Kaynağı */}
            {contentMode !== 'ar' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="share-meal-select"
                  className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
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
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border bg-[var(--bg-surface-soft)] text-[var(--text-primary)] border-[var(--border-subtle)] cursor-pointer focus:outline-none focus:border-[var(--brand-primary)]"
                >
                  {allMeals.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {statusMessage && (
              <p className="text-xs font-semibold text-center text-[var(--brand-primary-text)] bg-[var(--brand-primary-soft)] rounded-xl py-2 px-3">
                {statusMessage}
              </p>
            )}
          </div>
        </div>

        {/* Alt Aksiyon Çubuğu (Mobilde Sabit) */}
        <div className="sticky bottom-0 z-10 px-4 md:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-soft)] flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isRendering}
            onClick={() => void handleDownloadPng()}
            className="flex-1 min-w-[155px] min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            {isRendering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>PNG Kart İndir</span>
          </button>

          {canCopyImage && (
            <button
              type="button"
              disabled={isRendering}
              onClick={() => void handleCopyImage()}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              {copiedImage ? (
                <>
                  <Check className="w-4 h-4 text-[var(--state-success)]" />
                  <span>Görsel Kopyalandı</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>Görseli Kopyala</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            disabled={isRendering}
            onClick={() => void handleNativeShare()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--brand-primary-text)] hover:border-[var(--brand-primary)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Share2 className="w-4 h-4" />
            <span>Paylaş</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyText()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
            onClick={() => void handleCopyLink()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-[var(--state-success)]" />
                <span>Link Kopyalandı</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                <span>Ayet Linkini Kopyala</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
