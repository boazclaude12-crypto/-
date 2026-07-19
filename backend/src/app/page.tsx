"use client";

import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import Link from "next/link";
import { Inter, Rubik, Heebo } from 'next/font/google';
import {
  BarChart3,
  TrendingUp,
  Shield,
  Target,
  ChevronLeft,
  Check,
  Menu,
  ArrowUpRight,
  Upload,
  Camera,
  Loader2,
  Clock,
  Maximize2,
  LogIn,
  UserPlus,
} from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

// Dynamically import the AuthModal with no SSR
const AuthModal = dynamic(() => import('../components/AuthModal'), { ssr: false });

// פונטים משודרגים 
const inter = Inter({ subsets: ['latin'] });
const rubik = Rubik({ subsets: ['latin', 'hebrew'] }); // פונט יפה שתומך גם בעברית
const heebo = Heebo({ subsets: ['latin', 'hebrew'] }); // פונט ישראלי מוכר מאוד ומקצועי

// תמונות גרפים לרקע
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

function Home() {
  // Add searchParams
  const searchParams = useSearchParams();
  const supabase = createClient(); // Use the browser client
  const [isAnnual, setIsAnnual] = useState<boolean>(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  // Check for URL parameters on component mount to open auth modal
  useEffect(() => {
    const authAction = searchParams.get('auth');
    if (authAction) {
      if (authAction === 'signup') {
        setAuthModalMode('signup');
        setIsAuthModalOpen(true);
      } else if (authAction === 'login') {
        setAuthModalMode('login');
        setIsAuthModalOpen(true);
      }
      
      // Clean URL without reloading page
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [searchParams]);

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
    };
    checkAuth();
  }, []);

  // Functions to handle modal opening/closing
  const openLoginModal = () => {
    setAuthModalMode('login');
    setIsAuthModalOpen(true);
  };

  const openSignupModal = () => {
    setAuthModalMode('signup');
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  // Helper function to handle action button clicks
  const handleActionButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoggedIn) {
      router.push('/dashboard');
    } else {
      openLoginModal();
    }
  };

  // Slider state for Testimonials
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
  // Add mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Function to toggle mobile menu
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };
  
  // Function to move to next slide manually.
  const handleNextSlide = () =>
    setCurrentSlide((prev) => (prev + 1) % sliderImages.length);

  // Function to move to previous slide manually.
  const handlePrevSlide = () =>
    setCurrentSlide((prev) => (prev - 1 + sliderImages.length) % sliderImages.length);

  // Set up Intersection Observer to detect when slider is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSliderVisible(entry.isIntersecting);
      },
      { threshold: 0.1 } // Trigger when at least 10% of the section is visible
    );
    
    if (testimonialsSectionRef.current) {
      observer.observe(testimonialsSectionRef.current);
    }
    
    return () => {
      if (testimonialsSectionRef.current) {
        observer.unobserve(testimonialsSectionRef.current);
      }
    };
  }, []);

  // Auto-advance slider every 5 seconds, but only when visible
  useEffect(() => {
    if (!isSliderVisible) return;
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % sliderImages.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [sliderImages.length, isSliderVisible]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Fetch plans from the API endpoint.
  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await axios.get("/api/plans");
        setPlans(res.data.plans);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Error fetching plans");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  // Filter plans based on the isAnnual state.
  useEffect(() => {
    if (plans && plans.length > 0) {
      const filtered = plans
      .filter((plan) => plan.is_monthly !== isAnnual && Number(plan.id) !== 7)
      .sort((a, b) => Number(a.id) - Number(b.id));
      setFilteredPlans(filtered);
    }
  }, [plans, isAnnual]);

  // Dashboard animation state
  const [animationStep, setAnimationStep] = useState<'upload' | 'loading' | 'result'>('upload');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [dots, setDots] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: -100, y: 50 });

  // Control the animation steps
  useEffect(() => {
    // Reset the entire animation cycle every 15 seconds
    const animationCycle = setInterval(() => {
      setAnimationStep('upload');
      setPreviewUrl(null);
      setLoadingProgress(0);
      setIsDragging(false);
      setDragPosition({ x: -100, y: 50 });
    }, 15000);

    return () => clearInterval(animationCycle);
  }, []);

  // Handle animation steps
  useEffect(() => {
    if (animationStep === 'upload') {
      // After 1.5 seconds, start the dragging animation
      const startDragTimeout = setTimeout(() => {
        setIsDragging(true);
        
        // Animate the image being dragged from left to the upload box
        const dragInterval = setInterval(() => {
          setDragPosition(prev => {
            // Move the image toward the center of the upload box
            if (prev.x >= 50) {
              clearInterval(dragInterval);
              
              // After reaching the target, drop the image and show preview
              setTimeout(() => {
                setIsDragging(false);
                setPreviewUrl('https://i.imgur.com/kppbqfT.png');
                
                // After showing the preview, move to loading
                setTimeout(() => {
                  setAnimationStep('loading');
                }, 1500);
              }, 300);
              
              return prev;
            }
            return { 
              x: prev.x + 2, // Slower movement (was +5)
              y: prev.y 
            };
          });
        }, 70); // Slower interval (was 50ms)
        
      }, 1500); // Start dragging after 1.5s (was 1s)
      
      return () => clearTimeout(startDragTimeout);
    }
    
    if (animationStep === 'loading') {
      // Animate loading progress
      setLoadingProgress(0);
      const loadingInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 100) {
            clearInterval(loadingInterval);
            setAnimationStep('result');
            return 100;
          }
          return prev + 1.5; // Slower progress (was +2)
        });
      }, 50);
      
      // Animate loading dots
      const dotsInterval = setInterval(() => {
        setDots(prev => {
          if (prev.length >= 3) return '';
          return prev + '.';
        });
      }, 500);
      
      return () => {
        clearInterval(loadingInterval);
        clearInterval(dotsInterval);
      };
    }
    
    if (animationStep === 'result') {
      // Show result for 5 seconds then restart cycle
      const resultTimeout = setTimeout(() => {
        setAnimationStep('upload');
        setPreviewUrl(null);
        setIsDragging(false);
        setDragPosition({ x: -100, y: 50 });
      }, 5000); // Longer result view (was 4000)
      
      return () => clearTimeout(resultTimeout);
    }
  }, [animationStep]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white to-amber-50/50">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-amber-100 flex flex-col items-center justify-center w-11/12 max-w-md">
          <div className="mb-6 relative">
            <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
              <Loader2 className="h-10 w-10 text-amber-500" />
              <div className="absolute inset-0 rounded-full border-4 border-amber-500 border-t-transparent animate-spin"></div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center mb-3 text-amber-500">אשף המסחר</h1>
          <p className="text-gray-600 mb-4">אנחנו מכינים את המערכת בשבילך...</p>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-amber-500 rounded-full animate-pulse-width"></div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Upload Animation Component
  const UploadAnimation = () => (
    <div className="bg-white rounded-2xl p-6 shadow-lg relative overflow-hidden">
      <h2 className="text-lg font-bold text-center mb-4 text-gray-800">
        העלאת גרף לניתוח
      </h2>
      <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
        previewUrl || isDragging ? "border-amber-500 bg-amber-50/50" : "border-gray-300"
      }`}>
        {previewUrl ? (
          <div className="space-y-4">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-52 mx-auto rounded-lg shadow-md"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
              <Upload className="h-6 w-6 text-amber-500" />
            </div>
            <div className="space-y-1">
              <p className="text-gray-600">
                גרור תמונה לכאן או
              </p>
              <div className="flex items-center justify-center gap-2">
                <button className="text-amber-500 font-medium">
                  בחר קובץ
                </button>
                <span className="text-gray-400">|</span>
                <button className="text-amber-500 font-medium inline-flex items-center gap-1">
                  <Camera className="h-4 w-4" />
                  צלם תמונה
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Draggable image element */}
      {isDragging && (
        <div 
          className="absolute pointer-events-none z-10 transition-all duration-50"
          style={{ 
            left: `${dragPosition.x}%`, 
            top: `${dragPosition.y}%`, 
            transform: 'translate(-50%, -50%)' 
          }}
        >
          <img 
            src="https://i.imgur.com/kppbqfT.png" 
            alt="Dragging" 
            className="w-24 h-16 object-cover rounded-md shadow-lg opacity-90 border-2 border-amber-500"
          />
        </div>
      )}
    </div>
  );

  // Dashboard Loading Animation Component
  const LoadingAnimation = () => (
    <div className="bg-white p-6 rounded-2xl shadow-lg text-center">
      <div className="mb-4">
        <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-200">
          <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">
          מנתח את הגרף{dots}
        </h3>
        <p className="text-sm text-gray-600">
          הבינה המלאכותית מזהה תבניות ונקודות מפתח
        </p>
      </div>
      <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className="absolute top-0 left-0 h-full bg-amber-500 transition-all duration-300"
          style={{ width: `${loadingProgress}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">
        הניתוח יהיה מוכן בעוד {Math.max(0, Math.round((100 - loadingProgress) / 10))} שניות
      </p>
    </div>
  );

  // Dashboard Result Animation Component
  const ResultAnimation = () => (
    <div className="bg-white rounded-2xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          ביטקוין
        </h3>
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          קריפטו
        </span>
      </div>
      
      <img 
        src={previewUrl || 'https://i.imgur.com/kppbqfT.png'} 
        alt="Analysis" 
        className="w-full h-32 object-cover rounded-lg mb-3"
      />
      
      <div className="flex items-center gap-1 text-gray-500 text-xs mb-2">
        <Clock className="h-3 w-3" />
        <span>עכשיו</span>
      </div>
      
      <p className="text-sm text-gray-700 line-clamp-3 mb-2">
        מחיר הביטקוין נמצא בעליה, וצפוי להתנגד ברמת $72,000. אינדיקטור ה-RSI מראה התחזקות בתנועה העולה, עם זאת יש להיזהר מרמת ה-overbought.
      </p>
      
      <button className="text-amber-500 text-sm hover:text-amber-600 font-medium inline-flex items-center gap-1">
        <span>צפה בניתוח המלא</span>
        <Maximize2 className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <div className={`min-h-screen bg-gray-50 ${heebo.className}`}>
      {/* Header */}
      <header className={`fixed w-full bg-white shadow-sm z-50 border-b border-gray-200 ${rubik.className}`}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={'/'}>
            <div className="flex items-center gap-2 text-2xl font-bold text-amber-500">
              <BarChart3 className="h-8 w-8" />
              אשף המסחר
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollToSection("how-it-works-section")} className="text-gray-600 hover:text-gray-900">
              איך זה עובד?
            </button>
            <button onClick={() => scrollToSection("pricing")} className="text-gray-600 hover:text-gray-900">
              תמחור
            </button>
            <button onClick={() => scrollToSection("testimonials")} className="text-gray-600 hover:text-gray-900">
              ביקורות
            </button>
            <button onClick={() => router.push("/calculator")} className="text-gray-600 hover:text-gray-900">
              מחשבון רווח/הפסד
            </button>
            {isLoggedIn ? (
              <Link href="/dashboard">
                <button className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium">
                  לוח בקרה
                </button>
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <button 
                  onClick={openLoginModal}
                  className="flex items-center gap-1 text-amber-600 hover:text-amber-700 font-medium"
                >
                  <LogIn className="h-4 w-4" />
                  התחברות
                </button>
                <button 
                  onClick={openSignupModal}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium flex items-center gap-1"
                >
                  <UserPlus className="h-4 w-4" />
                  הרשמה
                </button>
              </div>
            )}
          </nav>
          <button 
            onClick={toggleMobileMenu} 
            className="md:hidden text-gray-600 hover:text-gray-900"
            aria-label="Toggle mobile menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
        
        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white py-4 px-4 border-t shadow-md animate-in slide-in-from-top duration-300">
            <div className="flex flex-col space-y-3">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-gray-800 hover:bg-amber-50 rounded-lg transition-colors">
                יתרונות
              </a>
              <a href="#testimonials" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-gray-800 hover:bg-amber-50 rounded-lg transition-colors">
                המלצות
              </a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-gray-800 hover:bg-amber-50 rounded-lg transition-colors">
                מחירים
              </a>
              <a href="/calculator" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-gray-800 hover:bg-amber-50 rounded-lg transition-colors">
                מחשבון רווח/הפסד
              </a>
              <div className="flex flex-col pt-2 gap-2 border-t">
                {isLoggedIn ? (
                  <>
                    <Link 
                      href="/dashboard"
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-center"
                    >
                      הדאשבורד שלי
                    </Link>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => {
                        openLoginModal();
                        setMobileMenuOpen(false);
                      }}
                      className="px-4 py-2 text-amber-600 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors font-medium"
                    >
                      התחברות
                    </button>
                    <button 
                      onClick={() => {
                        openSignupModal();
                        setMobileMenuOpen(false);
                      }}
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
                    >
                      הרשמה
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={closeAuthModal}
        initialMode={authModalMode}
      />

      {/* Hero Section */}
      <section className="pt-32 pb-20 relative overflow-hidden">
        {/* Background with trading charts */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white/90 via-white/80 to-white/80 backdrop-blur-sm z-10"></div>
          <div className="absolute inset-0 grid grid-cols-2 gap-2 p-4 opacity-20">
            {bgGraphImages.map((img, idx) => (
              <div key={idx} className={`bg-cover bg-center ${idx % 3 === 0 ? 'row-span-2' : ''}`} style={{ backgroundImage: `url(${img})` }}></div>
            ))}
          </div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col md:flex-row md:items-start gap-12">
            <div className="w-full md:w-1/2 text-center md:text-right order-1 md:order-1">
              <h1 className={`text-5xl md:text-7xl font-bold mb-8 ${rubik.className}`}>
                <span className="text-gray-800">אשף </span>
                <span className="text-amber-500">המסחר!</span>
              </h1>
              
              <div className="flex flex-col items-center md:items-start">
                <Link href="/dashboard" onClick={handleActionButtonClick}>
                  <button className="px-10 py-5 rounded-xl bg-amber-500 text-white font-semibold text-xl hover:bg-amber-600 transition-colors mb-6 shadow-lg">
                    אני רוצה לסחור כמו מקצוען
                    <ArrowUpRight className="inline mr-2 h-6 w-6" />
                  </button>
                </Link>
                               
                <div className="mb-4">
                  <div className="inline-flex items-center gap-3 rounded-full px-4 py-2 bg-gradient-to-r from-amber-500/10 to-amber-500/20 border border-amber-500/30">
                    <span className="inline-block w-3 h-3 rounded-full bg-amber-500 animate-ping"></span>
                    <span className="text-amber-700 text-base font-medium">3 ימי נסיון מלאים בשקל אחד בלבד!</span>
                  </div>
                </div>
              
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-amber-500 rounded-full flex items-center justify-center">
                    <div className="h-2 w-2 bg-white rounded-full"></div>
                  </div>
                  <p className="text-gray-600">
                    <span className="text-amber-500 font-bold">21,530</span> גרפים כבר נותחו בעזרת אשף המסחר
                  </p>
                </div>
              </div>
            </div>
            
            <div className="w-full md:w-1/2 flex justify-center order-2 md:order-2 mt-8 md:mt-0 mb-10 md:mb-0">
              <div className="bg-white rounded-2xl p-4 mx-auto shadow-lg border border-gray-100 w-full max-w-md">
                <div className="relative">
                  {/* Show different components based on animation step */}
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
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 relative overflow-hidden" ref={testimonialsSectionRef}>
        {/* Background with trading charts */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/90 via-white/80 to-white/90 backdrop-blur-sm z-10"></div>
          <div className="absolute inset-0 grid grid-cols-2 gap-2 p-4 opacity-20">
            {bgGraphImages.map((img, idx) => (
              <div key={idx} className={`bg-cover bg-center ${idx % 3 === 0 ? 'row-span-2' : ''}`} style={{ backgroundImage: `url(${img})` }}></div>
            ))}
          </div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className={`text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-6 ${rubik.className}`}>
              <span className="text-gray-800">תוצאות של </span>
              <span className="text-amber-500">הלקוחות שלנו 🪄</span>
            </h2>
            <p className="text-xl text-gray-600 mb-2">צפה בתוצאות האמיתיות של סוחרים שמשתמשים באשף המסחר</p>
            <div className="flex justify-center">
              <div className="h-1 w-20 bg-amber-500 rounded-full"></div>
            </div>
          </div>
          
          <div className="relative max-w-4xl mx-auto">
            <div className="bg-white p-4 rounded-2xl shadow-xl border border-amber-100">
              <img
                src={sliderImages[currentSlide]}
                alt={`Slide ${currentSlide + 1}`}
                className="w-full h-auto rounded-xl shadow-lg border-2 border-amber-200"
              />
              
              <button
                onClick={handlePrevSlide}
                className="absolute top-1/2 left-6 transform -translate-y-1/2 bg-amber-500 hover:bg-amber-600 text-white p-3 rounded-full shadow-lg transition-colors border-2 border-white"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button
                onClick={handleNextSlide}
                className="absolute top-1/2 right-6 transform -translate-y-1/2 bg-amber-500 hover:bg-amber-600 text-white p-3 rounded-full shadow-lg rotate-180 transition-colors border-2 border-white"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
            </div>
            
            {/* Separated navigation dots positioned below with margin */}
            <div className="flex justify-center mt-8">
              <div className="bg-white px-6 py-3 rounded-full shadow-lg border border-amber-100 flex gap-3">
                {sliderImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`w-4 h-4 rounded-full transition-all ${
                      currentSlide === index ? "bg-amber-500 scale-125" : "bg-gray-300 hover:bg-amber-300"
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section - NEW */}
      <section id="how-it-works-section" className="py-20 bg-gray-50 relative overflow-hidden">
        {/* Background with trading charts */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white/95 via-white/80 to-white/90 backdrop-blur-sm z-10"></div>
          <div className="absolute inset-0 grid grid-cols-2 gap-2 p-4 opacity-10">
            {bgGraphImages.map((img, idx) => (
              <div key={idx} className={`bg-cover bg-center ${idx % 3 === 0 ? 'row-span-2' : ''}`} style={{ backgroundImage: `url(${img})` }}></div>
            ))}
          </div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto text-center mb-16">
            <h2 className={`text-3xl md:text-4xl font-bold text-center mb-4 ${rubik.className}`}>
              <span className="text-gray-800">איך זה </span>
              <span className="text-amber-500">עובד? 🔍</span>
            </h2>
            <p className="text-xl text-gray-600 mb-2">תהליך פשוט בארבעה שלבים להשגת ניתוח מקצועי</p>
            <div className="flex justify-center">
              <div className="h-1 w-20 bg-amber-500 rounded-full"></div>
            </div>
          </div>
          
          {/* Roadmap Steps */}
          <div className="max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row items-center mb-16 bg-white rounded-2xl p-6 shadow-lg">
              <div className="w-full md:w-1/2 p-4 order-2 md:order-1">
                <div className="bg-amber-50 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto md:mx-0">
                  <span className="text-xl font-bold text-amber-500">1</span>
                </div>
                <h3 className={`text-2xl font-bold mb-3 text-center md:text-right ${rubik.className}`}>העלאת גרף</h3>
                <p className="text-gray-600 mb-4 text-center md:text-right">
                  העלה תמונת גרף מהמחשב, מהטלפון, או צלם ישירות ממסך המסחר שלך. מערכת האשף תקבל כל סוג של גרף מסחר ממגוון פלטפורמות.
                </p>
                <ul className="space-y-2 text-center md:text-right">
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">תומך בכל פלטפורמות המסחר</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">העלאה בגרירת קובץ או צילום מסך</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">זיהוי אוטומטי של סוג הנכס</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                </ul>
              </div>
              <div className="w-full md:w-1/2 p-4 order-1 md:order-2">
                <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
                  <h4 className="text-lg font-semibold text-center mb-4 text-gray-800">
                    העלאת גרף לניתוח
                  </h4>
                  <div className="border-2 border-dashed border-amber-300 rounded-xl p-4 text-center bg-amber-50/30">
                    <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4 border border-amber-200">
                      <Upload className="h-6 w-6 text-amber-500" />
                    </div>
                    <p className="text-gray-600 text-sm mb-2">גרור תמונה לכאן או</p>
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <button className="text-amber-500 font-medium">בחר קובץ</button>
                      <span className="text-gray-400">|</span>
                      <button className="text-amber-500 font-medium inline-flex items-center gap-1">
                        <Camera className="h-4 w-4" />
                        צלם תמונה
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Step 2 */}
            <div className="flex flex-col md:flex-row items-center mb-16 bg-white rounded-2xl p-6 shadow-lg">
              <div className="w-full md:w-1/2 p-4 order-1">
                <div className="bg-amber-50 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto md:mx-0">
                  <span className="text-xl font-bold text-amber-500">2</span>
                </div>
                <h3 className={`text-2xl font-bold mb-3 text-center md:text-right ${rubik.className}`}>ניתוח בזמן אמת</h3>
                <p className="text-gray-600 mb-4 text-center md:text-right">
                  הבינה המלאכותית המתקדמת שלנו מנתחת את הגרף במהירות, מזהה מגמות, נקודות מפתח, ורמות תמיכה והתנגדות באופן אוטומטי.
                </p>
                <ul className="space-y-2 text-center md:text-right">
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">ניתוח מהיר תוך שניות בודדות</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">זיהוי דפוסי מסחר ומגמות שוק</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">ניתוח אינדיקטורים טכניים</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                </ul>
              </div>
              <div className="w-full md:w-1/2 p-4 order-2">
                <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
                  <div className="mb-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-200">
                      <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1 text-center">
                      מנתח את הגרף...
                    </h3>
                    <p className="text-sm text-gray-600 text-center">
                      הבינה המלאכותית מזהה תבניות ונקודות מפתח
                    </p>
                  </div>
                  <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className="absolute top-0 left-0 h-full bg-amber-500"
                      style={{ width: "65%" }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    הניתוח יהיה מוכן בעוד 3 שניות
                  </p>
                </div>
              </div>
            </div>
            
            {/* Step 3 */}
            <div className="flex flex-col md:flex-row items-center mb-16 bg-white rounded-2xl p-6 shadow-lg">
              <div className="w-full md:w-1/2 p-4 order-2 md:order-1">
                <div className="bg-amber-50 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto md:mx-0">
                  <span className="text-xl font-bold text-amber-500">3</span>
                </div>
                <h3 className={`text-2xl font-bold mb-3 text-center md:text-right ${rubik.className}`}>תוצאות וניתוח</h3>
                <p className="text-gray-600 mb-4 text-center md:text-right">
                  קבל ניתוח מפורט הכולל המלצות לנקודות כניסה, יציאה, סטופ-לוס, וטייק-פרופיט. המערכת מציעה המלצות מדויקות המותאמות לסוג הנכס וסגנון המסחר.
                </p>
                <ul className="space-y-2 text-center md:text-right">
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">המלצות לנקודות כניסה ויציאה</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">רמות סטופ-לוס וטייק-פרופיט</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">תחזית כיווני מחיר אפשריים</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                </ul>
              </div>
              <div className="w-full md:w-1/2 p-4 order-1 md:order-2">
                <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">
                      ביטקוין
                    </h3>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                      קריפטו
                    </span>
                  </div>
                  
                  <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 overflow-hidden">
                    <img 
                      src="https://i.imgur.com/kppbqfT.png" 
                      alt="Analysis" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  <div className="flex items-center gap-1 text-gray-500 text-xs mb-2">
                    <Clock className="h-3 w-3" />
                    <span>עכשיו</span>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-2">
                    מחיר הביטקוין נמצא בעליה, וצפוי להתנגד ברמת $72,000. יש להיערך לכניסה ברמת תמיכה $69,200.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Step 4 */}
            <div className="flex flex-col md:flex-row items-center mb-16 bg-white rounded-2xl p-6 shadow-lg">
              <div className="w-full md:w-1/2 p-4 order-1">
                <div className="bg-amber-50 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto md:mx-0">
                  <span className="text-xl font-bold text-amber-500">4</span>
                </div>
                <h3 className={`text-2xl font-bold mb-3 text-center md:text-right ${rubik.className}`}>ביצוע פעולות מסחר</h3>
                <p className="text-gray-600 mb-4 text-center md:text-right">
                  יישם את ההמלצות בפלטפורמת המסחר שלך. עקוב אחר ההנחיות לכניסה, הגדרת סטופ-לוס וטייק-פרופיט, ונהל את העסקה בצורה מיטבית.
                </p>
                <ul className="space-y-2 text-center md:text-right">
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">גישה למידע בכל זמן מהמכשיר שלך</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">התראות בזמן אמת על הזדמנויות</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                  <li className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-gray-700">שיפור רווחיות ויעילות המסחר</span>
                    <Check className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  </li>
                </ul>
              </div>
              <div className="w-full md:w-1/2 p-4 order-2">
                <div className="bg-gray-800 rounded-xl p-6 shadow-md">
                  <h4 className="text-lg font-semibold text-white mb-4 text-center">
                    ביצוע עסקה
                  </h4>
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-700 rounded">
                      <span className="text-gray-300">זוג מסחר</span>
                      <span className="text-white font-medium">BTC/USD</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-700 rounded">
                      <span className="text-gray-300">כיוון</span>
                      <span className="text-green-400 font-medium">קניה (Long)</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-700 rounded">
                      <span className="text-gray-300">כניסה</span>
                      <span className="text-white font-medium">$69,200</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-700 rounded">
                      <span className="text-gray-300">סטופ לוס</span>
                      <span className="text-red-400 font-medium">$68,100</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-700 rounded">
                      <span className="text-gray-300">טייק פרופיט</span>
                      <span className="text-green-400 font-medium">$72,500</span>
                    </div>
                  </div>
                  <button 
                    className="w-full py-2 rounded-lg font-semibold transition-colors bg-amber-500 text-white hover:bg-amber-600"
                    onClick={handleActionButtonClick}
                  >
                    בצע פעולה
                  </button>
                </div>
              </div>
            </div>
            
            {/* Call to Action */}
            <div className="text-center">
              <div className="relative max-w-3xl mx-auto mb-10">
                <div className="text-gray-700 text-lg space-y-4">
                  <h3 className="text-xl md:text-2xl font-bold text-amber-700 mb-4">
                    אתם רוצים לדעת בדיוק מתי להיכנס לעסקה ולנצח את המשחק?
                  </h3>
                  <p>החלטנו להעניק לכם את הכלי שיעזור לכם לקבל את ההחלטות הנכונות בזמן הנכון.</p>
                  <p>המערכת שלנו מנתחת את הגרפים בצורה חכמה ומדויקת, כך שתדעו בדיוק מתי הזמן הנכון לבצע את הצעד הבא.</p>
                  <p className="text-amber-700 font-medium">אל תפספסו את ההזדמנות לקחת את יכולת המסחר שלכם לרמה הבאה עם תובנות שיכולות להבטיח לכם יתרון תחרותי!</p>
                </div>
              </div>
              <Link href="/dashboard" onClick={handleActionButtonClick}>
                <button className="px-8 py-4 rounded-xl bg-amber-500 text-white font-semibold text-lg hover:bg-amber-600 transition-colors">
                  נסה את אשף המסחר עכשיו!
                  <ArrowUpRight className="inline mr-2 h-5 w-5" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-gradient-to-b from-white to-amber-50/30 relative">
        {/* Background with trading charts */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10"></div>
          <div className="absolute inset-0 grid grid-cols-3 gap-1 opacity-10">
            {Array(6).fill(0).map((_, idx) => (
              <div key={idx} className="bg-cover bg-center" 
                style={{ backgroundImage: `url(${bgGraphImages[idx % bgGraphImages.length]})` }}></div>
            ))}
          </div>
        </div>
      
        <div className="container mx-auto max-w-6xl px-4 relative z-10">
          <div className="text-center mb-16">
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`}>
              <span className="text-gray-800">היתרונות </span>
              <span className="text-amber-500">שלנו 🚀</span>
            </h2>
            <p className="text-xl text-gray-600 mb-2">
              הטכנולוגיה המתקדמת ביותר לניתוח טכני מקצועי
            </p>
            <div className="flex justify-center mt-4">
              <div className="h-1 w-20 bg-amber-500 rounded-full"></div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <Target className="h-10 w-10" />,
                title: "זיהוי נקודות כניסה מדויקות",
                description: "אלגוריתם AI מתקדם המזהה את נקודות הכניסה האופטימליות לעסקאות עם אחוזי הצלחה גבוהים במיוחד",
                highlight: "87% דיוק",
              },
              {
                icon: <Shield className="h-10 w-10" />,
                title: "סטופ לוס וטייק פרופיט חכמים",
                description: "מערכת אוטומטית שמחשבת את רמות הסטופ לוס והטייק פרופיט האידיאליות לכל עסקה על בסיס התנודתיות וההיסטוריה",
                highlight: "ניהול סיכונים מובנה",
              },
              {
                icon: <TrendingUp className="h-10 w-10" />,
                title: "זיהוי מגמות ורמות קריטיות",
                description: "זיהוי רמות תמיכה והתנגדות, נקודות מפתח ואיתור מגמות עוד בשלבים המוקדמים שלהן לפני השוק",
                highlight: "התראות בזמן אמת",
              },
              {
                icon: <BarChart3 className="h-10 w-10" />,
                title: "אנליזה מקצועית לכל סוגי הנכסים",
                description: "ניתוח מקיף ומדויק התומך במניות, קריפטו, סחורות, פורקס ועוד עם התאמה אישית לכל סוג נכס",
                highlight: "תמיכה ב-100+ נכסים",
              },
            ].map((feature, index) => (
              <div 
                key={index} 
                className="group relative rounded-2xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
              >
                {/* Background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-white to-amber-50/80 opacity-90"></div>
                
                {/* Corner decoration */}
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-bl-full"></div>
                
                <div className="relative p-8 h-full flex flex-col">
                  {/* Icon with dynamic background */}
                  <div className="mb-6">
                    <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-500 rounded-xl border border-amber-200">
                      {feature.icon}
                    </div>
                  </div>
                  
                  {/* Title */}
                  <h3 className={`text-xl font-bold mb-3 text-gray-800 ${rubik.className}`}>
                    {feature.title}
                  </h3>
                  
                  {/* Description */}
                  <p className="text-gray-600 mb-5">
                    {feature.description}
                  </p>

                  {/* Highlight badge */}
                  <div className="mt-auto">
                    <span className="inline-block px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                      {feature.highlight}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center flex flex-col items-center">
            <Link href="/dashboard" onClick={handleActionButtonClick}>
              <button className="px-8 py-4 rounded-xl bg-amber-500 text-white font-semibold text-lg hover:bg-amber-600 transition-colors">
                התחל לנתח גרפים עכשיו
                <ArrowUpRight className="inline mr-2 h-5 w-5" />
              </button>
            </Link>
            
            <div className="flex items-center rounded-full px-6 py-2 bg-gradient-to-r from-amber-500/10 to-amber-500/20 border border-amber-500/30 mt-8">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping mr-3"></span>
              <span className="text-amber-700 text-sm font-medium ml-2">אלפי סוחרים כבר משתמשים באשף המסחר בהצלחה!</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Updated design matching website colors */}
      <section id="pricing" className="py-20 bg-white relative overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-10">
            <h2 className={`text-4xl md:text-5xl font-bold mb-4 ${rubik.className}`}>
              <span className="text-gray-800">מסלולי </span>
              <span className="text-amber-500">מחירים 💰</span>
            </h2>
          </div>

          {/* Billing toggle */}
          <div className="flex justify-center items-center gap-6 mb-16">
            <span className={`text-gray-700 font-medium ${!isAnnual ? "text-amber-600" : ""}`}>
              חיוב חודשי
            </span>
            <label className="inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                value="" 
                className="sr-only peer" 
                checked={isAnnual}
                onChange={() => setIsAnnual(!isAnnual)}
              />
              <div className="relative w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-500 dark:peer-checked:bg-amber-500"></div>
            </label>
            <div className="flex items-center gap-2">
              <span className={`text-gray-700 font-medium ${isAnnual ? "text-amber-600" : ""}`}>
                חיוב שנתי
              </span>
              <span className="px-2 py-1 text-xs font-medium text-white bg-amber-500 rounded-full">
                30% הנחה
              </span>
            </div>
          </div>

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            {filteredPlans.map((plan, index) => (
              <div key={plan.id} className="bg-white rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-shadow duration-300">
                <div className="p-6 bg-amber-500 text-white">
                  <h3 className={`text-2xl font-bold mb-2 ${rubik.className}`}>{plan.name}</h3>
                  <div className="text-4xl font-bold mb-2">
                    {isAnnual ? (
                      <>
                        ₪{(plan.price / 12).toFixed(0)} <span className="text-sm font-normal">/ חודש</span>
                      </>
                    ) : (
                      <>
                        ₪{plan.price} <span className="text-sm font-normal">/ חודש</span>
                      </>
                    )}
                  </div>
                  {isAnnual && (
                    <div className="text-amber-100 text-sm mb-4">
                      חיוב שנתי של ₪{plan.price}
                    </div>
                  )}
                </div>
                <div className="p-6 flex flex-col" style={{ minHeight: '350px' }}>
                  <ul className="mb-6 flex-grow">
                    {plan.features && plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="mb-2 flex items-start">
                        <Check className="h-5 w-5 text-amber-500 mt-0.5 ml-2 flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/dashboard"
                    onClick={handleActionButtonClick}
                    className="block w-full py-3 px-4 text-center bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
                  >
                    בחר מסלול
                  </Link>
                </div>
              </div>
            ))}
          </div>
          
          {/* Removing Trust badges section */}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 relative overflow-hidden">
        {/* Background with subtle chart pattern */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10"></div>
          <div className="absolute inset-0 grid grid-cols-4 gap-1 opacity-10">
            {Array(8).fill(0).map((_, idx) => (
              <div key={idx} className="bg-cover bg-center" 
                style={{ backgroundImage: `url(${bgGraphImages[idx % bgGraphImages.length]})` }}></div>
            ))}
          </div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <h2 className={`text-3xl md:text-4xl font-bold text-center mb-16 ${rubik.className}`}>
            שאלות נפוצות ❓
          </h2>
          <div className="max-w-3xl mx-auto space-y-6">
            {[
              {
                q: "איך עובד הניתוח באמצעות AI?",
                a: "המערכת שלנו משתמשת באלגוריתמים מתקדמים לניתוח דפוסים בגרפים של כל סוגי הנכסים, מזהה נקודות מפתח ומספקת המלצות מבוססות על ניתוח היסטורי ומגמות שוק.",
              },
              {
                q: "האם אני יכול לבטל את המנוי בכל עת?",
                a: "כן, ניתן לבטל את המנוי בכל עת ללא התחייבות. החיוב יופסק בסוף תקופת החיוב הנוכחית.",
              },
              {
                q: "אילו סוגי נכסים אתם מנתחים?",
                a: "אנחנו מנתחים מגוון רחב של נכסים: קריפטו, מניות, פני סטוקס, חוזים עתידיים, פורקס, אגחים, סחורות ועוד. המערכת מותאמת לכל סוג נכס.",
              },
              {
                q: "כמה זמן לוקח לקבל ניתוח?",
                a: "הניתוח מתבצע באופן מיידי, ותוך מספר שניות תקבלו דוח מפורט עם כל ההמלצות והתובנות, לכל סוג נכס שתבחרו.",
              },
            ].map((item, index) => (
              <div key={index} className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-100">
                <h3 className={`text-lg font-semibold mb-2 ${rubik.className}`}>{item.q}</h3>
                <p className="text-gray-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="py-20 relative overflow-hidden">
        {/* Background with prominent chart pattern */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/90 to-amber-600/90 z-10"></div>
          <div className="absolute inset-0 grid grid-cols-3 gap-1">
            {bgGraphImages.map((img, idx) => (
              <div key={idx} className="bg-cover bg-center opacity-20" 
                style={{ backgroundImage: `url(${img})` }}></div>
            ))}
          </div>
        </div>
        
        <div className="container mx-auto px-4 text-center relative z-20">
          <h2 className={`text-3xl md:text-4xl font-bold text-white mb-8 ${rubik.className}`}>
            התחל ליצור ניתוחים כבר עכשיו
          </h2>
          
          <Link href="/dashboard" onClick={handleActionButtonClick}>
            <button className="px-8 py-4 rounded-xl bg-white text-amber-600 font-semibold text-lg hover:bg-amber-50 transition-colors">
              הצטרף בשקל אחד לאשף המסחר
              <ChevronLeft className="inline mr-2 h-5 w-5" />
            </button>
          </Link>
        </div>
      </section>

      {/* Adding CSS for date labels in mobile */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .date-label {
            font-size: 0.7rem;
          }
        }
      `}</style>

      <style jsx global>{`
        button[role="switch"] {
          position: relative;
          width: 50px;
          height: 24px;
          background-color: #ccc;
          border-radius: 12px;
          transition: background-color 0.3s;
          cursor: pointer;
        }

        button[role="switch"][aria-checked="true"] {
          background-color: #f59e0b; /* Amber color */
        }

        button[role="switch"]::before {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          background-color: white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.3s;
          transform: translateX(2px);
        }

        button[role="switch"][aria-checked="true"]::before {
          transform: translateX(26px);
        }
      `}</style>

      <style jsx global>{`
        @keyframes pulse-width {
          0%, 100% { width: 30%; }
          50% { width: 70%; }
        }
        
        .animate-pulse-width {
          animation: pulse-width 2s infinite ease-in-out;
        }
      `}</style>

      {/* Footer */}
      <footer className="pt-16 pb-8 border-t border-amber-100 bg-gradient-to-b from-white to-amber-50/20">
        <div className="container mx-auto px-4">
          {/* Top section with columns */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Company info */}
            <div className="md:col-span-1">
              <div className={`flex items-center gap-2 text-2xl font-bold text-amber-500 mb-4 ${rubik.className}`}>
                <BarChart3 className="h-8 w-8" />
                אשף המסחר
              </div>
              <p className={`text-gray-600 mb-6 ${heebo.className}`}>
                הכלי המתקדם ביותר לניתוח גרפים וקבלת המלצות מסחר מדויקות בזמן אמת
              </p>
              <div className="inline-flex items-center rounded-full px-3 py-1 bg-gradient-to-r from-amber-500/10 to-amber-500/20 border border-amber-500/30">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping mr-2"></span>
                <span className="text-amber-700 text-sm font-medium">מעל 1,000 משתמשים</span>
              </div>
            </div>

            {/* Quick links */}
            <div className="md:col-span-1">
              <h3 className={`text-lg font-bold mb-4 text-gray-800 ${rubik.className}`}>ניווט מהיר</h3>
              <ul className="space-y-3">
                <li>
                  <button onClick={() => scrollToSection("features")} className="text-gray-600 hover:text-amber-500 transition-colors flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                    יתרונות
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("how-it-works-section")} className="text-gray-600 hover:text-amber-500 transition-colors flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                    איך זה עובד?
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("testimonials")} className="text-gray-600 hover:text-amber-500 transition-colors flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                    המלצות
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("pricing")} className="text-gray-600 hover:text-amber-500 transition-colors flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                    תמחור
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("faq")} className="text-gray-600 hover:text-amber-500 transition-colors flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                    שאלות נפוצות
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("cta")} className="text-gray-600 hover:text-amber-500 transition-colors flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                    התחל עכשיו
                  </button>
                </li>
              </ul>
            </div>

            {/* Legal links */}
            <div className="md:col-span-1">
              <h3 className={`text-lg font-bold mb-4 text-gray-800 ${rubik.className}`}>משפטי</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/terms">
                    <span className="text-gray-600 hover:text-amber-500 transition-colors flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                      תקנון
                    </span>
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact/CTA */}
            <div className="md:col-span-1">
              <h3 className={`text-lg font-bold mb-4 text-gray-800 ${rubik.className}`}>צור קשר</h3>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-amber-100">
                <p className="text-gray-600 mb-4">יש לך שאלות? אנחנו כאן לעזור!</p>
                <Link href="https://wa.link/cmzorx">
                  <button className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors">
                    שלח הודעה
                  </button>
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom section with copyright and social */}
          <div className="pt-6 border-t border-amber-100/50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-500">
              © <span suppressHydrationWarning>{new Date().getFullYear()}</span> אשף המסחר. כל הזכויות שמורות.
            </div>
            
            <div className="flex items-center gap-4">
              {/* Social icons */}
              <a href="https://www.instagram.com/cryptoai.il/" className="w-8 h-8 flex items-center justify-center rounded-full bg-amber-100 text-amber-500 hover:bg-amber-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a href="https://www.tiktok.com/@cryptoai.il" className="w-8 h-8 flex items-center justify-center rounded-full bg-amber-100 text-amber-500 hover:bg-amber-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 448 512">
                  <path d="M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z"/>
                </svg>
              </a>
              <a href="#" className="w-8 h-8 flex items-center justify-center rounded-full bg-amber-100 text-amber-500 hover:bg-amber-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a 
        href="https://wa.link/cmzorx" 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg hover:scale-110 transition-transform duration-300 bg-[#25D366]"
        aria-label="שלח הודעה בוואטסאפ"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="white" viewBox="0 0 448 512">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
        </svg>
      </a>
    </div>
  );
}

export default Home;
