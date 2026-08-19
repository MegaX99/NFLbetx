import "server-only";

export type PayPalEnvironment = "sandbox" | "live";
export type PayPalProvider = "paypal_sandbox" | "paypal_live";

const PAYPAL_API: Record<PayPalEnvironment, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

type PayPalLink = { href: string; rel: string; method?: string };
type PayPalAmount = { currency_code: string; value: string };
type PayPalCapture = {
  id: string;
  status: string;
  amount: PayPalAmount;
  custom_id?: string;
  invoice_id?: string;
};
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

export function paypalEnvironment(): PayPalEnvironment {
  const configured = process.env.PAYPAL_ENVIRONMENT;
  if (configured === "sandbox" || configured === "live") return configured;
  if (configured) throw new Error("PAYPAL_ENVIRONMENT must be either sandbox or live.");

  return process.env.VERCEL_ENV === "production" ? "live" : "sandbox";
}

export function paypalProvider(environment: PayPalEnvironment): PayPalProvider {
  return environment === "live" ? "paypal_live" : "paypal_sandbox";
}

export function paypalCredentialsConfigured(environment: PayPalEnvironment) {
  const prefix = environment === "live" ? "PAYPAL_LIVE" : "PAYPAL_SANDBOX";
  return Boolean(process.env[`${prefix}_CLIENT_ID`] && process.env[`${prefix}_CLIENT_SECRET`]);
}

function credentials(environment: PayPalEnvironment) {
  const prefix = environment === "live" ? "PAYPAL_LIVE" : "PAYPAL_SANDBOX";
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) {
    throw new Error(`PayPal ${environment === "live" ? "Live" : "Sandbox"} credentials are not configured.`);
  }
  return { clientId, clientSecret };
}

async function accessToken(environment: PayPalEnvironment) {
  const { clientId, clientSecret } = credentials(environment);
  const response = await fetch(`${PAYPAL_API[environment]}/v1/oauth2/token`, {
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

async function paypalRequest(environment: PayPalEnvironment, path: string, init: RequestInit) {
  const token = await accessToken(environment);
  const response = await fetch(`${PAYPAL_API[environment]}${path}`, {
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
}, environment: PayPalEnvironment) {
  return paypalRequest(environment, "/v2/checkout/orders", {
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

export async function capturePayPalOrder(orderId: string, requestId: string, environment: PayPalEnvironment) {
  return paypalRequest(environment, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    },
    body: "{}",
  });
}

export async function getPayPalOrder(orderId: string, environment: PayPalEnvironment) {
  return paypalRequest(environment, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

export function completedCapture(order: PayPalOrder) {
  const purchaseUnit = order.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.find((candidate) => candidate.status === "COMPLETED");
  return {
    purchaseUnit,
    capture,
    customId: capture?.custom_id ?? purchaseUnit?.custom_id,
    invoiceId: capture?.invoice_id ?? purchaseUnit?.invoice_id,
    payerId: order.payer?.payer_id ?? null,
  };
}

export function usdValueToCents(value: string) {
  if (!/^\d+\.\d{2}$/.test(value)) return null;
  const [dollars, cents] = value.split(".");
  const amount = Number(dollars) * 100 + Number(cents);
  return Number.isSafeInteger(amount) ? amount : null;
}
