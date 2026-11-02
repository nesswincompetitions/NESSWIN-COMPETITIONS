import { callFunction } from '@/shared/services/functionClient';

export const createAdditionalPaymentRequest = (payload) =>
  callFunction(
    'createAdditionalPaymentRequest',
    payload,
    'Failed to create additional payment request.'
  );

export const listAdditionalPaymentRequests = ({ competitionId, userId, limit } = {}) =>
  callFunction(
    'listAdditionalPaymentRequests',
    { competitionId, userId, limit },
    'Failed to load additional payment requests.'
  );

export const getAdditionalPaymentCheckoutUrl = (requestId) =>
  callFunction(
    'getAdditionalPaymentCheckoutUrl',
    { requestId },
    'Failed to retrieve the payment link.'
  );
