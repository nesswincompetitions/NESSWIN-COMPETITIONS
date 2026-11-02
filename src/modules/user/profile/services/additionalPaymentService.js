import { callFunction } from '@/shared/services/functionClient';

export const fetchMyAdditionalPaymentRequests = () =>
  callFunction(
    'getMyAdditionalPaymentRequests',
    {},
    'Failed to load additional payment requests.'
  );

export const fetchAdditionalPaymentCheckoutUrl = (requestId) =>
  callFunction(
    'getAdditionalPaymentCheckoutUrl',
    { requestId },
    'Failed to retrieve the payment link.'
  );
