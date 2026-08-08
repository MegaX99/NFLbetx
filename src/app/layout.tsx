import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NFLbetx", template: "%s Â· NFLbetx" },
  description: "A fast, friendly NFL against-the-spread pick'em pool.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        {children}
        <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">NFLbetx Version 0.1 Â· Built for friendly competition</footer>
      </body>
    </html>
  );
}

