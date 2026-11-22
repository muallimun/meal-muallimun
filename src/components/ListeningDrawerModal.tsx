import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Edit3,
  Headphones,
  ListMusic,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { findReciterById } from '../config/recitersConfig';
import { audioQueueService } from '../services/audioQueueService';
import { useBackButtonGuard } from '../services/backStackService';
import { getPageBounds, resolvePlaylistItemStartLocation } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type {
  AudioPlayMode,
  AudioPlaylist,
  AudioPlaylistItem,
  QueueLoopOption,
  RepeatCountOption,
} from '../types/quran';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { normalizeTurkish } from '../utils/poolUtils';

type DrawerTab = 'quick' | 'playlists';
type QuickScope = 'surah' | 'page' | 'juz' | 'ayah';

const REPEAT_OPTIONS: { value: RepeatCountOption; label: string }[] = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
];

const LOOP_OPTIONS: { value: QueueLoopOption; label: string }[] = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
  { value: 'infinite', label: '∞' },
];

const MODE_OPTIONS: { id: AudioPlayMode; label: string }[] = [
  { id: 'ar', label: 'AR' },
  { id: 'meal', label: 'Meal' },
  { id: 'ar_then_meal', label: 'AR+Meal' },
];

function clampInt(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

export const ListeningDrawerModal: React.FC = () => {
  const {
    isListeningDrawerOpen,
    listeningDrawerSeed,
    closeListeningDrawer,
    audioPrefs,
    updateAudioPrefs,
    audioPlaylists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addItemToPlaylist,
    removeItemFromPlaylist,
    movePlaylistItem,
    studyProgress,
    navigateToStudy,
    openReciterSelector,
    manifest,
    meta,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<DrawerTab>('quick');
  const [scope, setScope] = useState<QuickScope>('surah');

  useBackButtonGuard('listening_drawer_modal', isListeningDrawerOpen, closeListeningDrawer);

  useEffect(() => {
    if (!isListeningDrawerOpen) return;
    return acquireBodyScrollLock();
  }, [isListeningDrawerOpen]);

  // Hızlı Dinle Seçimleri
  const [selectedSurah, setSelectedSurah] = useState<number>(1);
  const [surahQuery, setSurahQuery] = useState('');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [selectedJuz, setSelectedJuz] = useState<number>(30);
  const [ayahSurah, setAyahSurah] = useState<number>(2);
  const [startAyah, setStartAyah] = useState<number>(255);
  const [endAyah, setEndAyah] = useState<number>(255);

  // Listeye Ekleme / Düzenleme Durumu
  const [pendingItem, setPendingItem] = useState<Omit<AudioPlaylistItem, 'id'> | null>(null);
  const [justAddedPlaylistId, setJustAddedPlaylistId] = useState<string | null>(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftItems, setDraftItems] = useState<Omit<AudioPlaylistItem, 'id'>[]>([]);

  // Playlist içi parça ekleyici
  const [builderType, setBuilderType] = useState<QuickScope>('surah');
  const [builderSurah, setBuilderSurah] = useState<number>(36);
  const [builderStartAyah, setBuilderStartAyah] = useState<number>(1);
  const [builderEndAyah, setBuilderEndAyah] = useState<number>(1);
  const [builderStartPage, setBuilderStartPage] = useState<number>(1);
  const [builderEndPage, setBuilderEndPage] = useState<number>(1);
  const [builderJuz, setBuilderJuz] = useState<number>(30);

  const pageBounds = useMemo(
    () => (meta ? getPageBounds(meta) : { minPage: 1, maxPage: 604 }),
    [meta],
  );
  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );

  // Modal açıldığında tohum (seed) veya son okunan konumla akıllı doldur
  useEffect(() => {
    if (!isListeningDrawerOpen) return;

    const last = studyProgress.lastRead;
    const defaultSurah = listeningDrawerSeed?.surah ?? last?.surah ?? 1;
    const defaultAyah = listeningDrawerSeed?.startAyah ?? last?.ayah ?? 1;
    const defaultEndAyah = listeningDrawerSeed?.endAyah ?? defaultAyah;
    const defaultPage = listeningDrawerSeed?.page ?? last?.page ?? 1;
    const surahInfo = meta?.surahs.find((s) => s.no === defaultSurah);
    const defaultJuz = listeningDrawerSeed?.juz ?? surahInfo?.cuzs[0] ?? 1;

    setSelectedSurah(defaultSurah);
    setSurahQuery('');
    setStartPage(defaultPage);
    setEndPage(defaultPage);
    setSelectedJuz(defaultJuz);
    setAyahSurah(defaultSurah);
    setStartAyah(defaultAyah);
    setEndAyah(defaultEndAyah);

    setBuilderSurah(defaultSurah);
    setBuilderStartAyah(defaultAyah);
    setBuilderEndAyah(defaultEndAyah);
    setBuilderStartPage(defaultPage);
    setBuilderEndPage(defaultPage);
    setBuilderJuz(defaultJuz);

    setEditingPlaylistId(null);
    setIsCreatingNew(false);
    setJustAddedPlaylistId(null);

    if (listeningDrawerSeed?.pendingAddItem) {
      setPendingItem(listeningDrawerSeed.pendingAddItem);
      setActiveTab('playlists');
    } else {
      setPendingItem(null);
      setActiveTab(listeningDrawerSeed?.initialTab ?? 'quick');
    }

    if (listeningDrawerSeed?.scope) {
      setScope(listeningDrawerSeed.scope);
    }
  }, [isListeningDrawerOpen, listeningDrawerSeed, studyProgress.lastRead, meta]);

  // ESC ile kapatma
  useEffect(() => {
    if (!isListeningDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeListeningDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isListeningDrawerOpen, closeListeningDrawer]);

  const filteredSurahs = useMemo(() => {
    const list = meta?.surahs ?? [];
    const q = normalizeTurkish(surahQuery.trim());
    if (!q) return list;
    return list.filter(
      (s) =>
        normalizeTurkish(s.nameTr).includes(q) ||
        normalizeTurkish(s.shortNameTr).includes(q) ||
        String(s.no) === q,
    );
  }, [meta, surahQuery]);

  if (!isListeningDrawerOpen || !meta || !manifest) return null;

  const getSurahMeta = (no: number) => meta.surahs.find((s) => s.no === no);
  const activeAyahSurahMeta = getSurahMeta(ayahSurah);
  const maxAyahForSelected = activeAyahSurahMeta?.ayahCount ?? 286;
  const builderSurahMeta = getSurahMeta(builderSurah);
  const maxBuilderAyah = builderSurahMeta?.ayahCount ?? 286;

  const buildCurrentQuickItem = (): Omit<AudioPlaylistItem, 'id'> => {
    if (scope === 'surah') {
      const s = getSurahMeta(selectedSurah);
      return {
        type: 'surah',
        label: s ? s.nameTr : `${selectedSurah}. Sure`,
        surah: selectedSurah,
      };
    }
    if (scope === 'page') {
      const sP = clampInt(startPage, pageBounds.minPage, pageBounds.maxPage);
      const eP = clampInt(Math.max(sP, endPage), sP, pageBounds.maxPage);
      return {
        type: 'page_range',
        label: sP === eP ? `Sayfa ${sP}` : `Sayfa ${sP}–${eP}`,
        startPage: sP,
        endPage: eP,
      };
    }
    if (scope === 'juz') {
      const j = clampInt(selectedJuz, 1, 30);
      return {
        type: 'juz',
        label: `${j}. Cüz`,
        juz: j,
      };
    }
    const s = getSurahMeta(ayahSurah);
    const sA = clampInt(startAyah, 1, maxAyahForSelected);
    const eA = clampInt(Math.max(sA, endAyah), sA, maxAyahForSelected);
    const sName = s?.shortNameTr ?? `${ayahSurah}. Sure`;
    return {
      type: 'ayah_range',
      label: sA === eA ? `${sName} ${sA}. Ayet` : `${sName} ${sA}–${eA}. Ayet`,
      surah: ayahSurah,
      startAyah: sA,
      endAyah: eA,
    };
  };

  const handlePlayQuick = () => {
    sfxService.play('click');
    const item = buildCurrentQuickItem();
    if (audioPrefs.showTextOnStart) {
      navigateToStudy(resolvePlaylistItemStartLocation(item, meta));
    }
    void audioQueueService.startSegmentQueue({
      items: [{ ...item, id: `quick_${Date.now()}` }],
      title: item.label,
      context: 'custom',
      contextKey: `custom:${item.type}:${item.label}`,
      manifest,
      meta,
      prefs: audioPrefs,
    });
    closeListeningDrawer();
  };

  const handleSaveQuickToPlaylist = () => {
    sfxService.play('click');
    const item = buildCurrentQuickItem();
    setPendingItem(item);
    setActiveTab('playlists');
    setEditingPlaylistId(null);
    setIsCreatingNew(false);
  };

  const handlePlayPlaylist = (pl: AudioPlaylist) => {
    if (pl.items.length === 0) return;
    sfxService.play('click');
    if (audioPrefs.showTextOnStart) {
      navigateToStudy(resolvePlaylistItemStartLocation(pl.items[0], meta));
    }
    void audioQueueService.startSegmentQueue({
      items: pl.items,
      title: pl.name,
      context: 'playlist',
      contextKey: `playlist:${pl.id}`,
      manifest,
      meta,
      prefs: audioPrefs,
    });
    closeListeningDrawer();
  };

  const handleAddPendingToExisting = (plId: string) => {
    if (!pendingItem) return;
    sfxService.play('click');
    addItemToPlaylist(plId, pendingItem);
    setJustAddedPlaylistId(plId);
    window.setTimeout(() => {
      setPendingItem(null);
      setJustAddedPlaylistId(null);
    }, 900);
  };

  const buildItemFromBuilder = (): Omit<AudioPlaylistItem, 'id'> => {
    if (builderType === 'surah') {
      const s = getSurahMeta(builderSurah);
      return {
        type: 'surah',
        label: s ? s.nameTr : `${builderSurah}. Sure`,
        surah: builderSurah,
      };
    }
    if (builderType === 'juz') {
      const j = clampInt(builderJuz, 1, 30);
      return { type: 'juz', label: `${j}. Cüz`, juz: j };
    }
    if (builderType === 'page') {
      const sP = clampInt(builderStartPage, pageBounds.minPage, pageBounds.maxPage);
      const eP = clampInt(Math.max(sP, builderEndPage), sP, pageBounds.maxPage);
      return {
        type: 'page_range',
        label: sP === eP ? `Sayfa ${sP}` : `Sayfa ${sP}–${eP}`,
        startPage: sP,
        endPage: eP,
      };
    }
    const s = getSurahMeta(builderSurah);
    const sA = clampInt(builderStartAyah, 1, maxBuilderAyah);
    const eA = clampInt(Math.max(sA, builderEndAyah), sA, maxBuilderAyah);
    const sName = s?.shortNameTr ?? `${builderSurah}. Sure`;
    return {
      type: 'ayah_range',
      label: sA === eA ? `${sName} ${sA}. Ayet` : `${sName} ${sA}–${eA}. Ayet`,
      surah: builderSurah,
      startAyah: sA,
      endAyah: eA,
    };
  };

  const handleStartCreatePlaylist = () => {
    sfxService.play('click');
    setIsCreatingNew(true);
    setEditingPlaylistId(null);
    setDraftName('');
    setDraftItems(pendingItem ? [pendingItem] : []);
  };

  const handleSaveNewPlaylist = (andPlay = false) => {
    const cleanName = draftName.trim() || 'Özel Dinleme Listem';
    if (draftItems.length === 0) return;
    sfxService.play('click');
    const created = createPlaylist(cleanName, draftItems);
    setIsCreatingNew(false);
    setDraftName('');
    setDraftItems([]);
    setPendingItem(null);
    if (andPlay) {
      handlePlayPlaylist(created);
    }
  };

  const editingPlaylist = editingPlaylistId
    ? audioPlaylists.find((p) => p.id === editingPlaylistId) ?? null
    : null;

  const renderItemBuilder = (onAdd: (item: Omit<AudioPlaylistItem, 'id'>) => void) => (
    <div
      className="p-3 rounded-xl border space-y-2.5"
      style={{
        backgroundColor: 'var(--bg-surface-soft)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Bölüm Ekle
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'surah', label: 'Sure' },
              { id: 'juz', label: 'Cüz' },
              { id: 'page', label: 'Sayfa' },
              { id: 'ayah', label: 'Ayet' },
            ] as { id: QuickScope; label: string }[]
          ).map((t) => {
            const active = builderType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setBuilderType(t.id);
                }}
                className="h-7 px-2.5 rounded-lg text-[11px] font-bold border cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface)',
                  borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: active ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {builderType === 'surah' && (
        <select
          value={builderSurah}
          onChange={(e) => setBuilderSurah(Number(e.target.value))}
          className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          {meta.surahs.map((s) => (
            <option key={s.no} value={s.no}>
              {s.no}. {s.nameTr} ({s.ayahCount} ayet)
            </option>
          ))}
        </select>
      )}

      {builderType === 'juz' && (
        <select
          value={builderJuz}
          onChange={(e) => setBuilderJuz(Number(e.target.value))}
          className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          {meta.juzs.map((j) => (
            <option key={j.no} value={j.no}>
              {j.no}. Cüz ({j.ayahCount} ayet)
            </option>
          ))}
        </select>
      )}

      {builderType === 'page' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
            <span>Başlangıç Sayfası</span>
            <input
              type="number"
              min={pageBounds.minPage}
              max={pageBounds.maxPage}
              value={builderStartPage}
              onChange={(e) => {
                const v = clampInt(Number(e.target.value), pageBounds.minPage, pageBounds.maxPage);
                setBuilderStartPage(v);
                if (builderEndPage < v) setBuilderEndPage(v);
              }}
              className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold tabular-nums"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </label>
          <label className="space-y-1 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
            <span>Bitiş Sayfası</span>
            <input
              type="number"
              min={builderStartPage}
              max={pageBounds.maxPage}
              value={builderEndPage}
              onChange={(e) =>
                setBuilderEndPage(
                  clampInt(Number(e.target.value), builderStartPage, pageBounds.maxPage),
                )
              }
              className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold tabular-nums"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </label>
        </div>
      )}

      {builderType === 'ayah' && (
        <div className="space-y-2">
          <select
            value={builderSurah}
            onChange={(e) => {
              const sNo = Number(e.target.value);
              const maxA = getSurahMeta(sNo)?.ayahCount ?? 1;
              setBuilderSurah(sNo);
              setBuilderStartAyah(1);
              setBuilderEndAyah(Math.min(5, maxA));
            }}
            className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {meta.surahs.map((s) => (
              <option key={s.no} value={s.no}>
                {s.no}. {s.nameTr} ({s.ayahCount} ayet)
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
              <span>Başlangıç Ayeti</span>
              <input
                type="number"
                min={1}
                max={maxBuilderAyah}
                value={builderStartAyah}
                onChange={(e) => {
                  const v = clampInt(Number(e.target.value), 1, maxBuilderAyah);
                  setBuilderStartAyah(v);
                  if (builderEndAyah < v) setBuilderEndAyah(v);
                }}
                className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold tabular-nums"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>
            <label className="space-y-1 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
              <span>Bitiş Ayeti</span>
              <input
                type="number"
                min={builderStartAyah}
                max={maxBuilderAyah}
                value={builderEndAyah}
                onChange={(e) =>
                  setBuilderEndAyah(clampInt(Number(e.target.value), builderStartAyah, maxBuilderAyah))
                }
                className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold tabular-nums"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          sfxService.play('click');
          onAdd(buildItemFromBuilder());
        }}
        className="w-full min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        style={{
          backgroundColor: 'var(--brand-primary-soft)',
          borderColor: 'var(--brand-primary)',
          color: 'var(--brand-primary-text)',
        }}
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Parçayı Listeye Ekle</span>
      </button>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dinleme ve Çalma Listeleri"
      className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeListeningDrawer();
      }}
    >
      <div
        className="w-full sm:max-w-xl max-h-[90dvh] rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Üst Başlık & Sekmeler */}
        <div
          className="px-4 pt-3.5 pb-3 sm:px-5 border-b shrink-0 space-y-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Headphones className="w-4.5 h-4.5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                  Dinleme &amp; Çalma Listeleri
                </h2>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  Kapsam, döngü (1x–∞) ve kişisel tilavet listeleri
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeListeningDrawer}
              aria-label="Kapat"
              className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2 Sade Sekme */}
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setActiveTab('quick');
              }}
              className="min-h-[38px] px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              style={{
                backgroundColor: activeTab === 'quick' ? 'var(--bg-surface)' : 'transparent',
                color:
                  activeTab === 'quick' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: activeTab === 'quick' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <Headphones className="w-3.5 h-3.5 shrink-0" />
              <span>Hızlı Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setActiveTab('playlists');
              }}
              className="min-h-[38px] px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              style={{
                backgroundColor: activeTab === 'playlists' ? 'var(--bg-surface)' : 'transparent',
                color:
                  activeTab === 'playlists' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: activeTab === 'playlists' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <ListMusic className="w-3.5 h-3.5 shrink-0" />
              <span>Çalma Listelerim ({audioPlaylists.length})</span>
            </button>
          </div>
        </div>

        {/* Kaydırılabilir İçerik */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 sm:px-5 space-y-4">
          {/* ==============================================================
              SEKME 1: HIZLI DİNLE
              ============================================================== */}
          {activeTab === 'quick' && (
            <>
              {/* Kapsam Seçici Çipler */}
              <div className="space-y-2">
                <span
                  className="block text-[11px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Dinleme Kapsamı
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'surah', label: 'Sure' },
                      { id: 'page', label: 'Sayfa' },
                      { id: 'juz', label: 'Cüz' },
                      { id: 'ayah', label: 'Ayet / Aralık' },
                    ] as { id: QuickScope; label: string }[]
                  ).map((chip) => {
                    const active = scope === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setScope(chip.id);
                        }}
                        className="min-h-[38px] px-1.5 rounded-xl border text-[11px] sm:text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap truncate"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface-soft)',
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

              {/* Seçili Kapsam Formu */}
              {scope === 'surah' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search
                      className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <input
                      type="text"
                      value={surahQuery}
                      onChange={(e) => setSurahQuery(e.target.value)}
                      placeholder="Sure adı veya numarası ara (örn: Yâsîn, 36)..."
                      className="w-full h-9 pl-8 pr-3 rounded-xl border text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <div
                    className="max-h-44 overflow-y-auto rounded-xl border p-1.5 grid grid-cols-2 sm:grid-cols-3 gap-1"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {filteredSurahs.map((s) => {
                      const active = selectedSurah === s.no;
                      return (
                        <button
                          key={s.no}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setSelectedSurah(s.no);
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-left text-xs font-bold flex items-center justify-between gap-1 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface)',
                            color: active ? '#FFFFFF' : 'var(--text-primary)',
                          }}
                        >
                          <span className="truncate tabular-nums">
                            {s.no}. {s.shortNameTr}
                          </span>
                          <span
                            className="text-[10px] tabular-nums shrink-0"
                            style={{ opacity: active ? 0.85 : 0.6 }}
                          >
                            {s.ayahCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {scope === 'page' && (
                <div
                  className="p-3.5 rounded-xl border space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="space-y-1 text-xs font-bold">
                      <span style={{ color: 'var(--text-muted)' }}>Başlangıç Sayfası</span>
                      <input
                        type="number"
                        min={pageBounds.minPage}
                        max={pageBounds.maxPage}
                        value={startPage}
                        onChange={(e) => {
                          const v = clampInt(
                            Number(e.target.value),
                            pageBounds.minPage,
                            pageBounds.maxPage,
                          );
                          setStartPage(v);
                          if (endPage < v) setEndPage(v);
                        }}
                        className="w-full h-10 px-3 rounded-xl border text-sm font-extrabold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold">
                      <span style={{ color: 'var(--text-muted)' }}>Bitiş Sayfası</span>
                      <input
                        type="number"
                        min={startPage}
                        max={pageBounds.maxPage}
                        value={endPage}
                        onChange={(e) =>
                          setEndPage(
                            clampInt(Number(e.target.value), startPage, pageBounds.maxPage),
                          )
                        }
                        className="w-full h-10 px-3 rounded-xl border text-sm font-extrabold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span style={{ color: 'var(--text-muted)' }}>
                      {startPage === endPage
                        ? `Tek sayfa: Sayfa ${startPage}`
                        : `Toplam ${endPage - startPage + 1} sayfa (${startPage}–${endPage})`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEndPage(startPage)}
                        className="px-2 py-1 rounded-lg border font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        Tek Sayfa
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEndPage(Math.min(pageBounds.maxPage, startPage + 4))
                        }
                        className="px-2 py-1 rounded-lg border font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        +5 Sayfa
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {scope === 'juz' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                    {meta.juzs.map((j) => {
                      const active = selectedJuz === j.no;
                      return (
                        <button
                          key={j.no}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setSelectedJuz(j.no);
                          }}
                          className="min-h-[38px] rounded-xl border text-xs font-extrabold tabular-nums cursor-pointer transition-colors"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary)'
                              : 'var(--bg-surface-soft)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? '#FFFFFF' : 'var(--text-primary)',
                          }}
                        >
                          {j.no}. Cüz
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const jm = meta.juzs.find((j) => j.no === selectedJuz);
                    if (!jm) return null;
                    const startName = getSurahMeta(jm.start.s)?.shortNameTr ?? `${jm.start.s}. Sure`;
                    const endName = getSurahMeta(jm.end.s)?.shortNameTr ?? `${jm.end.s}. Sure`;
                    return (
                      <p
                        className="text-[11px] font-semibold px-3 py-2 rounded-xl border tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {jm.no}. Cüz: {startName} {jm.start.a} → {endName} {jm.end.a} ({jm.ayahCount}{' '}
                        ayet)
                      </p>
                    );
                  })()}
                </div>
              )}

              {scope === 'ayah' && (
                <div
                  className="p-3.5 rounded-xl border space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <label className="block space-y-1 text-xs font-bold">
                    <span style={{ color: 'var(--text-muted)' }}>Sure</span>
                    <select
                      value={ayahSurah}
                      onChange={(e) => {
                        const sNo = Number(e.target.value);
                        const maxA = getSurahMeta(sNo)?.ayahCount ?? 1;
                        setAyahSurah(sNo);
                        setStartAyah(1);
                        setEndAyah(Math.min(5, maxA));
                      }}
                      className="w-full h-10 px-3 rounded-xl border text-xs sm:text-sm font-bold"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {meta.surahs.map((s) => (
                        <option key={s.no} value={s.no}>
                          {s.no}. {s.nameTr} ({s.ayahCount} ayet)
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="space-y-1 text-xs font-bold">
                      <span style={{ color: 'var(--text-muted)' }}>Başlangıç Ayeti</span>
                      <input
                        type="number"
                        min={1}
                        max={maxAyahForSelected}
                        value={startAyah}
                        onChange={(e) => {
                          const v = clampInt(Number(e.target.value), 1, maxAyahForSelected);
                          setStartAyah(v);
                          if (endAyah < v) setEndAyah(v);
                        }}
                        className="w-full h-10 px-3 rounded-xl border text-sm font-extrabold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold">
                      <span style={{ color: 'var(--text-muted)' }}>Bitiş Ayeti</span>
                      <input
                        type="number"
                        min={startAyah}
                        max={maxAyahForSelected}
                        value={endAyah}
                        onChange={(e) =>
                          setEndAyah(
                            clampInt(Number(e.target.value), startAyah, maxAyahForSelected),
                          )
                        }
                        className="w-full h-10 px-3 rounded-xl border text-sm font-extrabold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: 'var(--text-muted)' }}>
                      {startAyah === endAyah
                        ? `Tek ayet: ${activeAyahSurahMeta?.shortNameTr ?? ''} ${startAyah}. Ayet`
                        : `${endAyah - startAyah + 1} ayet (${startAyah}–${endAyah})`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEndAyah(startAyah)}
                      className="px-2 py-1 rounded-lg border font-bold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      Tek Ayet Yap
                    </button>
                  </div>
                </div>
              )}

              {/* Okuyucu + Ses Modu + Döngü Ayarları */}
              <div
                className="p-3.5 rounded-xl border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {/* Satır 1: Okuyucu & Ses Modu */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openReciterSelector('default');
                    }}
                    className="min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer max-w-[230px]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Headphones
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span className="truncate">{activeReciter.shortLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65" />
                  </button>

                  <div
                    className="flex items-center p-0.5 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {MODE_OPTIONS.map((opt) => {
                      const active = audioPrefs.mode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateAudioPrefs({ mode: opt.id });
                          }}
                          className="h-8 px-2.5 rounded-lg text-[11px] font-extrabold cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Satır 2: Liste / Bölüm Döngüsü */}
                <div className="space-y-1.5">
                  <span
                    className="text-[11px] font-bold flex items-center gap-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Repeat className="w-3.5 h-3.5" style={{ color: 'var(--brand-accent-text)' }} />
                    <span>Bölüm / Liste Döngüsü</span>
                  </span>
                  <div className="grid grid-cols-6 gap-1">
                    {LOOP_OPTIONS.map((opt) => {
                      const active = (audioPrefs.queueLoop ?? 1) === opt.value;
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateAudioPrefs({ queueLoop: opt.value });
                          }}
                          className="h-8 rounded-lg border text-xs font-extrabold tabular-nums cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-accent-soft)'
                              : 'var(--bg-surface)',
                            borderColor: active ? 'var(--brand-accent)' : 'var(--border-subtle)',
                            color: active ? 'var(--brand-accent-text)' : 'var(--text-primary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Satır 3: Ayet Tekrarı */}
                <div className="space-y-1.5">
                  <span
                    className="text-[11px] font-bold flex items-center gap-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Repeat1
                      className="w-3.5 h-3.5"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Ayet Tekrarı (Her ayeti kaç kez okusun?)</span>
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {REPEAT_OPTIONS.map((opt) => {
                      const active = audioPrefs.repeatCount === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateAudioPrefs({ repeatCount: opt.value });
                          }}
                          className="h-8 rounded-lg border text-xs font-extrabold tabular-nums cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ==============================================================
              SEKME 2: ÇALMA LİSTELERİM
              ============================================================== */}
          {activeTab === 'playlists' && (
            <div className="space-y-3">
              {/* Bekleyen Parça Varsa Ekleme Bandı */}
              {pendingItem && (
                <div
                  className="p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    borderColor: 'var(--brand-accent)',
                  }}
                >
                  <div className="min-w-0">
                    <p
                      className="text-[11px] font-extrabold uppercase tracking-wider"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      Çalma Listesine Eklenecek Bölüm
                    </p>
                    <p className="text-xs sm:text-sm font-extrabold truncate">
                      {pendingItem.label}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingItem(null)}
                    className="h-7 px-2 rounded-lg text-[11px] font-bold border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    Vazgeç
                  </button>
                </div>
              )}

              {/* Yeni Çalma Listesi Oluşturma Formu */}
              {isCreatingNew ? (
                <div
                  className="p-3.5 rounded-2xl border space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--brand-primary)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold">Yeni Çalma Listesi</h3>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNew(false)}
                      className="text-xs font-bold cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      İptal
                    </button>
                  </div>

                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Liste adı (örn: Sabah Hatmim, Akşam Aşırları)..."
                    className="w-full h-10 px-3 rounded-xl border text-xs sm:text-sm font-bold"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />

                  {draftItems.length > 0 && (
                    <div className="space-y-1.5">
                      {draftItems.map((it, idx) => (
                        <div
                          key={`${it.label}_${idx}`}
                          className="px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <span className="truncate tabular-nums">
                            {idx + 1}. {it.label}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => {
                                const next = [...draftItems];
                                const [m] = next.splice(idx, 1);
                                next.splice(idx - 1, 0, m);
                                setDraftItems(next);
                              }}
                              aria-label="Yukarı taşı"
                              className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === draftItems.length - 1}
                              onClick={() => {
                                const next = [...draftItems];
                                const [m] = next.splice(idx, 1);
                                next.splice(idx + 1, 0, m);
                                setDraftItems(next);
                              }}
                              aria-label="Aşağı taşı"
                              className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftItems(draftItems.filter((_, i) => i !== idx))
                              }
                              aria-label="Parçayı sil"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {renderItemBuilder((newItem) => setDraftItems((prev) => [...prev, newItem]))}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={draftItems.length === 0}
                      onClick={() => handleSaveNewPlaylist(false)}
                      className="flex-1 min-h-[40px] px-3 rounded-xl border text-xs font-extrabold cursor-pointer disabled:opacity-40"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      Kaydet
                    </button>
                    <button
                      type="button"
                      disabled={draftItems.length === 0}
                      onClick={() => handleSaveNewPlaylist(true)}
                      className="flex-1 min-h-[40px] px-3 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Kaydet ve Dinle</span>
                    </button>
                  </div>
                </div>
              ) : editingPlaylist ? (
                /* Mevcut Liste Düzenleme Ekranı */
                <div
                  className="p-3.5 rounded-2xl border space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--brand-primary)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold">Listeyi Düzenle</h3>
                    <button
                      type="button"
                      onClick={() => setEditingPlaylistId(null)}
                      className="text-xs font-bold cursor-pointer"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Bitti
                    </button>
                  </div>

                  <input
                    type="text"
                    value={editingPlaylist.name}
                    onChange={(e) => renamePlaylist(editingPlaylist.id, e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border text-xs sm:text-sm font-bold"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />

                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {editingPlaylist.items.map((it, idx) => (
                      <div
                        key={it.id}
                        className="px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <span className="truncate tabular-nums">
                          {idx + 1}. {it.label}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => movePlaylistItem(editingPlaylist.id, it.id, 'up')}
                            aria-label="Yukarı taşı"
                            className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === editingPlaylist.items.length - 1}
                            onClick={() => movePlaylistItem(editingPlaylist.id, it.id, 'down')}
                            aria-label="Aşağı taşı"
                            className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItemFromPlaylist(editingPlaylist.id, it.id)}
                            aria-label="Parçayı sil"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {renderItemBuilder((item) => addItemToPlaylist(editingPlaylist.id, item))}
                </div>
              ) : (
                /* Kayıtlı Çalma Listeleri Görünümü */
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Hızlı Döngü Seçici */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span
                        className="text-[11px] font-bold flex items-center gap-1 mr-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Repeat className="w-3 h-3" />
                        <span>Döngü:</span>
                      </span>
                      {LOOP_OPTIONS.map((opt) => {
                        const active = (audioPrefs.queueLoop ?? 1) === opt.value;
                        return (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              updateAudioPrefs({ queueLoop: opt.value });
                            }}
                            className="h-7 px-2 rounded-lg border text-[11px] font-extrabold tabular-nums cursor-pointer"
                            style={{
                              backgroundColor: active
                                ? 'var(--brand-accent-soft)'
                                : 'var(--bg-surface-soft)',
                              borderColor: active ? 'var(--brand-accent)' : 'var(--border-subtle)',
                              color: active ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleStartCreatePlaylist}
                      className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Yeni Liste</span>
                    </button>
                  </div>

                  {audioPlaylists.length === 0 ? (
                    <div
                      className="p-6 rounded-2xl border text-center space-y-2"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <BookOpen className="w-7 h-7 mx-auto opacity-45" />
                      <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                        Henüz çalma listeniz yok. Yukarıdan yeni bir liste oluşturabilirsiniz.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {audioPlaylists.map((pl) => {
                        const previewLabels = pl.items
                          .slice(0, 4)
                          .map((i) => i.label)
                          .join(' · ');
                        const extraCount = Math.max(0, pl.items.length - 4);
                        const isJustAdded = justAddedPlaylistId === pl.id;

                        return (
                          <div
                            key={pl.id}
                            className="p-3 rounded-2xl border space-y-2"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className="text-xs sm:text-sm font-extrabold truncate">
                                    {pl.name}
                                  </h4>
                                  <span
                                    className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
                                    style={{
                                      backgroundColor: 'var(--bg-surface)',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    {pl.items.length} bölüm
                                  </span>
                                </div>
                                <p
                                  className="text-[11px] mt-0.5 line-clamp-2"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {previewLabels}
                                  {extraCount > 0 ? ` +${extraCount} daha` : ''}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {pendingItem ? (
                                  <button
                                    type="button"
                                    onClick={() => handleAddPendingToExisting(pl.id)}
                                    className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                    style={{
                                      backgroundColor: isJustAdded
                                        ? '#10B981'
                                        : 'var(--brand-primary)',
                                    }}
                                  >
                                    {isJustAdded ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Eklendi</span>
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Ekle</span>
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={pl.items.length === 0}
                                    onClick={() => handlePlayPlaylist(pl)}
                                    className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                                    style={{ backgroundColor: 'var(--brand-primary)' }}
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>Oynat</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    sfxService.play('click');
                                    setEditingPlaylistId(pl.id);
                                  }}
                                  aria-label={`${pl.name} listesini düzenle`}
                                  title="Listeyi düzenle"
                                  className="w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => deletePlaylist(pl.id)}
                                  aria-label={`${pl.name} listesini sil`}
                                  title="Listeyi sil"
                                  className="w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer text-red-500"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-subtle)',
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Ortak Kompakt Seçenek: Okunan metni ekranda göster */}
        <div
          className="px-4 py-2.5 sm:px-5 border-t flex items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            role="switch"
            aria-checked={audioPrefs.showTextOnStart}
            onClick={() => {
              sfxService.play('click');
              updateAudioPrefs({ showTextOnStart: !audioPrefs.showTextOnStart });
            }}
            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen
                className="w-4 h-4 shrink-0"
                style={{
                  color: audioPrefs.showTextOnStart
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-muted)',
                }}
              />
              <div className="min-w-0">
                <p className="text-xs font-extrabold leading-tight truncate">
                  Okunan metni ekranda göster
                </p>
                <p
                  className="text-[10px] sm:text-[11px] leading-tight truncate mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {audioPrefs.showTextOnStart
                    ? 'Başlatınca Okuma ekranını açar ve çalan ayeti canlı takip eder'
                    : 'Mevcut sayfada kalır, ses alt çubuktan arka planda çalar'}
                </p>
              </div>
            </div>
            <span
              className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
              style={{
                backgroundColor: audioPrefs.showTextOnStart
                  ? 'var(--brand-primary)'
                  : 'var(--border-strong)',
              }}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  audioPrefs.showTextOnStart ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        </div>

        {/* Alt Sabit Aksiyon Çubuğu (Hızlı Dinle Sekmesi İçin) */}
        {activeTab === 'quick' && (
          <div
            className="px-4 py-3 sm:px-5 border-t flex items-center gap-2 shrink-0 pb-safe"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={handlePlayQuick}
              className="flex-1 min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.99]"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Hemen Dinle</span>
            </button>

            <button
              type="button"
              onClick={handleSaveQuickToPlaylist}
              className="min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Listeye Kaydet</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
