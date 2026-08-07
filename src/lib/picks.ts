export const DEFAULT_POOL_ID = "00000000-0000-4000-8000-000000000001";

export type PickSide = "away" | "home";

export type Game = {
  id: string;
  season: number;
  week: number;
  away_team: string;
  home_team: string;
  kickoff_at: string;
  home_spread: number;
  status: string;
  away_score: number | null;
  home_score: number | null;
  odds_event_id: string | null;
  spread_source: string | null;
  spread_updated_at: string | null;
};

const names: Record<string, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SF: "San Francisco 49ers",
  SEA: "Seattle Seahawks",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

export function teamName(code: string) {
  return names[code] ?? code;
}

export function teamLogoUrl(code: string) {
  const logoCode = code === "WAS" ? "wsh" : code.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${logoCode}.png`;
}

