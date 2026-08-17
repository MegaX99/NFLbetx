import { completedCapture, capturePayPalOrder, getPayPalOrder, usdValueToCents } from "@/lib/server/paypal";
import { authenticateRequest, createAdminServerClient } from "@/lib/server/supabase";

const ORDER_ID_PATTERN = /^[A-Z0-9]{6,64}$/i;

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return Response.json({ message: "Please sign in as the commissioner." }, { status: 401 });

    const body = await request.json() as { orderId?: string };
    if (!body.orderId || !ORDER_ID_PATTERN.test(body.orderId)) {
      return Response.json({ message: "The PayPal order is invalid." }, { status: 400 });
    }

    const admin = createAdminServerClient();
    const { data: payment, error: paymentError } = await admin
      .from("commissioner_pass_payments")
      .select("id,pool_id,commissioner_id,status,amount_cents,paypal_capture_id")
      .eq("paypal_order_id", body.orderId)
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
      order = await capturePayPalOrder(body.orderId, `${payment.id}-capture`);
    } catch (captureError) {
      console.warn("PayPal capture call did not complete; checking order state", captureError);
      order = await getPayPalOrder(body.orderId);
    }

    const { purchaseUnit, capture, payerId } = completedCapture(order);
    const capturedCents = capture ? usdValueToCents(capture.amount.value) : null;
    if (
      order.status !== "COMPLETED"
      || !capture
      || capture.amount.currency_code !== "USD"
      || capturedCents !== payment.amount_cents
      || purchaseUnit?.reference_id !== payment.pool_id
      || purchaseUnit?.custom_id !== payment.id
      || purchaseUnit?.invoice_id !== payment.id
    ) {
      console.error("PayPal capture verification failed", { orderId: body.orderId, paymentId: payment.id });
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

    return Response.json({ message: "Sandbox payment confirmed. Your Commissioner Pass is active.", poolId: payment.pool_id });
  } catch (error) {
    console.error("PayPal Sandbox capture failed", error);
    return Response.json({ message: "PayPal could not confirm this sandbox payment." }, { status: 502 });
  }
}
