import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpenCheck,
  Check,
  Edit3,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useBackButtonGuard } from '../services/backStackService';
import { computeHatimSummary, hatimStorage } from '../services/hatimStorage';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { PageBookmark, PageBookmarkColor } from '../types/quran';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { getSurahMap } from '../utils/poolUtils';

export const BOOKMARK_COLOR_STYLES: Record<
  PageBookmarkColor,
  { label: string; bg: string; soft: string; text: string; border: string }
> = {
  emerald: {
    label: 'Zümrüt',
    bg: '#0F766E',
    soft: 'rgba(15, 118, 110, 0.14)',
    text: '#0F766E',
    border: 'rgba(15, 118, 110, 0.35)',
  },
  amber: {
    label: 'Kehribar',
    bg: '#D97706',
    soft: 'rgba(217, 119, 6, 0.14)',
    text: '#B45309',
    border: 'rgba(217, 119, 6, 0.35)',
  },
  rose: {
    label: 'Gül',
    bg: '#E11D48',
    soft: 'rgba(225, 29, 72, 0.13)',
    text: '#BE123C',
    border: 'rgba(225, 29, 72, 0.32)',
  },
  indigo: {
    label: 'Lacivert',
    bg: '#4F46E5',
    soft: 'rgba(79, 70, 229, 0.13)',
    text: '#4338CA',
    border: 'rgba(79, 70, 229, 0.32)',
  },
};

const COLOR_OPTIONS: PageBookmarkColor[] = ['emerald', 'amber', 'rose', 'indigo'];

export const PageBookmarksDrawer: React.FC = () => {
  const {
    isBookmarksDrawerOpen,
    closeBookmarksDrawer,
    openHatimModal,
    studyProgress,
    meta,
    navigateToStudy,
    upsertPageBookmark,
    moveHatimBookmark,
    renamePageBookmark,
    removePageBookmark,
  } = useAppStore();

  const hatimState = useSyncExternalStore(hatimStorage.subscribe, hatimStorage.getSnapshot);
  const hatimSummary = useMemo(
    () => (hatimState.activePlan ? computeHatimSummary(hatimState.activePlan) : null),
    [hatimState.activePlan],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState<PageBookmarkColor>('amber');

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);

  const sortedBookmarks = useMemo(() => {
    const list = [...studyProgress.pageBookmarks];
    return list.sort((a, b) => {
      if (a.isHatim && !b.isHatim) return -1;
      if (!a.isHatim && b.isHatim) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [studyProgress.pageBookmarks]);

  useBackButtonGuard('page_bookmarks_drawer', isBookmarksDrawerOpen, closeBookmarksDrawer);

  useEffect(() => {
    if (!isBookmarksDrawerOpen) return;
    return acquireBodyScrollLock();
  }, [isBookmarksDrawerOpen]);

  if (!isBookmarksDrawerOpen) return null;

  const handleOpenBookmark = (bm: PageBookmark) => {
    closeBookmarksDrawer();
    navigateToStudy({
      viewMode: 'mushaf',
      page: bm.page,
      surah: bm.surah,
      ayah: bm.ayah,
    });
  };

  const handleStartEdit = (bm: PageBookmark) => {
    sfxService.play('click');
    setEditingId(bm.id);
    setEditLabel(bm.label);
    setEditColor(bm.color);
  };

  const handleSaveEdit = (id: string) => {
    if (editLabel.trim()) {
      renamePageBookmark(id, editLabel.trim(), editColor);
    }
    setEditingId(null);
  };

  const handleQuickAddLastRead = () => {
    const pos = studyProgress.lastRead;
    if (!pos) return;
    const sMeta = surahMap.get(pos.surah);
    upsertPageBookmark({
      page: pos.page,
      surah: pos.surah,
      ayah: pos.ayah,
      label: sMeta ? `${sMeta.shortNameTr} · Sayfa ${pos.page}` : `Sayfa ${pos.page}`,
      color: 'amber',
    });
  };

  const handleSetLastReadAsHatim = () => {
    const pos = studyProgress.lastRead;
    if (!pos) return;
    moveHatimBookmark({
      page: pos.page,
      surah: pos.surah,
      ayah: pos.ayah,
    });
    if (hatimState.activePlan) {
      hatimStorage.markPagesReadUpTo(pos.page);
    }
  };

  const formatShortDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[92] flex justify-end bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookmarks-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeBookmarksDrawer();
      }}
    >
      <aside
        className="w-full max-w-md h-full flex flex-col border-l shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Bookmark className="w-4 h-4 fill-current" />
            </div>
            <div className="min-w-0">
              <h2 id="bookmarks-drawer-title" className="text-base font-extrabold tracking-tight">
                Sayfa Ayraçlarım
              </h2>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {sortedBookmarks.length > 0
                  ? `${sortedBookmarks.length} kayıtlı ayraç · Tek tıkla Mushaf sayfasına git`
                  : 'Mushaf sayfalarına ayraç koyarak kaldığın yeri işaretle'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeBookmarksDrawer}
            aria-label="Ayraçlar çekmecesini kapat"
            className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)] shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hızlı Kısayol: Son Okunan Sayfayı İşaretle */}
        {studyProgress.lastRead && (
          <div
            className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-2 shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                Son okunan konum
              </p>
              <p className="text-xs font-extrabold truncate tabular-nums">
                {surahMap.get(studyProgress.lastRead.surah)?.nameTr ??
                  `${studyProgress.lastRead.surah}. Sure`}{' '}
                · Sayfa {studyProgress.lastRead.page}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSetLastReadAsHatim}
                className="min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer text-white"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Hatim Ayracı</span>
              </button>
              <button
                type="button"
                onClick={handleQuickAddLastRead}
                className="min-h-[34px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Ekle</span>
              </button>
            </div>
          </div>
        )}

        {/* Ayraç Listesi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {/* 30 Cüz Hatim Planlayıcısı Köprü Kartı */}
          <div
            className="rounded-2xl border p-3.5 space-y-2.5"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              borderColor: 'var(--brand-primary)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <BookOpenCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                    {hatimState.activePlan ? hatimState.activePlan.title : '30 Cüz Hatim Planlayıcısı'}
                  </p>
                  <p className="text-[11px] tabular-nums truncate" style={{ color: 'var(--text-secondary)' }}>
                    {hatimSummary
                      ? `%${hatimSummary.percent} · ${hatimSummary.completedCount}/604 s. · ${hatimSummary.completedJuzCount}/30 cüz`
                      : hatimState.history.length > 0
                        ? `${hatimState.history.length} tamamlanan hatim · Yeni plan başlatın`
                        : 'Günlük sayfa hedefi veya serbest cüz takibi oluşturun'}
                  </p>
                </div>
              </div>
              {hatimSummary && (
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  Bugün {hatimSummary.todayCompletedCount}/{hatimSummary.todayTargetPages} s.
                </span>
              )}
            </div>

            {hatimSummary && (
              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgba(15, 118, 110, 0.16)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hatimSummary.percent}%`,
                    backgroundColor: 'var(--brand-primary)',
                  }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                closeBookmarksDrawer();
                openHatimModal();
              }}
              className="w-full min-h-[38px] px-3 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-95 transition-opacity"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <span>30 Cüz Hatim Planlayıcısı</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          {sortedBookmarks.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed p-6 text-center space-y-2.5 mt-4"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <div
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Bookmark className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-extrabold">Henüz sayfa ayracın yok</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Mushaf veya Kitap Modu sayfasının üst köşesindeki kurdele ayraç ikonuna dokunarak
                <strong> Hatim Ayracını</strong> taşıyabilir veya dilediğin kadar sayfa ayracı
                ekleyebilirsin.
              </p>
              <button
                type="button"
                onClick={() => {
                  closeBookmarksDrawer();
                  navigateToStudy({ viewMode: 'mushaf' });
                }}
                className="min-h-[40px] px-4 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer mt-1"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <span>Mushaf&apos;ı Aç</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            sortedBookmarks.map((bm) => {
              const palette = BOOKMARK_COLOR_STYLES[bm.color] ?? BOOKMARK_COLOR_STYLES.amber;
              const sMeta = surahMap.get(bm.surah);
              const isEditing = editingId === bm.id;

              return (
                <div
                  key={bm.id}
                  className="rounded-2xl border p-3.5 transition-all"
                  style={{
                    backgroundColor: bm.isHatim ? palette.soft : 'var(--bg-surface)',
                    borderColor: bm.isHatim ? palette.border : 'var(--border-subtle)',
                  }}
                >
                  {isEditing ? (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(bm.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        maxLength={48}
                        placeholder="Ayraç adı (örn. Ramazan Hatmi)"
                        className="w-full min-h-[38px] px-3 rounded-xl border text-xs font-semibold outline-none"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--brand-primary)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {COLOR_OPTIONS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditColor(c)}
                              aria-label={BOOKMARK_COLOR_STYLES[c].label}
                              className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-transform"
                              style={{
                                backgroundColor: BOOKMARK_COLOR_STYLES[c].bg,
                                transform: editColor === c ? 'scale(1.15)' : 'scale(1)',
                                boxShadow:
                                  editColor === c ? '0 0 0 2px var(--bg-surface), 0 0 0 4px ' + BOOKMARK_COLOR_STYLES[c].bg : 'none',
                              }}
                            >
                              {editColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="min-h-[34px] px-2.5 rounded-lg text-xs font-semibold cursor-pointer"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            İptal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(bm.id)}
                            className="min-h-[34px] px-3 rounded-lg text-xs font-bold text-white cursor-pointer"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            Kaydet
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleOpenBookmark(bm)}
                        className="flex-1 text-left flex items-start gap-3 min-w-0 cursor-pointer group"
                      >
                        <div
                          className="w-9 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs"
                          style={{ backgroundColor: palette.bg }}
                        >
                          <Bookmark className="w-4 h-4 fill-current" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold truncate group-hover:underline">
                              {bm.label}
                            </span>
                            {bm.isHatim && (
                              <span
                                className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md text-white"
                                style={{ backgroundColor: palette.bg }}
                              >
                                HATİM
                              </span>
                            )}
                          </div>
                          <p
                            className="text-xs font-semibold mt-0.5 tabular-nums truncate"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Sayfa {bm.page} · {sMeta?.nameTr ?? `${bm.surah}. Sure`} ({bm.surah}:
                            {bm.ayah})
                          </p>
                          <p
                            className="text-[11px] mt-0.5 tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {formatShortDate(bm.updatedAt)}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(bm)}
                          title="Adını ve rengini düzenle"
                          aria-label="Ayracı düzenle"
                          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePageBookmark(bm.id)}
                          title="Ayracı sil"
                          aria-label="Ayracı sil"
                          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-red-500/10"
                          style={{ color: '#EF4444' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
