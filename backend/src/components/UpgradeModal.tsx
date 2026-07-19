import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, X, Check, Shield, TrendingUp, Loader2 } from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import { createClient } from "../../lib/supabase/client";

interface Plan {
  id: string;
  name: string;
  daily_limit: number;
  price: number;
  is_monthly: boolean;
  features?: string[];
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const supabase = createClient();
  const router = useRouter();
  
  // Set this to true to enable signature functionality
  const enableSignature = false;
  
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isAnnual, setIsAnnual] = useState<boolean>(false);
  const [discount, setDiscount] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [userData, setUserData] = useState<{email?: string, name?: string, hasSignedTerms?: boolean}>({});
  
  // Fetch user data including signature status
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Get user
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        
        // Check if user has already signed
        const { data: userSignature } = await supabase
          .from('user_signatures')
          .select('*')
          .eq('user_id', data.user.id)
          .maybeSingle();
        
        setUserData({
          email: data.user.email,
          name: data.user.user_metadata?.name,
          hasSignedTerms: !!userSignature
        });
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };
    
    fetchUserData();
  }, []);
  
  // Fetch plans when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchPlans();
    }
  }, [isOpen]);
  
  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/plans");
      setPlans(res.data.plans);
    } catch (err) {
      console.error("Error fetching plans:", err);
    } finally {
      setLoading(false);
    }
  };
  
  // Close modal with ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Record signature in database
  const saveSignature = async (signatureImageData?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Insert or update signature record with the signature image data
      await supabase.from('user_signatures').upsert({
        user_id: user.id,
        signed_at: new Date().toISOString(),
        terms_version: '1.0', // You can track terms versions if needed
        signature_image: signatureImageData // Store the actual signature image
      });
    } catch (error) {
      console.error("Error saving signature:", error);
    }
  };

  const processPlanPayment = async (planId: string) => {
    try {
      const selectedPlan = plans.find(p => p.id === planId);
      const discountCode: string = discount;

      const res = await axios.post("/api/stripe/payment", { planId, discountCode });
      if (res.data.success) {
        window.location.href = res.data.redirectUrl;
      } else {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: res.data.message || "שגיאה בתשלום",
        });
      }
    } catch (error: any) {
      if (error.response) {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: error.response.data.error || "שגיאה בתשלום",
        });
      } else if (error.request) {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: "לא התקבלה תגובה מהשרת. אנא נסה שוב מאוחר יותר.",
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: error.message || "אירעה שגיאה בהגדרת הבקשה.",
        });
      }
    }
  };

  const handlePlanSelect = (planId: string) => {
    setSelectedPlanId(planId);
    
    // If user already signed, proceed directly to payment
    if (userData.hasSignedTerms) {
      processPlanPayment(planId);
      return;
    }
    
    // Otherwise show terms document first for review
    Swal.fire({
      title: 'אישור תנאי שימוש',
      html: `
        <div class="text-right mb-4">
          <p>לפני שנמשיך, אנא קרא את תנאי השימוש.</p>
          <p>תוכל ${enableSignature ? 'לחתום בשלב הבא לאישור התנאים' : 'לאשר אותם בלחיצה על כפתור "אני מסכים"'}.</p>
        </div>
        <div id="terms-container" style="height: 350px; border: 1px solid #e2e8f0; border-radius: 0.5rem; overflow: auto;">
          <iframe src="/terms" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: enableSignature ? 'אני מסכים וממשיך לחתימה' : 'אני מסכים לתנאים',
      cancelButtonText: 'ביטול',
      confirmButtonColor: '#F59E0B',
      showLoaderOnConfirm: true,
      preConfirm: () => {
        return new Promise((resolve) => {
          // If signature is disabled, just save acceptance and proceed to payment
          if (!enableSignature) {
            saveSignature(); // Save without signature image data
            setTimeout(() => {
              processPlanPayment(planId);
            }, 500);
            resolve(true);
            return;
          }
          
          // Show signature form in next step (only when enableSignature is true)
          Swal.fire({
            title: 'חתימה על תנאי השימוש',
            html: `
              <div class="text-right mb-4">
                <p>אנא חתום להסכמה לתנאי השימוש שלנו.</p>
              </div>
              <div id="signature-container" style="height: 300px; border: 1px solid #e2e8f0; border-radius: 0.5rem; overflow: hidden;"></div>
            `,
            showCancelButton: true,
            showConfirmButton: true,
            confirmButtonText: 'שמור חתימה',
            cancelButtonText: 'ביטול',
            allowOutsideClick: false,
            didOpen: () => {
              // Initialize a simple signature pad instead of DocuSeal
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/signature_pad@4.0.0/dist/signature_pad.umd.min.js';
              script.async = true;
              document.head.appendChild(script);
              
              script.onload = () => {
                const container = document.getElementById('signature-container');
                if (container) {
                  container.innerHTML = `
                    <div style="text-align: center; font-weight: bold; margin-bottom: 10px;">
                      ${userData.name || 'חתימה'}
                    </div>
                    <div style="height: 240px; width: 100%; border: 1px dashed #ccc; border-radius: 4px; position: relative; background-color: #f9f9f9;">
                      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ccc; font-size: 16px; pointer-events: none; z-index: 0;">
                        לחץ וגרור כדי לחתום
                      </div>
                      <canvas id="signature-pad" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 1;"></canvas>
                      <div id="signature-clear" style="position: absolute; bottom: 10px; right: 10px; background: #f59e0b; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer; z-index: 2;">
                        נקה
                      </div>
                    </div>
                  `;
                  
                  // Initialize signature pad
                  const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
                  const clearButton = document.getElementById('signature-clear');
                  
                  if (canvas && clearButton) {
                    // Adjust canvas size to match container
                    const canvasParent = canvas.parentElement as HTMLElement;
                    canvas.width = canvasParent.offsetWidth;
                    canvas.height = canvasParent.offsetHeight;
                    
                    // Define SignaturePad type for TypeScript
                    type SignaturePadType = {
                      new(canvas: HTMLCanvasElement, options?: any): {
                        clear: () => void;
                        isEmpty: () => boolean;
                        toDataURL: (type?: string, encoderOptions?: number) => string;
                      }
                    };
                    
                    // Initialize SignaturePad with type casting
                    const SignaturePad = (window as any).SignaturePad as SignaturePadType;
                    const signaturePad = new SignaturePad(canvas, {
                      backgroundColor: 'rgba(255, 255, 255, 0)',
                      penColor: 'rgb(0, 0, 0)',
                      velocityFilterWeight: 0.7
                    });
                    
                    // Clear button handler
                    clearButton.addEventListener('click', () => {
                      signaturePad.clear();
                    });
                    
                    // Handle Swal confirm button click
                    const confirmButton = Swal.getConfirmButton();
                    if (confirmButton) {
                      confirmButton.addEventListener('click', async () => {
                        if (signaturePad.isEmpty()) {
                          Swal.showValidationMessage('נא לחתום לפני שמירה');
                          return false;
                        }
                        
                        // Save signature data
                        const signatureData = signaturePad.toDataURL();
                        
                        // Save signature in database
                        await saveSignature(signatureData);
                        
                        // After a short delay, process payment
                        setTimeout(() => {
                          processPlanPayment(planId);
                        }, 500);
                      });
                    }
                  }
                }
              };
            }
          });
          
          resolve(true);
        });
      }
    });
  };

  const filteredPlans = plans
    .filter((plan) => plan.is_monthly != isAnnual)
    .sort((a, b) => a.price - b.price);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-hidden">
      <div className="bg-white rounded-2xl p-4 md:p-8 w-full max-w-4xl shadow-xl border border-amber-100 relative animate-fadeIn my-2 md:my-8 max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 md:top-6 md:right-6 text-gray-400 hover:text-gray-600 transition-colors z-10"
          aria-label="Close modal"
        >
          <X className="h-5 w-5 md:h-6 md:w-6" />
        </button>
        
        <div className="overflow-y-auto flex-1 px-1 md:px-4">
          <div className="mb-4 md:mb-8 flex items-center justify-center pt-2 md:pt-4">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
              <CreditCard className="h-6 w-6 md:h-8 md:w-8 text-amber-500" />
            </div>
          </div>
          
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 text-center">
            שדרג את החשבון שלך
          </h2>
          <p className="text-gray-600 text-center mb-4 md:mb-6">
            כדי להשתמש בתכונות המתקדמות של אשף המסחר עליך לבחור תוכנית
          </p>

          {/* Toggle for monthly/annual billing */}
          <div className="flex justify-center mb-4 md:mb-8">
            <div className="bg-gray-100 p-1 rounded-lg flex items-center text-sm md:text-base">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-md transition-colors ${
                  !isAnnual
                    ? "bg-white shadow-sm text-amber-700 font-medium"
                    : "text-gray-600"
                }`}
              >
                חיוב חודשי
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-md transition-colors ${
                  isAnnual
                    ? "bg-white shadow-sm text-amber-700 font-medium"
                    : "text-gray-600"
                }`}
              >
                חיוב שנתי
              </button>
            </div>
          </div>

          {/* Discount code input */}
          <div className="mb-4 md:mb-8 max-w-xs mx-auto">
            <input
              type="text"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="קוד הנחה (אם יש לך)"
              className="w-full px-3 py-2 text-sm md:text-base border rounded-lg text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 text-amber-500 animate-spin mb-4" />
              <p className="text-gray-600">טוען תוכניות...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-4 md:pb-6">
              {filteredPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 md:p-6 flex flex-col justify-between text-center ${
                    plan.name.includes('מקצוען') ? 'shadow-xl md:transform md:scale-105 md:z-10' : 'shadow-lg'
                  }`}
                >
                  <div className="flex-grow">
                    {/* Badge at the top inside the card */}
                    {plan.name.includes('מקצוען') && (
                      <div className="bg-amber-800 text-white px-3 py-1 rounded-md text-sm font-bold mb-2 md:mb-3 inline-block">
                        מומלץ ★
                      </div>
                    )}
                    
                    {plan.price === 1 && !plan.name.includes('מקצוען') && (
                      <div className="bg-amber-800 text-white px-3 py-1 rounded-md text-sm font-bold mb-2 md:mb-3 inline-block">
                        נסיון ראשוני
                      </div>
                    )}
                    
                    <h3 className="text-lg md:text-xl font-semibold mb-1 md:mb-3 text-white">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mb-1 md:mb-3 justify-center">
                      <span className="text-2xl md:text-3xl font-bold text-white">
                        ₪{isAnnual ? Math.round(plan.price / 12) : plan.price}
                      </span>
                      {plan.price === 1 ? (
                        <span className="text-xs md:text-sm text-amber-100">/לשלושה ימים ראשונים</span>
                      ) : (
                        <span className="text-xs md:text-sm text-amber-100">/חודש</span>
                      )}
                    </div>
                    {plan.price === 1 ? (
                      <p className="text-amber-100 text-xs md:text-sm mb-2 md:mb-4">לאחר מכן תשלום חודשי של ₪95</p>
                    ) : null}
                    
                    <ul className="space-y-1 md:space-y-3 text-xs md:text-sm text-amber-50 my-2 md:my-5">
                      {plan.features?.map((feature: string, index: number) => (
                        <li key={index} className="flex items-center gap-1 md:gap-2 justify-center">
                          <Check className="h-4 w-4 md:h-5 md:w-5 text-amber-200 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={() => handlePlanSelect(plan.id)}
                    className="w-full py-2 md:py-3 rounded-lg font-semibold transition-colors bg-white text-amber-600 hover:bg-amber-50 mt-2 md:mt-4 text-sm md:text-base"
                  >
                    בחר מסלול
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}