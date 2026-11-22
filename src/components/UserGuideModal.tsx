import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Brain,
  Check,
  CloudDownload,
  Compass,
  Copy,
  Database,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Keyboard,
  Layers,
  Link2,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore, type UserGuideTabId } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { OfflinePackCard } from './OfflinePackCard';

interface GuideTabMeta {
  id: UserGuideTabId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const GUIDE_TABS: GuideTabMeta[] = [
  { id: 'quickstart', label: 'Hızlı Başlangıç', shortLabel: 'Başlangıç', icon: Compass },
  { id: 'modules', label: 'Modüller & İpuçları', shortLabel: 'Modüller', icon: BookOpenCheck },
  { id: 'offline_backup', label: 'Çevrimdışı & Yedek', shortLabel: 'Çevrimdışı', icon: CloudDownload },
  { id: 'shortcuts', label: 'Kısayollar & Link', shortLabel: 'Kısayollar', icon: Keyboard },
];

interface QuickStartRouteItem {
  id: string;
  title: string;
  audience: string;
  description: string;
  ctaLabel: string;
  targetTab: 'reader' | 'memorize' | 'exam' | 'fihrist';
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
}

const QUICKSTART_ROUTES: QuickStartRouteItem[] = [
  {
    id: 'daily_reader',
    title: 'Günlük Okuyucu & Hatim Takipçisi',
    audience: 'Mushaf · Kitap · Kart Görünümleri',
    description:
      'Sayfa sayfa Mushaf okuyun, renkli tecvit ve 9 farklı Arapça hat arasından seçim yapın, kaldığınız yere ayraç bırakın ve 28 kurrâdan tilavet dinleyin.',
    ctaLabel: 'Okuma Ekranını Aç',
    targetTab: 'reader',
    icon: BookOpen,
    keywords: 'okuma hatim mushaf kitap kart tecvit hat ayraç kurra tilavet ses',
  },
  {
    id: 'hifz_student',
    title: 'Hafızlık & Ezber Öğrencisi',
    audience: 'Ayet · Sayfa · Klasik 30 Cüz Ham–Has',
    description:
      'Geleneksel 20 tur Ham–Has (30 cüz dönüşümlü) hafızlık takibi, aralıklı tekrar döngüleri, perdeleme ile hafıza yoklama, ayet başı geçiş (rabt) testi, mikrofonla kendi sesini kaydetme ve 604 sayfalık hıfz haritasıyla çalışın.',
    ctaLabel: 'Ezber Atölyesini Aç',
    targetTab: 'memorize',
    icon: Brain,
    keywords:
      'ezber hafızlık klasik 20 tur ham has 30 cüz zen oturum tekrar rabt mikrofon ses kaydı hıfz haritası perdeleme',
  },
  {
    id: 'teacher_classroom',
    title: 'Öğretmen & Sınıf Akıllı Tahtası',
    audience: 'Sınav Merkezi · A4 Yazılı · 7 Eğitsel Oyun',
    description:
      'Sure ve zorluk seçerek çoktan seçmeli denemeler çözün, tek tıkla cevap anahtarlı A4 yazılı sınav kağıdı yazdırın veya akıllı tahtada Tek / 2 Oyuncu yarışmaları başlatın.',
    ctaLabel: 'Sınav & Oyun Merkezini Aç',
    targetTab: 'exam',
    icon: GraduationCap,
    keywords: 'öğretmen sınıf akıllı tahta sınav a4 yazılı pdf oyun 2 oyuncu yarışma',
  },
  {
    id: 'researcher',
    title: 'Araştırmacı & Tefsir/Meal Çalışanı',
    audience: '27 Meal/Tefsir · Konu Fihristi · Araştırma Defteri',
    description:
      '27 farklı meal ve tefsiri yan yana karşılaştırın, konu fihristinden ilgili ayetlere ulaşın, nüzul sırası ve müteşâbihât eşleşmelerini inceleyip kişisel notlar alın.',
    ctaLabel: 'Fihrist & Araştırmayı Aç',
    targetTab: 'fihrist',
    icon: Layers,
    keywords: 'araştırma tefsir 27 meal fihrist konu nüzul müteşabihat rüku defter not',
  },
];

interface ModuleTipItem {
  id: string;
  title: string;
  badge: string;
  summary: string;
  bullets: string[];
  keywords: string;
}

const MODULE_TIPS: ModuleTipItem[] = [
  {
    id: 'reading_modes',
    title: 'Mushaf, Kitap ve Kart Görünümleri Arasındaki Farklar',
    badge: 'Okuma Ekranı',
    summary:
      'Okuma ekranının üst çubuğundan çalışma biçiminize uygun görünümü tek dokunuşla değiştirebilirsiniz:',
    bullets: [
      'Mushaf Görünümü: Klasik 604 sayfalık Medine Mushafı düzeninde akıcı okuma, secâvend vakıf işaretleri ve sayfa sonu kontrolü sunar.',
      'Kitap Görünümü: Sureyi paragraf akışı hâlinde, Arapça ve seçtiğiniz mealin düzenli yerleşimiyle uzun okumalar için sunar.',
      'Kartlar Görünümü: Her ayeti ayrı kartta gösterir; kelime kelime anlam, 27 meal karşılaştırması, rükû/müteşâbihât bağlantıları ve kişisel not ekleme için idealdir.',
    ],
    keywords: 'mushaf kitap kartlar görünüm okuma modu kelime meal karşılaştırma not',
  },
  {
    id: 'tajweed_fonts_secavend',
    title: 'Renkli Tecvit, 9 Arapça Hat ve Secâvend Vakıf İşaretleri',
    badge: 'Tipografi & Kıraat',
    summary:
      'Ayarlar penceresinden okuma zevkinize göre 9 Arapça hattı (Osmanî Hafs, Amiri, Scheherazade, IndoPak vb.) ve renkli tecvit vurgusunu açıp kapatabilirsiniz.',
    bullets: [
      'مـ (Vakf-ı Lâzım): Durulması gereken yer; geçilirse anlam bozulabilir.',
      'ط (Vakf-ı Mutlak) ve ج (Vakf-ı Câiz): Durmak daha uygundur veya durmak/geçmek eşittir.',
      'قلى (Durmak evlâ) · صلى (Geçmek evlâ) · لا (Durulmaz, nefes kesilirse geriden alınır) · ۛ (Muânaka: İki noktadan yalnızca birinde durulur).',
    ],
    keywords: 'tecvit renkli hat font osmani secavend vakıf durak mim tı cim kıla sıla la muanaka',
  },
  {
    id: 'study_pool',
    title: 'Aktif Çalışma Havuzu Nasıl Çalışır?',
    badge: 'Kişiselleştirme',
    summary:
      'Platform ilk açılışta odaklanmayı kolaylaştırmak için kısa namaz sureleri ve temel surelerden oluşan önerilen bir başlangıç havuzuyla gelir.',
    bullets: [
      'Çalışma havuzu; Ana Sayfa "Havuzdan Bir Ayet" kartını, Sınav Merkezi varsayılan soru kapsamını ve Eğitsel Oyunlar sure seçimini belirler.',
      'Sol menüdeki "Havuzu Yönet" veya "Tüm Kur’an’a Genişlet (114 Sure)" butonuyla istediğiniz sureleri ya da cüzleri dilediğiniz an havuza ekleyip çıkarabilirsiniz.',
      'Okuma ekranında ise havuzdan bağımsız olarak 114 sure ve 604 sayfanın tamamına her zaman doğrudan erişebilirsiniz.',
    ],
    keywords: 'havuz aktif çalışma havuzu 114 sure genişlet başlangıç cüz filtre',
  },
  {
    id: 'a4_exam_pdf',
    title: 'A4 Yazılı Sınav Kağıdı ve PDF Çıktısı Alma',
    badge: 'Öğretmen Aracı',
    summary:
      'Sınav Merkezi içinde yer alan "A4 Sınav Hazırla" bölümüyle kurum, ders ve tarih bilgili profesyonel sınav kağıtları oluşturabilirsiniz.',
    bullets: [
      'Sureleri, zorluk derecesini, soru sayısını ve cevap anahtarı seçeneğini belirleyin; sistem A4 kağıt ölçüsüne uyumlu iki sütunlu baskı sayfası hazırlar.',
      '"Yazdır / PDF Kaydet" butonuna tıkladıktan sonra açılan tarayıcı yazdırma penceresinde hedef yazıcı olarak "PDF olarak kaydet" seçeneğini seçerek dijital dosya elde edebilirsiniz.',
    ],
    keywords: 'a4 sınav yazılı kağıt pdf kaydet yazdır öğretmen cevap anahtarı baskı',
  },
];

interface ShortcutGroup {
  id: string;
  title: string;
  items: { keys: string[]; label: string }[];
  keywords: string;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'global',
    title: 'Genel Kısayollar',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Hızlı Arama (Sure, ayet no, 27 mealde metin ara)' },
      { keys: ['Esc'], label: 'Açık pencereyi, çekmeceyi veya rehberi kapat' },
    ],
    keywords: 'genel kısayol ctrl k arama esc kapat',
  },
  {
    id: 'zen_memorize',
    title: 'Ezber Modu (Zen Oturumu)',
    items: [
      { keys: ['Space'], label: 'Aktif ayet tilavetini oynat / duraklat' },
      { keys: ['←', '→'], label: 'Önceki / sonraki ayete geç' },
      { keys: ['H'], label: 'Perdeleme (Gizleme / İpucu) modunu değiştir' },
      { keys: ['R'], label: 'Aktif ayeti baştan tekrar dinle' },
    ],
    keywords: 'ezber zen space oynat duraklat ok tuşları perdeleme ipucu tekrar',
  },
  {
    id: 'active_exam',
    title: 'Aktif Sınav Oturumu',
    items: [
      { keys: ['1–4'], label: 'A, B, C, D şıklarından birini hızlı işaretle' },
      { keys: ['Enter'], label: 'Sonraki soruya geç / yanıtı onayla' },
      { keys: ['←', '→'], label: 'Sorular arasında ileri ve geri git' },
    ],
    keywords: 'sınav soru şık 1 2 3 4 enter ok tuşları',
  },
  {
    id: 'reader_presentation',
    title: 'Okuma & Sunum',
    items: [
      { keys: ['←', '→'], label: 'Mushaf ve kitap görünümünde sayfa / sure gezinme' },
      { keys: ['F11'], label: 'Tarayıcı tam ekran sunum modu (Akıllı Tahta)' },
    ],
    keywords: 'okuma sunum akıllı tahta tam ekran sayfa',
  },
];

interface DeepLinkExample {
  id: string;
  label: string;
  url: string;
  description: string;
}

const DEEP_LINK_EXAMPLES: DeepLinkExample[] = [
  {
    id: 'ayete_link',
    label: 'Belirli Bir Ayet (Âyetel Kürsî)',
    url: 'https://kuran.muallimun.net/?s=2&a=255',
    description: 'Bakara Suresi 255. ayeti meali açık şekilde doğrudan açar.',
  },
  {
    id: 'sayfaya_link',
    label: 'Belirli Bir Mushaf Sayfası',
    url: 'https://kuran.muallimun.net/?p=42',
    description: '42. sayfayı doğrudan Mushaf görünümünde açar.',
  },
  {
    id: 'cuze_link',
    label: 'Belirli Bir Cüz (30. Cüz)',
    url: 'https://kuran.muallimun.net/?juz=30',
    description: '30. cüzün başlangıç sayfası ve suresine yönlendirir.',
  },
  {
    id: 'sekmeye_link',
    label: 'Doğrudan Modül Bağlantısı',
    url: 'https://kuran.muallimun.net/?tab=ezber',
    description: 'Ezber Atölyesini doğrudan açar (?tab=fihrist, ?tab=sinav, ?tab=oyunlar desteklenir).',
  },
];

function normalizeForSearch(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}

export const UserGuideModal: React.FC = () => {
  const {
    isUserGuideOpen,
    userGuideTab,
    openUserGuide,
    closeUserGuide,
    setActiveTab,
    openSettingsModal,
  } = useAppStore();

  const [activeTab, setLocalTab] = useState<UserGuideTabId>(userGuideTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useBackButtonGuard('user_guide_modal', isUserGuideOpen, closeUserGuide);

  useEffect(() => {
    if (isUserGuideOpen) {
      setLocalTab(userGuideTab);
    } else {
      setSearchQuery('');
      setCopiedUrlId(null);
    }
  }, [isUserGuideOpen, userGuideTab]);

  useEffect(() => {
    if (!isUserGuideOpen) return;
    return acquireBodyScrollLock();
  }, [isUserGuideOpen]);

  const handleTabSelect = useCallback(
    (tab: UserGuideTabId) => {
      sfxService.play('click');
      setLocalTab(tab);
      openUserGuide(tab);
    },
    [openUserGuide],
  );

  const handleGoToModule = useCallback(
    (target: 'reader' | 'memorize' | 'exam' | 'fihrist') => {
      sfxService.play('click');
      closeUserGuide();
      setActiveTab(target);
    },
    [closeUserGuide, setActiveTab],
  );

  const handleCopyDeepLink = useCallback(async (id: string, url: string) => {
    sfxService.play('click');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedUrlId(id);
      window.setTimeout(() => {
        setCopiedUrlId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch {
      // Kopyalama desteklenmiyorsa sessiz geç
    }
  }, []);

  const normalizedQuery = useMemo(() => normalizeForSearch(searchQuery.trim()), [searchQuery]);
  const isSearching = normalizedQuery.length > 0;

  const filteredQuickStart = useMemo(() => {
    if (!isSearching) return QUICKSTART_ROUTES;
    return QUICKSTART_ROUTES.filter((item) =>
      normalizeForSearch(
        `${item.title} ${item.audience} ${item.description} ${item.keywords}`,
      ).includes(normalizedQuery),
    );
  }, [isSearching, normalizedQuery]);

  const filteredModules = useMemo(() => {
    if (!isSearching) return MODULE_TIPS;
    return MODULE_TIPS.filter((item) =>
      normalizeForSearch(
        `${item.title} ${item.badge} ${item.summary} ${item.bullets.join(' ')} ${item.keywords}`,
      ).includes(normalizedQuery),
    );
  }, [isSearching, normalizedQuery]);

  const filteredShortcuts = useMemo(() => {
    if (!isSearching) return SHORTCUT_GROUPS;
    return SHORTCUT_GROUPS.filter((group) =>
      normalizeForSearch(
        `${group.title} ${group.keywords} ${group.items.map((i) => `${i.keys.join(' ')} ${i.label}`).join(' ')}`,
      ).includes(normalizedQuery),
    );
  }, [isSearching, normalizedQuery]);

  const filteredDeepLinks = useMemo(() => {
    if (!isSearching) return DEEP_LINK_EXAMPLES;
    return DEEP_LINK_EXAMPLES.filter((item) =>
      normalizeForSearch(`${item.label} ${item.url} ${item.description} link url bağla paylaş`).includes(
        normalizedQuery,
      ),
    );
  }, [isSearching, normalizedQuery]);

  const matchesOfflineBackup = useMemo(() => {
    if (!isSearching) return false;
    return normalizeForSearch(
      'çevrimdışı offline paket indir önbellek pwa ana ekrana ekle ios safari android yedek json aktar veri geri yükle',
    ).includes(normalizedQuery);
  }, [isSearching, normalizedQuery]);

  const totalSearchMatches =
    filteredQuickStart.length +
    filteredModules.length +
    filteredShortcuts.length +
    filteredDeepLinks.length +
    (matchesOfflineBackup ? 1 : 0);

  if (!isUserGuideOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.MODAL} flex items-center justify-center p-2 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-guide-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          sfxService.play('click');
          closeUserGuide();
        }
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[92dvh] rounded-2xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-3.5 sm:px-5 sm:py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="user-guide-modal-title"
                className="text-base sm:text-lg font-extrabold tracking-tight truncate"
              >
                Muallimun Kullanım Kılavuzu
              </h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Okuma, ezber, araştırma, sınav, yedekleme ve çevrimdışı kullanım rehberi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              closeUserGuide();
            }}
            aria-label="Kullanım kılavuzunu kapat"
            className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-xl border flex items-center justify-center cursor-pointer transition-colors hover:opacity-85 shrink-0 touch-manipulation"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Arama Çubuğu + 4 Sekme */}
        <div
          className="px-4 py-3 sm:px-5 border-b space-y-2.5 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="relative">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rehberde ara (örn. tecvit, ezber, A4 sınav, yedek, çevrimdışı)..."
              aria-label="Kullanım kılavuzunda ara"
              className="w-full min-h-[42px] pl-9 pr-9 rounded-xl border text-xs sm:text-sm font-medium outline-none transition-colors focus:border-teal-600"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Aramayı temizle"
                className="w-8 h-8 rounded-lg flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isSearching && (
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-1.5"
              role="tablist"
              aria-label="Kılavuz bölümleri"
            >
              {GUIDE_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleTabSelect(tab.id)}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer touch-manipulation"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: isActive ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: isActive ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate hidden sm:inline">{tab.label}</span>
                    <span className="truncate sm:hidden">{tab.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Kaydırılabilir İçerik Gövdesi */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          {isSearching && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                &ldquo;{searchQuery.trim()}&rdquo; için {totalSearchMatches} rehber sonucu bulundu
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="font-bold underline cursor-pointer"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                Sekmelere dön
              </button>
            </div>
          )}

          {isSearching && totalSearchMatches === 0 && (
            <div
              className="rounded-2xl border p-6 text-center space-y-2"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-sm font-bold">Aramanızla eşleşen rehber maddesi bulunamadı.</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Örnek aramalar: tecvit, secâvend, ezber, A4 sınav, çevrimdışı, yedek, kısayol.
              </p>
            </div>
          )}

          {/* ==============================================================
              SEKME 1: HIZLI BAŞLANGIÇ
              ============================================================== */}
          {((!isSearching && activeTab === 'quickstart') ||
            (isSearching && filteredQuickStart.length > 0)) && (
            <section className="space-y-3">
              {!isSearching && (
                <div
                  className="p-3.5 rounded-2xl border flex items-start gap-2.5"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Sparkles
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <p className="text-xs sm:text-sm leading-relaxed">
                    Çalışma hedefinize uygun yolu seçerek doğrudan ilgili modüle geçebilirsiniz. Tüm
                    ilerlemeniz ve notlarınız cihazınızda güvenle saklanır.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredQuickStart.map((route) => {
                  const Icon = route.icon;
                  return (
                    <div
                      key={route.id}
                      className="rounded-2xl border p-4 flex flex-col justify-between gap-3"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start gap-2.5">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: 'var(--brand-primary-soft)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-extrabold leading-snug">{route.title}</h3>
                            <p
                              className="text-[11px] font-semibold mt-0.5"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              {route.audience}
                            </p>
                          </div>
                        </div>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {route.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleGoToModule(route.targetTab)}
                        className="w-full min-h-[40px] px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90 touch-manipulation"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--brand-primary)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <span>{route.ctaLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Ekosistem Bilgilendirmesi */}
              {!isSearching && (
                <div
                  className="p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold">
                      Kur&apos;an Kelimeleri Öğrenme Asistanı
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Kur&apos;an kelimelerini sıklık sırasına ve surelere göre etkileşimli kartlarla
                      çalışmak için kardeş platformumuzu ziyaret edebilirsiniz.
                    </p>
                  </div>
                  <a
                    href="https://kelime.muallimun.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <span>kelime.muallimun.net</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              )}
            </section>
          )}

          {/* ==============================================================
              SEKME 2: MODÜLLER & İPUÇLARI
              ============================================================== */}
          {((!isSearching && activeTab === 'modules') ||
            (isSearching && filteredModules.length > 0)) && (
            <section className="space-y-3">
              {filteredModules.map((tip) => (
                <article
                  key={tip.id}
                  className="rounded-2xl border p-4 space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold">{tip.title}</h3>
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                      style={{
                        backgroundColor: 'var(--brand-primary-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      {tip.badge}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {tip.summary}
                  </p>
                  <ul className="space-y-1.5 text-xs leading-relaxed">
                    {tip.bullets.map((bullet, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </section>
          )}

          {/* ==============================================================
              SEKME 3: ÇEVRİMDIŞI & YEDEK
              ============================================================== */}
          {((!isSearching && activeTab === 'offline_backup') ||
            (isSearching && matchesOfflineBackup)) && (
            <section className="space-y-3.5">
              {/* Tek Tıkla Çevrimdışı Paketleyici */}
              <OfflinePackCard />

              {/* Ana Ekrana Kurulum (PWA) */}
              <div
                className="rounded-2xl border p-4 space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Smartphone
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <h3 className="text-sm font-extrabold">Uygulama Gibi Kurulum (Ana Ekrana Ekle)</h3>
                </div>
                <ul className="space-y-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  <li>
                    <strong style={{ color: 'var(--text-primary)' }}>Android &amp; Masaüstü (Chrome / Edge):</strong>{' '}
                    Sol menüdeki veya Ayarlar içindeki <em>&ldquo;Uygulamayı Kur&rdquo;</em> butonunu
                    ya da adres çubuğundaki yükleme simgesini kullanabilirsiniz.
                  </li>
                  <li>
                    <strong style={{ color: 'var(--text-primary)' }}>iPhone &amp; iPad (Safari):</strong>{' '}
                    Alt araç çubuğundaki <em>Paylaş</em> simgesine dokunun ve listeden{' '}
                    <em>&ldquo;Ana Ekrana Ekle&rdquo;</em> seçeneğini onaylayın.
                  </li>
                </ul>
              </div>

              {/* Kişisel Veri Yedekleme */}
              <div
                className="rounded-2xl border p-4 space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Database
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <h3 className="text-sm font-extrabold">
                    Kişisel Veri Yedekleme ve Cihazlar Arası Aktarım
                  </h3>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Tüm çalışma verileriniz (ayraçlar, araştırma notları, ezber ilerlemesi, hıfz
                  haritası, sınav geçmişi ve ayarlar) yalnızca kendi cihazınızda saklanır. Farklı bir
                  cihaza geçerken veya düzenli güvenlik yedeği almak için Ayarlar penceresinden tek
                  tıkla <code>.json</code> yedeği indirebilir, dilediğiniz zaman iki aşamalı güvenli
                  onayla geri yükleyebilirsiniz.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      closeUserGuide();
                      openSettingsModal();
                    }}
                    className="min-h-[40px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90 touch-manipulation"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--brand-primary)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Settings className="w-3.5 h-3.5 shrink-0" />
                    <span>Ayarlar &amp; Yedekleme Ekranını Aç</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ==============================================================
              SEKME 4: KISAYOLLAR & DOĞRUDAN BAĞLANTILAR
              ============================================================== */}
          {((!isSearching && activeTab === 'shortcuts') ||
            (isSearching && (filteredShortcuts.length > 0 || filteredDeepLinks.length > 0))) && (
            <section className="space-y-4">
              {filteredShortcuts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredShortcuts.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-2xl border p-4 space-y-2.5"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <h3 className="text-sm font-extrabold">{group.title}</h3>
                      <div className="space-y-2">
                        {group.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start justify-between gap-2 text-xs"
                          >
                            <span
                              className="leading-snug"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {item.label}
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              {item.keys.map((k) => (
                                <kbd
                                  key={k}
                                  className="px-1.5 py-0.5 rounded-md border text-[11px] font-extrabold font-mono"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-strong)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {k}
                                </kbd>
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filteredDeepLinks.length > 0 && (
                <div
                  className="rounded-2xl border p-4 space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Link2
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <div>
                      <h3 className="text-sm font-extrabold">Doğrudan Bağlantı (Deep-Link) Adresleri</h3>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Öğrencilerle veya çalışma gruplarınızla belirli bir ayet, sayfa, cüz ya da
                        modül bağlantısını doğrudan paylaşabilirsiniz.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {filteredDeepLinks.map((example) => {
                      const isCopied = copiedUrlId === example.id;
                      return (
                        <div
                          key={example.id}
                          className="p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold">{example.label}</p>
                            <p
                              className="text-[11px] font-mono break-all mt-0.5"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              {example.url}
                            </p>
                            <p
                              className="text-[11px] mt-0.5"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {example.description}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCopyDeepLink(example.id, example.url)}
                            className="min-h-[36px] px-3 rounded-lg border text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer hover:opacity-90"
                            style={{
                              backgroundColor: isCopied
                                ? 'var(--brand-primary-soft)'
                                : 'var(--bg-surface-soft)',
                              borderColor: isCopied
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                              color: isCopied
                                ? 'var(--brand-primary-text)'
                                : 'var(--text-primary)',
                            }}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                <span>Kopyalandı</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 shrink-0" />
                                <span>Linki Kopyala</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Alt Çubuk */}
        <div
          className="px-4 py-3 sm:px-5 border-t flex flex-wrap items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span
            className="text-[11px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>kuran.muallimun.net · Kullanım Rehberi</span>
          </span>
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              closeUserGuide();
            }}
            className="min-h-[38px] px-4 rounded-xl text-xs font-extrabold text-white cursor-pointer hover:opacity-95 touch-manipulation"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
