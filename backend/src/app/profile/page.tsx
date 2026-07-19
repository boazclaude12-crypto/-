"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Swal from 'sweetalert2'
import { createClient } from "../../../lib/supabase/client"; // Use our client utility
import {
  CreditCard,
  Clock,
  Settings,
  LogOut,
  ChevronLeft,
  Edit2,
  Shield,
  Check,
  X,
  ArrowUpRight,
  AlertCircle,
  Loader2,
  MessageSquare
} from "lucide-react";
import axios, {AxiosError} from 'axios';

interface Plan {
  id: string;
  name: string;
  daily_limit: number;
  price: number;
  is_monthly: boolean;
  features?: string[];
}

interface PlanChangeConfirmationModalProps {
  onClose: () => void;
  onConfirm: () => void;
  plan: {
    name: string;
    price: number;
    id:number;
    isAnnual: boolean;
  };
}

function CancelSubscriptionModal({ 
  onClose, 
  onConfirm, 
  currentPlan 
}: { 
  onClose: () => void; 
  onConfirm: (reason: string) => void;
  currentPlan: Plan | null;
}) {
  const [step, setStep] = useState<'reason' | 'firstOffer' | 'secondOffer' | 'timer' | 'questions' | 'thankYou' | 'confirm'>('reason');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionNumber, setQuestionNumber] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [finalOffer, setFinalOffer] = useState<number>(0);
  const [email, setEmail] = useState('');
  // Check if cancellation is allowed from environment variable
  const cancelAllowed = process.env.NEXT_PUBLIC_CANCEL_ALLOWED !== 'false';

  const handleAnswerSubmit = async (answer: string) => {
    if (!answer.trim()) return;
    const supabase = createClient();
    const user = await supabase.auth.getUser();
    setEmail(user.data.user?.email || '');
    setIsLoading(true);
    try {
      const newAnswers = [...answers, answer];
      
      if (questionNumber >= 4) {
        setStep('thankYou');
        // Generate a random final offer between 60-80% discount
        setFinalOffer(Math.floor(Math.random() * (80 - 60 + 1)) + 60);
      } else {
        const response = await fetch('/api/generate-next-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            previousAnswers: newAnswers,
            questionNumber: questionNumber + 1,
            reason: getFinalReason()
          })
        });

        const data = await response.json();
        setAnswers(newAnswers);
        setCurrentQuestion(data.question);
        setQuestionNumber(prev => prev + 1);
      }
      setCurrentAnswer('');
    } catch (error) {
      console.error('Error generating next question:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'questions' && !currentQuestion) {
      const getFirstQuestion = async () => {
        setIsLoading(true);
        try {
          setCurrentQuestion('למה החלטת לבטל את המנוי?');
          setIsLoading(false);
        } catch (error) {
          console.error('Error getting first question:', error);
          setIsLoading(false);
        }
      };

      getFirstQuestion();
    }
  }, [step]);

  const handleContinue = async () => {
    if (step === 'reason') {
      setStep('firstOffer');
    } else if (step === 'firstOffer') {
      setStep('secondOffer');
    } else if (step === 'secondOffer') {
      setStep('timer');
    } else if (step === 'timer' && timeLeft === 0) {
      setStep('questions');
    } else if (step === 'thankYou') {
      const finalReason = getFinalReason();
      const supabase = await createClient();
      const user = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.data.user?.id || "")
        .single();
      
        if(!profile)
        {
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
            confirmButtonText: 'אישור',
          });
        }
  
        const cardcom_account_id = profile?.cardcom_account_id;
        if(cardcom_account_id != null)
        {
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
            confirmButtonText: 'אישור',
          });
        }
        else
        {
          window.location.href = 'https://billing.stripe.com/p/login/dR6aIh5mi16d9Hy5kk' + '?prefilled_email=' + encodeURIComponent(email);
        }
      
      onConfirm(finalReason);
    } else if (step === 'confirm') {
      const finalReason = getFinalReason();
      const supabase = await createClient();
      const user = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.data.user?.id || "")
        .single();
      
        if(!profile)
        {
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
            confirmButtonText: 'אישור',
          });
        }
  
        const cardcom_account_id = profile?.cardcom_account_id;
        if(cardcom_account_id != null)
        {
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
            confirmButtonText: 'אישור',
          });
        }
        else
        {
          window.location.href = 'https://billing.stripe.com/p/login/dR6aIh5mi16d9Hy5kk' + '?prefilled_email=' + encodeURIComponent(email);
        }
      
      onConfirm(finalReason);
    }
  };

  const getFinalReason = () => {
    return reason === 'other' ? customReason : reason;
  };

  // Timer effect
  useEffect(() => {
    if (step === 'timer') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000); //Change to 1000 for testing

      const handleVisibilityChange = () => {
        if (document.hidden) {
          setStep('reason');
          setTimeLeft(60);
          onClose();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      if (timeLeft === 0) {
        setStep('questions');
      }

      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [step, timeLeft]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full relative animate-in fade-in duration-200">
        <button onClick={onClose} className="absolute left-4 top-4 text-gray-400 hover:text-gray-600">
          <X className="h-6 w-6" />
        </button>

        {!cancelAllowed ? (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">ביטול מנוי</h3>
            <p className="text-gray-600">לביטול המנוי, אנא צור קשר עם התמיכה שלנו באמצעות WhatsApp.</p>
            <a 
              href="https://wa.link/cmzorx" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] text-white rounded-lg font-medium hover:bg-opacity-90 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="white" viewBox="0 0 448 512" className="mr-2">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
              </svg>
              צור קשר בוואטסאפ
            </a>
            <button
              onClick={onClose}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 mt-2"
            >
              חזור
            </button>
          </div>
        ) : (
          <>
            {step === 'reason' && (
              <div className="text-center space-y-4">
                <h3 className="text-xl font-bold text-gray-900">למה אתה רוצה לבטל את המנוי?</h3>
                <select 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">בחר סיבה</option>
                  <option value="price">יקר מדי</option>
                  <option value="features">חסרים פיצ'רים</option>
                  <option value="other">אחר</option>
                </select>
                
                {reason === 'other' && (
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="אנא פרט את הסיבה"
                    className="w-full p-2 border rounded-lg mt-2 h-24 resize-none"
                  />
                )}
                
                <button
                  onClick={handleContinue}
                  disabled={!reason || (reason === 'other' && !customReason.trim())}
                  className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  המשך
                </button>
              </div>
            )}

            {step === 'firstOffer' && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
                  <CreditCard className="h-8 w-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">מה דעתך על 20% הנחה?</h3>
                <p className="text-gray-600">קבל 20% הנחה על החודש הבא</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => Swal.fire({
                      icon: 'success',
                      title: 'הנחה הופעלה!',
                      text: `קיבלת ${20}% הנחה על החודש הבא`,
                      confirmButtonText: 'אישור'
                    })}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    כן, אני רוצה!
                  </button>
                  <button
                    onClick={handleContinue}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                  >
                    לא, תודה
                  </button>
                </div>
              </div>
            )}

            {step === 'secondOffer' && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
                  <CreditCard className="h-8 w-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">מה דעתך על 50% הנחה?</h3>
                <p className="text-gray-600">קבל 50% הנחה על החודש הבא</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => Swal.fire({
                      icon: 'success',
                      title: 'הנחה הופעלה!',
                      text: `קיבלת ${50}% הנחה על החודש הבא`,
                      confirmButtonText: 'אישור'
                    })}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    כן, אני רוצה!
                  </button>
                  <button
                    onClick={handleContinue}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                  >
                    לא, תודה
                  </button>
                </div>
              </div>
            )}

            {step === 'timer' && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                  <Clock className="h-8 w-8 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">זמן המתנה לפני ביטול</h3>
                <p className="text-gray-600">אנא המתן {timeLeft} שניות לפני המשך תהליך הביטול</p>
                <p className="text-sm text-gray-500">אל תעזוב את הדף, אחרת התהליך יתחיל מחדש</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-amber-600 h-2.5 rounded-full transition-all duration-1000" 
                    style={{ width: `${(timeLeft / 60) * 100}%` }}
                  ></div>
                </div>
                <button
                  disabled={timeLeft > 0}
                  onClick={handleContinue}
                  className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  המשך
                </button>
              </div>
            )}

            {step === 'questions' && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
                  <MessageSquare className="h-8 w-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">שאלה {questionNumber + 1} מתוך 5</h3>
                {isLoading ? (
                  <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  </div>
                ) : (
                  <>
                    <p className="text-gray-600">{currentQuestion}</p>
                    <textarea
                      className="w-full p-3 border rounded-lg h-24 resize-none"
                      placeholder="הקלד את תשובתך כאן..."
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                    />
                    <button
                      onClick={() => handleAnswerSubmit(currentAnswer)}
                      disabled={!currentAnswer.trim()}
                      className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      המשך
                    </button>
                  </>
                )}
              </div>
            )}

            {step === 'thankYou' && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">תודה על המשוב שלך!</h3>
                <p className="text-gray-600">המשוב שלך יעזור לנו להשתפר ולהציע שירות טוב יותר</p>
                <div className="bg-amber-50 p-4 rounded-lg text-amber-800 mb-4">
                  <p className="font-medium">הצעה מיוחדת אחרונה!</p>
                  <p>קבל {finalOffer}% הנחה על החודש הבא</p>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => Swal.fire({
                      icon: 'success',
                      title: 'הנחה הופעלה!',
                      text: `קיבלת ${finalOffer}% הנחה על החודש הבא`,
                      confirmButtonText: 'אישור'
                    })}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    כן, אני רוצה את ההנחה!
                  </button>
                  <button
                    onClick={() => setStep('confirm')}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                  >
                    המשך לביטול
                  </button>
                </div>
              </div>
            )}

            {step === 'confirm' && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">האם אתה בטוח?</h3>
                <p className="text-gray-600">ביטול המנוי יכנס לתוקף בסוף תקופת החיוב הנוכחית</p>
                <div className="flex gap-4">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                  >
                    חזור
                  </button>
                  <button
                    onClick={handleContinue}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                  >
                    בטל מנוי
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlanChangeConfirmationModal({ onClose, onConfirm, plan }: PlanChangeConfirmationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full relative animate-in fade-in duration-200">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">
            האם אתה בטוח שברצונך לשנות את החבילה?
          </h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-gray-600 mb-2">החבילה החדשה:</p>
            <p className="font-semibold text-gray-900">{plan.name}</p>
            <p className="text-amber-500 font-bold mt-2">
              ₪{plan.price} / {plan.isAnnual ? 'שנה' : 'חודש'}
            </p>
          </div>
          <p className="text-gray-600">
            השינוי יכנס לתוקף מיד והחיוב הבא יהיה לפי התעריף החדש
          </p>
          <div className="flex gap-4 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors"
            >
              אישור שינוי
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


interface ChangePlanModalProps {
  onClose: () => void;
}

const ChangePlanModal: React.FC<ChangePlanModalProps> = ({ onClose }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isAnnual, setIsAnnual] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [showPlanChangeConfirmationModal, setShowPlanChangeConfirmationModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{
    name: string;
    price: number;
    id:number
    isAnnual: boolean;
  } | null>(null);

  const handlePlanSelect = (plan: { name: string; price: number, id:number }) => {
    setSelectedPlan({
      ...plan,
      isAnnual: isAnnual
    });
    setShowPlanChangeConfirmationModal(true);
  };  

  const planUpdate = async (planId:string) => {
    const supabase = await createClient();
    const user = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.data.user?.id || "")
      .single();
    
      if(!profile)
      {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
          confirmButtonText: 'אישור',
        });
      }

      const cardcom_account_id = profile?.cardcom_account_id;
      if(cardcom_account_id != null)
      {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
          confirmButtonText: 'אישור',
        });
      }
      else
      {
        try {
          window.location.href = 'https://billing.stripe.com/p/login/dR6aIh5mi16d9Hy5kk' + '?prefilled_email=' + encodeURIComponent(user.data.user?.email || '');
        } catch (err) {
          console.log(err);
        }
      }
  };
  
  const handlePlanChange = async () => {
    // TODO: Implement plan change logic
    planUpdate(selectedPlan?.id.toString() || "")
    console.log('Plan changed to:', selectedPlan);
    setShowPlanChangeConfirmationModal(false);
};

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get('/api/plans');
        setPlans(res.data.plans);
      } catch (err) {
        setError('Error fetching plans');
      }
    };
    fetchPlans();
  }, []);


  const filteredPlans = plans
    .filter((plan) => plan.is_monthly !== isAnnual && Number(plan.id) !== 7) // Convert plan.id to a number
    .sort((a, b) => Number(a.id) - Number(b.id));
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
      <button
          onClick={onClose}
          className="absolute left-4 top-4 text-gray-400 hover:text-gray-600"
        >
        <X className="h-6 w-6" />
      </button>
      <section id="pricing" className="w-full py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">
            מסלולי מחירים
          </h2>
          <div className="flex justify-center items-center gap-6 mb-16">
            <span className={`pricing-label ${!isAnnual ? "active" : "inactive"}`}>
              חיוב חודשי
            </span>
            <div
              className={`pricing-toggle ${isAnnual ? "active" : ""}`}
              onClick={() => setIsAnnual(!isAnnual)}
              role="checkbox"
              aria-checked={isAnnual}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsAnnual(!isAnnual);
                }
              }}
            />
            <div className="flex items-center gap-2">
              <span className={`pricing-label ${isAnnual ? "active" : "inactive"}`}>
                חיוב שנתי
              </span>
              <span className="discount-badge px-2 py-1 text-xs font-medium text-white rounded-full">
                30% הנחה
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-gray-800 rounded-2xl p-8 flex flex-col justify-between text-center shadow-lg w-full min-h-[400px]"
              >
                <div className="flex-grow">
                  <h3 className="text-xl font-semibold mb-2 text-white">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2 justify-center">
                    <span className="text-3xl font-bold text-white">
                      ₪{isAnnual ? Math.round(plan.price / 12) : plan.price}
                    </span>
                    <span className="text-sm text-gray-400">/חודש</span>
                  </div>
                  {isAnnual && (
                    <div className="text-sm mb-6 text-gray-400">
                      {isAnnual ? 
                      <span className="text-green-500 font-medium">
                      חסכון של {(Math.round((plan.price / 12) * 1.3) - (plan.price))} ₪ בשנה
                      </span> : null}
                      <span className="mr-2">במקום </span>
                      <span className="line-through"> ₪{Math.round((plan.price * 1.3))}</span>
                    </div>
                  )}
                  <ul className="space-y-4 mb-8 text-gray-300">
                    {plan.features?.map((feature: string, index: number) => (
                      <li key={index} className="flex items-center gap-2 justify-center">
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => handlePlanSelect({
                    name:plan.name,
                    price: plan.price,
                    id: Number(plan.id)
                  })}
                  className="w-full py-3 rounded-lg font-semibold transition-colors bg-white/10 text-white hover:bg-white/20"
                >
                  בחר מסלול
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      </div>
      {showPlanChangeConfirmationModal && selectedPlan && (
        <PlanChangeConfirmationModal
          plan={selectedPlan}
          onClose={() => setShowPlanChangeConfirmationModal(false)}
          onConfirm={handlePlanChange}
        />
      )}
    </div>
  );
};

export default function ProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string>("משתמש");
  const [plan, setPlan] = useState<any>(null);
  const [requestsLeft, setRequestsLeft] = useState<number>(0);
  const [messageRequestsLeft, setMessageRequestsLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [planIsActive, setPlanIsActive] = useState(false);
  const [nextBilling, setNextBilling] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/?auth=login");
        return;
      }
      setUser(user);

      // Fetch user profile data from user_profiles table
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("plan_id, avatar_url, name, recurring_is_active, disable_date")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setAvatar(profile.avatar_url || "/default-avatar.png");
        setPlanIsActive(profile.recurring_is_active || false);
        setNextBilling(profile.disable_date);

        // Fetch plan data
        const { data: planData } = await supabase
          .from("plans")
          .select("*")
          .eq("id", profile.plan_id)
          .single();

        setPlan(planData || null);
        setUsername(profile.name || "")
      }

      // Fetch daily request limit info
      const res = await fetch("/api/user-requests");
      const requestsData = await res.json();
      if (res.ok) {
        setRequestsLeft(requestsData.requestsLeft);
      }
      const res2 = await fetch("/api/message-limit-requests");
      const requestsData2 = await res2.json();
      if (res2.ok) {
        setMessageRequestsLeft(requestsData2.requestsLeft);
      }

      setLoading(false);
    };

    fetchUserData();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/?auth=login");
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/${user.id}.${fileExt}`;

    // Upload avatar image to Supabase Storage
    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (error) {
      alert("שגיאה בהעלאת התמונה");
      return;
    }

    // Get the public URL of the new image
    const { data: publicURL } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    if (publicURL) {
      setAvatar(publicURL.publicUrl);

      // Update user_profiles table with the new avatar URL
      await supabase.from("user_profiles")
        .update({ avatar_url: publicURL.publicUrl })
        .eq("user_id", user.id);
    }
  };

  const handleCancelSubscription = async () => {
    // Check if cancellation is allowed from environment variable
    const cancelAllowed = process.env.NEXT_PUBLIC_CANCEL_ALLOWED !== 'false';
    
    if (!cancelAllowed) {
      // If cancellation is not allowed, show the modal instead of processing the cancellation
      setShowCancelModal(true);
      return;
    }
    
    setShowCancelModal(false);
    try {
      const supabase = await createClient();
      const user = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.data.user?.id || "")
        .single();
      
        if(!profile)
        {
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
            confirmButtonText: 'אישור',
          });
        }
  
        const cardcom_account_id = profile?.cardcom_account_id;
        if(cardcom_account_id != null)
        {
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אנא צור קשר עם התמיכה שלנו על מנת לשנות את המנוי.',
            confirmButtonText: 'אישור',
          });
        }  
        else
        {
          window.location.href = 'https://billing.stripe.com/p/login/dR6aIh5mi16d9Hy5kk' + '?prefilled_email=' + encodeURIComponent(user.data.user?.email || '');
        }
  
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אירעה שגיאה בפורטל משתמש.',
        confirmButtonText: 'אישור',
        customClass: {
          title: 'my-swal-title',
          htmlContainer: 'my-swal-text',
          confirmButton: 'my-swal-confirm-button',
          cancelButton: 'my-swal-cancel-button'
        }      
      });
    }
  };
  

  if (loading) {
    return(  
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ChevronLeft className="h-5 w-5" />
              חזרה לדאשבורד
            </a>
            <button onClick={handleLogout} className="text-gray-600 hover:text-gray-900 flex items-center gap-2">
              <LogOut className="h-5 w-5" />
              התנתק
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* User Info */}
        <div className="bg-white rounded-2xl p-8 shadow-lg mb-8">
          <div className="flex items-center gap-6 mb-8">
            <div className="relative">
              <img
                src={avatar || "/default-avatar.png"}
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
              />
              <label className="absolute bottom-0 right-0 bg-amber-500 text-white p-2 rounded-full shadow-lg cursor-pointer">
                <Edit2 className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{username}</h1>
              <p className="text-gray-600">כתובת מייל: {user?.email}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Subscription Status */}
            <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <span className="text-amber-50">חבילה נוכחית</span>
                <Shield className="h-5 w-5 text-amber-200" />
              </div>
              <h3 className="text-xl font-bold mb-1">{plan?.name || "לא רשום"}</h3>
              <div className="flex items-center gap-2 text-sm text-amber-50">
                <span className="inline-block px-2 py-1 rounded-full bg-green-500/20 text-green-100">
                  {planIsActive ? "פעיל" : "לא פעיל"}
                </span>
                <span>•</span>
                <span>{plan?.price ? `₪${plan?.price}/${plan.is_monthly ? "חודש" : "שנה"}` : "אין חבילה פעילה"}</span>
              </div>
              <button onClick={openModal} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white text-amber-500 rounded-lg hover:bg-amber-50 transition-colors font-medium">
                {planIsActive ? "שנה חבילה" : "הפעל חבילה"} 
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
            {/* Daily Credits */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">קרדיטים יומיים</span>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">נותרו</span>
                <span className="text-xl font-bold text-gray-900">{requestsLeft}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${(requestsLeft / plan?.daily_limit || 0) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>מתוך {plan?.daily_limit || 0}</span>
                <span>מתאפס ב-00:00</span>
              </div>
            </div>
          </div>


            {/* Chats credits */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">הודעות יומיות</span>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">נותרו</span>
                <span className="text-xl font-bold text-gray-900">{messageRequestsLeft}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${(messageRequestsLeft / plan?.daily_chat_limit || 0) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>מתוך {plan?.daily_chat_limit || 0}</span>
                <span>מתאפס ב-00:00</span>
              </div>
            </div>
          </div>
          </div>
        </div>


        {/* Account Settings */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">הגדרות חשבון</h2>
            <Settings className="h-5 w-5 text-gray-400" />
          </div>

          <div className="space-y-6">
            {/* Subscription Management */}
            <div className="border-b pb-6">
              <h3 className="font-medium text-gray-900 mb-4">ניהול מנוי</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">החיוב הבא</p>
                    <p className="text-sm text-gray-500">יחויב ב-{nextBilling}</p>
                  </div>
                  {planIsActive ? (
                    <button onClick={() => setShowCancelModal(true)} className="text-red-600 hover:text-red-700 font-medium">
                      בטל מנוי
                    </button>                  
                  ) : (
                  <button disabled className="cursor-not-allowed text-gray-500 font-medium">
                    מבוטל
                  </button>                  
                  )}
                </div>
                <div className="flex items-center gap-2 p-4 bg-amber-50 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    ביטול המנוי יכנס לתוקף בסוף תקופת החיוב הנוכחית
                  </p>
                </div>
              </div>
              </div>
              </div>

          {isModalOpen && <ChangePlanModal onClose={closeModal} />}
          {showCancelModal && (
            <CancelSubscriptionModal
            onClose={() => setShowCancelModal(false)}
            onConfirm={handleCancelSubscription}
            currentPlan={plan}
          />
          )}
        </div>
      </main>
    </div>
  );
}
