"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "../../lib/supabase/client";
import axios from "axios";
import { Heebo } from 'next/font/google';
import {
  BarChart3, TrendingUp, Bell, BookOpen, Calculator, History,
  Check, ChevronLeft, ChevronRight, Loader2, Zap, Shield,
  Menu, X,
} from "lucide-react";

const AuthModal = dynamic(() => import('../components/AuthModal'), { ssr: false });
const heebo = Heebo({ subsets: ['latin', 'hebrew'] });

const C = {
  bg: '#0B0E11',
  surface: '#14171A',
  card: '#1C2128',
  border: '#2D3748',
  accent: '#F0B90B',
  accentDim: '#B8860B',
  text: '#E5E7EB',
  muted: '#9CA3AF',
  green: '#10B981',
  red: '#EF4444',
};

const SECTIONS = [
  { id: 'hero',     label: 'בית' },
  { id: 'how',      label: 'איך זה עובד' },
  { id: 'features', label: 'פיצ\'רים' },
  { id: 'results',  label: 'תוצאות לקוחות' },
  { id: 'pricing',  label: 'מחירים' },
  { id: 'cta',      label: 'התחל עכשיו' },
];

const SLIDER_IMAGES = [
  "https://i.imgur.com/dfBf8Mf.jpeg",
  "https://i.imgur.com/Zhyo6Q8.jpeg",
  "https://i.imgur.com/2mFWZgi.jpeg",
  "https://i.imgur.com/kyGyMdA.jpeg",
  "https://i.imgur.com/jXo6954.jpeg",
];

const FEATURES = [
  { icon: BarChart3, title: 'ניתוח גרפים בAI', desc: 'העלה צילום גרף וקבל ניתוח מקצועי מהבינה המלאכותית תוך שניות' },
  { icon: TrendingUp, title: 'מחירים בזמן אמת', desc: 'עקוב אחרי 10+ מטבעות קריפטו עם מחירים ותנועות חיות' },
  { icon: Bell, title: 'התראות מחיר', desc: 'הגדר יעד מחיר וקבל התראה מיידית כשהמטבע מגיע אליו' },
  { icon: BookOpen, title: 'שיעורים מקצועיים', desc: 'קורסים שנבנו על ידי סוחרים מנוסים — Support, RSI, Risk Management' },
  { icon: Calculator, title: 'מחשבון P&L', desc: 'חשב רווח/הפסד עם מינוף, עמלות, ו-3 בורסות שונות' },
  { icon: History, title: 'היסטוריית ניתוחים', desc: 'כל הניתוחים שלך שמורים. חזור אליהם בכל עת' },
];

const STATS = [
  { value: '12,400+', label: 'ניתוחים בוצעו' },
  { value: '3,200+', label: 'סוחרים פעילים' },
  { value: '94%', label: 'דיוק ניתוח' },
  { value: '< 8 שניות', label: 'זמן ניתוח ממוצע' },
];

interface Plan {
  id: string;
  name: string;
  daily_limit: number;
  price: number;
  is_monthly: boolean;
  features?: string[];
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Home() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [isAnnual, setIsAnnual] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setIsLoggedIn(!!user));
  }, []);

  // URL auth param
  useEffect(() => {
    const a = searchParams.get('auth');
    if (a === 'signup') { setAuthModalMode('signup'); setIsAuthModalOpen(true); }
    if (a === 'login')  { setAuthModalMode('login');  setIsAuthModalOpen(true); }
    if (a) window.history.replaceState({}, '', window.location.pathname);
  }, [searchParams]);

  // Fetch plans
  useEffect(() => {
    axios.get('/api/plans').then(r => setPlans(r.data.plans || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setFilteredPlans(
      plans
        .filter(p => p.is_monthly !== isAnnual && Number(p.id) !== 7)
        .sort((a, b) => Number(a.id) - Number(b.id))
    );
  }, [plans, isAnnual]);

  // Active section via IntersectionObserver
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); });
      },
      { threshold: 0.4 }
    );
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  // Slider auto-advance
  useEffect(() => {
    const t = setInterval(() => setCurrentSlide(p => (p + 1) % SLIDER_IMAGES.length), 5000);
    return () => clearInterval(t);
  }, []);

  const openLogin  = () => { setAuthModalMode('login');  setIsAuthModalOpen(true); };
  const openSignup = () => { setAuthModalMode('signup'); setIsAuthModalOpen(true); };

  const handleCTA = () => isLoggedIn ? router.push('/dashboard') : openLogin();

  return (
    <div className={heebo.className} dir="rtl" style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, right: 0, left: 0, zIndex: 100,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => scrollTo('hero')}>
          <BarChart3 size={28} color={C.accent} />
          <span style={{ fontWeight: 800, fontSize: 20, color: C.accent }}>אשף המסחר</span>
        </div>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', gap: 28, alignItems: 'center' }}
             className="hidden-mobile">
          {SECTIONS.slice(1).map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 15,
                       transition: 'color .2s', fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
              {s.label}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isLoggedIn ? (
            <button onClick={() => router.push('/dashboard')}
              style={{ background: C.accent, color: '#000', border: 'none', borderRadius: 8,
                       padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>
              למשתמש
            </button>
          ) : (
            <>
              <button onClick={openLogin}
                style={{ background: 'none', border: `1px solid ${C.border}`, color: C.text,
                         borderRadius: 8, padding: '7px 18px', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>
                כניסה
              </button>
              <button onClick={openSignup}
                style={{ background: C.accent, color: '#000', border: 'none', borderRadius: 8,
                         padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>
                הרשמה חינמית
              </button>
            </>
          )}
          {/* Mobile hamburger */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="show-mobile"
            style={{ background: 'none', border: 'none', color: C.text, cursor: 'pointer', display: 'none' }}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 64, right: 0, left: 0, zIndex: 99,
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => { scrollTo(s.id); setMobileMenuOpen(false); }}
              style={{ background: 'none', border: 'none', color: C.text, cursor: 'pointer',
                       fontSize: 16, textAlign: 'right', fontFamily: 'inherit', padding: '4px 0' }}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── LAYOUT: MAIN + SIDEBAR ──────────────────────────── */}
      <div style={{ display: 'flex', paddingTop: 64 }}>

        {/* STICKY SIDEBAR (right side in RTL) */}
        <aside style={{
          width: 200, flexShrink: 0,
          position: 'sticky', top: 64, height: 'calc(100vh - 64px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '0 16px', borderLeft: `1px solid ${C.border}`,
          gap: 8,
        }} className="sidebar-desktop">
          <p style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: 2,
                      marginBottom: 12, textTransform: 'uppercase' }}>
            ניווט
          </p>
          {SECTIONS.map(s => {
            const active = activeSection === s.id;
            return (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 8, textAlign: 'right',
                  color: active ? C.accent : C.muted,
                  background: active ? `${C.accent}15` : 'transparent',
                  fontWeight: active ? 700 : 400, fontSize: 14,
                  transition: 'all .2s', fontFamily: 'inherit',
                }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: active ? C.accent : C.border,
                  transition: 'background .2s',
                }} />
                {s.label}
              </button>
            );
          })}

          <div style={{ marginTop: 32, padding: '16px 12px', borderRadius: 12,
                        background: `${C.accent}12`, border: `1px solid ${C.accent}30` }}>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>מנסים בחינם</p>
            <button onClick={openSignup}
              style={{ width: '100%', background: C.accent, color: '#000', border: 'none',
                       borderRadius: 8, padding: '8px 0', fontWeight: 700, cursor: 'pointer',
                       fontSize: 13, fontFamily: 'inherit' }}>
              התחל עכשיו
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, overflowX: 'hidden' }}>

          {/* ── HERO ─────────────────────────────────────────── */}
          <section id="hero" style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '80px 48px 80px',
            background: `radial-gradient(ellipse at 70% 50%, ${C.accent}08 0%, transparent 60%), ${C.bg}`,
          }}>
            <div style={{ maxWidth: 860, width: '100%' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: `${C.accent}15`, border: `1px solid ${C.accent}40`,
                borderRadius: 100, padding: '6px 16px', marginBottom: 28,
              }}>
                <Zap size={14} color={C.accent} />
                <span style={{ fontSize: 13, color: C.accent, fontWeight: 600 }}>
                  מופעל על ידי GPT-4o Vision
                </span>
              </div>

              <h1 style={{
                fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900,
                lineHeight: 1.15, marginBottom: 24, color: C.text,
              }}>
                האשף שיהפוך אותך<br />
                <span style={{ color: C.accent }}>לסוחר קריפטו</span><br />
                מקצועי יותר
              </h1>

              <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.8, marginBottom: 40, maxWidth: 580 }}>
                העלה צילום גרף — קבל ניתוח מקצועי מהבינה המלאכותית תוך שניות.
                תמיכה/התנגדות, RSI, מגמות, ורמות כניסה — הכל בעברית.
              </p>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 56 }}>
                <button onClick={openSignup}
                  style={{
                    background: C.accent, color: '#000', border: 'none',
                    borderRadius: 12, padding: '14px 32px', fontWeight: 800,
                    cursor: 'pointer', fontSize: 17, fontFamily: 'inherit',
                    boxShadow: `0 0 30px ${C.accent}40`,
                  }}>
                  התחל חינמית — ללא כרטיס אשראי
                </button>
                <button onClick={openLogin}
                  style={{
                    background: 'transparent', color: C.text,
                    border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: '14px 32px', fontWeight: 600, cursor: 'pointer',
                    fontSize: 17, fontFamily: 'inherit',
                  }}>
                  יש לי חשבון — כניסה
                </button>
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
                {STATS.map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: C.accent }}>{s.value}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── HOW IT WORKS ────────────────────────────────── */}
          <section id="how" style={{
            padding: '96px 48px',
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <p style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 3,
                          textTransform: 'uppercase', marginBottom: 12 }}>
                התהליך
              </p>
              <h2 style={{ fontSize: 40, fontWeight: 900, marginBottom: 12 }}>
                3 שלבים פשוטים
              </h2>
              <p style={{ fontSize: 16, color: C.muted, marginBottom: 64, maxWidth: 500 }}>
                מניתוח ראשון ועד להחלטת מסחר — הכל תוך פחות מדקה
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
                {[
                  { num: '01', title: 'צלם או העלה גרף', desc: 'צלם את הגרף ממסך הבורסה שלך, או העלה קובץ תמונה ישירות מהגלריה' },
                  { num: '02', title: 'AI מנתח את הגרף', desc: 'הבינה המלאכותית מזהה דפוסים, רמות מפתח, ואינדיקטורים תוך שניות ספורות' },
                  { num: '03', title: 'קבל ניתוח מפורט', desc: 'קבל ניתוח מקיף בעברית עם המלצות כניסה/יציאה, Stop Loss ו-Take Profit' },
                ].map(step => (
                  <div key={step.num} style={{
                    background: C.card, borderRadius: 16, padding: 32,
                    border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', top: 16, left: 16,
                      fontSize: 72, fontWeight: 900, color: `${C.accent}10`, lineHeight: 1,
                    }}>
                      {step.num}
                    </div>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: `${C.accent}20`, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', marginBottom: 20,
                    }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: C.accent }}>{step.num}</span>
                    </div>
                    <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{step.title}</h3>
                    <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.7 }}>{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FEATURES ────────────────────────────────────── */}
          <section id="features" style={{ padding: '96px 48px', background: C.bg }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <p style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 3,
                          textTransform: 'uppercase', marginBottom: 12 }}>
                פיצ'רים
              </p>
              <h2 style={{ fontSize: 40, fontWeight: 900, marginBottom: 12 }}>
                הכלים שסוחר מקצועי צריך
              </h2>
              <p style={{ fontSize: 16, color: C.muted, marginBottom: 64, maxWidth: 500 }}>
                כל מה שצריך כדי לסחור חכם יותר — בפלטפורמה אחת
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                {FEATURES.map(f => (
                  <div key={f.title}
                    style={{
                      background: C.card, borderRadius: 16, padding: 28,
                      border: `1px solid ${C.border}`,
                      transition: 'border-color .2s, transform .2s',
                      cursor: 'default',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = `${C.accent}60`;
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = C.border;
                      (e.currentTarget as HTMLDivElement).style.transform = 'none';
                    }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: `${C.accent}20`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                    }}>
                      <f.icon size={22} color={C.accent} />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                    <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── RESULTS / TESTIMONIALS ──────────────────────── */}
          <section id="results" style={{
            padding: '96px 48px',
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <p style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 3,
                          textTransform: 'uppercase', marginBottom: 12 }}>
                תוצאות
              </p>
              <h2 style={{ fontSize: 40, fontWeight: 900, marginBottom: 12 }}>
                מה אומרים הסוחרים שלנו
              </h2>
              <p style={{ fontSize: 16, color: C.muted, marginBottom: 48, maxWidth: 500 }}>
                תוצאות אמיתיות מסוחרים שמשתמשים באשף המסחר מדי יום
              </p>

              {/* Slider */}
              <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden',
                            border: `1px solid ${C.border}`, marginBottom: 40 }}>
                <img
                  src={SLIDER_IMAGES[currentSlide]}
                  alt={`תוצאה ${currentSlide + 1}`}
                  style={{ width: '100%', maxHeight: 520, objectFit: 'cover',
                            display: 'block', transition: 'opacity .4s' }}
                />
                <div style={{
                  position: 'absolute', bottom: 0, right: 0, left: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                  padding: '40px 24px 24px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {SLIDER_IMAGES.map((_, i) => (
                        <button key={i} onClick={() => setCurrentSlide(i)}
                          style={{
                            width: i === currentSlide ? 24 : 8, height: 8, borderRadius: 4,
                            background: i === currentSlide ? C.accent : 'rgba(255,255,255,0.3)',
                            border: 'none', cursor: 'pointer', transition: 'all .3s', padding: 0,
                          }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setCurrentSlide(p => (p - 1 + SLIDER_IMAGES.length) % SLIDER_IMAGES.length)}
                        style={{ width: 36, height: 36, borderRadius: '50%',
                                  background: 'rgba(255,255,255,0.15)', border: 'none',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', color: '#fff', backdropFilter: 'blur(4px)' }}>
                        <ChevronRight size={18} />
                      </button>
                      <button onClick={() => setCurrentSlide(p => (p + 1) % SLIDER_IMAGES.length)}
                        style={{ width: 36, height: 36, borderRadius: '50%',
                                  background: 'rgba(255,255,255,0.15)', border: 'none',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', color: '#fff', backdropFilter: 'blur(4px)' }}>
                        <ChevronLeft size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Testimonial cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                {[
                  { name: 'יוסי כ.', text: 'הצלחתי לזהות ריבאונד ב-SOL לפני כולם. האשף ראה divergence שלא הרגשתי בכלל.', profit: '+340%', asset: 'SOL' },
                  { name: 'ליאת ל.', text: 'לא האמנתי שAI יכול לנתח גרפים טוב ממני. אחרי שבוע הבנתי שאני טועה לחלוטין.', profit: '+127%', asset: 'BTC' },
                  { name: 'אמיר מ.', text: 'חסכתי שעות של ניתוח. מגיע, מעלה גרף, מקבל תמונה ברורה. פשוט ועובד.', profit: '+89%', asset: 'ETH' },
                ].map(t => (
                  <div key={t.name} style={{
                    background: C.card, borderRadius: 16, padding: 24,
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: `${C.accent}25`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, color: C.accent, fontSize: 16,
                      }}>
                        {t.name[0]}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: C.green }}>{t.profit}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>{t.asset}</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>"{t.text}"</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── PRICING ─────────────────────────────────────── */}
          <section id="pricing" style={{ padding: '96px 48px', background: C.bg }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <p style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 3,
                          textTransform: 'uppercase', marginBottom: 12 }}>
                מחירים
              </p>
              <h2 style={{ fontSize: 40, fontWeight: 900, marginBottom: 12 }}>
                תוכניות שמתאימות לכולם
              </h2>
              <p style={{ fontSize: 16, color: C.muted, marginBottom: 40, maxWidth: 500 }}>
                התחל חינמית. שדרג כשאתה מוכן.
              </p>

              {/* Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
                <span style={{ fontSize: 14, color: !isAnnual ? C.text : C.muted }}>חודשי</span>
                <button onClick={() => setIsAnnual(p => !p)}
                  style={{
                    width: 48, height: 26, borderRadius: 13,
                    background: isAnnual ? C.accent : C.border,
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .3s',
                  }}>
                  <span style={{
                    position: 'absolute', top: 3,
                    right: isAnnual ? 3 : undefined, left: isAnnual ? undefined : 3,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'all .3s',
                  }} />
                </button>
                <span style={{ fontSize: 14, color: isAnnual ? C.text : C.muted }}>שנתי</span>
                {isAnnual && (
                  <span style={{
                    background: `${C.green}20`, color: C.green,
                    borderRadius: 100, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                  }}>
                    חיסכון 20%
                  </span>
                )}
              </div>

              {filteredPlans.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                  {filteredPlans.map((plan, i) => {
                    const popular = i === 1;
                    return (
                      <div key={plan.id} style={{
                        background: popular ? `${C.accent}12` : C.card,
                        borderRadius: 20, padding: 32,
                        border: `2px solid ${popular ? C.accent : C.border}`,
                        position: 'relative',
                      }}>
                        {popular && (
                          <div style={{
                            position: 'absolute', top: -14, right: '50%',
                            transform: 'translateX(50%)',
                            background: C.accent, color: '#000',
                            borderRadius: 100, padding: '4px 16px',
                            fontSize: 12, fontWeight: 800,
                          }}>
                            הכי פופולרי
                          </div>
                        )}
                        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{plan.name}</h3>
                        <div style={{ fontSize: 40, fontWeight: 900, color: popular ? C.accent : C.text, marginBottom: 4 }}>
                          ₪{plan.price}
                          <span style={{ fontSize: 14, color: C.muted, fontWeight: 400 }}>
                            /{isAnnual ? 'שנה' : 'חודש'}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
                          עד {plan.daily_limit} ניתוחים ביום
                        </p>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {(plan.features || ['ניתוח גרפים AI', 'מחירים בזמן אמת', 'היסטוריית ניתוחים']).map(f => (
                            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                              <Check size={16} color={popular ? C.accent : C.green} style={{ flexShrink: 0 }} />
                              {f}
                            </li>
                          ))}
                        </ul>
                        <button onClick={openSignup}
                          style={{
                            width: '100%', border: 'none', borderRadius: 12,
                            padding: '12px 0', fontWeight: 700, cursor: 'pointer',
                            fontSize: 15, fontFamily: 'inherit',
                            background: popular ? C.accent : 'transparent',
                            color: popular ? '#000' : C.text,
                            border: popular ? 'none' : `1px solid ${C.border}`,
                          }}>
                          {plan.price === 0 ? 'התחל חינמית' : 'בחר תוכנית'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Loader2 size={32} color={C.accent} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>
          </section>

          {/* ── CTA ─────────────────────────────────────────── */}
          <section id="cta" style={{
            padding: '96px 48px',
            background: `radial-gradient(ellipse at center, ${C.accent}12 0%, ${C.surface} 70%)`,
            borderTop: `1px solid ${C.border}`,
            textAlign: 'center',
          }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <h2 style={{ fontSize: 44, fontWeight: 900, marginBottom: 20, lineHeight: 1.2 }}>
                מוכן לסחור <span style={{ color: C.accent }}>חכם יותר</span>?
              </h2>
              <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.8, marginBottom: 40 }}>
                הצטרף ל-3,200+ סוחרים שכבר משתמשים באשף המסחר ומקבלים יתרון משמעותי בשוק
              </p>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={openSignup}
                  style={{
                    background: C.accent, color: '#000', border: 'none',
                    borderRadius: 14, padding: '16px 40px', fontWeight: 800,
                    cursor: 'pointer', fontSize: 18, fontFamily: 'inherit',
                    boxShadow: `0 0 40px ${C.accent}50`,
                  }}>
                  הרשמה חינמית עכשיו
                </button>
                <button onClick={openLogin}
                  style={{
                    background: 'transparent', color: C.text,
                    border: `1px solid ${C.border}`, borderRadius: 14,
                    padding: '16px 40px', fontWeight: 600, cursor: 'pointer',
                    fontSize: 18, fontFamily: 'inherit',
                  }}>
                  כניסה למשתמשים קיימים
                </button>
              </div>
            </div>
          </section>

          {/* ── FOOTER ──────────────────────────────────────── */}
          <footer style={{
            padding: '32px 48px', background: C.surface,
            borderTop: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={20} color={C.accent} />
              <span style={{ fontWeight: 700, color: C.accent }}>אשף המסחר</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted }}>
              © 2025 אשף המסחר. כל הזכויות שמורות.
            </p>
            <div style={{ display: 'flex', gap: 20 }}>
              <Link href="/terms" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>תנאי שימוש</Link>
            </div>
          </footer>

        </main>
      </div>

      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .hidden-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
