import type { Metadata, Viewport } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';

/**
 * Rubik, served from this deployment rather than from Google.
 *
 * A `<link>` to fonts.googleapis.com blocks rendering on a third party: until that
 * request completes the browser paints nothing, so a slow or filtered route to Google —
 * which is what a network in Israel may well have — shows up as a page that spins
 * forever, indistinguishable from the server being down. next/font fetches the file at
 * build time and serves it from our own domain, which removes the dependency entirely and
 * takes two round trips off every cold page load.
 *
 * `display: swap` keeps text readable while the file arrives; the fallbacks matter
 * because they are what Hebrew renders in for those first milliseconds.
 */
const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ui',
  fallback: ['Assistant', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Recruiter OS — מערכת הגיוס שלך',
  description: 'ניהול מועמדים, משרות, לקוחות והכנסות — במקום אחד.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#090b10' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body>{children}</body>
    </html>
  );
}
