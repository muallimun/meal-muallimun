import { getDynamicMealAudioSources, getIconUrl } from '../config/assetsConfig';
import {
  buildReciterAudioUrls,
  buildTemplateAudioUrl,
  findReciterById,
  resolveSyncedReciterKey,
} from '../config/recitersConfig';
import { dataService, getPageBounds } from './dataService';
import { wakeLockService } from './wakeLockService';
import type {
  AudioPlayMode,
  AudioPlaylistItem,
  AudioPrefs,
  CombinedVerse,
  ManifestData,
  MetaData,
  QueueLoopOption,
  ReciterDefinition,
  ReciterFilePattern,
  RepeatCountOption,
} from '../types/quran';
import type { SegMetaFile, SegSurahFile, WordSegmentTuple } from '../types/wordSync';

export type AudioQueueStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type PreviewAudioStatus = 'idle' | 'loading' | 'playing' | 'error';
export type AudioPhase = 'besmele' | 'ar' | 'meal';
export type AudioQueueContext = 'page' | 'surah' | 'single' | 'playlist' | 'custom';
export type AudioSourceKey = string;

export interface AudioQueueSnapshot {
  status: AudioQueueStatus;
  isVisible: boolean;
  context: AudioQueueContext | null;
  contextKey: string | null;
  queueTitle: string;
  currentSegmentIndex: number;
  totalSegments: number;
  currentQueueRound: number;
  totalQueueRounds: QueueLoopOption;
  currentSurah: number | null;
  currentSurahName: string;
  currentAyah: number | null;
  currentPage: number | null;
  currentAyahId: number | null;
  activePhase: AudioPhase | null;
  activeSourceKey: AudioSourceKey | null;
  activeReciterLabel: string;
  currentRepeat: number;
  totalRepeats: RepeatCountOption;
  canGoPrev: boolean;
  canGoNext: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  missingMealAudio: boolean;
  isWordSyncActive: boolean;
  previewReciterId: string | null;
  previewStatus: PreviewAudioStatus;
}

export interface WordSyncSnapshot {
  activeWordIndex: number | null;
  surah: number | null;
  ayah: number | null;
  phase: AudioPhase | null;
  qulWordCount: number | null;
  reciterKey: string | null;
}

interface PlaybackStep {
  phase: AudioPhase;
  sourceKey: AudioSourceKey;
  reciterLabel: string;
  urls: string[];
  verseIndex: number;
  repeatIndex: number;
  syncedReciterKey?: string | null;
}

interface AtomicSegment {
  kind: 'surah_slice' | 'page';
  surah?: number;
  startAyah?: number;
  endAyah?: number;
  pageNo?: number;
  parentIndex: number;
  parentLabel: string;
}

export interface StartQueueOptions {
  verses: CombinedVerse[];
  startIndex: number;
  context: AudioQueueContext;
  contextKey: string;
  manifest: ManifestData;
  meta: MetaData;
  prefs: AudioPrefs;
  singleAyahOnly?: boolean;
  modeOverride?: AudioPlayMode;
  queueTitle?: string;
  queueLoopOverride?: QueueLoopOption;
  repeatCountOverride?: RepeatCountOption;
}

export interface StartSegmentQueueOptions {
  items: AudioPlaylistItem[];
  title: string;
  context?: AudioQueueContext;
  contextKey?: string;
  manifest: ManifestData;
  meta: MetaData;
  prefs: AudioPrefs;
  startItemIndex?: number;
  modeOverride?: AudioPlayMode;
  queueLoopOverride?: QueueLoopOption;
  repeatCountOverride?: RepeatCountOption;
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
  queueTitle: '',
  currentSegmentIndex: 0,
  totalSegments: 1,
  currentQueueRound: 1,
  totalQueueRounds: 1,
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
  isWordSyncActive: false,
  previewReciterId: null,
  previewStatus: 'idle',
};

const INITIAL_WORD_SYNC_SNAPSHOT: WordSyncSnapshot = {
  activeWordIndex: null,
  surah: null,
  ayah: null,
  phase: null,
  qulWordCount: null,
  reciterKey: null,
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

  // Faz 2: Yüksek hassasiyetli (rAF) kelime senkronu kanalı (yalnızca kelime değişiminde tetiklenir)
  private wordSyncSnapshot: WordSyncSnapshot = { ...INITIAL_WORD_SYNC_SNAPSHOT };
  private wordSyncListeners = new Set<Listener>();
  private wordSyncEnabled = true;
  private segMeta: SegMetaFile | null = null;
  private segMetaPromise: Promise<SegMetaFile | null> | null = null;
  private segSurahCache = new Map<string, SegSurahFile | null>();
  private segSurahInflight = new Map<string, Promise<SegSurahFile | null>>();
  private activeStepSegments: WordSegmentTuple[] | null = null;
  private activeStepSegContext: {
    surah: number;
    ayah: number;
    phase: AudioPhase;
    reciterKey: string;
    qulWordCount: number | null;
  } | null = null;
  private lastMatchedSegmentIdx = 0;
  private wordSyncRafId: number | null = null;

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

  // Segment tabanlı tembel kuyruk (Çalma listesi, Cüz, Sayfa aralığı, Ayet aralığı)
  private atomicSegments: AtomicSegment[] = [];
  private currentAtomicIdx = 0;
  private totalParentSegments = 1;
  private queueBaseTitle = '';
  private currentQueueRound = 1;
  private queueLoopOverride: QueueLoopOption | undefined;
  private repeatCountOverride: RepeatCountOption | undefined;

  private manifest: ManifestData | null = null;
  private meta: MetaData | null = null;
  private prefs: AudioPrefs = {
    mode: 'ar_then_meal',
    arabicAudioSource: 'maher_al_muaiqly',
    arabicReciterId: 'maher_al_muaiqly',
    favoriteReciterIds: ['maher_al_muaiqly'],
    mealAudioSource: 'tdv',
    playbackRate: 1,
    repeatCount: 1,
    queueLoop: 1,
    autoScroll: true,
    showTextOnStart: true,
  };
  private singleAyahOnly = false;
  private activeModeOverride: AudioPlayMode | undefined;
  private context: AudioQueueContext | null = null;
  private contextKey: string | null = null;
  private activeInfoNotice: string | null = null;

  private nextPageProvider: NextPageProvider | null = null;
  private externalAudioPausers = new Set<() => void>();

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): AudioQueueSnapshot => this.snapshot;

  public subscribeWordSync = (listener: Listener): (() => void) => {
    this.wordSyncListeners.add(listener);
    return () => {
      this.wordSyncListeners.delete(listener);
    };
  };

  public getWordSyncSnapshot = (): WordSyncSnapshot => this.wordSyncSnapshot;

  public getCachedSegMeta(): SegMetaFile | null {
    return this.segMeta;
  }

  public getQulWordCount(surah: number, ayah: number): number | null {
    const count = this.segMeta?.wordCounts?.[surah - 1]?.[ayah - 1];
    return typeof count === 'number' && count > 0 ? count : null;
  }

  public ensureSegMetaLoaded(): Promise<SegMetaFile | null> {
    if (this.segMeta) return Promise.resolve(this.segMeta);
    if (!this.segMetaPromise) {
      this.segMetaPromise = dataService
        .getSegMeta()
        .then((loaded) => {
          if (loaded && typeof loaded === 'object' && loaded.reciters) {
            this.segMeta = loaded;
            return loaded;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => {
          this.segMetaPromise = null;
        });
    }
    return this.segMetaPromise;
  }

  private ensureSegSurahLoaded(reciterKey: string, surahNo: number): Promise<SegSurahFile | null> {
    const cacheKey = `${reciterKey}:${surahNo}`;
    if (this.segSurahCache.has(cacheKey)) {
      return Promise.resolve(this.segSurahCache.get(cacheKey) ?? null);
    }
    const existing = this.segSurahInflight.get(cacheKey);
    if (existing) return existing;

    const promise = dataService
      .getSegSurah(reciterKey, surahNo)
      .then((file) => {
        const valid = file && typeof file === 'object' && file.v ? file : null;
        this.segSurahCache.set(cacheKey, valid);
        return valid;
      })
      .catch(() => {
        this.segSurahCache.set(cacheKey, null);
        return null;
      })
      .finally(() => {
        this.segSurahInflight.delete(cacheKey);
      });

    this.segSurahInflight.set(cacheKey, promise);
    return promise;
  }

  private emitWordSync(next: WordSyncSnapshot): void {
    const prev = this.wordSyncSnapshot;
    if (
      prev.activeWordIndex === next.activeWordIndex &&
      prev.surah === next.surah &&
      prev.ayah === next.ayah &&
      prev.phase === next.phase &&
      prev.qulWordCount === next.qulWordCount &&
      prev.reciterKey === next.reciterKey
    ) {
      return;
    }
    this.wordSyncSnapshot = next;
    for (const listener of this.wordSyncListeners) {
      listener();
    }
  }

  private setWordSyncActiveFlag(active: boolean): void {
    if (this.snapshot.isWordSyncActive !== active) {
      this.emit({ isWordSyncActive: active });
    }
  }

  private clearWordSyncState(preserveActiveFlag = false): void {
    this.stopWordSyncLoop();
    this.activeStepSegments = null;
    this.activeStepSegContext = null;
    this.lastMatchedSegmentIdx = 0;
    this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
    if (!preserveActiveFlag) {
      this.setWordSyncActiveFlag(false);
    }
  }

  private stopWordSyncLoop(): void {
    if (this.wordSyncRafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.wordSyncRafId);
      this.wordSyncRafId = null;
    }
  }

  private findWordIndexForTimeMs(segments: WordSegmentTuple[], timeMs: number): number | null {
    const len = segments.length;
    if (len === 0) return null;

    // İlk kelimenin başlangıcından önceki sessizlikte kelime vurgusu henüz başlamamıştır
    if (timeMs < segments[0][1]) {
      return null;
    }

    // Hızlı O(1) komşuluk kontrolü + kelimeler arası nefes boşluğunda (breath gap) son okunan kelimeyi koruma
    const hint = this.lastMatchedSegmentIdx;
    if (hint >= 0 && hint < len) {
      const cur = segments[hint];
      if (timeMs >= cur[1] && timeMs < cur[2]) {
        return cur[0];
      }
      if (hint + 1 < len) {
        const next = segments[hint + 1];
        if (timeMs >= next[1] && timeMs < next[2]) {
          this.lastMatchedSegmentIdx = hint + 1;
          return next[0];
        }
        // İki kelime arasındaki milisaniyelik nefes/duraklama boşluğu: imleci söndürmeden son kelimede tut
        if (timeMs >= cur[2] && timeMs < next[1]) {
          return cur[0];
        }
      } else if (timeMs >= cur[2]) {
        // Ayetin son kelimesinden sonraki kapanış sessizliğinde son kelimeyi ayet bitene dek tut
        return cur[0];
      }
    }

    // Tam tarama (geri sarma, atlama veya bitişik olmayan aralıklar için)
    let lastStartedIdx = -1;
    for (let i = 0; i < len; i += 1) {
      const seg = segments[i];
      if (timeMs >= seg[1] && timeMs < seg[2]) {
        this.lastMatchedSegmentIdx = i;
        return seg[0];
      }
      if (timeMs >= seg[1]) {
        lastStartedIdx = i;
      }
    }
    if (lastStartedIdx !== -1) {
      this.lastMatchedSegmentIdx = lastStartedIdx;
      return segments[lastStartedIdx][0];
    }
    return null;
  }

  private startWordSyncLoop(): void {
    if (
      typeof window === 'undefined' ||
      !this.wordSyncEnabled ||
      !this.audio ||
      !this.activeStepSegments ||
      !this.activeStepSegContext ||
      this.snapshot.status !== 'playing'
    ) {
      return;
    }
    if (this.wordSyncRafId !== null) return;

    const tick = () => {
      this.wordSyncRafId = null;
      if (
        !this.wordSyncEnabled ||
        !this.audio ||
        this.audio.paused ||
        !this.activeStepSegments ||
        !this.activeStepSegContext ||
        this.snapshot.status !== 'playing'
      ) {
        return;
      }

      const timeMs = this.audio.currentTime * 1000;
      const wordIdx = this.findWordIndexForTimeMs(this.activeStepSegments, timeMs);
      const ctx = this.activeStepSegContext;

      this.emitWordSync({
        activeWordIndex: wordIdx,
        surah: ctx.surah,
        ayah: ctx.ayah,
        phase: ctx.phase,
        qulWordCount: ctx.qulWordCount,
        reciterKey: ctx.reciterKey,
      });

      this.wordSyncRafId = window.requestAnimationFrame(tick);
    };

    this.wordSyncRafId = window.requestAnimationFrame(tick);
  }

  private prepareWordSyncForStep(verse: CombinedVerse, step: PlaybackStep, session: number): void {
    this.stopWordSyncLoop();
    this.activeStepSegments = null;
    this.activeStepSegContext = null;
    this.lastMatchedSegmentIdx = 0;

    if (!this.wordSyncEnabled || (step.phase !== 'ar' && step.phase !== 'besmele')) {
      this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
      this.setWordSyncActiveFlag(false);
      return;
    }

    const arabicSource = this.resolveArabicSource();
    const bindSegments = (segMeta: SegMetaFile | null) => {
      if (session !== this.playSessionId || !this.wordSyncEnabled) return;
      if (!segMeta) {
        this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
        this.setWordSyncActiveFlag(false);
        return;
      }

      const reciterKey =
        step.syncedReciterKey ?? resolveSyncedReciterKey(arabicSource, segMeta);
      if (!reciterKey) {
        this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
        this.setWordSyncActiveFlag(false);
        return;
      }

      const reciterMeta = segMeta.reciters[reciterKey];
      if (!reciterMeta) {
        this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
        this.setWordSyncActiveFlag(false);
        return;
      }

      if (step.phase === 'besmele') {
        const besmeleSegs = Array.isArray(reciterMeta.besmele) ? reciterMeta.besmele : [];
        if (besmeleSegs.length === 0) {
          this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
          this.setWordSyncActiveFlag(false);
          return;
        }
        this.activeStepSegments = besmeleSegs;
        this.activeStepSegContext = {
          surah: verse.surah,
          ayah: verse.ayah,
          phase: 'besmele',
          reciterKey,
          qulWordCount: this.getQulWordCount(1, 1) ?? besmeleSegs.length,
        };
        this.lastMatchedSegmentIdx = 0;
        this.setWordSyncActiveFlag(true);
        if (this.snapshot.status === 'playing') {
          this.startWordSyncLoop();
        }
        return;
      }

      // phase === 'ar'
      const cacheKey = `${reciterKey}:${verse.surah}`;
      const applySurahFile = (surahFile: SegSurahFile | null) => {
        if (session !== this.playSessionId || !this.wordSyncEnabled) return;
        const ayahSegs = surahFile?.v?.[String(verse.ayah)];
        if (!Array.isArray(ayahSegs) || ayahSegs.length === 0) {
          this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
          this.setWordSyncActiveFlag(false);
          return;
        }
        this.activeStepSegments = ayahSegs;
        this.activeStepSegContext = {
          surah: verse.surah,
          ayah: verse.ayah,
          phase: 'ar',
          reciterKey,
          qulWordCount: this.getQulWordCount(verse.surah, verse.ayah),
        };
        this.lastMatchedSegmentIdx = 0;
        this.setWordSyncActiveFlag(true);
        if (this.snapshot.status === 'playing') {
          this.startWordSyncLoop();
        }
      };

      if (this.segSurahCache.has(cacheKey)) {
        applySurahFile(this.segSurahCache.get(cacheKey) ?? null);
      } else {
        this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
        this.setWordSyncActiveFlag(false);
        void this.ensureSegSurahLoaded(reciterKey, verse.surah).then(applySurahFile);
      }
    };

    if (this.segMeta) {
      bindSegments(this.segMeta);
    } else {
      this.emitWordSync(INITIAL_WORD_SYNC_SNAPSHOT);
      this.setWordSyncActiveFlag(false);
      void this.ensureSegMetaLoaded().then(bindSegments);
    }
  }

  public setWordSyncEnabled(enabled: boolean): void {
    if (this.wordSyncEnabled === enabled) return;
    this.wordSyncEnabled = enabled;

    if (!enabled) {
      this.clearWordSyncState();
      return;
    }

    // Açıldığında aktif çalan bir Arapça/Besmele adımı varsa anında senkronu başlat
    const step = this.steps[this.currentStepIndex];
    const verse = step ? this.verses[step.verseIndex] : null;
    if (verse && step && (step.phase === 'ar' || step.phase === 'besmele')) {
      this.prepareWordSyncForStep(verse, step, this.playSessionId);
    } else {
      void this.ensureSegMetaLoaded();
    }
  }

  private emit(patch: Partial<AudioQueueSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    const isActivelyPlaying =
      this.snapshot.status === 'playing' || this.snapshot.status === 'loading';
    wakeLockService.setContinuousReason('audio', isActivelyPlaying);
    for (const listener of this.listeners) {
      listener();
    }
  }

  public registerNextPageProvider(provider: NextPageProvider | null): void {
    this.nextPageProvider = provider;
  }

  /**
   * Karşılıklı kilit (Mutual Exclusion): Ezber ses motoru gibi dış ses motorları kendilerini kaydeder.
   * Bu oynatıcı başladığında veya devam ettiğinde kayıtlı tüm dış ses motorları otomatik duraklatılır.
   */
  public registerExternalAudioPauser(pauser: () => void): () => void {
    this.externalAudioPausers.add(pauser);
    return () => {
      this.externalAudioPausers.delete(pauser);
    };
  }

  private pauseExternalAudioEngines(): void {
    for (const pauseFn of this.externalAudioPausers) {
      try {
        pauseFn();
      } catch {
        // ignore external pause errors
      }
    }
  }

  private getSurahName(surahNo: number): string {
    const found = this.meta?.surahs.find((s) => s.no === surahNo);
    return found ? found.nameTr : `${surahNo}. Sure`;
  }

  private getEffectiveRepeatCount(): RepeatCountOption {
    return this.repeatCountOverride ?? this.prefs.repeatCount;
  }

  private getEffectiveQueueLoop(): QueueLoopOption {
    return this.queueLoopOverride ?? this.prefs.queueLoop ?? 1;
  }

  private getFormattedQueueTitle(): string {
    if (this.atomicSegments.length > 0 && this.totalParentSegments > 1) {
      const seg = this.atomicSegments[this.currentAtomicIdx];
      const partNo = (seg?.parentIndex ?? 0) + 1;
      const base = this.queueBaseTitle || 'Çalma Listesi';
      return `${base} (${partNo}/${this.totalParentSegments})`;
    }
    return this.queueBaseTitle;
  }

  private resolveArabicSource(): ReciterDefinition {
    const preferred = this.prefs.arabicReciterId || this.prefs.arabicAudioSource || 'maher_al_muaiqly';
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
    return sources[0] ?? null;
  }

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

  // ==========================================================================
  // Media Session API (Kilit Ekranı & Kulaklık Kontrolü)
  // ==========================================================================

  private updateMediaSession(verse: CombinedVerse, step: PlaybackStep): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      const ms = navigator.mediaSession;
      if (typeof MediaMetadata !== 'undefined') {
        const surahName = this.getSurahName(verse.surah);
        const title =
          step.phase === 'besmele'
            ? `Besmele · ${surahName}`
            : `${surahName} · ${verse.ayah}. Ayet`;
        const album = this.getFormattedQueueTitle() || "Muallimun Kur'an & Meal";
        const icon192 = getIconUrl('icon-192.png');
        const icon512 = getIconUrl('icon-512.png');
        ms.metadata = new MediaMetadata({
          title,
          artist: step.reciterLabel || "Muallimun Kur'an",
          album,
          artwork: [
            { src: icon192, sizes: '192x192', type: 'image/png' },
            { src: icon512, sizes: '512x512', type: 'image/png' },
          ],
        });
      }
      ms.setActionHandler('play', () => {
        if (this.snapshot.status === 'paused' || this.snapshot.status === 'error') {
          this.togglePlayPause();
        }
      });
      ms.setActionHandler('pause', () => {
        this.pause();
      });
      ms.setActionHandler('previoustrack', () => {
        this.prevVerse();
      });
      ms.setActionHandler('nexttrack', () => {
        this.nextVerse();
      });
    } catch {
      // Desteklemeyen tarayıcı/WebView ortamlarında sessizce geç
    }
  }

  private setMediaPlaybackState(state: 'none' | 'paused' | 'playing'): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // ignore
    }
  }

  // ==========================================================================
  // Segment Genişletme & Tembel (Lazy) Veri Yükleme
  // ==========================================================================

  private expandPlaylistItemsToAtomic(items: AudioPlaylistItem[], meta: MetaData): AtomicSegment[] {
    const out: AtomicSegment[] = [];
    const bounds = getPageBounds(meta);

    items.forEach((item, parentIndex) => {
      if (item.type === 'surah' && typeof item.surah === 'number') {
        const sNo = Math.max(1, Math.min(114, item.surah));
        out.push({
          kind: 'surah_slice',
          surah: sNo,
          parentIndex,
          parentLabel: item.label || this.getSurahName(sNo),
        });
        return;
      }

      if (item.type === 'ayah_range' && typeof item.surah === 'number') {
        const sNo = Math.max(1, Math.min(114, item.surah));
        const sMeta = meta.surahs.find((s) => s.no === sNo);
        const maxAyah = sMeta?.ayahCount ?? 286;
        const startA = Math.max(1, Math.min(maxAyah, item.startAyah ?? 1));
        const endA = Math.max(startA, Math.min(maxAyah, item.endAyah ?? startA));
        out.push({
          kind: 'surah_slice',
          surah: sNo,
          startAyah: startA,
          endAyah: endA,
          parentIndex,
          parentLabel: item.label || `${this.getSurahName(sNo)} ${startA}-${endA}`,
        });
        return;
      }

      if (item.type === 'page_range') {
        const startP = Math.max(bounds.minPage, Math.min(bounds.maxPage, item.startPage ?? 1));
        const endP = Math.max(startP, Math.min(bounds.maxPage, item.endPage ?? startP));
        for (let p = startP; p <= endP; p += 1) {
          out.push({
            kind: 'page',
            pageNo: p,
            parentIndex,
            parentLabel: item.label || `Sayfa ${p}`,
          });
        }
        return;
      }

      if (item.type === 'juz' && typeof item.juz === 'number') {
        const juzNo = Math.max(1, Math.min(30, item.juz));
        const juzMeta = meta.juzs.find((j) => j.no === juzNo);
        if (juzMeta) {
          const startS = juzMeta.start.s;
          const startA = juzMeta.start.a;
          const endS = juzMeta.end.s;
          const endA = juzMeta.end.a;
          for (let sNo = startS; sNo <= endS; sNo += 1) {
            const sMeta = meta.surahs.find((s) => s.no === sNo);
            const fromA = sNo === startS ? startA : 1;
            const toA = sNo === endS ? endA : (sMeta?.ayahCount ?? 286);
            out.push({
              kind: 'surah_slice',
              surah: sNo,
              startAyah: fromA,
              endAyah: toA,
              parentIndex,
              parentLabel: item.label || `${juzNo}. Cüz`,
            });
          }
        }
      }
    });

    return out;
  }

  private async loadAtomicSegmentVerses(seg: AtomicSegment): Promise<CombinedVerse[]> {
    if (seg.kind === 'page' && typeof seg.pageNo === 'number') {
      const bundle = await dataService.getPageBundle(seg.pageNo);
      return bundle.verses;
    }

    if (seg.kind === 'surah_slice' && typeof seg.surah === 'number') {
      const bundle = await dataService.getSurahBundle(seg.surah);
      if (typeof seg.startAyah === 'number' || typeof seg.endAyah === 'number') {
        const startA = seg.startAyah ?? 1;
        const endA = seg.endAyah ?? Number.MAX_SAFE_INTEGER;
        return bundle.verses.filter((v) => v.ayah >= startA && v.ayah <= endA);
      }
      return bundle.verses;
    }

    return [];
  }

  private prewarmUpcomingSegment(): void {
    if (this.atomicSegments.length > 0) {
      const remainingInCurrent = this.verses.length - 1 - this.currentVerseIndex;
      if (remainingInCurrent <= 2) {
        let nextSegIdx = this.currentAtomicIdx + 1;
        if (nextSegIdx >= this.atomicSegments.length) {
          const loop = this.getEffectiveQueueLoop();
          if (loop === 'infinite' || this.currentQueueRound < loop) {
            nextSegIdx = 0;
          }
        }
        const upcoming = this.atomicSegments[nextSegIdx];
        if (upcoming && nextSegIdx !== this.currentAtomicIdx) {
          this.loadAtomicSegmentVerses(upcoming).catch(() => {});
        }
      }
      return;
    }

    // Normal Mushaf / Sure okumasında da sonraki sayfayı/sureyi önceden ısıt
    if (!this.meta || this.singleAyahOnly) return;
    const remaining = this.verses.length - 1 - this.currentVerseIndex;
    if (remaining <= 1 && this.getEffectiveQueueLoop() === 1) {
      const lastVerse = this.verses[this.verses.length - 1];
      if (!lastVerse) return;
      if (this.context === 'page') {
        const bounds = getPageBounds(this.meta);
        if (lastVerse.page + 1 <= bounds.maxPage) {
          dataService.getPageBundle(lastVerse.page + 1).catch(() => {});
        }
      } else if (this.context === 'surah' && lastVerse.surah < 114) {
        dataService.getSurahBundle(lastVerse.surah + 1).catch(() => {});
      }
    }
  }

  // ==========================================================================
  // Adım İnşası (Besmele, Arapça, Meal, Ayet Tekrarı)
  // ==========================================================================

  private buildStepsForVerse(
    verseIndex: number,
    includeBesmeleIfApplicable: boolean,
    repeatStartNumber = 1,
  ): PlaybackStep[] {
    const verse = this.verses[verseIndex];
    if (!verse || !this.manifest || !this.meta) return [];

    const mode = this.getEffectiveMode();
    const arabicSource = this.resolveArabicSource();
    const mealSource = this.resolveMealSource();
    const numericRepeatCount = this.getEffectiveRepeatCount();
    const steps: PlaybackStep[] = [];

    if (mode === 'meal' && !mealSource) {
      return [];
    }

    const syncedReciterKey =
      this.wordSyncEnabled && arabicSource
        ? resolveSyncedReciterKey(arabicSource, this.segMeta)
        : null;
    const syncedTemplate =
      syncedReciterKey && this.segMeta?.reciters[syncedReciterKey]?.audioUrlTemplate
        ? this.segMeta.reciters[syncedReciterKey].audioUrlTemplate
        : null;

    const buildSyncedArabicUrls = (surahNo: number, ayahNo: number): string[] => {
      const baseUrls = this.buildAudioUrlsForSource(arabicSource, surahNo, ayahNo);
      if (syncedTemplate) {
        const primarySyncedUrl = buildTemplateAudioUrl(syncedTemplate, surahNo, ayahNo);
        return dedupeUrls([primarySyncedUrl, ...baseUrls]);
      }
      return baseUrls;
    };

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
            repeatIndex: repeatStartNumber,
          });
        }
      } else if (arabicSource) {
        const arBesmeleUrls = buildSyncedArabicUrls(1, 1);
        if (arBesmeleUrls.length > 0) {
          steps.push({
            phase: 'besmele',
            sourceKey: arabicSource.id,
            reciterLabel: arabicSource.shortLabel,
            urls: arBesmeleUrls,
            verseIndex,
            repeatIndex: repeatStartNumber,
            syncedReciterKey,
          });
        }
      }
    }

    const activeMealObj =
      mealSource?.mealId === 'm2' || mealSource?.id === 'dib' ? verse.m2 : verse.m1;
    const mg = activeMealObj?.mg;
    const isMergedContinuation = Boolean(mg && verse.ayah > mg[0]);

    const arUrls = buildSyncedArabicUrls(verse.surah, verse.ayah);
    const primaryMealUrls = this.buildAudioUrlsForSource(mealSource, verse.surah, verse.ayah);
    const mergedStartMealUrls =
      mealSource && mg && mg[0] !== verse.ayah
        ? this.buildAudioUrlsForSource(mealSource, verse.surah, mg[0])
        : [];
    const combinedMealUrls = dedupeUrls([...primaryMealUrls, ...mergedStartMealUrls]);

    for (let rep = 1; rep <= numericRepeatCount; rep += 1) {
      if ((mode === 'ar' || mode === 'ar_then_meal') && arabicSource && arUrls.length > 0) {
        steps.push({
          phase: 'ar',
          sourceKey: arabicSource.id,
          reciterLabel: arabicSource.shortLabel,
          urls: arUrls,
          verseIndex,
          repeatIndex: rep,
          syncedReciterKey,
        });
      }

      const shouldPlayMeal =
        (mode === 'meal' || mode === 'ar_then_meal') && Boolean(mealSource)
          ? this.singleAyahOnly || !isMergedContinuation || this.verses.length === 1
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

  private teardownAudioElement(preserveWordSyncFlag = false): void {
    this.clearSkipTimer();
    this.clearLoadTimer();
    this.clearWordSyncState(preserveWordSyncFlag);

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

    this.prewarmUpcomingSegment();

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
    const loop = this.getEffectiveQueueLoop();
    const hasMoreLoopRounds = loop === 'infinite' || this.currentQueueRound < loop;

    const canGoPrev =
      this.currentVerseIndex > 0 ||
      (this.atomicSegments.length > 0 && this.currentAtomicIdx > 0);

    let canGoNext = this.currentVerseIndex < this.verses.length - 1;
    if (!canGoNext) {
      if (this.atomicSegments.length > 0) {
        canGoNext = this.currentAtomicIdx < this.atomicSegments.length - 1 || hasMoreLoopRounds;
      } else if (hasMoreLoopRounds) {
        canGoNext = true;
      } else if (!this.singleAyahOnly && this.meta) {
        const lastVerse = this.verses[this.verses.length - 1];
        if (this.context === 'page' && lastVerse) {
          canGoNext = lastVerse.page < getPageBounds(this.meta).maxPage;
        } else if (this.context === 'surah' && lastVerse) {
          canGoNext = lastVerse.surah < 114;
        }
      }
    }

    return { canGoPrev, canGoNext };
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

    this.teardownAudioElement(true);

    const nav = this.updateNavigationAvailability();
    const segParentIdx =
      this.atomicSegments.length > 0
        ? (this.atomicSegments[this.currentAtomicIdx]?.parentIndex ?? 0)
        : 0;

    this.emit({
      status: 'loading',
      isVisible: true,
      context: this.context,
      contextKey: this.contextKey,
      queueTitle: this.getFormattedQueueTitle(),
      currentSegmentIndex: segParentIdx,
      totalSegments: this.totalParentSegments,
      currentQueueRound: this.currentQueueRound,
      totalQueueRounds: this.getEffectiveQueueLoop(),
      currentSurah: verse.surah,
      currentSurahName: this.getSurahName(verse.surah),
      currentAyah: verse.ayah,
      currentPage: verse.page,
      currentAyahId: verse.id,
      activePhase: step.phase,
      activeSourceKey: step.sourceKey,
      activeReciterLabel: step.reciterLabel,
      currentRepeat: step.repeatIndex,
      totalRepeats: this.getEffectiveRepeatCount(),
      canGoPrev: nav.canGoPrev,
      canGoNext: nav.canGoNext,
      errorMessage: null,
      infoMessage: this.activeInfoNotice,
      missingMealAudio: false,
      ...(step.phase === 'meal' || !this.wordSyncEnabled ? { isWordSyncActive: false } : {}),
    });

    this.updateMediaSession(verse, step);
    this.prepareWordSyncForStep(verse, step, session);

    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      this.emit({
        status: 'error',
        errorMessage: 'Bu tarayıcı ses oynatmayı desteklemiyor.',
      });
      return;
    }

    // Archive.org / EveryAyah yönlendirmelerinde CORS engeli olmaması için crossOrigin KULLANILMAZ
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
        this.setMediaPlaybackState('playing');
        this.startWordSyncLoop();
        this.preloadNextUrl();
      },
      { signal },
    );

    audio.addEventListener(
      'waiting',
      () => {
        if (session !== this.playSessionId) return;
        this.stopWordSyncLoop();
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
        this.clearWordSyncState(true);
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
          this.setMediaPlaybackState('paused');
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
      this.setMediaPlaybackState('paused');
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

  private async loadAndPlayAtomicSegment(
    segIdx: number,
    session: number,
    startFromLastVerse = false,
  ): Promise<boolean> {
    const seg = this.atomicSegments[segIdx];
    if (!seg) return false;

    this.emit({ status: 'loading' });
    try {
      const verses = await this.loadAtomicSegmentVerses(seg);
      if (session !== this.playSessionId) return false;
      if (verses.length === 0) return false;

      this.currentAtomicIdx = segIdx;
      this.verses = verses;

      if (startFromLastVerse) {
        for (let i = verses.length - 1; i >= 0; i -= 1) {
          const built = this.buildStepsForVerse(i, true);
          if (built.length > 0) {
            this.currentVerseIndex = i;
            this.steps = built;
            this.currentStepIndex = 0;
            this.playCurrentStep(0);
            return true;
          }
        }
      } else {
        for (let i = 0; i < verses.length; i += 1) {
          const built = this.buildStepsForVerse(i, true);
          if (built.length > 0) {
            this.currentVerseIndex = i;
            this.steps = built;
            this.currentStepIndex = 0;
            this.playCurrentStep(0);
            return true;
          }
        }
      }
    } catch {
      // Hata durumunda sessizce false dön
    }
    return false;
  }

  private async advanceToNextVerse(forceSkipInfiniteAyah = false): Promise<void> {
    const session = this.playSessionId;
    const loop = this.getEffectiveQueueLoop();
    const canLoopAgain = loop === 'infinite' || this.currentQueueRound < loop;

    // 1. Tek ayet modu (sadece 1 ayet oynatılıyorsa)
    if (this.singleAyahOnly && !forceSkipInfiniteAyah) {
      if (canLoopAgain && this.verses.length > 0) {
        this.currentQueueRound += 1;
        const restartSteps = this.buildStepsForVerse(this.currentVerseIndex, false);
        if (restartSteps.length > 0) {
          this.steps = restartSteps;
          this.currentStepIndex = 0;
          this.playCurrentStep(0);
          return;
        }
      }
      this.teardownAudioElement();
      this.setMediaPlaybackState('paused');
      this.emit({ status: 'paused', activePhase: null });
      return;
    }

    // 2. Mevcut verse listesinde sıradaki ayete geç
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

    // 3. Segment tabanlı kuyruk (Çalma listesi / Cüz / Sayfa aralığı / Ayet aralığı)
    if (this.atomicSegments.length > 0) {
      for (let segIdx = this.currentAtomicIdx + 1; segIdx < this.atomicSegments.length; segIdx += 1) {
        const loaded = await this.loadAndPlayAtomicSegment(segIdx, session, false);
        if (session !== this.playSessionId) return;
        if (loaded) return;
      }

      // Tüm segmentler bitti -> Liste döngüsü (QueueLoop) kontrolü
      if (canLoopAgain) {
        this.currentQueueRound += 1;
        for (let segIdx = 0; segIdx < this.atomicSegments.length; segIdx += 1) {
          const loaded = await this.loadAndPlayAtomicSegment(segIdx, session, false);
          if (session !== this.playSessionId) return;
          if (loaded) return;
        }
      }

      this.teardownAudioElement();
      this.setMediaPlaybackState('paused');
      this.emit({ status: 'paused', activePhase: null });
      return;
    }

    // 4. Normal Okuma Kuyruğunda Bölüm Döngüsü aktifse (2x..10x, ∞) mevcut sayfa/sureyi baştan döndür
    if (canLoopAgain && this.verses.length > 0) {
      this.currentQueueRound += 1;
      for (let i = 0; i < this.verses.length; i += 1) {
        const restartSteps = this.buildStepsForVerse(i, true);
        if (restartSteps.length > 0) {
          this.currentVerseIndex = i;
          this.steps = restartSteps;
          this.currentStepIndex = 0;
          this.playCurrentStep(0);
          return;
        }
      }
    }

    // 5. Sekmeden Bağımsız Mushaf Sayfa İlerlemesi (queueLoop === 1)
    if (this.context === 'page' && this.meta && this.verses.length > 0) {
      const lastVerse = this.verses[this.verses.length - 1];
      const nextPageNo = lastVerse.page + 1;
      const bounds = getPageBounds(this.meta);

      if (nextPageNo <= bounds.maxPage) {
        this.emit({ status: 'loading' });
        try {
          let nextPageData: { verses: CombinedVerse[]; contextKey: string } | null = null;
          if (this.nextPageProvider) {
            nextPageData = await this.nextPageProvider(nextPageNo);
          } else {
            // StudyPage kapalı olsa bile (Ana Sayfa / Ezber sekmesindeyken) doğrudan dataService ile devam et
            const bundle = await dataService.getPageBundle(nextPageNo);
            if (bundle.verses.length > 0) {
              nextPageData = {
                verses: bundle.verses,
                contextKey: `page:${bundle.pageNo}`,
              };
            }
          }

          if (session !== this.playSessionId) return;

          if (nextPageData && nextPageData.verses.length > 0) {
            this.verses = nextPageData.verses;
            this.contextKey = nextPageData.contextKey;
            this.queueBaseTitle = `Sayfa ${nextPageNo}`;
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
    }

    // 6. Sekmeden Bağımsız Sure İlerlemesi (queueLoop === 1)
    if (this.context === 'surah' && this.meta && this.verses.length > 0) {
      const lastVerse = this.verses[this.verses.length - 1];
      const nextSurahNo = lastVerse.surah + 1;
      if (nextSurahNo <= 114) {
        this.emit({ status: 'loading' });
        try {
          const nextBundle = await dataService.getSurahBundle(nextSurahNo);
          if (session !== this.playSessionId) return;
          if (nextBundle.verses.length > 0) {
            this.verses = nextBundle.verses;
            this.contextKey = `surah:${nextSurahNo}`;
            this.queueBaseTitle = nextBundle.surahMeta.nameTr;
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
          // Sonraki sure yüklenemezse sessizce duraklat
        }
      }
    }

    this.teardownAudioElement();
    this.setMediaPlaybackState('paused');
    this.emit({ status: 'paused', activePhase: null });
  }

  private emitMissingMealAudioNotice(verse: CombinedVerse): void {
    const nav = this.updateNavigationAvailability();
    this.teardownAudioElement();
    this.setMediaPlaybackState('paused');
    this.emit({
      status: 'paused',
      isVisible: true,
      context: this.context,
      contextKey: this.contextKey,
      queueTitle: this.getFormattedQueueTitle(),
      currentSegmentIndex: 0,
      totalSegments: this.totalParentSegments,
      currentQueueRound: this.currentQueueRound,
      totalQueueRounds: this.getEffectiveQueueLoop(),
      currentSurah: verse.surah,
      currentSurahName: this.getSurahName(verse.surah),
      currentAyah: verse.ayah,
      currentPage: verse.page,
      currentAyahId: verse.id,
      activePhase: null,
      activeSourceKey: null,
      activeReciterLabel: '',
      currentRepeat: 1,
      totalRepeats: this.getEffectiveRepeatCount(),
      canGoPrev: nav.canGoPrev,
      canGoNext: nav.canGoNext,
      errorMessage:
        'Seçili mealin sesli kaydı bulunmuyor. Aşağıdan sesli bir meal (TDV / DİB) veya Arapça tilavet seçebilirsiniz.',
      infoMessage: null,
      missingMealAudio: true,
    });
  }

  // ==========================================================================
  // Kuyruk Başlatma API'leri
  // ==========================================================================

  public startQueue(options: StartQueueOptions): void {
    this.pauseExternalAudioEngines();
    this.stopPreview();
    this.playSessionId += 1;
    this.consecutiveFailures = 0;
    this.teardownAudioElement();

    this.atomicSegments = [];
    this.currentAtomicIdx = 0;
    this.totalParentSegments = 1;
    this.currentQueueRound = 1;
    this.queueLoopOverride = options.queueLoopOverride;
    this.repeatCountOverride = options.repeatCountOverride;

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
    this.queueBaseTitle =
      options.queueTitle ??
      (options.context === 'page'
        ? `Sayfa ${targetVerse.page}`
        : options.singleAyahOnly
          ? `${this.getSurahName(targetVerse.surah)} ${targetVerse.ayah}. Ayet`
          : this.getSurahName(targetVerse.surah));

    const effectiveMode = this.getEffectiveMode();
    const resolvedMeal = this.resolveMealSource();

    if (effectiveMode === 'meal' && !resolvedMeal) {
      this.steps = [];
      this.emitMissingMealAudioNotice(targetVerse);
      return;
    }

    if (effectiveMode === 'ar_then_meal' && !resolvedMeal) {
      this.activeInfoNotice =
        'Seçili mealin ses kaydı olmadığı için Arapça tilavet oynatılıyor.';
    }

    let builtSteps = this.buildStepsForVerse(targetIndex, true);

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

  /**
   * Çoklu segmentli (Playlist / Cüz / Sayfa Aralığı / Ayet Aralığı / Çoklu Sure)
   * tembel yüklemeli dinleme kuyruğunu başlatır.
   */
  public async startSegmentQueue(options: StartSegmentQueueOptions): Promise<void> {
    this.pauseExternalAudioEngines();
    this.stopPreview();
    this.playSessionId += 1;
    const session = this.playSessionId;
    this.consecutiveFailures = 0;
    this.teardownAudioElement();

    this.manifest = options.manifest;
    this.meta = options.meta;
    this.prefs = { ...options.prefs };
    this.singleAyahOnly = false;
    this.activeModeOverride = options.modeOverride;
    this.queueLoopOverride = options.queueLoopOverride;
    this.repeatCountOverride = options.repeatCountOverride;
    this.context = options.context ?? 'playlist';
    this.contextKey = options.contextKey ?? `playlist:${Date.now()}`;
    this.queueBaseTitle = options.title;
    this.currentQueueRound = 1;
    this.activeInfoNotice = null;

    const expanded = this.expandPlaylistItemsToAtomic(options.items, options.meta);
    if (expanded.length === 0) {
      this.emit({
        status: 'paused',
        isVisible: true,
        errorMessage: 'Çalma listesinde oynatılacak geçerli bir bölüm bulunamadı.',
      });
      return;
    }

    this.atomicSegments = expanded;
    this.totalParentSegments = Math.max(1, options.items.length);

    const startParentIdx = Math.max(0, options.startItemIndex ?? 0);
    const firstAtomicIdx = Math.max(
      0,
      expanded.findIndex((seg) => seg.parentIndex >= startParentIdx),
    );
    this.currentAtomicIdx = firstAtomicIdx;

    const effectiveMode = this.getEffectiveMode();
    const resolvedMeal = this.resolveMealSource();

    if (effectiveMode === 'ar_then_meal' && !resolvedMeal) {
      this.activeInfoNotice =
        'Seçili mealin ses kaydı olmadığı için Arapça tilavet oynatılıyor.';
    }

    this.emit({
      status: 'loading',
      isVisible: true,
      context: this.context,
      contextKey: this.contextKey,
      queueTitle: this.getFormattedQueueTitle(),
      currentSegmentIndex: expanded[firstAtomicIdx]?.parentIndex ?? 0,
      totalSegments: this.totalParentSegments,
      currentQueueRound: 1,
      totalQueueRounds: this.getEffectiveQueueLoop(),
      totalRepeats: this.getEffectiveRepeatCount(),
      errorMessage: null,
      infoMessage: this.activeInfoNotice,
      missingMealAudio: false,
    });

    for (let idx = firstAtomicIdx; idx < expanded.length; idx += 1) {
      const seg = expanded[idx];
      try {
        const verses = await this.loadAtomicSegmentVerses(seg);
        if (session !== this.playSessionId) return;
        if (verses.length === 0) continue;

        this.currentAtomicIdx = idx;
        this.verses = verses;

        if (effectiveMode === 'meal' && !resolvedMeal) {
          this.steps = [];
          this.emitMissingMealAudioNotice(verses[0]);
          return;
        }

        for (let vIdx = 0; vIdx < verses.length; vIdx += 1) {
          let built = this.buildStepsForVerse(vIdx, true);
          if (built.length === 0 && verses.length === 1) {
            const prevSingle: boolean = this.singleAyahOnly;
            this.singleAyahOnly = true;
            built = this.buildStepsForVerse(vIdx, true);
            this.singleAyahOnly = prevSingle;
          }
          if (built.length > 0) {
            this.currentVerseIndex = vIdx;
            this.steps = built;
            this.currentStepIndex = 0;
            this.playCurrentStep(0);
            return;
          }
        }
      } catch {
        // Sıradaki segmente devam et
      }
    }

    if (session === this.playSessionId) {
      this.emit({
        status: 'paused',
        isVisible: true,
        errorMessage: 'Seçili kapsamın ses verisi yüklenemedi.',
      });
    }
  }

  public togglePlayPause(): void {
    if (!this.audio) {
      if (this.verses.length > 0 && this.steps.length > 0) {
        this.pauseExternalAudioEngines();
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
      this.stopWordSyncLoop();
      try {
        this.audio.pause();
      } catch {
        // ignore
      }
      this.setMediaPlaybackState('paused');
      this.emit({ status: 'paused' });
    } else if (this.snapshot.status === 'paused' || this.snapshot.status === 'error') {
      this.pauseExternalAudioEngines();
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
      this.setMediaPlaybackState('playing');
      this.emit({ status: 'playing', errorMessage: null });
      this.startWordSyncLoop();
    }
  }

  public pause(): void {
    if (this.snapshot.status === 'playing' || this.snapshot.status === 'loading') {
      this.clearSkipTimer();
      this.clearLoadTimer();
      this.stopWordSyncLoop();
      try {
        this.audio?.pause();
      } catch {
        // ignore
      }
      this.setMediaPlaybackState('paused');
      this.emit({ status: 'paused' });
    }
  }

  public nextVerse(): void {
    if (this.verses.length === 0) return;
    this.pauseExternalAudioEngines();
    this.stopPreview();
    this.playSessionId += 1;
    this.consecutiveFailures = 0;
    void this.advanceToNextVerse(true);
  }

  public prevVerse(): void {
    if (this.verses.length === 0) return;
    this.pauseExternalAudioEngines();
    this.stopPreview();
    this.playSessionId += 1;
    const session = this.playSessionId;
    this.consecutiveFailures = 0;

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

    // Önceki segmente geri dön (playlist / cüz / sayfa aralığı)
    if (this.atomicSegments.length > 0 && this.currentAtomicIdx > 0) {
      void (async () => {
        for (let segIdx = this.currentAtomicIdx - 1; segIdx >= 0; segIdx -= 1) {
          const loaded = await this.loadAndPlayAtomicSegment(segIdx, session, true);
          if (session !== this.playSessionId) return;
          if (loaded) return;
        }
      })();
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

  public previewReciter(reciter: ReciterDefinition): void {
    if (
      this.snapshot.previewReciterId === reciter.id &&
      (this.snapshot.previewStatus === 'playing' || this.snapshot.previewStatus === 'loading')
    ) {
      this.stopPreview();
      return;
    }

    this.pauseExternalAudioEngines();
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
    if (prevPrefs.repeatCount !== nextPrefs.repeatCount) {
      this.repeatCountOverride = undefined;
    }
    if (prevPrefs.queueLoop !== nextPrefs.queueLoop) {
      this.queueLoopOverride = undefined;
    }

    if (this.audio) {
      this.audio.playbackRate = nextPrefs.playbackRate;
    }

    const prevReciterId = prevPrefs.arabicReciterId || prevPrefs.arabicAudioSource;
    const nextReciterId = nextPrefs.arabicReciterId || nextPrefs.arabicAudioSource;
    const reciterChanged = prevReciterId !== nextReciterId;

    const queueLoopChanged = prevPrefs.queueLoop !== nextPrefs.queueLoop;

    if (queueLoopChanged && this.snapshot.isVisible) {
      const nav = this.updateNavigationAvailability();
      this.emit({
        totalQueueRounds: this.getEffectiveQueueLoop(),
        canGoPrev: nav.canGoPrev,
        canGoNext: nav.canGoNext,
      });
    }

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
      const nav = this.updateNavigationAvailability();

      if (!wasPlayingOrWaitingRecovery) {
        this.teardownAudioElement();
      }

      this.emit({
        totalRepeats: this.getEffectiveRepeatCount(),
        currentRepeat: 1,
        totalQueueRounds: this.getEffectiveQueueLoop(),
        canGoPrev: nav.canGoPrev,
        canGoNext: nav.canGoNext,
        missingMealAudio: false,
        infoMessage: this.activeInfoNotice,
        activeSourceKey: firstStep?.sourceKey ?? this.snapshot.activeSourceKey,
        activeReciterLabel: firstStep?.reciterLabel ?? this.snapshot.activeReciterLabel,
        activePhase: firstStep?.phase ?? this.snapshot.activePhase,
      });

      if (wasPlayingOrWaitingRecovery && this.steps.length > 0) {
        this.pauseExternalAudioEngines();
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
    this.atomicSegments = [];
    this.currentAtomicIdx = 0;
    this.totalParentSegments = 1;
    this.queueBaseTitle = '';
    this.currentQueueRound = 1;
    this.queueLoopOverride = undefined;
    this.repeatCountOverride = undefined;
    this.currentVerseIndex = 0;
    this.currentStepIndex = 0;
    this.context = null;
    this.contextKey = null;
    this.singleAyahOnly = false;
    this.activeModeOverride = undefined;
    this.activeInfoNotice = null;
    this.setMediaPlaybackState('none');
    this.emit({
      ...INITIAL_SNAPSHOT,
      isVisible: !hideBar,
    });
  }
}

export const audioQueueService = new AudioQueueService();
