import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTicketBlockedFromWinnerSelection } from '../services/ticketEligibility.js';

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
