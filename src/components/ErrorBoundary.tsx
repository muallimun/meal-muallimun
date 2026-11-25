import React from 'react';
import { AlertTriangle, Download, Home, RotateCcw, X } from 'lucide-react';
import { memorizationStorage } from '../services/memorizationStorage';
import type { MemorizationBackupPayload } from '../types/memorization';
import { loadActiveExamSession } from '../utils/examUtils';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  scope?: 'page' | 'modals';
  resetKey?: string;
  onNavigateHome?: () => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  backupFeedback: string | null;
  isExportingBackup: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      backupFeedback: null,
      isExportingBackup: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || 'Beklenmeyen bir görünüm hatası oluştu.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error(`[ErrorBoundary:${this.props.scope ?? 'page'}]`, error, info.componentStack);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '', backupFeedback: null });
    }
  }

  private handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, errorMessage: '', backupFeedback: null });
  };

  private handleNavigateHome = (): void => {
    this.props.onNavigateHome?.();
    this.setState({ hasError: false, errorMessage: '', backupFeedback: null });
  };

  private handleEmergencyBackup = async (): Promise<void> => {
    if (this.state.isExportingBackup) return;
    this.setState({ isExportingBackup: true, backupFeedback: null });

    try {
      const localEntries: Record<string, string> = {};
      if (typeof window !== 'undefined') {
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (!key || !key.startsWith('muallimun')) continue;
          const val = window.localStorage.getItem(key);
          if (val !== null) {
            localEntries[key] = val;
          }
        }
      }

      let isPartialFallback = false;
      let memorizationPayload: MemorizationBackupPayload;

      try {
        memorizationPayload = await memorizationStorage.createBackupPayload();
      } catch {
        isPartialFallback = true;
        memorizationPayload = {
          app: 'muallimun-memorization',
          version: 2,
          exportedAt: new Date().toISOString(),
          units: memorizationStorage.readUnitsSync(),
          prefs: memorizationStorage.readPrefsSync(),
          activeSession: memorizationStorage.readActiveSessionSync(),
          classicalPlan: memorizationStorage.readClassicalPlanSync(),
        };
      }

      const activeExamSession = loadActiveExamSession();

      const payload = {
        app: 'muallimun-kuran-full-backup',
        version: 2,
        emergency: true,
        exportedAt: new Date().toISOString(),
        localStorage: localEntries,
        memorization: memorizationPayload,
        ...(activeExamSession ? { activeExamSession } : {}),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const dateStamp = new Date().toISOString().slice(0, 10);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `muallimun-kuran-acil-yedek-${dateStamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.setState({
        isExportingBackup: false,
        backupFeedback: isPartialFallback
          ? `Kısmi acil yedek indirildi (yerel kopya · ${Object.keys(localEntries).length} kayıt alanı ve ${memorizationPayload.units.length} ezber birimi).`
          : `Acil yedek indirildi (${Object.keys(localEntries).length} kayıt alanı ve ${memorizationPayload.units.length} ezber birimi).`,
      });
    } catch {
      this.setState({
        isExportingBackup: false,
        backupFeedback: 'Acil yedek oluşturulurken bir sorun oluştu.',
      });
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const scope = this.props.scope ?? 'page';

    if (scope === 'modals') {
      return (
        <div
          role="alert"
          className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[105] rounded-2xl border p-4 shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <div className="flex items-start gap-3">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                color: '#DC2626',
              }}
            >
              <AlertTriangle className="w-4.5 h-4.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold">Pencere katmanında bir sorun oluştu</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Ana sayfa ve okuma ekranınız etkilenmedi. Pencere katmanını yeniden başlatabilirsiniz.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Yeniden Dene</span>
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              aria-label="Bildirimi kapat"
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="py-10 px-4 flex items-center justify-center">
        <div
          role="alert"
          className="w-full max-w-lg rounded-3xl border p-6 sm:p-8 shadow-lg space-y-5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <div className="flex items-start gap-3.5">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                Bu görünüm geçici bir sorunla karşılaştı
              </h2>
              <p className="text-xs sm:text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Çalışma verileriniz, ezberleriniz ve notlarınız cihazınızda güvende. Görünümü yeniden
                deneyebilir, Ana Sayfaya dönebilir veya tek tıkla acil yedek alabilirsiniz.
              </p>
            </div>
          </div>

          {this.state.errorMessage && (
            <div
              className="px-3.5 py-2.5 rounded-xl border text-xs font-mono break-words"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              {this.state.errorMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex-1 min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Görünümü Yeniden Dene</span>
            </button>

            {this.props.onNavigateHome && (
              <button
                type="button"
                onClick={this.handleNavigateHome}
                className="flex-1 min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Home className="w-4 h-4 shrink-0" />
                <span>Ana Sayfaya Dön</span>
              </button>
            )}
          </div>

          <div
            className="pt-3 border-t flex flex-col gap-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              disabled={this.state.isExportingBackup}
              onClick={() => void this.handleEmergencyBackup()}
              className="w-full min-h-[40px] px-4 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'rgba(15, 118, 110, 0.35)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {this.state.isExportingBackup ? 'Acil Yedek Hazırlanıyor...' : 'Acil Yedek İndir (.json)'}
              </span>
            </button>

            {this.state.backupFeedback && (
              <p
                role="status"
                className="text-xs font-semibold text-center"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {this.state.backupFeedback}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
}
