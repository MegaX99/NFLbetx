-- Replace the three temporary test games with the official 2026 Week 1 schedule.
-- Matchups and kickoff times verified against NFL.com on 2026-08-07.

delete from public.games
where season = 2026
  and week = 1
  and external_id like 'demo-%';

insert into public.games
  (external_id, season, week, away_team, home_team, kickoff_at, home_spread, status)
values
  ('nfl-2026-w1-ne-sea',  2026, 1, 'NE',  'SEA', '2026-09-10 00:20:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-sf-lar',  2026, 1, 'SF',  'LAR', '2026-09-11 00:35:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-chi-car', 2026, 1, 'CHI', 'CAR', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-tb-cin',  2026, 1, 'TB',  'CIN', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-no-det',  2026, 1, 'NO',  'DET', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-buf-hou', 2026, 1, 'BUF', 'HOU', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-atl-pit', 2026, 1, 'ATL', 'PIT', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-bal-ind', 2026, 1, 'BAL', 'IND', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-cle-jax', 2026, 1, 'CLE', 'JAX', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-nyj-ten', 2026, 1, 'NYJ', 'TEN', '2026-09-13 17:00:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-ari-lac', 2026, 1, 'ARI', 'LAC', '2026-09-13 20:25:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-gb-min',  2026, 1, 'GB',  'MIN', '2026-09-13 20:25:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-mia-lv',  2026, 1, 'MIA', 'LV',  '2026-09-13 20:25:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-was-phi', 2026, 1, 'WAS', 'PHI', '2026-09-13 20:25:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-dal-nyg', 2026, 1, 'DAL', 'NYG', '2026-09-14 00:20:00+00', 0, 'scheduled'),
  ('nfl-2026-w1-den-kc',  2026, 1, 'DEN', 'KC',  '2026-09-15 00:15:00+00', 0, 'scheduled')
on conflict (season, week, away_team, home_team) do update
set external_id = excluded.external_id,
    kickoff_at = excluded.kickoff_at,
    home_spread = excluded.home_spread,
    status = excluded.status;

