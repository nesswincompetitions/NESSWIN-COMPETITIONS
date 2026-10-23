import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isActiveBonusEntry } from '../../src/modules/admin/bonus/utils/bonusEntrySelectors.js';

describe('admin bonus active-entry selector', () => {
  it('keeps a mixed used and revocable group visible', () => {
    assert.equal(isActiveBonusEntry({ used_quantity: 1, revocable_quantity: 2 }), true);
  });

  it('hides groups without revocable credits', () => {
    assert.equal(isActiveBonusEntry({ used_quantity: 2, revoked_quantity: 1, revocable_quantity: 0 }), false);
  });
});
