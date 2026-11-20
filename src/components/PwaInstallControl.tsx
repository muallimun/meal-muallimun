import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Share,
  Smartphone,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';

interface PwaInstallControlProps {
  variant: 'banner' | 'sidebar' | 'settings';
}

export const PwaInstallControl: React.FC<PwaInstallControlProps> = ({ variant }) => {
  const { isOnline, canInstallPwa, isPwaInstalled, isIosDevice, promptPwaInstall } =
    useAppStore();

  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  const handleInstallClick = async () => {
    if (canInstallPwa) {
      await promptPwaInstall();
      return;
    }
    if (isIosDevice) {
      sfxService.play('click');
      setShowIosGuide(true);
    }
  };

  const iosGuideModal = showIosGuide ? (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-guide-title"
    >
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={() => setShowIosGuide(false)}
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl border p-5 shadow-2xl space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Smartphone className="w-5 h-5" />
            </span>
            <div>
              <h3 id="ios-install-guide-title" className="text-base font-extrabold">
                iPhone / iPad&apos;e Kur
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Safari üzerinden ana ekrana ekleyin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowIosGuide(false)}
            aria-label="Kapat"
            className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-muted)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol
          className="space-y-2.5 text-xs sm:text-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          <li className="flex items-start gap-2.5">
            <span
              className="w-6 h-6 rounded-lg font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              1
            </span>
            <span>
              Safari alt menüsündeki <strong className="inline-flex items-center gap-1"><Share className="w-3.5 h-3.5 inline" /> Paylaş</strong> simgesine dokunun.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span
              className="w-6 h-6 rounded-lg font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              2
            </span>
            <span>
              Açılan listede aşağı kaydırıp <strong>Ana Ekrana Ekle</strong> seçeneğine dokunun.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span
              className="w-6 h-6 rounded-lg font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              3
            </span>
            <span>
              Sağ üstten <strong>Ekle</strong> diyerek Muallimun&apos;u uygulama gibi kullanın.
            </span>
          </li>
        </ol>

        <button
          type="button"
          onClick={() => setShowIosGuide(false)}
          className="w-full min-h-[44px] rounded-xl text-sm font-bold text-white cursor-pointer"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Anladım
        </button>
      </div>
    </div>
  ) : null;

  // ============================================================================
  // 1. SIDEBAR VARYANTI (Sadece kurulabilirse veya iOS'ta kurulu değilse görünür)
  // ============================================================================
  if (variant === 'sidebar') {
    if (isPwaInstalled || (!canInstallPwa && !isIosDevice)) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border flex items-center gap-3 text-sm font-bold transition-colors cursor-pointer hover:opacity-95"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            borderColor: 'var(--brand-primary)',
            color: 'var(--brand-primary-text)',
          }}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap truncate">Uygulamayı Cihaza Kur</span>
        </button>
        {iosGuideModal}
      </>
    );
  }

  // ============================================================================
  // 2. ANA SAYFA BANNER VARYANTI
  // ============================================================================
  if (variant === 'banner') {
    if (dismissedBanner || isPwaInstalled || (!canInstallPwa && !isIosDevice)) {
      return null;
    }

    return (
      <>
        <section aria-label="Uygulamayı cihaza kur">
          <div
            className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-l-4"
            style={{ borderLeftColor: 'var(--brand-primary)' }}
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                  Muallimun&apos;u Cihazına Kur
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Ana ekranından tam ekran aç, daha önce açtığın sure ve soruları internet yokken de
                  çalış.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleInstallClick()}
                className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Uygulamayı Cihaza Kur</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissedBanner(true)}
                aria-label="Kurulum önerisini kapat"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
        {iosGuideModal}
      </>
    );
  }

  // ============================================================================
  // 3. AYARLAR MODALI VARYANTI (Bağlantı durumu + Kurulum aksiyonu)
  // ============================================================================
  return (
    <>
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: isOnline
                  ? 'rgba(16, 185, 129, 0.14)'
                  : 'var(--brand-accent-soft)',
                color: isOnline ? '#10B981' : 'var(--brand-accent-text)',
              }}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {isOnline ? 'Bağlantı Aktif (Çevrimiçi)' : 'Çevrimdışı Çalışma Modu'}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {isOnline
                  ? 'Açtığınız sure, meal ve soru bankası verileri çevrimdışı kullanım için otomatik önbelleğe alınır.'
                  : 'Bağlantı kesik; daha önce yüklenen sure, meal ve sorular önbellekten kesintisiz çalışır.'}
              </p>
            </div>
          </div>

          {isPwaInstalled ? (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                color: '#059669',
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Uygulama Kurulu</span>
            </span>
          ) : canInstallPwa || isIosDevice ? (
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              className="min-h-[42px] px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer shrink-0"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Uygulamayı Cihaza Kur</span>
            </button>
          ) : (
            <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>
              Tarayıcı menüsünden ana ekrana eklenebilir
            </span>
          )}
        </div>
      </div>
      {iosGuideModal}
    </>
  );
};
