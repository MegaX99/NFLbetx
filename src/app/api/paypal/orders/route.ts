import { commissionerPassTier } from "@/lib/commissioner-pass";
import { createPayPalOrder, getPayPalOrder, paypalEnvironment, paypalProvider } from "@/lib/server/paypal";
import { authenticateRequest, createAdminServerClient } from "@/lib/server/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const environment = paypalEnvironment();
    const provider = paypalProvider(environment);
    const auth = await authenticateRequest(request);
    if (!auth) return Response.json({ message: "Please sign in as the commissioner." }, { status: 401 });

    const body = await request.json() as { poolId?: string };
    if (!body.poolId || !UUID_PATTERN.test(body.poolId)) {
      return Response.json({ message: "Choose a valid pool." }, { status: 400 });
    }

    const { data: pool, error: poolError } = await auth.supabase
      .from("pools")
      .select("id,name,season,commissioner_id")
      .eq("id", body.poolId)
      .single();
    if (poolError || !pool || pool.commissioner_id !== auth.user.id) {
      return Response.json({ message: "Only the pool commissioner can purchase this pass." }, { status: 403 });
    }

    const admin = createAdminServerClient();
    const [{ count: memberCount, error: memberError }, { data: pass, error: passError }] = await Promise.all([
      admin.from("pool_members").select("user_id", { count: "exact", head: true }).eq("pool_id", pool.id),
      admin.from("commissioner_passes").select("status,paid_capacity,amount_paid_cents").eq("pool_id", pool.id).single(),
    ]);
    if (memberError || passError || !pass) {
      return Response.json({ message: "The Commissioner Pass could not be prepared." }, { status: 500 });
    }

    let targetTier = commissionerPassTier(memberCount ?? 1);
    if (pass.status === "active") {
      if ((memberCount ?? 0) < pass.paid_capacity) {
        return Response.json({ message: "This Commissioner Pass already covers the current roster." }, { status: 409 });
      }
      targetTier = commissionerPassTier(pass.paid_capacity + 1);
    } else if (pass.status === "refunded") {
      return Response.json({ message: "Please contact support before repurchasing a refunded pass." }, { status: 409 });
    }

    const amountCents = targetTier.priceCents - pass.amount_paid_cents;
    if (amountCents <= 0) {
      return Response.json({ message: "No additional payment is due for this roster." }, { status: 409 });
    }

    const staleBefore = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await admin.from("commissioner_pass_payments")
      .update({ status: "failed" })
      .eq("pool_id", pool.id)
      .in("status", ["creating", "created"])
      .lt("created_at", staleBefore);

    const { data: existing } = await admin.from("commissioner_pass_payments")
      .select("id,provider,status,target_capacity,approval_url,amount_cents,paypal_order_id")
      .eq("pool_id", pool.id)
      .in("status", ["creating", "created"])
      .maybeSingle();
    if (existing?.provider === provider && existing.status === "created" && existing.target_capacity === targetTier.capacity && existing.approval_url) {
      if (existing.paypal_order_id) {
        try {
          const existingOrder = await getPayPalOrder(existing.paypal_order_id, environment);
          if (existingOrder.status === "APPROVED" || existingOrder.status === "COMPLETED") {
            return Response.json({
              orderId: existing.paypal_order_id,
              captureReady: true,
              amountCents: existing.amount_cents,
              environment,
              reused: true,
            });
          }
        } catch (error) {
          console.warn("Existing PayPal order could not be checked; reopening approval", error);
        }
      }
      return Response.json({ approvalUrl: existing.approval_url, amountCents: existing.amount_cents, environment, reused: true });
    }
    if (existing?.provider === provider && existing.status === "creating") {
      return Response.json({ message: "A checkout is already being prepared. Try again in a moment." }, { status: 409 });
    }
    if (existing) {
      await admin.from("commissioner_pass_payments").update({ status: "failed" }).eq("id", existing.id);
    }

    const paymentId = crypto.randomUUID();
    const { error: insertError } = await admin.from("commissioner_pass_payments").insert({
      id: paymentId,
      pool_id: pool.id,
      season: pool.season,
      commissioner_id: auth.user.id,
      provider,
      target_capacity: targetTier.capacity,
      target_total_cents: targetTier.priceCents,
      amount_cents: amountCents,
    });
    if (insertError) {
      return Response.json({ message: "A checkout for this tier is already being prepared. Try again in a moment." }, { status: 409 });
    }

    try {
      const origin = new URL(request.url).origin;
      const returnUrl = new URL("/commissioner", origin);
      returnUrl.searchParams.set("pool", pool.id);
      returnUrl.searchParams.set("paypal", "approved");
      const cancelUrl = new URL("/commissioner", origin);
      cancelUrl.searchParams.set("pool", pool.id);
      cancelUrl.searchParams.set("paypal", "cancelled");

      const order = await createPayPalOrder({
        paymentId,
        poolId: pool.id,
        poolName: pool.name,
        amountCents,
        returnUrl: returnUrl.toString(),
        cancelUrl: cancelUrl.toString(),
      }, environment);
      const approvalUrl = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
      if (!order.id || !approvalUrl) throw new Error("PayPal did not provide an approval link.");

      const { error: updateError } = await admin.from("commissioner_pass_payments")
        .update({ status: "created", paypal_order_id: order.id, approval_url: approvalUrl })
        .eq("id", paymentId);
      if (updateError) throw updateError;

      return Response.json({ approvalUrl, amountCents, environment });
    } catch (error) {
      await admin.from("commissioner_pass_payments").update({ status: "failed" }).eq("id", paymentId);
      console.error(`PayPal ${environment} order creation failed`, error);
      return Response.json({ message: error instanceof Error ? error.message : "PayPal is unavailable." }, { status: 502 });
    }
  } catch (error) {
    console.error("PayPal checkout configuration error", error);
    return Response.json({ message: "PayPal checkout is not configured yet." }, { status: 503 });
  }
}
