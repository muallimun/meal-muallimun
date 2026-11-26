import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Calendar,
  Compass,
  GraduationCap,
  Library,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { MEALS_CATALOG } from '../config/mealsConfig';
import { RECITERS_CATALOG } from '../config/recitersConfig';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { BrandMark } from './BrandMark';

interface IntroStatItem {
  value: string;
  label: string;
  tone: 'emerald' | 'amber';
}

interface IntroModuleCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'emerald' | 'amber';
}

const INTRO_STATS: readonly IntroStatItem[] = [
  { value: '604', label: 'Diyanet Mushafı', tone: 'emerald' },
  { value: String(MEALS_CATALOG.length), label: 'Meal & Tefsir', tone: 'amber' },
  { value: String(RECITERS_CATALOG.length), label: 'Seçkin Kurrâ', tone: 'emerald' },
  { value: '601', label: 'Konulu Fihrist', tone: 'amber' },
  { value: '9', label: 'Mushaf Hattı', tone: 'emerald' },
  { value: '20 Tur', label: 'Klasik Hafızlık', tone: 'amber' },
];

const INTRO_MODULE_CARDS: readonly IntroModuleCard[] = [
  {
    title: 'Okuma, Renkli Tecvit & Kelime Takibi',
    description: `604 sayfa Diyanet Mushafı, Kitap ve Kart görünümleri; etkileşimli Tecvit & Secâvend rehberi; ${RECITERS_CATALOG.length} kurrâdan kelime takipli (karaoke) tilavet ve 0.75x–2.5x okuma hızı.`,
    icon: BookOpen,
    tone: 'emerald',
  },
  {
    title: `${MEALS_CATALOG.length} Meal, Tefsir & Paylaşım Stüdyosu`,
    description:
      'Klasik ve çağdaş meallerle Arapça/İngilizce tefsirleri yan yana karşılaştırın; 4:5, 9:16 ve 1:1 oranlarında şık ayet paylaşım kartları üretin.',
    icon: Library,
    tone: 'amber',
  },
  {
    title: 'Klasik Hafızlık & Ezber Atölyesi',
    description:
      'Türkiye usulü 30 cüz dönüşümlü 20 tur Ham–Has takibi, 556 Rükû havuzları, ses kaydıyla öz-denetim, gölge tekrar boşluğu ve rabt testi.',
    icon: BookMarked,
    tone: 'emerald',
  },
  {
    title: '30 Cüz Hatim & Hicrî Takvim',
    description:
      'Diyanet uyumlu Hicrî–Milâdî–Rûmî takvim yaprağı, Hicrî ayın gününe göre otomatik cüz tavsiyesi (29/30 gün uyumlu Mukabele Hatmi) ve yeşil hatim ayracı senkronu.',
    icon: Calendar,
    tone: 'amber',
  },
  {
    title: 'Fihrist, Nüzul & Kişisel Defterim',
    description:
      '601 konulu fihrist, karşılaştırmalı nüzul tertipleri, Mehdi Bazergan kronolojisi, 2.139 müteşâbih ayet bağı ve renkli kişisel ayet notları.',
    icon: Compass,
    tone: 'emerald',
  },
  {
    title: 'Sunum Modu, A4 Sınav & 7 Oyun',
    description:
      'Akıllı tahta ve sınıf için tam ekran Sunum Modu; Mushaf sıralı/karışık A4 PDF sınav kağıdı üretici ve 1–2 oyunculu 7 eğitsel oyun.',
    icon: GraduationCap,
    tone: 'amber',
  },
];

export const IntroSplash: React.FC = () => {
  const { isIntroOpen, introDismissed, closeIntroSplash, setActiveTab } = useAppStore();
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(true);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (isIntroOpen) {
      setDontShowAgain(introDismissed ? true : true);
      setIsLeaving(false);
    }
  }, [isIntroOpen, introDismissed]);

  const handleEnter = (targetTab?: 'reader') => {
    if (isLeaving) return;
    sfxService.play('start');
    setIsLeaving(true);
    window.setTimeout(() => {
      closeIntroSplash(dontShowAgain);
      if (targetTab) {
        setActiveTab(targetTab);
      }
      setIsLeaving(false);
    }, 220);
  };

  useBackButtonGuard('intro_splash', isIntroOpen, () => handleEnter());

  useEffect(() => {
    if (!isIntroOpen) return;
    return acquireBodyScrollLock();
  }, [isIntroOpen]);

  if (!isIntroOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-splash-title"
      className={`fixed inset-0 ${Z_LAYERS.PANEL} flex items-center justify-center p-2.5 sm:p-5 transition-opacity duration-200 ${
        isLeaving ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        background:
          'radial-gradient(circle at 16% 12%, rgba(245, 158, 11, 0.22), transparent 42%), radial-gradient(circle at 86% 88%, rgba(20, 184, 166, 0.26), transparent 48%), linear-gradient(145deg, #072623 0%, #0b3b36 52%, #061d1b 100%)',
      }}
    >
      {/* Arka Plan İnce Geometrik Motif */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'radial-gradient(#f59e0b 1px, transparent 1px), radial-gradient(#ffffff 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          backgroundPosition: '0 0, 14px 14px',
        }}
      />

      <div
        className={`relative w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-2xl sm:rounded-3xl border border-amber-200/20 bg-[#0a302d]/94 backdrop-blur-xl text-white shadow-2xl overflow-hidden transition-transform duration-200 ${
          isLeaving ? 'scale-95' : 'scale-100'
        }`}
      >
        {/* Üst Altın-Zümrüt Çizgi Vurgusu */}
        <div className="h-1 w-full bg-gradient-to-r from-teal-400 via-amber-400 to-emerald-400 shrink-0" />

        {/* Sabit Kapatma Düğmesi */}
        <button
          type="button"
          onClick={() => handleEnter()}
          aria-label="Karşılama ekranını kapat"
          className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 z-20 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#072623]/75 border border-white/12 text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer touch-manipulation"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Kaydırılabilir İçerik Gövdesi */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col items-center text-center">
            {/* Üst Serlevha: Logo, Altın-Zümrüt Çerçeveli Besmele ve Platform Rozeti */}
            <div className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded-2xl bg-white/10 ring-1 ring-amber-300/40 shadow-lg mb-2">
              <BrandMark className="w-10 h-10 sm:w-12 sm:h-12" />
            </div>

            <div className="inline-flex items-center justify-center px-4 py-1 rounded-full border border-amber-300/35 bg-gradient-to-r from-teal-950/60 via-emerald-900/50 to-amber-950/40 shadow-sm mb-2">
              <p
                dir="rtl"
                lang="ar"
                className="arabic-title text-[15px] sm:text-lg text-amber-200 tracking-normal leading-snug"
              >
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/12 border border-amber-300/30 text-amber-200 text-[10.5px] sm:text-xs font-bold mb-2 max-w-full">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-amber-300" />
              <span className="leading-snug">
                kuran.muallimun.net · Ücretsiz &amp; Reklamsız Kur&apos;an Eğitim Platformu
              </span>
            </div>

            <h1
              id="intro-splash-title"
              className="text-xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight text-balance"
            >
              Muallimun Kur&apos;an &amp; Meal
            </h1>

            <p className="mt-1.5 text-xs sm:text-[13.5px] text-teal-100/88 max-w-2xl leading-relaxed">
              Kur&apos;an-ı Kerim&apos;i usulüne uygun okumak, anlamak, ezberlemek ve üzerinde
              tefekkür etmek için hazırlanmış kapsamlı dijital çalışma ortamı.
            </p>

            {/* 6'lı Özet Rakam Şeridi */}
            <div className="mt-4 w-full grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
              {INTRO_STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/12 bg-white/[0.06] px-2 py-2 sm:py-2.5 flex flex-col items-center justify-center relative overflow-hidden"
                >
                  <span
                    aria-hidden="true"
                    className={`w-7 h-0.5 rounded-full mb-1.5 ${
                      stat.tone === 'amber' ? 'bg-amber-400/80' : 'bg-teal-400/80'
                    }`}
                  />
                  <span
                    className={`text-sm sm:text-base font-extrabold tabular-nums leading-none ${
                      stat.tone === 'amber' ? 'text-amber-300' : 'text-teal-200'
                    }`}
                  >
                    {stat.value}
                  </span>
                  <span className="mt-1 text-[10px] sm:text-[11px] font-semibold text-teal-100/80 leading-tight text-center">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* 6 Kompakt Modül Kartı */}
            <div className="mt-3.5 sm:mt-4 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-left">
              {INTRO_MODULE_CARDS.map((card) => {
                const Icon = card.icon;
                const isAmber = card.tone === 'amber';
                return (
                  <article
                    key={card.title}
                    className="rounded-2xl bg-white/[0.065] border border-white/12 hover:border-amber-300/25 transition-colors p-3 sm:p-3.5 flex flex-col"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isAmber
                            ? 'bg-amber-400/18 text-amber-200 ring-1 ring-amber-300/25'
                            : 'bg-teal-400/18 text-teal-200 ring-1 ring-teal-300/25'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <h2 className="text-xs sm:text-[13px] font-extrabold text-white leading-snug">
                        {card.title}
                      </h2>
                    </div>
                    <p className="text-[11.5px] sm:text-xs text-teal-100/80 leading-relaxed">
                      {card.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        {/* Altta Sabit Aksiyon Çubuğu ve Yerel Veri Güvencesi */}
        <div className="shrink-0 px-3.5 py-3 sm:px-6 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-white/12 bg-[#072422]/96 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3.5 min-w-0">
            <label className="inline-flex items-center gap-2 text-[11.5px] sm:text-xs text-teal-100/90 select-none cursor-pointer min-h-[32px]">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 rounded border-white/30 bg-white/10 accent-amber-400 cursor-pointer shrink-0"
              />
              <span>Bir daha gösterme (Ayarlar&apos;dan açılabilir)</span>
            </label>

            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200/75 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-300/85" />
              <span>Verileriniz cihazınızda saklanır</span>
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => handleEnter('reader')}
              className="flex-1 sm:flex-initial min-h-[42px] px-3.5 sm:px-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap touch-manipulation"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Mushaf&apos;ı Aç</span>
            </button>

            <button
              type="button"
              onClick={() => handleEnter()}
              className="flex-1 sm:flex-initial min-h-[42px] px-4 sm:px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-950/30 inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap touch-manipulation"
            >
              <span>Çalışmaya Başla</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
