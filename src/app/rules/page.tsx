const rules = [
  ["Pick against the spread", "Select the team you think will cover the posted point spread."],
  ["Beat the lock", "Each matchup locks at its scheduled kickoff time. Locked picks cannot be changed."],
  ["Earn one point", "A correct pick earns one point. A push earns half a point. A loss earns zero."],
  ["Win the week", "The player with the most points after Monday night wins the weekly prize."],
];

export default function RulesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Simple by design</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">Pool rules</h1>
      <div className="mt-8 space-y-4">{rules.map(([title, body], index) => <section key={title} className="panel flex gap-4 p-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime-400 font-black">{index + 1}</span><div><h2 className="font-black">{title}</h2><p className="mt-1 leading-6 text-slate-500">{body}</p></div></section>)}</div>
    </main>
  );
}
