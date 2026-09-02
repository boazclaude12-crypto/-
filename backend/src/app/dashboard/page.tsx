"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Upload, Camera, Loader2, HelpCircle, X, Lock, CreditCard, History, ChevronDown, Clock, Maximize2 } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkSqueezeParagraphs from 'remark-squeeze-paragraphs';
import Swal from 'sweetalert2';
import dynamic from "next/dynamic";

import { Analysis, assetTypes } from "../../components/AnalysisInterface";
import Header from "../../components/Header";

type AssetType = typeof assetTypes[number];

interface Platform {
  name: string;
  logo: string;
  steps: {
    title: string;
    description: string;
    image: string;
  }[];
}

const platforms: Platform[] = [
  {
    name: 'TradingView',
    logo: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3',
    steps: [
      {
        title: 'פתיחת אינדיקטור RSI',
        description: 'לחץ על כפתור האינדיקטורים בסרגל העליון ובחר "Relative Strength Index"',
        image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3'
      },
      {
        title: 'הגדרת פרמטרים',
        description: 'הגדר תקופה של 14 (ברירת מחדל) ובחר צבעים לקו ה-RSI',
        image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3'
      }
    ]
  },
  {
    name: 'Binance',
    logo: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247',
    steps: [
      {
        title: 'הוספת אינדיקטור',
        description: 'לחץ על "Indicators" בתפריט העליון ובחר RSI',
        image: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247'
      },
      {
        title: 'התאמת הגדרות',
        description: 'בחר תקופה של 14 ימים והתאם את הצבעים לפי העדפתך',
        image: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247'
      }
    ]
  },
  {
    name: 'Bybit',
    logo: 'https://images.unsplash.com/photo-1642790551116-18e4f6d5d092',
    steps: [
      {
        title: 'בחירת אינדיקטור',
        description: 'לחץ על סמל האינדיקטורים וחפש RSI',
        image: 'https://images.unsplash.com/photo-1642790551116-18e4f6d5d092'
      },
      {
        title: 'קביעת פרמטרים',
        description: 'הגדר תקופה של 14 והתאם את רמות ה-oversold/overbought',
        image: 'https://images.unsplash.com/photo-1642790551116-18e4f6d5d092'
      }
    ]
  }
];

interface UploadGuideProps {
  onClose: () => void;
}

function UploadGuide({ onClose }: UploadGuideProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">מדריך העלאת תמונות</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Best Practices */}
          <section>
            <h3 className="text-lg font-semibold mb-4">המלצות לצילום גרף איכותי</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-800 mb-2">✓ מה כן</h4>
                <ul className="space-y-2 text-green-700">
                  <li>• צלם את כל הגרף כולל אינדיקטורים</li>
                  <li>• ודא שהמחיר הנוכחי נראה בבירור</li>
                  <li>• הוסף RSI ואינדיקטורים רלוונטיים</li>
                  <li>• השתמש בתצוגת מסך מלא</li>
                </ul>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <h4 className="font-medium text-red-800 mb-2">✗ מה לא</h4>
                <ul className="space-y-2 text-red-700">
                  <li>• אל תצלם גרף ללא אינדיקטורים</li>
                  <li>• אל תשתמש בצילום מסך חלקי</li>
                  <li>• אל תכלול מידע אישי בצילום</li>
                  <li>• אל תעלה תמונות מטושטשות</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Platform Guides */}
          <section>
            <h3 className="text-lg font-semibold mb-4">הוספת RSI בפלטפורמות שונות</h3>
            <div className="grid md:grid-cols-3 gap-6">
              {platforms.map((platform) => (
                <div key={platform.name} className="border rounded-xl overflow-hidden">
                  <div className="p-4 border-b bg-gray-50">
                    <h4 className="font-medium">{platform.name}</h4>
                  </div>
                  <div className="p-4 space-y-4">
                    {platform.steps.map((step, index) => (
                      <div key={index}>
                        <h5 className="font-medium text-sm mb-1">{step.title}</h5>
                        <p className="text-sm text-gray-600">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Example Images */}
          <section>
            <h3 className="text-lg font-semibold mb-4">דוגמאות לצילומי גרף</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border rounded-xl overflow-hidden">
                <div className="p-4 border-b bg-green-50">
                  <h4 className="font-medium text-green-800">✓ גרף איכותי</h4>
                </div>
                <div className="aspect-video bg-gray-100 flex items-center justify-center">
                  <img src="https://i.imgur.com/kppbqfT.png"></img>
                </div>
                <div className="p-4">
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• RSI מוצג בבירור</li>
                    <li>• תצוגת מסך מלאה</li>
                    <li>• היסטוריה מספקת</li>
                  </ul>
                </div>
              </div>
              <div className="border rounded-xl overflow-hidden">
                <div className="p-4 border-b bg-red-50">
                  <h4 className="font-medium text-red-800">✗ גרף לא איכותי</h4>
                </div>
                <div className="aspect-video bg-gray-100 flex items-center justify-center">
                  <img src="https://i.imgur.com/o91HNCY.png"></img>
                </div>
                <div className="p-4">
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• חסרים אינדיקטורים</li>
                    <li>• תצוגה חלקית</li>
                    <li>• היסטוריה קצרה מדי</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function removeExtraEmptyLines(text:string) {
  return text.replace(/\n\s*\n/g, '\n\n');
}

function AnalysisCountdownModal({ onClose }: { onClose: () => void }) {
  const [countdown, setCountdown] = useState(60);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Simulate analysis completion
          setTimeout(() => {
            onClose();
          }, 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const dotsTimer = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 500);

    return () => {
      clearInterval(timer);
      clearInterval(dotsTimer);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-2xl max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            מנתח את הגרף{dots}
          </h3>
          <p className="text-gray-600">
            הבינה המלאכותית מזהה תבניות ונקודות מפתח
          </p>
        </div>
        <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className="absolute top-0 left-0 h-full bg-amber-600 transition-all duration-1000"
            style={{ width: `${((60 - countdown) / 60) * 100}%` }}
          />
        </div>
        <p className="text-sm text-gray-500">
          הניתוח יהיה מוכן בעוד {countdown} שניות
        </p>
      </div>
    </div>
  );
}

function AnalysisModal({ analysis, onClose }: { analysis: Analysis; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">{analysis.asset_name}</h3>
              <p className="text-gray-500">  
              {new Date(analysis.created_at).toLocaleString('he-IL', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
              {analysis.type}
            </span>
          </div>
          <img
            src={analysis.image}
            alt="Chart Analysis"
            className="w-full rounded-lg border border-gray-200"
          />
          <div className="prose max-w-none">
            <p className="whitespace-pre-wrap text-gray-700">
            <ReactMarkdown
              components={{
                p: ({ node, ...props }) => <div {...props} />,
              }}
              remarkPlugins={[remarkSqueezeParagraphs]}
            >
              {removeExtraEmptyLines(analysis.analysis)}
            </ReactMarkdown>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Dynamically import the UpgradeModal component
const UpgradeModal = dynamic(() => import("../../components/UpgradeModal"), {
  ssr: false,
});

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();

  
  const [loading, setLoading] = useState(true);
  const [analysisHistory, setAnalysisHistory] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [analysisButtonText, setAnalysisButtonText] = useState<string>("נתח את הגרף");
  const [assetType, setAssetType] = useState<AssetType>('קריפטו');
  const [showCountdown, setShowCountdown] = useState(false);
  const [showUploadGuide, setShowUploadGuide] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [userHasPlan, setUserHasPlan] = useState(true); // Default to true until we check

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [assetName, setAssetName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Fetch the logged-in user on component mount
  useEffect(() => {
    const checkUserStatus = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser?.id) {
        router.push("/?auth=login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select()
        .eq("user_id", currentUser.id)
        .single();

      if (error) console.error("Error fetching user status:", error);

      // Check if user has a plan and set state accordingly
      const hasValidPlan = profile?.plan_id;
      setUserHasPlan(!!hasValidPlan);
      setUser(currentUser);
    };

    checkUserStatus();
  }, [supabase, router]);
    
  // Fetch analysis history (sorted newest first)
  const fetchAnalysisHistory = async () => {
    const { data, error } = await supabase
      .from("analyses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching analyses:", error);
    } else {
      setAnalysisHistory(data || []);
      console.log("Data:: " + JSON.stringify(data));

    }
  };

  useEffect(() => {
    fetchAnalysisHistory();
  }, []);

  // When closing the modal, refresh the history:
  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedAnalysis(null);
    fetchAnalysisHistory();
  };

  // Once the user is set, check their plan
  useEffect(() => {
    const checkUserPlan = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser?.id) {
        router.push("/?auth=login");
        return;
      }

      const { data: user_profiles, error } = await supabase
        .from("user_profiles")
        .select("plan_id, disable_date")
        .eq("user_id", currentUser.id)
        .single();

      if (error) {
        console.error("Error fetching user profile:", error);
        router.push("/?auth=login");
        return;
      }

      // Check if disable_date has passed by more than 1 day
      if (user_profiles?.disable_date) {
        const disableDate = new Date(user_profiles.disable_date);
        const oneDayAfterDisable = new Date(disableDate.getTime() + (24 * 60 * 60 * 1000));
        const now = new Date();

        if (now > oneDayAfterDisable && user_profiles.plan_id) {
          console.log('🔄 Plan expired, updating to null...');
          const { error: updateError } = await supabase
            .from("user_profiles")
            .update({ plan_id: null })
            .eq("user_id", currentUser.id);

          if (updateError) {
            console.error("❌ Error updating expired plan:", updateError);
          } else {
            console.log('✅ Plan updated to null successfully');
            user_profiles.plan_id = null;
          }
        }
      }

      setUserHasPlan(!!user_profiles?.plan_id);
      setLoading(false);
    };

    checkUserPlan();
  }, [router, supabase]);

  // after useEffect that fetches user plan data, add a new useEffect for showing notification
  useEffect(() => {
    // Show a notification when the dashboard loads if user doesn't have a plan
    if (!loading && !userHasPlan) {
      Swal.fire({
        title: 'גרסה מוגבלת',
        text: 'אתה צופה בגרסה המוגבלת של אשף המסחר. שדרג כדי לקבל גישה מלאה לכל התכונות.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'שדרג עכשיו',
        cancelButtonText: 'אולי מאוחר יותר',
        confirmButtonColor: '#F59E0B',
      }).then((result) => {
        if (result.isConfirmed) {
          setIsUpgradeModalOpen(true);
        }
      });
    }
  }, [loading, userHasPlan]);

  // Also add banner at the top of the dashboard for users without a plan
  const RestrictedModeBanner = () => {
    if (userHasPlan) return null;
    
    return (
      <div className="bg-amber-50 border-b border-amber-100 py-2 px-4 flex items-center justify-center gap-2">
        <span className="text-amber-800 text-sm">אתה בגרסה המוגבלת של אשף המסחר.</span>
        <button 
          onClick={() => setIsUpgradeModalOpen(true)}
          className="text-amber-600 hover:text-amber-700 text-sm font-medium underline"
        >
          שדרג עכשיו
        </button>
      </div>
    );
  };

  // File change and drag handlers
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const clipboardItems = event.clipboardData?.items;
      if (!clipboardItems) return;
      for (const item of clipboardItems) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) return;
          setSelectedFile(file);
          setPreviewUrl(URL.createObjectURL(file));
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const handleSubmit = async () => {
    if (!selectedFile || !assetName.trim()) {
      Swal.fire({
        icon: "warning",
        title: "חסרים פרטים",
        text: "בבקשה להעלות תמונה ולהזין שם נכס",
        confirmButtonText: "הבנתי",
        confirmButtonColor: "#F59E0B",
      });
      return;
    }

    // If user doesn't have a plan, show the upgrade modal
    if (!userHasPlan) {
      setIsUpgradeModalOpen(true);
      return;
    }

    setShowCountdown(true);
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onloadend = async () => {
      const base64Image = reader.result as string;
      setAnalysisButtonText("מנתח...");

      try {
        const response = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetName,
            imageBase64: base64Image,
            assetNameType: assetType,
          }),
        });
        
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          throw new Error("שגיאת שרת");
        }
        
        if (!response.ok) {
          setShowCountdown(false);
          if (data.error === "Daily limit reached, try again later") {
            // Calculate time until midnight tonight (00:00) in Israel time
            const now = new Date();
            // Get current time in Israel
            const israelNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
            // Create tomorrow at midnight in Israel
            const israelTomorrow = new Date(israelNow);
            israelTomorrow.setDate(israelTomorrow.getDate() + 1);
            israelTomorrow.setHours(0, 0, 0, 0);
            
            // Convert both to UTC for comparison
            const timeLeft = israelTomorrow.getTime() - israelNow.getTime();
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            
            await Swal.fire({
              title: 'הגעת למכסה היומית',
              html: `הניתוחים שלך יתחדשו בחצות (בעוד ${hoursLeft} שעות ו-${minutesLeft} דקות).<br>שדרג את החבילה שלך לניתוחים נוספים`,
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: 'שדרג עכשיו',
              cancelButtonText: 'סגור',
              confirmButtonColor: '#4F46E5',
            }).then((result) => {
              if (result.isConfirmed) {
                router.push('/profile');
              }
            });
          } else if (data.error === "Image size must be less than 5MB") {
            await Swal.fire({
              title: 'התמונה גדולה מדי',
              text: 'גודל התמונה חייב להיות קטן מ-5MB',
              icon: 'error',
              confirmButtonText: 'הבנתי',
              confirmButtonColor: '#4F46E5',
            });
          } else if (data.error === "Only PNG and JPG images are allowed") {
            await Swal.fire({
              title: 'פורמט לא נתמך',
              text: 'ניתן להעלות רק תמונות מסוג PNG או JPG',
              icon: 'error',
              confirmButtonText: 'הבנתי',
              confirmButtonColor: '#4F46E5',
            });
          } else if (data.error === "No subscription found") {
            await Swal.fire({
              title: 'אין מנוי פעיל',
              text: 'נדרש מנוי פעיל לשימוש במערכת',
              icon: 'warning',
              confirmButtonText: 'עבור למנויים',
              confirmButtonColor: '#4F46E5',
            }).then((result) => {
              if (result.isConfirmed) {
                router.push('/profile');
              }
            });
          } else if (data.error === "Unauthorized") {
            await Swal.fire({
              title: 'נדרשת התחברות',
              text: 'אנא התחבר מחדש למערכת',
              icon: 'warning',
              confirmButtonText: 'התחבר',
              confirmButtonColor: '#4F46E5',
            }).then((result) => {
              if (result.isConfirmed) {
                router.push('/?auth=login');
              }
            });
          } else {
            // Show what the server actually said. Collapsing every unrecognised
            // failure into one message hid the cause and left nothing to act on.
            await Swal.fire({
              title: 'שגיאה',
              text: data?.message || data?.error || 'לא ניתן לנתח את התמונה כרגע, אנא נסה שוב מאוחר יותר',
              icon: 'error',
              confirmButtonText: 'הבנתי',
              confirmButtonColor: '#4F46E5',
            });
          }
          setAnalysisButtonText("נתח את הגרף");
          return;
        }

        setShowCountdown(false);
        const newAnalysis: Analysis = {
          id: data.id,
          user_id: user.id,
          asset_name: assetName,
          type: assetType,
          image: base64Image,
          analysis: data.analysis,
          created_at: new Date().toISOString(),
        };

        setAnalysisHistory([newAnalysis, ...analysisHistory]);
        setSelectedAnalysis(newAnalysis);
        setShowModal(true);

        setAnalysisButtonText("נתח את הגרף");
        setSelectedFile(null);
        setPreviewUrl(null);
        setAssetName("");
      } catch (error) {
        setShowCountdown(false);
        await Swal.fire({
          title: 'שגיאה',
          text: 'לא ניתן לנתח את התמונה כרגע, אנא נסה שוב מאוחר יותר',
          icon: 'error',
          confirmButtonText: 'הבנתי',
          confirmButtonColor: '#4F46E5',
        });
        setAnalysisButtonText("נתח את הגרף");
      }
    };
  };

  const openAnalysis = (analysis: Analysis) => {
    setSelectedAnalysis(analysis);
    setShowModal(true);
  };

  const openCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };
  
  // Add a listener for the openUpgradeModal event
  useEffect(() => {
    const handleOpenUpgradeModal = () => {
      setIsUpgradeModalOpen(true);
    };
    
    // Add event listener
    window.addEventListener('openUpgradeModal', handleOpenUpgradeModal);
    
    // Clean up
    return () => {
      window.removeEventListener('openUpgradeModal', handleOpenUpgradeModal);
    };
  }, []);

  if (loading) return (
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Restricted Mode Banner */}
      <RestrictedModeBanner />
      
      {/* Header */}
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Upload Section */}
        <div className="bg-white rounded-2xl p-8 shadow-lg mb-8 relative">
          {!userHasPlan && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-10">
              <div className="bg-white p-8 rounded-xl shadow-md max-w-md text-center">
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200 mb-4 mx-auto">
                  <Lock className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">תכונה נעולה</h3>
                <p className="text-gray-600 mb-4 text-center">
                  כדי לנתח גרפים ולהשתמש בתכונות המתקדמות, עליך לשדרג לתוכנית פרימיום
                </p>
                <button 
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-semibold shadow-md flex items-center gap-2 mx-auto"
                >
                  <CreditCard className="h-5 w-5" />
                  שדרג עכשיו
                </button>
              </div>
            </div>
          )}

          <h2 className="text-2xl font-bold text-center mb-8">
            העלאת גרף לניתוח
          </h2>
          <button onClick={() => setShowUploadGuide(true)}
              className="-top-12 left-0 text-gray-500 hover:text-gray-700 flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              <span className="text-sm">מדריך העלאה</span>
            </button>
          <br></br>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              previewUrl
                ? "border-amber-500 bg-amber-50/30"
                : "border-gray-300 hover:border-amber-400"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {previewUrl ? (
              <div className="space-y-4">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-80 mx-auto rounded-lg shadow-md"
                />
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  הסר תמונה
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
                  <Upload className="h-8 w-8 text-amber-500" />
                </div>
                <div className="space-y-2">
                  <p className="text-gray-600 text-lg">
                    גרור תמונה לכאן או
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-amber-500 hover:text-amber-600 font-medium"
                    >
                      בחר קובץ
                    </button>
                    <span className="text-gray-400">|</span>
                    <button
                      onClick={openCamera}
                      className="text-amber-500 hover:text-amber-600 font-medium inline-flex items-center gap-2"
                    >
                      <Camera className="h-5 w-5" />
                      צלם תמונה
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="assetType" className="block text-sm font-medium text-gray-700 mb-1">
                  סוג הנכס
                </label>
                <select
                  id="assetType"
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as AssetType)}
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  {assetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assetName" className="block text-sm font-medium text-gray-700 mb-1">
                  שם הנכס
                </label>
                <input
                  type="text"
                  id="assetName"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="לדוגמה: ביטקוין"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!selectedFile || !assetName.trim() || !assetType}
              className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-colors ${
                selectedFile && assetName.trim() && assetType
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {analysisButtonText}
            </button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Analysis History */}
        <div className="bg-white rounded-2xl p-8 shadow-lg relative">
          {!userHasPlan && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-10">
              <div className="bg-white p-8 rounded-xl shadow-md max-w-md text-center">
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200 mb-4 mx-auto">
                  <Lock className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">תכונה נעולה</h3>
                <p className="text-gray-600 mb-4 text-center">
                  שדרג את חשבונך כדי לראות את היסטוריית הניתוחים שלך
                </p>
                <button 
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-semibold shadow-md flex items-center gap-2 mx-auto"
                >
                  <CreditCard className="h-5 w-5" />
                  שדרג עכשיו
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">היסטוריית ניתוחים</h2>
            <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg">
              <History className="h-5 w-5 text-gray-400" />
              <span className="text-gray-600">30 ימים אחרונים</span>
              <ChevronDown className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          <div className="space-y-6">
            {analysisHistory.length > 0 ? (
              analysisHistory.map((analysis) => (
                <div
                  key={analysis.id}
                  className="group border rounded-xl p-6 hover:border-amber-200 hover:bg-amber-50/30 transition-all"
                >
                  <div className="flex items-start gap-6">
                    <img
                      src={analysis.image}
                      alt="Analysis Thumbnail"
                      className="w-32 h-32 rounded-lg object-cover shadow-md group-hover:shadow-lg transition-shadow"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {analysis.asset_name}
                        </h3>
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                          {analysis.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                        <Clock className="h-4 w-4" />
                        {new Date(analysis.created_at).toLocaleString('he-IL', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                      </div>
                      <p className="text-gray-700 line-clamp-2 mb-3">
                        <ReactMarkdown
                          components={{
                            p: ({ node, ...props }) => <div {...props} />,
                          }}
                          remarkPlugins={[remarkSqueezeParagraphs]}
                        >
                          {removeExtraEmptyLines(analysis.analysis)}
                        </ReactMarkdown>
                      </p>
                      <button
                        onClick={() => openAnalysis(analysis)}
                        className="text-amber-500 hover:text-amber-600 font-medium inline-flex items-center gap-1"
                      >
                        <span>צפה בניתוח המלא</span>
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500">
                <History className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>אין ניתוחים בהיסטוריה</p>
              </div>
            )}
          </div>
        </div>

        {/* Add the UpgradeModal */}
        <UpgradeModal 
          isOpen={isUpgradeModalOpen} 
          onClose={() => setIsUpgradeModalOpen(false)} 
        />
      </main>

      {showUploadGuide && (
        <UploadGuide onClose={() => setShowUploadGuide(false)} />
      )}

      {showCountdown && (
        <AnalysisCountdownModal
          onClose={() => {
            //setShowCountdown(false);
          }}/>
      )}

      {showModal && selectedAnalysis && (
        <AnalysisModal
          analysis={selectedAnalysis}
          onClose={() => {
            setShowModal(false);
            setSelectedAnalysis(null);
          }}
        />
      )}
    </div>
  );
}
