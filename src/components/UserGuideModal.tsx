import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Brain,
  Check,
  ChevronDown,
  CloudDownload,
  Compass,
  Copy,
  Database,
  FileText,
  GraduationCap,
  HelpCircle,
  Keyboard,
  Layers,
  Link2,
  MessageCircle,
  MessageSquareHeart,
  Search,
  Send,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import { sfxService } from '../services/sfxService';
import { useAppStore, type UserGuideTabId } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { shouldAutoFocusSearchInput } from '../utils/deviceUtils';
import { BrandMark } from './BrandMark';
import { OfflinePackCard } from './OfflinePackCard';

const APP_SHARE_URL = 'https://kuran.muallimun.net/';
const APP_SHARE_TITLE = "Muallimun Kur'an, Meal & Araştırma Platformu";
const APP_SHARE_SHORT_TEXT =
  "Kur'an-ı Kerim okuma, 27 meal & tefsir, kelime takipli tilavet, ezber atölyesi ve sınav merkezi ücretsiz ve reklamsız bir arada. İncelemenizi tavsiye ederim.";
const APP_SHARE_FULL_MESSAGE = `${APP_SHARE_SHORT_TEXT}\n\n${APP_SHARE_URL}`;

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

interface QuickStartStep {
  step: string;
  title: string;
  description: string;
}

const QUICKSTART_STEPS: QuickStartStep[] = [
  {
    step: '1',
    title: 'Konum & Görünüm Seç',
    description: '604 sayfalık Diyanet Mushafı, Kitap veya Kartlar görünümünden birini açın.',
  },
  {
    step: '2',
    title: 'Dinle & Kelime Takibi Aç',
    description: '28 kurrâdan 0.75x–2.5x hızda dinleyin, kelime bazlı takiple okuyun.',
  },
  {
    step: '3',
    title: 'Not Al, Ezberle veya Paylaş',
    description: 'Renkli tefekkür notu tutun, ezber turu başlatın veya şık ayet kartı üretin.',
  },
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
    title: 'Günlük Okuyucu & Hatim',
    audience: '604 Sayfa Diyanet Mushafı · Hatim Planlayıcısı · 9 Seçkin Hat',
    description:
      'Sayfa sayfa Diyanet Mushafı okuyun, 30 Cüz Hatim Planlayıcısı ile günlük hedef belirleyin, yeşil hatim ayracınızla ilerlemenizi senkronize edin ve 28 kurrâdan 0.75x–2.5x hızda dinleyin.',
    ctaLabel: 'Okuma Ekranını Aç',
    targetTab: 'reader',
    icon: BookOpen,
    keywords:
      'okuma hatim planlayıcı 30 cüz 604 sayfa diyanet mushaf kitap kart tecvit hat ayraç kurra tilavet ses hız 2.5x',
  },
  {
    id: 'hifz_student',
    title: 'Hafızlık & Ezber',
    audience: 'Klasik 20 Tur Ham–Has · Aralıklı Tekrar · Perdeleme',
    description:
      'Türkiye usulü 30 cüz dönüşümlü 20 tur Ham–Has takibi, perdeleme ile hafıza yoklama, ayet başı geçiş (rabt) testi, mikrofonla ses kaydı ve 604 sayfalık hıfz haritasıyla planlı çalışın.',
    ctaLabel: 'Ezber Atölyesini Aç',
    targetTab: 'memorize',
    icon: Brain,
    keywords:
      'ezber hafızlık klasik 20 tur ham has 30 cüz zen oturum tekrar rabt mikrofon ses kaydı hıfz haritası perdeleme',
  },
  {
    id: 'teacher_classroom',
    title: 'Öğretmen & Akıllı Tahta / Sunum Modu',
    audience: 'Sunum Modu · A4 Yazılı Sınav · 7 Eğitsel Oyun',
    description:
      'Sınıf ve konferans ekranlarında büyük puntolu Sunum Modu ile ayetleri yansıtın; tek tıkla cevap anahtarlı A4 yazılı sınav kağıdı hazırlayın veya 2 oyunculu sınıf yarışmaları başlatın.',
    ctaLabel: 'Sınav & Oyun Merkezini Aç',
    targetTab: 'exam',
    icon: GraduationCap,
    keywords:
      'öğretmen sınıf akıllı tahta sunum modu projeksiyon tam ekran sınav a4 yazılı pdf oyun 2 oyuncu yarışma',
  },
  {
    id: 'researcher',
    title: 'Araştırmacı & 27 Meal/Tefsir',
    audience: '27 Meal/Tefsir · Konu Fihristi · Ayet Notları & Defterim',
    description:
      '27 meal ve tefsiri yan yana karşılaştırın, ayetlere renkli ve etiketli notlar ekleyin, 601 konulu fihrist ve araştırma defterinizden A4 PDF çalışma çıktıları alın.',
    ctaLabel: 'Fihrist & Araştırmayı Aç',
    targetTab: 'fihrist',
    icon: Layers,
    keywords:
      'araştırma tefsir 27 meal fihrist konu nüzul müteşabihat rüku defter not tefekkür etiket pdf',
  },
];

type ModuleCategoryId = 'all' | 'reading' | 'audio_presentation' | 'hifz_hatim' | 'fihrist_exam';

const MODULE_CATEGORIES: { id: ModuleCategoryId; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'reading', label: 'Okuma & Mushaf' },
  { id: 'audio_presentation', label: 'Ses & Sunum' },
  { id: 'hifz_hatim', label: 'Ezber & Hatim' },
  { id: 'fihrist_exam', label: 'Fihrist & Sınav' },
];

type ModuleTipActionId =
  | 'open_reader'
  | 'open_exam'
  | 'classical_hifz'
  | 'hatim_planner'
  | 'personal_notes'
  | 'customize_desk';

interface ModuleTipBullet {
  lead: string;
  text: string;
}

interface ModuleTipItem {
  id: string;
  category: Exclude<ModuleCategoryId, 'all'>;
  categoryLabel: string;
  title: string;
  summary: string;
  bullets: ModuleTipBullet[];
  keywords: string;
  ctaLabel?: string;
  actionId?: ModuleTipActionId;
}

const MODULE_TIPS: ModuleTipItem[] = [
  {
    id: 'reading_modes',
    category: 'reading',
    categoryLabel: 'Okuma & Mushaf',
    title: 'Mushaf, Kitap, Kartlar & Kitap Kenarı Kaydırma Rayı',
    summary: 'Okuma ekranının üst çubuğundan çalışma biçiminize uygun görünümü tek dokunuşla seçin.',
    bullets: [
      {
        lead: 'Mushaf Görünümü:',
        text: '604 sayfalık Diyanet / Türkiye Mushafı düzeninde akıcı okuma, secâvend vakıf işaretleri ve sayfa sonu uyumu sunar.',
      },
      {
        lead: 'Kitap Görünümü & Hızlı Kaydırma Rayı:',
        text: 'Uzun surelerde kitap yaprağına bitişik canlı ayet gezgini ve kaydırma rayı ile istediğiniz ayete anında ulaşın.',
      },
      {
        lead: 'Kartlar Görünümü:',
        text: 'Her ayette kelime kelime anlam, 27 meal/tefsir karşılaştırması, rükû/müteşâbihât bağlantıları ve kişisel not ekleme imkânı verir.',
      },
    ],
    keywords:
      'mushaf diyanet türkiye 604 sayfa kitap kaydırma rayı gezgin kartlar görünüm okuma modu kelime meal karşılaştırma',
    ctaLabel: 'Okuma Ekranını Aç',
    actionId: 'open_reader',
  },
  {
    id: 'tajweed_fonts_secavend',
    category: 'reading',
    categoryLabel: 'Okuma & Mushaf',
    title: '9 Seçkin Mushaf Hattı, Renkli Tecvit & Secâvend Rehberi',
    summary:
      'Şeyh Hamdullah Klasik, Elif Mushaf Hattı, Süleyman Feyzullah, Hasenât, Arakom Nesih dâhil 9 seçkin hat ve 3 tema (Açık, Krem Mushaf, Gece) arasında geçiş yapın.',
    bullets: [
      {
        lead: 'Renkli Tecvit & Hat Geçişi:',
        text: 'Renkli Tecvit açıkken özel tecvit hattı kullanılır; kendi seçtiğiniz hattı görmek için tecviti tek dokunuşla kapatabilirsiniz.',
      },
      {
        lead: 'Durak İşaretleri (Secâvend):',
        text: 'مـ (Vakf-ı Lâzım: durulmalı) · ط / ج (durmak uygun veya câiz) · قلى (durmak evlâ) · صلى (geçmek evlâ) · لا (durulmaz) · ۛ (Muânaka).',
      },
      {
        lead: 'Tipografi Kontrolü:',
        text: 'Arapça/meal yazı boyutu, kelime sıklığı ve satır aralığını okuma menüsünden anlık ayarlayın.',
      },
    ],
    keywords:
      'tecvit renkli hat font şeyh hamdullah elif süleyman feyzullah hasenat arakom nesih 9 hat secavend vakıf durak krem tema',
  },
  {
    id: 'audio_presentation_share',
    category: 'audio_presentation',
    categoryLabel: 'Ses & Sunum',
    title: '28 Kurrâ, 0.75x–2.5x Hız, Sunum Modu & Ayet Kartı Stüdyosu',
    summary:
      'Sesli dinleme, sınıf/salon projeksiyon sunumu ve sosyal paylaşım için görsel ayet kartı stüdyosu bir arada çalışır.',
    bullets: [
      {
        lead: 'Esnek Tilavet & Kelime Takibi:',
        text: '28 kurrâ ve Türkçe meal sesiyle 0.75x–2.5x arası okuma hızı, ayet/bölüm tekrarı ve canlı kelime takibi kullanın.',
      },
      {
        lead: 'Akıllı Tahta Sunum Modu:',
        text: 'Geniş sahne ve yüksek kontrastlı büyük puntoyla ders ve mukabelelerde klavye ok tuşlarıyla (duraklatılmışken ses başlamadan) gezinin.',
      },
      {
        lead: 'Ayet Paylaşım Kartı Stüdyosu:',
        text: 'Herhangi bir ayeti 4:5 (Gönderi), 9:16 (Hikâye) veya 1:1 (Kare) formatında seçili meal/tefsir atfıyla yüksek çözünürlüklü PNG olarak indirin.',
      },
    ],
    keywords:
      'ses kurra 28 hız 0.75x 2.5x kelime takip karaoke sunum modu akıllı tahta projeksiyon ayet paylaşım kartı 4:5 9:16 1:1 png',
    ctaLabel: 'Okuma & Sunumu Aç',
    actionId: 'open_reader',
  },
  {
    id: 'classical_hifz_guide',
    category: 'hifz_hatim',
    categoryLabel: 'Ezber & Hatim',
    title: 'Klasik Türkiye Hafızlık Sistemi (20 Tur Ham–Has)',
    summary:
      'Geleneksel Kur’an kursu usulüne göre cüz sonundan başa dönüşümlü 20 tur Ham–Has takibini Ezber Atölyesinde yönetin.',
    bullets: [
      {
        lead: '20 Tur Dönüşümlü Akış:',
        text: 'Her turda 30 cüzün ilgili sayfalarını (20. sayfadan 1. sayfaya) önce "Ham" olarak çalışın, pekiştikçe "Has" onayına çevirin.',
      },
      {
        lead: '30. Cüz & Ara Seviye Sihirbazı:',
        text: '30. cüzü başta veya sonda tamamlama tercihi seçin; hâlihazırda ileri turdaki öğrenciler için geçmiş turları tek adımda işaretleyin.',
      },
      {
        lead: 'Ham + Has Bağlantı Tekrarı:',
        text: 'Günün yeni sayfasını mevcut Has sayfalarınızla birleştirerek tek oturumda kesintisiz tekrar başlatın.',
      },
    ],
    keywords:
      'klasik hafızlık 20 tur ham has 30 cüz dönüşümlü osmanlı diyanet bağlantı ara seviye sihirbaz ezber',
    ctaLabel: 'Klasik Hafızlığı Aç',
    actionId: 'classical_hifz',
  },
  {
    id: 'hatim_planner_guide',
    category: 'hifz_hatim',
    categoryLabel: 'Ezber & Hatim',
    title: '30 Cüz Hatim Planlayıcısı & Hatim Ayracı Senkronu',
    summary:
      '604 sayfalık 30 Cüz Hatim Planlayıcısı ile günlük okuma disiplininizi tek ekrandan takip edin.',
    bullets: [
      {
        lead: 'Esnek Hedef Modları:',
        text: 'Günlük sayfa hedefi, hedef bitiş tarihi ya da serbest 30 cüz işaretleme modlarından birini seçin.',
      },
      {
        lead: 'Otomatik Ayraç Senkronu:',
        text: 'Mushafta yeşil "Hatim Ayracımı Buraya Taşı" butonuna bastığınızda aktif planınız o sayfaya kadar anında güncellenir.',
      },
      {
        lead: 'Hatim Geçmişi:',
        text: '604 sayfanın tamamı bittiğinde hatminiz tarih ve notuyla Hatim Geçmişinize kaydedilir.',
      },
    ],
    keywords: 'hatim 30 cüz planlayıcı günlük sayfa hedef tarih ayraç mushaf geçmiş',
    ctaLabel: 'Hatim Planlayıcısını Aç',
    actionId: 'hatim_planner',
  },
  {
    id: 'personal_verse_notes',
    category: 'fihrist_exam',
    categoryLabel: 'Fihrist & Sınav',
    title: 'Ayet Notları & Araştırma Defteri',
    summary:
      'Herhangi bir ayete renkli ve etiketli tefekkür notları ekleyin, konular altında derleyip A4 PDF çıktısı alın.',
    bullets: [
      {
        lead: 'Anında Erişim:',
        text: 'Notlu ayetlerde renkli "Notum" rozeti görünür; tüm notlar Fihrist → Defterim → Ayet Notlarım altında toplanır.',
      },
      {
        lead: 'Arama & Filtreleme:',
        text: 'Renk/etiket filtreleriyle notlarınızı tarayın; Ctrl+K Genel Arama da kişisel notlarınızda arama yapar.',
      },
      {
        lead: 'Otomatik Yedek Dâhiliyeti:',
        text: 'Kişisel notlarınız, araştırma konularınız ve Hatim ilerlemeniz Ayarlar → Tam Yedek (.json) dosyasına otomatik eklenir.',
      },
    ],
    keywords: 'kişisel ayet notu tefekkür etiket renk defterim araştırma arama pdf yedek',
    ctaLabel: 'Ayet Notlarımı Aç',
    actionId: 'personal_notes',
  },
  {
    id: 'study_desk_pool',
    category: 'fihrist_exam',
    categoryLabel: 'Fihrist & Sınav',
    title: 'Aktif Çalışma Havuzu & Çalışma Masam Profilleri',
    summary:
      'Ana Sayfayı ve sınav/oyun kapsamını kendi hedefinize göre tek dokunuşla sadeleştirin veya genişletin.',
    bullets: [
      {
        lead: '4 Hazır Odak Profili:',
        text: 'Okuma & Hatim, Hafızlık & Ezber, Öğrenci & Sınav veya Tam Kapsamlı profillerden birini seçerek Ana Sayfa satırlarını düzenleyin.',
      },
      {
        lead: 'Çalışma Havuzu Kapsamı:',
        text: 'Havuz; Ana Sayfa ayet kartını, Sınav ve Oyun surelerini belirler. Okuma ekranında ise 114 surenin tamamı her zaman açıktır.',
      },
      {
        lead: 'Sınav Vurgusunu Gizleme:',
        text: 'Yalnızca okuma/hatim odaklı çalışırken soru sayaçlarını ve sınav vitrinini gizleyebilirsiniz.',
      },
    ],
    keywords:
      'çalışma masam özelleştir odak profili havuz aktif 114 sure genişlet sadeleştir sınav gizle',
    ctaLabel: 'Ana Sayfada Özelleştir',
    actionId: 'customize_desk',
  },
  {
    id: 'a4_exam_pdf',
    category: 'fihrist_exam',
    categoryLabel: 'Fihrist & Sınav',
    title: 'A4 Yazılı Sınav Kağıdı & 7 Eğitsel Oyun',
    summary:
      'Kurum, ders ve tarih bilgili cevap anahtarlı A4 yazılı kağıtları hazırlayın veya sınıf içi 7 eğitsel oyun oynayın.',
    bullets: [
      {
        lead: 'İki Sütunlu A4 Baskı:',
        text: 'Sure, zorluk ve soru sayısını seçin; tarayıcı yazdırma ekranından "PDF olarak kaydet" ile dijital sınav kâğıdı oluşturun.',
      },
      {
        lead: 'Tek / 2 Oyuncu Yarışmaları:',
        text: 'Akıllı tahtada veya mobilde sure aileleri, ayet eşleştirme ve hızlı bilgi yarışmalarıyla dersi etkileşimli hâle getirin.',
      },
    ],
    keywords: 'a4 sınav yazılı kağıt pdf kaydet yazdır öğretmen cevap anahtarı baskı 7 oyun 2 oyuncu',
    ctaLabel: 'Sınav Merkezini Aç',
    actionId: 'open_exam',
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
      { keys: ['Ctrl', 'K'], label: 'Hızlı Arama (Sure, ayet no, 27 meal ve notlarda ara)' },
      { keys: ['Esc'], label: 'Açık pencereyi, çekmeceyi veya sunum modunu kapat' },
    ],
    keywords: 'genel kısayol ctrl k arama esc kapat',
  },
  {
    id: 'reader_presentation',
    title: 'Okuma & Sunum Modu',
    items: [
      { keys: ['←', '→'], label: 'Mushaf, kitap ve Sunum Modunda ayet/sayfa gezinme' },
      { keys: ['Space'], label: 'Sunum Modunda tilaveti oynat / duraklat' },
      { keys: ['F'], label: 'Sunum Modunda tam ekranı aç / kapat (Akıllı Tahta)' },
    ],
    keywords: 'okuma sunum akıllı tahta tam ekran sayfa space f ok tuşları',
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
    description: '42. sayfayı doğrudan 604 sayfa Diyanet Mushafı görünümünde açar.',
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const UserGuideModal: React.FC = () => {
  const {
    isUserGuideOpen,
    userGuideTab,
    openUserGuide,
    closeUserGuide,
    setActiveTab,
    openSettingsModal,
    openIntroSplash,
    navigateToMemorizeUnit,
    openHatimModal,
    navigateToFihrist,
    openFeedbackModal,
  } = useAppStore();

  const [activeTab, setLocalTab] = useState<UserGuideTabId>(userGuideTab);
  const [moduleCategory, setModuleCategory] = useState<ModuleCategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  useBackButtonGuard('user_guide_modal', isUserGuideOpen, closeUserGuide);

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) {
        window.clearTimeout(id);
      }
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (isUserGuideOpen) {
      setLocalTab(userGuideTab);
    } else {
      setSearchQuery('');
      setCopiedUrlId(null);
      setShareToast(null);
      setLinkCopied(false);
    }
  }, [isUserGuideOpen, userGuideTab]);

  useEffect(() => {
    if (!isUserGuideOpen) return;
    return acquireBodyScrollLock();
  }, [isUserGuideOpen]);

  // Sekme, kategori, arama veya açılış değişiminde içerik kaydırmasını en başa al
  useEffect(() => {
    if (!isUserGuideOpen) return;
    const el = contentScrollRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      el.scrollTop = 0;
    }
  }, [isUserGuideOpen, activeTab, moduleCategory, searchQuery]);

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

  const handleModuleTipAction = useCallback(
    (actionId: ModuleTipActionId) => {
      sfxService.play('click');
      closeUserGuide();
      if (actionId === 'open_reader') {
        setActiveTab('reader');
      } else if (actionId === 'open_exam') {
        setActiveTab('exam');
      } else if (actionId === 'classical_hifz') {
        navigateToMemorizeUnit(undefined, false, 'classical');
      } else if (actionId === 'hatim_planner') {
        openHatimModal();
      } else if (actionId === 'personal_notes') {
        navigateToFihrist({ subTab: 'notebook', notebookSubTab: 'notes' });
      } else if (actionId === 'customize_desk') {
        setActiveTab('home');
      }
    },
    [closeUserGuide, navigateToFihrist, navigateToMemorizeUnit, openHatimModal, setActiveTab],
  );

  const handleCopyDeepLink = useCallback(
    async (id: string, url: string) => {
      sfxService.play('click');
      const ok = await copyTextToClipboard(url);
      if (ok) {
        setCopiedUrlId(id);
        scheduleTimer(() => {
          setCopiedUrlId((prev) => (prev === id ? null : prev));
        }, 2000);
      }
    },
    [scheduleTimer],
  );

  const handleCopyAppLink = useCallback(async () => {
    sfxService.play('click');
    const ok = await copyTextToClipboard(APP_SHARE_URL);
    if (ok) {
      setLinkCopied(true);
      scheduleTimer(() => setLinkCopied(false), 2000);
    }
  }, [scheduleTimer]);

  const handleNativeOrCopyShare = useCallback(async () => {
    sfxService.play('click');
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: APP_SHARE_TITLE,
          text: APP_SHARE_SHORT_TEXT,
          url: APP_SHARE_URL,
        });
        return;
      } catch (err) {
        const errName = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        if (errName === 'AbortError') {
          return;
        }
        // Desteklenmeyen/reddedilen ortamda pano yedeğine düş
      }
    }
    const ok = await copyTextToClipboard(APP_SHARE_FULL_MESSAGE);
    if (ok) {
      setShareToast('Paylaşım bağlantısı kopyalandı');
      scheduleTimer(() => setShareToast(null), 2600);
    }
  }, [scheduleTimer]);

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
    if (isSearching) {
      return MODULE_TIPS.filter((item) =>
        normalizeForSearch(
          `${item.title} ${item.categoryLabel} ${item.summary} ${item.bullets.map((b) => `${b.lead} ${b.text}`).join(' ')} ${item.keywords}`,
        ).includes(normalizedQuery),
      );
    }
    if (moduleCategory === 'all') return MODULE_TIPS;
    return MODULE_TIPS.filter((item) => item.category === moduleCategory);
  }, [isSearching, moduleCategory, normalizedQuery]);

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
      normalizeForSearch(
        `${item.label} ${item.url} ${item.description} link url bağla paylaş`,
      ).includes(normalizedQuery),
    );
  }, [isSearching, normalizedQuery]);

  const matchesOfflineBackup = useMemo(() => {
    if (!isSearching) return false;
    return normalizeForSearch(
      'çevrimdışı offline paket indir önbellek internet tilavet pwa ana ekrana ekle ios safari android yedek json aktar veri geri yükle kaynaklar atıf telif bilgilendirme ticari değil',
    ).includes(normalizedQuery);
  }, [isSearching, normalizedQuery]);

  const matchesShareCard = useMemo(() => {
    if (!isSearching) return false;
    return normalizeForSearch(
      'paylaş davet tavsiye et arkadaş öğrenci whatsapp telegram kopyala link kuran.muallimun.net hayır',
    ).includes(normalizedQuery);
  }, [isSearching, normalizedQuery]);

  const totalSearchMatches =
    filteredQuickStart.length +
    filteredModules.length +
    filteredShortcuts.length +
    filteredDeepLinks.length +
    (matchesOfflineBackup ? 1 : 0) +
    (matchesShareCard ? 1 : 0);

  if (!isUserGuideOpen) return null;

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(APP_SHARE_FULL_MESSAGE)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(APP_SHARE_URL)}&text=${encodeURIComponent(APP_SHARE_SHORT_TEXT)}`;

  const renderAppShareCard = () => (
    <div
      className="rounded-2xl border p-4 sm:p-5 space-y-3.5 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, var(--brand-primary-soft) 0%, var(--bg-surface-soft) 55%, var(--brand-accent-soft) 100%)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-3.5">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="w-11 h-11 rounded-xl p-0.5 shrink-0 shadow-sm flex items-center justify-center"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <BrandMark className="w-10 h-10" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3
              className="text-sm sm:text-[15px] font-extrabold tracking-tight leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              Bu Hayra Ortak Olun · Platformu Paylaşın
            </h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Ücretsiz ve reklamsız Kur&apos;an, 27 meal/tefsir, ezber ve sınav platformunu
              dostlarınız, öğrencileriniz veya çalışma gruplarınızla tek dokunuşla paylaşabilirsiniz.
            </p>
            <div className="pt-0.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyAppLink()}
                title="Bağlantıyı kopyalamak için dokunun"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11.5px] font-mono font-bold transition-colors cursor-pointer hover:opacity-90 touch-manipulation"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: linkCopied ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                <span>kuran.muallimun.net</span>
                {linkCopied ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Copy className="w-3 h-3 shrink-0 opacity-70" />
                )}
              </button>
              {shareToast && (
                <span
                  role="status"
                  className="text-[11.5px] font-extrabold inline-flex items-center gap-1"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{shareToast}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Pratik Paylaşım Seçeneği */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => void handleNativeOrCopyShare()}
          className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95 shadow-sm whitespace-nowrap touch-manipulation"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" />
          <span>Paylaş</span>
        </button>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sfxService.play('click')}
          className="min-h-[40px] px-3 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90 whitespace-nowrap touch-manipulation"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>WhatsApp</span>
        </a>

        <a
          href={telegramHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sfxService.play('click')}
          className="min-h-[40px] px-3 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90 whitespace-nowrap touch-manipulation"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <Send className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>Telegram</span>
        </a>

        <button
          type="button"
          onClick={() => void handleCopyAppLink()}
          className="min-h-[40px] px-3 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90 whitespace-nowrap touch-manipulation"
          style={{
            backgroundColor: linkCopied ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
            borderColor: linkCopied ? 'var(--brand-primary)' : 'var(--border-strong)',
            color: linkCopied ? 'var(--brand-primary-text)' : 'var(--text-primary)',
          }}
        >
          {linkCopied ? (
            <>
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Kopyalandı ✓</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 shrink-0" />
              <span>Linki Kopyala</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
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
        className="w-full md:max-w-3xl lg:max-w-4xl max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2.5 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="user-guide-modal-title"
                className="text-sm sm:text-lg font-extrabold tracking-tight truncate"
              >
                Muallimun Kullanım Kılavuzu
              </h2>
              <p className="hidden sm:block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                604 sayfa Diyanet Mushafı, 27 meal/tefsir, sunum, ezber, sınav ve paylaşım rehberi
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

        {/* Arama Çubuğu + Tek Satırlı 4 Sekme */}
        <div
          className="px-3.5 py-2.5 sm:px-5 sm:py-3 border-b space-y-2 sm:space-y-2.5 shrink-0"
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
              placeholder="Rehberde ara (ezber, tecvit, sınav...)"
              aria-label="Kullanım kılavuzunda ara"
              className="w-full min-h-[38px] sm:min-h-[42px] pl-9 pr-9 rounded-xl border text-sm font-medium outline-none transition-colors focus:border-teal-600"
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
                  if (shouldAutoFocusSearchInput()) {
                    searchInputRef.current?.focus();
                  }
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
              className="grid grid-cols-4 gap-1 sm:gap-1.5"
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
                    className="min-h-[36px] sm:min-h-[40px] px-1 sm:px-2.5 py-1.5 sm:py-2 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-colors cursor-pointer whitespace-nowrap touch-manipulation min-w-0"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: isActive ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: isActive ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 hidden min-[380px]:block sm:block" />
                    <span className="truncate hidden sm:inline">{tab.label}</span>
                    <span className="truncate sm:hidden">{tab.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Kaydırılabilir İçerik Gövdesi */}
        <div
          ref={contentScrollRef}
          className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-4"
        >
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
                Örnek aramalar: sunum, tecvit, şeyh hamdullah, ezber, A4 sınav, paylaş, çevrimdışı,
                kısayol.
              </p>
            </div>
          )}

          {/* ==============================================================
              SEKME 1: HIZLI BAŞLANGIÇ
              ============================================================== */}
          {((!isSearching && activeTab === 'quickstart') ||
            (isSearching && (filteredQuickStart.length > 0 || matchesShareCard))) && (
            <section className="space-y-4">
              {/* 3 Adımda Nasıl Başlarım? Şeridi */}
              {!isSearching && (
                <div
                  className="rounded-2xl border p-3.5 sm:p-4 space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="space-y-0.5">
                    <h3 className="text-xs sm:text-sm font-extrabold tracking-tight">
                      3 Adımda Nasıl Başlarım?
                    </h3>
                    <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Verileriniz cihazınızda güvenle saklanır
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {QUICKSTART_STEPS.map((item) => (
                      <div
                        key={item.step}
                        className="rounded-xl border p-3 flex items-start gap-2.5"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <span
                          className="w-6 h-6 rounded-lg text-xs font-extrabold tabular-nums flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: 'var(--brand-primary-soft)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          {item.step}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold leading-snug">{item.title}</p>
                          <p
                            className="text-[11.5px] leading-snug mt-0.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {item.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4 Hedef Kullanıcı Rotası */}
              {filteredQuickStart.length > 0 && (
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
                          className="w-full min-h-[40px] px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90 whitespace-nowrap touch-manipulation"
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
              )}

              {/* Şık Uygulamayı Paylaş & Tavsiye Et Kartı */}
              {(!isSearching || matchesShareCard) && renderAppShareCard()}
            </section>
          )}

          {/* ==============================================================
              SEKME 2: MODÜLLER & İPUÇLARI
              ============================================================== */}
          {((!isSearching && activeTab === 'modules') ||
            (isSearching && filteredModules.length > 0)) && (
            <section className="space-y-3">
              {/* Kategori Filtre Çipleri */}
              {!isSearching && (
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Modül kategorisi filtresi"
                >
                  {MODULE_CATEGORIES.map((cat) => {
                    const isActive = moduleCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          sfxService.play('click');
                          setModuleCategory(cat.id);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer whitespace-nowrap touch-manipulation"
                        style={{
                          backgroundColor: isActive
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface-soft)',
                          borderColor: isActive ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                        }}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredModules.map((tip) => (
                  <article
                    key={tip.id}
                    className="rounded-2xl border p-4 flex flex-col justify-between gap-3"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="space-y-2.5">
                      <div className="space-y-0.5">
                        <p
                          className="text-[11px] font-bold"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {tip.categoryLabel}
                        </p>
                        <h3 className="text-sm font-extrabold leading-snug">{tip.title}</h3>
                      </div>

                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {tip.summary}
                      </p>

                      <ul className="space-y-1.5 text-xs leading-relaxed">
                        {tip.bullets.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span
                              className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                              style={{ backgroundColor: 'var(--brand-primary)' }}
                            />
                            <span style={{ color: 'var(--text-secondary)' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{bullet.lead}</strong>{' '}
                              {bullet.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {tip.ctaLabel && tip.actionId && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleModuleTipAction(tip.actionId!)}
                          className="min-h-[38px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors hover:opacity-90 whitespace-nowrap touch-manipulation"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--brand-primary)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <span>{tip.ctaLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ==============================================================
              SEKME 3: ÇEVRİMDIŞI & YEDEK
              ============================================================== */}
          {((!isSearching && activeTab === 'offline_backup') ||
            (isSearching && matchesOfflineBackup)) && (
            <section className="space-y-3.5">
              {/* Net Çevrimdışı / Çevrimiçi Ayrım Bilgi Kutusu */}
              <div
                className="rounded-2xl border p-4 space-y-2.5"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <p
                  className="text-xs sm:text-sm font-extrabold leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Metin, meal ve tecvit çevrimdışı çalışır; sesli tilavet için internet bağlantısı
                  gerekir.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div
                    className="rounded-xl border px-3 py-2 flex items-start gap-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <WifiOff
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>İnternetsiz:</strong> 604
                      sayfa Diyanet Mushafı, seçili mealler, renkli tecvit, fihrist, notlar ve sınav
                      soruları.
                    </span>
                  </div>
                  <div
                    className="rounded-xl border px-3 py-2 flex items-start gap-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <Wifi
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{ color: 'var(--brand-accent-text)' }}
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>İnternetle:</strong> 28
                      kurrâ sesli tilaveti, Türkçe meal sesi ve tek kelime telaffuz kayıtları.
                    </span>
                  </div>
                </div>
              </div>

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
                <ul
                  className="space-y-1.5 text-xs leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <li>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      Android &amp; Masaüstü (Chrome / Edge):
                    </strong>{' '}
                    Sol menüdeki veya Ayarlar içindeki <em>&ldquo;Uygulamayı Kur&rdquo;</em>{' '}
                    butonunu ya da adres çubuğundaki yükleme simgesini kullanabilirsiniz.
                  </li>
                  <li>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      iPhone &amp; iPad (Safari):
                    </strong>{' '}
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
                  Tüm çalışma verileriniz (ayraçlar, 30 Cüz Hatim planı, kişisel ayet notları,
                  araştırma defterleri, ezber havuzu, Klasik 20 Tur Ham–Has hafızlık kaydı, Çalışma
                  Masam tercihleri, sınav/oyun ilerlemesi ve ayarlar) yalnızca kendi cihazınızda
                  saklanır. Ayarlar penceresinden tek tıkla <code>.json</code> yedeği indirebilir,
                  dilediğiniz zaman iki aşamalı güvenli onayla geri yükleyebilirsiniz.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      closeUserGuide();
                      openSettingsModal();
                    }}
                    className="min-h-[40px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90 whitespace-nowrap touch-manipulation"
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

              {/* Veri Kaynakları ve Bilgilendirme */}
              <div
                className="rounded-2xl border p-4 space-y-2"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <FileText
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <h3 className="text-sm font-extrabold">Veri Kaynakları ve Bilgilendirme</h3>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Muallimun Kur&apos;an &amp; Meal; ticari bir amaç gütmeksizin eğitim, okuma,
                  hafızlık ve ilmî araştırma amacıyla hazırlanmıştır. Uygulamada sunulan 604 sayfa
                  Diyanet Mushafı düzeni, 27 meal ve tefsir kataloğu ile 28 okuyucuya ait sesli
                  tilavet arşivi, ilgili müelliflere, kurumlara ve açık ilmî kaynaklara atıfla
                  kullanıcıların istifadesine sunulmaktadır.
                </p>
              </div>
            </section>
          )}

          {/* ==============================================================
              SEKME 4: KISAYOLLAR & DOĞRUDAN BAĞLANTILAR
              ============================================================== */}
          {((!isSearching && activeTab === 'shortcuts') ||
            (isSearching && (filteredShortcuts.length > 0 || filteredDeepLinks.length > 0))) && (
            <section className="flex flex-col gap-4">
              {/* Mobilde en üstte pratik Dokunmatik İpuçları */}
              {!isSearching && (
                <div
                  className="sm:hidden rounded-2xl border p-3.5 space-y-2.5"
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
                    <h3 className="text-sm font-extrabold">Mobil Dokunmatik İpuçları</h3>
                  </div>
                  <ul
                    className="space-y-1.5 text-xs leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <li className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      />
                      <span>
                        <strong style={{ color: 'var(--text-primary)' }}>Yatay parmak kaydırma:</strong>{' '}
                        Mushaf sayfaları ve Sunum Modu ayetleri arasında hızlıca ileri–geri geçin.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      />
                      <span>
                        <strong style={{ color: 'var(--text-primary)' }}>Ayete dokunma:</strong>{' '}
                        Mushaf ve Kitap modunda ayete dokunarak meal, kelime analizi, dinleme ve
                        not alma menüsünü açın.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      />
                      <span>
                        <strong style={{ color: 'var(--text-primary)' }}>Secâvend &amp; tecvit işaretleri:</strong>{' '}
                        Durak harflerine ve renkli tecvit kısımlarına dokunarak anlık kural
                        açıklamasını görün.
                      </span>
                    </li>
                  </ul>
                </div>
              )}

              {/* Masaüstünde (sm+) doğrudan açık Klavye Kısayolları */}
              {filteredShortcuts.length > 0 && (
                <div
                  className={`${
                    isSearching ? 'grid' : 'hidden sm:grid'
                  } grid-cols-1 sm:grid-cols-2 gap-3`}
                >
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
                  className="rounded-2xl border p-3.5 sm:p-4 space-y-3"
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
                      <h3 className="text-sm font-extrabold">
                        Doğrudan Bağlantı (Deep-Link) Adresleri
                      </h3>
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
                            className="min-h-[36px] px-3 rounded-lg border text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer hover:opacity-90 whitespace-nowrap"
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

              {/* Mobilde açılır/kapanır Fiziksel Klavye Kısayolları (< sm) */}
              {!isSearching && filteredShortcuts.length > 0 && (
                <details
                  className="sm:hidden group rounded-2xl border overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <summary className="list-none [&::-webkit-details-marker]:hidden min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span className="inline-flex items-center gap-2 text-xs font-extrabold">
                      <Keyboard
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--brand-primary-text)' }}
                      />
                      <span>Klavye Kısayolları (Bilgisayar / Tablet)</span>
                    </span>
                    <ChevronDown
                      className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180"
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </summary>
                  <div
                    className="px-3.5 pb-3.5 pt-2.5 border-t space-y-3"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {filteredShortcuts.map((group) => (
                      <div
                        key={`mobile-kb-${group.id}`}
                        className="rounded-xl border p-3 space-y-2"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <h4 className="text-xs font-extrabold">{group.title}</h4>
                        <div className="space-y-1.5">
                          {group.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-start justify-between gap-2 text-[11.5px]"
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
                                    className="px-1.5 py-0.5 rounded-md border text-[10.5px] font-extrabold font-mono"
                                    style={{
                                      backgroundColor: 'var(--bg-surface-soft)',
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
                </details>
              )}
            </section>
          )}
        </div>

        {/* Sabit Alt Çubuk — Mobilde Tek Satır (Paylaş + Tanıtım + Bildir), Masaüstünde Tam Bar */}
        <div
          className="px-3 py-2.5 sm:px-5 sm:py-3 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))] border-t flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span
            className="hidden sm:inline-flex text-[11px] font-semibold items-center gap-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>kuran.muallimun.net · Kullanım Rehberi</span>
          </span>

          <div className="w-full sm:w-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => void handleNativeOrCopyShare()}
              className="flex-1 sm:flex-initial min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 whitespace-nowrap touch-manipulation"
              style={{
                backgroundColor: shareToast
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              {shareToast ? (
                <>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Uygulamayı Paylaş</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                closeUserGuide();
                openIntroSplash();
              }}
              className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 whitespace-nowrap touch-manipulation shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Sparkles
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--brand-accent-text)' }}
              />
              <span>Tanıtım</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                closeUserGuide();
                openFeedbackModal();
              }}
              className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 whitespace-nowrap touch-manipulation shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <MessageSquareHeart
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span className="hidden sm:inline">Görüş / Hata Bildir</span>
              <span className="sm:hidden">Bildir</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                closeUserGuide();
              }}
              className="hidden sm:inline-flex min-h-[38px] px-4 rounded-xl text-xs font-extrabold text-white items-center justify-center cursor-pointer hover:opacity-95 whitespace-nowrap touch-manipulation shrink-0"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
