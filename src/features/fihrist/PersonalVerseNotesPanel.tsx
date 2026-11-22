import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight,
  BookOpen,
  Edit3,
  HardDrive,
  Pin,
  Printer,
  Search,
  StickyNote,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { HydrateSourceItem } from '../../services/fihristService';
import { sfxService } from '../../services/sfxService';
import {
  VERSE_NOTE_COLOR_STYLES,
  VERSE_NOTE_COLORS,
  verseNotesStorage,
  type VerseNote,
  type VerseNoteColor,
} from '../../services/verseNotesStorage';
import { useAppStore } from '../../store/useAppStore';
import { getSurahMap } from '../../utils/poolUtils';
import { normalizeTurkish } from '../../utils/textNormalize';
import { PrintableFihristModal } from './PrintableFihristModal';

type NotesSortMode = 'recent' | 'mushaf';

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export const PersonalVerseNotesPanel: React.FC = () => {
  const {
    meta,
    setActiveTab,
    navigateToStudy,
    openVerseNoteModal,
    openQuickResearch,
    openSettingsModal,
  } = useAppStore();
  const allNotes = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getSnapshot,
  );

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);

  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<VerseNoteColor | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<NotesSortMode>('recent');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of allNotes) {
      for (const tag of note.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr-TR'))
      .map(([tag, count]) => ({ tag, count }));
  }, [allNotes]);

  const filteredNotes = useMemo<VerseNote[]>(() => {
    const normQ = normalizeTurkish(query);
    const list = allNotes.filter((note) => {
      if (colorFilter !== 'all' && note.color !== colorFilter) return false;
      if (tagFilter !== 'all' && !note.tags.includes(tagFilter)) return false;
      if (normQ) {
        const sMeta = surahMap.get(note.surah);
        const hay = normalizeTurkish(
          `${note.surah}:${note.ayah} ${sMeta?.nameTr ?? ''} ${sMeta?.shortNameTr ?? ''} ${note.text} ${note.tags.join(' ')}`,
        );
        if (!hay.includes(normQ)) return false;
      }
      return true;
    });

    if (sortMode === 'mushaf') {
      return [...list].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
    }
    return list;
  }, [allNotes, colorFilter, tagFilter, query, sortMode, surahMap]);

  const printableItems = useMemo<HydrateSourceItem[]>(
    () =>
      filteredNotes.map((note) => ({
        surah: note.surah,
        startAyah: note.ayah,
        endAyah: note.ayah,
        note:
          note.tags.length > 0
            ? `[${note.tags.join(', ')}] ${note.text}`.trim()
            : note.text,
      })),
    [filteredNotes],
  );

  const handleOpenInReader = (note: VerseNote) => {
    sfxService.play('click');
    navigateToStudy({
      viewMode: 'cards',
      surah: note.surah,
      ayah: note.ayah,
      page: note.page,
    });
  };

  if (allNotes.length === 0) {
    return (
      <section className="surface-card rounded-2xl p-6 sm:p-10 text-center space-y-4">
        <div
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            color: 'var(--brand-primary-text)',
          }}
        >
          <StickyNote className="w-7 h-7" />
        </div>
        <div className="space-y-1.5 max-w-lg mx-auto">
          <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
            Henüz Kişisel Ayet Notunuz Yok
          </h3>
          <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Mushaf, Kitap veya Ayet Kartları görünümlerinde herhangi bir ayetin menüsünden{' '}
            <strong>Kişisel Not Ekle</strong> seçeneğiyle renkli ve etiketli tefekkür notlarınızı
            kaydedebilirsiniz.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setActiveTab('reader');
            }}
            className="min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Okuma Ekranına Git</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              openSettingsModal();
            }}
            className="min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <HardDrive
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--brand-primary-text)' }}
            />
            <span>Yedekten Geri Yükle</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Üst Arama, Filtre ve Yazdırma Şeridi */}
      <section className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex-1 min-w-[200px] relative flex items-center">
            <Search
              className="w-4 h-4 absolute left-3 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Not metni, etiket veya sure adı ara..."
              className="w-full min-h-[38px] pl-9 pr-8 rounded-xl border text-xs sm:text-sm font-medium outline-none focus:border-[var(--brand-primary)]"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Aramayı temizle"
                className="w-7 h-7 rounded-lg flex items-center justify-center absolute right-1 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div
              className="inline-flex p-0.5 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {(
                [
                  { id: 'recent', label: 'Son Eklenen' },
                  { id: 'mushaf', label: 'Mushaf Sırası' },
                ] as const
              ).map((opt) => {
                const active = sortMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setSortMode(opt.id);
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={filteredNotes.length === 0}
              onClick={() => {
                sfxService.play('click');
                setIsPrintOpen(true);
              }}
              className="min-h-[36px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <Printer className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              <span>A4 PDF</span>
            </button>
          </div>
        </div>

        {/* Renk ve Etiket Filtre Çipleri */}
        {allNotes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setColorFilter('all');
              }}
              className="min-h-[28px] px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer"
              style={{
                backgroundColor:
                  colorFilter === 'all' ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
                borderColor:
                  colorFilter === 'all' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color:
                  colorFilter === 'all' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              }}
            >
              Tüm Renkler
            </button>

            {VERSE_NOTE_COLORS.map((c) => {
              const pal = VERSE_NOTE_COLOR_STYLES[c];
              const active = colorFilter === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setColorFilter(active ? 'all' : c);
                  }}
                  className="min-h-[28px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: active ? pal.softBg : 'var(--bg-surface-soft)',
                    borderColor: active ? pal.dot : 'var(--border-subtle)',
                    color: active ? pal.dot : 'var(--text-secondary)',
                  }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pal.dot }} />
                  <span>{pal.label}</span>
                </button>
              );
            })}

            {availableTags.length > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="w-px h-4 mx-0.5"
                  style={{ backgroundColor: 'var(--border-subtle)' }}
                />
                {availableTags.map(({ tag, count }) => {
                  const active = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setTagFilter(active ? 'all' : tag);
                      }}
                      className="min-h-[28px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: active
                          ? 'var(--brand-accent-soft)'
                          : 'var(--bg-surface-soft)',
                        borderColor: active ? 'var(--brand-accent)' : 'var(--border-subtle)',
                        color: active ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                      }}
                    >
                      <Tag className="w-3 h-3 shrink-0" />
                      <span>{tag}</span>
                      <span className="opacity-70 tabular-nums">({count})</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
      </section>

      {/* Not Listesi */}
      {filteredNotes.length === 0 ? (
        <section className="surface-card rounded-2xl p-6 text-center space-y-2">
          <p className="text-sm font-bold">Aramanızla eşleşen ayet notu bulunamadı.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setColorFilter('all');
              setTagFilter('all');
            }}
            className="min-h-[36px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-primary-text)',
            }}
          >
            Filtreleri Temizle
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredNotes.map((note) => {
            const pal = VERSE_NOTE_COLOR_STYLES[note.color] ?? VERSE_NOTE_COLOR_STYLES.emerald;
            const sMeta = surahMap.get(note.surah);
            const isDeleting = confirmDeleteKey === note.key;

            return (
              <article
                key={note.key}
                className="rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: pal.border,
                }}
              >
                <div className="space-y-2.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-extrabold tabular-nums"
                        style={{
                          backgroundColor: pal.softBg,
                          color: pal.dot,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: pal.dot }}
                        />
                        <span>
                          {sMeta?.nameTr ?? `${note.surah}. Sure`} {note.surah}:{note.ayah}
                        </span>
                      </span>
                      {note.page && (
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          S.{note.page}
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[11px] tabular-nums shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatShortDate(note.updatedAt)}
                    </span>
                  </div>

                  {note.text && (
                    <p
                      className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {note.text}
                    </p>
                  )}

                  {note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {note.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                          style={{
                            backgroundColor: pal.softBg,
                            color: pal.dot,
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-1.5"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenInReader(note)}
                      className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                      <span>Okuyucuda Aç</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openVerseNoteModal(note.surah, note.ayah, note.page);
                      }}
                      className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span>Düzenle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openQuickResearch(
                          note.surah,
                          note.ayah,
                          note.ayah,
                          note.page,
                          note.text || undefined,
                        );
                      }}
                      title="Araştırma konusuna aktar"
                      className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        borderColor: 'rgba(217, 119, 6, 0.3)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      <Pin className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Araştırmaya Ekle</span>
                    </button>
                  </div>

                  {isDeleting ? (
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        verseNotesStorage.deleteVerseNote(note.surah, note.ayah);
                        setConfirmDeleteKey(null);
                      }}
                      className="min-h-[34px] px-2.5 rounded-lg text-xs font-extrabold text-white bg-red-600 cursor-pointer"
                    >
                      Onayla
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setConfirmDeleteKey(note.key);
                      }}
                      aria-label="Notu sil"
                      title="Notu sil"
                      className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-red-500/10"
                      style={{ color: '#DC2626' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PrintableFihristModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        title="Kişisel Ayet Notlarım"
        subtitle={`${filteredNotes.length} ayet notu`}
        items={printableItems}
        allowNotesToggle={true}
        defaultPrintMode="ar_meal"
      />
    </div>
  );
};
