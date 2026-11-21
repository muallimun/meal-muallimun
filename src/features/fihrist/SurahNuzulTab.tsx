import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, BookOpen, Info, Loader2, Search, X } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { SurahExtraInfo, SurahInfoExtrasFile } from '../../types/fihrist';
import { normalizeTurkish } from '../../utils/textNormalize';

type SurahSortKey = 'mushaf' | 'osman' | 'ibnAbbas' | 'noldeke';
type SurahFilterKey = 'all' | 'mekki' | 'medeni' | 'medeni_exceptions';

function formatRangeChip(range: [number, number]): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
}

export const SurahNuzulTab: React.FC = () => {
  const { navigateToStudy } = useAppStore();

  const [dataFile, setDataFile] = useState<SurahInfoExtrasFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SurahSortKey>('mushaf');
  const [filterBy, setFilterBy] = useState<SurahFilterKey>('all');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    dataService
      .getSurahInfoExtras()
      .then((file) => {
        if (!cancelled) setDataFile(file);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const surahs = useMemo(() => dataFile?.surahs ?? [], [dataFile]);

  const counts = useMemo(() => {
    let mekki = 0;
    let medeni = 0;
    let exceptions = 0;
    for (const s of surahs) {
      const normType = normalizeTurkish(s.type);
      if (normType === 'mekki') mekki += 1;
      else if (normType === 'medeni') medeni += 1;
      if (s.medeniAyahs && s.medeniAyahs.length > 0) exceptions += 1;
    }
    return { total: surahs.length, mekki, medeni, exceptions };
  }, [surahs]);

  const filteredAndSorted = useMemo(() => {
    const normQuery = normalizeTurkish(searchQuery);

    const list = surahs.filter((s) => {
      if (filterBy === 'mekki' && normalizeTurkish(s.type) !== 'mekki') return false;
      if (filterBy === 'medeni' && normalizeTurkish(s.type) !== 'medeni') return false;
      if (filterBy === 'medeni_exceptions' && (!s.medeniAyahs || s.medeniAyahs.length === 0)) {
        return false;
      }

      if (!normQuery) return true;
      const haystack = normalizeTurkish(
        `${s.no} ${s.nameTr} ${s.meaningTr} ${s.type} ${s.nuzul.noldekePeriod} ${s.nuzulNote ?? ''}`,
      );
      return haystack.includes(normQuery);
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'osman':
          return a.nuzul.osman - b.nuzul.osman || a.no - b.no;
        case 'ibnAbbas':
          return a.nuzul.ibnAbbas - b.nuzul.ibnAbbas || a.no - b.no;
        case 'noldeke':
          return a.nuzul.noldekeRank - b.nuzul.noldekeRank || a.no - b.no;
        case 'mushaf':
        default:
          return a.no - b.no;
      }
    });
  }, [surahs, searchQuery, sortBy, filterBy]);

  const handleOpenSurah = (surahNo: number, ayah = 1) => {
    sfxService.play('click');
    navigateToStudy({ surah: surahNo, ayah, viewMode: 'cards' });
  };

  const renderRangeChips = (s: SurahExtraInfo) => {
    const hasMedeni = Boolean(s.medeniAyahs && s.medeniAyahs.length > 0);
    const hasNote = Boolean(s.nuzulNote);
    const hasNoteRanges = Boolean(s.nuzulNoteRanges && s.nuzulNoteRanges.length > 0);

    if (!hasMedeni && !hasNote) {
      return (
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          —
        </span>
      );
    }

    return (
      <div className="space-y-1.5">
        {hasMedeni && (
          <div className="flex flex-wrap items-center gap-1">
            <span
              className="text-[10px] font-extrabold uppercase tracking-wide mr-0.5"
              style={{ color: 'var(--brand-accent-text)' }}
            >
              Medenî Ayet:
            </span>
            {s.medeniAyahs!.map((range, idx) => (
              <button
                key={`m-${idx}`}
                type="button"
                onClick={() => handleOpenSurah(s.no, range[0])}
                title={`${s.nameTr} ${formatRangeChip(range)}. ayete git`}
                className="px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums cursor-pointer transition-opacity hover:opacity-85"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'rgba(217, 119, 6, 0.35)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                {formatRangeChip(range)}
              </button>
            ))}
          </div>
        )}

        {hasNote && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
            <span>{s.nuzulNote}</span>
            {hasNoteRanges &&
              s.nuzulNoteRanges!.map((range, idx) => (
                <button
                  key={`n-${idx}`}
                  type="button"
                  onClick={() => handleOpenSurah(s.no, range[0])}
                  className="px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold tabular-nums cursor-pointer"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  Ayet {formatRangeChip(range)}
                </button>
              ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3.5">
      {/* Arama, Sıralama ve Filtre Şeridi */}
      <div className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_16rem] gap-2.5">
          {/* Akıllı Arama */}
          <div className="relative">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sure no, adı veya Türkçe anlamı ara (örümcek, bal arısı, mağara, sofra)..."
              aria-label="Sure ve nüzul rehberinde ara"
              className="w-full min-h-[42px] pl-9 pr-9 rounded-xl border text-xs sm:text-sm font-medium outline-none focus:border-teal-600"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Aramayı temizle"
                className="w-7 h-7 rounded-lg flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sıralama Seçici */}
          <div className="relative flex items-center">
            <ArrowUpDown
              className="w-4 h-4 absolute left-3 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <select
              value={sortBy}
              onChange={(e) => {
                sfxService.play('click');
                setSortBy(e.target.value as SurahSortKey);
              }}
              aria-label="Sıralama ölçütü"
              className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border text-xs sm:text-sm font-bold outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="mushaf">Mushaf Sırası (1–114)</option>
              <option value="osman">Hz. Osman Nüzul Sırası</option>
              <option value="ibnAbbas">İbn Abbas Nüzul Sırası</option>
              <option value="noldeke">Nöldeke Kronolojisi</option>
            </select>
          </div>
        </div>

        {/* Filtre Çipleri */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Tümü (${counts.total})` },
                { id: 'mekki', label: `Mekkî (${counts.mekki})` },
                { id: 'medeni', label: `Medenî (${counts.medeni})` },
                { id: 'medeni_exceptions', label: `Medenî İstisnalı (${counts.exceptions})` },
              ] as const
            ).map((chip) => {
              const active = filterBy === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setFilterBy(chip.id);
                  }}
                  className="min-h-[34px] px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active
                      ? 'var(--brand-primary)'
                      : 'var(--bg-surface-soft)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {filteredAndSorted.length} sure gösteriliyor
          </span>
        </div>
      </div>

      {/* İçerik */}
      {isLoading ? (
        <div className="surface-card rounded-2xl p-12 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-primary)' }} />
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            Sure ve nüzul verileri yükleniyor...
          </p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div
          className="surface-card rounded-2xl p-8 text-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          Aramanızla eşleşen sure bulunamadı.
        </div>
      ) : (
        <>
          {/* Masaüstü (md+) Düzenli Tablo */}
          <div className="hidden md:block surface-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b text-[11px] font-extrabold uppercase tracking-wider"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <th className="py-3 px-3 w-12 text-center">No</th>
                    <th className="py-3 px-3">Sure &amp; Türkçe Anlamı</th>
                    <th className="py-3 px-3 w-24">Dönem</th>
                    <th className="py-3 px-3 w-16 text-center">Ayet</th>
                    <th className="py-3 px-3 w-24 text-center">Hz. Osman</th>
                    <th className="py-3 px-3 w-24 text-center">İbn Abbas</th>
                    <th className="py-3 px-3 w-36">Nöldeke</th>
                    <th className="py-3 px-3">Medenî İstisna / Tarihsel Not</th>
                    <th className="py-3 px-3 w-24 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {filteredAndSorted.map((s) => {
                    const isMedeni = normalizeTurkish(s.type) === 'medeni';
                    return (
                      <tr
                        key={s.no}
                        className="transition-colors hover:bg-[var(--bg-surface-soft)]/60"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td className="py-3 px-3 text-center">
                          <span
                            className="inline-flex w-8 h-8 rounded-lg items-center justify-center text-xs font-extrabold tabular-nums"
                            style={{
                              backgroundColor: 'var(--brand-primary-soft)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            {s.no}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-sm font-extrabold">{s.nameTr}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {s.meaningTr}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold"
                            style={{
                              backgroundColor: isMedeni
                                ? 'var(--brand-accent-soft)'
                                : 'var(--brand-primary-soft)',
                              color: isMedeni
                                ? 'var(--brand-accent-text)'
                                : 'var(--brand-primary-text)',
                            }}
                          >
                            {s.type}
                          </span>
                        </td>
                        <td
                          className="py-3 px-3 text-center text-xs font-bold tabular-nums"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {s.ayahCount}
                        </td>
                        <td className="py-3 px-3 text-center text-xs font-extrabold tabular-nums">
                          #{s.nuzul.osman}
                        </td>
                        <td className="py-3 px-3 text-center text-xs font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                          #{s.nuzul.ibnAbbas}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-xs font-bold tabular-nums">
                            #{s.nuzul.noldekeRank}
                          </span>
                          <span
                            className="block text-[11px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {s.nuzul.noldekePeriod}
                          </span>
                        </td>
                        <td className="py-3 px-3 max-w-xs">{renderRangeChips(s)}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenSurah(s.no, 1)}
                            className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                            style={{
                              backgroundColor: 'var(--brand-primary-soft)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            <BookOpen className="w-3.5 h-3.5 shrink-0" />
                            <span>Oku</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobil (< md) Sade Kart Listesi (Taşmasız 360px uyum) */}
          <div className="md:hidden space-y-2.5">
            {filteredAndSorted.map((s) => {
              const isMedeni = normalizeTurkish(s.type) === 'medeni';
              return (
                <article key={s.no} className="surface-card rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums shrink-0"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {s.no}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-sm font-extrabold tracking-tight">{s.nameTr}</h4>
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                            style={{
                              backgroundColor: isMedeni
                                ? 'var(--brand-accent-soft)'
                                : 'var(--brand-primary-soft)',
                              color: isMedeni
                                ? 'var(--brand-accent-text)'
                                : 'var(--brand-primary-text)',
                            }}
                          >
                            {s.type}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {s.meaningTr} · {s.ayahCount} ayet
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenSurah(s.no, 1)}
                      className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--brand-primary-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>Oku</span>
                    </button>
                  </div>

                  {/* Tek Satır Karşılaştırmalı Nüzul Bilgisi */}
                  <div
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>Osman #{s.nuzul.osman}</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>İ. Abbas #{s.nuzul.ibnAbbas}</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>
                      Nöldeke #{s.nuzul.noldekeRank}{' '}
                      <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
                        ({s.nuzul.noldekePeriod})
                      </span>
                    </span>
                  </div>

                  {(s.medeniAyahs?.length || s.nuzulNote) && (
                    <div className="pt-0.5">{renderRangeChips(s)}</div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Kaynak Notu */}
          {dataFile?.sources && (
            <div
              className="rounded-xl px-3.5 py-2.5 border text-[11px] flex items-start gap-2 leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Kaynaklar: {dataFile.sources.nuzul} · {dataFile.sources.medeniExceptions} ·{' '}
                {dataFile.sources.noldeke}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
