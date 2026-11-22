/**
 * Merkezi katman (z-index) ölçeği.
 * Tüm sahne, panel, çekmece, modal, iç içe modal ve popover bileşenleri
 * tutarlı görsel hiyerarşi için bu sabitleri referans alır.
 */
export const Z_LAYERS = {
  SCENE: 'z-[75]',
  PANEL: 'z-[80]',
  PRESENTATION: 'z-[85]',
  DRAWER: 'z-[90]',
  MODAL: 'z-[92]',
  NESTED_MODAL: 'z-[96]',
  POPOVER: 'z-[100]',
} as const;

export type ZLayerKey = keyof typeof Z_LAYERS;
