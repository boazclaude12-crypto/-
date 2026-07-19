"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to homepage as auth is now handled by modal
    router.push('/?auth=login');
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>מעביר לדף הבית...</p>
    </div>
  );
}
