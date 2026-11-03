import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTicketBlockedFromWinnerSelection,
  isUserBlockedFromWinnerSelection,
} from '../services/ticketEligibility.js';

describe('winner ticket eligibility', () => {
  it('blocks invalidated and cancelled tickets', () => {
    assert.equal(isTicketBlockedFromWinnerSelection('invalid'), true);
    assert.equal(isTicketBlockedFromWinnerSelection(' INVALID '), true);
    assert.equal(isTicketBlockedFromWinnerSelection('cancelled'), true);
    assert.equal(isTicketBlockedFromWinnerSelection('CANCELLED'), true);
  });

  it('keeps active and legacy unset statuses selectable', () => {
    assert.equal(isTicketBlockedFromWinnerSelection('active'), false);
    assert.equal(isTicketBlockedFromWinnerSelection(''), false);
    assert.equal(isTicketBlockedFromWinnerSelection('   '), false);
    assert.equal(isTicketBlockedFromWinnerSelection(undefined), false);
    assert.equal(isTicketBlockedFromWinnerSelection('winner'), false);
  });
});

describe('winner user eligibility', () => {
  it('blocks suspended, deleted, and deleting users', () => {
    assert.equal(isUserBlockedFromWinnerSelection({ is_active: false }), true);
    assert.equal(isUserBlockedFromWinnerSelection({ is_deleted: true }), true);
    assert.equal(isUserBlockedFromWinnerSelection({ status: 'deleting' }), true);
    assert.equal(isUserBlockedFromWinnerSelection({ status: 'DELETED' }), true);
    assert.equal(isUserBlockedFromWinnerSelection(null), true);
    assert.equal(isUserBlockedFromWinnerSelection(undefined), true);
  });

  it('keeps active and legacy users eligible', () => {
    assert.equal(isUserBlockedFromWinnerSelection({ is_active: true }), false);
    assert.equal(isUserBlockedFromWinnerSelection({}), false);
    assert.equal(isUserBlockedFromWinnerSelection({ status: 'active' }), false);
  });
});
