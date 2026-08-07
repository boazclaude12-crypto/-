"use client";

import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import Link from "next/link";
import { Rubik, Heebo } from 'next/font/google';
import {
  BarChart3,
  TrendingUp,
  Shield,
  Target,
  ChevronLeft,
  ChevronDown,
  Check,
  Menu,
  X,
  ArrowUpRight,
  Upload,
  Camera,
  Loader2,
  Clock,
  Maximize2,
  LogIn,
  UserPlus,
  BookOpen,
  Zap,
  Star,
  TrendingDown,
  Activity,
  DollarSign,
} from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Reveal from '../components/Reveal';

const AuthModal = dynamic(() => import('../components/AuthModal'), { ssr: false });

const rubik = Rubik({ subsets: ['latin', 'hebrew'] });
const heebo = Heebo({ subsets: ['latin', 'hebrew'] });

const bgGraphImages = [
  "https://images.unsplash.com/photo-1535320903710-d993d3d77d29?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1642790551116-18ced15e486f?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1640340434855-6084b1f4901c?auto=format&fit=crop&w=1600&q=80",
];

interface Plan {
  id: string;
  name: string;
  daily_limit: number;
  price: number;
  is_monthly: boolean;
  features?: string[];
}

interface CoinPrice {
  id: string;
  symbol: string;
  price: number;
  change24h: number;
}

// Shown when the plans API is unreachable, so the pricing section is never blank.
const FALLBACK_PLANS: Plan[] = [
  {
    id: "1", name: "בסיסי", daily_limit: 5, price: 49, is_monthly: true,
    features: ["5 ניתוחי גרפים ביום", "זיהוי נקודות כניסה ויציאה", "סטופ-לוס וטייק-פרופיט", "גישה לאזור הלימוד"],
  },
  {
    id: "2", name: "מקצועי", daily_limit: 25, price: 99, is_monthly: true,
    features: ["25 ניתוחי גרפים ביום", "כל התכונות של המסלול הבסיסי", "ניתוח אינדיקטורים מתקדם", "תמיכה בכל סוגי הנכסים", "עדיפות בתור הניתוח"],
  },
  {
    id: "3", name: "פרימיום", daily_limit: 999, price: 199, is_monthly: true,
    features: ["ניתוחים ללא הגבלה", "כל התכונות של המסלול המקצועי", "התראות בזמן אמת", "מחשבון רווח/הפסד מתקדם", "תמיכה אישית בוואטסאפ"],
  },
  {
    id: "4", name: "בסיסי", daily_limit: 5, price: 412, is_monthly: false,
    features: ["5 ניתוחי גרפים ביום", "זיהוי נקודות כניסה ויציאה", "סטופ-לוס וטייק-פרופיט", "גישה לאזור הלימוד", "חיסכון של 30% מול חיוב חודשי"],
  },
  {
    id: "5", name: "מקצועי", daily_limit: 25, price: 832, is_monthly: false,
    features: ["25 ניתוחי גרפים ביום", "כל התכונות של המסלול הבסיסי", "ניתוח אינדיקטורים מתקדם", "תמיכה בכל סוגי הנכסים", "חיסכון של 30% מול חיוב חודשי"],
  },
  {
    id: "6", name: "פרימיום", daily_limit: 999, price: 1672, is_monthly: false,
    features: ["ניתוחים ללא הגבלה", "כל התכונות של המסלול המקצועי", "התראות בזמן אמת", "תמיכה אישית בוואטסאפ", "חיסכון של 30% מול חיוב חודשי"],
  },
];

function Home() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [isAnnual, setIsAnnual] = useState<boolean>(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [prices, setPrices] = useState<CoinPrice[]>([]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get('/api/prices');
        if (!cancelled) setPrices(res.data.prices.filter((p: CoinPrice) => p.price > 0));
      } catch {
        // ticker stays hidden
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(h > 0 ? (window.scrollY / h) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const authAction = searchParams.get('auth');
    if (authAction) {
      if (authAction === 'signup') { setAuthModalMode('signup'); setIsAuthModalOpen(true); }
      else if (authAction === 'login') { setAuthModalMode('login'); setIsAuthModalOpen(true); }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [searchParams]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
    };
    checkAuth();
  }, []);

  const openLoginModal = () => { setAuthModalMode('login'); setIsAuthModalOpen(true); };
  const openSignupModal = () => { setAuthModalMode('signup'); setIsAuthModalOpen(true); };
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const handleActionButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoggedIn) router.push('/dashboard');
    else openLoginModal();
  };

  const sliderImages = [
    "https://i.imgur.com/dfBf8Mf.jpeg",
    "https://i.imgur.com/Zhyo6Q8.jpeg",
    "https://i.imgur.com/2mFWZgi.jpeg",
    "https://i.imgur.com/kyGyMdA.jpeg",
    "https://i.imgur.com/jXo6954.jpeg",
  ];
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isSliderVisible, setIsSliderVisible] = useState(false);
  const testimonialsSectionRef = useRef<HTMLElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNextSlide = () => setCurrentSlide((prev) => (prev + 1) % sliderImages.length);
  const handlePrevSlide = () => setCurrentSlide((prev) => (prev - 1 + sliderImages.length) % sliderImages.length);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setIsSliderVisible(entry.isIntersecting), { threshold: 0.1 });
    if (testimonialsSectionRef.current) observer.observe(testimonialsSectionRef.current);
    return () => { if (testimonialsSectionRef.current) observer.unobserve(testimonialsSectionRef.current); };
  }, []);

  useEffect(() => {
    if (!isSliderVisible) return;
    const interval = setInterval(() => setCurrentSlide((prev) => (prev + 1) % sliderImages.length), 5000);
    return () => clearInterval(interval);
  }, [sliderImages.length, isSliderVisible]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) element.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await axios.get("/api/plans");
        setPlans(res.data.plans?.length ? res.data.plans : FALLBACK_PLANS);
      } catch {
        setPlans(FALLBACK_PLANS);
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  useEffect(() => {
    const sectionIds = ['testimonials', 'how-it-works-section', 'features', 'learning', 'pricing', 'faq', 'cta'];
    const observers: IntersectionObserver[] = [];
    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { threshold: 0.25, rootMargin: '-10% 0px -10% 0px' }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(obs => obs.disconnect());
  }, []);

  useEffect(() => {
    if (plans && plans.length > 0) {
      const filtered = plans
        .filter((plan) => plan.is_monthly !== isAnnual && Number(plan.id) !== 7)
        .sort((a, b) => Number(a.id) - Number(b.id));
      setFilteredPlans(filtered);
    }
  }, [plans, isAnnual]);

  const [animationStep, setAnimationStep] = useState<'upload' | 'loading' | 'result'>('upload');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [dots, setDots] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: -100, y: 50 });

  useEffect(() => {
    const animationCycle = setInterval(() => {
      setAnimationStep('upload');
      setPreviewUrl(null);
      setLoadingProgress(0);
      setIsDragging(false);
      setDragPosition({ x: -100, y: 50 });
    }, 15000);
    return () => clearInterval(animationCycle);
  }, []);

  useEffect(() => {
    if (animationStep === 'upload') {
      const startDragTimeout = setTimeout(() => {
        setIsDragging(true);
        const dragInterval = setInterval(() => {
          setDragPosition(prev => {
            if (prev.x >= 50) {
              clearInterval(dragInterval);
              setTimeout(() => {
                setIsDragging(false);
                setPreviewUrl('https://i.imgur.com/kppbqfT.png');
                setTimeout(() => setAnimationStep('loading'), 1500);
              }, 300);
              return prev;
            }
            return { x: prev.x + 2, y: prev.y };
          });
        }, 70);
      }, 1500);
      return () => clearTimeout(startDragTimeout);
    }
    if (animationStep === 'loading') {
      setLoadingProgress(0);
      const loadingInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 100) { clearInterval(loadingInterval); setAnimationStep('result'); return 100; }
          return prev + 1.5;
        });
      }, 50);
      const dotsInterval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? '' : prev + '.');
      }, 500);
      return () => { clearInterval(loadingInterval); clearInterval(dotsInterval); };
    }
    if (animationStep === 'result') {
      const resultTimeout = setTimeout(() => {
        setAnimationStep('upload');
        setPreviewUrl(null);
        setIsDragging(false);
        setDragPosition({ x: -100, y: 50 });
      }, 5000);
      return () => clearTimeout(resultTimeout);
    }
  }, [animationStep]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0D0D14' }}>
        <div className="p-8 rounded-2xl flex flex-col items-center justify-center w-11/12 max-w-md" style={{ background: '#161622', border: '1px solid #F0B90B33' }}>
          <div className="mb-6 relative">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#F0B90B22', border: '1px solid #F0B90B55' }}>
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#F0B90B' }} />
              <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#F0B90B', borderTopColor: 'transparent' }}></div>
            </div>
          </div>
          <h1 className={`text-3xl font-bold text-center mb-3 ${rubik.className}`} style={{ color: '#F0B90B' }}>אשף המסחר</h1>
          <p className="mb-4" style={{ color: '#888' }}>אנחנו מכינים את המערכת בשבילך...</p>
          <div className="w-full h-2 rounded-full overflow-hidden mb-2" style={{ background: '#2a2a3a' }}>
            <div className="h-full rounded-full animate-pulse" style={{ background: 'linear-gradient(90deg, #F0B90B, #E05A20)', width: '60%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  const UploadAnimation = () => (
    <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: '#161622' }}>
      <h2 className={`text-lg font-bold text-center mb-4 ${rubik.className}`} style={{ color: '#F0B90B' }}>
        העלאת גרף לניתוח
      </h2>
      <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${previewUrl || isDragging ? 'border-[#F0B90B]' : 'border-gray-600'}`} style={{ background: previewUrl || isDragging ? '#F0B90B11' : '#0D0D14' }}>
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="max-h-52 mx-auto rounded-lg shadow-md" />
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#F0B90B22', border: '1px solid #F0B90B55' }}>
              <Upload className="h-6 w-6" style={{ color: '#F0B90B' }} />
            </div>
            <div className="space-y-1">
              <p style={{ color: '#aaa' }}>גרור תמונה לכאן או</p>
              <div className="flex items-center justify-center gap-2">
                <button className="font-medium" style={{ color: '#F0B90B' }}>בחר קובץ</button>
                <span style={{ color: '#555' }}>|</span>
                <button className="font-medium inline-flex items-center gap-1" style={{ color: '#F0B90B' }}>
                  <Camera className="h-4 w-4" />צלם תמונה
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {isDragging && (
        <div className="absolute pointer-events-none z-10 transition-all duration-50" style={{ left: `${dragPosition.x}%`, top: `${dragPosition.y}%`, transform: 'translate(-50%, -50%)' }}>
          <img src="https://i.imgur.com/kppbqfT.png" alt="Dragging" className="w-24 h-16 object-cover rounded-md shadow-lg opacity-90" style={{ border: '2px solid #F0B90B' }} />
        </div>
      )}
    </div>
  );

  const LoadingAnimation = () => (
    <div className="p-6 rounded-2xl text-center" style={{ background: '#161622' }}>
      <div className="mb-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#F0B90B22', border: '1px solid #F0B90B55' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#F0B90B' }} />
        </div>
        <h3 className={`text-lg font-bold mb-1 ${rubik.className}`} style={{ color: '#fff' }}>מנתח את הגרף{dots}</h3>
        <p className="text-sm" style={{ color: '#888' }}>הבינה המלאכותית מזהה תבניות ונקודות מפתח</p>
      </div>
      <div className="relative w-full h-2 rounded-full overflow-hidden mb-2" style={{ background: '#2a2a3a' }}>
        <div className="absolute top-0 left-0 h-full transition-all duration-300 rounded-full" style={{ width: `${loadingProgress}%`, background: 'linear-gradient(90deg, #F0B90B, #E05A20)' }} />
      </div>
      <p className="text-xs" style={{ color: '#666' }}>הניתוח יהיה מוכן בעוד {Math.max(0, Math.round((100 - loadingProgress) / 10))} שניות</p>
    </div>
  );

  const ResultAnimation = () => (
    <div className="rounded-2xl p-6" style={{ background: '#161622' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-lg font-semibold ${rubik.className}`} style={{ color: '#fff' }}>ביטקוין</h3>
        <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: '#F0B90B22', color: '#F0B90B' }}>קריפטו</span>
      </div>
      <img src={previewUrl || 'https://i.imgur.com/kppbqfT.png'} alt="Analysis" className="w-full h-32 object-cover rounded-lg mb-3" />
      <div className="flex items-center gap-1 text-xs mb-2" style={{ color: '#666' }}>
        <Clock className="h-3 w-3" /><span>עכשיו</span>
      </div>
      <p className="text-sm line-clamp-3 mb-2" style={{ color: '#ccc' }}>
        מחיר הביטקוין נמצא בעליה, וצפוי להתנגד ברמת $72,000. RSI מראה התחזקות בתנועה העולה.
      </p>
      <button className="text-sm font-medium inline-flex items-center gap-1" style={{ color: '#F0B90B' }}>
        <span>צפה בניתוח המלא</span><Maximize2 className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <div className={`min-h-screen ${heebo.className}`} style={{ background: '#0D0D14', direction: 'rtl' }}>

      {/* ===== HEADER ===== */}
      <header className={`fixed w-full z-50 transition-shadow ${rubik.className}`} style={{ background: '#0D0D14', borderBottom: '1px solid #F0B90B22', boxShadow: scrollProgress > 0.5 ? '0 4px 24px #0008' : 'none' }}>
        <div className="absolute bottom-0 left-0 h-0.5 transition-[width] duration-150" style={{ width: `${scrollProgress}%`, background: 'linear-gradient(90deg,#F0B90B,#E05A20)' }} />
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 text-xl font-bold" style={{ color: '#F0B90B' }}>
              <BarChart3 className="h-7 w-7" />
              <span>אשף המסחר</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)', color: '#000' }}>PRO</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {[
              { label: 'איך זה עובד?', id: 'how-it-works-section' },
              { label: 'יתרונות', id: 'features' },
              { label: 'לימוד', id: 'learning' },
              { label: 'תמחור', id: 'pricing' },
              { label: 'שאלות', id: 'faq' },
            ].map(({ label, id }) => (
              <button key={id} onClick={() => scrollToSection(id)} className="text-sm font-medium transition-colors hover:opacity-100" style={{ color: '#aaa' }}>
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <Link href="/dashboard">
                <button className="px-4 py-2 rounded-lg font-medium text-sm" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)', color: '#000' }}>
                  לוח בקרה
                </button>
              </Link>
            ) : (
              <>
                <button onClick={openLoginModal} className="px-4 py-2 rounded-lg font-medium text-sm border transition-colors" style={{ borderColor: '#F0B90B', color: '#F0B90B', background: 'transparent' }}>
                  <LogIn className="inline h-4 w-4 ml-1" />התחברות
                </button>
                <button onClick={openSignupModal} className="px-4 py-2 rounded-lg font-bold text-sm" style={{ background: 'linear-gradient(90deg,#E05A20,#F0B90B)', color: '#000' }}>
                  <UserPlus className="inline h-4 w-4 ml-1" />הרשמה חינם
                </button>
              </>
            )}
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden" style={{ color: '#F0B90B' }}>
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden px-4 pb-4 flex flex-col gap-3" style={{ background: '#0D0D14', borderTop: '1px solid #F0B90B22' }}>
            {[
              { label: 'איך זה עובד?', id: 'how-it-works-section' },
              { label: 'יתרונות', id: 'features' },
              { label: 'לימוד', id: 'learning' },
              { label: 'תמחור', id: 'pricing' },
              { label: 'שאלות נפוצות', id: 'faq' },
            ].map(({ label, id }) => (
              <button key={id} onClick={() => scrollToSection(id)} className="text-right py-2 border-b text-sm" style={{ color: '#ccc', borderColor: '#222' }}>
                {label}
              </button>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { openLoginModal(); setMobileMenuOpen(false); }} className="flex-1 py-2 rounded-lg text-sm border font-medium" style={{ borderColor: '#F0B90B', color: '#F0B90B' }}>
                התחברות
              </button>
              <button onClick={() => { openSignupModal(); setMobileMenuOpen(false); }} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ background: 'linear-gradient(90deg,#E05A20,#F0B90B)', color: '#000' }}>
                הרשמה
              </button>
            </div>
          </div>
        )}
      </header>

      <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} initialMode={authModalMode} />

      {/* ===== LIVE PRICE TICKER ===== */}
      {prices.length > 0 && (
        <div className="fixed top-[72px] w-full z-40 overflow-hidden" style={{ background: '#080810', borderBottom: '1px solid #F0B90B1A' }} dir="ltr">
          <div className="flex gap-8 py-2 whitespace-nowrap animate-ticker">
            {[...prices, ...prices, ...prices].map((c, i) => (
              <div key={`${c.id}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="font-bold" style={{ color: '#F0B90B' }}>{c.symbol}</span>
                <span style={{ color: '#ccc' }}>
                  ${c.price >= 1 ? c.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : c.price.toFixed(4)}
                </span>
                <span className="font-medium" style={{ color: c.change24h >= 0 ? '#4ade80' : '#f87171' }}>
                  {c.change24h >= 0 ? '▲' : '▼'} {Math.abs(c.change24h).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sidebar dots */}
      <nav className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-4" dir="ltr">
        {[
          { id: 'testimonials', label: 'ביקורות' },
          { id: 'how-it-works-section', label: 'איך זה עובד' },
          { id: 'features', label: 'יתרונות' },
          { id: 'learning', label: 'לימוד' },
          { id: 'pricing', label: 'תמחור' },
          { id: 'faq', label: 'שאלות' },
          { id: 'cta', label: 'התחל' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => scrollToSection(id)} className="group flex items-center gap-2" aria-label={label}>
            <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full border-2 transition-all duration-300 ${activeSection === id ? 'scale-125' : 'group-hover:scale-110'}`}
              style={{ background: activeSection === id ? '#F0B90B' : 'transparent', borderColor: activeSection === id ? '#F0B90B' : '#555' }} />
            <span className={`text-xs font-medium whitespace-nowrap transition-all duration-200 ${activeSection === id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              dir="rtl" style={{ color: activeSection === id ? '#F0B90B' : '#aaa' }}>
              {label}
            </span>
          </button>
        ))}
      </nav>

      {/* ===== HERO ===== */}
      <section className="pt-32 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 grid grid-cols-2 gap-2 p-4 opacity-10">
            {bgGraphImages.map((img, idx) => (
              <div key={idx} className="bg-cover bg-center" style={{ backgroundImage: `url(${img})` }}></div>
            ))}
          </div>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0D0D14 0%, #0D0D14CC 50%, #0D0D14 100%)' }}></div>
          <div className="absolute top-20 right-20 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: '#F0B90B' }}></div>
          <div className="absolute bottom-10 left-10 w-72 h-72 rounded-full opacity-10 blur-3xl" style={{ background: '#E05A20' }}></div>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center gap-12">
            <div className="w-full md:w-1/2 text-right">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6" style={{ background: '#F0B90B22', color: '#F0B90B', border: '1px solid #F0B90B44' }}>
                <span className="w-2 h-2 rounded-full animate-ping inline-block" style={{ background: '#F0B90B' }}></span>
                מעל 21,530 גרפים נותחו בהצלחה
              </div>

              <h1 className={`text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight ${rubik.className}`}>
                <span style={{ color: '#fff' }}>סחור כמו</span><br />
                <span style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>מקצוען 👑</span>
              </h1>

              <p className="text-lg mb-8 leading-relaxed" style={{ color: '#aaa' }}>
                בינה מלאכותית מתקדמת לניתוח גרפים — קבל נקודות כניסה ויציאה מדויקות, סטופ-לוס וטייק-פרופיט אוטומטיים.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <button onClick={handleActionButtonClick} className="px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-transform hover:scale-105" style={{ background: 'linear-gradient(90deg,#E05A20,#F0B90B)', color: '#000' }}>
                  התחל עכשיו — ₪1 בלבד
                  <ArrowUpRight className="h-5 w-5" />
                </button>
                <button onClick={() => scrollToSection('how-it-works-section')} className="px-8 py-4 rounded-xl font-medium text-lg border transition-colors" style={{ borderColor: '#F0B90B44', color: '#F0B90B', background: 'transparent' }}>
                  איך זה עובד?
                </button>
              </div>

              {/* Stats */}
              <div className="flex gap-8">
                {[
                  { num: '87%', label: 'דיוק' },
                  { num: '21K+', label: 'ניתוחים' },
                  { num: '1,000+', label: 'סוחרים' },
                ].map(({ num, label }) => (
                  <div key={label} className="text-right">
                    <div className={`text-2xl font-bold ${rubik.className}`} style={{ color: '#F0B90B' }}>{num}</div>
                    <div className="text-xs" style={{ color: '#666' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full md:w-1/2">
              <div className="rounded-2xl p-1 shadow-2xl" style={{ background: 'linear-gradient(135deg,#F0B90B33,#E05A2022)', border: '1px solid #F0B90B44' }}>
                <div className="rounded-xl overflow-hidden" style={{ background: '#0D0D14' }}>
                  <div className="relative" style={{ minHeight: '280px' }}>
                    <div className={`transition-opacity duration-500 ${animationStep === 'upload' ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}>
                      <UploadAnimation />
                    </div>
                    <div className={`transition-opacity duration-500 ${animationStep === 'loading' ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}>
                      <LoadingAnimation />
                    </div>
                    <div className={`transition-opacity duration-500 ${animationStep === 'result' ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}>
                      <ResultAnimation />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section id="testimonials" className="py-24 relative overflow-hidden" ref={testimonialsSectionRef}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#0D0D14 0%,#111120 50%,#0D0D14 100%)' }}></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full opacity-20" style={{ background: 'linear-gradient(180deg,transparent,#F0B90B,transparent)' }}></div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4" style={{ background: '#F0B90B22', color: '#F0B90B', border: '1px solid #F0B90B44' }}>
              <Star className="h-3 w-3" />הוכחות אמיתיות
            </div>
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`} style={{ color: '#fff' }}>
              תוצאות של <span style={{ color: '#F0B90B' }}>הלקוחות שלנו 🪄</span>
            </h2>
            <p style={{ color: '#888' }}>צפה בתוצאות האמיתיות של סוחרים שמשתמשים באשף המסחר</p>
          </div>

          {/* Trade result cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { pair: 'BTC/USD', pnl: '+4.8%', dir: 'Long', icon: <TrendingUp className="h-4 w-4" /> },
              { pair: 'ETH/USD', pnl: '+11.2%', dir: 'Long', icon: <TrendingUp className="h-4 w-4" /> },
              { pair: 'SOL/USD', pnl: '+7.6%', dir: 'Short', icon: <TrendingDown className="h-4 w-4" /> },
              { pair: 'XRP/USD', pnl: '+3.1%', dir: 'Long', icon: <Activity className="h-4 w-4" /> },
            ].map(({ pair, pnl, dir, icon }, i) => (
              <Reveal key={pair} delay={i * 80}>
              <div className="p-4 rounded-xl text-right h-full transition-all hover:-translate-y-1" style={{ background: '#161622', border: '1px solid #F0B90B22' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F0B90B22', color: '#F0B90B' }}>{dir}</span>
                  <span className="text-sm font-bold" style={{ color: '#fff' }}>{pair}</span>
                </div>
                <div className="flex items-center justify-end gap-1 text-2xl font-bold" style={{ color: '#4ade80' }}>
                  {icon}{pnl}
                </div>
              </div>
              </Reveal>
            ))}
          </div>

          {/* Slider */}
          <div className="relative max-w-4xl mx-auto">
            <div className="rounded-2xl p-4 shadow-2xl" style={{ background: '#161622', border: '1px solid #F0B90B33' }}>
              <img
                src={sliderImages[currentSlide]}
                alt={`תוצאת מסחר ${currentSlide + 1}`}
                loading="lazy"
                className="w-full rounded-xl object-cover"
                style={{ border: '1px solid #F0B90B44', minHeight: '320px', background: '#0D0D14' }}
              />
              <button onClick={handlePrevSlide} className="absolute top-1/2 left-6 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#F0B90B', color: '#000' }}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={handleNextSlide} className="absolute top-1/2 right-6 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center rotate-180" style={{ background: '#F0B90B', color: '#000' }}>
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
            <div className="flex justify-center mt-6 gap-2">
              {sliderImages.map((_, index) => (
                <button key={index} onClick={() => setCurrentSlide(index)} className="w-3 h-3 rounded-full transition-all" style={{ background: currentSlide === index ? '#F0B90B' : '#333', transform: currentSlide === index ? 'scale(1.3)' : 'scale(1)' }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works-section" className="py-20 relative" style={{ background: '#fff' }}>
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`} style={{ color: '#111' }}>
              איך זה <span style={{ color: '#E05A20' }}>עובד? 🔍</span>
            </h2>
            <p style={{ color: '#666' }}>תהליך פשוט בארבעה שלבים להשגת ניתוח מקצועי</p>
            <div className="w-20 h-1 rounded-full mx-auto mt-4" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)' }}></div>
          </div>

          <div className="max-w-5xl mx-auto space-y-8">
            {[
              {
                num: 1,
                title: 'העלאת גרף',
                desc: 'העלה תמונת גרף מהמחשב, מהטלפון, או צלם ישירות ממסך המסחר שלך. מערכת האשף תקבל כל סוג של גרף מסחר.',
                checks: ['תומך בכל פלטפורמות המסחר', 'העלאה בגרירה או צילום מסך', 'זיהוי אוטומטי של סוג הנכס'],
              },
              {
                num: 2,
                title: 'ניתוח בזמן אמת',
                desc: 'הבינה המלאכותית המתקדמת שלנו מנתחת את הגרף במהירות, מזהה מגמות ונקודות מפתח באופן אוטומטי.',
                checks: ['ניתוח מהיר תוך שניות בודדות', 'זיהוי דפוסי מסחר ומגמות שוק', 'ניתוח אינדיקטורים טכניים'],
              },
              {
                num: 3,
                title: 'תוצאות וניתוח',
                desc: 'קבל ניתוח מפורט הכולל המלצות לנקודות כניסה, יציאה, סטופ-לוס, וטייק-פרופיט מדויקים.',
                checks: ['המלצות לנקודות כניסה ויציאה', 'רמות סטופ-לוס וטייק-פרופיט', 'תחזית כיוון מחיר אפשרי'],
              },
              {
                num: 4,
                title: 'ביצוע פעולות מסחר',
                desc: 'יישם את ההמלצות בפלטפורמת המסחר שלך ונהל את העסקה בצורה מיטבית.',
                checks: ['גישה מכל מכשיר בכל זמן', 'התראות בזמן אמת', 'שיפור רווחיות המסחר'],
              },
            ].map(({ num, title, desc, checks }) => (
              <Reveal key={num}>
              <div className="flex flex-col md:flex-row items-center gap-8 p-8 rounded-2xl" style={{ background: '#f9f9f9', border: '1px solid #eee' }}>
                <div className="w-full md:w-1/2 text-right">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 mr-auto md:mr-0 font-bold text-xl" style={{ background: 'linear-gradient(135deg,#F0B90B,#E05A20)', color: '#000' }}>
                    {num}
                  </div>
                  <h3 className={`text-2xl font-bold mb-3 ${rubik.className}`} style={{ color: '#111' }}>{title}</h3>
                  <p className="mb-4" style={{ color: '#555' }}>{desc}</p>
                  <ul className="space-y-2">
                    {checks.map(c => (
                      <li key={c} className="flex items-center justify-end gap-2">
                        <span style={{ color: '#333' }}>{c}</span>
                        <Check className="h-5 w-5 flex-shrink-0" style={{ color: '#E05A20' }} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="w-full md:w-1/2">
                  {num === 1 && (
                    <div className="rounded-xl p-6 border-2 border-dashed text-center" style={{ borderColor: '#F0B90B88', background: '#F0B90B11' }}>
                      <Upload className="h-10 w-10 mx-auto mb-2" style={{ color: '#F0B90B' }} />
                      <p style={{ color: '#666' }}>גרור תמונה לכאן</p>
                    </div>
                  )}
                  {num === 2 && (
                    <div className="rounded-xl p-6 text-center" style={{ background: '#161622' }}>
                      <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" style={{ color: '#F0B90B' }} />
                      <p className="text-sm mb-3" style={{ color: '#aaa' }}>מנתח את הגרף...</p>
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#2a2a3a' }}>
                        <div className="h-full rounded-full" style={{ width: '65%', background: 'linear-gradient(90deg,#F0B90B,#E05A20)' }}></div>
                      </div>
                    </div>
                  )}
                  {num === 3 && (
                    <div className="rounded-xl p-4" style={{ background: '#161622', border: '1px solid #F0B90B33' }}>
                      <img src="https://i.imgur.com/kppbqfT.png" alt="Analysis" className="w-full h-28 object-cover rounded-lg mb-2" />
                      <p className="text-xs" style={{ color: '#aaa' }}>מחיר הביטקוין נמצא בעליה, וצפוי להתנגד ברמת $72,000.</p>
                    </div>
                  )}
                  {num === 4 && (
                    <div className="rounded-xl p-5" style={{ background: '#161622' }}>
                      <div className="space-y-2">
                        {[
                          { label: 'זוג מסחר', val: 'BTC/USD', col: '#fff' },
                          { label: 'כיוון', val: 'קניה (Long)', col: '#4ade80' },
                          { label: 'כניסה', val: '$69,200', col: '#fff' },
                          { label: 'סטופ לוס', val: '$68,100', col: '#f87171' },
                          { label: 'טייק פרופיט', val: '$72,500', col: '#4ade80' },
                        ].map(({ label, val, col }) => (
                          <div key={label} className="flex justify-between items-center px-3 py-2 rounded" style={{ background: '#22223a' }}>
                            <span style={{ color: col, fontWeight: 600 }}>{val}</span>
                            <span style={{ color: '#888' }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </Reveal>
            ))}
          </div>

          <div className="text-center mt-12">
            <button onClick={handleActionButtonClick} className="px-8 py-4 rounded-xl font-bold text-lg transition-transform hover:scale-105" style={{ background: 'linear-gradient(90deg,#E05A20,#F0B90B)', color: '#000' }}>
              נסה עכשיו — ₪1 בלבד
              <ArrowUpRight className="inline mr-2 h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-20" style={{ background: '#f4f4f4' }}>
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-16">
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`} style={{ color: '#111' }}>
              היתרונות <span style={{ color: '#E05A20' }}>שלנו 🚀</span>
            </h2>
            <p style={{ color: '#666' }}>הטכנולוגיה המתקדמת ביותר לניתוח טכני מקצועי</p>
            <div className="w-20 h-1 rounded-full mx-auto mt-4" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)' }}></div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Target className="h-8 w-8" />, title: 'זיהוי נקודות כניסה מדויקות', desc: 'אלגוריתם AI מתקדם המזהה נקודות כניסה אופטימליות עם אחוזי הצלחה גבוהים', badge: '87% דיוק' },
              { icon: <Shield className="h-8 w-8" />, title: 'סטופ-לוס וטייק-פרופיט חכמים', desc: 'מערכת אוטומטית לחישוב רמות סטופ-לוס וטייק-פרופיט אידיאליות לכל עסקה', badge: 'ניהול סיכונים' },
              { icon: <TrendingUp className="h-8 w-8" />, title: 'זיהוי מגמות ורמות קריטיות', desc: 'זיהוי רמות תמיכה והתנגדות, איתור מגמות בשלבים מוקדמים לפני השוק', badge: 'התראות אמת' },
              { icon: <BarChart3 className="h-8 w-8" />, title: 'אנליזה לכל סוגי הנכסים', desc: 'ניתוח מקיף למניות, קריפטו, סחורות, פורקס ועוד עם התאמה אישית', badge: '100+ נכסים' },
            ].map(({ icon, title, desc, badge }, i) => (
              <Reveal key={title} delay={i * 90} className="h-full">
              <div className="rounded-2xl p-6 text-right h-full transition-transform hover:-translate-y-1" style={{ background: '#fff', border: '1px solid #eee', boxShadow: '0 4px 20px #0002' }}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 mr-0 ml-auto md:mr-0" style={{ background: 'linear-gradient(135deg,#F0B90B22,#E05A2011)', color: '#E05A20' }}>
                  {icon}
                </div>
                <h3 className={`text-lg font-bold mb-2 ${rubik.className}`} style={{ color: '#111' }}>{title}</h3>
                <p className="text-sm mb-4" style={{ color: '#666' }}>{desc}</p>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#F0B90B22', color: '#E05A20' }}>{badge}</span>
              </div>
              </Reveal>
            ))}
          </div>

          <div className="text-center mt-12">
            <button onClick={handleActionButtonClick} className="px-8 py-4 rounded-xl font-bold text-lg" style={{ background: 'linear-gradient(90deg,#E05A20,#F0B90B)', color: '#000' }}>
              התחל לנתח גרפים עכשיו
              <ArrowUpRight className="inline mr-2 h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ===== LEARNING SECTION (ייחודי לנו) ===== */}
      <section id="learning" className="py-20 relative overflow-hidden" style={{ background: '#0D0D14' }}>
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full opacity-5 blur-3xl" style={{ background: '#F0B90B' }}></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4" style={{ background: '#F0B90B22', color: '#F0B90B', border: '1px solid #F0B90B44' }}>
              <BookOpen className="h-3 w-3" />ייחודי למערכת שלנו
            </div>
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`} style={{ color: '#fff' }}>
              מה <span style={{ color: '#F0B90B' }}>תלמדו? 📚</span>
            </h2>
            <p style={{ color: '#888' }}>6 מודולים שיהפכו אותך לסוחר מקצועי</p>
            <div className="w-20 h-1 rounded-full mx-auto mt-4" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)' }}></div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <BarChart3 className="h-6 w-6" />, num: '01', title: 'קריאת גרפים', desc: 'בסיס לקריאת נרות, גרפי קו ועמודות — כל מה שצריך להתחיל', badge: 'מתחילים' },
              { icon: <Target className="h-6 w-6" />, num: '02', title: 'ניתוח טכני', desc: 'תמיכה, התנגדות, פריצות ומגמות — כלי הניתוח הטכני המרכזיים', badge: 'בינוני' },
              { icon: <Zap className="h-6 w-6" />, num: '03', title: 'אסטרטגיות כניסה', desc: 'איתור נקודות כניסה אופטימליות ובחירת תזמון נכון לעסקאות', badge: 'בינוני' },
              { icon: <Shield className="h-6 w-6" />, num: '04', title: 'ניהול סיכונים', desc: 'גודל פוזיציה, יחס סיכון/תגמול, סטופ-לוס חכם ושמירה על הון', badge: 'חשוב!' },
              { icon: <TrendingUp className="h-6 w-6" />, num: '05', title: 'קריפטו ובלוקצ\'יין', desc: 'מבוא לשוק הקריפטו, DeFi, מטבעות מובילים ואסטרטגיות ספציפיות', badge: 'מתקדם' },
              { icon: <DollarSign className="h-6 w-6" />, num: '06', title: 'פסיכולוגיית מסחר', desc: 'ניהול רגשות, דיסציפלינה ובניית תוכנית מסחר שנצמדים אליה', badge: 'מתקדם' },
            ].map(({ icon, num, title, desc, badge }, i) => (
              <Reveal key={num} delay={i * 80} className="h-full">
              <div className="p-6 rounded-2xl text-right h-full group transition-all hover:-translate-y-1" style={{ background: '#161622', border: '1px solid #F0B90B22' }}>
                <div className="flex items-start justify-between mb-4">
                  <span className="text-3xl font-black opacity-30" style={{ color: '#F0B90B' }}>{num}</span>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#F0B90B33,#E05A2022)', color: '#F0B90B' }}>
                    {icon}
                  </div>
                </div>
                <h3 className={`text-lg font-bold mb-2 ${rubik.className}`} style={{ color: '#fff' }}>{title}</h3>
                <p className="text-sm mb-4" style={{ color: '#888' }}>{desc}</p>
                <span className="inline-block px-2 py-0.5 rounded-full text-xs" style={{ background: '#F0B90B22', color: '#F0B90B' }}>{badge}</span>
              </div>
              </Reveal>
            ))}
          </div>

          <div className="text-center mt-12">
            <button onClick={handleActionButtonClick} className="px-8 py-4 rounded-xl font-bold text-lg" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)', color: '#000' }}>
              גש לאזור הלימוד
              <BookOpen className="inline mr-2 h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-20" style={{ background: '#fff' }}>
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`} style={{ color: '#111' }}>
              מסלולי <span style={{ color: '#E05A20' }}>מחירים 💰</span>
            </h2>
            <p style={{ color: '#666' }}>בחר את המסלול המתאים לך</p>
            <div className="w-20 h-1 rounded-full mx-auto mt-4" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)' }}></div>
          </div>

          <div className="flex justify-center items-center gap-6 mb-12">
            <span className="font-medium" style={{ color: !isAnnual ? '#E05A20' : '#888' }}>חיוב חודשי</span>
            <label className="inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={isAnnual} onChange={() => setIsAnnual(!isAnnual)} />
              <div className="relative w-11 h-6 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ background: isAnnual ? '#E05A20' : '#ccc' }}></div>
            </label>
            <div className="flex items-center gap-2">
              <span className="font-medium" style={{ color: isAnnual ? '#E05A20' : '#888' }}>חיוב שנתי</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: '#E05A20' }}>30% הנחה</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            {filteredPlans.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 100} className="h-full">
              <div className="rounded-2xl overflow-hidden h-full shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1" style={{ border: index === 1 ? '2px solid #F0B90B' : '1px solid #eee' }}>
                {index === 1 && (
                  <div className="py-1.5 text-center text-xs font-bold" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)', color: '#000' }}>
                    ⭐ הכי פופולרי
                  </div>
                )}
                <div className="p-6 text-white" style={{ background: index === 1 ? 'linear-gradient(135deg,#1a1400,#2a1800)' : '#0D0D14' }}>
                  <h3 className={`text-2xl font-bold mb-2 ${rubik.className}`} style={{ color: '#F0B90B' }}>{plan.name}</h3>
                  <div className="text-4xl font-black mb-1" style={{ color: '#fff' }}>
                    {isAnnual ? `₪${(plan.price / 12).toFixed(0)}` : `₪${plan.price}`}
                    <span className="text-sm font-normal" style={{ color: '#888' }}> / חודש</span>
                  </div>
                  {isAnnual && <div className="text-sm" style={{ color: '#888' }}>חיוב שנתי של ₪{plan.price}</div>}
                </div>
                <div className="p-6 flex flex-col" style={{ minHeight: '280px', background: '#fff' }}>
                  <ul className="mb-6 flex-grow space-y-2">
                    {plan.features && plan.features.map((feature, fi) => (
                      <li key={fi} className="flex items-start gap-2 text-right">
                        <span style={{ color: '#333' }}>{feature}</span>
                        <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#E05A20' }} />
                      </li>
                    ))}
                  </ul>
                  <button onClick={handleActionButtonClick} className="w-full py-3 rounded-xl font-bold transition-all hover:scale-[1.02]" style={{ background: index === 1 ? 'linear-gradient(90deg,#F0B90B,#E05A20)' : '#111', color: index === 1 ? '#000' : '#fff' }}>
                    בחר מסלול
                  </button>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="py-20" style={{ background: '#f4f4f4' }}>
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`} style={{ color: '#111' }}>
              שאלות <span style={{ color: '#E05A20' }}>נפוצות ❓</span>
            </h2>
            <div className="w-20 h-1 rounded-full mx-auto mt-4" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)' }}></div>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {[
              { q: 'איך עובד הניתוח באמצעות AI?', a: 'המערכת שלנו משתמשת באלגוריתמים מתקדמים לניתוח דפוסים בגרפים, מזהה נקודות מפתח ומספקת המלצות מבוססות ניתוח היסטורי ומגמות שוק.' },
              { q: 'האם אני יכול לבטל את המנוי בכל עת?', a: 'כן, ניתן לבטל את המנוי בכל עת ללא התחייבות. החיוב יופסק בסוף תקופת החיוב הנוכחית.' },
              { q: 'אילו סוגי נכסים אתם מנתחים?', a: 'אנחנו מנתחים קריפטו, מניות, פני סטוקס, חוזים עתידיים, פורקס, אגחים, סחורות ועוד. המערכת מותאמת לכל סוג נכס.' },
              { q: 'כמה זמן לוקח לקבל ניתוח?', a: 'הניתוח מתבצע באופן מיידי — תוך מספר שניות תקבלו דוח מפורט עם כל ההמלצות והתובנות.' },
              { q: 'האם יש גבול למספר הניתוחים?', a: 'כל מסלול כולל מכסה יומית של ניתוחים. במסלול הפרימיום תקבלו ניתוחים ללא הגבלה.' },
            ].map((item, index) => (
              <Reveal key={index} delay={index * 60}>
              <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: openFaq === index ? '1px solid #F0B90B' : '1px solid #eee' }}>
                <button
                  className={`w-full flex items-center justify-between px-6 py-4 text-right transition-colors ${rubik.className}`}
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  style={{ color: '#111' }}
                >
                  <ChevronDown className={`h-5 w-5 flex-shrink-0 transition-transform ${openFaq === index ? 'rotate-180' : ''}`} style={{ color: '#E05A20' }} />
                  <span className="font-semibold">{item.q}</span>
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4 text-right" style={{ color: '#555', borderTop: '1px solid #f0f0f0' }}>
                    <p className="pt-3">{item.a}</p>
                  </div>
                )}
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section id="cta" className="py-24 relative overflow-hidden" style={{ background: '#0D0D14' }}>
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-5 grid grid-cols-2 gap-2">
            {bgGraphImages.map((img, idx) => (
              <div key={idx} className="bg-cover bg-center" style={{ backgroundImage: `url(${img})` }}></div>
            ))}
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(ellipse,#F0B90B,#E05A20,transparent)' }}></div>
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className={`text-4xl md:text-5xl font-bold mb-6 ${rubik.className}`} style={{ color: '#fff' }}>
            מוכן <span style={{ color: '#F0B90B' }}>לשחק ברמה הבאה? 👑</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: '#aaa' }}>
            הצטרף לאלפי סוחרים שכבר משתמשים באשף המסחר כדי להשיג יתרון תחרותי
          </p>
          <button onClick={handleActionButtonClick} className="px-10 py-5 rounded-xl font-bold text-xl inline-flex items-center gap-3 transition-transform hover:scale-105" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)', color: '#000' }}>
            הצטרף בשקל אחד בלבד
            <ArrowUpRight className="h-6 w-6" />
          </button>
          <p className="mt-4 text-sm" style={{ color: '#666' }}>ללא התחייבות · ביטול בכל עת</p>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="pt-16 pb-8" style={{ background: '#080810', borderTop: '1px solid #F0B90B22' }}>
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-1">
              <div className={`flex items-center gap-2 text-xl font-bold mb-4 ${rubik.className}`} style={{ color: '#F0B90B' }}>
                <BarChart3 className="h-7 w-7" />אשף המסחר
              </div>
              <p className="text-sm mb-6" style={{ color: '#666' }}>
                הכלי המתקדם ביותר לניתוח גרפים וקבלת המלצות מסחר מדויקות בזמן אמת
              </p>
              <div className="inline-flex items-center rounded-full px-3 py-1" style={{ background: '#F0B90B22', border: '1px solid #F0B90B44' }}>
                <span className="w-2 h-2 rounded-full animate-ping mr-2" style={{ background: '#F0B90B' }}></span>
                <span className="text-xs" style={{ color: '#F0B90B' }}>מעל 1,000 משתמשים</span>
              </div>
            </div>

            <div className="md:col-span-1">
              <h3 className={`text-sm font-bold mb-4 ${rubik.className}`} style={{ color: '#fff' }}>ניווט מהיר</h3>
              <ul className="space-y-3">
                {[
                  { label: 'יתרונות', id: 'features' },
                  { label: 'איך זה עובד?', id: 'how-it-works-section' },
                  { label: 'אזור לימוד', id: 'learning' },
                  { label: 'המלצות', id: 'testimonials' },
                  { label: 'תמחור', id: 'pricing' },
                  { label: 'שאלות נפוצות', id: 'faq' },
                ].map(({ label, id }) => (
                  <li key={id}>
                    <button onClick={() => scrollToSection(id)} className="text-sm flex items-center gap-2 transition-colors hover:opacity-100" style={{ color: '#666' }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#F0B90B' }}></div>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-1">
              <h3 className={`text-sm font-bold mb-4 ${rubik.className}`} style={{ color: '#fff' }}>משפטי</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/terms" className="text-sm flex items-center gap-2" style={{ color: '#666' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#F0B90B' }}></div>
                    תקנון ותנאי שימוש
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-1">
              <h3 className={`text-sm font-bold mb-4 ${rubik.className}`} style={{ color: '#fff' }}>צור קשר</h3>
              <div className="p-4 rounded-xl" style={{ background: '#161622', border: '1px solid #F0B90B22' }}>
                <p className="text-sm mb-4" style={{ color: '#888' }}>יש לך שאלות? אנחנו כאן לעזור!</p>
                <Link href="https://wa.link/cmzorx">
                  <button className="w-full py-2 px-4 rounded-lg font-medium text-sm" style={{ background: 'linear-gradient(90deg,#F0B90B,#E05A20)', color: '#000' }}>
                    שלח הודעה
                  </button>
                </Link>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col md:flex-row justify-between items-center gap-4" style={{ borderTop: '1px solid #F0B90B22' }}>
            <div className="text-xs" style={{ color: '#444' }}>
              © <span suppressHydrationWarning>{new Date().getFullYear()}</span> אשף המסחר. כל הזכויות שמורות.
            </div>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/cryptoai.il/" className="w-8 h-8 flex items-center justify-center rounded-full transition-colors" style={{ background: '#161622', color: '#F0B90B', border: '1px solid #F0B90B33' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a href="https://www.tiktok.com/@cryptoai.il" className="w-8 h-8 flex items-center justify-center rounded-full transition-colors" style={{ background: '#161622', color: '#F0B90B', border: '1px solid #F0B90B33' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 448 512">
                  <path d="M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a href="https://wa.link/cmzorx" target="_blank" rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg hover:scale-110 transition-transform duration-300"
        style={{ background: '#25D366' }} aria-label="שלח הודעה בוואטסאפ">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="white" viewBox="0 0 448 512">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
        </svg>
      </a>

      <style jsx global>{`
        @keyframes pulse-width {
          0%, 100% { width: 30%; }
          50% { width: 70%; }
        }
        .animate-pulse-width { animation: pulse-width 2s infinite ease-in-out; }

        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .animate-ticker { animation: ticker-scroll 40s linear infinite; }
        .animate-ticker:hover { animation-play-state: paused; }

        html { scroll-behavior: smooth; }
        ::selection { background: #F0B90B; color: #000; }

        section[id] { scroll-margin-top: 90px; }

        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #0D0D14; }
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg,#F0B90B,#E05A20);
          border-radius: 5px;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-ticker { animation: none; }
          html { scroll-behavior: auto; }
        }
      `}</style>
    </div>
  );
}

export default Home;
