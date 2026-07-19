import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "./ClientLayout";

export const metadata: Metadata = {
  title: "אשף המסחר",
  description: "ניתוח מקצועי באמצעות AI לכל סוגי המסחר",
  verification: {
    other: {
      'facebook-domain-verification': 'vvg2ult95n72ic5b4st4g6fjo4npa9',
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" suppressHydrationWarning>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}