import { callFunction } from '@/shared/services/functionClient';

export const increaseUserCompetitionTickets = ({
  userId,
  competitionId,
  orderId,
  origin,
  quantity,
  reason,
  requestId,
}) =>
  callFunction(
    'increaseUserCompetitionTickets',
    { userId, competitionId, orderId, origin, quantity, reason, requestId },
    'Failed to add tickets.'
  );

export const decreaseUserCompetitionTickets = ({
  userId,
  competitionId,
  orderId,
  origin,
  quantity,
  reason,
  requestId,
}) =>
  callFunction(
    'decreaseUserCompetitionTickets',
    { userId, competitionId, orderId, origin, quantity, reason, requestId },
    'Failed to remove tickets.'
  );
