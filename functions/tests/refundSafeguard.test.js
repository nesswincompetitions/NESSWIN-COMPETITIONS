import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { partitionRefundTickets } from '../services/ticketAdjustmentPolicy.js';

function ticket(id, status, isWinner = false) {
  return {
    id,
    data: () => ({ status, is_winner: isWinner }),
  };
}

describe('refund safeguard', () => {
  it('cancels active/cancelled tickets and preserves invalid/winner tickets', () => {
    const docs = [
      ticket('active', 'active'),
      ticket('invalid', 'invalid'),
      ticket('cancelled', 'cancelled'),
      ticket('winner', 'winner', true),
    ];

    const { cancellable, preserved } = partitionRefundTickets(docs);

    assert.deepEqual(cancellable.map((doc) => doc.id), ['active', 'cancelled']);
    assert.deepEqual(preserved.map((doc) => doc.id), ['invalid', 'winner']);
    assert.equal(cancellable.length, 2);
    assert.equal(preserved.length, 2);
  });

  it('treats legacy empty status as cancellable and preserves winner flags', () => {
    const docs = [
      ticket('legacy', ''),
      ticket('winner-flag', 'active', true),
    ];

    const { cancellable, preserved } = partitionRefundTickets(docs);

    assert.deepEqual(cancellable.map((doc) => doc.id), ['legacy']);
    assert.deepEqual(preserved.map((doc) => doc.id), ['winner-flag']);
  });
});
