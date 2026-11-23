import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Compass, Lightbulb } from 'lucide-react';
import { sfxService } from '../../services/sfxService';

const METHOD_GUIDE_COLLAPSED_KEY = 'muallimun_hifz_method_guide_collapsed_v1';

interface MemorizationMethodGuideProps {
  variant: 'pool' | 'classical';
  /** Kullanıcının aktif ezber birimi veya aktif klasik hafızlık planı olup olmadığı */
  hasActiveProgress: boolean;
}

function readPersistedCollapsedFlag(): boolean {
  try {
    return window.localStorage.getItem(METHOD_GUIDE_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function persistCollapsedFlag(collapsed: boolean): void {
  try {
    if (collapsed) {
      window.localStorage.setItem(METHOD_GUIDE_COLLAPSED_KEY, '1');
    } else {
      window.localStorage.removeItem(METHOD_GUIDE_COLLAPSED_KEY);
    }
  } catch {
    // localStorage erişilemezse sessizce geç
  }
}

const POOL_STEPS = [
  {
    step: '1',
    title: 'Dinleme ve Yüzünden Akıcı Hazırlık',
    desc: 'Ezbere başlamadan önce ayetleri seçili kurrâdan dinleyin ve tecvit/hareke hatası yerleşmemesi için birkaç kez yüzünden akıcı okuyun.',
  },
  {
    step: '2',
    title: 'Zincirleme Birleştirme (Kar Topu Tekniği)',
    desc: 'İlk ayeti ezberledikten sonra ikinciye geçin; ikinciyi ezberleyince 1 ve 2. ayeti birbirine bağlayarak okuyun. Her yeni ayeti öncekilerle birleştirerek pasaj bütünlüğü kurun.',
  },
  {
    step: '3',
    title: 'Üç Aşamalı Kalıcı Tekrar Döngüsü',
    desc: 'Tamamladığınız bölümler önce Yeni Ezber, ardından Pekiştirme ve Kalıcı Tekrar aralıklarıyla bugün tekrar edilecekler listesine düşer; böylece eski ezberleriniz unutulmaz.',
  },
] as const;

const CLASSICAL_STEPS = [
  {
    step: '1',
    title: '1. Turda Son Sayfalar (Ham)',
    desc: 'Her cüzün en son sayfası (1. cüzde s. 20, 2. cüzde s. 40…) sırayla Ham olarak ezberlenir ve 30 cüz dönülür.',
  },
  {
    step: '2',
    title: '2. Turdan İtibaren Ham + Has',
    desc: '2. tura dönüldüğünde 19. sayfa yeni Ham olur; önceki turda ezberlenen 20. sayfa artık Has (sağlam) kabul edilir.',
  },
  {
    step: '3',
    title: 'Sondan Başa Ezber, Yukarıdan Aşağı Bağlantı',
    desc: 'Sayfalar cüz sonundan başa doğru ezberlenir; derste ise Mushaf sırasıyla yukarıdan aşağıya birbirine bağlanarak dinletilir.',
  },
] as const;

const CLASSICAL_CONCEPTS = [
  {
    term: 'Ham (Çiğ) Ders',
    tone: 'accent' as const,
    desc: 'O gün ilk kez ezberlenen yeni sayfa. Akşamdan yüzünden çokça okunarak hazırlanır, sabah zihin dinçken ezberlenir.',
  },
  {
    term: 'Has Ders',
    tone: 'primary' as const,
    desc: 'Önceki turlarda ezberlenmiş olan sağlam sayfalar. Her gün yeni Ham dersle birlikte cüz içinde yukarıdan aşağıya birbirine bağlanarak tekrar edilir.',
  },
  {
    term: 'Tur (Dönüş)',
    tone: 'neutral' as const,
    desc: '1. cüzden 30. cüze kadar her cüzün ilgili sıradaki birer sayfasının ezberlenmesiyle tamamlanan döngü. 20 tur bittiğinde 604 sayfanın tamamı hıfzedilmiş olur.',
  },
  {
    term: 'Sondan Başa Sıra Neden Kullanılır?',
    tone: 'neutral' as const,
    desc: 'Ezbere her cüzün 20. (son) sayfasından başlanıp 19, 18... diye başa doğru gelinir; böylece yeni ezberlenen her sayfa, kendisinden sonra gelen sağlam (Has) sayfalara Mushaf’taki doğal okuma sırasıyla kesintisiz bağlanır.',
  },
] as const;

export const MemorizationMethodGuide: React.FC<MemorizationMethodGuideProps> = ({
  variant,
  hasActiveProgress,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (hasActiveProgress) return false;
    return !readPersistedCollapsedFlag();
  });

  const prevHasProgressRef = useRef<boolean>(hasActiveProgress);

  // Kullanıcı ilk ezber birimini eklediğinde veya klasik hafızlık planını başlattığında
  // çalışma alanını ferahlatmak için rehberi otomatik olarak ince şeride kapat
  useEffect(() => {
    if (!prevHasProgressRef.current && hasActiveProgress) {
      setIsExpanded(false);
      persistCollapsedFlag(true);
    }
    prevHasProgressRef.current = hasActiveProgress;
  }, [hasActiveProgress]);

  const handleToggle = () => {
    sfxService.play('click');
    setIsExpanded((prev) => {
      const next = !prev;
      if (!next) {
        persistCollapsedFlag(true);
      }
      return next;
    });
  };

  const isClassical = variant === 'classical';
  const title = isClassical
    ? 'Klasik Türkiye Hafızlık Usulü (20 Tur · Ham–Has Sistemi) Rehberi & Kavramlar'
    : 'Adım Adım Ezber ve Kalıcı Tekrar Yöntemi Nasıl Çalışır?';

  return (
    <section
      aria-label={title}
      className="rounded-2xl border overflow-hidden transition-colors"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: isExpanded ? 'var(--border-strong)' : 'var(--border-subtle)',
      }}
    >
      {/* Tek Satırlık Tıklanabilir Rehber Başlık Şeridi */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        className="w-full min-h-[44px] px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none text-left transition-colors hover:bg-[var(--bg-surface-soft)]"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: isClassical
                ? 'var(--brand-accent-soft)'
                : 'var(--brand-primary-soft)',
              color: isClassical ? 'var(--brand-accent-text)' : 'var(--brand-primary-text)',
            }}
          >
            {isClassical ? (
              <Compass className="w-4 h-4 shrink-0" />
            ) : (
              <BookOpen className="w-4 h-4 shrink-0" />
            )}
          </span>
          <span className="text-xs sm:text-sm font-extrabold leading-snug line-clamp-2 sm:truncate">
            {title}
          </span>
        </div>

        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[11px] font-bold shrink-0 whitespace-nowrap"
          style={{
            backgroundColor: isExpanded ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
            borderColor: isExpanded ? 'var(--brand-primary)' : 'var(--border-subtle)',
            color: isExpanded ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
          }}
        >
          <span>{isExpanded ? 'Gizle' : 'Yöntem & Kavramlar'}</span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </span>
      </button>

      {/* Yumuşak Açılır–Kapanır Gövde */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div
            className="px-3.5 sm:px-4 pb-4 pt-3 border-t space-y-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {isClassical ? (
              <>
                <p
                  className="text-xs sm:text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Kur&apos;an kurslarında yüzyıllardır uygulanan Osmanlı–Diyanet usulüyle 604
                  sayfayı düzenli turlar hâlinde ezberleyebilir, günlük Ham ve Has derslerinizi
                  kolayca takip edebilirsiniz.
                </p>

                {/* 3 Temel İşleyiş Adımı */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {CLASSICAL_STEPS.map((item) => (
                    <div
                      key={item.step}
                      className="rounded-2xl border p-3.5 space-y-1.5"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 text-white"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          {item.step}
                        </span>
                        <h3 className="text-xs sm:text-sm font-extrabold leading-snug">
                          {item.title}
                        </h3>
                      </div>
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Temel Hafızlık Kavramları */}
                <div className="space-y-2">
                  <p
                    className="text-[11px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Temel Hafızlık Kavramları
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CLASSICAL_CONCEPTS.map((concept) => (
                      <div
                        key={concept.term}
                        className="rounded-xl border p-3 space-y-1"
                        style={{
                          backgroundColor:
                            concept.tone === 'accent'
                              ? 'var(--brand-accent-soft)'
                              : concept.tone === 'primary'
                                ? 'var(--brand-primary-soft)'
                                : 'var(--bg-surface-soft)',
                          borderColor:
                            concept.tone === 'accent'
                              ? 'rgba(217, 119, 6, 0.32)'
                              : concept.tone === 'primary'
                                ? 'rgba(15, 118, 110, 0.30)'
                                : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs font-extrabold"
                          style={{
                            color:
                              concept.tone === 'accent'
                                ? 'var(--brand-accent-text)'
                                : concept.tone === 'primary'
                                  ? 'var(--brand-primary-text)'
                                  : 'var(--text-primary)',
                          }}
                        >
                          {concept.term}
                        </p>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {concept.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Ezber Havuzum: 3 Pedagojik Adım */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {POOL_STEPS.map((item) => (
                    <div
                      key={item.step}
                      className="rounded-2xl border p-3.5 space-y-1.5"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 text-white"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          {item.step}
                        </span>
                        <h3 className="text-xs sm:text-sm font-extrabold leading-snug">
                          {item.title}
                        </h3>
                      </div>
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Pratik İpucu */}
                <div
                  className="rounded-xl border px-3 py-2.5 flex items-start gap-2 text-xs leading-relaxed"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'rgba(15, 118, 110, 0.25)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Lightbulb
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <p>
                    <strong style={{ color: 'var(--brand-primary-text)' }}>Pratik İpucu:</strong>{' '}
                    Odak çalışma ekranında <em>Kademeli Gizleme</em>, <em>Gölge Tekrar</em> ve{' '}
                    <em>Mikrofonla Kaydet &amp; Kıyasla</em> araçlarını kullanarak ezberinizi tek
                    başınıza test edebilirsiniz.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
