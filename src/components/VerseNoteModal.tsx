import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pin, Plus, StickyNote, Tag, Trash2, X } from 'lucide-react';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { dataService } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import {
  MAX_VERSE_NOTE_LENGTH,
  MAX_VERSE_NOTE_TAGS,
  QUICK_VERSE_NOTE_TAGS,
  VERSE_NOTE_COLOR_STYLES,
  VERSE_NOTE_COLORS,
  verseNotesStorage,
  type VerseNoteColor,
} from '../services/verseNotesStorage';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';

export const VerseNoteModal: React.FC = () => {
  const {
    verseNoteTarget,
    closeVerseNoteModal,
    openQuickResearch,
    meta,
    settings,
  } = useAppStore();

  const isOpen = Boolean(verseNoteTarget);
  const existingNote = useMemo(
    () =>
      verseNoteTarget
        ? verseNotesStorage.getVerseNote(verseNoteTarget.surah, verseNoteTarget.ayah)
        : null,
    [verseNoteTarget],
  );

  const surahMeta = useMemo(() => {
    if (!verseNoteTarget || !meta) return null;
    return meta.surahs.find((s) => s.no === verseNoteTarget.surah) ?? null;
  }, [verseNoteTarget, meta]);

  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [color, setColor] = useState<VerseNoteColor>('emerald');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<{ ar: string; meal: string; page: number } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useBackButtonGuard('verse_note_modal', isOpen, closeVerseNoteModal);

  useEffect(() => {
    if (!isOpen) return;
    return acquireBodyScrollLock();
  }, [isOpen]);

  // Hedef ayet değiştiğinde formu doldur ve ayet önizlemesini yükle
  useEffect(() => {
    if (!verseNoteTarget) {
      setPreview(null);
      return;
    }
    const saved = verseNotesStorage.getVerseNote(verseNoteTarget.surah, verseNoteTarget.ayah);
    setText(saved?.text ?? '');
    setTags(saved?.tags ?? []);
    setColor(saved?.color ?? 'emerald');
    setCustomTagInput('');
    setConfirmDelete(false);

    let cancelled = false;
    void dataService
      .getSurahBundle(verseNoteTarget.surah)
      .then((bundle) => {
        if (cancelled) return;
        const found = bundle.verses.find((v) => v.ayah === verseNoteTarget.ayah);
        if (!found) return;
        const mealText =
          settings.primaryMealId === 'm2'
            ? found.m2?.t || found.m1?.t || ''
            : found.m1?.t || found.m2?.t || '';
        setPreview({ ar: found.ar.t, meal: mealText, page: found.page });
      })
      .catch(() => {
        // Önizleme yüklenemese de not düzenleme çalışır
      });

    return () => {
      cancelled = true;
    };
  }, [verseNoteTarget, settings.primaryMealId]);

  // Textarea otomatik yükseklik ayarı
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(320, Math.max(120, el.scrollHeight))}px`;
  }, [text, isOpen]);

  if (!verseNoteTarget) return null;

  const surahName = surahMeta?.nameTr ?? `${verseNoteTarget.surah}. Sure`;
  const effectivePage = verseNoteTarget.page ?? preview?.page ?? existingNote?.page;
  const activePalette = VERSE_NOTE_COLOR_STYLES[color];

  const toggleTag = (tagLabel: string) => {
    sfxService.play('click');
    const lower = tagLabel.toLocaleLowerCase('tr-TR');
    setTags((prev) => {
      const exists = prev.some((t) => t.toLocaleLowerCase('tr-TR') === lower);
      if (exists) {
        return prev.filter((t) => t.toLocaleLowerCase('tr-TR') !== lower);
      }
      if (prev.length >= MAX_VERSE_NOTE_TAGS) return prev;
      return [...prev, tagLabel];
    });
  };

  const handleAddCustomTag = () => {
    const clean = customTagInput.trim().slice(0, 32);
    if (!clean) return;
    const lower = clean.toLocaleLowerCase('tr-TR');
    if (tags.some((t) => t.toLocaleLowerCase('tr-TR') === lower)) {
      setCustomTagInput('');
      return;
    }
    if (tags.length >= MAX_VERSE_NOTE_TAGS) return;
    sfxService.play('click');
    setTags((prev) => [...prev, clean]);
    setCustomTagInput('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    sfxService.play('correct');
    verseNotesStorage.upsertVerseNote({
      surah: verseNoteTarget.surah,
      ayah: verseNoteTarget.ayah,
      page: effectivePage,
      text,
      tags,
      color,
    });
    closeVerseNoteModal();
  };

  const handleDelete = () => {
    sfxService.play('click');
    verseNotesStorage.deleteVerseNote(verseNoteTarget.surah, verseNoteTarget.ayah);
    closeVerseNoteModal();
  };

  const handleTransferToResearch = () => {
    sfxService.play('click');
    if (text.trim() || tags.length > 0) {
      verseNotesStorage.upsertVerseNote({
        surah: verseNoteTarget.surah,
        ayah: verseNoteTarget.ayah,
        page: effectivePage,
        text,
        tags,
        color,
      });
    }
    const { surah, ayah } = verseNoteTarget;
    const noteToTransfer = text.trim() || undefined;
    closeVerseNoteModal();
    openQuickResearch(surah, ayah, ayah, effectivePage, noteToTransfer);
  };

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.NESTED_MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verse-note-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeVerseNoteModal();
      }}
    >
      <form
        onSubmit={handleSave}
        className="w-full sm:max-w-xl max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: activePalette.softBg,
                color: activePalette.dot,
              }}
            >
              <StickyNote className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="verse-note-modal-title"
                className="text-sm sm:text-base font-extrabold tracking-tight truncate"
              >
                {existingNote ? 'Ayet Notunu Düzenle' : 'Kişisel Ayet Notu'}
              </h2>
              <p className="text-[11px] sm:text-xs font-semibold truncate tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {surahName} {verseNoteTarget.surah}:{verseNoteTarget.ayah}
                {effectivePage ? ` · Sayfa ${effectivePage}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeVerseNoteModal}
            aria-label="Not penceresini kapat"
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer hover:bg-[var(--bg-surface)] shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          {/* Ayet Önizlemesi */}
          {preview && (
            <div
              className="rounded-xl border p-3 space-y-1.5"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p
                dir="rtl"
                className="arabic-text text-right text-base sm:text-lg leading-loose line-clamp-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {preview.ar}
              </p>
              {preview.meal && (
                <p
                  className="text-xs leading-relaxed line-clamp-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {preview.meal}
                </p>
              )}
            </div>
          )}

          {/* Renk Etiketi Seçici */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              Vurgu Rengi
            </span>
            <div className="flex items-center gap-2">
              {VERSE_NOTE_COLORS.map((c) => {
                const pal = VERSE_NOTE_COLOR_STYLES[c];
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setColor(c);
                    }}
                    title={pal.label}
                    aria-label={`Renk: ${pal.label}`}
                    aria-pressed={selected}
                    className="h-7 px-2.5 rounded-full border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all"
                    style={{
                      backgroundColor: selected ? pal.softBg : 'var(--bg-surface-soft)',
                      borderColor: selected ? pal.dot : 'var(--border-subtle)',
                      color: selected ? pal.dot : 'var(--text-secondary)',
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: pal.dot }}
                    />
                    <span className="hidden sm:inline">{pal.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hızlı Etiket Çipleri + Özel Etiket */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Tag className="w-3.5 h-3.5" />
                <span>Etiketler</span>
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {tags.length}/{MAX_VERSE_NOTE_TAGS}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_VERSE_NOTE_TAGS.map((tag) => {
                const isSelected = tags.some(
                  (t) => t.toLocaleLowerCase('tr-TR') === tag.toLocaleLowerCase('tr-TR'),
                );
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="min-h-[30px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? activePalette.softBg
                        : 'var(--bg-surface-soft)',
                      borderColor: isSelected ? activePalette.dot : 'var(--border-subtle)',
                      color: isSelected ? activePalette.dot : 'var(--text-secondary)',
                    }}
                  >
                    {isSelected ? `✓ ${tag}` : tag}
                  </button>
                );
              })}

              {tags
                .filter(
                  (t) =>
                    !QUICK_VERSE_NOTE_TAGS.some(
                      (q) => q.toLocaleLowerCase('tr-TR') === t.toLocaleLowerCase('tr-TR'),
                    ),
                )
                .map((customTag) => (
                  <button
                    key={customTag}
                    type="button"
                    onClick={() => toggleTag(customTag)}
                    className="min-h-[30px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: activePalette.softBg,
                      borderColor: activePalette.dot,
                      color: activePalette.dot,
                    }}
                  >
                    <span>{customTag}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
            </div>

            {tags.length < MAX_VERSE_NOTE_TAGS && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  maxLength={32}
                  placeholder="Özel etiket ekle (örn. Sohbet, Hatıra)..."
                  className="flex-1 min-w-0 min-h-[38px] px-3 rounded-xl border text-base sm:text-xs font-semibold outline-none focus:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  disabled={!customTagInput.trim()}
                  className="min-h-[36px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ekle</span>
                </button>
              </div>
            )}
          </div>

          {/* Not Yazma Alanı */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="verse-note-textarea"
                className="text-xs font-bold"
                style={{ color: 'var(--text-secondary)' }}
              >
                Tefekkür / Ders Notunuz
              </label>
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {text.length}/{MAX_VERSE_NOTE_LENGTH}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              id="verse-note-textarea"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_VERSE_NOTE_LENGTH))}
              placeholder="Bu ayetten kalbinize düşen tefekkürü, ders notunuzu veya önemli nükteleri buraya yazabilirsiniz..."
              rows={5}
              className="w-full p-3.5 rounded-xl border text-base sm:text-sm leading-relaxed outline-none resize-none focus:border-[var(--brand-primary)]"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: activePalette.border,
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Alt Aksiyon Çubuğu */}
        <div
          className="px-4 sm:px-5 py-3 pb-[max(0.85rem,env(safe-area-inset-bottom,0px))] sm:pb-3 border-t flex flex-wrap items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {existingNote &&
              (confirmDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="min-h-[38px] px-3 rounded-xl text-xs font-extrabold text-white bg-red-600 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Silmeyi Onayla</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setConfirmDelete(true);
                  }}
                  className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:bg-red-500/10"
                  style={{
                    borderColor: 'rgba(220, 38, 38, 0.3)',
                    color: '#DC2626',
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Sil</span>
                </button>
              ))}

            <button
              type="button"
              onClick={handleTransferToResearch}
              title="Bu ayeti notunuzla birlikte tematik Araştırma Defterinize ekleyin"
              className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'rgba(217, 119, 6, 0.35)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Pin className="w-3.5 h-3.5 shrink-0" />
              <span>Araştırma Defterine Aktar</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={!text.trim() && tags.length === 0}
            className="min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-45"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>Kaydet</span>
          </button>
        </div>
      </form>
    </div>
  );
};
