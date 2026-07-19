"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Lock, Loader2, KeyRound } from "lucide-react";
import Swal from "sweetalert2";

function ResetPasswordContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateResetToken = async () => {
      try {
        // Get tokens from hash
        const hashFragment = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hashFragment);
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        
        if (!access_token || !refresh_token) {
          throw new Error('חסרים פרטי אימות');
        }

        // Set the session
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) throw sessionError;

        // Verify we're in recovery mode
        const type = searchParams.get('type');
        if (type !== 'recovery') {
          throw new Error('סוג פעולה לא תקין');
        }

      } catch (err: any) {
        console.error('Reset password error:', err);
        await Swal.fire({
          title: 'שגיאה',
          text: err.message || 'קישור לא תקין, אנא בקש קישור חדש',
          icon: 'error',
          confirmButtonText: 'חזור להתחברות',
          confirmButtonColor: '#F59E0B', // Amber-500 to match site theme
        });
        router.push('/');
      }
    };
    
    validateResetToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        if(error.message.startsWith("Password should")) {
          setError("הסיסמא חייבת להכיל לפחות 6 תווים");
        } else {
          setError(error.message);
        }
      } else {
        await Swal.fire({
          title: 'הצלחה!',
          text: 'הסיסמה שונתה בהצלחה',
          icon: 'success',
          confirmButtonText: 'התחבר',
          confirmButtonColor: '#F59E0B', // Amber-500 to match site theme
        });
        router.push('/');
      }
    } catch (err) {
      setError("שגיאה באיפוס הסיסמה");
    }

    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white to-amber-50/50">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md border border-amber-100">
        <div className="mb-6 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
            <KeyRound className="h-6 w-6 text-amber-500" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 text-center">
          איפוס סיסמה
        </h2>
        <p className="text-gray-600 text-center mb-6">
          הזן את הסיסמה החדשה שלך
        </p>

        {error && <p className="text-red-500 text-center mb-4 bg-red-50 py-2 px-3 rounded-lg">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סיסמה חדשה
            </label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                required
                minLength={6}
                placeholder="לפחות 6 תווים"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-semibold shadow-md"
            disabled={loading}
          >
            {loading ? "מעבד..." : "שמור סיסמה חדשה"}
          </button>
          
          <p className="text-center mt-4">
            <button 
              type="button" 
              onClick={() => router.push('/')}
              className="text-amber-600 hover:text-amber-700 hover:underline"
            >
              חזור לדף הבית
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
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
    }>
      <ResetPasswordContent />
    </Suspense>
  );
} 