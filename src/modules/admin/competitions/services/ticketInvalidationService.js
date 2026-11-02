import { callFunction } from '@/shared/services/functionClient';

export const invalidateUserCompetitionTickets = (
  userId,
  competitionId,
  reason,
  { ticketIds, requestId, mode } = {}
) =>
  callFunction(
    'invalidateUserCompetitionTickets',
    {
      userId,
      competitionId,
      reason,
      ...(ticketIds ? { ticketIds } : {}),
      ...(requestId ? { requestId } : {}),
      ...(mode ? { mode } : {}),
    },
    'Failed to invalidate tickets.'
  );
