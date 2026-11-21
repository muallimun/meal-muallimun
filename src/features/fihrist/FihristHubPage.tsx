import React, { useState, useSyncExternalStore } from 'react';
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
import { BazerganTimelineTab } from './BazerganTimelineTab';
import { ResearchNotebookTab } from './ResearchNotebookTab';
import { SurahNuzulTab } from './SurahNuzulTab';
import { TopicFihristTab } from './TopicFihristTab';

type FihristSubTab = 'topics' | 'surah_nuzul' | 'timeline' | 'notebook';

export const FihristHubPage: React.FC = () => {
  const researchTopics = useSyncExternalStore(
    researchStorage.subscribe,
    researchStorage.getSnapshot,
  );

  const [subTab, setSubTab] = useState<FihristSubTab>('topics');
  const [targetNotebookTopicId, setTargetNotebookTopicId] = useState<string | null>(null);
  const [copiedBanner, setCopiedBanner] = useState<{
    topicId: string;
    title: string;
  } | null>(null);

  const handleCopiedToNotebook = (newTopicId: string, topicTitle: string) => {
    setCopiedBanner({ topicId: newTopicId, title: topicTitle });
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Üst Başlık + 3 Bölmeli Alt Sekme Seçici + Defterim Kısayolu */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-extrabold tracking-tight truncate">
                Fihrist &amp; Araştırma
              </h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                601 Konu · 114 Sure Künyesi · Nüzul Kronolojisi
              </p>
            </div>
          </div>

          {/* Kişisel Araştırma Defterim Hızlı Erişim Butonu */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setSubTab((prev) => (prev === 'notebook' ? 'topics' : 'notebook'));
            }}
            className="min-h-[38px] px-3 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor:
                subTab === 'notebook' ? 'var(--brand-primary)' : 'var(--bg-surface)',
              borderColor:
                subTab === 'notebook' ? 'var(--brand-primary)' : 'var(--border-subtle)',
              color: subTab === 'notebook' ? '#FFFFFF' : 'var(--text-primary)',
            }}
          >
            <NotebookPen className="w-3.5 h-3.5 shrink-0" />
            <span>Defterim</span>
            {researchTopics.length > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums"
                style={{
                  backgroundColor:
                    subTab === 'notebook'
                      ? 'rgba(255,255,255,0.22)'
                      : 'var(--brand-primary-soft)',
                  color: subTab === 'notebook' ? '#FFFFFF' : 'var(--brand-primary-text)',
                }}
              >
                {researchTopics.length}
              </span>
            )}
          </button>
        </div>

        {/* 3 Bölmeli Segmented Pill — 360px mobilde tek satırda taşmasız */}
        <div
          role="tablist"
          aria-label="Fihrist ve Araştırma alt sekmeleri"
          className="grid grid-cols-3 p-1 rounded-2xl border gap-1"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {(
            [
              { id: 'topics', label: 'Konu Fihristi', icon: BookText },
              { id: 'surah_nuzul', label: 'Sure & Nüzul', icon: ListOrdered },
              { id: 'timeline', label: 'Kronoloji', icon: Clock },
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
                className="min-h-[40px] px-1.5 sm:px-3 rounded-xl text-[11px] sm:text-sm font-extrabold flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer min-w-0"
                style={{
                  backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
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
        <TopicFihristTab onCopiedToNotebook={handleCopiedToNotebook} />
      )}
      {subTab === 'surah_nuzul' && <SurahNuzulTab />}
      {subTab === 'timeline' && <BazerganTimelineTab />}
      {subTab === 'notebook' && (
        <ResearchNotebookTab
          selectedTopicIdOverride={targetNotebookTopicId}
          onClearTopicOverride={() => setTargetNotebookTopicId(null)}
        />
      )}
    </div>
  );
};
