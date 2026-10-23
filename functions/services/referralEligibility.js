/**
 * Shared redemption guard for referral/admin-bonus credit documents.
 * Kept dependency-free so it can be exercised by focused regression tests.
 */
export function assertReferralRedeemable(referralData, refId, userRefPath) {
  // Existing referral/admin-bonus writers omit reward_revoked on active
  // credits; absence retains its established meaning of false.
  const rewardRevoked = referralData?.reward_revoked === undefined
    ? false
    : referralData.reward_revoked;
  if (typeof referralData?.reward_issued !== "boolean" || typeof rewardRevoked !== "boolean") {
    throw new Error(`Referral ${refId} has malformed issuance/revocation flags and cannot be used.`);
  }
  if (referralData.reward_issued && rewardRevoked) {
    throw new Error(`Referral ${refId} has contradictory issuance/revocation flags and cannot be used.`);
  }
  if (referralData.reward_issued === true) {
    throw new Error(`Referral ${refId} was already redeemed.`);
  }
  if (rewardRevoked === true) {
    throw new Error(`Referral ${refId} has been revoked and cannot be used.`);
  }
  if (referralData.referrer_id?.path !== userRefPath) {
    throw new Error(`Referral ${refId} does not belong to you.`);
  }
}
