import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Check, FolderPlus, Pin, Plus, StickyNote, X } from 'lucide-react';
import { useBackButtonGuard } from '../../services/backStackService';
import { researchStorage } from '../../services/researchStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';

export const QuickAddToResearchModal: React.FC = () => {
  const { quickResearchSeed, closeQuickResearch, meta, setActiveTab } = useAppStore();
  const topics = useSyncExternalStore(
    researchStorage.subscribe,
    researchStorage.getSnapshot,
  );

  const surahMeta = useMemo(() => {
    if (!quickResearchSeed || !meta) return null;
    return meta.surahs.find((s) => s.no === quickResearchSeed.surah) ?? null;
  }, [quickResearchSeed, meta]);

  const maxAyah = surahMeta?.ayahCount ?? 286;
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(1);
  const [note, setNote] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!quickResearchSeed) return;
    const s = Math.max(1, Math.min(maxAyah, quickResearchSeed.startAyah));
    const e = Math.max(s, Math.min(maxAyah, quickResearchSeed.endAyah ?? s));
    setStartAyah(s);
    setEndAyah(e);
    setNote(quickResearchSeed.initialNote ?? '');
    setNewTopicTitle('');
    setFeedback(null);
  }, [quickResearchSeed, maxAyah]);

  useBackButtonGuard('quick_add_to_research_modal', Boolean(quickResearchSeed), closeQuickResearch);

  useEffect(() => {
    if (!quickResearchSeed) return;
    return acquireBodyScrollLock();
  }, [quickResearchSeed]);

  if (!quickResearchSeed) return null;

  const surahName = surahMeta?.nameTr ?? `${quickResearchSeed.surah}. Sure`;
  const safeStart = Math.min(startAyah, endAyah);
  const safeEnd = Math.max(startAyah, endAyah);
  const rangeLabel =
    safeStart === safeEnd ? `${safeStart}. Ayet` : `${safeStart}–${safeEnd}. Ayetler`;

  const handleAddToExisting = (topicId: string, topicTitle: string) => {
    sfxService.play('click');
    const res = researchStorage.addVerses(topicId, [
      {
        surah: quickResearchSeed.surah,
        startAyah: safeStart,
        endAyah: safeEnd,
        note: note.trim() || undefined,
      },
    ]);
    if (res.addedCount > 0) {
      setFeedback(`"${topicTitle}" başlığına eklendi.`);
      window.setTimeout(() => closeQuickResearch(), 650);
    } else {
      setFeedback(`Bu ayet aralığı "${topicTitle}" başlığında zaten kayıtlı.`);
    }
  };

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTopicTitle.trim();
    if (!clean) return;
    sfxService.play('click');
    const created = researchStorage.createTopic(clean);
    researchStorage.addVerses(created.id, [
      {
        surah: quickResearchSeed.surah,
        startAyah: safeStart,
        endAyah: safeEnd,
        note: note.trim() || undefined,
      },
    ]);
    setFeedback(`"${created.title}" oluşturuldu ve eklendi.`);
    window.setTimeout(() => closeQuickResearch(), 650);
  };

  return (
    <div
      className="fixed inset-0 z-[82] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Araştırma Defterine Ekle"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeQuickResearch();
      }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-3.5 sm:px-5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Pin className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold truncate">
                Araştırma Defterime Ekle
              </h3>
              <p className="text-xs truncate tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {surahName} ({quickResearchSeed.surah}) · {rangeLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeQuickResearch}
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
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto scrollbar-thin">
          {/* Ayet Aralığı Ayarı */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label
                htmlFor="quick-res-start"
                className="block text-[11px] font-bold"
                style={{ color: 'var(--text-muted)' }}
              >
                Başlangıç Ayeti
              </label>
              <input
                id="quick-res-start"
                type="number"
                min={1}
                max={maxAyah}
                value={startAyah}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(maxAyah, Number(e.target.value) || 1));
                  setStartAyah(val);
                  if (val > endAyah) setEndAyah(val);
                }}
                className="w-full min-h-[38px] px-3 rounded-xl border text-xs sm:text-sm font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="quick-res-end"
                className="block text-[11px] font-bold"
                style={{ color: 'var(--text-muted)' }}
              >
                Bitiş Ayeti (maks. {maxAyah})
              </label>
              <input
                id="quick-res-end"
                type="number"
                min={startAyah}
                max={maxAyah}
                value={endAyah}
                onChange={(e) => {
                  const val = Math.max(
                    startAyah,
                    Math.min(maxAyah, Number(e.target.value) || startAyah),
                  );
                  setEndAyah(val);
                }}
                className="w-full min-h-[38px] px-3 rounded-xl border text-xs sm:text-sm font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Opsiyonel Not */}
          <div className="space-y-1">
            <label
              htmlFor="quick-res-note"
              className="flex items-center gap-1.5 text-[11px] font-bold"
              style={{ color: 'var(--text-muted)' }}
            >
              <StickyNote className="w-3.5 h-3.5" style={{ color: 'var(--brand-accent-text)' }} />
              <span>Kısa Araştırma Notu (İsteğe bağlı)</span>
            </label>
            <input
              id="quick-res-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn: Vaaz veya ders için önemli vurgu..."
              className="w-full min-h-[38px] px-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-[var(--brand-primary)]"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {feedback && (
            <div
              className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                color: '#047857',
              }}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Mevcut Araştırma Konuları */}
          {topics.length > 0 && (
            <div className="space-y-1.5">
              <p
                className="text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Mevcut Konuya Tek Dokunuşla Ekle
              </p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-thin pr-0.5">
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => handleAddToExisting(topic.id, topic.title)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer hover:border-[var(--brand-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold truncate">{topic.title}</p>
                      <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {topic.items.length} kayıt
                      </p>
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0"
                      style={{
                        backgroundColor: 'var(--brand-primary-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ekle</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Anında Yeni Konu Oluştur ve Ekle */}
          <form onSubmit={handleCreateAndAdd} className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <label
              htmlFor="quick-res-new-topic"
              className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              <FolderPlus className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary-text)' }} />
              <span>Yeni Araştırma Başlığı Oluştur &amp; Ekle</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="quick-res-new-topic"
                type="text"
                value={newTopicTitle}
                onChange={(e) => setNewTopicTitle(e.target.value)}
                placeholder="Örn: Kur'an'da Aile Ahlakı..."
                className="flex-1 min-w-0 min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="submit"
                disabled={!newTopicTitle.trim()}
                className="min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold text-white shrink-0 cursor-pointer disabled:opacity-45"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Oluştur
              </button>
            </div>
          </form>
        </div>

        {/* Alt Kısayol */}
        <div
          className="px-4 py-3 border-t flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              closeQuickResearch();
              setActiveTab('fihrist');
            }}
            className="text-xs font-bold hover:underline cursor-pointer"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            Araştırma Defterime Git →
          </button>
          <button
            type="button"
            onClick={closeQuickResearch}
            className="min-h-[36px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            Okumaya Dön
          </button>
        </div>
      </div>
    </div>
  );
};
