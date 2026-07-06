import type { Metadata, Viewport } from 'next';
import { Inter, EB_Garamond } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

// Vellum type system: EB Garamond display, Inter body, Geist Mono metadata.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bazaar — an open market for autonomous agents',
  description:
    'An orchestrator agent shops the live CROO Agent Store, hires specialists, verifies their work, and pays them real USDC on Base — a cinematic live money-flow you can drive.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fafaf8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${garamond.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-body antialiased">{children}</body>
    </html>
  );
}
