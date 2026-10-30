import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TICKET_ORIGIN,
  countTicketOrigins,
  getReferralTicketOrigin,
  getTicketOrigin,
  isSupportedReferralRewardType,
  normalizeTicketOrigin,
} from '../services/ticketOrigin.js';

describe('ticket origin semantics', () => {
  it('recognizes every issued origin and leaves missing or unknown values unknown', () => {
    for (const origin of Object.values(TICKET_ORIGIN)) {
      assert.equal(normalizeTicketOrigin(origin), origin);
    }

    assert.equal(getTicketOrigin({}), TICKET_ORIGIN.LEGACY_UNKNOWN);
    assert.equal(getTicketOrigin({ allocation_type: '' }), TICKET_ORIGIN.LEGACY_UNKNOWN);
    assert.equal(getTicketOrigin({ allocation_type: 'not-a-real-origin' }), TICKET_ORIGIN.LEGACY_UNKNOWN);
  });

  it('maps supported referral reward types without conflating admin bonus and direct admin adjustment', () => {
    assert.equal(getReferralTicketOrigin('admin_bonus'), TICKET_ORIGIN.ADMIN_BONUS);
    assert.equal(getReferralTicketOrigin('free_ticket'), TICKET_ORIGIN.REFERRAL_CREDIT);
    assert.equal(getReferralTicketOrigin('referral'), TICKET_ORIGIN.REFERRAL_CREDIT);
    assert.notEqual(TICKET_ORIGIN.ADMIN_BONUS, TICKET_ORIGIN.ADMIN_ADJUSTMENT);
    assert.equal(TICKET_ORIGIN.ZERO_PAYMENT, 'zero_payment');
    assert.equal(TICKET_ORIGIN.UNVERIFIED, 'unverified');
  });

  it('does not silently classify unsupported or malformed referral types', () => {
    assert.equal(getReferralTicketOrigin('other'), TICKET_ORIGIN.LEGACY_UNKNOWN);
    assert.equal(getReferralTicketOrigin(''), TICKET_ORIGIN.LEGACY_UNKNOWN);
    assert.equal(getReferralTicketOrigin(undefined), TICKET_ORIGIN.LEGACY_UNKNOWN);
    assert.equal(isSupportedReferralRewardType('admin_bonus'), true);
    assert.equal(isSupportedReferralRewardType('free_ticket'), true);
    assert.equal(isSupportedReferralRewardType('referral'), true);
    assert.equal(isSupportedReferralRewardType('other'), false);
    assert.equal(isSupportedReferralRewardType(undefined), false);
  });

  it('counts origin breakdowns including legacy unknown values', () => {
    assert.deepEqual(
      countTicketOrigins([
        TICKET_ORIGIN.PAID,
        TICKET_ORIGIN.PAID,
        TICKET_ORIGIN.PACK_BONUS,
        undefined,
      ]),
      {
        paid: 2,
        pack_bonus: 1,
        legacy_unknown: 1,
      }
    );
  });
});
