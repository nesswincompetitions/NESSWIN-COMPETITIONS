import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isActiveTicket,
  isInvalidatedTicket,
  normalizeTicketStatus,
} from '../../src/shared/utils/ticketStatus.js';

describe('ticket status visibility helpers', () => {
  it('normalizes ticket status values', () => {
    assert.equal(normalizeTicketStatus({ status: ' INVALID ' }), 'invalid');
    assert.equal(normalizeTicketStatus({}), '');
  });

  it('filters only invalid tickets from user-facing views', () => {
    assert.equal(isInvalidatedTicket({ status: 'invalid' }), true);
    assert.equal(isInvalidatedTicket({ status: 'INVALID' }), true);
    assert.equal(isInvalidatedTicket({ status: 'active' }), false);
    assert.equal(isInvalidatedTicket({ status: 'cancelled' }), false);
    assert.equal(isInvalidatedTicket({ status: 'winner' }), false);
  });

  it('recognizes active tickets independently of admin-visible statuses', () => {
    assert.equal(isActiveTicket({ status: 'active' }), true);
    assert.equal(isActiveTicket({ status: 'invalid' }), false);
    assert.equal(isActiveTicket({ status: 'cancelled' }), false);
    assert.equal(isActiveTicket({ status: 'winner' }), false);
  });
});
