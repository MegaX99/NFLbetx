create policy "Anyone can read games"
on public.games
for select
to anon
using (true);
