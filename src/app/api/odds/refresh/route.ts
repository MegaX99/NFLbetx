import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_POOL_ID, teamName } from "@/lib/picks";

type OddsOutcome = { name: string; point?: number };
type OddsEvent = {
  id: string;
  away_team: string;
  home_team: string;
  commence_time: string;
  bookmakers: Array<{
    key: string;
    last_update: string;
    markets: Array<{ key: string; outcomes: OddsOutcome[] }>;
  }>;
};

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) {
    return Response.json({ message: "Please sign in as the commissioner." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const oddsApiKey = process.env.ODDS_API_KEY;
  if (!supabaseUrl || !supabaseKey || !oddsApiKey) {
    return Response.json({ message: "The odds connection is not configured yet." }, { status: 503 });
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return Response.json({ message: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .select("commissioner_id")
    .eq("id", DEFAULT_POOL_ID)
    .single();
  if (poolError || pool.commissioner_id !== userData.user.id) {
    return Response.json({ message: "Only the commissioner can update point spreads." }, { status: 403 });
  }

  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id,away_team,home_team,kickoff_at")
    .eq("season", 2026)
    .eq("week", 1)
    .order("kickoff_at");
  if (gamesError) {
    return Response.json({ message: "The Week 1 schedule could not be loaded." }, { status: 500 });
  }

  const oddsUrl = new URL("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/");
  oddsUrl.searchParams.set("apiKey", oddsApiKey);
  oddsUrl.searchParams.set("regions", "us");
  oddsUrl.searchParams.set("bookmakers", "betmgm");
  oddsUrl.searchParams.set("markets", "spreads");
  oddsUrl.searchParams.set("oddsFormat", "american");
  oddsUrl.searchParams.set("dateFormat", "iso");
  oddsUrl.searchParams.set("commenceTimeFrom", "2026-09-09T00:00:00Z");
  oddsUrl.searchParams.set("commenceTimeTo", "2026-09-16T00:00:00Z");

  let oddsResponse: Response;
  try {
    oddsResponse = await fetch(oddsUrl, { cache: "no-store" });
  } catch {
    return Response.json({ message: "BetMGM could not be reached. Please try again." }, { status: 502 });
  }

  if (!oddsResponse.ok) {
    const message = oddsResponse.status === 401 || oddsResponse.status === 403
      ? "The Odds API key was not accepted."
      : oddsResponse.status === 429
        ? "The monthly Odds API request limit has been reached."
        : "BetMGM odds are temporarily unavailable.";
    return Response.json({ message }, { status: oddsResponse.status === 429 ? 429 : 502 });
  }

  const events = await oddsResponse.json() as OddsEvent[];
  const updates: Array<{ id: string; home_spread: number; spread_source: string; spread_updated_at: string }> = [];
  let frozen = 0;

  for (const game of games ?? []) {
    const event = events.find((candidate) =>
      candidate.away_team === teamName(game.away_team)
      && candidate.home_team === teamName(game.home_team)
      && Math.abs(new Date(candidate.commence_time).getTime() - new Date(game.kickoff_at).getTime()) < 12 * 60 * 60 * 1000
    );
    const bookmaker = event?.bookmakers.find((candidate) => candidate.key === "betmgm");
    const spreadMarket = bookmaker?.markets.find((market) => market.key === "spreads");
    const homeOutcome = spreadMarket?.outcomes.find((outcome) => outcome.name === event?.home_team);
    if (!event || !bookmaker || typeof homeOutcome?.point !== "number") continue;

    const spreadUpdatedAt = bookmaker.last_update || new Date().toISOString();
    const { data: updatedGame, error: updateError } = await supabase
      .from("games")
      .update({ odds_event_id: event.id, home_spread: homeOutcome.point, spread_source: "BetMGM", spread_updated_at: spreadUpdatedAt })
      .eq("id", game.id)
      .select("id,home_spread,spread_source,spread_updated_at")
      .maybeSingle();

    if (updateError) {
      if (updateError.message.includes("frozen after the first pick")) {
        frozen += 1;
        continue;
      }
      return Response.json({ message: "A BetMGM line could not be saved." }, { status: 500 });
    }
    if (updatedGame) updates.push(updatedGame);
  }

  const missing = (games?.length ?? 0) - updates.length - frozen;
  const message = updates.length
    ? `${updates.length} BetMGM ${updates.length === 1 ? "line" : "lines"} updated.${frozen ? ` ${frozen} frozen after picks.` : ""}${missing ? ` ${missing} not posted yet.` : ""}`
    : frozen
      ? "The available lines are already frozen because picks have been made."
      : "BetMGM has not posted Week 1 point spreads yet.";

  return Response.json({
    message,
    updated: updates.length,
    frozen,
    missing,
    remaining: oddsResponse.headers.get("x-requests-remaining"),
    updates,
  });
}

