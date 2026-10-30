import { callFunction } from '@/shared/services/functionClient';

export const invalidateUserCompetitionTickets = (
  userId,
  competitionId,
  reason,
  { ticketIds, requestId } = {}
) =>
  callFunction(
    'invalidateUserCompetitionTickets',
    {
      userId,
      competitionId,
      reason,
      ...(ticketIds ? { ticketIds } : {}),
      ...(requestId ? { requestId } : {}),
    },
    'Failed to invalidate tickets.'
  );
