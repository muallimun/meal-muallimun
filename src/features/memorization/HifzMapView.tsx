import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Sparkles,
} from 'lucide-react';
import { sfxService } from '../../services/sfxService';
import type { ClassicalHifzPlan, MemorizationUnit } from '../../types/memorization';
import { parseVerseKey } from '../../types/memorization';
import type { MetaData } from '../../types/quran';
import { resolveCurrentTurnLesson } from '../../utils/classicalHifzUtils';

interface HifzMapViewProps {
  units: MemorizationUnit[];
  meta: MetaData;
  classicalPlan?: ClassicalHifzPlan | null;
  onSelectSurah: (surahNo: number) => void;
}

type StatusFilter = 'all' | 'completed' | 'in_progress' | 'not_started';

const TOTAL_QURAN_AYAHS = 6236;

export const HifzMapView: React.FC<HifzMapViewProps> = ({
  units,
  meta,
  classicalPlan,
  onSelectSurah,
}) => {
  const [selectedJuz, setSelectedJuz] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const hifzStats = useMemo(() => {
    // Her sure için ezberlenen (fresh/solid) ve ham çalışılan (raw) tekil ayet setleri
    const memorizedBySurah = new Map<number, Set<number>>();
    const workingBySurah = new Map<number, Set<number>>();
    const allMemorizedKeys = new Set<string>();
    const allWorkingKeys = new Set<string>();

    for (const unit of units) {
      const isMemorized = unit.stage === 'fresh' || unit.stage === 'solid';
      for (const key of unit.verseKeys) {
        const { surah, ayah } = parseVerseKey(key);
        if (isMemorized) {
          allMemorizedKeys.add(key);
          if (!memorizedBySurah.has(surah)) memorizedBySurah.set(surah, new Set());
          memorizedBySurah.get(surah)!.add(ayah);
        } else {
          allWorkingKeys.add(key);
          if (!workingBySurah.has(surah)) workingBySurah.set(surah, new Set());
          workingBySurah.get(surah)!.add(ayah);
        }
      }
    }

    // Klasik Hafızlık (30 Cüz) Has sayfalarını "ezberlenen", aktif Ham sayfasını "çalışılan" olarak birleştir
    if (classicalPlan?.isActive) {
      const hasPageSet = new Set(classicalPlan.hasPages);
      const activeHamPage = resolveCurrentTurnLesson(classicalPlan).hamPage;
      for (const row of meta.verseIndex) {
        const surah = row[1];
        const ayah = row[2];
        const page = row[4];
        if (hasPageSet.has(page)) {
          const key = `${surah}:${ayah}`;
          allMemorizedKeys.add(key);
          if (!memorizedBySurah.has(surah)) memorizedBySurah.set(surah, new Set());
          memorizedBySurah.get(surah)!.add(ayah);
        } else if (activeHamPage && page === activeHamPage) {
          const key = `${surah}:${ayah}`;
          allWorkingKeys.add(key);
          if (!workingBySurah.has(surah)) workingBySurah.set(surah, new Set());
          workingBySurah.get(surah)!.add(ayah);
        }
      }
    }

    // Zaten ezberlenmiş ayetleri ham çalışılan setten düş
    for (const key of allMemorizedKeys) {
      allWorkingKeys.delete(key);
    }

    let completedSurahs = 0;
    let inProgressSurahs = 0;

    const surahEntries = meta.surahs.map((surah) => {
      const memSet = memorizedBySurah.get(surah.no) ?? new Set<number>();
      const rawSet = workingBySurah.get(surah.no) ?? new Set<number>();

      let pureWorking = 0;
      for (const a of rawSet) {
        if (!memSet.has(a)) pureWorking += 1;
      }

      const memorizedCount = Math.min(surah.ayahCount, memSet.size);
      const workingCount = Math.min(surah.ayahCount - memorizedCount, pureWorking);
      const isCompleted = surah.ayahCount > 0 && memorizedCount >= surah.ayahCount;
      const isInProgress = !isCompleted && (memorizedCount > 0 || workingCount > 0);

      if (isCompleted) completedSurahs += 1;
      else if (isInProgress) inProgressSurahs += 1;

      const memorizedPct =
        surah.ayahCount > 0 ? Math.round((memorizedCount / surah.ayahCount) * 100) : 0;
      const totalTouchedPct =
        surah.ayahCount > 0
          ? Math.round(((memorizedCount + workingCount) / surah.ayahCount) * 100)
          : 0;

      const status: Exclude<StatusFilter, 'all'> = isCompleted
        ? 'completed'
        : isInProgress
          ? 'in_progress'
          : 'not_started';

      return {
        surah,
        memorizedCount,
        workingCount,
        memorizedPct,
        totalTouchedPct,
        status,
      };
    });

    const totalMemorizedAyahs = allMemorizedKeys.size;
    const totalWorkingAyahs = allWorkingKeys.size;
    const overallPct = Math.min(100, (totalMemorizedAyahs / TOTAL_QURAN_AYAHS) * 100);

    return {
      surahEntries,
      completedSurahs,
      inProgressSurahs,
      totalMemorizedAyahs,
      totalWorkingAyahs,
      overallPct,
    };
  }, [units, meta.surahs, meta.verseIndex, classicalPlan]);

  const filteredSurahs = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return hifzStats.surahEntries.filter((item) => {
      if (selectedJuz !== 'all' && !item.surah.cuzs.includes(selectedJuz)) {
        return false;
      }
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${item.surah.no} ${item.surah.shortNameTr} ${item.surah.nameTr} ${item.surah.nameAr}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [hifzStats.surahEntries, selectedJuz, statusFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Üst Özet İstatistik Kartı */}
      <section
        className="rounded-2xl border p-4 sm:p-5 space-y-3.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2
              className="text-base sm:text-lg font-extrabold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Görsel Hıfz Haritası · 114 Sure &amp; 30 Cüz
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Herhangi bir sureye dokunarak doğrudan ezber havuzunuza ekleyebilir veya çalışmaya başlayabilirsiniz.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                color: '#059669',
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {hifzStats.completedSurahs} / 114 Sure
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Clock className="w-3.5 h-3.5" />
              {hifzStats.inProgressSurahs} Çalışılıyor
            </span>
          </div>
        </div>

        {/* Genel Kur'an İlerleme Çubuğu */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span style={{ color: 'var(--text-secondary)' }}>
              Ezberlenen Ayet:{' '}
              <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {hifzStats.totalMemorizedAyahs.toLocaleString('tr-TR')} /{' '}
                {TOTAL_QURAN_AYAHS.toLocaleString('tr-TR')}
              </strong>
              {hifzStats.totalWorkingAyahs > 0 && (
                <span className="ml-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>
                  (+{hifzStats.totalWorkingAyahs} ham çalışılan)
                </span>
              )}
            </span>
            <span
              className="tabular-nums font-extrabold"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              %{hifzStats.overallPct.toFixed(1)}
            </span>
          </div>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden flex"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${hifzStats.overallPct}%`,
                backgroundColor: '#10B981',
              }}
            />
            {hifzStats.totalWorkingAyahs > 0 && (
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100 - hifzStats.overallPct,
                    (hifzStats.totalWorkingAyahs / TOTAL_QURAN_AYAHS) * 100,
                  )}%`,
                  backgroundColor: '#D97706',
                }}
              />
            )}
          </div>
        </div>

        {/* Renk Açıklaması */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            %100 Ezberlenen (Taze/Sağlam)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
            Çalışılıyor / Kısmi Ezber
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm border inline-block"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            />
            Henüz Başlanmadı
          </span>
        </div>
      </section>

      {/* Filtre Çubuğu (Cüz + Durum + Arama) */}
      <section
        className="rounded-2xl border p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center gap-2.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Cüz Seçici */}
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <select
            aria-label="Cüze göre filtrele"
            value={selectedJuz}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedJuz(val === 'all' ? 'all' : Number(val));
            }}
            className="h-9 px-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="all">Tüm Cüzler (1–30)</option>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
              <option key={juz} value={juz}>
                {juz}. Cüz
              </option>
            ))}
          </select>
        </div>

        {/* Durum Sekmeleri */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', label: 'Tümü' },
              { id: 'completed', label: 'Ezberlenen' },
              { id: 'in_progress', label: 'Çalışılan' },
              { id: 'not_started', label: 'Başlanmadı' },
            ] as const
          ).map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setStatusFilter(tab.id);
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer border transition-colors"
                style={{
                  backgroundColor: active
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Sure Arama */}
        <div className="relative flex-1 min-w-[160px]">
          <Search
            className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Sure adı veya no ara..."
            className="w-full h-9 pl-8 pr-3 rounded-xl border text-xs font-medium outline-none"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </section>

      {/* 114 Sure Görsel Matrisi */}
      {filteredSurahs.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Bu filtreye uyan sure bulunamadı.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedJuz('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="text-xs font-bold underline cursor-pointer"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            Filtreleri temizle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {filteredSurahs.map(
            ({ surah, memorizedCount, workingCount, memorizedPct, totalTouchedPct, status }) => {
              const isCompleted = status === 'completed';
              const isInProgress = status === 'in_progress';

              return (
                <button
                  key={surah.no}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onSelectSurah(surah.no);
                  }}
                  className="group text-left rounded-xl border p-3 transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between gap-2 min-h-[104px]"
                  style={{
                    backgroundColor: isCompleted
                      ? 'rgba(16, 185, 129, 0.10)'
                      : isInProgress
                        ? 'rgba(217, 119, 6, 0.06)'
                        : 'var(--bg-surface)',
                    borderColor: isCompleted
                      ? 'rgba(16, 185, 129, 0.45)'
                      : isInProgress
                        ? 'rgba(217, 119, 6, 0.40)'
                        : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span
                      className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md text-[11px] font-extrabold tabular-nums"
                      style={{
                        backgroundColor: isCompleted
                          ? '#10B981'
                          : isInProgress
                            ? '#D97706'
                            : 'var(--bg-surface-soft)',
                        color:
                          isCompleted || isInProgress ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      {surah.no}
                    </span>

                    {isCompleted ? (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold"
                        style={{
                          backgroundColor: 'rgba(217, 119, 6, 0.14)',
                          color: '#B45309',
                        }}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        %100
                      </span>
                    ) : (
                      <span
                        dir="rtl"
                        lang="ar"
                        className="arabic-title text-sm leading-none truncate"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {surah.nameAr}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div
                      className="text-xs font-extrabold truncate group-hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {surah.shortNameTr}
                    </div>
                    <div
                      className="text-[11px] font-semibold tabular-nums mt-0.5 flex items-center justify-between gap-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>
                        {memorizedCount + workingCount > 0
                          ? `${memorizedCount}/${surah.ayahCount} ayet`
                          : `${surah.ayahCount} ayet`}
                      </span>
                      {surah.cuzs.length > 0 && (
                        <span>
                          {surah.cuzs[0]}. Cüz
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mini ilerleme çubuğu */}
                  <div
                    className="h-1.5 w-full rounded-full overflow-hidden flex"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {memorizedPct > 0 && (
                      <div
                        className="h-full"
                        style={{
                          width: `${memorizedPct}%`,
                          backgroundColor: '#10B981',
                        }}
                      />
                    )}
                    {workingCount > 0 && (
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(0, totalTouchedPct - memorizedPct)}%`,
                          backgroundColor: '#F59E0B',
                        }}
                      />
                    )}
                  </div>
                </button>
              );
            },
          )}
        </div>
      )}
    </div>
  );
};
