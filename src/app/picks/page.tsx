import { PicksDashboard } from "@/components/picks-dashboard";

export default async function PicksPage({ searchParams }: PageProps<"/picks">) {
  const pool = (await searchParams).pool;
  return <PicksDashboard poolId={typeof pool === "string" ? pool : undefined} />;
}

