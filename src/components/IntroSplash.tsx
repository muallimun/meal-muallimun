import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Compass,
  GraduationCap,
  Library,
  Sparkles,
  X,
} from 'lucide-react';
import { MEALS_CATALOG } from '../config/mealsConfig';
import { RECITERS_CATALOG } from '../config/recitersConfig';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { BrandMark } from './BrandMark';

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

  useEffect(() => {
    if (!isIntroOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleEnter();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntroOpen, dontShowAgain]);

  if (!isIntroOpen) return null;

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-splash-title"
      className={`fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 transition-opacity duration-200 ${
        isLeaving ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        background:
          'radial-gradient(circle at 18% 12%, rgba(217, 119, 6, 0.22), transparent 44%), radial-gradient(circle at 86% 88%, rgba(13, 148, 136, 0.28), transparent 48%), linear-gradient(145deg, #092c2a 0%, #0f4f4a 52%, #0a2524 100%)',
      }}
    >
      {/* Arka Plan İnce Geometrik Motif */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(#f59e0b 1px, transparent 1px), radial-gradient(#ffffff 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          backgroundPosition: '0 0, 14px 14px',
        }}
      />

      <div
        className={`relative w-full max-w-3xl max-h-[88dvh] flex flex-col rounded-3xl border border-white/15 bg-[#0d3734]/92 backdrop-blur-xl text-white shadow-2xl overflow-hidden transition-transform duration-200 ${
          isLeaving ? 'scale-95' : 'scale-100'
        }`}
      >
        {/* Üst Altın-Zümrüt Çizgi Vurgusu */}
        <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 via-amber-400 to-emerald-400 shrink-0" />

        {/* Kapatma Düğmesi */}
        <button
          type="button"
          onClick={() => handleEnter()}
          aria-label="Karşılama ekranını kapat"
          className="absolute top-3.5 right-3.5 z-10 inline-flex items-center justify-center w-10 h-10 rounded-xl text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Kaydırılabilir İçerik Alanı */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col items-center text-center">
            {/* Logo ve Besmele */}
            <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-white/10 ring-1 ring-amber-300/35 shadow-lg mb-2.5">
              <BrandMark className="w-11 h-11 sm:w-12 sm:h-12" />
            </div>

            <p className="arabic-title text-base sm:text-lg text-amber-300/95 tracking-normal mb-1.5">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </p>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-300/30 text-amber-200 text-[11px] sm:text-xs font-semibold mb-2.5 max-w-full">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                kuran.muallimun.net · Kur&apos;an Eğitim ve Araştırma Platformu
              </span>
            </div>

            <h1
              id="intro-splash-title"
              className="text-xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight text-balance"
            >
              Muallimun Kur&apos;an &amp; Meal
            </h1>

            <p className="mt-2 text-xs sm:text-sm text-teal-100/90 max-w-2xl leading-relaxed">
              Kur&apos;an-ı Kerim&apos;i usulüne uygun okumak, anlamak, ezberlemek ve üzerinde
              tefekkür etmek için hazırlanmış kapsamlı dijital çalışma ortamı.
            </p>

            {/* 5 Temel Modül Kartı */}
            <div className="mt-5 w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-left">
              <article className="rounded-2xl bg-white/8 border border-white/12 p-3.5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-400/20 text-teal-200 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-bold text-white leading-snug">
                    1. Mushaf, Renkli Tecvit &amp; Kelime Takibi
                  </h2>
                </div>
                <p className="text-[11px] sm:text-xs text-teal-100/80 leading-relaxed">
                  Mushaf, Kart ve Kitap görünümleri; etkileşimli Renkli Tecvit ve Secâvend vakıf
                  rehberi; {RECITERS_CATALOG.length} kurrâdan kelime takipli (karaoke) tilavet ve
                  kelimeye dokun-dinle desteği.
                </p>
              </article>

              <article className="rounded-2xl bg-white/8 border border-white/12 p-3.5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-200 flex items-center justify-center shrink-0">
                    <Library className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-bold text-white leading-snug">
                    2. {MEALS_CATALOG.length} Meal, Tefsir &amp; Karşılaştırma
                  </h2>
                </div>
                <p className="text-[11px] sm:text-xs text-teal-100/80 leading-relaxed">
                  TDV, DİB, klasik ve çağdaş Türkçe meallerin yanında <em>et-Tefsîru&apos;l-Müyesser</em>,{' '}
                  <em>Celâleyn</em> ve <em>Saheeh International</em> ile satır arası veya yan yana
                  karşılaştırmalı okuma.
                </p>
              </article>

              <article className="rounded-2xl bg-white/8 border border-white/12 p-3.5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-400/20 text-teal-200 flex items-center justify-center shrink-0">
                    <Compass className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-bold text-white leading-snug">
                    3. Fihrist, Nüzul &amp; Müteşâbihât
                  </h2>
                </div>
                <p className="text-[11px] sm:text-xs text-teal-100/80 leading-relaxed">
                  601 konulu alfabetik fihrist, 114 sure künyesi ve karşılaştırmalı nüzul
                  tertipleri, Mehdi Bazergan kronolojisi, 2.139 müteşâbih ayet bağı ve kişisel
                  Araştırma Defteri.
                </p>
              </article>

              <article className="rounded-2xl bg-white/8 border border-white/12 p-3.5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-200 flex items-center justify-center shrink-0">
                    <BookMarked className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-bold text-white leading-snug">
                    4. Ezber Atölyesi &amp; Hıfz Takibi
                  </h2>
                </div>
                <p className="text-[11px] sm:text-xs text-teal-100/80 leading-relaxed">
                  556 Rükû veya özel aralıklı ezber havuzları, sesli öz-denetim (kendi sesini kaydet
                  ve kurrâ ile kıyasla), gölge tekrar boşluğu, aralıklı tekrar takvimi (SRS), ayet
                  bağlama (rabt) testi ve 114 surelik görsel hıfz haritası.
                </p>
              </article>

              <article className="sm:col-span-2 rounded-2xl bg-white/8 border border-white/12 p-3.5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-400/20 text-emerald-200 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-bold text-white leading-snug">
                    5. Sınav Merkezi, A4 Yazılı &amp; Eğitsel Oyunlar
                  </h2>
                </div>
                <p className="text-[11px] sm:text-xs text-teal-100/80 leading-relaxed">
                  Doğrulanmış meal soru bankası, Hata Kampı, optik ve cevap anahtarlı A4 PDF sınav
                  kağıdı üretici; sure isimleri, anlamları, Mushaf sırası ve Ulûmu&apos;l-Kur&apos;ân
                  gruplarını öğreten 7 eğitsel oyun.
                </p>
              </article>
            </div>
          </div>
        </div>

        {/* Altta Sabit Aksiyon Çubuğu */}
        <div className="shrink-0 px-4 py-3.5 sm:px-7 sm:py-4 border-t border-white/12 bg-[#0a2b29]/95 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <label className="inline-flex items-center gap-2 text-xs text-teal-100/85 select-none cursor-pointer min-h-[40px]">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-white/30 bg-white/10 accent-amber-400 cursor-pointer shrink-0"
            />
            <span>Bir daha gösterme (Ayarlar’dan her zaman açılabilir)</span>
          </label>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleEnter('reader')}
              className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Meal &amp; Okuma</span>
            </button>

            <button
              type="button"
              onClick={() => handleEnter()}
              className="flex-1 sm:flex-initial min-h-[44px] px-5 sm:px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-950/30 inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap"
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
