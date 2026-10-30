import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MockHttpsError,
} from './helpers/memoryFirestore.js';
import {
  createRefundOrderHandler,
  REFUND_UNAVAILABLE_MESSAGE,
} from '../services/refundOrderService.js';

function makeHandler(assertAdmin = async () => 'admin1') {
  return createRefundOrderHandler({
    assertAdmin,
    HttpsError: MockHttpsError,
  });
}

describe('refundOrder phase 1 safety', () => {
  it('rejects a valid order before any state change because no provider refund exists', async () => {
    await assert.rejects(
      makeHandler()({ auth: { uid: 'admin1' }, data: { orderId: 'o1' } }),
      (error) =>
        error.code === 'failed-precondition' &&
        error.message === REFUND_UNAVAILABLE_MESSAGE &&
        /No order, ticket, payment, or notification data was changed/.test(error.message)
    );
  });

  it('rejects an invalid payload without claiming a refund', async () => {
    await assert.rejects(
      makeHandler()({ auth: { uid: 'admin1' }, data: {} }),
      (error) => error.code === 'invalid-argument'
    );
  });

  it('rejects unauthorized callers before validation', async () => {
    await assert.rejects(
      makeHandler(async () => {
        throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
      })({ auth: { uid: 'user1' }, data: { orderId: 'o1' } }),
      (error) => error.code === 'permission-denied'
    );
  });

  it('does not contain any notification or Firestore write path', () => {
    const source = fs.readFileSync(
      fileURLToPath(new URL('../services/refundOrderService.js', import.meta.url)),
      'utf8'
    );
    const controller = fs.readFileSync(
      fileURLToPath(new URL('../controllers/adminController.js', import.meta.url)),
      'utf8'
    );

    assert.equal(source.includes('ff_user_push_notifications'), false);
    assert.equal(source.includes('batch'), false);
    assert.equal(source.includes('transaction'), false);
    assert.equal(controller.includes('refund_processed'), false);
    assert.equal(controller.includes('createRefundOrderHandler'), true);
  });
});
