import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { admin, db } from "../config/firebaseAdmin.js";
import { logger } from "firebase-functions";
import { normalizeStatus } from "../services/winnerWorkflowService.js";

/**
 * Trigger: onCompetitionStatusUpdate
 * Listens for status changes to send specific notifications that aren't
 * already handled by transactional workflows.
 */
export const onCompetitionStatusUpdate = onDocumentUpdated("competition/{compId}", async (event) => {
  const compId = event.params.compId;
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  if (!beforeData || !afterData) return;

  const beforeStatus = normalizeStatus(beforeData.status);
  const afterStatus = normalizeStatus(afterData.status);

  // 1. Detect transition to "drawing"
  if (beforeStatus !== "drawing" && afterStatus === "drawing") {
    logger.info(`[CompetitionNotification] Competition ${compId} status changed to drawing. Sending broadcast.`);
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    const notificationId = `draw-starting-${compId}`;
    const notificationRef = db.collection("ff_push_notifications").doc(notificationId);

    try {
      await notificationRef.set({
        notification_title: "Live Draw Starting Soon! 🎥",
        notification_text: `The live draw for "${afterData.title || "the competition"}" is starting now. Tune in!`,
        notification_image_url: afterData.image?.[0] || "",
        scheduled_time: null,
        notification_sound: "default",
        parameter_data: JSON.stringify({ compitation: event.data.after.ref.path }),
        target_audience: "all_users",
        initial_page_name: "detailsPage",
        user_refs: "",
        batch_index: 0,
        num_batches: 1,
        status: "",
        num_sent: 0,
      }, { merge: true });
    } catch (err) {
      logger.error(`[CompetitionNotification] Failed to create drawing broadcast for ${compId}:`, err);
    }
  }
});
