import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Bookmark, Compass, Hash, Search, X } from 'lucide-react';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';

interface QuickResult {
  id: string;
  kind: 'surah' | 'verse' | 'page' | 'juz' | 'bookmark';
  title: string;
  subtitle: string;
  badge: string;
  action: () => void;
}

function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

export const QuickSearchModal: React.FC = () => {
  const {
    isSearchModalOpen,
    closeSearchModal,
    meta,
    studyProgress,
    navigateToStudy,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isSearchModalOpen) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isSearchModalOpen]);

  const results = useMemo<QuickResult[]>(() => {
    if (!meta) return [];
    const q = query.trim();
    const items: QuickResult[] = [];

    if (!q) {
      // Varsayılan hızlı erişim önerileri: Ayraçlar + popüler sureler
      for (const bm of studyProgress.pageBookmarks.slice(0, 3)) {
        const sMeta = meta.surahs.find((s) => s.no === bm.surah);
        items.push({
          id: `bm-${bm.id}`,
          kind: 'bookmark',
          title: bm.label,
          subtitle: `${sMeta?.nameTr ?? `${bm.surah}. Sure`} · Sayfa ${bm.page}`,
          badge: bm.isHatim ? 'Hatim' : 'Ayraç',
          action: () =>
            navigateToStudy({
              viewMode: 'mushaf',
              page: bm.page,
              surah: bm.surah,
              ayah: bm.ayah,
            }),
        });
      }

      const featured = [1, 17, 18, 24, 31, 36, 49, 67];
      for (const sNo of featured) {
        const s = meta.surahs.find((x) => x.no === sNo);
        if (!s) continue;
        items.push({
          id: `feat-${s.no}`,
          kind: 'surah',
          title: `${s.no}. ${s.nameTr}`,
          subtitle: `${s.ayahCount} ayet · Sayfa ${s.pageStart} · ${s.type}`,
          badge: 'Sure',
          action: () =>
            navigateToStudy({
              viewMode: 'mushaf',
              surah: s.no,
              ayah: 1,
              page: s.pageStart,
            }),
        });
      }
      return items.slice(0, 10);
    }

    // 1. Sure:Ayet formatı (örn. "49:10", "2 255", "17/23")
    const refMatch = q.match(/^(\d{1,3})\s*[:./\s]\s*(\d{1,3})$/);
    if (refMatch) {
      const sNo = Number(refMatch[1]);
      const aNo = Number(refMatch[2]);
      const surah = meta.surahs.find((s) => s.no === sNo);
      if (surah && aNo >= 1 && aNo <= surah.ayahCount) {
        const idxRow = meta.verseIndex.find((row) => row[1] === sNo && row[2] === aNo);
        const targetPage = idxRow ? idxRow[4] : surah.pageStart;
        items.push({
          id: `ref-${sNo}-${aNo}`,
          kind: 'verse',
          title: `${surah.nameTr} ${sNo}:${aNo}`,
          subtitle: `Mushaf Sayfa ${targetPage} · Doğrudan ayete git`,
          badge: 'Ayet',
          action: () =>
            navigateToStudy({
              viewMode: 'mushaf',
              surah: sNo,
              ayah: aNo,
              page: targetPage,
            }),
        });
      }
    }

    // 2. Sayfa araması (örn. "515", "s 515", "sayfa 515")
    const pageMatch = q.match(/^(?:(?:sayfa|sf|s)\.?\s*)?(\d{1,3})$/i);
    if (pageMatch) {
      const pNo = Number(pageMatch[1]);
      if (pNo >= 0 && pNo <= 604) {
        const firstOnPage = meta.verseIndex.find((row) => row[4] === pNo);
        const surah = firstOnPage ? meta.surahs.find((s) => s.no === firstOnPage[1]) : null;
        items.push({
          id: `page-${pNo}`,
          kind: 'page',
          title: `Mushaf Sayfa ${pNo}`,
          subtitle: surah
            ? `${surah.nameTr} (${firstOnPage![1]}:${firstOnPage![2]}) · ${firstOnPage![3]}. Cüz`
            : 'Mushaf sayfasını aç',
          badge: 'Sayfa',
          action: () =>
            navigateToStudy({
              viewMode: 'mushaf',
              page: pNo,
              surah: firstOnPage?.[1],
              ayah: firstOnPage?.[2],
            }),
        });
      }
    }

    // 3. Cüz araması (örn. "cüz 26", "cuz 30", veya 1..30 sayı)
    const juzMatch = q.match(/^(?:(?:cüz|cuz|c)\.?\s*)?(\d{1,2})$/i);
    if (juzMatch) {
      const jNo = Number(juzMatch[1]);
      const juz = meta.juzs.find((j) => j.no === jNo);
      if (juz) {
        const startRow = meta.verseIndex.find(
          (row) => row[1] === juz.start.s && row[2] === juz.start.a,
        );
        const startSurah = meta.surahs.find((s) => s.no === juz.start.s);
        items.push({
          id: `juz-${jNo}`,
          kind: 'juz',
          title: `${jNo}. Cüz Başlangıcı`,
          subtitle: `${startSurah?.nameTr ?? `${juz.start.s}. Sure`} ${juz.start.s}:${juz.start.a}${
            startRow ? ` · Sayfa ${startRow[4]}` : ''
          }`,
          badge: 'Cüz',
          action: () =>
            navigateToStudy({
              viewMode: 'mushaf',
              surah: juz.start.s,
              ayah: juz.start.a,
              page: startRow ? startRow[4] : startSurah?.pageStart,
            }),
        });
      }
    }

    // 4. Sure adı veya numarası araması
    const normQ = normalizeTr(q);
    for (const s of meta.surahs) {
      const matchesNum = String(s.no) === q;
      const matchesName =
        normalizeTr(s.nameTr).includes(normQ) ||
        normalizeTr(s.shortNameTr).includes(normQ) ||
        s.nameAr.includes(q);
      if (matchesNum || matchesName) {
        items.push({
          id: `surah-${s.no}`,
          kind: 'surah',
          title: `${s.no}. ${s.nameTr}`,
          subtitle: `${s.ayahCount} ayet · Sayfa ${s.pageStart}–${s.pageEnd} · ${s.type}`,
          badge: s.questionCount > 0 ? `${s.questionCount} soru` : 'Sure',
          action: () =>
            navigateToStudy({
              viewMode: 'mushaf',
              surah: s.no,
              ayah: 1,
              page: s.pageStart,
            }),
        });
      }
      if (items.length >= 12) break;
    }

    return items.slice(0, 12);
  }, [meta, query, studyProgress.pageBookmarks, navigateToStudy]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isSearchModalOpen) return null;

  const executeResult = (item: QuickResult) => {
    sfxService.play('click');
    closeSearchModal();
    item.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchModal();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      executeResult(results[selectedIndex]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-20 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Hızlı Kur'an ve Sure Arama"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearchModal();
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[78dvh]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Arama Giriş Çubuğu */}
        <div
          className="px-4 py-3 border-b flex items-center gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <Search className="w-5 h-5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Sure adı, Sure:Ayet (49:10), Sayfa (515) veya Cüz (26) yaz..."
            className="flex-1 bg-transparent text-sm sm:text-base font-medium outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Aramayı temizle"
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={closeSearchModal}
            aria-label="Kapat"
            className="px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            ESC
          </button>
        </div>

        {/* Sonuç Listesi */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {results.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-1.5">
              <p className="text-sm font-bold">Eşleşen sonuç bulunamadı</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Örnekler: <strong>Hucurat</strong>, <strong>49:10</strong>, <strong>Sayfa 515</strong>{' '}
                veya <strong>Cüz 26</strong>
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const active = idx === selectedIndex;
              const Icon =
                item.kind === 'bookmark'
                  ? Bookmark
                  : item.kind === 'page'
                    ? BookOpen
                    : item.kind === 'juz'
                      ? Compass
                      : Hash;

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeResult(item)}
                  className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: active
                          ? 'var(--brand-primary)'
                          : 'var(--bg-surface-soft)',
                        color: active ? '#FFFFFF' : 'var(--brand-primary-text)',
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.title}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {item.badge}
                    </span>
                    <ArrowRight
                      className="w-4 h-4"
                      style={{
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                      }}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Alt İpucu Şeridi */}
        <div
          className="px-4 py-2 border-t flex items-center justify-between gap-2 text-[11px]"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <span>Hızlı geçiş: Sure adı, Sure:Ayet, Sayfa veya Cüz numarası</span>
          <span className="hidden sm:inline font-semibold">↑↓ Gezin · Enter Aç</span>
        </div>
      </div>
    </div>
  );
};
