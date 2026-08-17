import "server-only";

const PAYPAL_SANDBOX_API = "https://api-m.sandbox.paypal.com";

type PayPalLink = { href: string; rel: string; method?: string };
type PayPalAmount = { currency_code: string; value: string };
type PayPalCapture = { id: string; status: string; amount: PayPalAmount };
type PayPalPurchaseUnit = {
  reference_id?: string;
  custom_id?: string;
  invoice_id?: string;
  payments?: { captures?: PayPalCapture[] };
};

export type PayPalOrder = {
  id: string;
  status: string;
  links?: PayPalLink[];
  payer?: { payer_id?: string };
  purchase_units?: PayPalPurchaseUnit[];
};

export class PayPalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown,
  ) {
    super(message);
  }
}

function credentials() {
  const clientId = process.env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal Sandbox credentials are not configured.");
  }
  return { clientId, clientSecret };
}

async function accessToken() {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(`${PAYPAL_SANDBOX_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new PayPalApiError(data.error_description ?? "PayPal authentication failed.", response.status, data);
  }
  return data.access_token;
}

async function paypalRequest(path: string, init: RequestInit) {
  const token = await accessToken();
  const response = await fetch(`${PAYPAL_SANDBOX_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const data = await response.json() as PayPalOrder & { message?: string };
  if (!response.ok) {
    throw new PayPalApiError(data.message ?? "PayPal could not process the request.", response.status, data);
  }
  return data;
}

export async function createPayPalOrder(input: {
  paymentId: string;
  poolId: string;
  poolName: string;
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
}) {
  return paypalRequest("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": input.paymentId },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: input.poolId,
        custom_id: input.paymentId,
        invoice_id: input.paymentId,
        description: `2026 Commissioner Pass - ${input.poolName}`.slice(0, 127),
        amount: {
          currency_code: "USD",
          value: (input.amountCents / 100).toFixed(2),
        },
      }],
      application_context: {
        brand_name: "NFLbetx",
        landing_page: "LOGIN",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });
}

export async function capturePayPalOrder(orderId: string, requestId: string) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { "PayPal-Request-Id": requestId },
    body: "{}",
  });
}

export async function getPayPalOrder(orderId: string) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

export function completedCapture(order: PayPalOrder) {
  const purchaseUnit = order.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.find((candidate) => candidate.status === "COMPLETED");
  return { purchaseUnit, capture, payerId: order.payer?.payer_id ?? null };
}

export function usdValueToCents(value: string) {
  if (!/^\d+\.\d{2}$/.test(value)) return null;
  const [dollars, cents] = value.split(".");
  const amount = Number(dollars) * 100 + Number(cents);
  return Number.isSafeInteger(amount) ? amount : null;
}
