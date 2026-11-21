import React from 'react';
import { ArrowLeft, BookMarked, BookOpen, Layers, Library, RotateCcw, Settings, Trophy } from 'lucide-react';
import { MEALS_CATALOG } from '../config/mealsConfig';
import { RECITERS_CATALOG } from '../config/recitersConfig';
import { useAppStore } from '../store/useAppStore';
import type { NavTab } from '../types/quran';
import { formatNumberTr } from '../utils/poolUtils';

interface PlaceholderScreenProps {
  tab: Exclude<NavTab, 'home'>;
}

const PLACEHOLDER_META: Record<
  Exclude<NavTab, 'home'>,
  {
    title: string;
    subtitle: string;
    highlights: string[];
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  reader: {
    title: 'Mushaf, Meal & Tefsir Okuma',
    subtitle:
      `Ayet ayet Mushaf metni, ${MEALS_CATALOG.length} meal ve tefsir karşılaştırması, renkli tecvit, kelime meali ve kesintisiz ses kuyruğu bu modülde yer alır.`,
    highlights: [
      'Seçtiğiniz Arapça hat ve punto ayarlarına anında uyumlu Mushaf görünümü',
      'İshak Danış hatim ve ayet ayet Türkçe meal ses kuyruğu',
      'Dipnotlar ve kelime-kelime Arapça ↔ Türkçe anlam kartları',
    ],
    icon: BookOpen,
  },
  fihrist: {
    title: 'Alfabetik Konu Fihristi & Araştırma Defteri',
    subtitle:
      "A'dan Z'ye Kur'an konu başlıklarını inceleyin, ayetleri kişisel araştırma başlıklarınızda toplayıp notlayın ve A4 PDF olarak yazdırın.",
    highlights: [
      'A–Z harf çubuğu ve anlık Türkçe konu arama',
      `4 görünüm modu, kesintisiz sesli dinleme ve ${MEALS_CATALOG.length} meal & tefsir karşılaştırma`,
      'Kişisel Araştırma Defteri, toplu referans ekleme ve JSON yedekleme',
    ],
    icon: Library,
  },
  memorize: {
    title: 'Ezber Modu',
    subtitle:
      `Kümeli Kar Topu yöntemi, 3 kademeli geri çağırma maskesi ve ${RECITERS_CATALOG.length} kurrâ desteğiyle sakin ezber çalışma alanı.`,
    highlights: [
      'Hazır aşırlar, Mushaf sayfası, sure ve özel aralıklarla esnek ezber havuzu',
      'Akıllı sekte (Dinle & Tekrar Et) ve Muallim kurrâ uyumu',
      'Odak Kartı ve Mushaf görünümü arasında anında geçiş',
    ],
    icon: BookMarked,
  },
  exam: {
    title: 'Editoryal Sınav Merkezi',
    subtitle:
      'Aktif çalışma havuzunuzdaki doğrulanmış sorulardan etkileşimli meal yarışması başlatabilecek ve A/B kitapçıklı A4 PDF çıktısı alabileceksiniz.',
    highlights: [
      'q/index.json üzerinden otomatik genişleyen editoryal soru bankası',
      'Anında sesli geri bildirim (SFX), ayet açıklamaları ve seri puanı',
      'Sınıf ve yarışmalar için A/B kitapçıklı A4 PDF sınav üretici',
    ],
    icon: Trophy,
  },
  mistakes: {
    title: 'Hata Kampı ve Tekrar',
    subtitle:
      'Sınavlarda yanlış yanıtladığınız sorular burada toplanır; eksik kaldığınız ayet ve sureleri hedefe yönelik tekrar ederek puanınızı yükseltebilirsiniz.',
    highlights: [
      'Yanlış yapılan soruların otomatik kaydı ve tekrar listesi',
      'İlgili ayetin Arapça metnine ve meal açıklamasına hızlı dönüş',
      'Doğru çözüldüğünde kamptan temizlenme ve ilerleme takibi',
    ],
    icon: RotateCcw,
  },
};

export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({ tab }) => {
  const { setActiveTab, openPoolModal, openSettingsModal, poolStats, gamification } = useAppStore();
  const config = PLACEHOLDER_META[tab];
  const Icon = config.icon;

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8">
      <div className="surface-card rounded-2xl p-6 sm:p-8">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            color: 'var(--brand-primary-text)',
          }}
        >
          <Icon className="w-6 h-6" />
        </div>

        <h2 className="text-2xl font-extrabold tracking-tight mb-2 text-balance">
          {config.title}
        </h2>
        <p
          className="text-sm sm:text-base leading-relaxed mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          {config.subtitle}
        </p>

        {/* Mevcut Havuz Durumu */}
        <div
          className="rounded-xl p-4 mb-6 border"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold">Aktif Çalışma Havuzunuz Hazır</span>
            <span
              className="text-xs sm:text-sm font-medium tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {formatNumberTr(poolStats.surahCount)} Sure ·{' '}
              {formatNumberTr(poolStats.ayahCount)} Ayet ·{' '}
              {formatNumberTr(poolStats.questionCount)} Hazır Soru
              {tab === 'mistakes' &&
                ` · ${formatNumberTr(gamification.wrongQuestionIds.length)} Kayıtlı Hata`}
            </span>
          </div>
        </div>

        {/* Gelecek Adım Özeti */}
        <ul className="space-y-2.5 mb-7">
          {config.highlights.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span
                className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--brand-primary)' }}
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {/* Aksiyonlar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 transition-opacity hover:opacity-95 cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ana Sayfaya Dön</span>
          </button>

          <button
            type="button"
            onClick={openPoolModal}
            className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold border flex items-center gap-2 transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <Layers className="w-4 h-4" />
            <span>Havuzu Düzenle</span>
          </button>

          <button
            type="button"
            onClick={openSettingsModal}
            className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold border flex items-center gap-2 transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <Settings className="w-4 h-4" />
            <span>Yazı Tipi ve Tema</span>
          </button>
        </div>
      </div>
    </div>
  );
};
