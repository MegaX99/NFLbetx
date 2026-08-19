import { paypalCredentialsConfigured, paypalEnvironment } from "@/lib/server/paypal";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const environment = paypalEnvironment();
    return Response.json({
      environment,
      configured: paypalCredentialsConfigured(environment),
    });
  } catch (error) {
    console.error("PayPal environment configuration error", error);
    return Response.json({ environment: null, configured: false }, { status: 500 });
  }
}
