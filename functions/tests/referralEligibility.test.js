import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertReferralRedeemable } from '../services/referralEligibility.js';

function credit(rewardType, overrides = {}) {
  return {
    reward_type: rewardType,
    reward_issued: false,
    referrer_id: { path: 'user/targetUser' },
    ...overrides,
  };
}

describe('referral reward-type eligibility', () => {
  it('accepts every supported reward type', () => {
    for (const rewardType of ['admin_bonus', 'free_ticket', 'referral']) {
      assert.doesNotThrow(() =>
        assertReferralRedeemable(credit(rewardType), 'c1', 'user/targetUser')
      );
    }
  });

  it('rejects unsupported, missing, and malformed reward types', () => {
    for (const rewardType of ['other', 'paid', 'ADMIN_BONUS', '', null, undefined]) {
      assert.throws(
        () => assertReferralRedeemable(credit(rewardType), 'c1', 'user/targetUser'),
        /unsupported reward_type/
      );
    }
  });

  it('keeps existing issuance and ownership guards ahead of reward-type validation', () => {
    assert.throws(
      () => assertReferralRedeemable(
        credit('other', { reward_issued: true }),
        'c1',
        'user/targetUser'
      ),
      /already redeemed/
    );
    assert.throws(
      () => assertReferralRedeemable(
        credit('other', { referrer_id: { path: 'user/other' } }),
        'c1',
        'user/targetUser'
      ),
      /does not belong/
    );
  });
});
