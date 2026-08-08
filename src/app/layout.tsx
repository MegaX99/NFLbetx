import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nf-lbetx.vercel.app"),
  title: { default: "NFLbetx", template: "%s Â· NFLbetx" },
  description: "A fast, friendly NFL against-the-spread pick'em pool.",
  openGraph: {
    title: "NFLbetx",
    description: "Pick every game. Beat the spread.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "NFLbetx â€” Pick every game. Beat the spread." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NFLbetx",
    description: "Pick every game. Beat the spread.",
    images: ["/og.png"],
  },
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

