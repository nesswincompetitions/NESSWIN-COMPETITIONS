const DEFINITIVE_GRANT_REJECTION_CODES = new Set([
  'invalid-argument',
  'functions/invalid-argument',
  'unauthenticated',
  'functions/unauthenticated',
  'permission-denied',
  'functions/permission-denied',
  'not-found',
  'functions/not-found',
]);

export function isDefinitiveGrantRejection(error) {
  return DEFINITIVE_GRANT_REJECTION_CODES.has(error?.code);
}

export function isIncompleteGrantLocked(pendingOperation) {
  return Boolean(pendingOperation?.requestId);
}

export function createGrantDraft({ pendingOperation, makeRequestId }) {
  if (pendingOperation?.requestId) {
    return {
      requestId: pendingOperation.requestId,
      isResume: true,
      payload: { ...pendingOperation.payload },
      progress: pendingOperation.progress
        ? { ...pendingOperation.progress }
        : null,
      uncertain: pendingOperation.uncertain === true,
    };
  }

  return {
    requestId: makeRequestId(),
    isResume: false,
    payload: null,
    progress: null,
    uncertain: false,
  };
}

export function createUnresolvedGrant({ requestId, payload }) {
  return {
    requestId,
    payload: { ...payload },
    progress: null,
    uncertain: true,
  };
}

export function resolveGrantFailure(pendingOperation, { requestId, payload, error }) {
  if (isDefinitiveGrantRejection(error)) {
    return pendingOperation || null;
  }

  if (pendingOperation?.requestId) {
    return { ...pendingOperation, uncertain: true };
  }

  return createUnresolvedGrant({ requestId, payload });
}

export function createIncompleteGrant({ requestId, payload, result }) {
  if (!result || result.complete) return null;

  const requestedQuantity = Number(
    result.requestedQuantity ?? payload.quantity
  );
  const grantedQuantity = Number(result.grantedQuantity) || 0;

  return {
    requestId: result.requestId || requestId,
    payload: { ...payload },
    progress: {
      grantedQuantity,
      requestedQuantity,
      remainingQuantity: Number(
        result.remainingQuantity ??
          Math.max(0, requestedQuantity - grantedQuantity)
      ),
    },
    uncertain: false,
  };
}

export function updateIncompleteGrantProgress(pendingOperation, result) {
  if (!pendingOperation || !result || result.complete) return null;
  return createIncompleteGrant({
    requestId: pendingOperation.requestId,
    payload: pendingOperation.payload,
    result,
  });
}
