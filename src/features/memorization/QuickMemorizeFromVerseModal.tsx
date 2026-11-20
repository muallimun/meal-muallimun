import React, { useEffect, useMemo, useState } from 'react';
import { BookMarked, Check, Play, Plus, X } from 'lucide-react';
import { buildMemorizationUnitFromRanges } from '../../data/curatedAshrPresets';
import { memorizationStorage } from '../../services/memorizationStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';

export const QuickMemorizeFromVerseModal: React.FC = () => {
  const { quickMemorizeSeed, closeQuickMemorize, navigateToMemorizeUnit, meta } = useAppStore();

  const surahMeta = useMemo(() => {
    if (!quickMemorizeSeed || !meta) return null;
    return meta.surahs.find((s) => s.no === quickMemorizeSeed.surah) ?? null;
  }, [quickMemorizeSeed, meta]);

  const maxAyah = surahMeta?.ayahCount ?? 286;
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(1);
  const [customTitle, setCustomTitle] = useState('');
  const [addedToast, setAddedToast] = useState(false);

  useEffect(() => {
    if (!quickMemorizeSeed) return;
    const sAyah = Math.max(1, Math.min(maxAyah, quickMemorizeSeed.ayah));
    const defaultEnd = Math.min(maxAyah, sAyah + 4);
    setStartAyah(sAyah);
    setEndAyah(defaultEnd);
    setCustomTitle('');
    setAddedToast(false);
  }, [quickMemorizeSeed, maxAyah]);

  useEffect(() => {
    if (!quickMemorizeSeed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeQuickMemorize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickMemorizeSeed, closeQuickMemorize]);

  if (!quickMemorizeSeed) return null;

  const safeStart = Math.min(startAyah, endAyah);
  const safeEnd = Math.max(startAyah, endAyah);
  const ayahCount = safeEnd - safeStart + 1;
  const surahName = surahMeta?.nameTr ?? `${quickMemorizeSeed.surah}. Sure`;

  const autoTitle =
    safeStart === safeEnd
      ? `${surahName} ${safeStart}. Ayet`
      : `${surahName} ${safeStart}–${safeEnd}`;

  const handleSave = async (launchImmediately: boolean) => {
    sfxService.play('click');
    const unit = buildMemorizationUnitFromRanges(meta, {
      title: customTitle.trim() || autoTitle,
      subtitle: `${surahName} ${safeStart === safeEnd ? `${safeStart}. Ayet` : `${safeStart}–${safeEnd}`} · ${ayahCount} Ayet`,
      sourceType: 'custom',
      ranges: [
        {
          surah: quickMemorizeSeed.surah,
          startAyah: safeStart,
          endAyah: safeEnd,
        },
      ],
    });

    await memorizationStorage.upsertUnit(unit);

    if (launchImmediately) {
      closeQuickMemorize();
      navigateToMemorizeUnit(unit.id, true);
    } else {
      setAddedToast(true);
      window.setTimeout(() => {
        closeQuickMemorize();
      }, 650);
    }
  };

  const quickChips: Array<{ label: string; end: number }> = [
    { label: 'Sadece bu ayet', end: startAyah },
    { label: '+4 ayet (5’li dilim)', end: Math.min(maxAyah, startAyah + 4) },
    { label: '+9 ayet (10’lu)', end: Math.min(maxAyah, startAyah + 9) },
  ];
  if (maxAyah - startAyah <= 18 && maxAyah > startAyah + 4) {
    quickChips.push({ label: 'Sure sonuna kadar', end: maxAyah });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeQuickMemorize();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Buradan Ezber Başlat"
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-3.5 sm:px-5 border-b flex items-center justify-between gap-2"
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
              <BookMarked className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold truncate">
                Buradan Ezber Başlat
              </h3>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {surahName} Suresi · {quickMemorizeSeed.ayah}. Ayetten
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeQuickMemorize}
            aria-label="Kapat"
            className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gövde */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Hızlı Aralık Önerileri */}
          <div className="space-y-2">
            <label
              className="block text-xs font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Hızlı Aralık Seçimi
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickChips.map((chip) => {
                const active = endAyah === chip.end;
                return (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setEndAyah(chip.end);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: active ? '#FFFFFF' : 'var(--text-primary)',
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Başlangıç / Bitiş Ayet Seçicileri */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="quick-mem-start"
                className="block text-xs font-bold"
                style={{ color: 'var(--text-secondary)' }}
              >
                Başlangıç Ayeti
              </label>
              <input
                id="quick-mem-start"
                type="number"
                min={1}
                max={maxAyah}
                value={startAyah}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(maxAyah, Number(e.target.value) || 1));
                  setStartAyah(val);
                  if (val > endAyah) setEndAyah(val);
                }}
                className="w-full min-h-[42px] px-3 rounded-xl border text-sm font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="quick-mem-end"
                className="block text-xs font-bold"
                style={{ color: 'var(--text-secondary)' }}
              >
                Bitiş Ayeti (maks. {maxAyah})
              </label>
              <input
                id="quick-mem-end"
                type="number"
                min={startAyah}
                max={maxAyah}
                value={endAyah}
                onChange={(e) => {
                  const val = Math.max(startAyah, Math.min(maxAyah, Number(e.target.value) || startAyah));
                  setEndAyah(val);
                }}
                className="w-full min-h-[42px] px-3 rounded-xl border text-sm font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* İsteğe Bağlı Başlık */}
          <div className="space-y-1.5">
            <label
              htmlFor="quick-mem-title"
              className="block text-xs font-bold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Çalışma Başlığı (İsteğe bağlı)
            </label>
            <input
              id="quick-mem-title"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={autoTitle}
              className="w-full min-h-[42px] px-3 rounded-xl border text-sm font-medium outline-none focus:border-[var(--brand-primary)]"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Özet Kutu */}
          <div
            className="p-3 rounded-2xl border flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              borderColor: 'rgba(15, 118, 110, 0.25)',
            }}
          >
            <div className="min-w-0">
              <p
                className="text-xs font-extrabold truncate"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {customTitle.trim() || autoTitle}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {quickMemorizeSeed.page ? `Sayfa ${quickMemorizeSeed.page} · ` : ''}
                {ayahCount} ayet ezber havuzuna eklenecek
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--brand-primary-text)',
              }}
            >
              {ayahCount} Ayet
            </span>
          </div>

          {addedToast && (
            <div
              className="p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                color: '#047857',
              }}
            >
              <Check className="w-4 h-4" />
              <span>Ezber havuzuna eklendi!</span>
            </div>
          )}
        </div>

        {/* Alt Aksiyonlar */}
        <div
          className="px-4 py-3.5 sm:px-5 border-t flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => void handleSave(false)}
            className="min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Sadece Havuza Ekle</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSave(true)}
            className="flex-1 min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span>Havuza Ekle &amp; Başla</span>
          </button>
        </div>
      </div>
    </div>
  );
};
