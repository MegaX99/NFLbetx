import {
  completedCapture,
  capturePayPalOrder,
  getPayPalOrder,
  paypalEnvironment,
  paypalProvider,
  usdValueToCents,
} from "@/lib/server/paypal";
import { authenticateRequest, createAdminServerClient } from "@/lib/server/supabase";

const ORDER_ID_PATTERN = /^[A-Z0-9]{6,64}$/i;

export async function POST(request: Request) {
  try {
    const environment = paypalEnvironment();
    const provider = paypalProvider(environment);
    const auth = await authenticateRequest(request);
    if (!auth) return Response.json({ message: "Please sign in as the commissioner." }, { status: 401 });

    const body = await request.json() as { orderId?: string };
    if (!body.orderId || !ORDER_ID_PATTERN.test(body.orderId)) {
      return Response.json({ message: "The PayPal order is invalid." }, { status: 400 });
    }

    const admin = createAdminServerClient();
    const { data: payment, error: paymentError } = await admin
      .from("commissioner_pass_payments")
      .select("id,pool_id,commissioner_id,provider,status,amount_cents,paypal_capture_id")
      .eq("paypal_order_id", body.orderId)
      .eq("provider", provider)
      .single();
    if (paymentError || !payment || payment.commissioner_id !== auth.user.id) {
      return Response.json({ message: "This PayPal order does not belong to your Commissioner Pass." }, { status: 403 });
    }
    if (payment.status === "captured") {
      return Response.json({ message: "Commissioner Pass payment confirmed.", poolId: payment.pool_id });
    }
    if (payment.status !== "created") {
      return Response.json({ message: "This PayPal order is not ready to capture." }, { status: 409 });
    }

    let order;
    try {
      await capturePayPalOrder(body.orderId, `${payment.id}-capture`, environment);
      // PayPal can return a minimal capture response. Fetch the canonical order
      // representation before validating and recording the payment.
      order = await getPayPalOrder(body.orderId, environment);
    } catch (captureError) {
      console.warn("PayPal capture call did not complete; checking order state", captureError);
      order = await getPayPalOrder(body.orderId, environment);
    }

    const { purchaseUnit, capture, customId, invoiceId, payerId } = completedCapture(order);
    const capturedCents = capture ? usdValueToCents(capture.amount.value) : null;
    const verification = {
      orderCompleted: order.status === "COMPLETED",
      captureCompleted: Boolean(capture),
      currencyMatches: capture?.amount.currency_code === "USD",
      amountMatches: capturedCents === payment.amount_cents,
      poolMatches: purchaseUnit?.reference_id === payment.pool_id,
      customIdMatches: customId === payment.id,
      invoiceIdMatches: invoiceId === payment.id,
    };
    if (!capture || Object.values(verification).some((matches) => !matches)) {
      console.error("PayPal capture verification failed", {
        orderId: body.orderId,
        paymentId: payment.id,
        verification,
      });
      return Response.json({ message: "PayPal has not confirmed the expected payment amount." }, { status: 422 });
    }

    const { error: recordError } = await admin.rpc("record_paypal_commissioner_pass_capture", {
      target_payment_id: payment.id,
      target_paypal_capture_id: capture.id,
      paypal_payer_id: payerId,
    });
    if (recordError) {
      console.error("Captured PayPal payment could not be recorded", recordError);
      return Response.json({ message: "Payment was captured, but the pass needs support review. Do not pay again." }, { status: 500 });
    }

    return Response.json({
      message: `${environment === "sandbox" ? "Sandbox payment" : "Payment"} confirmed. Your Commissioner Pass is active.`,
      poolId: payment.pool_id,
      environment,
    });
  } catch (error) {
    console.error("PayPal capture failed", error);
    return Response.json({ message: "PayPal could not confirm this payment." }, { status: 502 });
  }
}
