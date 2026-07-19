"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";

function PaymentFailedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [facebookPixel, setFacebookPixel] = useState<any>(null);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
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
      fbq('track', 'PageView');
      </script>
      <noscript><img height="1" width="1" style="display:none"
      src="https://www.facebook.com/tr?id=1134680931381866&ev=PageView&noscript=1"
      /></noscript>
      <!-- End Meta Pixel Code -->
        `
      );
      setErrorMessage(error);
    } else {
      setErrorMessage("נמצאה שגיאה בזמן התשלום אנא נסה שנית.");
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Script id="facebook-pixel">
        {facebookPixel}
      </Script>
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold mb-4">תשלום נכשל</h1>
        <p className="mb-4">{errorMessage}</p>
        <button
          onClick={() => router.push("/subscribe")}
          className="w-full py-3 mt-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors"
        >
          חזור לדף החבילות
        </button>
      </div>
    </div>
  );
}

export default function PaymentFailed() {
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
      <PaymentFailedContent />
    </Suspense>
  );
}
