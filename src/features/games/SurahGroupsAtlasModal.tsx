import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Info,
  ListOrdered,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useBackButtonGuard } from '../../services/backStackService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { SurahMeta } from '../../types/quran';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import { SurahInfoModal } from '../study/SurahInfoModal';
import type { EnrichedGameSurah, GameId } from './gameTypes';
import type {
  SurahGroupCategory,
  SurahGroupId,
} from './surahSpecialGroups';
import {
  MUKATTAA_MAP,
  MUKATTAA_SURAH_NOS,
  SURAH_GROUP_ATLAS,
} from './surahSpecialGroups';

interface SurahGroupsAtlasModalProps {
  allSurahs: EnrichedGameSurah[];
  onPlayWithGroup: (groupId: SurahGroupId, gameId: Extract<GameId, 'families' | 'group_seq'>) => void;
  onClose: () => void;
}

type CategoryFilter = 'all' | SurahGroupCategory;

export const SurahGroupsAtlasModal: React.FC<SurahGroupsAtlasModalProps> = ({
  allSurahs,
  onPlayWithGroup,
  onClose,
}) => {
  const { meta, navigateToStudy } = useAppStore();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [infoSurah, setInfoSurah] = useState<SurahMeta | null>(null);
  const [backGuardNonce, setBackGuardNonce] = useState(0);

  const categoryCounts = useMemo(
    () => ({
      all: SURAH_GROUP_ATLAS.length,
      mukattaa: SURAH_GROUP_ATLAS.filter((g) => g.category === 'mukattaa').length,
      baslangic: SURAH_GROUP_ATLAS.filter((g) => g.category === 'baslangic').length,
      isim_ve_ozellik: SURAH_GROUP_ATLAS.filter((g) => g.category === 'isim_ve_ozellik').length,
    }),
    [],
  );

  useBackButtonGuard(
    'surah_groups_atlas',
    true,
    () => {
      if (infoSurah) {
        setInfoSurah(null);
        setBackGuardNonce((n) => n + 1);
      } else {
        onClose();
      }
    },
    backGuardNonce,
  );

  useEffect(() => {
    const releaseScrollLock = acquireBodyScrollLock();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (infoSurah) setInfoSurah(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [infoSurah, onClose]);

  const surahByNo = useMemo(() => {
    const map = new Map<number, EnrichedGameSurah>();
    for (const s of allSurahs) map.set(s.no, s);
    return map;
  }, [allSurahs]);

  const metaSurahByNo = useMemo(() => {
    const map = new Map<number, SurahMeta>();
    for (const s of meta?.surahs ?? []) map.set(s.no, s);
    return map;
  }, [meta?.surahs]);

  const filteredGroups = useMemo(() => {
    const norm = query.trim().toLocaleLowerCase('tr-TR');
    return SURAH_GROUP_ATLAS.filter((g) => {
      if (category !== 'all' && g.category !== category) return false;
      if (!norm) return true;
      const hay = [
        g.title,
        g.shortLabel,
        g.arabicTitle,
        g.description,
        g.distinguishingTip,
        ...g.surahs.map((no) => {
          const s = surahByNo.get(no);
          return s ? `${no} ${s.nameTr} ${s.shortNameTr} ${s.meaningTr}` : String(no);
        }),
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return hay.includes(norm);
    });
  }, [category, query, surahByNo]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ulûmu'l-Kur'ân Sure Grupları Atlası"
      className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[100dvh] sm:h-[92dvh] max-h-[100dvh] sm:max-h-[92dvh] rounded-none sm:rounded-2xl border-0 sm:border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-canvas)',
          borderColor: 'var(--border-subtle)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık */}
        <header
          className="shrink-0 px-3.5 sm:px-5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sm:py-3.5 border-b flex items-center justify-between gap-2.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: '#0F766E' }}
            >
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2
                className="text-base sm:text-lg font-extrabold tracking-tight leading-snug line-clamp-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Sure Grupları Atlası (15 Klasik Aile)
              </h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Sure rozetlerine dokunup inceleyin, ardından oyunla pekiştirin.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Atlası kapat"
            className="w-9 h-9 rounded-full border inline-flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Arama + 2x2 Kategori Filtreleri (Yatay kaydırmasız) */}
        <div
          className="shrink-0 px-3.5 sm:px-5 py-2.5 sm:py-3 border-b space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Arama Girişi */}
          <div
            className="flex items-center gap-2 px-3 h-9 sm:h-10 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Grup veya sure ara (örn. Havâmîm, Kehf, 42)..."
              className="w-full bg-transparent text-xs sm:text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs font-bold cursor-pointer shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                Temizle
              </button>
            )}
          </div>

          {/* Tasnif Ölçütüne Göre Filtrele */}
          <div className="space-y-1.5">
            <div
              className="text-[10px] font-extrabold uppercase tracking-wider px-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Tasnif Ölçütüne Göre Filtrele
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
              {(
                [
                  { id: 'all', label: `Tüm Gruplar (${categoryCounts.all})` },
                  { id: 'mukattaa', label: `Hurûf-u Mukattaa (${categoryCounts.mukattaa})` },
                  { id: 'baslangic', label: `Başlangıç İfadesi (${categoryCounts.baslangic})` },
                  { id: 'isim_ve_ozellik', label: `İsim & Secde (${categoryCounts.isim_ve_ozellik})` },
                ] as const
              ).map((tab) => {
                const active = category === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setCategory(tab.id);
                    }}
                    className="py-1.5 px-2.5 rounded-lg text-xs font-bold text-center truncate border cursor-pointer transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: active ? '#FFFFFF' : 'var(--text-secondary)',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 15 Grup Kartları Listesi (Katlanabilir Referans Notu Dahil) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-3">
          {/* Katlanabilir Tasnif Ölçütleri ve Özel Notlar */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowNotes((prev) => !prev);
              }}
              aria-expanded={showNotes}
              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer"
            >
              <span
                className="inline-flex items-center gap-1.5 text-xs font-extrabold"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Tasnif Ölçütleri ve Özel Notlar</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform ${showNotes ? 'rotate-180' : ''}`}
                style={{ color: 'var(--text-muted)' }}
              />
            </button>

            {showNotes && (
              <div
                className="px-3.5 pb-3 pt-1 border-t space-y-2 text-[11.5px] leading-relaxed"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-medium">
                  <span
                    className="inline-flex items-center gap-1 font-bold"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>{MUKATTAA_SURAH_NOS.length} Mukattaa Suresi</span>
                  </span>
                  <span>·</span>
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>9. Tevbe:</strong> Besmelesiz tek sure
                  </span>
                  <span>·</span>
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>27. Neml:</strong> İki Besmeleli tek sure (başında ve 30. ayette)
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)' }}>
                  Bu 15 grup üç pedagojik tasnif ölçütü altında derlenmiştir:{' '}
                  <strong style={{ color: 'var(--text-secondary)' }}>Hurûf-u Mukattaa</strong>,{' '}
                  <strong style={{ color: 'var(--text-secondary)' }}>Sure Başlangıç İfadeleri</strong>{' '}
                  ve{' '}
                  <strong style={{ color: 'var(--text-secondary)' }}>
                    Tematik İsim / Secde Özellikleri
                  </strong>
                  .
                </p>
              </div>
            )}
          </div>

          {filteredGroups.length === 0 ? (
            <div
              className="rounded-2xl border p-8 text-center text-sm"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              Aramanızla eşleşen bir sure grubu bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredGroups.map((group) => (
                <article
                  key={group.id}
                  className="rounded-2xl border p-4 flex flex-col justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="space-y-2.5">
                    {/* Grup Başlığı + Arapça Başlık */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-extrabold"
                            style={{
                              backgroundColor:
                                group.category === 'mukattaa'
                                  ? 'var(--brand-accent-soft)'
                                  : 'var(--brand-primary-soft)',
                              color:
                                group.category === 'mukattaa'
                                  ? 'var(--brand-accent-text)'
                                  : 'var(--brand-primary-text)',
                            }}
                          >
                            {group.badgeText}
                          </span>
                        </div>
                        <h3
                          className="text-sm sm:text-base font-extrabold mt-1 leading-snug"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {group.title}
                        </h3>
                      </div>

                      <span
                        dir="rtl"
                        className="font-arabic text-lg font-semibold shrink-0"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {group.arabicTitle}
                      </span>
                    </div>

                    {/* Tanım & Ayırt Edici İpucu */}
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {group.description}
                    </p>
                    <div
                      className="rounded-xl px-2.5 py-1.5 text-[11px] leading-snug"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <strong style={{ color: 'var(--brand-accent-text)' }}>İpucu: </strong>
                      {group.distinguishingTip}
                    </div>

                    {/* Mushaf Sıralı Sure Rozetleri */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {group.surahs.map((no) => {
                        const s = surahByNo.get(no);
                        const muk = MUKATTAA_MAP[no];
                        return (
                          <button
                            key={no}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              const metaSurah = metaSurahByNo.get(no);
                              if (metaSurah) setInfoSurah(metaSurah);
                            }}
                            className="px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors hover:border-teal-600"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                            title="Sure künyesini görüntüle"
                          >
                            <span
                              className="tabular-nums font-extrabold"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              {no}.
                            </span>
                            <span>{s?.shortNameTr ?? `Sure ${no}`}</span>
                            {group.category === 'mukattaa' && muk && (
                              <span
                                dir="rtl"
                                className="font-arabic text-xs font-bold"
                                style={{ color: 'var(--brand-accent-text)' }}
                              >
                                {muk.arabic}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Doğrudan Bu Grupla Oyna Aksiyonları */}
                  <div
                    className="pt-2.5 border-t flex items-center gap-2"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onPlayWithGroup(group.id, 'families');
                      }}
                      className="flex-1 min-h-[38px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95"
                      style={{ backgroundColor: '#0F766E', color: '#FFFFFF' }}
                    >
                      <Target className="w-3.5 h-3.5 shrink-0" />
                      <span>Bu Grupla Oyna</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onPlayWithGroup(group.id, 'group_seq');
                      }}
                      className="min-h-[38px] px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                      title="Bu grubun surelerini Mushaf sırasına diz"
                    >
                      <ListOrdered className="w-3.5 h-3.5 shrink-0" />
                      <span>Dizilim</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sure Künyesi Modalı (Rozete Tıklayınca Atlas Üzerinde Açılır) */}
      <SurahInfoModal
        surah={infoSurah}
        onClose={() => setInfoSurah(null)}
        onReadSurah={(surahNo) => {
          setInfoSurah(null);
          onClose();
          navigateToStudy({ surah: surahNo, ayah: 1, viewMode: 'cards', ensureMealVisible: true });
        }}
      />
    </div>
  );
};
