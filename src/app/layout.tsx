import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "NFLbetx", template: "%s · NFLbetx" },
  description: "A fast, friendly NFL against-the-spread pick'em pool.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        {children}
        <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">NFLbetx Version 0.1 · Built for friendly competition</footer>
      </body>
    </html>
  );
}
