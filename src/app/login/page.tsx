export default function LoginPage() {
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-12">
      <div className="panel w-full p-7">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-lime-400 font-black">NX</div>
        <h1 className="mt-5 text-3xl font-black tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">Sign-in will activate when your Supabase keys are added.</p>
        <form className="mt-6 space-y-4">
          <label className="block text-sm font-bold">Email<input type="email" placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-300" /></label>
          <label className="block text-sm font-bold">Password<input type="password" placeholder="••••••••" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-300" /></label>
          <button type="button" className="w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white hover:bg-slate-800">Sign in</button>
        </form>
      </div>
    </main>
  );
}
