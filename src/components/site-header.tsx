import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-black tracking-tight text-slate-950">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-lime-400 text-sm">NX</span>
          <span className="text-xl">NFLbetx</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-bold text-slate-600 sm:gap-7" aria-label="Main navigation">
          <Link href="/" className="hover:text-slate-950">Picks</Link>
          <Link href="/standings" className="hover:text-slate-950">Standings</Link>
          <Link href="/rules" className="hidden hover:text-slate-950 sm:block">Rules</Link>
          <Link href="/login" className="rounded-lg bg-slate-950 px-4 py-2 text-white hover:bg-slate-800">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
