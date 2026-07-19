"use client";

import { BarChart3, User, Bot, Coins, Menu, X, Calculator } from "lucide-react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";
import { createClient } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { useState, useEffect } from "react";

// Define a custom event for opening the upgrade modal
export const triggerUpgradeModal = () => {
  const event = new CustomEvent('openUpgradeModal');
  window.dispatchEvent(event);
};

export default function Header() {
  const supabase = createClient();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const askWizardButton = async () =>
  {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/?auth=login');
      return;
    }
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('plan_id')
      .eq('user_id', user.id)
      .single();
    if (!profile?.plan_id) {
      // Instead of redirecting, trigger the upgrade modal event
      triggerUpgradeModal();
      return;
    }
    //Get plan data
    const {data:planData} = await supabase
    .from('plans')
    .select('daily_chat_limit')
    .eq('id', profile.plan_id)
    .single();
    if(planData?.daily_chat_limit == 0)
    {
      Swal.fire({
        title: "גישה מוגבלת",
        text: "גישה לשאל את אשף זמינה רק למנויי מאסטר.",
        icon: "error",
        showCancelButton: true,
        confirmButtonText: "שינוי מנוי",
        cancelButtonText: "חזרה",
        reverseButtons: true,
        customClass: {
          confirmButton: "swal2-confirm bg-amber-500 text-white px-4 py-2 rounded",
          cancelButton: "swal2-cancel bg-gray-300 text-black px-4 py-2 rounded",
        },
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = "/profile";
        }
      });
    }
    else{
      router.push('/ask');
    }
  }
  
  return (
    <header className="bg-white border-b relative z-50">
      <div className="container mx-auto px-4 py-4">
        {/* Desktop Header */}
        <div className="flex items-center justify-between">
          <Link href={'/'}>
            <div className="flex items-center gap-2 text-2xl font-bold text-amber-500">
              <BarChart3 className="h-8 w-8" />
              אשף המסחר
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <button
              onClick={askWizardButton}
              className="flex items-center justify-center px-4 py-2 bg-amber-100 text-amber-500 rounded-lg hover:bg-amber-200 transition-colors"
            >
              <Bot className="h-5 w-5" />
            </button>
            
            <Link href="/coin" className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 hover:shadow-md hover:scale-105 group transition-all duration-200">
              <Coins className="h-5 w-5 group-hover:animate-pulse" />
              <span className="relative after:absolute after:bottom-0 after:left-0 after:bg-amber-600 after:h-0.5 after:w-0 group-hover:after:w-full after:transition-all after:duration-300"></span>
            </Link>

            <Link href="/calculator" className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 hover:shadow-md hover:scale-105 group transition-all duration-200">
              <Calculator className="h-5 w-5 group-hover:animate-pulse" />
              <span className="relative after:absolute after:bottom-0 after:left-0 after:bg-amber-600 after:h-0.5 after:w-0 group-hover:after:w-full after:transition-all after:duration-300"></span>
            </Link>
            
            <a href="/profile" className="text-gray-600 hover:text-gray-900">
              <User className="h-5 w-5" />
            </a>
            <LogoutButton />
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t py-4 px-4 shadow-md animate-in slide-in-from-top duration-300">
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => {
                askWizardButton();
                setMobileMenuOpen(false);
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-100 text-amber-500 rounded-lg hover:bg-amber-200 transition-colors w-full"
            >
              <Bot className="h-5 w-5" />
              <span className="font-medium"></span>
            </button>
            
            <Link 
              href="/coin" 
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 transition-all w-full relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-amber-200/50 to-amber-100/30 w-full transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></span>
              <Coins className="h-5 w-5 relative z-10" />
              <span className="font-medium relative z-10"></span>
              <span className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">✨</span>
            </Link>

            <Link 
              href="/calculator" 
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 transition-all w-full relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-amber-200/50 to-amber-100/30 w-full transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></span>
              <Calculator className="h-5 w-5 relative z-10" />
              <span className="font-medium relative z-10">מחשבון</span>
              <span className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">✨</span>
            </Link>
            
            <div className="flex justify-between pt-2 border-t">
              <a 
                href="/profile" 
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <User className="h-5 w-5" />
                <span>פרופיל</span>
              </a>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
