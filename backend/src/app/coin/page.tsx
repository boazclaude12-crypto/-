"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Copy,
  ChevronLeft,
  Wallet,
  Send,
  Plus,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Key,
  Info,
  Settings,
  RefreshCw,
  Lock,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import Swal from 'sweetalert2';
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import dynamic from "next/dynamic";
import { triggerUpgradeModal } from "../../components/Header";

// Dynamically import the UpgradeModal component
const UpgradeModal = dynamic(() => import("../../components/UpgradeModal"), {
  ssr: false,
});

// Define types for tokens and wallet state
interface Token {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  logo: string | null;
  verified: boolean;
  usdPrice: number | null;
  usdValue: number | null;
  isCreator: boolean;
}

export interface WalletState {
  address: string;
  solBalance: number;
  solPrice: number;
  solValue: number;
  tokens: Token[];
  privateKey?: string;
}

interface CreateCoinFormData {
  name: string;
  symbol: string;
  devBuyAmount: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
}

// Add these interfaces at the top with other interfaces
interface UserSettings {
  priorityFee: number;
  slippage: number;
}

// (For now we keep a fallback mock wallet in case the API is unavailable)
export default function CreateCoin() {
  const router = useRouter();
  const supabase = createClient();
  const [wallet, setWallet] = useState<WalletState>();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateCoinFormData>({
    name: "",
    symbol: "",
    devBuyAmount: "0.02", // Default to minimum amount
    description: "",
    twitter: "",
    telegram: "",
    website: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    priorityFee: 0.0005,
    slippage: 10
  });
  const [user, setUser] = useState<any>(null);
  const [userHasPlan, setUserHasPlan] = useState(true);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // Check if user has permission to access the page
  useEffect(() => {
    const checkUserPermission = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/?auth=login");
        return;
      }
      
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("plan_id")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching user profile:", error);
        return;
      }

      // If user doesn't have a plan, redirect to dashboard and trigger the upgrade modal
      if (!profile?.plan_id) {
        triggerUpgradeModal();
        router.push("/dashboard");
      }
    };

    checkUserPermission();
  }, [supabase, router]);

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

  // Fetch wallet info
  const fetchWallet = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/wallet");
      const data = await res.json();
      console.log("Wallet data:", data);
      setWallet(data);
    } catch (error) {
      console.error("Error fetching wallet info:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // When the page loads, fetch wallet info
  useEffect(() => {
    fetchWallet();
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > 5 * 1024 * 1024) {
      await Swal.fire({
        title: 'קובץ גדול מדי',
        text: 'גודל הקובץ חייב להיות קטן מ-5MB',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
      return;
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      await Swal.fire({
        title: 'סוג קובץ לא נתמך',
        text: 'ניתן להעלות רק תמונות מסוג PNG או JPG',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
      return;
    }

    // Validate image dimensions
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      if (img.width < 200 || img.height < 200) {
        await Swal.fire({
          title: 'תמונה קטנה מדי',
          text: 'גודל התמונה חייב להיות לפחות 200x200 פיקסלים',
          icon: 'error',
          confirmButtonText: 'הבנתי',
          confirmButtonColor: '#F59E0B',
        });
        return;
      }

      if (img.width > 2000 || img.height > 2000) {
        await Swal.fire({
          title: 'תמונה גדולה מדי',
          text: 'גודל התמונה לא יכול לעלות על 2000x2000 פיקסלים',
          icon: 'error',
          confirmButtonText: 'הבנתי',
          confirmButtonColor: '#F59E0B',
        });
        return;
      }

      setSelectedFile(file);
      setPreviewUrl(url);
    } catch (error) {
      await Swal.fire({
        title: 'שגיאה',
        text: 'לא ניתן לטעון את התמונה',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
      URL.revokeObjectURL(url);
    }
  };

  const handleCopyAddress = async () => {
    try {
        if(wallet)
      await navigator.clipboard.writeText(wallet.address);
      // Optionally show a toast for success
    } catch (err) {
      // Optionally show an error toast
    }
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateEnglishText = (text: string): boolean => {
    return /^[A-Za-z0-9\s.,!?-]*$/.test(text);
  };

  const handleCreateCoin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Add validation for minimum amount
    const devBuyAmount = parseFloat(formData.devBuyAmount);
    if (devBuyAmount < 0.02) {
      await Swal.fire({
        title: 'סכום נמוך מדי',
        text: 'הסכום המינימלי ליצירת מטבע הוא 0.02 סול',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
      return;
    }

    if (!selectedFile) {
      await Swal.fire({
        title: 'תמונה חסרה',
        text: 'נא להעלות תמונת לוגו למטבע',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
      return;
    }

    setIsCreating(true);

    try {
      // Show loading animation with status updates
      const loadingPopup = Swal.fire({
        title: 'יוצר מטבע...',
        html: `
          <div class="space-y-4">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <div id="status" class="text-gray-600">מתחיל תהליך...</div>
            <p class="text-gray-500 text-sm">התהליך יכול לקחת מספר שניות</p>
          </div>
        `,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
          const statusElement = Swal.getPopup()?.querySelector('#status');
          if (statusElement) {
            statusElement.textContent = 'מעלה תמונה...';
          }
        }
      });

      // Convert image to base64 with progress tracking
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      // Update status before API call
      const statusElement = Swal.getPopup()?.querySelector('#status');
      if (statusElement) {
        statusElement.textContent = 'שולח בקשה ליצירת מטבע...';
      }

      console.log("Sending create token request...");
      const response = await fetch("/api/wallet/token/create", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          symbol: formData.symbol,
          devBuyAmount: formData.devBuyAmount,
          description: formData.description,
          twitter: formData.twitter,
          telegram: formData.telegram,
          website: formData.website,
          image: base64Image
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'שגיאה ביצירת המטבע');
      }

      const data = await response.json();
      console.log("Token creation successful:", data);

      await Swal.close();
      await Swal.fire({
        title: 'הצלחה!',
        html: `
          <div class="space-y-4">
            <p>המטבע נוצר בהצלחה!</p>
            <div class="mt-4">
              <p class="font-medium mb-2">כתובת החוזה:</p>
              <code class="block bg-gray-100 p-2 rounded text-sm break-all">${data.tokenAddress}</code>
            </div>
            <div class="mt-4">
              <a href="https://pump.fun/coin/${data.tokenAddress}" target="_blank" className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-600">
                צפה בגרף המטבע
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
          </div>
        `,
        icon: 'success',
        confirmButtonText: 'אישור',
        confirmButtonColor: '#F59E0B',
      });

      // Refresh wallet data
      fetchWallet();

    } catch (error) {
      console.error("Token creation error:", error);
      await Swal.fire({
        title: 'שגיאה',
        text: error instanceof Error ? error.message : 'שגיאה ביצירת המטבע',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleExportPrivateKey = async () => {
    try {
      const res = await fetch("/api/wallet/export-key");
      const data = await res.json();
      
      if (data.privateKey) {
        await navigator.clipboard.writeText(data.privateKey);
        await Swal.fire({
          title: 'הצלחה!',
          text: 'המפתח הפרטי הועתק ללוח',
          icon: 'success',
          confirmButtonText: 'אישור',
          confirmButtonColor: '#F59E0B',
          timer: 1500,
        });
      } else {
        await Swal.fire({
          title: 'שגיאה',
          text: 'לא ניתן לייצא את המפתח הפרטי',
          icon: 'error',
          confirmButtonText: 'הבנתי',
          confirmButtonColor: '#F59E0B',
        });
      }
    } catch (error) {
      console.error("Error exporting private key:", error);
      await Swal.fire({
        title: 'שגיאה',
        text: 'שגיאה בייצוא המפתח הפרטי',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
    }
  };

  const handleSellToken = async (mint: string, balance: number) => {
    try {
      // First confirmation popup
      const initialConfirm = await Swal.fire({
        title: 'מכירת טוקנים',
        html: `
          <div class="space-y-4">
            <p>האם אתה בטוח שברצונך למכור את כל הטוקנים?</p>
            <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p class="text-yellow-800 text-sm">⚠️ שים לב</p>
              <p class="text-yellow-700 text-sm">לא ניתן לבטל את הפעולה לאחר אישור</p>
            </div>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'כן, מכור הכל',
        cancelButtonText: 'ביטול',
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
        showLoaderOnConfirm: true,
        preConfirm: () => {
          return new Promise((resolve) => {
            // Show second confirmation
            Swal.fire({
              title: 'אישור סופי',
              text: 'האם אתה באמת בטוח? פעולה זו אינה הפיכה',
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: 'כן, אני בטוח',
              cancelButtonText: 'לא, בטל',
              confirmButtonColor: '#DC2626',
              cancelButtonColor: '#6B7280',
            }).then((result) => {
              resolve(result.isConfirmed);
            });
          });
        },
        allowOutsideClick: () => !Swal.isLoading()
      });

      if (!initialConfirm.isConfirmed) return;

      // Show loading state
      Swal.fire({
        title: 'מבצע מכירה...',
        html: `
          <div class="space-y-4">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
            <p class="text-gray-600">אנא המתן בזמן שהעסקה מתבצעת</p>
          </div>
        `,
        allowOutsideClick: false,
        showConfirmButton: false
      });

      const response = await fetch("/api/wallet/trade", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: "sell",
          mint,
          amount: balance,
          denominatedInSol: "true",
          slippage: settings.slippage,
          priorityFee: settings.priorityFee,
          pool: "pump"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'שגיאה במכירת הטוקנים');
      }

      const data = await response.json();

      await Swal.fire({
        title: 'הצלחה!',
        html: `
          <div class="space-y-4">
            <p>הטוקנים נמכרו בהצלחה</p>
            <div class="mt-4 flex items-center justify-center gap-2">
              <a href="${data.solscanUrl}" target="_blank" className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-600">
                צפה בעסקה בסולסקאן
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
              <div class="relative group">
                <span class="cursor-help text-gray-400">?</span>
                <div class="absolute bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-sm rounded-lg">
                  סולסקאן הוא סייר בלוקים המאפשר לך לעקוב אחר העסקה שלך ברשת סולנה ולוודא את השלמתה
                </div>
              </div>
            </div>
          </div>
        `,
        icon: 'success',
        confirmButtonText: 'אישור',
        confirmButtonColor: '#F59E0B',
      });

      // Refresh wallet data
      fetchWallet();

    } catch (error) {
      console.error("Token sell error:", error);
      await Swal.fire({
        title: 'שגיאה',
        text: error instanceof Error ? error.message : 'שגיאה במכירת הטוקנים',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
    }
  };

  const handlePartialSell = async (mint: string) => {
    try {
      const { value: amount } = await Swal.fire({
        title: 'כמות למכירה',
        input: 'number',
        inputLabel: 'הכנס את כמות הטוקנים למכירה',
        inputPlaceholder: 'הכנס כמות',
        showCancelButton: true,
        confirmButtonText: 'מכור',
        cancelButtonText: 'ביטול',
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
        inputValidator: (value) => {
          if (!value) {
            return 'חובה להכניס כמות';
          }
          if (parseFloat(value) <= 0) {
            return 'הכמות חייבת להיות גדולה מ-0';
          }
          const token = wallet?.tokens.find(t => t.mint === mint);
          if (token && parseFloat(value) > token.balance) {
            return 'אין מספיק טוקנים בארנק';
          }
          return null;
        }
      });

      if (amount) {
        const response = await fetch("/api/wallet/trade", {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: "sell",
            mint,
            amount: parseFloat(amount),
            denominatedInSol: "true",
            slippage: settings.slippage,
            priorityFee: settings.priorityFee,
            pool: "pump"
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'שגיאה במכירת הטוקנים');
        }

        const data = await response.json();

        await Swal.fire({
          title: 'הצלחה!',
          html: `
            <div class="space-y-4">
              <p>הטוקנים נמכרו בהצלחה</p>
              <div class="mt-4 flex items-center justify-center gap-2">
                <a href="${data.solscanUrl}" target="_blank" className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-600">
                  צפה בעסקה בסולסקאן
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
                <div class="relative group">
                  <span class="cursor-help text-gray-400">?</span>
                  <div class="absolute bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-sm rounded-lg">
                    סולסקאן הוא סייר בלוקים המאפשר לך לעקוב אחר העסקה שלך ברשת סולנה ולוודא את השלמתה
                  </div>
                </div>
              </div>
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'אישור',
          confirmButtonColor: '#F59E0B',
        });

        // Refresh wallet data
        fetchWallet();
      }
    } catch (error) {
      console.error("Token sell error:", error);
      await Swal.fire({
        title: 'שגיאה',
        text: error instanceof Error ? error.message : 'שגיאה במכירת הטוקנים',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
    }
  };

  const handleSettingsSave = async (newSettings: UserSettings) => {
    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      
      if (!response.ok) throw new Error('Failed to save settings');
      
      setSettings(newSettings);
      setShowSettings(false);
      
      await Swal.fire({
        title: 'הצלחה!',
        text: 'ההגדרות נשמרו בהצלחה',
        icon: 'success',
        confirmButtonText: 'אישור',
        confirmButtonColor: '#F59E0B',
      });
    } catch (error) {
      console.error("Settings save error:", error);
      await Swal.fire({
        title: 'שגיאה',
        text: 'שגיאה בשמירת ההגדרות',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
    }
  };

  // Add this effect to load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/user/settings");
        if (response.ok) {
          const data = await response.json();
          setSettings(data);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    };
    
    loadSettings();
  }, []);

  // Fix for linter errors in the JSX
  const myCreatedTokens = wallet?.tokens?.filter(token => token.isCreator) || [];

  // Add settings modal component before the return statement
  const SettingsModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full">
        <h3 className="text-xl font-bold mb-6">הגדרות מסחר</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              עמלת עדיפות (SOL)
            </label>
            <input
              type="number"
              value={settings.priorityFee}
              onChange={(e) => setSettings({...settings, priorityFee: parseFloat(e.target.value)})}
              step="0.0001"
              min="0"
              className="block w-full px-3 py-2 rounded-xl border"
            />
            <p className="mt-1 text-sm text-gray-500">ברירת מחדל: 0.0005</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סבולת מחיר (%)
            </label>
            <input
              type="number"
              value={settings.slippage}
              onChange={(e) => setSettings({...settings, slippage: parseInt(e.target.value)})}
              step="1"
              min="1"
              max="100"
              className="block w-full px-3 py-2 rounded-xl border"
            />
            <p className="mt-1 text-sm text-gray-500">ברירת מחדל: 10%</p>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => handleSettingsSave(settings)}
            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
          >
            שמור
          </button>
          <button
            onClick={() => setShowSettings(false)}
            className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );

  const handleSendSol = async () => {
    try {
      // Calculate max sendable amount (balance - fees)
      const FEE_BUFFER = 0.000005; // 5000 lamports in SOL
      const maxSendable = wallet ? (wallet.solBalance - FEE_BUFFER).toFixed(9) : "0";

      const { value: formValues } = await Swal.fire({
        title: 'שליחת SOL',
        html: `
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-right mb-1">כתובת מקבל</label>
              <input id="recipientAddress" class="w-full px-3 py-2 border rounded-lg text-right" placeholder="הכנס כתובת SOL">
            </div>
            <div>
              <label class="block text-sm font-medium text-right mb-1">כמות SOL</label>
              <div class="flex gap-2">
                <input 
                  id="amount" 
                  type="number" 
                  step="0.000000001" 
                  class="flex-1 px-3 py-2 border rounded-lg text-right" 
                  placeholder="0.0"
                >
                <button 
                  type="button" 
                  id="sendAllBtn" 
                  class="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200"
                >שלח הכל</button>
              </div>
              <p class="mt-1 text-sm text-gray-500 text-right">
                יתרה נוכחית: ${wallet?.solBalance.toLocaleString()} SOL
                <br/>
                <span class="text-xs">סכום מקסימלי לשליחה (כולל עמלות): ${maxSendable} SOL</span>
              </p>
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'שלח',
        cancelButtonText: 'ביטול',
        confirmButtonColor: '#F59E0B',
        showLoaderOnConfirm: true,
        didOpen: () => {
          const sendAllBtn = document.getElementById('sendAllBtn');
          const amountInput = document.getElementById('amount') as HTMLInputElement;
          
          if (sendAllBtn && amountInput) {
            sendAllBtn.addEventListener('click', () => {
              // Always set the actual maximum sendable amount
              amountInput.value = maxSendable;
              amountInput.disabled = false; // Keep enabled for user adjustments
            });
          }
        },
        preConfirm: async () => {
          const recipientAddress = (document.getElementById('recipientAddress') as HTMLInputElement).value;
          const amount = (document.getElementById('amount') as HTMLInputElement).value;

          if (!recipientAddress) {
            Swal.showValidationMessage('נא להזין כתובת מקבל');
            return false;
          }

          if (!amount) {
            Swal.showValidationMessage('נא להזין כמות');
            return false;
          }

          // Validate Solana address format
          if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recipientAddress)) {
            Swal.showValidationMessage('כתובת לא חוקית');
            return false;
          }

          const amountNum = parseFloat(amount);
          if (isNaN(amountNum) || amountNum <= 0) {
            Swal.showValidationMessage('כמות לא חוקית');
            return false;
          }
          if (amountNum < 0.001) {
            Swal.showValidationMessage('כמות מינימלית היא 0.001 SOL');
            return false;
          }
          if (wallet && amountNum > wallet.solBalance - FEE_BUFFER) {
            Swal.showValidationMessage('אין מספיק יתרה (כולל עמלות)');
            return false;
          }

          return { recipientAddress, amount: amountNum };
        }
      });

      if (!formValues) return;

      // Show loading state
      Swal.fire({
        title: 'שולח...',
        html: `
          <div class="space-y-4">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p class="text-gray-600">שולח את העסקה לרשת</p>
          </div>
        `,
        allowOutsideClick: false,
        showConfirmButton: false
      });

      // Send the transaction
      const response = await fetch('/api/wallet/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
      });

      const data = await response.json();

      // Close loading popup immediately
      Swal.close();

      if (data.success) {
        // Show success message
        await Swal.fire({
          title: 'העסקה נשלחה!',
          html: `
            <div class="space-y-4">
              <div className="flex items-center justify-center">
                <div className="bg-green-100 rounded-full p-3">
                  <svg class="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              </div>
              <div class="text-center">
                <p class="text-lg font-medium text-gray-900">נשלחו ${formValues.amount} SOL</p>
                <p class="text-sm text-gray-500">לכתובת: ${formValues.recipientAddress}</p>
                <p class="text-sm text-green-600 mt-2">העסקה אושרה ברשת!</p>
              </div>
              <div class="mt-4">
                <a href="${data.solscanUrl}" target="_blank" className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-600">
                  צפה בעסקה בסולסקאן
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
              </div>
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'אישור',
          confirmButtonColor: '#F59E0B',
        });
        
        // Refresh wallet data
        fetchWallet();
      } else {
        throw new Error(data.error || 'שגיאה בביצוע העברה');
      }
    } catch (error: any) {
      // Close loading popup if it's still open
      Swal.close();
      
      await Swal.fire({
        title: 'שגיאה',
        text: error.message || 'שגיאה בביצוע העברה',
        icon: 'error',
        confirmButtonText: 'הבנתי',
        confirmButtonColor: '#F59E0B',
      });
    }
  };

  const handleSendToken = async (token: Token) => {
    try {
      const { value: formValues } = await Swal.fire({
        title: `שליחת ${token.symbol}`,
        html: `
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-right mb-1">כתובת מקבל</label>
              <input id="recipientAddress" class="w-full px-3 py-2 border rounded-lg text-right" placeholder="הכנס כתובת SOL">
            </div>
            <div>
              <label class="block text-sm font-medium text-right mb-1">כמות ${token.symbol}</label>
              <input 
                id="amount" 
                type="number" 
                class="w-full px-3 py-2 border rounded-lg text-right" 
                placeholder="0.0"
              >
              <p class="mt-1 text-sm text-gray-500 text-right">
                יתרה נוכחית: ${token.balance} ${token.symbol}
              </p>
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'המשך',
        cancelButtonText: 'ביטול',
        preConfirm: async () => {
          const recipientAddress = (document.getElementById('recipientAddress') as HTMLInputElement).value;
          const amount = (document.getElementById('amount') as HTMLInputElement).value;

          if (!recipientAddress || !amount) {
            Swal.showValidationMessage('נא למלא את כל השדות');
            return false;
          }

          return { recipientAddress, amount: parseFloat(amount), tokenMint: token.mint };
        }
      });

      if (!formValues) return;

      // Add confirmation dialog
      const confirmResult = await Swal.fire({
        title: 'אישור שליחת טוקנים',
        html: `
          <div class="space-y-4">
            <p>האם אתה בטוח שברצונך לשלוח ${formValues.amount} ${token.symbol}?</p>
            <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p class="text-yellow-800 text-sm">⚠️ שים לב</p>
              <p class="text-yellow-700 text-sm">לא ניתן לבטל את הפעולה לאחר אישור</p>
            </div>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'כן, שלח',
        cancelButtonText: 'ביטול',
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
      });

      if (!confirmResult.isConfirmed) return;

      // Show loading state
      Swal.fire({
        title: 'שולח טוקנים...',
        html: 'אנא המתן בזמן שהעסקה מתבצעת',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const response = await fetch('/api/wallet/token/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
      });

      const data = await response.json();

      if (data.success) {
        await Swal.fire({
          title: 'הטוקנים נשלחו בהצלחה!',
          icon: 'success',
          html: `
            <a href="${data.solscanUrl}" target="_blank" className="text-amber-500 hover:text-amber-600">
              צפה בעסקה בסולסקאן
            </a>
          `,
        });
        fetchWallet();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      await Swal.fire({
        title: 'שגיאה',
        text: error.message,
        icon: 'error'
      });
    }
  };

  // Add this before the return statement
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
        <p className="mt-4 text-gray-600">טוען נתונים...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ChevronLeft className="h-5 w-5" />
            חזרה לדאשבורד
          </Link>
        </div>
      </header>

      {/* Lock overlay for users without a plan */}
      {!userHasPlan && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex flex-col items-center justify-center z-50">
          <div className="bg-white p-8 rounded-xl shadow-md max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200 mb-4 mx-auto">
              <Lock className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">תכונה נעולה</h3>
            <p className="text-gray-600 mb-4 text-center">
              כדי ליצור מטבעות ולנהל ארנק, עליך לשדרג לתוכנית פרימיום
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

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
          {/* Fixed Header */}
          <header className="bg-white border-b sticky top-0 z-10">
            <div className="container mx-auto px-4">
              <div className="flex items-center justify-between h-16">
                <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                  <ChevronLeft className="h-5 w-5" />
                  חזרה לדאשבורד
                </Link>
              </div>
            </div>
          </header>

          {/* Help Popup */}
          {showHelp && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold mb-4">מידע על יצירת מטבע בסולנה</h3>
                <div className="space-y-4 text-gray-600">
                  <p>
                    <strong>רשת סולנה:</strong>
                    <br />
                    סולנה היא רשת בלוקצ'יין מהירה ויעילה המאפשרת יצירת מטבעות חדשים בעלות נמוכה.
                  </p>
                  <p>
                    <strong>שדות נדרשים:</strong>
                    <ul className="list-disc list-inside space-y-2 mt-2">
                      <li><strong>שם המטבע:</strong> השם הרשמי של המטבע (באנגלית בלבד)</li>
                      <li><strong>סמל המטבע:</strong> קיצור של 5 תווים באנגלית</li>
                      <li><strong>תיאור:</strong> תיאור קצר של המטבע ומטרתו (באנגלית בלבד)</li>
                      <li><strong>קישורים חברתיים:</strong> חובה לספק קישורים לטוויטר וטלגרם לתקשורת עם הקהילה</li>
                      <li><strong>אתר:</strong> כתובת האתר הרשמי של המטבע</li>
                      <li><strong>רכישת DEV:</strong> כמות ה-SOL שתשמש לרכישה הראשונית של המטבע</li>
                      <li><strong>לוגו:</strong> תמונת לוגו איכותית בפורמט PNG או JPG</li>
                    </ul>
                  </p>
                  <p>
                    <strong>חשוב לדעת:</strong>
                    <ul className="list-disc list-inside space-y-2 mt-2">
                      <li>כל הטקסטים חייבים להיות באנגלית</li>
                      <li>הקישורים חייבים להיות פעילים ותקינים</li>
                      <li>עלות היצירה כוללת את רכישת ה-DEV + עמלות רשת</li>
                      <li>לאחר היצירה, המטבע יופיע בארנק שלך</li>
                    </ul>
                  </p>
                </div>
                <button
                  onClick={() => setShowHelp(false)}
                  className="mt-6 w-full py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors"
                >
                  הבנתי
                </button>
              </div>
            </div>
          )}

          <main className="container mx-auto px-4 py-4 md:py-8 max-w-7xl grid lg:grid-cols-2 gap-4 md:gap-8">
            {/* Coin Creation Form */}
            <div className="bg-white rounded-2xl p-4 md:p-8 shadow-lg">
              <h2 className="text-xl md:text-2xl font-bold mb-6 md:mb-8 flex items-center gap-2">
                <Plus className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                יצירת מטבע חדש
                <button
                  onClick={() => setShowHelp(true)}
                  className="p-1 rounded-full hover:bg-gray-100"
                  title="מידע על יצירת מטבע"
                >
                  <Info className="h-5 w-5 text-gray-400" />
                </button>
              </h2>
              <form onSubmit={handleCreateCoin} className="space-y-4 md:space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    שם המטבע
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (validateEnglishText(value)) {
                        setFormData({ ...formData, name: value });
                      }
                    }}
                    className="block w-full px-3 md:px-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="הכנס שם באנגלית"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    סמל המטבע
                  </label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="block w-full px-3 md:px-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="לדוגמה: MTK"
                    maxLength={5}
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">עד 5 תווים באנגלית</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    תיאור המטבע
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (validateEnglishText(value)) {
                        setFormData({ ...formData, description: value });
                      }
                    }}
                    className="block w-full px-3 md:px-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="הכנס תיאור באנגלית"
                    rows={3}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    קישור לטוויטר
                  </label>
                  <input
                    type="url"
                    value={formData.twitter}
                    onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                    className="block w-full px-3 md:px-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="הכנס קישור לטוויטר"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    קישור לטלגרם
                  </label>
                  <input
                    type="url"
                    value={formData.telegram}
                    onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
                    className="block w-full px-3 md:px-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="הכנס קישור לטלגרם"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    אתר אינטרנט
                  </label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="block w-full px-3 md:px-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="הכנס כתובת אתר"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    רכישת DEV (SOL)
                  </label>
                  <input
                    type="number"
                    value={formData.devBuyAmount}
                    onChange={(e) => setFormData({ ...formData, devBuyAmount: e.target.value })}
                    className="block w-full px-3 md:px-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="הכנס סכום"
                    step="0.01"
                    min="0.02"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    מינימום: 0.02 SOL | יתרה נוכחית: {(wallet?.solBalance || 0).toLocaleString()} SOL
                    {wallet?.solPrice && (
                      <>
                        <br />
                        סכום הרכישה בדולר: ${(Number(formData.devBuyAmount) * wallet.solPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 md:mb-2">
                    לוגו המטבע
                  </label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-4 md:p-8 text-center transition-colors ${
                      previewUrl ? "border-indigo-600 bg-indigo-50/30" : "border-gray-300 hover:border-indigo-400"
                    }`}
                  >
                    {previewUrl ? (
                      <div className="space-y-4">
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-24 h-24 md:w-32 md:h-32 mx-auto rounded-full object-cover"
                        />
                        <button
                          type="button"
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
                      <div className="space-y-3 md:space-y-4">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
                          <ImageIcon className="h-6 w-6 md:h-8 md:w-8 text-indigo-600" />
                        </div>
                        <div>
                          <label className="cursor-pointer text-indigo-600 hover:text-indigo-700 font-medium">
                            העלה תמונה
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={handleFileChange}
                            />
                          </label>
                          <p className="text-sm text-gray-500 mt-1">PNG, JPG עד 5MB</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isCreating}
                  className={`w-full py-3 md:py-4 px-4 md:px-6 rounded-xl font-semibold text-base md:text-lg transition-colors ${
                    isCreating
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-amber-500 text-white hover:bg-amber-600"
                  }`}
                >
                  {isCreating ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      יוצר מטבע...
                    </span>
                  ) : (
                    "צור מטבע"
                  )}
                </button>
              </form>
            </div>

            {/* Wallet Section */}
            <div className="bg-white rounded-2xl p-4 md:p-8 shadow-lg">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-96 space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  <p className="text-gray-500">טוען נתוני ארנק...</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6 md:mb-8">
                    <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                      <Wallet className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                      ארנק
                    </h2>
                    <div className="flex gap-1 md:gap-2">
                      <button 
                        onClick={() => fetchWallet()}
                        className="p-1.5 md:p-2 text-gray-600 hover:text-amber-500 rounded-lg hover:bg-amber-50"
                        title="רענן נתונים"
                      >
                        <RefreshCw className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                      <button 
                        onClick={() => setShowSettings(true)}
                        className="p-1.5 md:p-2 text-gray-600 hover:text-amber-500 rounded-lg hover:bg-amber-50"
                        title="הגדרות מסחר"
                      >
                        <Settings className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                      <button 
                        onClick={handleExportPrivateKey}
                        className="p-1.5 md:p-2 text-gray-600 hover:text-amber-500 rounded-lg hover:bg-amber-50"
                        title="ייצא מפתח פרטי"
                      >
                        <Key className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4 md:space-y-6">
                    {/* Wallet Address */}
                    <div className="bg-gray-50 p-3 md:p-4 rounded-xl">
                      <label className="block text-sm font-medium text-gray-600 mb-1 md:mb-2">
                        כתובת הארנק
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-xs md:text-sm bg-white px-2 md:px-3 py-2 rounded-lg border overflow-x-auto">
                          {wallet?.address}
                        </code>
                        <button
                          onClick={handleCopyAddress}
                          className="p-1.5 md:p-2 text-gray-600 hover:text-amber-500 rounded-lg hover:bg-amber-50"
                        >
                          <Copy className="h-4 w-4 md:h-5 md:w-5" />
                        </button>
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="bg-gradient-to-br from-amber-400 to-amber-500 p-4 md:p-6 rounded-xl text-white">
                      <p className="text-amber-50 text-sm mb-1">יתרה כוללת</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl md:text-3xl font-bold">
                          {(wallet?.solBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </span>
                        <span className="text-amber-100">SOL</span>
                        {wallet?.solPrice && (
                          <span className="text-amber-100 text-sm">
                            (${(wallet?.solValue || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })})
                          </span>
                        )}
                      </div>
                      <button
                        onClick={handleSendSol}
                        className="mt-3 md:mt-4 px-3 md:px-4 py-1.5 md:py-2 bg-white text-amber-500 rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-2 text-sm md:text-base"
                      >
                        <Send className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span>שלח</span>
                      </button>
                    </div>

                    {/* My Created Tokens */}
                    <div className="space-y-3 md:space-y-4 mb-6">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">המטבעות שלי</h3>
                        <button
                          onClick={() => Swal.fire({
                            title: 'מידע',
                            text: 'חלק מהמטבעות עשויים להופיע כ-Unknown מכיוון שהם לא רשומים במאגר של Raydium',
                            icon: 'info',
                            confirmButtonText: 'הבנתי'
                          })}
                          className="p-1 rounded-full hover:bg-amber-50"
                        >
                          <Info className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                      <div className="space-y-2 md:space-y-3">
                        {myCreatedTokens.length > 0 ? (
                          myCreatedTokens.map((token) => (
                            <motion.div
                              key={token.mint}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex flex-col gap-3 p-4 bg-white rounded-xl border hover:border-amber-200 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <img
                                    src={token.logo || "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"}
                                    alt={token.name}
                                    className="w-8 h-8 md:w-10 md:h-10 rounded-full"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
                                    }}
                                  />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{token.name}</span>
                                    <span className="text-sm text-gray-500">{token.symbol}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span>{token.balance.toLocaleString()} {token.symbol}</span>
                                    {token.usdValue && (
                                      <span className="text-gray-500">
                                        (${token.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex flex-wrap gap-2">
                                <a 
                                  href={`https://pump.fun/coin/${token.mint}`}
                                  target="_blank"
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-500 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  צפה בגרף
                                </a>
                                <button
                                  onClick={() => handleSellToken(token.mint, token.balance)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                                >
                                  מכור הכל
                                </button>
                                <button
                                  onClick={() => handlePartialSell(token.mint)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
                                >
                                  מכירה חלקית
                                </button>
                              </div>
                            </motion.div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            אין מטבעות שיצרת
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </main>

          {/* Settings Modal */}
          {showSettings && <SettingsModal />}
        </div>
      </main>
    </div>
  );
}

