import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Headphones,
  Info,
  Play,
  SlidersHorizontal,
  Timer,
  X,
} from 'lucide-react';
import { findReciterById } from '../../config/recitersConfig';
import {
  generateSessionSteps,
  INTENSITY_PROFILES,
} from '../../services/memorizationEngine';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  IntensityProfile,
  MemorizationMethod,
  MemorizationPrefs,
  MemorizationUnit,
  PauseMultiplier,
} from '../../types/memorization';
import { TEACHER_RECITER_IDS } from '../../types/memorization';

interface QuickStartDrawerProps {
  isOpen: boolean;
  unit: MemorizationUnit | null;
  prefs: MemorizationPrefs;
  onChangePrefs: (patch: Partial<MemorizationPrefs>) => void;
  onStart: () => void;
  onClose: () => void;
}

const METHOD_OPTIONS: Array<{
  id: MemorizationMethod;
  label: string;
  desc: string;
}> = [
  {
    id: 'snowball',
    label: 'Kar Topu',
    desc: 'Önerilen · 5’li küme & zincir bağlama',
  },
  {
    id: 'single',
    label: 'Tekil Ayet',
    desc: 'Her ayeti sırayla tek tek tekrar et',
  },
  {
    id: 'block',
    label: 'Toplu Blok',
    desc: 'Tüm aralığı baştan sona pekiştir',
  },
];

export const QuickStartDrawer: React.FC<QuickStartDrawerProps> = ({
  isOpen,
  unit,
  prefs,
  onChangePrefs,
  onStart,
  onClose,
}) => {
  const { audioPrefs, manifest, openReciterSelector, isReciterSelectorOpen } = useAppStore();
  const [showCustomSliders, setShowCustomSliders] = useState(prefs.profile === 'custom');

  useEffect(() => {
    if (prefs.profile === 'custom') {
      setShowCustomSliders(true);
    }
  }, [prefs.profile]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isReciterSelectorOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isReciterSelectorOpen, onClose]);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );
  const isTeacherReciter = TEACHER_RECITER_IDS.has(activeReciter.id);

  const previewSteps = useMemo(() => {
    if (!unit) return [];
    return generateSessionSteps(
      unit.verseKeys,
      prefs.method,
      prefs.profile,
      prefs.customConfig,
    );
  }, [unit, prefs.method, prefs.profile, prefs.customConfig]);

  if (!isOpen || !unit) return null;

  const clusterCount =
    previewSteps.length > 0 ? Math.max(...previewSteps.map((s) => s.totalClusters)) : 1;

  const updateCustom = (patch: Partial<MemorizationPrefs['customConfig']>) => {
    onChangePrefs({
      profile: 'custom',
      customConfig: { ...prefs.customConfig, ...patch },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Hızlı Başlat Ayarları"
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-3.5 sm:px-5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="min-w-0">
            <p
              className="text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              Çalışmaya Hazırlık
            </p>
            <h3 className="text-base font-extrabold truncate">{unit.title}</h3>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {unit.verseKeys.length} Ayet
              {unit.mushafPages.length > 0
                ? ` · Sayfa ${unit.mushafPages[0]}${
                    unit.mushafPages.length > 1
                      ? `–${unit.mushafPages[unit.mushafPages.length - 1]}`
                      : ''
                  }`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ayarlar Gövdesi */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* 1. Yöntem */}
          <div className="space-y-2">
            <span
              className="block text-xs font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Ezber Yöntemi
            </span>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map((opt) => {
                const active = prefs.method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onChangePrefs({ method: opt.id });
                    }}
                    className="p-2.5 rounded-2xl border text-left transition-all cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <p
                      className="text-xs sm:text-sm font-extrabold"
                      style={{
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                      }}
                    >
                      {opt.label}
                    </p>
                    <p
                      className="text-[10px] leading-snug mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Tekrar Yoğunluğu */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-xs font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Tekrar Yoğunluğu
              </span>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setShowCustomSliders((v) => !v);
                }}
                className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Özelleştir</span>
                {showCustomSliders ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['fast', 'balanced', 'deep'] as const).map((profId) => {
                const prof = INTENSITY_PROFILES[profId];
                const active = prefs.profile === profId;
                return (
                  <button
                    key={profId}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onChangePrefs({
                        profile: profId as IntensityProfile,
                        customConfig: { ...prof.config },
                      });
                    }}
                    className="p-2.5 rounded-2xl border text-left transition-all cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <p
                      className="text-xs sm:text-sm font-extrabold"
                      style={{
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                      }}
                    >
                      {prof.label}
                    </p>
                    <p
                      className="text-[10px] leading-snug mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {prof.config.newAyahReps} yeni · {prof.config.chainReps} zincir
                    </p>
                  </button>
                );
              })}
            </div>

            {showCustomSliders && (
              <div
                className="p-3.5 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span>Yeni Ayet Tekrarı</span>
                    <span className="tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                      {prefs.customConfig.newAyahReps}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={prefs.customConfig.newAyahReps}
                    onChange={(e) => updateCustom({ newAyahReps: Number(e.target.value) })}
                    className="w-full accent-[var(--brand-primary)]"
                  />
                </div>

                {prefs.method === 'snowball' && (
                  <>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>Zincir Bağlama Tekrarı</span>
                        <span
                          className="tabular-nums"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {prefs.customConfig.chainReps}×
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={prefs.customConfig.chainReps}
                        onChange={(e) => updateCustom({ chainReps: Number(e.target.value) })}
                        className="w-full accent-[var(--brand-primary)]"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>Küme Boyutu (Pencere)</span>
                        <span
                          className="tabular-nums"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {prefs.customConfig.windowSize} Ayet
                        </span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={7}
                        value={prefs.customConfig.windowSize}
                        onChange={(e) => updateCustom({ windowSize: Number(e.target.value) })}
                        className="w-full accent-[var(--brand-primary)]"
                      />
                    </div>
                  </>
                )}

                {prefs.method === 'block' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span>Toplu Blok Turu</span>
                      <span className="tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                        {prefs.customConfig.blockRounds}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={prefs.customConfig.blockRounds}
                      onChange={(e) => updateCustom({ blockRounds: Number(e.target.value) })}
                      className="w-full accent-[var(--brand-primary)]"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Okuyucu (Kurrâ) */}
          <div
            className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Headphones className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  Kurrâ (27 Okuyucu)
                </p>
                <p className="text-xs sm:text-sm font-extrabold truncate">{activeReciter.label}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openReciterSelector('memorize');
              }}
              className="min-h-[36px] px-3 rounded-xl border text-xs font-extrabold cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              Değiştir
            </button>
          </div>

          {/* 4. Dinle & Tekrar Et Boşluğu (Akıllı Sekte) */}
          <div
            className="p-3.5 rounded-2xl border space-y-2.5"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Timer className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-accent-text)' }} />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold">
                    Dinle &amp; Tekrar Et Boşluğu
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Her ayet sonrası ezberden okumanız için dinamik sekte bırakır
                  </p>
                </div>
              </div>
              {!isTeacherReciter && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.listenRepeatPauseEnabled}
                  onClick={() => {
                    sfxService.play('click');
                    onChangePrefs({
                      listenRepeatPauseEnabled: !prefs.listenRepeatPauseEnabled,
                    });
                  }}
                  className="w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: prefs.listenRepeatPauseEnabled
                      ? 'var(--brand-primary)'
                      : 'var(--border-strong)',
                  }}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                      prefs.listenRepeatPauseEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              )}
            </div>

            {isTeacherReciter ? (
              <div
                className="px-3 py-2 rounded-xl text-xs font-semibold flex items-start gap-2"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Muallim kaydında doğal tekrar boşluğu aktif — ek yapay sekte otomatik kapalı.
                </span>
              </div>
            ) : (
              prefs.listenRepeatPauseEnabled && (
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Süre çarpanı:
                  </span>
                  {([0.8, 1, 1.2] as PauseMultiplier[]).map((mult) => {
                    const active = prefs.pauseMultiplier === mult;
                    return (
                      <button
                        key={mult}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          onChangePrefs({ pauseMultiplier: mult });
                        }}
                        className="px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: active ? '#FFFFFF' : 'var(--text-primary)',
                        }}
                      >
                        {mult.toFixed(1)}x
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>

        {/* Alt Başlat Çubuğu */}
        <div
          className="px-4 py-3.5 sm:px-5 border-t shrink-0 flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            <span className="font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {previewSteps.length} adım
            </span>
            {prefs.method === 'snowball' && clusterCount > 1 ? ` · ${clusterCount} küme` : ''}
          </div>
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onStart();
            }}
            className="min-h-[44px] px-6 rounded-2xl text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Çalışmaya Başla</span>
          </button>
        </div>
      </div>
    </div>
  );
};
