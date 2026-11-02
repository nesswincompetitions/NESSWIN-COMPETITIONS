import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDrawDateState,
  getCompetitionAdjustmentBlock,
  getCompetitionInventoryBlock,
  normalizeRequestId,
} from '../services/ticketAdjustmentPolicy.js';

describe('ticket adjustment policy', () => {
  it('blocks protected competition states and winner references', () => {
    const future = new Date(Date.now() + 60_000);
    const active = { status: 'active', draw_date: future };

    assert.equal(getCompetitionAdjustmentBlock(active), null);
    assert.match(
      getCompetitionAdjustmentBlock({ ...active, status: 'ready_to_draw' }),
      /draw has started/
    );
    assert.match(
      getCompetitionAdjustmentBlock({ ...active, winner_ref: 'user/winner' }),
      /winner has been declared/
    );
    assert.match(
      getCompetitionAdjustmentBlock({ ...active, draw_started_at: new Date() }),
      /draw has started/
    );
    assert.equal(
      getCompetitionAdjustmentBlock({ ...active, draw_started_at: '' }),
      null
    );
    assert.match(
      getCompetitionAdjustmentBlock({ ...active, status: 'sold_out' }),
      /accepting entries/
    );
    assert.equal(
      getCompetitionAdjustmentBlock({ ...active, status: 'sold_out' }, { allowSoldOut: true }),
      null
    );
    assert.match(
      getCompetitionAdjustmentBlock(
        { ...active, status: 'sold_out', draw_date: new Date(Date.now() - 1000) },
        { allowSoldOut: true }
      ),
      /draw date has passed/
    );
  });

  it('fails closed for missing, malformed, and past draw dates', () => {
    assert.match(
      getCompetitionAdjustmentBlock({ status: 'active' }),
      /draw date is missing/
    );
    assert.match(
      getCompetitionAdjustmentBlock({ status: 'active', draw_date: 'not-a-date' }),
      /draw date is invalid/
    );
    assert.match(
      getCompetitionAdjustmentBlock({ status: 'active', draw_date: new Date(Date.now() - 1000) }),
      /draw date has passed/
    );

    assert.deepEqual(getDrawDateState(null), { present: false, valid: false, millis: null });
    assert.equal(getDrawDateState('2026-12-01T00:00:00.000Z').valid, true);
  });

  it('fails closed for malformed inventory or sequence state', () => {
    assert.equal(
      getCompetitionInventoryBlock({
        stock_quantity: 10,
        sold_tickets: 5,
        last_ticket_sequence: 5,
      }),
      null
    );
    assert.match(
      getCompetitionInventoryBlock({ stock_quantity: '10', sold_tickets: 5, last_ticket_sequence: 5 }),
      /inventory or ticket sequence/
    );
    assert.match(
      getCompetitionInventoryBlock({ stock_quantity: 10, sold_tickets: -1, last_ticket_sequence: 5 }),
      /inventory or ticket sequence/
    );
    assert.match(
      getCompetitionInventoryBlock({ stock_quantity: 10, sold_tickets: 5 }),
      /inventory or ticket sequence/
    );
  });

  it('validates request IDs', () => {
    assert.equal(normalizeRequestId('req-valid-1234'), 'req-valid-1234');
    assert.equal(normalizeRequestId('short'), null);
    assert.equal(normalizeRequestId('bad/id/with/slash'), null);
  });
});
