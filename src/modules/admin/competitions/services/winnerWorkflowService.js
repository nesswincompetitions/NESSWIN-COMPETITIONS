import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { callFunction } from '@/shared/services/functionClient';

/**
 * Changes competition status to 'drawing' via Client SDK for instant UI feedback.
 */
export const startCompetitionLiveDraw = async (competitionId) => {
  try {
    const compRef = doc(db, 'competition', competitionId);
    await updateDoc(compRef, {
      status: 'drawing',
      draw_started_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error('[WinnerWorkflowService] Error starting live draw:', error);
    throw new Error('Failed to start the live draw via SDK.');
  }
};

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
