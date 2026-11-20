import { getDynamicMealAudioSources } from '../config/assetsConfig';
import {
  buildReciterAudioUrls,
  findReciterById,
} from '../config/recitersConfig';
import type {
  AudioPlayMode,
  AudioPrefs,
  CombinedVerse,
  ManifestData,
  MetaData,
  ReciterDefinition,
  ReciterFilePattern,
} from '../types/quran';

export type AudioQueueStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type PreviewAudioStatus = 'idle' | 'loading' | 'playing' | 'error';
export type AudioPhase = 'besmele' | 'ar' | 'meal';
export type AudioQueueContext = 'page' | 'surah' | 'single';
export type AudioSourceKey = string;

export interface AudioQueueSnapshot {
  status: AudioQueueStatus;
  isVisible: boolean;
  context: AudioQueueContext | null;
  contextKey: string | null;
  currentSurah: number | null;
  currentSurahName: string;
  currentAyah: number | null;
  currentPage: number | null;
  currentAyahId: number | null;
  activePhase: AudioPhase | null;
  activeSourceKey: AudioSourceKey | null;
  activeReciterLabel: string;
  currentRepeat: number;
  totalRepeats: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  missingMealAudio: boolean;
  previewReciterId: string | null;
  previewStatus: PreviewAudioStatus;
}

interface PlaybackStep {
  phase: AudioPhase;
  sourceKey: AudioSourceKey;
  reciterLabel: string;
  urls: string[];
  verseIndex: number;
  repeatIndex: number;
}

interface StartQueueOptions {
  verses: CombinedVerse[];
  startIndex: number;
  context: AudioQueueContext;
  contextKey: string;
  manifest: ManifestData;
  meta: MetaData;
  prefs: AudioPrefs;
  singleAyahOnly?: boolean;
  modeOverride?: AudioPlayMode;
}

type NextPageProvider = (nextPage: number) => Promise<{
  verses: CombinedVerse[];
  contextKey: string;
} | null>;

type Listener = () => void;

const MAX_CONSECUTIVE_FAILURES = 3;
const LOAD_TIMEOUT_MS = 12000;

const INITIAL_SNAPSHOT: AudioQueueSnapshot = {
  status: 'idle',
  isVisible: false,
  context: null,
  contextKey: null,
  currentSurah: null,
  currentSurahName: '',
  currentAyah: null,
  currentPage: null,
  currentAyahId: null,
  activePhase: null,
  activeSourceKey: null,
  activeReciterLabel: '',
  currentRepeat: 1,
  totalRepeats: 1,
  canGoPrev: false,
  canGoNext: false,
  errorMessage: null,
  infoMessage: null,
  missingMealAudio: false,
  previewReciterId: null,
  previewStatus: 'idle',
};

function dedupeUrls(urls: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

class AudioQueueService {
  private snapshot: AudioQueueSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<Listener>();

  private audio: HTMLAudioElement | null = null;
  private audioAbortController: AbortController | null = null;
  private preloader: HTMLAudioElement | null = null;
  private previewAudio: HTMLAudioElement | null = null;
  private previewAbortController: AbortController | null = null;
  private previewSessionId = 0;
  private skipTimer: number | null = null;
  private loadTimer: number | null = null;
  private playSessionId = 0;
  private consecutiveFailures = 0;

  private verses: CombinedVerse[] = [];
  private currentVerseIndex = 0;
  private steps: PlaybackStep[] = [];
  private currentStepIndex = 0;

  private manifest: ManifestData | null = null;
  private meta: MetaData | null = null;
  private prefs: AudioPrefs = {
    mode: 'ar_then_meal',
    arabicAudioSource: 'hatim',
    arabicReciterId: 'hatim',
    favoriteReciterIds: ['hatim'],
    mealAudioSource: 'tdv',
    playbackRate: 1,
    repeatCount: 1,
    autoScroll: true,
  };
  private singleAyahOnly = false;
  private activeModeOverride: AudioPlayMode | undefined;
  private context: AudioQueueContext | null = null;
  private contextKey: string | null = null;
  private activeInfoNotice: string | null = null;

  private nextPageProvider: NextPageProvider | null = null;

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): AudioQueueSnapshot => this.snapshot;

  private emit(patch: Partial<AudioQueueSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }

  public registerNextPageProvider(provider: NextPageProvider | null): void {
    this.nextPageProvider = provider;
  }

  private getSurahName(surahNo: number): string {
    const found = this.meta?.surahs.find((s) => s.no === surahNo);
    return found ? found.nameTr : `${surahNo}. Sure`;
  }

  private resolveArabicSource(): ReciterDefinition {
    const preferred = this.prefs.arabicReciterId || this.prefs.arabicAudioSource || 'hatim';
    return findReciterById(preferred, this.manifest);
  }

  private resolveMealSource() {
    const sources = getDynamicMealAudioSources(this.manifest);
    if (sources.length === 0) return null;
    const preferred = this.prefs.mealAudioSource;
    if (preferred) {
      const exact = sources.find((s) => s.id === preferred);
      if (exact) return exact;
    }
    // Seslendirmesi olmayan meal (m3..m24) okunurken ses motoru varsayılan sesli meale (TDV) düşer
    return sources[0] ?? null;
  }

  /**
   * Okuyucunun `filePattern` değerine göre URL üretir:
   * - 'underscore' (Türk Kurrâlar ve TDV/DİB mealleri): {SSS}_{AAA}.mp3 (Besmele: 001_001.mp3)
   * - 'compact' (EveryAyah Arap Kurrâlar): {SSS}{AAA}.mp3 (Besmele: 001001.mp3)
   */
  private buildAudioUrlsForSource(
    source: {
      baseUrl: string;
      fallbackBaseUrl?: string;
      filePattern?: ReciterFilePattern;
      ext?: string;
    } | null,
    surahNo: number,
    ayahNo: number,
  ): string[] {
    if (!source || !source.baseUrl) return [];
    return dedupeUrls(buildReciterAudioUrls(source, surahNo, ayahNo));
  }

  private getEffectiveMode(): AudioPlayMode {
    return this.activeModeOverride ?? this.prefs.mode;
  }

  /**
   * Seçili ayet için Besmele, Arapça, Meal ve Tekrar kurallarına göre adımları oluşturur.
   * Seslendirmesi bulunmayan meal seçiliyse güvenli fallback uygular.
   */
  private buildStepsForVerse(
    verseIndex: number,
    includeBesmeleIfApplicable: boolean,
  ): PlaybackStep[] {
    const verse = this.verses[verseIndex];
    if (!verse || !this.manifest || !this.meta) return [];

    const mode = this.getEffectiveMode();
    const arabicSource = this.resolveArabicSource();
    const mealSource = this.resolveMealSource();
    const repeatCount = this.prefs.repeatCount;
    const steps: PlaybackStep[] = [];

    // Sadece Sesli Meal modunda seçili mealin ses kaydı yoksa boş adım dön (startQueue nazikçe uyarır)
    if (mode === 'meal' && !mealSource) {
      return [];
    }

    // 1. Besmele Kuralı: Sure 1 (Fâtiha) ve Sure 9 (Tevbe) hariç 1. ayette
    // o an seçili okuyucunun kendi Besmele kaydını (001_001.mp3 veya 001001.mp3) çal
    const excludeBesmele = this.meta.besmele.excludeSurahs ?? [1, 9];
    if (
      includeBesmeleIfApplicable &&
      verse.ayah === 1 &&
      !excludeBesmele.includes(verse.surah)
    ) {
      if (mode === 'meal' && mealSource) {
        const mealBesmeleUrls = this.buildAudioUrlsForSource(mealSource, 1, 1);
        if (mealBesmeleUrls.length > 0) {
          steps.push({
            phase: 'besmele',
            sourceKey: mealSource.id,
            reciterLabel: mealSource.label,
            urls: mealBesmeleUrls,
            verseIndex,
            repeatIndex: 1,
          });
        }
      } else if (arabicSource) {
        const arBesmeleUrls = this.buildAudioUrlsForSource(arabicSource, 1, 1);
        if (arBesmeleUrls.length > 0) {
          steps.push({
            phase: 'besmele',
            sourceKey: arabicSource.id,
            reciterLabel: arabicSource.shortLabel,
            urls: arBesmeleUrls,
            verseIndex,
            repeatIndex: 1,
          });
        }
      }
    }

    // 2. Birleşik Meal (mg) Kuralı:
    // mg: [startAyet, endAyet] varsa ve ayetNo > startAyet ise sıralı oynatmada meal sesini tekrar çalma.
    const activeMealObj =
      mealSource?.mealId === 'm2' || mealSource?.id === 'dib' ? verse.m2 : verse.m1;
    const mg = activeMealObj?.mg;
    const isMergedContinuation = Boolean(mg && verse.ayah > mg[0]);

    const arUrls = this.buildAudioUrlsForSource(arabicSource, verse.surah, verse.ayah);
    const primaryMealUrls = this.buildAudioUrlsForSource(mealSource, verse.surah, verse.ayah);
    const mergedStartMealUrls =
      mealSource && mg && mg[0] !== verse.ayah
        ? this.buildAudioUrlsForSource(mealSource, verse.surah, mg[0])
        : [];
    const combinedMealUrls = dedupeUrls([...primaryMealUrls, ...mergedStartMealUrls]);

    for (let rep = 1; rep <= repeatCount; rep += 1) {
      if ((mode === 'ar' || mode === 'ar_then_meal') && arabicSource && arUrls.length > 0) {
        steps.push({
          phase: 'ar',
          sourceKey: arabicSource.id,
          reciterLabel: arabicSource.shortLabel,
          urls: arUrls,
          verseIndex,
          repeatIndex: rep,
        });
      }

      const shouldPlayMeal =
        (mode === 'meal' || mode === 'ar_then_meal') && Boolean(mealSource)
          ? this.singleAyahOnly || !isMergedContinuation
          : false;

      if (shouldPlayMeal && mealSource && combinedMealUrls.length > 0) {
        steps.push({
          phase: 'meal',
          sourceKey: mealSource.id,
          reciterLabel: mealSource.label,
          urls: combinedMealUrls,
          verseIndex,
          repeatIndex: rep,
        });
      }
    }

    return steps;
  }

  private clearSkipTimer(): void {
    if (this.skipTimer !== null) {
      window.clearTimeout(this.skipTimer);
      this.skipTimer = null;
    }
  }

  private clearLoadTimer(): void {
    if (this.loadTimer !== null) {
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private teardownAudioElement(): void {
    this.clearSkipTimer();
    this.clearLoadTimer();

    if (this.audioAbortController) {
      this.audioAbortController.abort();
      this.audioAbortController = null;
    }

    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // ignore cleanup errors
      }
      this.audio = null;
    }
  }

  private preloadNextUrl(): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

    let nextUrl: string | null = null;
    if (this.currentStepIndex + 1 < this.steps.length) {
      nextUrl = this.steps[this.currentStepIndex + 1].urls[0] ?? null;
    } else if (!this.singleAyahOnly && this.currentVerseIndex + 1 < this.verses.length) {
      const upcomingSteps = this.buildStepsForVerse(this.currentVerseIndex + 1, true);
      nextUrl = upcomingSteps[0]?.urls[0] ?? null;
    }

    if (!nextUrl) return;
    try {
      if (!this.preloader) {
        this.preloader = new Audio();
      }
      if (this.preloader.src !== nextUrl) {
        this.preloader.preload = 'auto';
        this.preloader.src = nextUrl;
      }
    } catch {
      // ignore preload failures
    }
  }

  private updateNavigationAvailability(): { canGoPrev: boolean; canGoNext: boolean } {
    if (this.verses.length === 0) {
      return { canGoPrev: false, canGoNext: false };
    }
    return {
      canGoPrev: this.currentVerseIndex > 0,
      canGoNext:
        this.currentVerseIndex < this.verses.length - 1 ||
        (this.context === 'page' && this.nextPageProvider !== null),
    };
  }

  private playCurrentStep(urlIndex = 0): void {
    const session = this.playSessionId;
    const step = this.steps[this.currentStepIndex];

    if (!step) {
      void this.advanceToNextVerse();
      return;
    }

    const verse = this.verses[step.verseIndex];
    if (!verse) {
      this.stopAndReset(false);
      return;
    }

    const targetUrl = step.urls[urlIndex];
    if (!targetUrl) {
      this.handleStepExhausted(session);
      return;
    }

    this.teardownAudioElement();

    const nav = this.updateNavigationAvailability();
    this.emit({
      status: 'loading',
      isVisible: true,
      context: this.context,
      contextKey: this.contextKey,
      currentSurah: verse.surah,
      currentSurahName: this.getSurahName(verse.surah),
      currentAyah: verse.ayah,
      currentPage: verse.page,
      currentAyahId: verse.id,
      activePhase: step.phase,
      activeSourceKey: step.sourceKey,
      activeReciterLabel: step.reciterLabel,
      currentRepeat: step.repeatIndex,
      totalRepeats: this.prefs.repeatCount,
      canGoPrev: nav.canGoPrev,
      canGoNext: nav.canGoNext,
      errorMessage: null,
      infoMessage: this.activeInfoNotice,
      missingMealAudio: false,
    });

    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      this.emit({
        status: 'error',
        errorMessage: 'Bu tarayıcı ses oynatmayı desteklemiyor.',
      });
      return;
    }

    // Archive.org yönlendirmelerinde CORS engeli olmaması için crossOrigin KULLANILMAZ
    const audio = new Audio();
    audio.preload = 'auto';
    audio.playbackRate = this.prefs.playbackRate;

    const controller = new AbortController();
    const { signal } = controller;
    this.audioAbortController = controller;
    this.audio = audio;

    let handledFailure = false;

    const handleFailure = () => {
      if (handledFailure || session !== this.playSessionId) return;
      handledFailure = true;
      this.clearLoadTimer();

      if (urlIndex + 1 < step.urls.length) {
        this.playCurrentStep(urlIndex + 1);
        return;
      }

      this.handleStepExhausted(session);
    };

    this.loadTimer = window.setTimeout(() => {
      if (session !== this.playSessionId) return;
      handleFailure();
    }, LOAD_TIMEOUT_MS);

    audio.addEventListener(
      'canplay',
      () => {
        if (session !== this.playSessionId) return;
        this.clearLoadTimer();
      },
      { signal },
    );

    audio.addEventListener(
      'playing',
      () => {
        if (session !== this.playSessionId) return;
        this.clearLoadTimer();
        this.consecutiveFailures = 0;
        audio.playbackRate = this.prefs.playbackRate;
        this.emit({ status: 'playing', errorMessage: null });
        this.preloadNextUrl();
      },
      { signal },
    );

    audio.addEventListener(
      'waiting',
      () => {
        if (session !== this.playSessionId) return;
        if (this.snapshot.status === 'playing') {
          this.emit({ status: 'loading' });
        }
      },
      { signal },
    );

    audio.addEventListener(
      'ended',
      () => {
        if (session !== this.playSessionId) return;
        this.clearLoadTimer();
        this.advanceToNextStep();
      },
      { signal },
    );

    audio.addEventListener(
      'error',
      () => {
        handleFailure();
      },
      { signal },
    );

    audio.src = targetUrl;

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        if (session !== this.playSessionId) return;
        const errName =
          err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        if (errName === 'AbortError') return;
        if (errName === 'NotAllowedError') {
          this.clearLoadTimer();
          this.emit({
            status: 'paused',
            errorMessage: 'Ses oynatmak için oynat butonuna dokunun.',
          });
          return;
        }
        handleFailure();
      });
    }
  }

  private handleStepExhausted(session: number): void {
    if (session !== this.playSessionId) return;
    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.teardownAudioElement();
      this.emit({
        status: 'paused',
        errorMessage:
          'Ses dosyalarına şu anda ulaşılamıyor. İnternet bağlantınızı kontrol edip tekrar deneyin.',
      });
      return;
    }

    this.clearSkipTimer();
    this.skipTimer = window.setTimeout(() => {
      if (session !== this.playSessionId) return;
      this.advanceToNextStep();
    }, 350);
  }

  private advanceToNextStep(): void {
    if (this.currentStepIndex + 1 < this.steps.length) {
      this.currentStepIndex += 1;
      this.playCurrentStep(0);
      return;
    }
    void this.advanceToNextVerse();
  }

  private async advanceToNextVerse(): Promise<void> {
    const session = this.playSessionId;

    if (this.singleAyahOnly) {
      this.teardownAudioElement();
      this.emit({ status: 'paused', activePhase: null });
      return;
    }

    let nextIdx = this.currentVerseIndex + 1;
    while (nextIdx < this.verses.length) {
      const nextSteps = this.buildStepsForVerse(nextIdx, true);
      if (nextSteps.length > 0) {
        this.currentVerseIndex = nextIdx;
        this.steps = nextSteps;
        this.currentStepIndex = 0;
        this.playCurrentStep(0);
        return;
      }
      nextIdx += 1;
    }

    if (this.context === 'page' && this.nextPageProvider && this.verses.length > 0) {
      const lastVerse = this.verses[this.verses.length - 1];
      const nextPageNo = lastVerse.page + 1;
      this.emit({ status: 'loading' });

      try {
        const nextPageData = await this.nextPageProvider(nextPageNo);
        if (session !== this.playSessionId) return;

        if (nextPageData && nextPageData.verses.length > 0) {
          this.verses = nextPageData.verses;
          this.contextKey = nextPageData.contextKey;
          this.currentVerseIndex = 0;

          for (let i = 0; i < this.verses.length; i += 1) {
            const nextSteps = this.buildStepsForVerse(i, true);
            if (nextSteps.length > 0) {
              this.currentVerseIndex = i;
              this.steps = nextSteps;
              this.currentStepIndex = 0;
              this.playCurrentStep(0);
              return;
            }
          }
        }
      } catch {
        // Sonraki sayfa yüklenemezse sessizce duraklat
      }
    }

    this.teardownAudioElement();
    this.emit({ status: 'paused', activePhase: null });
  }

  private emitMissingMealAudioNotice(verse: CombinedVerse): void {
    const nav = this.updateNavigationAvailability();
    this.teardownAudioElement();
    this.emit({
      status: 'paused',
      isVisible: true,
      context: this.context,
      contextKey: this.contextKey,
      currentSurah: verse.surah,
      currentSurahName: this.getSurahName(verse.surah),
      currentAyah: verse.ayah,
      currentPage: verse.page,
      currentAyahId: verse.id,
      activePhase: null,
      activeSourceKey: null,
      activeReciterLabel: '',
      currentRepeat: 1,
      totalRepeats: this.prefs.repeatCount,
      canGoPrev: nav.canGoPrev,
      canGoNext: nav.canGoNext,
      errorMessage:
        'Seçili mealin sesli kaydı bulunmuyor. Aşağıdan sesli bir meal (TDV / DİB) veya Arapça tilavet seçebilirsiniz.',
      infoMessage: null,
      missingMealAudio: true,
    });
  }

  public startQueue(options: StartQueueOptions): void {
    this.stopPreview();
    this.playSessionId += 1;
    this.consecutiveFailures = 0;
    this.teardownAudioElement();

    this.verses = options.verses;
    this.currentVerseIndex = Math.max(
      0,
      Math.min(options.startIndex, Math.max(0, options.verses.length - 1)),
    );
    this.context = options.context;
    this.contextKey = options.contextKey;
    this.manifest = options.manifest;
    this.meta = options.meta;
    this.prefs = { ...options.prefs };
    this.singleAyahOnly = Boolean(options.singleAyahOnly);
    this.activeModeOverride = options.modeOverride;
    this.activeInfoNotice = null;

    if (this.verses.length === 0) {
      this.stopAndReset(false);
      return;
    }

    const targetIndex = this.currentVerseIndex;
    const targetVerse = this.verses[targetIndex];
    const effectiveMode = this.getEffectiveMode();
    const resolvedMeal = this.resolveMealSource();

    // Sadece sesli meal istendi ama o mealin seslendirmesi yoksa hızlı atlama/çökme yapma; net bildirim ver
    if (effectiveMode === 'meal' && !resolvedMeal) {
      this.steps = [];
      this.emitMissingMealAudioNotice(targetVerse);
      return;
    }

    // Arapça + Meal modunda meal sesi yoksa Arapça tilaveti oynat ve nazik bilgi göster
    if (effectiveMode === 'ar_then_meal' && !resolvedMeal) {
      this.activeInfoNotice =
        'Seçili mealin ses kaydı olmadığı için Arapça tilavet oynatılıyor.';
    }

    let builtSteps = this.buildStepsForVerse(targetIndex, true);

    // Meal modunda birleşik meal devam ayetinden başlandıysa mevcut ayeti zorla çal
    if (builtSteps.length === 0) {
      const prevSingle = this.singleAyahOnly;
      this.singleAyahOnly = true;
      builtSteps = this.buildStepsForVerse(targetIndex, true);
      this.singleAyahOnly = prevSingle;
    }

    if (builtSteps.length === 0) {
      this.emit({
        status: 'paused',
        isVisible: true,
        errorMessage: 'Bu ayet için ses kaynağı yapılandırılamadı.',
        missingMealAudio: effectiveMode === 'meal',
      });
      return;
    }

    this.currentVerseIndex = targetIndex;
    this.steps = builtSteps;
    this.currentStepIndex = 0;
    this.playCurrentStep(0);
  }

  public togglePlayPause(): void {
    if (!this.audio) {
      if (this.verses.length > 0 && this.steps.length > 0) {
        this.stopPreview();
        this.playSessionId += 1;
        this.consecutiveFailures = 0;
        this.playCurrentStep(0);
      }
      return;
    }

    if (this.snapshot.status === 'playing' || this.snapshot.status === 'loading') {
      this.clearSkipTimer();
      this.clearLoadTimer();
      try {
        this.audio.pause();
      } catch {
        // ignore
      }
      this.emit({ status: 'paused' });
    } else if (this.snapshot.status === 'paused' || this.snapshot.status === 'error') {
      this.stopPreview();
      const session = this.playSessionId;
      this.consecutiveFailures = 0;
      this.audio.playbackRate = this.prefs.playbackRate;
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (session !== this.playSessionId) return;
          const errName =
            err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
          if (errName === 'AbortError') return;
          this.playCurrentStep(0);
        });
      }
      this.emit({ status: 'playing', errorMessage: null });
    }
  }

  public pause(): void {
    if (this.snapshot.status === 'playing' || this.snapshot.status === 'loading') {
      this.clearSkipTimer();
      this.clearLoadTimer();
      try {
        this.audio?.pause();
      } catch {
        // ignore
      }
      this.emit({ status: 'paused' });
    }
  }

  public nextVerse(): void {
    if (this.verses.length === 0) return;
    this.stopPreview();
    this.playSessionId += 1;
    this.consecutiveFailures = 0;
    this.singleAyahOnly = false;
    void this.advanceToNextVerse();
  }

  public prevVerse(): void {
    if (this.verses.length === 0 || this.currentVerseIndex <= 0) return;
    this.stopPreview();
    this.playSessionId += 1;
    this.consecutiveFailures = 0;
    this.singleAyahOnly = false;

    for (let idx = this.currentVerseIndex - 1; idx >= 0; idx -= 1) {
      const prevSteps = this.buildStepsForVerse(idx, true);
      if (prevSteps.length > 0) {
        this.currentVerseIndex = idx;
        this.steps = prevSteps;
        this.currentStepIndex = 0;
        this.playCurrentStep(0);
        return;
      }
    }
  }

  private teardownPreviewAudio(): void {
    if (this.previewAbortController) {
      this.previewAbortController.abort();
      this.previewAbortController = null;
    }
    if (this.previewAudio) {
      try {
        this.previewAudio.pause();
        this.previewAudio.removeAttribute('src');
        this.previewAudio.load();
      } catch {
        // ignore
      }
      this.previewAudio = null;
    }
  }

  public stopPreview(): void {
    this.previewSessionId += 1;
    this.teardownPreviewAudio();
    if (this.snapshot.previewReciterId !== null || this.snapshot.previewStatus !== 'idle') {
      this.emit({
        previewReciterId: null,
        previewStatus: 'idle',
      });
    }
  }

  /**
   * Okuyucu seçicideki ▶ Önizle butonu için bağımsız Besmele kaydı çalar (001_001.mp3 / 001001.mp3).
   * Ana oynatıcı çalıyorsa geçici duraklatır; aynı okuyucuya tekrar basılınca durdurur.
   */
  public previewReciter(reciter: ReciterDefinition): void {
    if (
      this.snapshot.previewReciterId === reciter.id &&
      (this.snapshot.previewStatus === 'playing' || this.snapshot.previewStatus === 'loading')
    ) {
      this.stopPreview();
      return;
    }

    if (this.snapshot.status === 'playing' || this.snapshot.status === 'loading') {
      this.pause();
    }

    this.previewSessionId += 1;
    const session = this.previewSessionId;
    this.teardownPreviewAudio();

    const urls = this.buildAudioUrlsForSource(reciter, 1, 1);
    if (urls.length === 0 || typeof window === 'undefined' || typeof Audio === 'undefined') {
      this.emit({ previewReciterId: reciter.id, previewStatus: 'error' });
      return;
    }

    this.emit({
      previewReciterId: reciter.id,
      previewStatus: 'loading',
    });

    const playAt = (urlIndex: number) => {
      if (session !== this.previewSessionId) return;
      const targetUrl = urls[urlIndex];
      if (!targetUrl) {
        this.teardownPreviewAudio();
        this.emit({ previewReciterId: reciter.id, previewStatus: 'error' });
        return;
      }

      this.teardownPreviewAudio();
      // CORS hatası olmaması için crossOrigin KULLANILMAZ
      const audio = new Audio();
      audio.preload = 'auto';
      const controller = new AbortController();
      const { signal } = controller;
      this.previewAudio = audio;
      this.previewAbortController = controller;

      let failed = false;
      const onFail = () => {
        if (failed || session !== this.previewSessionId) return;
        failed = true;
        if (urlIndex + 1 < urls.length) {
          playAt(urlIndex + 1);
          return;
        }
        this.teardownPreviewAudio();
        this.emit({ previewReciterId: reciter.id, previewStatus: 'error' });
      };

      audio.addEventListener(
        'playing',
        () => {
          if (session !== this.previewSessionId) return;
          this.emit({ previewReciterId: reciter.id, previewStatus: 'playing' });
        },
        { signal },
      );

      audio.addEventListener(
        'ended',
        () => {
          if (session !== this.previewSessionId) return;
          this.teardownPreviewAudio();
          this.emit({ previewReciterId: null, previewStatus: 'idle' });
        },
        { signal },
      );

      audio.addEventListener('error', onFail, { signal });
      audio.src = targetUrl;

      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          if (session !== this.previewSessionId) return;
          const errName =
            err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
          if (errName === 'AbortError') return;
          onFail();
        });
      }
    };

    playAt(0);
  }

  public syncPrefs(nextPrefs: AudioPrefs): void {
    const prevPrefs = this.prefs;
    this.prefs = { ...nextPrefs };

    if (prevPrefs.mode !== nextPrefs.mode) {
      this.activeModeOverride = undefined;
    }

    if (this.audio) {
      this.audio.playbackRate = nextPrefs.playbackRate;
    }

    const prevReciterId = prevPrefs.arabicReciterId || prevPrefs.arabicAudioSource;
    const nextReciterId = nextPrefs.arabicReciterId || nextPrefs.arabicAudioSource;
    const reciterChanged = prevReciterId !== nextReciterId;

    const structuralChanged =
      prevPrefs.mode !== nextPrefs.mode ||
      reciterChanged ||
      prevPrefs.mealAudioSource !== nextPrefs.mealAudioSource ||
      prevPrefs.repeatCount !== nextPrefs.repeatCount;

    if (structuralChanged && this.snapshot.isVisible && this.verses.length > 0) {
      const wasPlayingOrWaitingRecovery =
        this.snapshot.status === 'playing' ||
        this.snapshot.status === 'loading' ||
        this.snapshot.missingMealAudio;

      const effectiveMode = this.getEffectiveMode();
      const resolvedMeal = this.resolveMealSource();
      this.activeInfoNotice =
        effectiveMode === 'ar_then_meal' && !resolvedMeal
          ? 'Seçili mealin ses kaydı olmadığı için Arapça tilavet oynatılıyor.'
          : null;

      if (effectiveMode === 'meal' && !resolvedMeal) {
        const currentVerse = this.verses[this.currentVerseIndex];
        if (currentVerse) {
          this.steps = [];
          this.emitMissingMealAudioNotice(currentVerse);
        }
        return;
      }

      const includeBesmele = this.snapshot.activePhase === 'besmele';
      this.steps = this.buildStepsForVerse(this.currentVerseIndex, includeBesmele);
      this.currentStepIndex = 0;
      const firstStep = this.steps[0];

      // Duraklatılmışken okuyucu değiştirildiyse mevcut audio elementini temizle ki Play basınca yeni okuyucu çalsın
      if (!wasPlayingOrWaitingRecovery) {
        this.teardownAudioElement();
      }

      this.emit({
        totalRepeats: nextPrefs.repeatCount,
        currentRepeat: 1,
        missingMealAudio: false,
        infoMessage: this.activeInfoNotice,
        activeSourceKey: firstStep?.sourceKey ?? this.snapshot.activeSourceKey,
        activeReciterLabel: firstStep?.reciterLabel ?? this.snapshot.activeReciterLabel,
        activePhase: firstStep?.phase ?? this.snapshot.activePhase,
      });

      if (wasPlayingOrWaitingRecovery && this.steps.length > 0) {
        this.stopPreview();
        this.playSessionId += 1;
        this.consecutiveFailures = 0;
        this.playCurrentStep(0);
      }
    }
  }

  public stopAndReset(hideBar = true): void {
    this.stopPreview();
    this.playSessionId += 1;
    this.consecutiveFailures = 0;
    this.teardownAudioElement();
    this.verses = [];
    this.steps = [];
    this.currentVerseIndex = 0;
    this.currentStepIndex = 0;
    this.context = null;
    this.contextKey = null;
    this.singleAyahOnly = false;
    this.activeModeOverride = undefined;
    this.activeInfoNotice = null;
    this.emit({
      ...INITIAL_SNAPSHOT,
      isVisible: !hideBar,
    });
  }
}

export const audioQueueService = new AudioQueueService();
