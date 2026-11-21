import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Compass,
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
  const { isIntroOpen, introDismissed, closeIntroSplash } = useAppStore();
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

  const handleEnter = () => {
    if (isLeaving) return;
    sfxService.play('start');
    setIsLeaving(true);
    window.setTimeout(() => {
      closeIntroSplash(dontShowAgain);
      setIsLeaving(false);
    }, 240);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-splash-title"
      className={`fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto px-4 py-6 sm:px-6 transition-opacity duration-250 ${
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
        className={`relative w-full max-w-2xl rounded-3xl border border-white/15 bg-[#0d3734]/90 backdrop-blur-xl text-white shadow-2xl overflow-hidden transition-transform duration-250 my-auto ${
          isLeaving ? 'scale-95' : 'scale-100'
        }`}
      >
        {/* Üst Altın Çizgi Vurgusu */}
        <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 via-amber-400 to-emerald-400" />

        {/* Kapatma Düğmesi */}
        <button
          type="button"
          onClick={handleEnter}
          aria-label="Karşılama ekranını kapat"
          className="absolute top-4 right-4 inline-flex items-center justify-center w-11 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-5 py-6 sm:px-8 sm:py-8 flex flex-col items-center text-center">
          {/* Logo ve Besmele */}
          <div className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-white/10 ring-1 ring-amber-300/35 shadow-lg mb-3.5">
            <BrandMark className="w-12 h-12 sm:w-14 sm:h-14" />
          </div>

          <p className="arabic-title text-lg sm:text-xl text-amber-300/95 tracking-normal mb-1.5">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-300/30 text-amber-200 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>meal.muallimun.net</span>
          </div>

          <h1
            id="intro-splash-title"
            className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight text-balance"
          >
            Muallimun Kur’an, Meal &amp; Araştırma
          </h1>

          <p className="mt-2.5 text-sm sm:text-[15px] text-teal-100/90 max-w-xl leading-relaxed">
            Okuyucular, öğrenciler, eğitmenler ve araştırmacılar için Mushaf okuma, karşılaştırmalı
            meal-tefsir, konulu fihrist, ezber ve sınav çalışmalarını bir araya getiren sakin çalışma
            alanı.
          </p>

          {/* 4 Ana Modül Kartı */}
          <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-left">
            <div className="rounded-2xl bg-white/8 border border-white/12 p-3.5 sm:p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-teal-400/20 text-teal-200 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-white leading-snug">
                  Mushaf, Renkli Tecvit &amp; Kelime Takibi
                </h2>
              </div>
              <p className="text-xs text-teal-100/80 leading-relaxed">
                Mushaf, Kart ve Kitap görünümleri; etkileşimli Renkli Tecvit ve Secâvend durak
                rehberi; {RECITERS_CATALOG.length} kurrâ ile kelime takipli (karaoke) tilavet ve
                kelimeye dokun-dinle desteği.
              </p>
            </div>

            <div className="rounded-2xl bg-white/8 border border-white/12 p-3.5 sm:p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-200 flex items-center justify-center shrink-0">
                  <Library className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-white leading-snug">
                  {MEALS_CATALOG.length} Meal, Arapça Tefsir &amp; Karşılaştırma
                </h2>
              </div>
              <p className="text-xs text-teal-100/80 leading-relaxed">
                TDV, DİB, klasik ve çağdaş Türkçe meallerin yanında et-Tefsîru’l-Müyesser, Celâleyn
                ve Saheeh International ile yan yana karşılaştırmalı okuma.
              </p>
            </div>

            <div className="rounded-2xl bg-white/8 border border-white/12 p-3.5 sm:p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-teal-400/20 text-teal-200 flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-white leading-snug">
                  Fihrist, Nüzul &amp; Araştırma Defteri
                </h2>
              </div>
              <p className="text-xs text-teal-100/80 leading-relaxed">
                601 konulu alfabetik fihrist, 114 sure künyesi ve karşılaştırmalı nüzul tertipleri,
                Mehdi Bazergan kronolojisi, 2.139 müteşâbih ayet ve kişisel Araştırma Defteri.
              </p>
            </div>

            <div className="rounded-2xl bg-white/8 border border-white/12 p-3.5 sm:p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-200 flex items-center justify-center shrink-0">
                  <BookMarked className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-white leading-snug">
                  Ezber Modu &amp; Sınav Merkezi
                </h2>
              </div>
              <p className="text-xs text-teal-100/80 leading-relaxed">
                556 Rükû veya özel aralıklı ezber havuzları, öğretici (Muallim / Talim) tilavetler,
                doğrulanmış meal soru bankası, Hata Kampı ve A4 PDF sınav çıktısı.
              </p>
            </div>
          </div>

          {/* CTA ve Bir Daha Gösterme */}
          <div className="mt-6 w-full flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleEnter}
              className="w-full sm:w-auto sm:min-w-[260px] min-h-[48px] px-7 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-base shadow-lg shadow-amber-950/30 inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              <span>Çalışmaya Başla</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm text-teal-100/85 select-none cursor-pointer min-h-[44px] px-2">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4.5 h-4.5 rounded border-white/30 bg-white/10 accent-amber-400 cursor-pointer"
              />
              <span>Bir daha gösterme (Ayarlar’dan her zaman açılabilir)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
