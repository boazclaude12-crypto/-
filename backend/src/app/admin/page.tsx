"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inter, Rubik, Heebo } from 'next/font/google';
import {
  ArrowUpRight,
  BarChart3,
  MessageSquare,
  CreditCard,
  HardDrive,
  Lock,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Search,
  Bell,
  ChevronDown,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  Eye,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  DollarSign,
  History,
  Loader2
} from "lucide-react";
import axios from "axios";
import { createClient } from "@lib/supabase/client";

// פונטים משודרגים 
const inter = Inter({ subsets: ['latin'] });
const rubik = Rubik({ subsets: ['latin', 'hebrew'] }); // פונט יפה שתומך גם בעברית
const heebo = Heebo({ subsets: ['latin', 'hebrew'] }); // פונט ישראלי מוכר מאוד ומקצועי

// Define types for data structures
interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  subscription_tier: string;
  chats: Chat[];
  metadata?: any;
  avatar_url?: string;
  plan_id?: number;
  userPersonalId?: number;
  cardcom_account_id?: number;
  cardcom_low_profile_id?: string;
  recurring_is_active?: boolean;
  last_bill_date?: string;
  disable_date?: string;
  recurring_id?: number;
  discount_code_id?: string;
  cancellation_discount_used?: boolean;
  cancellation_discount_date?: string;
  cancellation_reason?: string;
  cancellation_date?: string;
  discount_percent?: number;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  plan_id: string;
  user_id: string;
  profiles: {
    name: string;
    email: string;
  };
  user_display?: string;
  email?: string;
  metadata?: any;
  payment_method?: string;
  payment_intent_id?: string;
  currency?: string;
  description?: string;
  customer_id?: string;
  invoice_id?: string;
  receipt_url?: string;
  subscription_id?: string;
  error_message?: string;
  is_recurring?: boolean;
}

interface ErrorLog {
  id: string;
  error_code: string;
  error_message: string;
  source: string;
  created_at: string;
  user_id?: string;
  user_email?: string;
  payment_id?: string;
  payment_intent_id?: string;
  payment_method?: string;
  amount?: number;
  currency?: string;
  stack_trace?: string;
  request_data?: any;
  response_data?: any;
  metadata?: any;
  user_profiles?: any;
}

interface Stats {
  users: number;
  requests: number;
  payments: number;
  activeUsers: number;
  mrr: number;
}

interface Chat {
  id: string;
  message: string;
  created_at: string;
  message_type?: string;
  content?: string;
}

interface Plan {
  id: number;
  name: string;
  daily_limit: number;
  price: number;
  is_monthly: boolean;
  features: string[];
  daily_chat_limit: number;
}


const supabase = createClient();

/**
 * Authorization header for the admin API. The token is the signed-in user's
 * Supabase access token; the server checks the is_admin flag on their profile.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Payment details modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  
  // Error details modal
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  
  // Dashboard data states
  const [stats, setStats] = useState<Stats>({
    users: 0,
    requests: 0,
    payments: 0,
    activeUsers: 0,
    mrr: 0
  });
  
  // Users data
  const [users, setUsers] = useState<User[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  
  // Payments data
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  
  // Error logs data
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [errorsPage, setErrorsPage] = useState(1);
  const [errorsTotalPages, setErrorsTotalPages] = useState(1);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorTableExists, setErrorTableExists] = useState(true);

  // User details modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Plans data
  const [plans, setPlans] = useState<Plan[]>([]);

  // New plan modal
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);

  // Add new state variable for edit mode
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => {
    const checkAuthentication = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      // A valid session is not enough — the server only answers callers whose
      // profile carries is_admin, so ask it before showing the dashboard.
      try {
        await axios.get('/api/admin/stats', { headers: await authHeaders() });
        setIsAuthenticated(true);
        fetchDashboardData();
      } catch {
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthentication();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === "users") {
        fetchUsers();
      } else if (activeTab === "payments") {
        fetchPayments();
      } else if (activeTab === "errors") {
        fetchErrors();
      } else if (activeTab === "plans") {
        fetchPlans();
      }
    }
  }, [isAuthenticated, activeTab, usersPage, paymentsPage, errorsPage]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("אימייל או סיסמה שגויים. נסה שוב.");
      return;
    }

    // Signing in proves who you are; is_admin decides whether you get in.
    try {
      await axios.get('/api/admin/stats', { headers: await authHeaders() });
    } catch {
      await supabase.auth.signOut();
      setError("החשבון הזה אינו מנהל.");
      return;
    }

    setIsAuthenticated(true);
    fetchDashboardData();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  const fetchDashboardData = async () => {
    try {
      const statsRes = await axios.get('/api/admin/stats', {
        headers: await authHeaders()
      });

      console.log('Stats Response:', statsRes.data);

      setStats({
        ...statsRes.data,
      });
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };
  
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await axios.get(`/api/admin/users?page=${usersPage}&pageSize=10`, {
        headers: await authHeaders()
      });
      
      setUsers(res.data.users || []);
      setUsersTotalPages(res.data.totalPages || 1);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  };
  
  const fetchPayments = async () => {
    setPaymentsLoading(true);
    try {
      const res = await axios.get(`/api/admin/payments?page=${paymentsPage}&pageSize=10`, {
        headers: await authHeaders()
      });
      
      setPayments(res.data.payments || []);
      setPaymentsTotalPages(res.data.totalPages || 1);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setPaymentsLoading(false);
    }
  };
  
  const fetchErrors = async () => {
    setErrorsLoading(true);
    try {
      const res = await axios.get(`/api/admin/errors?page=${errorsPage}&pageSize=10`, {
        headers: await authHeaders()
      });
      
      setErrors(res.data.errors || []);
      setErrorsTotalPages(res.data.totalPages || 1);
      setErrorTableExists(!res.data.tableNotFound);
    } catch (error) {
      console.error('Error fetching error logs:', error);
    } finally {
      setErrorsLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await axios.get('/api/admin/plans', { headers: await authHeaders() });
      setPlans(res.data || []);
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const updatePlan = async (plan: Plan) => {
    try {
      const res = await axios.post('/api/admin/plans', plan, { headers: await authHeaders() });
      if (res.status === 200) {
        fetchPlans(); // Refresh plans after update
      }
    } catch (error) {
      console.error('Error updating plan:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
        return 'text-green-700 bg-green-100';
      case 'pending':
        return 'text-yellow-700 bg-yellow-100';
      case 'failed':
        return 'text-red-700 bg-red-100';
      default:
        return 'text-gray-700 bg-gray-100';
    }
  };
  
  // Pagination controls
  const PaginationControls = ({ page, totalPages, setPage, loading }: { page: number, totalPages: number, setPage: (page: number) => void, loading: boolean }) => (
    <div className="flex items-center justify-between mt-4">
      <button 
        onClick={() => setPage(Math.max(1, page - 1))}
        disabled={page === 1 || loading}
        className={`p-2 rounded-lg ${page === 1 || loading ? 'text-gray-400 cursor-not-allowed' : 'text-amber-700 hover:bg-amber-100'}`}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      
      <span className="text-sm text-amber-900">
        עמוד {page} מתוך {totalPages}
      </span>
      
      <button 
        onClick={() => setPage(Math.min(totalPages, page + 1))}
        disabled={page === totalPages || loading}
        className={`p-2 rounded-lg ${page === totalPages || loading ? 'text-gray-400 cursor-not-allowed' : 'text-amber-700 hover:bg-amber-100'}`}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
    </div>
  );

  // Function to open payment details modal
  const openPaymentDetails = (payment: Payment) => {
    setSelectedPayment(payment);
    setShowPaymentModal(true);
  };

  // Function to close payment details modal
  const closePaymentDetails = () => {
    setShowPaymentModal(false);
    setSelectedPayment(null);
  };
  
  // Function to open error details modal
  const openErrorDetails = (error: ErrorLog) => {
    setSelectedError(error);
    setShowErrorModal(true);
  };

  // Function to close error details modal
  const closeErrorDetails = () => {
    setShowErrorModal(false);
    setSelectedError(null);
  };

  // Function to open user details modal
  const openUserDetails = (user: User) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  // Function to close user details modal
  const closeUserDetails = () => {
    setShowUserModal(false);
    setSelectedUser(null);
  };

  const openEditPlanModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setShowEditPlanModal(true);
  };

  // Add a function to handle plan updates
  const handlePlanUpdate = (plan: Plan) => {
    updatePlan(plan);
    setShowEditPlanModal(false);
  };

  // Add function to handle user profile update
  const handleUserUpdate = async (updatedUser: User) => {
    try {
      await axios.put(`/api/admin/users/${updatedUser.id}`, updatedUser, {
        headers: await authHeaders()
      });
      
      // Refresh user list after update
      fetchUsers();
      setIsEditingUser(false);
      setEditingUser(null);
      
      // Close the modal if it was open
      closeUserDetails();
      
      // Show success notification
      alert('המשתמש עודכן בהצלחה');
    } catch (error) {
      console.error('Error updating user:', error);
      alert('שגיאה בעדכון המשתמש');
    }
  };

  // Add function to open edit user modal
  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setIsEditingUser(true);
  };

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

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100 via-amber-50 to-amber-50 ${heebo.className}`} dir="rtl">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
          <div className="flex items-center justify-center mb-6">
            <Lock className="h-12 w-12 text-amber-500" />
          </div>
          <h1 className={`text-2xl font-bold text-center text-gray-900 mb-6 ${rubik.className}`}>לוח בקרה למנהל</h1>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="הזן אימייל מנהל"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="הזן סיסמה"
                autoComplete="current-password"
                required
              />
            </div>
            
            {error && (
              <div className="bg-red-100 text-red-700 p-3 rounded-lg flex items-center">
                <AlertCircle className="h-5 w-5 ml-2" />
                <span>{error}</span>
              </div>
            )}
            
            <button
              type="submit"
              className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center"
            >
              כניסה
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-amber-100 via-amber-50 to-amber-50 ${heebo.className}`} dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center ml-3">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className={`text-xl font-bold text-gray-900 ${rubik.className}`}>לוח בקרה</h1>
              <p className="text-sm text-gray-500">ברוכים הבאים למערכת הניהול</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 transition-colors"
            >
              <LogOut className="h-4 w-4" /> התנתק
            </button>
          </div>
        </div>
      </header>
      
      {/* Tabs Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex space-x-6 space-x-reverse overflow-x-auto p-4">
            <button 
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'dashboard' 
                  ? 'border-amber-500 text-gray-900' 
                  : 'border-transparent text-gray-500 hover:text-amber-500'
              }`}
              onClick={() => setActiveTab('dashboard')}
            >
              <BarChart3 className="h-4 w-4" />
              <span>סטטיסטיקה</span>
            </button>
            
            <button 
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'users' 
                  ? 'border-amber-500 text-gray-900' 
                  : 'border-transparent text-gray-500 hover:text-amber-500'
              }`}
              onClick={() => {
                setActiveTab('users');
                setUsersPage(1);
              }}
            >
              <Users className="h-4 w-4" />
              <span>משתמשים</span>
            </button>
            
            <button 
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'payments' 
                  ? 'border-amber-500 text-gray-900' 
                  : 'border-transparent text-gray-500 hover:text-amber-500'
              }`}
              onClick={() => {
                setActiveTab('payments');
                setPaymentsPage(1);
              }}
            >
              <CreditCard className="h-4 w-4" />
              <span>תשלומים</span>
            </button>
            
            <button 
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'errors' 
                  ? 'border-amber-500 text-gray-900' 
                  : 'border-transparent text-gray-500 hover:text-amber-500'
              }`}
              onClick={() => {
                setActiveTab('errors');
                setErrorsPage(1);
              }}
            >
              <AlertCircle className="h-4 w-4" />
              <span>שגיאות</span>
            </button>
            
            <button 
              className={`flex items-center gap-2 pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'plans' 
                  ? 'border-amber-500 text-gray-900' 
                  : 'border-transparent text-gray-500 hover:text-amber-500'
              }`}
              onClick={() => setActiveTab('plans')}
            >
              <DollarSign className="h-4 w-4" />
              <span>תוכניות</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-md p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 mb-1">סה״כ משתמשים</p>
                  <p className="text-3xl font-bold text-amber-900">{stats.users}</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <Users className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-md p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 mb-1">סה״כ בקשות</p>
                  <p className="text-3xl font-bold text-amber-900">{stats.requests}</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-md p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 mb-1">הכנסות</p>
                  <p className="text-3xl font-bold text-amber-900">₪{stats.payments}</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-md p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 mb-1">משתמשים פעילים</p>
                  <p className="text-3xl font-bold text-amber-900">{stats.activeUsers}</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <Users className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-md p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 mb-1">MRR (הכנסה חודשית חוזרת)</p>
                  <p className="text-3xl font-bold text-amber-900">₪{stats.mrr}</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </div>
          </>
        )}
        
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-amber-900">רשימת משתמשים</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="חיפוש משתמש..."
                    className="pr-8 pl-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <Search className="absolute top-1/2 right-2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                <button className="flex items-center gap-1 text-sm bg-amber-100 text-amber-700 px-3 py-1 rounded-md hover:bg-amber-200 transition-colors">
                  <Filter className="h-4 w-4" />
                  <span>סינון</span>
                </button>
                <button className="flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1 rounded-md hover:bg-green-200 transition-colors">
                  <Download className="h-4 w-4" />
                  <span>ייצוא</span>
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-amber-50">
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מזהה</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">שם משתמש</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">דוא\"ל</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">תאריך הצטרפות</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">תכנית</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">Cardcom ID</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center">
                        <div className="flex justify-center items-center">
                          <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                          <span className="text-amber-700">טוען משתמשים...</span>
                        </div>
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        לא נמצאו משתמשים
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-amber-50 transition-colors">
                        <td className="px-4 py-3 text-sm border-b border-gray-100">{user.id || 'לא נמצא'}</td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          <div className="flex items-center">
                            <div className="h-8 w-8 bg-amber-200 rounded-full mr-2 flex items-center justify-center">
                              {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <span>{user.name || 'משתמש אנונימי'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">{user.email || 'אין מייל'}</td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {new Date(user.created_at).toLocaleDateString('he-IL')}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {user.subscription_tier ? (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs">
                              {user.subscription_tier}
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs">אין חבילה</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {user.cardcom_account_id || 'לא קיים'}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => openUserDetails(user)}
                              className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs hover:bg-amber-200"
                            >
                              פרטים
                            </button>
                            <button 
                              onClick={() => openEditUserModal(user)}
                              className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs hover:bg-blue-200"
                            >
                              ערוך
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <PaginationControls 
              page={usersPage} 
              totalPages={usersTotalPages} 
              setPage={setUsersPage} 
              loading={usersLoading} 
            />
          </div>
        )}
        
        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-amber-900">רשימת תשלומים</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="חיפוש תשלום..."
                    className="pr-8 pl-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <Search className="absolute top-1/2 right-2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                <button className="flex items-center gap-1 text-sm bg-amber-100 text-amber-700 px-3 py-1 rounded-md hover:bg-amber-200 transition-colors">
                  <Filter className="h-4 w-4" />
                  <span>סינון</span>
                </button>
                <button className="flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1 rounded-md hover:bg-green-200 transition-colors">
                  <Download className="h-4 w-4" />
                  <span>ייצוא</span>
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-amber-50">
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מזהה</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">משתמש</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">סכום</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">תכנית</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">סטטוס</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">תאריך</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">שיטת תשלום</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מטבע</th>
                    <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מידע נוסף</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center">
                        <div className="flex justify-center items-center">
                          <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                          <span className="text-amber-700">טוען תשלומים...</span>
                        </div>
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                        לא נמצאו תשלומים
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-amber-50 transition-colors">
                        <td className="px-4 py-3 text-sm border-b border-gray-100">{payment.id}</td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {payment.user_display || payment.email || payment.profiles?.name || payment.user_id || 'לא ידוע'}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100 font-medium">
                          ₪{payment.amount}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {payment.plan_id || 'לא ידוע'}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          <span className={`px-2 py-1 rounded-md text-xs ${getStatusColor(payment.status)}`}>
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {new Date(payment.created_at).toLocaleDateString('he-IL')}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {payment.payment_method || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          {payment.currency || 'ILS'}
                        </td>
                        <td className="px-4 py-3 text-sm border-b border-gray-100">
                          <button 
                            onClick={() => openPaymentDetails(payment)}
                            className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs hover:bg-amber-200"
                          >
                            פרטים
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <PaginationControls 
              page={paymentsPage} 
              totalPages={paymentsTotalPages} 
              setPage={setPaymentsPage} 
              loading={paymentsLoading} 
            />
          </div>
        )}
        
        {/* Errors Tab */}
        {activeTab === 'errors' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-amber-900">יומן שגיאות</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="חיפוש שגיאה..."
                    className="pr-8 pl-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <Search className="absolute top-1/2 right-2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                <button className="flex items-center gap-1 text-sm bg-amber-100 text-amber-700 px-3 py-1 rounded-md hover:bg-amber-200 transition-colors">
                  <Filter className="h-4 w-4" />
                  <span>סינון</span>
                </button>
                <button className="flex items-center gap-1 text-sm bg-red-100 text-red-700 px-3 py-1 rounded-md hover:bg-red-200 transition-colors">
                  <X className="h-4 w-4" />
                  <span>נקה הכל</span>
                </button>
              </div>
            </div>
            
            {!errorTableExists ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <AlertCircle className="h-6 w-6 text-yellow-500 mr-2" />
                  <h3 className="text-lg font-medium text-yellow-700">טבלת שגיאות לא נמצאה</h3>
                </div>
                <p className="text-yellow-600 mb-4">
                  נראה שטבלת payment_errors לא קיימת בבסיס הנתונים. אתה צריך ליצור אותה כדי לעקוב אחר שגיאות.
                </p>
                <button className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-md transition-colors">
                  צור טבלת שגיאות
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="bg-amber-50">
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מזהה</th>
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">קוד שגיאה</th>
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">הודעת שגיאה</th>
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">משתמש</th>
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מקור</th>
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">סכום</th>
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">תאריך</th>
                        <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">פרטים</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorsLoading ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center">
                            <div className="flex justify-center items-center">
                              <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                              <span className="text-amber-700">טוען שגיאות...</span>
                            </div>
                          </td>
                        </tr>
                      ) : errors.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                            <div className="flex flex-col items-center">
                              <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                              <span>לא נמצאו שגיאות. הכל עובד כשורה!</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        errors.map((error) => (
                          <tr key={error.id} className="hover:bg-amber-50 transition-colors">
                            <td className="px-4 py-3 text-sm border-b border-gray-100">{error.id}</td>
                            <td className="px-4 py-3 text-sm border-b border-gray-100">
                              <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs">
                                {error.error_code || 'UNKNOWN'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm border-b border-gray-100">
                              <div className="truncate max-w-xs">{error.error_message}</div>
                            </td>
                            <td className="px-4 py-3 text-sm border-b border-gray-100">
                              {error.user_email || error.user_profiles?.name || error.user_id || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm border-b border-gray-100">{error.source || 'לא ידוע'}</td>
                            <td className="px-4 py-3 text-sm border-b border-gray-100">
                              {error.amount ? `₪${error.amount}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm border-b border-gray-100">
                              {new Date(error.created_at).toLocaleString('he-IL')}
                            </td>
                            <td className="px-4 py-3 text-sm border-b border-gray-100">
                              <button 
                                onClick={() => {
                                  openErrorDetails(error);
                                }}
                                className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs hover:bg-amber-200"
                              >
                                פרטים
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                <PaginationControls 
                  page={errorsPage} 
                  totalPages={errorsTotalPages} 
                  setPage={setErrorsPage} 
                  loading={errorsLoading} 
                />
              </>
            )}
          </div>
        )}
        
        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-bold text-amber-900">רשימת תוכניות</h2>
            <table className="w-full text-right">
              <thead>
                <tr className="bg-amber-50">
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מזהה</th>
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">שם</th>
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מחיר</th>
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מגבלה יומית של ניתוחים</th>
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">תכנית חודשית</th>
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">תכונות</th>
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">מגבלה יומית של צאטים</th>
                  <th className="px-4 py-2 text-sm font-medium text-amber-900 border-b">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-amber-50 transition-colors">
                    <td className="px-4 py-3 text-sm border-b border-gray-100">{plan.id}</td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">{plan.name}</td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">₪{plan.price}</td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">{plan.daily_limit}</td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">{plan.is_monthly ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">{plan.features.join(', ')}</td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">{plan.daily_chat_limit}</td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">
                      <button 
                        onClick={() => openEditPlanModal(plan)}
                        className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs hover:bg-amber-200"
                      >
                        ערוך
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </main>
      
      {/* Payment Details Modal */}
      {showPaymentModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-amber-900">פרטי תשלום</h2>
              <button 
                onClick={closePaymentDetails}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Payment ID and Status */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <CreditCard className="h-8 w-8 text-amber-600 mr-3" />
                  <div>
                    <h3 className="text-lg font-bold text-amber-900">#{selectedPayment.id}</h3>
                    <p className="text-gray-500 text-sm">
                      נוצר ב-{new Date(selectedPayment.created_at).toLocaleString('he-IL')}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-md ${getStatusColor(selectedPayment.status)}`}>
                  {selectedPayment.status}
                </span>
              </div>
              
              {/* Payment Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-900 mb-3">פרטי תשלום</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">סכום</span>
                      <span className="font-medium">₪{selectedPayment.amount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">מטבע</span>
                      <span>{selectedPayment.currency || 'ILS'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">תכנית</span>
                      <span>{selectedPayment.plan_id || 'לא ידוע'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">שיטת תשלום</span>
                      <span>{selectedPayment.payment_method || 'לא ידוע'}</span>
                    </div>
                    {selectedPayment.is_recurring !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">תשלום חוזר</span>
                        <span>{selectedPayment.is_recurring ? 'כן' : 'לא'}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-900 mb-3">פרטי משתמש</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">מזהה משתמש</span>
                      <span className="font-mono text-sm">{selectedPayment.user_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">שם</span>
                      <span>{selectedPayment.profiles?.name || 'לא ידוע'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">דוא״ל</span>
                      <span>{selectedPayment.email || 'לא ידוע'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Additional IDs */}
              {(selectedPayment.payment_intent_id || selectedPayment.subscription_id || selectedPayment.invoice_id || selectedPayment.customer_id) && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-900 mb-3">מזהים נוספים</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedPayment.payment_intent_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מזהה תשלום</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">{selectedPayment.payment_intent_id}</code>
                      </div>
                    )}
                    {selectedPayment.subscription_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מזהה מנוי</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">{selectedPayment.subscription_id}</code>
                      </div>
                    )}
                    {selectedPayment.invoice_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מזהה חשבונית</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">{selectedPayment.invoice_id}</code>
                      </div>
                    )}
                    {selectedPayment.customer_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מזהה לקוח</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">{selectedPayment.customer_id}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Error Message */}
              {selectedPayment.error_message && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                  <h4 className="font-medium text-red-700 mb-2 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    שגיאת תשלום
                  </h4>
                  <p className="text-red-700">{selectedPayment.error_message}</p>
                </div>
              )}
              
              {/* Receipt Link */}
              {selectedPayment.receipt_url && (
                <div className="mt-4">
                  <a 
                    href={selectedPayment.receipt_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-md hover:bg-amber-200 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    צפה בקבלה
                  </a>
                </div>
              )}
              
              {/* Raw Data (for debugging) */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <details>
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    הצג נתונים גולמיים
                  </summary>
                  <pre className="mt-2 bg-gray-100 p-4 rounded-lg overflow-auto text-xs">
                    {JSON.stringify(selectedPayment, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Error Details Modal */}
      {showErrorModal && selectedError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-amber-900">פרטי שגיאה</h2>
              <button 
                onClick={closeErrorDetails}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Error ID and Code */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <AlertCircle className="h-8 w-8 text-red-600 mr-3" />
                  <div>
                    <h3 className="text-lg font-bold text-amber-900">#{selectedError.id}</h3>
                    <p className="text-gray-500 text-sm">
                      נוצר ב-{new Date(selectedError.created_at).toLocaleString('he-IL')}
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-md">
                  {selectedError.error_code || 'UNKNOWN'}
                </span>
              </div>
              
              {/* Error Message */}
              <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                <h4 className="font-medium text-red-700 mb-2">הודעת שגיאה</h4>
                <p className="text-red-700">{selectedError.error_message}</p>
              </div>
              
              {/* Error Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-900 mb-3">מקור השגיאה</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">מקור</span>
                      <span className="font-medium">{selectedError.source || 'לא ידוע'}</span>
                    </div>
                    {selectedError.payment_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מזהה תשלום</span>
                        <span className="font-mono text-sm">{selectedError.payment_id}</span>
                      </div>
                    )}
                    {selectedError.payment_intent_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מזהה כוונת תשלום</span>
                        <span className="font-mono text-sm">{selectedError.payment_intent_id}</span>
                      </div>
                    )}
                    {selectedError.payment_method && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">אמצעי תשלום</span>
                        <span>{selectedError.payment_method}</span>
                      </div>
                    )}
                    {selectedError.amount && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">סכום</span>
                        <span>₪{selectedError.amount}</span>
                      </div>
                    )}
                    {selectedError.currency && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מטבע</span>
                        <span>{selectedError.currency}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-900 mb-3">פרטי משתמש</h4>
                  <div className="space-y-2">
                    {selectedError.user_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">מזהה משתמש</span>
                        <span className="font-mono text-sm">{selectedError.user_id}</span>
                      </div>
                    )}
                    {selectedError.user_profiles?.name && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">שם</span>
                        <span>{selectedError.user_profiles.name}</span>
                      </div>
                    )}
                    {selectedError.user_email && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">דוא״ל</span>
                        <span>{selectedError.user_email}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Stack Trace */}
              {selectedError.stack_trace && (
                <div className="mt-4">
                  <h4 className="font-medium text-amber-900 mb-2">מעקב מחסנית</h4>
                  <pre className="bg-gray-100 p-3 rounded-lg overflow-auto max-h-40 text-xs">
                    {selectedError.stack_trace}
                  </pre>
                </div>
              )}
              
              {/* Request/Response Data */}
              {(selectedError.request_data || selectedError.response_data) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {selectedError.request_data && (
                    <div>
                      <h4 className="font-medium text-amber-900 mb-2">נתוני בקשה</h4>
                      <pre className="bg-gray-100 p-3 rounded-lg overflow-auto max-h-32 text-xs">
                        {typeof selectedError.request_data === 'string' 
                          ? selectedError.request_data 
                          : JSON.stringify(selectedError.request_data, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {selectedError.response_data && (
                    <div>
                      <h4 className="font-medium text-amber-900 mb-2">נתוני תגובה</h4>
                      <pre className="bg-gray-100 p-3 rounded-lg overflow-auto max-h-32 text-xs">
                        {typeof selectedError.response_data === 'string' 
                          ? selectedError.response_data 
                          : JSON.stringify(selectedError.response_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              {/* Metadata */}
              {selectedError.metadata && (
                <div className="mt-4">
                  <h4 className="font-medium text-amber-900 mb-2">מטא-נתונים</h4>
                  <pre className="bg-gray-100 p-3 rounded-lg overflow-auto max-h-40 text-xs">
                    {typeof selectedError.metadata === 'string' 
                      ? selectedError.metadata 
                      : JSON.stringify(selectedError.metadata, null, 2)}
                  </pre>
                </div>
              )}
              
              {/* Raw Data (for debugging) */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <details>
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    הצג נתונים גולמיים
                  </summary>
                  <pre className="mt-2 bg-gray-100 p-4 rounded-lg overflow-auto text-xs">
                    {JSON.stringify(selectedError, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-amber-900">פרטי משתמש</h2>
              <button 
                onClick={closeUserDetails}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* User Profile Card */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-amber-100">
                <div className="flex items-center mb-4">
                  <div className="h-14 w-14 bg-amber-200 rounded-full mr-4 flex items-center justify-center">
                    {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-amber-900">{selectedUser.name || 'משתמש אנונימי'}</h3>
                    <p className="text-amber-600">{selectedUser.email || 'אין מייל'}</p>
                  </div>
                  <div className="mr-auto">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      selectedUser.subscription_tier ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {selectedUser.subscription_tier || 'חינמי'}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-amber-50 p-3 rounded-lg">
                    <p className="text-xs text-amber-500 mb-1">מזהה משתמש</p>
                    <p className="font-mono text-sm text-amber-900">{selectedUser.id || 'לא נמצא'}</p>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg">
                    <p className="text-xs text-amber-500 mb-1">תאריך הצטרפות</p>
                    <p className="text-sm text-amber-900">{new Date(selectedUser.created_at).toLocaleDateString('he-IL')}</p>
                  </div>
                </div>
              </div>
              
              {/* User Chat History */}
              <div>
                <h3 className="text-lg font-semibold text-amber-800 mb-4">היסטוריית צ'אטים</h3>
                
                {!selectedUser.chats || selectedUser.chats.length === 0 ? (
                  <div className="text-center py-8 bg-white rounded-xl shadow-sm border border-amber-50">
                    <History className="h-12 w-12 text-amber-200 mx-auto mb-3" />
                    <p className="text-amber-700">אין היסטוריית צ'אטים</p>
                    <p className="text-amber-500 text-sm mt-1">המשתמש טרם ניהל שיחות</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedUser.chats.map((chat, index) => (
                      <div 
                        key={chat.id || index}
                        className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md hover:border-amber-200 transition-all border border-gray-100"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 text-amber-400 ml-2" />
                            <span className="text-xs text-amber-500">
                              {new Date(chat.created_at).toLocaleString('he-IL')}
                            </span>
                          </div>
                          {chat.message_type && (
                            <div className="bg-amber-50 px-2 py-1 rounded-full">
                              <span className="text-xs text-amber-600">
                                {chat.message_type === 'user' ? 'משתמש' : 'מליסה'}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-medium text-amber-800 text-right">
                          {chat.message || chat.content || '(אין תוכן)'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Additional User Information - if needed */}
              {selectedUser.metadata && (
                <div className="mt-4">
                  <h4 className="font-medium text-amber-900 mb-2">מידע נוסף</h4>
                  <pre className="bg-gray-100 p-3 rounded-lg overflow-auto max-h-40 text-xs">
                    {typeof selectedUser.metadata === 'string' 
                      ? selectedUser.metadata 
                      : JSON.stringify(selectedUser.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Plan Modal */}
      {showEditPlanModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-amber-900 mb-4">ערוך תוכנית</h2>
            <form onSubmit={(e) => { e.preventDefault(); handlePlanUpdate(selectedPlan); }}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-amber-700 mb-1">שם</label>
                <input
                  type="text"
                  value={selectedPlan.name}
                  onChange={(e) => setSelectedPlan({ ...selectedPlan, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-amber-700 mb-1">מחיר</label>
                <input
                  type="number"
                  value={selectedPlan.price}
                  onChange={(e) => setSelectedPlan({ ...selectedPlan, price: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-amber-700 mb-1">מגבלה יומית של ניתוחים</label>
                <input
                  type="number"
                  value={selectedPlan.daily_limit}
                  onChange={(e) => setSelectedPlan({ ...selectedPlan, daily_limit: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-amber-700 mb-1">מגבלה יומית של צאטים</label>
                <input
                  type="number"
                  value={selectedPlan.daily_chat_limit}
                  onChange={(e) => setSelectedPlan({ ...selectedPlan, daily_chat_limit: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-amber-700 mb-1">תכנית חודשית</label>
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    checked={selectedPlan.is_monthly}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, is_monthly: e.target.checked })}
                    className="h-4 w-4 text-amber-600 focus:ring-amber-500 rounded"
                  />
                  <span className="mr-2 text-sm text-gray-700">כן, זוהי תכנית חודשית</span>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-amber-700 mb-1">תכונות (מופרדות בפסיק)</label>
                <textarea
                  value={Array.isArray(selectedPlan.features) ? selectedPlan.features.join(', ') : selectedPlan.features}
                  onChange={(e) => {
                    const featuresArray = e.target.value.split(',').map(item => item.trim());
                    setSelectedPlan({ ...selectedPlan, features: featuresArray });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowEditPlanModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md mr-2"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-white rounded-md"
                >
                  שמור
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditingUser && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-amber-900">עריכת משתמש</h2>
              <button 
                onClick={() => {
                  setIsEditingUser(false);
                  setEditingUser(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={(e) => {
                e.preventDefault();
                handleUserUpdate(editingUser);
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
                    <input
                      type="text"
                      value={editingUser.name || ''}
                      onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">דוא"ל</label>
                    <input
                      type="email"
                      value={editingUser.email || ''}
                      onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      disabled
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מזהה Cardcom</label>
                    <input
                      type="text"
                      value={editingUser.cardcom_low_profile_id || ''}
                      onChange={(e) => setEditingUser({...editingUser, cardcom_low_profile_id: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">חשבון Cardcom</label>
                    <input
                      type="number"
                      value={editingUser.cardcom_account_id || ''}
                      onChange={(e) => setEditingUser({...editingUser, cardcom_account_id: e.target.value ? Number(e.target.value) : undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מזהה אישי</label>
                    <input
                      type="number"
                      value={editingUser.userPersonalId || ''}
                      onChange={(e) => setEditingUser({...editingUser, userPersonalId: e.target.value ? Number(e.target.value) : undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תכנית</label>
                    <input
                      type="number"
                      value={editingUser.plan_id || ''}
                      onChange={(e) => setEditingUser({...editingUser, plan_id: e.target.value ? Number(e.target.value) : undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מזהה חיוב חוזר</label>
                    <input
                      type="number"
                      value={editingUser.recurring_id || ''}
                      onChange={(e) => setEditingUser({...editingUser, recurring_id: e.target.value ? Number(e.target.value) : undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">הנחה באחוזים</label>
                    <input
                      type="number"
                      value={editingUser.discount_percent || ''}
                      onChange={(e) => setEditingUser({...editingUser, discount_percent: e.target.value ? Number(e.target.value) : undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריך חיוב אחרון</label>
                    <input
                      type="date"
                      value={editingUser.last_bill_date ? new Date(editingUser.last_bill_date).toISOString().split('T')[0] : ''}
                      onChange={(e) => setEditingUser({...editingUser, last_bill_date: e.target.value || undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריך ביטול שירות</label>
                    <input
                      type="date"
                      value={editingUser.disable_date ? new Date(editingUser.disable_date).toISOString().split('T')[0] : ''}
                      onChange={(e) => setEditingUser({...editingUser, disable_date: e.target.value || undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">סיבת ביטול</label>
                    <input
                      type="text"
                      value={editingUser.cancellation_reason || ''}
                      onChange={(e) => setEditingUser({...editingUser, cancellation_reason: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריך ביטול</label>
                    <input
                      type="datetime-local"
                      value={editingUser.cancellation_date ? new Date(editingUser.cancellation_date).toISOString().slice(0, 16) : ''}
                      onChange={(e) => setEditingUser({...editingUser, cancellation_date: e.target.value || undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="recurring_is_active"
                      checked={editingUser.recurring_is_active || false}
                      onChange={(e) => setEditingUser({...editingUser, recurring_is_active: e.target.checked})}
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                    />
                    <label htmlFor="recurring_is_active" className="mr-2 block text-sm text-gray-700">
                      חיוב חוזר פעיל
                    </label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="cancellation_discount_used"
                      checked={editingUser.cancellation_discount_used || false}
                      onChange={(e) => setEditingUser({...editingUser, cancellation_discount_used: e.target.checked})}
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                    />
                    <label htmlFor="cancellation_discount_used" className="mr-2 block text-sm text-gray-700">
                      נוצל קוד הנחה לביטול
                    </label>
                  </div>
                </div>
                
                <div className="flex justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingUser(false);
                      setEditingUser(null);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md ml-2"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 text-white rounded-md"
                  >
                    שמור
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}