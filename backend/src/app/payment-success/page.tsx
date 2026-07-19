"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import LogoutButton from "../../components/LogoutButton";
import { createClient } from "../../../lib/supabase/client";
import { Suspense } from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";

function PaymentSuccessContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("מעבד נתוני תשלום...");
  const [facebookPixel, setFacebookPixel] = useState<any>(
    `
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1134680931381866');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1134680931381866&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
      `
  );

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/?auth=login");
      } else {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("plan_id")
          .eq('user_id', user.id)
          .single();

        if (error) {
          router.push("/?auth=login");
        } else {
          if (data.plan_id != null) {
            router.push("/dashboard");
          }
        }
      }
    };

    fetchUser();
    const price = searchParams.get("price") || 1;
    console.log(price);
    setMessage("התשלום הצליח! תודה על הרכישה.");
    setFacebookPixel(
      `
      <!-- Meta Pixel Code -->
      <script>
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '1134680931381866');
      fbq('track', 'Purchase', {value: ${price}, currency: 'ILS'});
      </script>
      <noscript><img height="1" width="1" style="display:none"
      src="https://www.facebook.com/tr?id=1134680931381866&ev=Purchase&noscript=1"
      /></noscript>
      <!-- End Meta Pixel Code -->
        `
      );
    router.push(`/dashboard`);

  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 relative">
      <Script id="facebook-pixel">
        {facebookPixel}
      </Script>
      <div className="absolute top-4 left-4">
        <LogoutButton />
      </div>
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold mb-4">{message}</h1>
        <button
          onClick={() => router.push("/subscribe")}
          className="w-full py-3 mt-4 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
        >
          עבור לעמוד המנויים
        </button>
      </div>
    </div>
  );
}

export default function PaymentSuccess() {
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
      <PaymentSuccessContent />
    </Suspense>
  );
}
