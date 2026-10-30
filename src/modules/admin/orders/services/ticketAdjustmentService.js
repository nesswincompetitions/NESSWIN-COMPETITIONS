import { callFunction } from '@/shared/services/functionClient';

export const increaseUserCompetitionTickets = ({
  userId,
  competitionId,
  orderId,
  quantity,
  reason,
  requestId,
}) =>
  callFunction(
    'increaseUserCompetitionTickets',
    { userId, competitionId, orderId, quantity, reason, requestId },
    'Failed to add tickets.'
  );
