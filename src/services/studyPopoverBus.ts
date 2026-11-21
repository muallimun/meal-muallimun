import type { RukuItem, WaqfSignDef } from '../types/fihrist';

export interface PopoverAnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface WaqfPopoverPayload {
  sign: WaqfSignDef;
  matchedGlyph: string;
  anchorRect: PopoverAnchorRect;
}

export interface RukuPopoverPayload {
  ruku: RukuItem;
  surahNameTr: string;
  page?: number;
  anchorRect: PopoverAnchorRect;
}

/**
 * rukus.json yüklenmeden önce de dokun-öğren vakıf baloncuğunun anında çalışması için
 * Secâvend durak işaretlerinin yerleşik yedeği.
 */
export const FALLBACK_WAQF_SIGNS: readonly WaqfSignDef[] = [
  {
    sign: 'مـ',
    altSigns: ['ۘ'],
    code: 'lazim',
    nameTr: 'Vakf-ı Lâzım',
    actionTr: 'Kesinlikle Durulmalı',
    color: '#DC2626',
    desc: 'Anlamın bozulmaması için durulması zorunlu olan yerdir. Geçilirse mana değişebilir veya yanlış anlaşılabilir.',
  },
  {
    sign: 'ط',
    altSigns: [],
    code: 'mutlak',
    nameTr: 'Vakf-ı Mutlak',
    actionTr: 'Durmak Çok Uygun',
    color: '#0D9488',
    desc: 'Cümle ve mana tamamen bitmiştir. Burada nefes alıp durmak hem anlam hem tilavet açısından oldukça uygundur.',
  },
  {
    sign: 'ج',
    altSigns: ['ۚ'],
    code: 'caiz',
    nameTr: 'Vakf-ı Câiz',
    actionTr: 'Durulabilir / Geçilebilir',
    color: '#2563EB',
    desc: 'Durmak da geçmek de caizdir; ancak anlam bütünlüğü açısından durmak hafifçe daha evlâ görülür.',
  },
  {
    sign: 'قلى',
    altSigns: ['ۗ', 'قف'],
    code: 'evla_vakf',
    nameTr: 'el-Vakfu Evlâ (Kılâ)',
    actionTr: 'Durmak Daha İyi',
    color: '#059669',
    desc: 'Geçmek caiz olsa da durmak daha faziletlidir. Özellikle uzun ayetlerde nefes almak için ideal noktadır.',
  },
  {
    sign: 'صلى',
    altSigns: ['ۖ', 'ص', 'ز'],
    code: 'evla_vasl',
    nameTr: 'el-Vaslu Evlâ (Sılâ)',
    actionTr: 'Geçmek Daha İyi',
    color: '#D97706',
    desc: 'Nefes yetiyorsa geçmek daha uygundur; ancak nefes daralırsa burada durulabilir.',
  },
  {
    sign: 'لا',
    altSigns: ['ۙ'],
    code: 'la',
    nameTr: 'Lâ (Durma)',
    actionTr: 'Durulmamalı',
    color: '#E11D48',
    desc: 'Mana henüz tamamlanmadığı için burada durulmaz. Nefes yetmezse geriden uygun bir kelime alınarak devam edilir.',
  },
  {
    sign: 'ۛ ۛ',
    altSigns: ['ۛ'],
    code: 'muanaka',
    nameTr: 'Vakf-ı Muânaka',
    actionTr: 'İkisinden Birinde Dur',
    color: '#7C3AED',
    desc: 'Üç noktalı iki işaretten yalnızca birinde durulur, ikisinde birden durulmaz (ör. Bakara 2).',
  },
  {
    sign: 'س',
    altSigns: ['سكتة', 'ۜ'],
    code: 'sekte',
    nameTr: 'Sekte',
    actionTr: 'Nefessiz Kısa Durak',
    color: '#4F46E5',
    desc: 'Nefes almadan sesi çok kısa (yaklaşık bir elif miktarı) kesip okumaya devam etmeyi gösterir.',
  },
];

let activeWaqfSigns: readonly WaqfSignDef[] = FALLBACK_WAQF_SIGNS;

export function registerLoadedWaqfSigns(signs: WaqfSignDef[]): void {
  if (Array.isArray(signs) && signs.length > 0) {
    activeWaqfSigns = signs;
  }
}

export function getRegisteredWaqfSigns(): readonly WaqfSignDef[] {
  return activeWaqfSigns;
}

/**
 * Bir veya birden fazla Secâvend Unicode karakterini (ör. "ۖ", "ۚۛ") en uygun WaqfSignDef ile eşleştirir.
 * Çift işaretli muânaka kümelerinde ("ۚۛ") önceliği üç noktalı muânaka işaretine ("ۛ") verir.
 */
export function resolveWaqfSignDef(
  waqfCluster: string,
  list: readonly WaqfSignDef[] = activeWaqfSigns,
): WaqfSignDef | null {
  const clean = waqfCluster.replace(/[\u200c\u200d\s]/g, '');
  if (!clean) return null;

  // Muânaka üç noktası varsa öncelikli eşleştir (ör. Bakara 2:2 "ۚۛ")
  if (clean.includes('\u06DB')) {
    const muanaka = list.find(
      (item) => item.code === 'muanaka' || item.altSigns.includes('\u06DB'),
    );
    if (muanaka) return muanaka;
  }

  for (const ch of Array.from(clean)) {
    const exact = list.find(
      (item) => item.sign === ch || item.altSigns.includes(ch) || item.sign.includes(ch),
    );
    if (exact) return exact;
  }

  return null;
}

type WaqfListener = (payload: WaqfPopoverPayload | null) => void;
type RukuListener = (payload: RukuPopoverPayload | null) => void;

const waqfListeners = new Set<WaqfListener>();
const rukuListeners = new Set<RukuListener>();

export function subscribeWaqfPopover(listener: WaqfListener): () => void {
  waqfListeners.add(listener);
  return () => {
    waqfListeners.delete(listener);
  };
}

export function subscribeRukuPopover(listener: RukuListener): () => void {
  rukuListeners.add(listener);
  return () => {
    rukuListeners.delete(listener);
  };
}

export function openWaqfPopover(
  sign: WaqfSignDef,
  matchedGlyph: string,
  rect: DOMRect | PopoverAnchorRect,
): void {
  closeRukuPopover();
  const anchorRect: PopoverAnchorRect = {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  };
  for (const fn of waqfListeners) {
    fn({ sign, matchedGlyph, anchorRect });
  }
}

export function closeWaqfPopover(): void {
  for (const fn of waqfListeners) {
    fn(null);
  }
}

export function openRukuPopover(
  ruku: RukuItem,
  surahNameTr: string,
  page: number | undefined,
  rect: DOMRect | PopoverAnchorRect,
): void {
  closeWaqfPopover();
  const anchorRect: PopoverAnchorRect = {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  };
  for (const fn of rukuListeners) {
    fn({ ruku, surahNameTr, page, anchorRect });
  }
}

export function closeRukuPopover(): void {
  for (const fn of rukuListeners) {
    fn(null);
  }
}
