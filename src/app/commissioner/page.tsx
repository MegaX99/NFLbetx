import { CommissionerDashboard } from "@/components/commissioner-dashboard";
import { DEFAULT_POOL_ID } from "@/lib/picks";

export default async function CommissionerPage({ searchParams }: PageProps<"/commissioner">) {
  const pool = (await searchParams).pool;
  return <CommissionerDashboard poolId={typeof pool === "string" ? pool : DEFAULT_POOL_ID} />;
}

