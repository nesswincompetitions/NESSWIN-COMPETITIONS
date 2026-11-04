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

export const correctCompetitionTicketsAfterDraw = ({
  userId,
  competitionId,
  ticketIds,
  reason,
  requestId,
}) =>
  callFunction(
    'correctCompetitionTicketsAfterDraw',
    { userId, competitionId, ticketIds, reason, requestId },
    'Failed to correct tickets after the draw.'
  );
