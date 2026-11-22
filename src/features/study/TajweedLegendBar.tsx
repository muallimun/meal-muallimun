import React, { useMemo, useState } from 'react';
import { BookOpenCheck, ChevronDown, Sparkles, X } from 'lucide-react';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { ThemeMode } from '../../types/quran';
import type { TajweedRuleDef } from '../../types/tajweed';

interface TajweedLegendBarProps {
  rules: Record<string, TajweedRuleDef>;
  theme: ThemeMode;
  isLoading?: boolean;
  onDismiss: () => void;
}

interface LegendGroupDef {
  id: 'med' | 'gunne' | 'idgam' | 'iklab' | 'kalkale' | 'silent';
  label: string;
  fallbackLight: string;
  fallbackDark: string;
  fallbackSummary: string;
}

const LEGEND_GROUPS: LegendGroupDef[] = [
  {
    id: 'med',
    label: 'Medler',
    fallbackLight: '#b91c1c',
    fallbackDark: '#f87171',
    fallbackSummary: 'Med harflerinin kuralına göre 2, 4 veya 6 hareke uzatılması.',
  },
  {
    id: 'gunne',
    label: 'Gunne & İhfâ',
    fallbackLight: '#15803d',
    fallbackDark: '#4ade80',
    fallbackSummary: 'Genizden (gunne ile) gizleyerek ve tutarak okuma kuralları.',
  },
  {
    id: 'idgam',
    label: 'İdgam',
    fallbackLight: '#7e22ce',
    fallbackDark: '#c084fc',
    fallbackSummary: 'Sakin harfin sonraki harfe katılarak (gunneli veya gunnesiz) okunması.',
  },
  {
    id: 'iklab',
    label: 'İklâb',
    fallbackLight: '#0369a1',
    fallbackDark: '#38bdf8',
    fallbackSummary: 'Sakin nun veya tenvinden sonra Bâ (ب) gelince mim sesine çevrilmesi.',
  },
  {
    id: 'kalkale',
    label: 'Kalkale',
    fallbackLight: '#c2410c',
    fallbackDark: '#fb923c',
    fallbackSummary: 'ق ط ب ج د harflerinin cezimli hâlde hafif vurgu ile okunması.',
  },
  {
    id: 'silent',
    label: 'Okunmayan Harf',
    fallbackLight: '#64748b',
    fallbackDark: '#94a3b8',
    fallbackSummary: 'Yazıda bulunan ancak geçişte okunmayan hemze-i vasl ve şemsî lam harfleri.',
  },
];

function classifyRuleGroup(rule: TajweedRuleDef): LegendGroupDef['id'] {
  const haystack = `${rule.code} ${rule.category} ${rule.nameTr}`.toLocaleLowerCase('tr-TR');

  if (
    haystack.includes('iqlab') ||
    haystack.includes('iklab') ||
    haystack.includes('iklâb') ||
    haystack.includes('qalb')
  ) {
    return 'iklab';
  }
  if (haystack.includes('qalqal') || haystack.includes('kalkale')) {
    return 'kalkale';
  }
  if (haystack.includes('idgham') || haystack.includes('idgam') || haystack.includes('idğam')) {
    return 'idgam';
  }
  if (
    haystack.includes('ghunn') ||
    haystack.includes('gunne') ||
    haystack.includes('ikhfa') ||
    haystack.includes('ihfa') ||
    haystack.includes('ihfâ')
  ) {
    return 'gunne';
  }
  if (
    haystack.includes('madd') ||
    haystack.includes('med') ||
    haystack.includes('uzat')
  ) {
    return 'med';
  }
  return 'silent';
}

export const TajweedLegendBar: React.FC<TajweedLegendBarProps> = ({
  rules,
  theme,
  isLoading = false,
  onDismiss,
}) => {
  const { openWaqfGuide } = useAppStore();
  const [expandedGroupId, setExpandedGroupId] = useState<LegendGroupDef['id'] | null>(null);

  const groupedRules = useMemo(() => {
    const map: Record<LegendGroupDef['id'], TajweedRuleDef[]> = {
      med: [],
      gunne: [],
      idgam: [],
      iklab: [],
      kalkale: [],
      silent: [],
    };

    for (const rule of Object.values(rules)) {
      const gid = classifyRuleGroup(rule);
      map[gid].push(rule);
    }

    return map;
  }, [rules]);

  const activeGroupDef = useMemo(
    () => LEGEND_GROUPS.find((g) => g.id === expandedGroupId) ?? null,
    [expandedGroupId],
  );

  const activeGroupRules = expandedGroupId ? groupedRules[expandedGroupId] : [];

  return (
    <div
      className="rounded-xl border overflow-hidden transition-colors"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Tek Satır Kompakt Renk Anahtarı Şeridi */}
      <div className="px-2.5 sm:px-3 py-1.5 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 text-[11px] font-extrabold shrink-0 select-none"
          style={{ color: 'var(--brand-primary-text)' }}
        >
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">Tecvit:</span>
        </span>

        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {LEGEND_GROUPS.map((group) => {
            const list = groupedRules[group.id];
            const representative = list[0];
            const dotColor = representative
              ? theme === 'dark'
                ? representative.colorDark
                : representative.colorLight
              : theme === 'dark'
                ? group.fallbackDark
                : group.fallbackLight;
            const isSelected = expandedGroupId === group.id;

            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setExpandedGroupId((prev) => (prev === group.id ? null : group.id));
                }}
                aria-expanded={isSelected}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                style={{
                  backgroundColor: isSelected ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
                  borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: isSelected ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                <span>{group.label}</span>
                <ChevronDown
                  className={`w-3 h-3 opacity-60 transition-transform ${
                    isSelected ? 'rotate-180' : ''
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => openWaqfGuide()}
          title="Secâvend Vakıf (Durak) İşaretleri Rehberi"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:opacity-85"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            borderColor: 'rgba(13, 148, 136, 0.3)',
            color: 'var(--brand-primary-text)',
          }}
        >
          <BookOpenCheck className="w-3 h-3 shrink-0" />
          <span className="hidden sm:inline">Durak Rehberi</span>
          <span className="sm:hidden">Durak</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            onDismiss();
          }}
          title="Renk şeridini gizle"
          aria-label="Renk şeridini gizle"
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 cursor-pointer transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            color: 'var(--text-muted)',
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Seçilen Grup İçin Kısa Satır İçi Özet */}
      {activeGroupDef && (
        <div
          className="px-3 py-2.5 border-t space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              {activeGroupDef.label}
              {isLoading && activeGroupRules.length === 0 ? ' (Yükleniyor...)' : ''}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Ayetlerdeki renkli harflere dokunarak örneği inceleyin
            </span>
          </div>

          {activeGroupRules.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {activeGroupRules.map((rule) => {
                const c = theme === 'dark' ? rule.colorDark : rule.colorLight;
                return (
                  <div
                    key={rule.code}
                    className="px-2.5 py-2 rounded-lg border flex items-start gap-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                      style={{ backgroundColor: c }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className="text-[11px] font-extrabold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {rule.nameTr}
                        </span>
                        {rule.nameAr && (
                          <span
                            dir="rtl"
                            className="arabic-tajweed text-xs font-bold shrink-0 leading-none"
                            style={{ color: c }}
                          >
                            {rule.nameAr}
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[11px] leading-snug mt-0.5 line-clamp-2"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {rule.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {activeGroupDef.fallbackSummary}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
