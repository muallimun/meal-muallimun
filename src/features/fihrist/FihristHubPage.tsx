import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight,
  BookText,
  Check,
  Clock,
  Compass,
  ListOrdered,
  NotebookPen,
} from 'lucide-react';
import { researchStorage } from '../../services/researchStorage';
import { sfxService } from '../../services/sfxService';
import { verseNotesStorage } from '../../services/verseNotesStorage';
import { useAppStore } from '../../store/useAppStore';
import { BazerganTimelineTab } from './BazerganTimelineTab';
import { ResearchNotebookTab } from './ResearchNotebookTab';
import { SurahNuzulTab } from './SurahNuzulTab';
import { TopicFihristTab } from './TopicFihristTab';

type FihristSubTab = 'topics' | 'surah_nuzul' | 'timeline' | 'notebook';

export const FihristHubPage: React.FC = () => {
  const { fihristNavTarget, clearFihristNavTarget } = useAppStore();
  const researchTopics = useSyncExternalStore(
    researchStorage.subscribe,
    researchStorage.getSnapshot,
  );
  const verseNotes = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getSnapshot,
  );
  const totalNotebookCount = researchTopics.length + verseNotes.length;

  const [subTab, setSubTab] = useState<FihristSubTab>('topics');
  const [targetFihristTopicId, setTargetFihristTopicId] = useState<string | null>(null);
  const [targetNotebookTopicId, setTargetNotebookTopicId] = useState<string | null>(null);
  const [targetNotebookSubTab, setTargetNotebookSubTab] = useState<'topics' | 'notes' | null>(null);
  const [copiedBanner, setCopiedBanner] = useState<{
    topicId: string;
    title: string;
  } | null>(null);

  // Genel Arama (Ctrl+K) veya dış bileşenlerden gelen derin bağlantı yönlendirmesini işle
  const handledNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!fihristNavTarget) return;
    if (handledNonceRef.current === fihristNavTarget.nonce) return;
    handledNonceRef.current = fihristNavTarget.nonce;

    const nextTab: FihristSubTab = fihristNavTarget.subTab ?? 'topics';
    setSubTab(nextTab);
    if (nextTab === 'topics' && fihristNavTarget.topicId) {
      setTargetFihristTopicId(fihristNavTarget.topicId);
    } else if (nextTab === 'notebook') {
      if (fihristNavTarget.topicId) {
        setTargetNotebookTopicId(fihristNavTarget.topicId);
      }
      if (fihristNavTarget.notebookSubTab) {
        setTargetNotebookSubTab(fihristNavTarget.notebookSubTab);
      }
    }
    clearFihristNavTarget();
  }, [fihristNavTarget, clearFihristNavTarget]);

  const handleCopiedToNotebook = (newTopicId: string, topicTitle: string) => {
    setCopiedBanner({ topicId: newTopicId, title: topicTitle });
  };

  return (
    <div className="space-y-2.5 sm:space-y-4 pb-4 sm:pb-6">
      {/* Üst Başlık + 4 Bölmeli Birleşik Alt Sekme Çubuğu */}
      <section className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-extrabold tracking-tight truncate">
                Fihrist &amp; Araştırma
              </h2>
              <p className="hidden sm:block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                601 Konu · 114 Sure Künyesi · Mehdi Bazergan Kronolojisi · Kişisel Defterim
              </p>
            </div>
          </div>
        </div>

        {/* 4 Bölmeli Segmented Switcher — 360px mobilde taşmasız tek satır */}
        <div
          role="tablist"
          aria-label="Fihrist ve Araştırma alt sekmeleri"
          className="grid grid-cols-4 p-1 rounded-2xl border gap-1"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {(
            [
              {
                id: 'topics',
                label: 'Konu Fihristi',
                mobileLabel: 'Konular',
                icon: BookText,
                badge: null,
              },
              {
                id: 'surah_nuzul',
                label: 'Sure & Nüzul',
                mobileLabel: 'Sureler',
                icon: ListOrdered,
                badge: null,
              },
              {
                id: 'timeline',
                label: 'Kronoloji (Bazergan)',
                mobileLabel: 'Kronoloji',
                icon: Clock,
                badge: null,
              },
              {
                id: 'notebook',
                label: 'Defterim',
                mobileLabel: 'Defterim',
                icon: NotebookPen,
                badge: totalNotebookCount > 0 ? totalNotebookCount : null,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  sfxService.play('click');
                  setSubTab(tab.id);
                }}
                className="min-h-[36px] sm:min-h-[40px] px-1 sm:px-2.5 rounded-xl text-[11px] sm:text-xs md:text-sm font-extrabold flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer min-w-0"
                style={{
                  backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 hidden sm:inline" />
                <span className="truncate sm:hidden">{tab.mobileLabel}</span>
                <span className="truncate hidden sm:inline">{tab.label}</span>
                {tab.badge !== null && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[9.5px] sm:text-[10px] font-extrabold tabular-nums leading-none shrink-0"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Kopyalama Bildirimi */}
      {copiedBanner && subTab === 'topics' && (
        <div
          className="surface-card rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5"
          style={{
            borderColor: 'rgba(16, 185, 129, 0.35)',
            backgroundColor: 'rgba(16, 185, 129, 0.06)',
          }}
        >
          <span
            className="text-xs font-bold flex items-center gap-1.5"
            style={{ color: '#047857' }}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>
              <strong>{copiedBanner.title}</strong> konusu kişisel Araştırma Defterinize
              kopyalandı.
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setTargetNotebookTopicId(copiedBanner.topicId);
              setSubTab('notebook');
              setCopiedBanner(null);
            }}
            className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1 cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <span>Defterimde Aç</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Aktif Alt Modül */}
      {subTab === 'topics' && (
        <TopicFihristTab
          selectedTopicIdOverride={targetFihristTopicId}
          onClearTopicOverride={() => setTargetFihristTopicId(null)}
          onCopiedToNotebook={handleCopiedToNotebook}
        />
      )}
      {subTab === 'surah_nuzul' && <SurahNuzulTab />}
      {subTab === 'timeline' && <BazerganTimelineTab />}
      {subTab === 'notebook' && (
        <ResearchNotebookTab
          selectedTopicIdOverride={targetNotebookTopicId}
          onClearTopicOverride={() => setTargetNotebookTopicId(null)}
          initialSubViewOverride={targetNotebookSubTab}
          onClearSubViewOverride={() => setTargetNotebookSubTab(null)}
        />
      )}
    </div>
  );
};
