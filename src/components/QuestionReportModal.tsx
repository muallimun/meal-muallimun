import React, { useEffect, useState } from 'react';
import { Check, Flag, Trash2, X } from 'lucide-react';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type {
  QuestionIssueReason,
  QuestionIssueReport,
  QuestionItem,
} from '../types/quran';
import { getQuestionUid, parseVerseRefs } from '../utils/examUtils';

export const QUESTION_ISSUE_REASONS: {
  id: QuestionIssueReason;
  label: string;
  desc: string;
}[] = [
  {
    id: 'logic_contradiction',
    label: 'Mantık / Çelişki',
    desc: 'Soru kökü, öncüller veya ayet meali arasında mantıksal çelişki var.',
  },
  {
    id: 'language_typo',
    label: 'Dil / İmlâ',
    desc: 'Anlatım bozukluğu, boşluk uyumsuzluğu veya yazım hatası var.',
  },
  {
    id: 'option_answer_error',
    label: 'Şık / Cevap Hatası',
    desc: 'Doğru cevap yanlış işaretlenmiş veya birden fazla doğru şık var.',
  },
  {
    id: 'other',
    label: 'Diğer',
    desc: 'Ayet referansı, zorluk seviyesi veya başka bir editoryal not.',
  },
];

export function getIssueReasonLabel(reason: QuestionIssueReason): string {
  return QUESTION_ISSUE_REASONS.find((r) => r.id === reason)?.label ?? 'Diğer';
}

interface QuestionReportModalProps {
  question: QuestionItem | null;
  onClose: () => void;
}

export const QuestionReportModal: React.FC<QuestionReportModalProps> = ({
  question,
  onClose,
}) => {
  const { questionAudit, reportQuestionIssue, removeQuestionIssueReport } = useAppStore();

  const uid = question ? getQuestionUid(question) : '';
  const existing = uid ? questionAudit.reports[uid] : undefined;

  const [reason, setReason] = useState<QuestionIssueReason>(
    existing?.reason ?? 'logic_contradiction',
  );
  const [note, setNote] = useState<string>(existing?.note ?? '');

  useEffect(() => {
    if (!question) return;
    const prev = questionAudit.reports[getQuestionUid(question)];
    setReason(prev?.reason ?? 'logic_contradiction');
    setNote(prev?.note ?? '');
  }, [question, questionAudit.reports]);

  useEffect(() => {
    if (!question) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, onClose]);

  if (!question) return null;

  const verseRefs = parseVerseRefs(question.refs);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanStem = question.stem.replace(/\s+/g, ' ').trim();
    const report: QuestionIssueReport = {
      uid,
      id: question.id,
      surah: question.surah,
      sourceRef: question.sourceRef || `Sure ${question.surah}`,
      verseRefs,
      reason,
      note: note.trim(),
      stemSnippet: cleanStem.length > 140 ? `${cleanStem.slice(0, 140)}…` : cleanStem,
      reportedAt: new Date().toISOString(),
    };
    reportQuestionIssue(report);
    onClose();
  };

  const handleRemove = () => {
    removeQuestionIssueReport(uid);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Soruyu hatalı veya gözden geçirilecek olarak işaretle"
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSave}
        className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#DC2626' }}
            >
              <Flag className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold tracking-tight truncate">
                Soruyu Gözden Geçirilecek İşaretle
              </h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {question.sourceRef || `Sure ${question.surah}`} · Kod: {question.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: 'var(--bg-surface-soft)', color: 'var(--text-primary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* İçerik */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div
            className="p-3 rounded-xl border text-xs leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="font-bold block mb-1" style={{ color: 'var(--text-primary)' }}>
              Soru Özeti:
            </span>
            {question.stem}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-extrabold mb-1.5" style={{ color: 'var(--text-primary)' }}>
              Tespit Edilen Hata Türü
            </legend>
            {QUESTION_ISSUE_REASONS.map((item) => {
              const active = reason === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setReason(item.id);
                  }}
                  className="w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3"
                  style={{
                    backgroundColor: active
                      ? 'rgba(239, 68, 68, 0.08)'
                      : 'var(--bg-surface-soft)',
                    borderColor: active ? '#EF4444' : 'var(--border-subtle)',
                  }}
                >
                  <span
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      borderColor: active ? '#EF4444' : 'var(--border-strong)',
                      backgroundColor: active ? '#EF4444' : 'transparent',
                    }}
                  >
                    {active && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-sm font-bold">{item.label}</span>
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {item.desc}
                    </span>
                  </div>
                </button>
              );
            })}
          </fieldset>

          <div>
            <label
              htmlFor="question-report-note"
              className="block text-xs font-extrabold mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              Kısa Açıklama / Editoryal Not (İsteğe Bağlı)
            </label>
            <textarea
              id="question-report-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn: Boşluktan önceki fiil şıkla çelişiyor veya ayet numarası 58 olmalı..."
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-teal-600 resize-none"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            İşaretlenen sorular Sınav Merkezindeki <strong>Hata Bildirimleri</strong> panelinde
            toplanır, JSON olarak dışa aktarılabilir ve dilerseniz yeni sınavlarda otomatik atlanır.
          </p>
        </div>

        {/* Alt Butonlar */}
        <div
          className="px-5 py-3.5 border-t flex flex-wrap items-center justify-between gap-2 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {existing ? (
            <button
              type="button"
              onClick={handleRemove}
              className="min-h-[42px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              style={{
                borderColor: 'var(--border-subtle)',
                color: '#DC2626',
                backgroundColor: 'var(--bg-surface-soft)',
              }}
            >
              <Trash2 className="w-4 h-4" />
              <span>İşareti Kaldır</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border text-xs font-bold cursor-pointer"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-secondary)',
              }}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-5 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer shadow-sm"
              style={{ backgroundColor: '#DC2626' }}
            >
              <Flag className="w-4 h-4" />
              <span>{existing ? 'Bildirimi Güncelle' : 'Hatalı İşaretle'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
