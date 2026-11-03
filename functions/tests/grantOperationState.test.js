import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantDraft,
  createIncompleteGrant,
  isDefinitiveGrantRejection,
  isIncompleteGrantLocked,
  resolveGrantFailure,
  updateIncompleteGrantProgress,
} from '../../src/modules/admin/bonus/utils/grantOperationState.js';

const payload = {
  userId: 'u1',
  userName: 'User One',
  quantity: 900,
  reason: 'goodwill',
};

const partialResult = {
  success: false,
  complete: false,
  requestId: 'grant_request_partial',
  grantedQuantity: 400,
  requestedQuantity: 900,
  remainingQuantity: 500,
};

describe('admin bonus grant operation state', () => {
  it('reuses the incomplete request ID and payload when reopening', () => {
    const pending = createIncompleteGrant({
      requestId: 'grant_request_partial',
      payload,
      result: partialResult,
    });
    let generated = 0;

    const draft = createGrantDraft({
      pendingOperation: pending,
      makeRequestId: () => {
        generated += 1;
        return 'new_request_id';
      },
    });

    assert.equal(draft.requestId, 'grant_request_partial');
    assert.equal(draft.isResume, true);
    assert.deepEqual(draft.payload, payload);
    assert.deepEqual(draft.progress, {
      grantedQuantity: 400,
      requestedQuantity: 900,
      remainingQuantity: 500,
    });
    assert.equal(generated, 0);
  });

  it('generates a new request ID only for a genuinely new grant', () => {
    let generated = 0;
    const draft = createGrantDraft({
      pendingOperation: null,
      makeRequestId: () => {
        generated += 1;
        return 'grant_request_new';
      },
    });

    assert.equal(draft.requestId, 'grant_request_new');
    assert.equal(draft.isResume, false);
    assert.equal(draft.payload, null);
    assert.equal(generated, 1);
  });

  it('locks payload inputs while an incomplete operation exists', () => {
    assert.equal(isIncompleteGrantLocked(null), false);
    assert.equal(
      isIncompleteGrantLocked(
        createIncompleteGrant({
          requestId: 'grant_request_partial',
          payload,
          result: partialResult,
        }),
      ),
      true,
    );
  });

  it('retains the original payload while updating partial progress', () => {
    const pending = createIncompleteGrant({
      requestId: 'grant_request_partial',
      payload,
      result: partialResult,
    });
    const updated = updateIncompleteGrantProgress(pending, {
      complete: false,
      requestId: 'grant_request_partial',
      grantedQuantity: 800,
      requestedQuantity: 900,
      remainingQuantity: 100,
    });

    assert.equal(updated.requestId, 'grant_request_partial');
    assert.deepEqual(updated.payload, payload);
    assert.deepEqual(updated.progress, {
      grantedQuantity: 800,
      requestedQuantity: 900,
      remainingQuantity: 100,
    });
  });

  it('does not retain an operation after completion', () => {
    assert.equal(
      createIncompleteGrant({
        requestId: 'grant_request_done',
        payload,
        result: {
          complete: true,
          grantedQuantity: 900,
          requestedQuantity: 900,
          remainingQuantity: 0,
        },
      }),
      null,
    );
    assert.equal(
      updateIncompleteGrantProgress(
        createIncompleteGrant({
          requestId: 'grant_request_partial',
          payload,
          result: partialResult,
        }),
        {
          complete: true,
          grantedQuantity: 900,
          requestedQuantity: 900,
          remainingQuantity: 0,
        },
      ),
      null,
    );
  });

  it('classifies definitive rejections separately from ambiguous failures', () => {
    for (const code of [
      'invalid-argument',
      'functions/invalid-argument',
      'unauthenticated',
      'functions/unauthenticated',
      'permission-denied',
      'functions/permission-denied',
      'not-found',
      'functions/not-found',
    ]) {
      assert.equal(isDefinitiveGrantRejection({ code }), true);
    }

    for (const code of [
      'internal',
      'functions/internal',
      'unavailable',
      'functions/unavailable',
      'deadline-exceeded',
      'functions/deadline-exceeded',
      'unknown',
      'functions/unknown',
      'failed-precondition',
      'functions/failed-precondition',
      undefined,
    ]) {
      assert.equal(isDefinitiveGrantRejection({ code }), false);
    }
  });

  it('retains the original request ID and payload after an ambiguous failure', () => {
    const unresolved = resolveGrantFailure(null, {
      requestId: 'grant_request_uncertain',
      payload,
      error: { code: 'functions/unavailable' },
    });

    assert.deepEqual(unresolved, {
      requestId: 'grant_request_uncertain',
      payload,
      progress: null,
      uncertain: true,
    });

    let generated = 0;
    const draft = createGrantDraft({
      pendingOperation: unresolved,
      makeRequestId: () => {
        generated += 1;
        return 'grant_request_new';
      },
    });

    assert.equal(draft.requestId, 'grant_request_uncertain');
    assert.equal(draft.isResume, true);
    assert.equal(draft.uncertain, true);
    assert.deepEqual(draft.payload, payload);
    assert.equal(generated, 0);
  });

  it('keeps existing progress but marks it uncertain after an ambiguous retry', () => {
    const pending = createIncompleteGrant({
      requestId: 'grant_request_partial',
      payload,
      result: partialResult,
    });
    const unresolved = resolveGrantFailure(pending, {
      requestId: 'grant_request_partial',
      payload,
      error: { code: 'functions/internal' },
    });

    assert.equal(unresolved.requestId, 'grant_request_partial');
    assert.equal(unresolved.uncertain, true);
    assert.deepEqual(unresolved.payload, payload);
    assert.deepEqual(unresolved.progress, pending.progress);
  });

  it('treats failed-precondition as ambiguous and preserves the submitted identity', () => {
    for (const code of ['failed-precondition', 'functions/failed-precondition']) {
      const unresolved = resolveGrantFailure(null, {
        requestId: 'grant_request_precondition',
        payload,
        error: { code },
      });

      assert.deepEqual(unresolved, {
        requestId: 'grant_request_precondition',
        payload,
        progress: null,
        uncertain: true,
      });
    }
  });

  it('retains an existing incomplete operation after failed-precondition', () => {
    const pending = createIncompleteGrant({
      requestId: 'grant_request_partial',
      payload,
      result: partialResult,
    });
    const resolved = resolveGrantFailure(pending, {
      requestId: 'grant_request_partial',
      payload,
      error: { code: 'functions/failed-precondition' },
    });

    assert.equal(resolved.requestId, pending.requestId);
    assert.equal(resolved.uncertain, true);
    assert.deepEqual(resolved.payload, pending.payload);
    assert.deepEqual(resolved.progress, pending.progress);
  });

  it('does not lock the form for a definitive rejection with no existing operation', () => {
    for (const code of [
      'functions/invalid-argument',
      'functions/permission-denied',
      'functions/unauthenticated',
    ]) {
      assert.equal(
        resolveGrantFailure(null, {
          requestId: 'grant_request_invalid',
          payload,
          error: { code },
        }),
        null,
      );
    }
  });

  it('preserves an existing incomplete operation after a definitive rejection', () => {
    const pending = createIncompleteGrant({
      requestId: 'grant_request_partial',
      payload,
      result: partialResult,
    });
    const resolved = resolveGrantFailure(pending, {
      requestId: 'grant_request_partial',
      payload,
      error: { code: 'functions/permission-denied' },
    });

    assert.equal(resolved, pending);
  });
});
