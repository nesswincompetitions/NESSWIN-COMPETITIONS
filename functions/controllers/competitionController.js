import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";

/**
 * Scheduled Function: manageCompetitionLifecycle
 * Runs every 5 minutes to identify "expired" competitions (where draw_date has passed)
 * and moves them to "ready_to_draw" status.
 */
export const manageCompetitionLifecycle = onSchedule("*/5 * * * *", async (event) => {
  logger.info("Starting competition lifecycle management check...");

  try {
    const now = admin.firestore.Timestamp.now();
    
    // Query: status == "active" AND draw_date <= current server time
    const expiredQuery = db.collection("competition")
      .where("status", "==", "active")
      .where("draw_date", "<=", now);

    const snapshot = await expiredQuery.get();

    if (snapshot.empty) {
      logger.info("No expired competitions found.");
      return;
    }

    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "ready_to_draw",
        updated_at: now
      });
      count++;
    });

    await batch.commit();
    logger.info(`Successfully updated ${count} competition(s) to 'ready_to_draw'.`);

  } catch (error) {
    logger.error("Error in manageCompetitionLifecycle:", error);
  }
});
