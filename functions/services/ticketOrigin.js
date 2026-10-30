export const TICKET_ORIGIN = Object.freeze({
  PAID: "paid",
  PACK_BONUS: "pack_bonus",
  REFERRAL_CREDIT: "referral_credit",
  REFERRAL_USE_BONUS: "referral_use_bonus",
  ADMIN_BONUS: "admin_bonus",
  ADMIN_ADJUSTMENT: "admin_adjustment",
  ZERO_PAYMENT: "zero_payment",
  UNVERIFIED: "unverified",
  LEGACY_UNKNOWN: "legacy_unknown",
});

export const PAYMENT_SETTLEMENT = Object.freeze({
  STRIPE_PAID: "stripe_paid",
  STRIPE_ZERO_PAYMENT: "stripe_zero_payment",
  DIRECT: "direct",
});

export const REFERRAL_REWARD_TYPES = Object.freeze({
  ADMIN_BONUS: "admin_bonus",
  FREE_TICKET: "free_ticket",
  LEGACY_REFERRAL: "referral",
});

const VALID_ORIGINS = new Set(Object.values(TICKET_ORIGIN));
const VALID_REFERRAL_REWARD_TYPES = new Set(Object.values(REFERRAL_REWARD_TYPES));

export function normalizeTicketOrigin(value) {
  return VALID_ORIGINS.has(value) ? value : TICKET_ORIGIN.LEGACY_UNKNOWN;
}

export function getTicketOrigin(ticketData) {
  return normalizeTicketOrigin(ticketData?.allocation_type);
}

export function isSupportedReferralRewardType(rewardType) {
  return VALID_REFERRAL_REWARD_TYPES.has(rewardType);
}

export function getReferralTicketOrigin(rewardType) {
  if (rewardType === REFERRAL_REWARD_TYPES.ADMIN_BONUS) return TICKET_ORIGIN.ADMIN_BONUS;
  if (
    rewardType === REFERRAL_REWARD_TYPES.FREE_TICKET ||
    rewardType === REFERRAL_REWARD_TYPES.LEGACY_REFERRAL
  ) {
    return TICKET_ORIGIN.REFERRAL_CREDIT;
  }
  return TICKET_ORIGIN.LEGACY_UNKNOWN;
}

export function countTicketOrigins(origins = []) {
  return origins.reduce((counts, origin) => {
    const normalized = normalizeTicketOrigin(origin);
    counts[normalized] = (counts[normalized] || 0) + 1;
    return counts;
  }, {});
}
