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
};

const names: Record<string, string> = {
  BUF: "Buffalo Bills",
  KC: "Kansas City Chiefs",
  PHI: "Philadelphia Eagles",
  DAL: "Dallas Cowboys",
  SF: "San Francisco 49ers",
  SEA: "Seattle Seahawks",
};

export function teamName(code: string) {
  return names[code] ?? code;
}
