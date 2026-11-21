import React, { useState, useSyncExternalStore } from 'react';
import { ArrowRight, BookText, Check, NotebookPen } from 'lucide-react';
import { researchStorage } from '../../services/researchStorage';
import { sfxService } from '../../services/sfxService';
import { AlphabeticalIndexTab } from './AlphabeticalIndexTab';
import { ResearchNotebookTab } from './ResearchNotebookTab';

type FihristSubTab = 'index' | 'notebook';

export const FihristHubPage: React.FC = () => {
  const researchTopics = useSyncExternalStore(
    researchStorage.subscribe,
    researchStorage.getSnapshot,
  );

  const [subTab, setSubTab] = useState<FihristSubTab>('index');
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
      {/* Üst Başlık ve Modül Seçici */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
            Konu Fihristi &amp; Araştırma Defterim
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Alfabetik Kur&apos;an konu fihristini keşfedin, dinleyin, A4 çıktı alın veya kendi
            araştırma notlarınızı derleyin.
          </p>
        </div>

        {/* 2 Ana Sekme */}
        <div
          role="tablist"
          aria-label="Fihrist ve Araştırma sekmeleri"
          className="grid grid-cols-2 sm:inline-flex p-1 rounded-2xl border gap-1 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'index'}
            onClick={() => {
              sfxService.play('click');
              setSubTab('index');
            }}
            className="min-h-[40px] px-3.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: subTab === 'index' ? 'var(--bg-surface)' : 'transparent',
              color: subTab === 'index' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              boxShadow: subTab === 'index' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <BookText className="w-4 h-4 shrink-0" />
            <span>Konu Fihristi</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'notebook'}
            onClick={() => {
              sfxService.play('click');
              setSubTab('notebook');
            }}
            className="min-h-[40px] px-3.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: subTab === 'notebook' ? 'var(--bg-surface)' : 'transparent',
              color:
                subTab === 'notebook' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              boxShadow: subTab === 'notebook' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <NotebookPen className="w-4 h-4 shrink-0" />
            <span>Araştırma Defterim</span>
            {researchTopics.length > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                {researchTopics.length}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* Kopyalama Bildirimi */}
      {copiedBanner && subTab === 'index' && (
        <div
          className="surface-card rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5"
          style={{
            borderColor: 'rgba(16, 185, 129, 0.35)',
            backgroundColor: 'rgba(16, 185, 129, 0.06)',
          }}
        >
          <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#047857' }}>
            <Check className="w-4 h-4 shrink-0" />
            <span>
              <strong>{copiedBanner.title}</strong> konusu kişisel Araştırma Defterinize kopyalandı.
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
      {subTab === 'index' ? (
        <AlphabeticalIndexTab onCopiedToNotebook={handleCopiedToNotebook} />
      ) : (
        <ResearchNotebookTab
          selectedTopicIdOverride={targetNotebookTopicId}
          onClearTopicOverride={() => setTargetNotebookTopicId(null)}
        />
      )}
    </div>
  );
};
