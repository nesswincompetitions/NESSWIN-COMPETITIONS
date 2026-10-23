import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBonusEntryActionState,
  hasRevokedBonusCredits,
  isActiveBonusEntry,
} from '../../src/modules/admin/bonus/utils/bonusEntrySelectors.js';

describe('admin bonus active-entry selector', () => {
  it('keeps a mixed used and revocable group visible', () => {
    assert.equal(isActiveBonusEntry({ used_quantity: 1, revocable_quantity: 2 }), true);
  });

  it('hides groups without revocable credits', () => {
    assert.equal(isActiveBonusEntry({ used_quantity: 2, revoked_quantity: 1, revocable_quantity: 0 }), false);
  });
});

describe('admin bonus action-state selector', () => {
  it('keeps the revoke action for an available group', () => {
    assert.equal(getBonusEntryActionState({ revocable_quantity: 1 }), 'revocable');
  });

  it('keeps the revoke action for a mixed group with remaining credits', () => {
    assert.equal(
      getBonusEntryActionState({ used_quantity: 1, revoked_quantity: 1, revocable_quantity: 2 }),
      'revocable',
    );
  });

  it('identifies a fully revoked group', () => {
    const entry = { quantity: 2, revoked_quantity: 2, revocable_quantity: 0 };
    assert.equal(hasRevokedBonusCredits(entry), true);
    assert.equal(getBonusEntryActionState(entry), 'revoked');
  });

  it('shows the revoked indicator for a legacy used/revoked group with no revocable credits', () => {
    const entry = {
      quantity: 10,
      used_quantity: 4,
      revoked_quantity: 6,
      unsupported_quantity: 0,
      revocable_quantity: 0,
    };
    assert.equal(hasRevokedBonusCredits(entry), true);
    assert.equal(getBonusEntryActionState(entry), 'revoked');
  });

  it('does not label a used-only group as revoked', () => {
    const entry = { quantity: 2, used_quantity: 2, revocable_quantity: 0 };
    assert.equal(hasRevokedBonusCredits(entry), false);
    assert.equal(getBonusEntryActionState(entry), 'inactive');
  });

  it('does not label an unsupported-only group as revoked', () => {
    const entry = { quantity: 2, unsupported_quantity: 2, revocable_quantity: 0 };
    assert.equal(hasRevokedBonusCredits(entry), false);
    assert.equal(getBonusEntryActionState(entry), 'inactive');
  });
});
