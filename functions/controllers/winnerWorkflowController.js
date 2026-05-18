import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, toHttpsError } from "../services/functionGuards.js";
import {
  buildWinnerFirstMessageNotificationId,
  normalizeText,
  selectWinnerTransaction,
  updateWinnerHandoverTransaction,
} from "../services/winnerWorkflowService.js";

function getCompetitionRef(competitionId) {
  return db.collection("competition").doc(competitionId);
}

function getChatRef(chatId) {
  return db.collection("chats").doc(chatId);
}

function getWinnerMessageNotificationRef(chatId) {
  return db.collection("ff_user_push_notifications").doc(buildWinnerFirstMessageNotificationId(chatId));
}

export const selectCompetitionWinner = onCall(async (request) => {
  const adminUid = await assertAdmin(request);
  const { competitionId, ticketSequence } = request.data || {};

  if (!competitionId || typeof competitionId !== "string") {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }

  if (!ticketSequence || typeof ticketSequence !== "string") {
    throw new HttpsError("invalid-argument", "ticketSequence is required.");
  }

  const competitionRef = getCompetitionRef(competitionId);
  const adminRef = db.collection("user").doc(adminUid);

  try {
    return await db.runTransaction(async (transaction) =>
      selectWinnerTransaction(transaction, {
        competitionRef,
        competitionId,
        ticketSequence: normalizeText(ticketSequence),
        adminRef,
      })
    );
  } catch (error) {
    logger.error("[selectCompetitionWinner] Error:", error);
    throw toHttpsError(error, "Failed to select a winner.");
  }
});

export const updateCompetitionHandover = onCall(async (request) => {
  const adminUid = await assertAdmin(request);
  const { competitionId, stage, idProofUrl, handoverPhotoUrl, handoverVideoUrl } = request.data || {};

  if (!competitionId || typeof competitionId !== "string") {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }

  const competitionRef = getCompetitionRef(competitionId);
  const adminRef = db.collection("user").doc(adminUid);

  try {
    return await db.runTransaction(async (transaction) =>
      updateWinnerHandoverTransaction(transaction, {
        competitionRef,
        competitionId,
        adminRef,
        stage: stage ? normalizeText(stage).toLowerCase() : null,
        idProofUrl,
        handoverPhotoUrl,
        handoverVideoUrl,
      })
    );
  } catch (error) {
    logger.error("[updateCompetitionHandover] Error:", error);
    throw toHttpsError(error, "Failed to update the handover state.");
  }
});

export const notifyWinnerOnFirstAdminMessage = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const chatId = event.params.chatId;
    const messageData = event.data?.data() || {};

    if (!chatId) {
      return;
    }

    try {
      await db.runTransaction(async (transaction) => {
        const chatRef = getChatRef(chatId);
        const chatSnap = await transaction.get(chatRef);

        if (!chatSnap.exists) {
          return;
        }

        const chatData = chatSnap.data();

        if (chatData.chat_type !== "winner_chat" || chatData.status !== "active") {
          return;
        }

        const adminRef = chatData.assigned_admin_id || chatData.sender_id;
        const isAdminMessage = adminRef && messageData.sender_id?.path === adminRef.path;

        if (!isAdminMessage || chatData.winner_first_admin_message_notified === true) {
          return;
        }

        const winnerRef = chatData.receiver_id || (Array.isArray(chatData.participants) ? chatData.participants[1] : null);
        const notificationRef = getWinnerMessageNotificationRef(chatId);

        const winnerDocPath = winnerRef?.path ? (winnerRef.path.startsWith("user/") ? winnerRef.path : `user/${winnerRef.path}`) : (winnerRef?.id ? `user/${winnerRef.id}` : "");
        const adminDocPath = adminRef?.path ? (adminRef.path.startsWith("user/") ? adminRef.path : `user/${adminRef.path}`) : (adminRef?.id ? `user/${adminRef.id}` : "");

        transaction.update(chatRef, {
          winner_first_admin_message_notified: true,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.set(
          notificationRef,
          {
            notification_title: "New message from admin",
            notification_text: "The admin has sent you a message about your prize handover.",
            notification_sound: "default",
            user_ref: winnerRef,
            user_refs: winnerDocPath,
            sender: adminRef,
            chat_ref: chatRef,
            category: "messages",
            type: "support_replied",
            cta_text: "Open chat",
            initial_page_name: "SupportChat",
            parameter_data: JSON.stringify({
              chatId,
              senderId: adminDocPath,
              receiverId: winnerDocPath,
              chatRef: `chats/${chatId}`,
            }),
            is_read: false,
            status: "",
            num_sent: 0,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    } catch (error) {
      logger.error(`[notifyWinnerOnFirstAdminMessage] Failed for chat ${chatId}:`, error);
    }
  }
);
