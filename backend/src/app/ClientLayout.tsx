"use client";

import Script from "next/script";
import ReactFacebookPixel from "../components/ReactFacebookPixel";
import { CalculatorIcon } from "lucide-react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const navigation = [
    {
      name: "מחשבון רווח והפסד",
      href: "/calculator",
      icon: CalculatorIcon
    }
  ];

  return (
    <>
      <head>
        <meta name="facebook-domain-verification" content="vvg2ult95n72ic5b4st4g6fjo4npa9" />
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-34PHE3BBNE"></Script>
        <link rel="icon" href="favicon.ico" />
        <Script id="google-analytics">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-34PHE3BBNE');
          `}
        </Script>
      </head>
      <ReactFacebookPixel>{children}</ReactFacebookPixel>
    </>
  );
} 