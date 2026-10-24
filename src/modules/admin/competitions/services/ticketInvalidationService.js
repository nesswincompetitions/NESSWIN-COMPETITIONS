import { callFunction } from '@/shared/services/functionClient';

export const invalidateUserCompetitionTickets = (userId, competitionId, reason) =>
  callFunction(
    'invalidateUserCompetitionTickets',
    { userId, competitionId, reason },
    'Failed to invalidate tickets.'
  );
