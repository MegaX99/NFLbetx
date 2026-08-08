import { PicksDashboard } from "@/components/picks-dashboard";

export default async function Home({ searchParams }: PageProps<"/">) {
  const pool = (await searchParams).pool;
  return <PicksDashboard poolId={typeof pool === "string" ? pool : undefined} />;
}
