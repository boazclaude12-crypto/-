"use client";

import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LogoutButton() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/?auth=login");
  };

  return (
    <button onClick={handleLogout} className="text-gray-600 hover:text-gray-900">
      התנתק
    </button>
  );
}
