import { getLiveDrawStartBlock } from "./ticketAdjustmentPolicy.js";
import { getParticipantRemovalDrawBlock } from "./ticketAdjustmentAudit.js";

export function createStartCompetitionLiveDrawHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
}) {
  return async function handleStartCompetitionLiveDraw(request) {
    const adminUid = await assertAdmin(request);
    const { competitionId } = request.data || {};

    if (!competitionId || typeof competitionId !== "string") {
      throw new HttpsError("invalid-argument", "competitionId is required.");
    }

    const competitionRef = db.collection("competition").doc(competitionId);

    const result = await db.runTransaction(async (transaction) => {
      const competitionSnap = await transaction.get(competitionRef);
      if (!competitionSnap.exists) {
        throw new HttpsError("not-found", "Competition not found.");
      }

      const competitionData = competitionSnap.data();
      const block = getLiveDrawStartBlock(competitionData);
      if (block) {
        throw new HttpsError("failed-precondition", block);
      }

      const removalBlock = await getParticipantRemovalDrawBlock({
        db,
        competitionId,
        competitionData,
        readQuery: (query) => transaction.get(query),
      });
      if (removalBlock) {
        throw new HttpsError("failed-precondition", removalBlock);
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(competitionRef, {
        status: "drawing",
        draw_started_at: now,
        updated_at: now,
      });

      return { success: true, competitionId, status: "drawing" };
    });

    logger.info(
      `[startCompetitionLiveDraw] admin=${adminUid} competition=${competitionId}`
    );

    return result;
  };
}
