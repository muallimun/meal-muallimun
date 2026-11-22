import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Flag,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { getIssueReasonLabel } from './QuestionReportModal';

interface QuestionAuditManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuestionAuditManagerModal: React.FC<QuestionAuditManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    questionAudit,
    meta,
    removeQuestionIssueReport,
    clearAllQuestionIssueReports,
    setSkipReportedInExams,
  } = useAppStore();

  const [copied, setCopied] = useState(false);

  useBackButtonGuard('question_audit_manager_modal', isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    return acquireBodyScrollLock();
  }, [isOpen]);

  const surahMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of meta?.surahs ?? []) {
      map.set(s.no, s.nameTr);
    }
    return map;
  }, [meta]);

  const reportsList = useMemo(
    () =>
      Object.values(questionAudit.reports).sort((a, b) =>
        b.reportedAt.localeCompare(a.reportedAt),
      ),
    [questionAudit.reports],
  );

  const exportPayload = useMemo(
    () => ({
      exportedAt: new Date().toISOString(),
      source: 'Muallimun Kur’an & Meal — Soru Denetim Raporu',
      totalFlagged: reportsList.length,
      skipReportedInExams: questionAudit.skipReportedInExams,
      items: reportsList.map((r) => ({
        uid: r.uid,
        id: r.id,
        surah: r.surah,
        surahName: surahMap.get(r.surah) ?? `Sure ${r.surah}`,
        sourceRef: r.sourceRef,
        verseRefs: r.verseRefs,
        reason: r.reason,
        reasonLabel: getIssueReasonLabel(r.reason),
        note: r.note,
        stemSnippet: r.stemSnippet,
        reportedAt: r.reportedAt,
      })),
    }),
    [reportsList, questionAudit.skipReportedInExams, surahMap],
  );

  if (!isOpen) return null;

  const handleCopyJson = async () => {
    sfxService.play('click');
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore clipboard fallback
    }
  };

  const handleDownloadJson = () => {
    sfxService.play('click');
    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `muallimun-soru-hata-raporu-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hata Bildirimleri ve Soru Denetim Raporu"
      className={`fixed inset-0 ${Z_LAYERS.NESTED_MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden"
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
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#DC2626' }}
            >
              <Flag className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                Soru Denetim &amp; Hata Bildirimleri ({reportsList.length})
              </h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Mantık, dil veya şık hatası bildirilen soruları yönetin ve JSON olarak dışa aktarın.
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

        {/* Otomatik Atlama Ayarı & Dışa Aktarma Şeridi */}
        <div
          className="px-5 py-3.5 border-b space-y-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0">
              <span className="block text-sm font-bold">
                Hatalı işaretlenen soruları sınavlarda otomatik atla
              </span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Açık olduğunda işaretlenen sorular yeni sınav oturumlarına ve A4 kağıtlarına dahil edilmez.
              </span>
            </div>
            <input
              type="checkbox"
              checked={questionAudit.skipReportedInExams}
              onChange={(e) => setSkipReportedInExams(e.target.checked)}
              className="w-5 h-5 accent-teal-600 shrink-0 cursor-pointer"
            />
          </label>

          {reportsList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyJson}
                className="min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'JSON Kopyalandı!' : 'JSON Kopyala'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadJson}
                className="min-h-[38px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Download className="w-4 h-4" />
                <span>JSON İndir</span>
              </button>

              <button
                type="button"
                onClick={clearAllQuestionIssueReports}
                className="min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ml-auto"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: '#DC2626',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Tümünü Temizle</span>
              </button>
            </div>
          )}
        </div>

        {/* Bildirilen Sorular Listesi */}
        <div className="p-5 overflow-y-auto flex-1 space-y-2.5">
          {reportsList.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <span
                className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <ShieldCheck className="w-6 h-6" />
              </span>
              <p className="text-sm font-extrabold">Henüz hata bildirimi yok</p>
              <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
                Sınav çözerken veya sonuç karnesini incelerken sorunlu gördüğünüz herhangi bir
                sorunun üzerindeki <strong>Hatalı İşaretle</strong> butonunu kullanabilirsiniz.
              </p>
            </div>
          ) : (
            reportsList.map((item) => {
              const surahName = surahMap.get(item.surah) ?? `Sure ${item.surah}`;
              return (
                <article
                  key={item.uid}
                  className="p-3.5 rounded-2xl border space-y-2"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-extrabold"
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.14)',
                          color: '#DC2626',
                        }}
                      >
                        {getIssueReasonLabel(item.reason)}
                      </span>
                      <span className="text-xs font-extrabold">
                        {surahName}
                      </span>
                      <span
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded border"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {item.uid}
                      </span>
                      {item.sourceRef && (
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          · {item.sourceRef}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeQuestionIssueReport(item.uid)}
                      aria-label="Bildirimi kaldır"
                      className="min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Kaldır</span>
                    </button>
                  </div>

                  {item.stemSnippet && (
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {item.stemSnippet}
                    </p>
                  )}

                  {item.note && (
                    <p
                      className="text-xs font-semibold px-3 py-2 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Not: {item.note}
                    </p>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
