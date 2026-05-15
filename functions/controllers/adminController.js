import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, toHttpsError } from "../services/functionGuards.js";

/**
 * Callable: grantAdminBonus
 * Payload: { userId: string, quantity: number, reason?: string }
 * Performs the same actions as the client-side helper but using Admin SDK
 * so it can write to protected collections regardless of client-side rules.
 */
export const grantAdminBonus = onCall(async (request) => {
  // Ensure caller is admin
  await assertAdmin(request);

  const { userId, quantity, reason = "" } = request.data || {};

  try {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpsError("invalid-argument", "Quantity must be a positive integer.");
    }
    if (qty > 1000) {
      throw new HttpsError("invalid-argument", "Maximum 1000 tickets per grant.");
    }
    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }

    const userRef = db.collection("user").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }

    const batch = db.batch();

    const serverTs = admin.firestore.FieldValue.serverTimestamp();

    // Create referral docs for audit / free ticket allocation
    for (let i = 0; i < qty; i++) {
      const referralRef = db.collection("referrals").doc();
      batch.set(referralRef, {
        referrer_id: userRef,
        referred_user_id: null,
        referral_code: "ADMIN_BONUS",
        reward_type: "admin_bonus",
        reward_value: 1,
        reward_issued: false,
        created_at: serverTs,
      });
    }

    // Update user counters
    batch.update(userRef, {
      free_tickets: admin.firestore.FieldValue.increment(qty),
      total_free_tickets: admin.firestore.FieldValue.increment(qty),
      updated_at: serverTs,
    });

    // Notification (non-critical but included in batch for now)
    const notifRef = db.collection("ff_user_push_notifications").doc();
    batch.set(notifRef, {
      user_refs: userRef.path,
      notification_title: `🎁 ${qty} Free Ticket${qty !== 1 ? 's' : ''} Granted!`,
      notification_text: `You've received ${qty} free ticket${qty !== 1 ? 's' : ''} from an admin.${reason ? ` Reason: ${reason}` : ''}`,
      notification_image_url: "",
      notification_sound: "default",
      category: "rewards",
      type: "free_ticket_earned",
      cta_text: "View",
      initial_page_name: "MyTickets",
      parameter_data: JSON.stringify({ quantity: qty, reason: "admin_bonus", admin_note: reason }),
      status: "",
      is_read: false,
      num_sent: 0,
      sender: userRef,
      chat_ref: null,
      order_ref: null,
      competition_ref: null,
      timestamp: serverTs,
      created_at: serverTs,
    });

    // Audit log
    const logRef = db.collection("free_ticket_log").doc();
    batch.set(logRef, {
      user_id: userRef,
      quantity: qty,
      reason: "admin_bonus",
      admin_note: reason,
      type: "grant",
      created_at: serverTs,
    });

    await batch.commit();

    logger.info(`[grantAdminBonus] Granted ${qty} tickets to user=${userId}`);

    return { success: true, message: `Granted ${qty} ticket${qty !== 1 ? 's' : ''}.` };
  } catch (err) {
    logger.error("[grantAdminBonus] Error:", err?.message || err);
    throw toHttpsError(err, "Failed to grant admin bonus.");
  }
});
