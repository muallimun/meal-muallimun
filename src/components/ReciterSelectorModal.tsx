import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  AudioLines,
  Check,
  Headphones,
  Loader2,
  Play,
  Search,
  Square,
  Star,
  X,
} from 'lucide-react';
import {
  formatReciterBadge,
  getAllReciters,
  RECITER_CATEGORIES,
  resolveSyncedReciterKey,
} from '../config/recitersConfig';
import { audioQueueService } from '../services/audioQueueService';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { ReciterCategory, ReciterDefinition } from '../types/quran';
import type { SegMetaFile } from '../types/wordSync';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { shouldAutoFocusSearchInput } from '../utils/deviceUtils';
import { normalizeTurkish } from '../utils/textNormalize';

type FilterChipId = 'all' | 'favorites' | ReciterCategory;

function foldForSearch(text: string): string {
  return normalizeTurkish(text)
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[‘’`'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORY_MAP = new Map(RECITER_CATEGORIES.map((c) => [c.id, c]));

export const ReciterSelectorModal: React.FC = () => {
  const {
    isReciterSelectorOpen,
    reciterSelectorContext,
    activeTab,
    closeReciterSelector,
    audioPrefs,
    setArabicReciter,
    toggleFavoriteReciter,
    manifest,
  } = useAppStore();

  const isMemorizeMode = reciterSelectorContext === 'memorize' || activeTab === 'memorize';

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterChipId>('all');
  const [segMeta, setSegMeta] = useState<SegMetaFile | null>(() =>
    audioQueueService.getCachedSegMeta(),
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const reciters = useMemo(() => getAllReciters(manifest), [manifest]);
  const favoriteSet = useMemo(
    () => new Set(audioPrefs.favoriteReciterIds),
    [audioPrefs.favoriteReciterIds],
  );

  const activeReciter = useMemo(
    () => reciters.find((r) => r.id === audioPrefs.arabicReciterId) ?? reciters[0],
    [reciters, audioPrefs.arabicReciterId],
  );

  useBackButtonGuard('reciter_selector_modal', isReciterSelectorOpen, () => {
    audioQueueService.stopPreview();
    closeReciterSelector();
  });

  // Kapanınca veya unmount olunca Besmele önizlemesini temizle; açılınca seg/meta.json bilgisini tembel yükle
  useEffect(() => {
    if (!isReciterSelectorOpen) {
      audioQueueService.stopPreview();
      return;
    }

    const releaseScrollLock = acquireBodyScrollLock();
    let cancelled = false;
    if (!segMeta) {
      void audioQueueService.ensureSegMetaLoaded().then((loaded) => {
        if (!cancelled && loaded) {
          setSegMeta(loaded);
        }
      });
    }

    return () => {
      cancelled = true;
      releaseScrollLock();
      audioQueueService.stopPreview();
    };
  }, [isReciterSelectorOpen, segMeta]);

  const categoryCounts = useMemo(() => {
    const counts: Record<ReciterCategory, number> = {
      turk: 0,
      talim: 0,
      murattal: 0,
      mujawwad: 0,
    };
    let favCount = 0;
    for (const r of reciters) {
      counts[r.category] += 1;
      if (favoriteSet.has(r.id)) favCount += 1;
    }
    return { counts, favCount };
  }, [reciters, favoriteSet]);

  const filteredReciters = useMemo(() => {
    const q = foldForSearch(searchQuery);

    const matched = reciters.filter((r) => {
      if (activeFilter === 'favorites' && !favoriteSet.has(r.id)) return false;
      if (
        activeFilter !== 'all' &&
        activeFilter !== 'favorites' &&
        r.category !== activeFilter
      ) {
        return false;
      }

      if (!q) return true;
      const catMeta = CATEGORY_MAP.get(r.category);
      const haystack = foldForSearch(
        `${r.label} ${r.shortLabel} ${r.styleLabel} ${r.bitrate ?? ''} ${catMeta?.shortLabel ?? ''} ${r.id}`,
      );
      return q.split(' ').every((token) => haystack.includes(token));
    });

    // Ezber modunda Husary (Muallim) ve Minshawy (Muallim) en üstte "Ezber İçin Önerilen" olarak vurgulanır
    const recommendedIds = new Set(['husary_muallim', 'minshawy_teacher']);
    const recommended: ReciterDefinition[] = [];
    const favs: ReciterDefinition[] = [];
    const rest: ReciterDefinition[] = [];

    for (const r of matched) {
      if (isMemorizeMode && recommendedIds.has(r.id)) {
        recommended.push(r);
      } else if (favoriteSet.has(r.id)) {
        favs.push(r);
      } else {
        rest.push(r);
      }
    }
    return { recommended, favs, rest, all: [...recommended, ...favs, ...rest] };
  }, [reciters, favoriteSet, activeFilter, searchQuery, isMemorizeMode]);

  if (!isReciterSelectorOpen) return null;

  const handleClose = () => {
    sfxService.play('click');
    audioQueueService.stopPreview();
    closeReciterSelector();
  };

  const handleSelectReciter = (reciter: ReciterDefinition) => {
    sfxService.play('click');
    audioQueueService.stopPreview();
    setArabicReciter(reciter.id);
  };

  const handlePreviewToggle = (e: React.MouseEvent, reciter: ReciterDefinition) => {
    e.stopPropagation();
    sfxService.play('click');
    audioQueueService.previewReciter(reciter);
  };

  const handleFavoriteToggle = (e: React.MouseEvent, reciterId: string) => {
    e.stopPropagation();
    sfxService.play('click');
    toggleFavoriteReciter(reciterId);
  };

  const filterChips: { id: FilterChipId; label: string; count: number }[] = [
    { id: 'all', label: 'Tümü', count: reciters.length },
    { id: 'favorites', label: '⭐ Favoriler', count: categoryCounts.favCount },
    ...RECITER_CATEGORIES.map((cat) => ({
      id: cat.id as FilterChipId,
      label: cat.label,
      count: categoryCounts.counts[cat.id],
    })),
  ];

  const renderReciterRow = (reciter: ReciterDefinition) => {
    const isSelected = audioPrefs.arabicReciterId === reciter.id;
    const isFavorite = favoriteSet.has(reciter.id);
    const isPreviewTarget = audioState.previewReciterId === reciter.id;
    const isPreviewLoading = isPreviewTarget && audioState.previewStatus === 'loading';
    const isPreviewPlaying = isPreviewTarget && audioState.previewStatus === 'playing';
    const isPreviewError = isPreviewTarget && audioState.previewStatus === 'error';
    const badge = formatReciterBadge(reciter);
    const hasWordSync = Boolean(resolveSyncedReciterKey(reciter, segMeta));
    const catMeta = CATEGORY_MAP.get(reciter.category);
    const showCategoryMeta = activeFilter === 'all' || activeFilter === 'favorites' || Boolean(searchQuery.trim());

    return (
      <div
        key={reciter.id}
        role="button"
        tabIndex={0}
        onClick={() => handleSelectReciter(reciter)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelectReciter(reciter);
          }
        }}
        aria-pressed={isSelected}
        className="w-full px-3 py-2.5 sm:px-3.5 sm:py-3 rounded-2xl border flex items-center justify-between gap-2 transition-all cursor-pointer select-none"
        style={{
          backgroundColor: isSelected
            ? 'var(--brand-primary-soft)'
            : 'var(--bg-surface)',
          borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-subtle)',
          boxShadow: isSelected ? '0 0 0 1px var(--brand-primary)' : 'none',
        }}
      >
        {/* Sol: Seçim İkonu + Okuyucu Adı & Üslup Rozeti */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border text-sm"
            style={{
              backgroundColor: isSelected
                ? 'var(--brand-primary)'
                : 'var(--bg-surface-soft)',
              borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-subtle)',
              color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
            }}
          >
            {isSelected ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <span aria-hidden="true">{catMeta?.emoji ?? '🎙️'}</span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p
                className="text-xs sm:text-sm font-extrabold truncate"
                style={{
                  color: isSelected
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-primary)',
                }}
              >
                {reciter.label}
              </p>
              {isSelected && (
                <span
                  className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-primary)',
                    color: '#FFFFFF',
                  }}
                >
                  Aktif
                </span>
              )}
              {(reciter.id === 'husary_muallim' || reciter.id === 'minshawy_teacher') && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  Ezber İçin Önerilen
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {badge && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold border"
                  style={{
                    backgroundColor:
                      reciter.bitrate === '40k'
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color:
                      reciter.bitrate === '40k'
                        ? 'var(--brand-accent-text)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {badge}
                </span>
              )}
              {hasWordSync && (
                <span
                  title="Bu kurrâda sesle eşzamanlı kelime bazlı karaoke takibi desteklenir"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-extrabold border whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'rgba(15, 118, 110, 0.35)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <AudioLines className="w-3 h-3 shrink-0" />
                  <span>Kelime Takibi</span>
                </span>
              )}
              {showCategoryMeta && catMeta && (
                <span
                  className="text-[10px] sm:text-[11px] font-semibold truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {catMeta.shortLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sağ: Besmele Önizle / Durdur + Favori Yıldızı */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => handlePreviewToggle(e, reciter)}
            aria-label={
              isPreviewPlaying
                ? `${reciter.shortLabel} önizlemesini durdur`
                : `${reciter.shortLabel} Besmele önizle`
            }
            title={
              isPreviewError
                ? 'Ses önizlemesi yüklenemedi, tekrar dene'
                : isPreviewPlaying
                  ? 'Önizlemeyi durdur'
                  : 'Besmele ile ses tonunu önizle'
            }
            className="min-h-[40px] sm:min-h-[38px] min-w-[44px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            style={{
              backgroundColor: isPreviewPlaying
                ? 'var(--brand-accent-soft)'
                : isPreviewError
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'var(--bg-surface-soft)',
              borderColor: isPreviewPlaying
                ? 'var(--brand-accent)'
                : isPreviewError
                  ? 'rgba(239, 68, 68, 0.45)'
                  : 'var(--border-subtle)',
              color: isPreviewPlaying
                ? 'var(--brand-accent-text)'
                : isPreviewError
                  ? '#EF4444'
                  : 'var(--text-primary)',
            }}
          >
            {isPreviewLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : isPreviewPlaying ? (
              <Square className="w-3.5 h-3.5 fill-current shrink-0" />
            ) : isPreviewError ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
            )}
            <span className="hidden sm:inline">
              {isPreviewLoading
                ? 'Yükleniyor'
                : isPreviewPlaying
                  ? 'Durdur'
                  : isPreviewError
                    ? 'Tekrar'
                    : 'Önizle'}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => handleFavoriteToggle(e, reciter.id)}
            aria-label={
              isFavorite
                ? `${reciter.shortLabel} favorilerden çıkar`
                : `${reciter.shortLabel} favorilere ekle`
            }
            aria-pressed={isFavorite}
            title={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            className="min-w-[42px] min-h-[42px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer"
            style={{
              backgroundColor: isFavorite
                ? 'var(--brand-accent-soft)'
                : 'var(--bg-surface-soft)',
              borderColor: isFavorite ? 'var(--brand-accent)' : 'var(--border-subtle)',
              color: isFavorite ? 'var(--brand-accent-text)' : 'var(--text-muted)',
            }}
          >
            <Star
              className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`}
            />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reciter-selector-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[86dvh] sm:max-h-[84dvh] rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Mobil Tutamak Çizgisi */}
        <div className="sm:hidden flex justify-center pt-2 pb-0.5 shrink-0">
          <span
            className="w-10 h-1 rounded-full opacity-40"
            style={{ backgroundColor: 'var(--text-muted)' }}
          />
        </div>

        {/* Üst Başlık */}
        <div
          className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Headphones className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="reciter-selector-title"
                className="text-sm sm:text-base font-extrabold tracking-tight truncate"
              >
                Kur&apos;an Okuyucu Seç ({reciters.length} Kurrâ)
              </h2>
              <p
                className="text-[11px] sm:text-xs truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                Aktif tilavet:{' '}
                <span
                  className="font-bold"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {activeReciter?.label}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Okuyucu seçiciyi kapat"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)] shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Arama Kutusu & 4 Kategori + Favoriler Filtre Şeridi */}
        <div
          className="px-4 sm:px-5 py-3 border-b space-y-2.5 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Arama */}
          <div className="relative flex items-center">
            <Search
              className="w-4 h-4 absolute left-3 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Okuyucu ara (ör. İshak, Afâsî, Muallim, 40k)..."
              aria-label="Okuyucu Ara"
              className="w-full min-h-[42px] pl-9 pr-9 rounded-xl border text-base sm:text-sm font-medium outline-none transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  if (shouldAutoFocusSearchInput()) {
                    searchInputRef.current?.focus();
                  }
                }}
                aria-label="Aramayı temizle"
                className="w-8 h-8 rounded-lg flex items-center justify-center absolute right-1.5 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Kategori Çipleri */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
            {filterChips.map((chip) => {
              const active = activeFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setActiveFilter(chip.id);
                  }}
                  className="min-h-[36px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: active
                      ? 'var(--brand-primary)'
                      : 'var(--bg-surface)',
                    borderColor: active
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  <span>{chip.label}</span>
                  <span
                    className="px-1.5 py-0.2 rounded-md text-[10px] font-extrabold tabular-nums"
                    style={{
                      backgroundColor: active
                        ? 'rgba(255,255,255,0.2)'
                        : 'var(--bg-surface-soft)',
                      color: active ? '#FFFFFF' : 'var(--text-muted)',
                    }}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Okuyucu Listesi */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-4">
          {filteredReciters.all.length === 0 ? (
            <div
              className="py-10 px-4 text-center rounded-2xl border border-dashed space-y-2"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-soft)',
              }}
            >
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {activeFilter === 'favorites' && !searchQuery
                  ? 'Henüz favori okuyucu eklemediniz.'
                  : 'Aramanızla eşleşen okuyucu bulunamadı.'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {activeFilter === 'favorites' && !searchQuery
                  ? 'Herhangi bir okuyucunun yanındaki ⭐ simgesine dokunarak favorilerinize ekleyebilirsiniz.'
                  : 'Farklı bir isim deneyin veya tüm kategorilere dönün.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className="mt-1 min-h-[38px] px-4 rounded-xl text-xs font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Tüm Okuyucuları Göster
              </button>
            </div>
          ) : (
            <>
              {/* Ezber Modu: Önerilen Muallim Okuyucular (En üstte vurgulu) */}
              {filteredReciters.recommended.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      <span>🎓 Ezber İçin Önerilen ({filteredReciters.recommended.length})</span>
                    </h3>
                    <span
                      className="text-[10px] font-semibold hidden sm:inline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Doğal tekrar boşluklu muallim kayıtları
                    </span>
                  </div>
                  <div className="space-y-2">
                    {filteredReciters.recommended.map(renderReciterRow)}
                  </div>
                </section>
              )}

              {/* Favoriler Bölümü */}
              {filteredReciters.favs.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3
                      className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>Favori Okuyucuların ({filteredReciters.favs.length})</span>
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {filteredReciters.favs.map(renderReciterRow)}
                  </div>
                </section>
              )}

              {/* Diğer Okuyucular (Tümü seçiliyken ve arama yokken kategori başlıklarıyla) */}
              {filteredReciters.rest.length > 0 && (
                activeFilter === 'all' && !searchQuery.trim() ? (
                  <div className="space-y-4">
                    {RECITER_CATEGORIES.map((cat) => {
                      const items = filteredReciters.rest.filter(
                        (r) => r.category === cat.id,
                      );
                      if (items.length === 0) return null;
                      return (
                        <section key={cat.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h3
                              className="text-[11px] font-extrabold uppercase tracking-wider truncate"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {cat.label}
                            </h3>
                            <span
                              className="text-[11px] font-medium hidden sm:inline truncate"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {cat.description}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {items.map(renderReciterRow)}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <section className="space-y-2">
                    {filteredReciters.favs.length > 0 && (
                      <h3
                        className="text-[11px] font-extrabold uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Diğer Okuyucular ({filteredReciters.rest.length})
                      </h3>
                    )}
                    <div className="space-y-2">
                      {filteredReciters.rest.map(renderReciterRow)}
                    </div>
                  </section>
                )
              )}
            </>
          )}
        </div>

        {/* Alt Bilgilendirme & Kapat */}
        <div
          className="px-4 sm:px-5 py-2.5 border-t flex items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
            <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>
              Besmele Önizle:
            </span>{' '}
            Okuyucunun ses tonunu dinleyin; seçtiğinizde aktif ayet anında yeni okuyucuyla devam eder.
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[40px] px-4 rounded-xl text-xs font-extrabold text-white shrink-0 cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
