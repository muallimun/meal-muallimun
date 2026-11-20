import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Headphones,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { useAppStore } from '../store/useAppStore';
import { sfxService } from '../services/sfxService';

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
        className={`relative w-full max-w-xl rounded-3xl border border-white/15 bg-[#0d3734]/88 backdrop-blur-xl text-white shadow-2xl overflow-hidden transition-transform duration-250 my-auto ${
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

        <div className="px-5 py-7 sm:px-8 sm:py-9 flex flex-col items-center text-center">
          {/* Logo ve Besmele Zarif Giriş */}
          <div className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-white/10 ring-1 ring-amber-300/35 shadow-lg mb-4">
            <BrandMark className="w-13 h-13 sm:w-14 sm:h-14" />
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
            className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight"
          >
            Muallimun Kur’an &amp; Meal
          </h1>

          <p className="mt-2.5 text-sm sm:text-base text-teal-100/90 max-w-md leading-relaxed">
            Kur’an-ı Kerim’i hatim ve sesli meal eşliğinde anlayarak oku, kelime mealiyle
            derinleş ve editoryal meal yarışmalarıyla bilgini pekiştir.
          </p>

          {/* 3 Temel Vizyon Kartı */}
          <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
            <div className="rounded-2xl bg-white/8 border border-white/12 p-3.5">
              <div className="w-9 h-9 rounded-xl bg-teal-400/20 text-teal-200 flex items-center justify-center mb-2">
                <BookOpen className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-sm font-bold text-white">Mushaf &amp; Kitap</h2>
              <p className="mt-1 text-xs text-teal-100/80 leading-relaxed">
                9 klasik hat, çift meal karşılaştırması ve kesintisiz kitap akışı.
              </p>
            </div>

            <div className="rounded-2xl bg-white/8 border border-white/12 p-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-200 flex items-center justify-center mb-2">
                <Headphones className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-sm font-bold text-white">Tilavet &amp; Sesli Meal</h2>
              <p className="mt-1 text-xs text-teal-100/80 leading-relaxed">
                Ayet ayet hatim, TDV &amp; DİB sesli meal takibi ve otomatik kaydırma.
              </p>
            </div>

            <div className="rounded-2xl bg-white/8 border border-white/12 p-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-400/20 text-emerald-200 flex items-center justify-center mb-2">
                <Trophy className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-sm font-bold text-white">Yarışma &amp; Hata Kampı</h2>
              <p className="mt-1 text-xs text-teal-100/80 leading-relaxed">
                Pratik, Arena ve Deneme modları ile A4 yazdırılabilir sınav kâğıdı.
              </p>
            </div>
          </div>

          {/* CTA ve Bir Daha Gösterme */}
          <div className="mt-7 w-full flex flex-col items-center gap-3.5">
            <button
              type="button"
              onClick={handleEnter}
              className="w-full sm:w-auto sm:min-w-[260px] min-h-[50px] px-7 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-base shadow-lg shadow-amber-950/30 inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              <span>Hemen Başla</span>
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
