/**
 * Cihaz ve Giriş Aygıtı Yardımcıları
 *
 * Mobil/tablet dokunmatik ekranlarda modal açıldığında sanal klavyenin
 * istenmeden fırlayıp listeyi kapatmasını önlemek için otomatik odaklanma
 * yalnızca geniş ekranlı + hassas imleçli (masaüstü) ortamlarda etkinleştirilir.
 */
export function shouldAutoFocusSearchInput(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
}
