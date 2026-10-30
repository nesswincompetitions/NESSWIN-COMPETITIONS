import { callFunction } from '@/shared/services/functionClient';

/**
 * Starts the live draw through the trusted backend callable.
 */
export const startCompetitionLiveDraw = (competitionId) =>
  callFunction(
    'startCompetitionLiveDraw',
    { competitionId },
    'Failed to start the live draw.'
  );

/**
 * Selecting a winner remains a Cloud Function for security and transaction integrity.
 */
export const selectCompetitionWinner = (competitionId, ticketSequence) =>
  callFunction(
    'selectCompetitionWinner',
    { competitionId, ticketSequence },
    'Failed to select a winner.'
  );

/**
 * Updating handover stages (contacted, prize_sent, completed) remains a Cloud Function.
 */
export const updateCompetitionHandover = (competitionId, stage, payload = {}) =>
  callFunction(
    'updateCompetitionHandover',
    { competitionId, stage, ...payload },
    'Failed to update the handover state.'
  );
