export const COMMISSIONER_PASS_BASE_CAPACITY = 12;
export const COMMISSIONER_PASS_CAPACITY_STEP = 5;
export const COMMISSIONER_PASS_BASE_PRICE_CENTS = 3000;
export const COMMISSIONER_PASS_PRICE_STEP_CENTS = 1000;

export type CommissionerPassTier = {
  capacity: number;
  priceCents: number;
};

export function commissionerPassTier(participantCount: number): CommissionerPassTier {
  const count = Math.max(1, Math.floor(participantCount));
  const extraParticipants = Math.max(0, count - COMMISSIONER_PASS_BASE_CAPACITY);
  const extraTiers = Math.ceil(extraParticipants / COMMISSIONER_PASS_CAPACITY_STEP);

  return {
    capacity: COMMISSIONER_PASS_BASE_CAPACITY + extraTiers * COMMISSIONER_PASS_CAPACITY_STEP,
    priceCents: COMMISSIONER_PASS_BASE_PRICE_CENTS + extraTiers * COMMISSIONER_PASS_PRICE_STEP_CENTS,
  };
}

export function formatPassPrice(priceCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}
