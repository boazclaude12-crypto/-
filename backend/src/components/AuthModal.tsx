import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { Mail, Lock, User, X } from "lucide-react";
import Swal from "sweetalert2";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

/**
 * Where Supabase should send the user back to. The browser's own origin is the
 * reliable source here: it is correct on localhost, on preview deploys and in
 * production, and it does not silently become the string "undefined" when
 * NEXT_PUBLIC_SITE_URL is missing from the environment.
 */
const siteOrigin = () =>
  typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL ?? "");

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const supabase = createClient();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Update mode if initialMode prop changes
  useEffect(() => {
    setIsLogin(initialMode === 'login');
  }, [initialMode]);

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

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) router.push("/dashboard");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if(error.message.startsWith("Invalid login credentials")) setError("פרטי התחברות שגויים");
        else setError(error.message);
      } else router.push("/dashboard");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          emailRedirectTo: `${siteOrigin()}/dashboard`,
          data: {
            full_name: name,
            avatar_url: `https://avatar.iran.liara.run/username?username=${name}`
          }
        },
      });

      // `data` is an object even when the signup failed, so it cannot stand in
      // for success. Routing on it sent failed signups to /dashboard, where the
      // middleware bounced them straight back and the real error was never seen.
      if (error) {
        if (error.message.startsWith("Password should")) {
          setError("הסיסמא שלך צריכה להכיל לפחות 6 תווים");
        } else if (/already registered|already been registered/i.test(error.message)) {
          setError("המייל הזה כבר רשום. נסה להתחבר במקום להירשם.");
        } else {
          setError(error.message);
        }
      } else if (data.session) {
        router.push("/dashboard");
      } else {
        // Signup succeeded but returned no session. That happens when the
        // project is configured to confirm addresses, and it is also what
        // happens when the account is confirmed at the database level — the
        // signup response is decided before that. Rather than guess, try to
        // sign in: it succeeds whenever the account is usable, and only when it
        // genuinely isn't do we fall back to telling the user to check mail.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInError) {
          router.push("/dashboard");
        } else if (/not confirmed|confirm/i.test(signInError.message)) {
          setNotice("נשלח אליך מייל אישור. יש ללחוץ על הקישור שבו כדי להשלים את ההרשמה.");
        } else {
          setError(signInError.message);
        }
      }
    }

    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteOrigin()}/auth/callback`,
      }
    });
    if (error) setError(error.message);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("נא להזין כתובת אימייל");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?type=recovery&next=/reset-password`,
      });
      
      if (error) {
        setError(error.message);
      } else {
        await Swal.fire({
          title: 'נשלח בהצלחה!',
          text: 'קישור לאיפוס סיסמה נשלח לאימייל שלך',
          icon: 'success',
          confirmButtonText: 'אישור',
          confirmButtonColor: '#F59E0B', // Amber-500 to match home page
        });
      }
    } catch (err) {
      setError("שגיאה בשליחת קישור לאיפוס סיסמה");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl border border-amber-100 relative animate-fadeIn">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>
        
        <div className="mb-6 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
            <User className="h-6 w-6 text-amber-500" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 text-center">
          {isLogin ? "התחברות" : "הרשמה"}
        </h2>
        <p className="text-gray-600 text-center mb-6">
          {isLogin ? "ברוכים השבים! התחברו כדי להמשיך" : "צרו חשבון חדש"}
        </p>

        {error && <p className="text-red-500 text-center mb-4 bg-red-50 py-2 px-3 rounded-lg">{error}</p>}
        {notice && <p className="text-green-700 text-center mb-4 bg-green-50 py-2 px-3 rounded-lg">{notice}</p>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שם מלא</label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required={!isLogin}
                  placeholder="הזן את שמך המלא"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">כתובת אימייל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                required
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">סיסמה</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                required
                placeholder="********"
              />
            </div>
          </div>

          {isLogin && (
            <div className="text-left">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-amber-600 hover:text-amber-700"
              >
                שכחת סיסמה?
              </button>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 px-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-semibold shadow-md"
            disabled={loading}
          >
            {loading ? "מעבד..." : isLogin ? "התחברות" : "הרשמה"}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">או</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold flex items-center justify-center gap-2 shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          התחבר באמצעות Google
        </button>

        <p className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            className="text-amber-600 hover:text-amber-700 hover:underline"
          >
            {isLogin ? "אין לך חשבון? הירשם כאן" : "כבר יש לך חשבון? התחבר כאן"}
          </button>
        </p>
      </div>
    </div>
  );
} 