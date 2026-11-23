import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  HeartHandshake,
  Lightbulb,
  Loader2,
  MessageSquareHeart,
  Send,
  ShieldCheck,
  Volume2,
  X,
} from 'lucide-react';
import { findMealById } from '../config/mealsConfig';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { getSurahMap } from '../utils/poolUtils';

const LAST_SENT_STORAGE_KEY = 'muallimun_feedback_last_sent_at';
const CONTACT_MEMORY_STORAGE_KEY = 'muallimun_feedback_contact_v1';
const COOLDOWN_SECONDS = 60;
const MIN_MESSAGE_LEN = 10;
const MAX_MESSAGE_LEN = 3000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface FeedbackCategoryOption {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
  thankYouTitle: string;
  thankYouBody: string;
}

const FEEDBACK_CATEGORIES: readonly FeedbackCategoryOption[] = [
  {
    id: 'Hata / Meal-Hareke-Soru Bildirimi',
    label: 'Hata / Meal-Hareke-Soru Bildirimi',
    shortLabel: 'Hata / Meal / Soru',
    icon: Bug,
    placeholder:
      'Gözlemlediğiniz hatayı, sure/ayet numarasını veya soru detayını kısaca yazabilirsiniz...',
    thankYouTitle: 'Hata Bildiriminiz Ulaştı',
    thankYouBody:
      'Titizliğiniz ve katkınız için teşekkür ederiz. Bildirdiğiniz kayıt incelenerek en kısa sürede düzeltilecektir.',
  },
  {
    id: 'Öneri & Yeni Özellik',
    label: 'Öneri & Yeni Özellik',
    shortLabel: 'Öneri & Özellik',
    icon: Lightbulb,
    placeholder:
      'Okuma, ezber, hatim, fihrist veya sınav deneyimini geliştirecek önerinizi paylaşabilirsiniz...',
    thankYouTitle: 'Öneriniz İçin Teşekkür Ederiz',
    thankYouBody:
      'Görüşleriniz Muallimun Kur’an & Meal platformunun gelecek sürümlerine yön vermektedir.',
  },
  {
    id: 'Ses / Kıraat / Senkron Sorunu',
    label: 'Ses / Kıraat / Senkron Sorunu',
    shortLabel: 'Ses / Kıraat',
    icon: Volume2,
    placeholder:
      'Hangi kurrâda, hangi sure/ayette veya cihazda ses ya da kelime takibi sorunu yaşadığınızı belirtebilirsiniz...',
    thankYouTitle: 'Ses & Kıraat Bildiriminiz Alındı',
    thankYouBody:
      'Ses dosyası ve senkron kaydı kontrol edilecektir. Gerekirse bıraktığınız e-posta üzerinden dönüş yapılacaktır.',
  },
  {
    id: 'Teşekkür & Genel Görüş',
    label: 'Teşekkür & Genel Görüş',
    shortLabel: 'Teşekkür & Görüş',
    icon: HeartHandshake,
    placeholder: 'Platform hakkındaki genel değerlendirme veya dualarınızı paylaşabilirsiniz...',
    thankYouTitle: 'Nazik Mesajınız İçin Teşekkür Ederiz',
    thankYouBody:
      'Güzel temennileriniz ve geri bildiriminiz çalışma şevkimizi artırmaktadır. Hayırlı ve bereketli okumalar dileriz.',
  },
];

const QUICK_CONTEXT_PRESETS: readonly string[] = [
  'Ana Sayfa & Çalışma Masam',
  'Mushaf / Kitap / Kartlar Okuma',
  '30 Cüz Hatim Planlayıcısı',
  'Ezber & Klasik Hafızlık',
  'Fihrist, Defterim & Ayet Notları',
  'Sınav Merkezi & A4 Yazılı Sınav',
  'Eğitsel Oyunlar',
  'Sesli Tilavet & Kurrâ',
];

function readRemainingCooldownSec(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(LAST_SENT_STORAGE_KEY);
    if (!raw) return 0;
    const lastMs = Number(raw);
    if (!Number.isFinite(lastMs) || lastMs <= 0) return 0;
    const elapsedSec = Math.floor((Date.now() - lastMs) / 1000);
    return Math.max(0, COOLDOWN_SECONDS - elapsedSec);
  } catch {
    return 0;
  }
}

function readSavedContact(): { name: string; email: string; remember: boolean } {
  if (typeof window === 'undefined') {
    return { name: '', email: '', remember: false };
  }
  try {
    const raw = window.localStorage.getItem(CONTACT_MEMORY_STORAGE_KEY);
    if (!raw) return { name: '', email: '', remember: false };
    const parsed = JSON.parse(raw) as { name?: unknown; email?: unknown };
    const name = typeof parsed.name === 'string' ? parsed.name.slice(0, 100) : '';
    const email = typeof parsed.email === 'string' ? parsed.email.slice(0, 150) : '';
    return { name, email, remember: Boolean(name || email) };
  } catch {
    return { name: '', email: '', remember: false };
  }
}

export const FeedbackModal: React.FC = () => {
  const {
    isFeedbackModalOpen,
    feedbackSeed,
    closeFeedbackModal,
    activeTab,
    studyPrefs,
    studyProgress,
    settings,
    manifest,
    meta,
  } = useAppStore();

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const primaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );

  const inferredContextRef = useMemo(() => {
    const last = studyProgress.lastRead;
    if (activeTab === 'reader' && last) {
      const surahName = surahMap.get(last.surah)?.nameTr ?? `${last.surah}. Sure`;
      return `${surahName} ${last.ayah}. Ayet · Sayfa ${last.page}`;
    }
    if (activeTab === 'fihrist') return 'Fihrist, Defterim & Ayet Notları';
    if (activeTab === 'memorize') return 'Ezber & Klasik Hafızlık';
    if (activeTab === 'exam' || activeTab === 'mistakes') return 'Sınav Merkezi';
    return 'Ana Sayfa & Çalışma Masam';
  }, [activeTab, studyProgress.lastRead, surahMap]);

  const [category, setCategory] = useState<string>(FEEDBACK_CATEGORIES[0].id);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rememberContact, setRememberContact] = useState(false);
  const [contextRef, setContextRef] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Gizli honeypot alanı
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [cooldownSec, setCooldownSec] = useState<number>(0);

  useBackButtonGuard('feedback_modal', isFeedbackModalOpen, closeFeedbackModal);

  useEffect(() => {
    if (!isFeedbackModalOpen) return;
    return acquireBodyScrollLock();
  }, [isFeedbackModalOpen]);

  // Modal her açıldığında başlangıç değerlerini seed ve aktif ekrana göre hazırla
  useEffect(() => {
    if (!isFeedbackModalOpen) return;
    const saved = readSavedContact();
    setName(saved.name);
    setEmail(saved.email);
    setRememberContact(saved.remember);

    const matchedCategory = feedbackSeed?.category
      ? FEEDBACK_CATEGORIES.find((c) => c.id === feedbackSeed.category)?.id ??
        FEEDBACK_CATEGORIES[0].id
      : FEEDBACK_CATEGORIES[0].id;
    setCategory(matchedCategory);
    setContextRef(feedbackSeed?.contextRef?.trim() || inferredContextRef);
    setMessage(feedbackSeed?.prefillMessage ?? '');
    setWebsite('');
    setErrorMsg(null);
    setIsSubmitted(false);
    setCooldownSec(readRemainingCooldownSec());
  }, [isFeedbackModalOpen, feedbackSeed, inferredContextRef]);

  // 60 saniyelik bekleme sayacını saniyelik azalt
  useEffect(() => {
    if (!isFeedbackModalOpen || cooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSec(readRemainingCooldownSec());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isFeedbackModalOpen, cooldownSec]);

  if (!isFeedbackModalOpen) return null;

  const activeCategoryMeta =
    FEEDBACK_CATEGORIES.find((c) => c.id === category) ?? FEEDBACK_CATEGORIES[0];

  const trimmedMessageLen = message.trim().length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const currentCooldown = readRemainingCooldownSec();
    if (currentCooldown > 0) {
      setCooldownSec(currentCooldown);
      setErrorMsg(
        `Yeni bir mesaj göndermeden önce lütfen ${currentCooldown} saniye bekleyin.`,
      );
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanContext = contextRef.trim();
    const cleanMessage = message.trim();

    if (cleanName.length < 3 || cleanName.length > 100) {
      setErrorMsg('Lütfen adınızı ve soyadınızı en az 3 karakter olacak şekilde girin.');
      return;
    }
    if (!cleanEmail || cleanEmail.length > 150 || !EMAIL_REGEX.test(cleanEmail)) {
      setErrorMsg('Lütfen size dönüş yapabilmemiz için geçerli bir e-posta adresi girin.');
      return;
    }
    if (cleanMessage.length < MIN_MESSAGE_LEN || cleanMessage.length > MAX_MESSAGE_LEN) {
      setErrorMsg(
        `Mesajınız en az ${MIN_MESSAGE_LEN}, en fazla ${MAX_MESSAGE_LEN} karakter olmalıdır.`,
      );
      return;
    }

    // İsteğe bağlı tarayıcı hatırlama tercihini kaydet veya temizle
    try {
      if (rememberContact) {
        window.localStorage.setItem(
          CONTACT_MEMORY_STORAGE_KEY,
          JSON.stringify({ name: cleanName, email: cleanEmail }),
        );
      } else {
        window.localStorage.removeItem(CONTACT_MEMORY_STORAGE_KEY);
      }
    } catch {
      // Depolama erişilemezse sessiz geç
    }

    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const metaInfo = `Sekme:${activeTab} | Mod:${studyPrefs.viewMode} | Meal:${primaryMeal.shortLabel} | Ekran:${screenWidth}px`.slice(
      0,
      300,
    );
    const pageUrl =
      typeof window !== 'undefined' ? window.location.href.slice(0, 500) : 'https://kuran.muallimun.net';

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          category,
          contextRef: cleanContext.slice(0, 250),
          message: cleanMessage,
          pageUrl,
          metaInfo,
          website,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error ||
            'Mesajınız şu anda gönderilemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.',
        );
      }

      try {
        window.localStorage.setItem(LAST_SENT_STORAGE_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      setCooldownSec(COOLDOWN_SECONDS);
      sfxService.play('correct');
      setIsSubmitted(true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Mesajınız gönderilirken beklenmeyen bir sorun oluştu.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      className={`fixed inset-0 ${Z_LAYERS.NESTED_MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) closeFeedbackModal();
      }}
    >
      <div
        className="w-full sm:max-w-xl max-h-[92dvh] rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-3.5 sm:px-5 sm:py-4 border-b flex items-center justify-between gap-2.5 shrink-0"
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
              <MessageSquareHeart className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="feedback-modal-title"
                className="text-sm sm:text-base font-extrabold tracking-tight truncate"
              >
                İletişim &amp; Geri Bildirim
              </h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Görüş, öneri ve hata bildirimlerinizi doğrudan iletebilirsiniz
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              sfxService.play('click');
              closeFeedbackModal();
            }}
            aria-label="İletişim formunu kapat"
            className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-xl border flex items-center justify-center cursor-pointer transition-colors hover:opacity-85 shrink-0 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gövde */}
        {isSubmitted ? (
          <div className="p-6 sm:p-8 text-center space-y-4 overflow-y-auto">
            <div
              className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                {activeCategoryMeta.thankYouTitle}
              </h3>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {activeCategoryMeta.thankYouBody}
              </p>
            </div>

            <div
              className="p-3 rounded-xl border text-left text-xs space-y-1 max-w-md mx-auto"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <p>
                <strong style={{ color: 'var(--text-primary)' }}>Kategori:</strong> {category}
              </p>
              {contextRef.trim() && (
                <p>
                  <strong style={{ color: 'var(--text-primary)' }}>İlgili Bölüm:</strong>{' '}
                  {contextRef.trim()}
                </p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  closeFeedbackModal();
                }}
                className="min-h-[42px] px-6 rounded-xl text-xs sm:text-sm font-extrabold text-white cursor-pointer hover:opacity-95"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Tamam, Kapat
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
              {/* Kategori Seçici (2x2 Mobil, 2x2 Masaüstü — 360px taşmasız) */}
              <fieldset className="space-y-2">
                <legend
                  className="text-xs font-extrabold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Bildirim Kategorisi
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FEEDBACK_CATEGORIES.map((item) => {
                    const Icon = item.icon;
                    const active = category === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setCategory(item.id);
                        }}
                        className="min-h-[42px] px-3 py-2 rounded-xl border text-left flex items-center gap-2 text-xs font-bold transition-colors cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                        }}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="leading-snug">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Ad Soyad + E-posta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="feedback-name"
                    className="block text-xs font-extrabold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Adınız ve Soyadınız <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id="feedback-name"
                    type="text"
                    required
                    minLength={3}
                    maxLength={100}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full min-h-[42px] px-3 rounded-xl border text-base sm:text-sm outline-none focus:border-teal-600"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="feedback-email"
                    className="block text-xs font-extrabold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    E-posta Adresiniz <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    required
                    maxLength={150}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Size dönüş yapabilmemiz için"
                    className="w-full min-h-[42px] px-3 rounded-xl border text-base sm:text-sm outline-none focus:border-teal-600"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-[11px] font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberContact}
                  onChange={(e) => setRememberContact(e.target.checked)}
                  className="w-4 h-4 rounded accent-teal-700 cursor-pointer"
                />
                <span style={{ color: 'var(--text-secondary)' }}>
                  Sonraki bildirimler için adımı ve e-postamı bu cihazda hatırla
                </span>
              </label>

              {/* İlgili Bölüm / Sure / Ayet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="feedback-context"
                    className="block text-xs font-extrabold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    İlgili Bölüm / Sure / Ayet
                  </label>
                  <select
                    aria-label="Hızlı bölüm seç"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setContextRef(e.target.value);
                    }}
                    className="text-base sm:text-[11px] font-bold rounded-lg border px-2 py-1 outline-none cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <option value="">Bölüm seç...</option>
                    {QUICK_CONTEXT_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  id="feedback-context"
                  type="text"
                  maxLength={250}
                  value={contextRef}
                  onChange={(e) => setContextRef(e.target.value)}
                  placeholder="Örn: Bakara Suresi 255. Ayet · Sayfa 42"
                  className="w-full min-h-[40px] px-3 rounded-xl border text-base sm:text-sm outline-none focus:border-teal-600"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Mesaj Alanı */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="feedback-message"
                    className="block text-xs font-extrabold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Mesajınız <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{
                      color:
                        trimmedMessageLen > MAX_MESSAGE_LEN
                          ? '#DC2626'
                          : trimmedMessageLen >= MIN_MESSAGE_LEN
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-muted)',
                    }}
                  >
                    {trimmedMessageLen} / {MAX_MESSAGE_LEN}
                  </span>
                </div>
                <textarea
                  id="feedback-message"
                  required
                  rows={4}
                  minLength={MIN_MESSAGE_LEN}
                  maxLength={MAX_MESSAGE_LEN}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={activeCategoryMeta.placeholder}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-base sm:text-sm leading-relaxed outline-none focus:border-teal-600 resize-y"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Gizli Honeypot Bot Koruması */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="feedback-website">Web sitesi</label>
                <input
                  id="feedback-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              {/* KVKK & Gizlilik Bilgilendirme Kutusu */}
              <div
                className="p-3 rounded-xl border flex items-start gap-2.5 text-[11px] leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <ShieldCheck
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: 'var(--brand-primary-text)' }}
                />
                <span>
                  Paylaştığınız ad, e-posta ve mesaj bilgileri yalnızca bildiriminizi incelemek ve
                  gerektiğinde size geri dönüş yapmak amacıyla güvenli sunucu köprüsü üzerinden
                  iletilir; üçüncü taraflarla paylaşılmaz. Hata tespitini kolaylaştırmak için
                  aktif ekran ve meal bilgisi mesaja teknik not olarak eklenir.
                </span>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3 rounded-xl border flex items-start gap-2 text-xs font-bold"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    color: '#B91C1C',
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Alt Aksiyon Çubuğu */}
            <div
              className="px-4 py-3 pb-[max(0.85rem,env(safe-area-inset-bottom,0px))] sm:px-5 sm:pb-3 border-t flex flex-wrap items-center justify-between gap-2 shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                {cooldownSec > 0
                  ? `Tekrar gönderim için ${cooldownSec} sn`
                  : 'Güvenli sunucu aktarımı'}
              </span>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    sfxService.play('click');
                    closeFeedbackModal();
                  }}
                  className="min-h-[40px] px-4 rounded-xl border text-xs font-bold cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || cooldownSec > 0}
                  className="min-h-[40px] px-5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Gönderiliyor...</span>
                    </>
                  ) : cooldownSec > 0 ? (
                    <span>Bekleyiniz ({cooldownSec} sn)</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span>Mesajı Gönder</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
