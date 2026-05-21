import { HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";

const HANDOOVER_KEYS = [
  "id_proof_url",
  "handover_video_url",
  "is_contacted",
  "prize_sent",
  "handover_completed",
  "chat_ref",
];

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function buildWinnerChatId(competitionId) {
  return `winner-chat-${normalizeText(competitionId)}`;
}

export function buildWinnerNotificationId(competitionId) {
  return `winner-congrats-${normalizeText(competitionId)}`;
}

export function buildBroadcastNotificationId(competitionId) {
  return `winner-result-${normalizeText(competitionId)}`;
}

export function buildCompletedBroadcastNotificationId(competitionId) {
  return `winner-completed-${normalizeText(competitionId)}`;
}

export function buildWinnerFirstMessageNotificationId(chatId) {
  return `winner-chat-first-message-${normalizeText(chatId)}`;
}

export function buildHandoverDefaults(existingDetails = {}) {
  const base = {
    id_proof_url: "",
    handover_video_url: "",
    is_contacted: false,
    prize_sent: false,
    handover_completed: false,
  };

  return HANDOOVER_KEYS.reduce((accumulator, key) => {
    if (Object.prototype.hasOwnProperty.call(existingDetails, key) && existingDetails[key] !== undefined) {
      accumulator[key] = existingDetails[key];
    }

    return accumulator;
  }, base);
}

function toDocumentRef(value, fallbackCollection) {
  if (!value) {
    return null;
  }

  if (typeof value.path === "string" && typeof value.id === "string") {
    return value;
  }

  if (typeof value === "string") {
    return db.collection(fallbackCollection).doc(value);
  }

  return null;
}

function extractWinnerAndOrderRefs(ticketData) {
  const winnerRef =
    toDocumentRef(ticketData.user_id, "user") ||
    toDocumentRef(ticketData.user_ref, "user") ||
    toDocumentRef(ticketData.user, "user");

  const orderRef =
    toDocumentRef(ticketData.order_id, "order") ||
    toDocumentRef(ticketData.order_ref, "order");

  return { winnerRef, orderRef };
}

export async function selectWinnerTransaction(
  transaction,
  { competitionRef, competitionId, ticketSequence, adminRef }
) {
  const normalizedTicketSequence = normalizeText(ticketSequence).toUpperCase();

  if (!normalizedTicketSequence) {
    throw new HttpsError("invalid-argument", "ticketSequence is required.");
  }

  const competitionSnap = await transaction.get(competitionRef);

  if (!competitionSnap.exists) {
    throw new HttpsError("not-found", "Competition not found.");
  }

  const competitionData = competitionSnap.data();
  const currentStatus = normalizeStatus(competitionData.status);

  if (competitionData.winner_ref) {
    throw new HttpsError("failed-precondition", "A winner has already been selected for this competition.");
  }

  if (currentStatus !== "drawing") {
    throw new HttpsError("failed-precondition", "Start the live draw before selecting a winner.");
  }

  const ticketsQuery = db
    .collection("ticket")
    .where("competition_id", "==", competitionRef)
    .where("ticket_sequence", "==", normalizedTicketSequence)
    .limit(2);

  const querySnap = await ticketsQuery.get();

  if (querySnap.empty) {
    throw new HttpsError("not-found", "No ticket matches that sequence in this competition.");
  }

  if (querySnap.docs.length > 1) {
    throw new HttpsError("failed-precondition", "Multiple tickets matched the provided sequence. Data integrity check failed.");
  }

  const ticketRef = querySnap.docs[0].ref;
  const ticketSnap = await transaction.get(ticketRef);
  const ticketData = ticketSnap.data();

  if (normalizeStatus(ticketData.status) === "invalid") {
    throw new HttpsError("failed-precondition", "The selected ticket is invalid and cannot be selected as a winner.");
  }

  const { winnerRef, orderRef } = extractWinnerAndOrderRefs(ticketData);

  if (!winnerRef) {
    throw new HttpsError("failed-precondition", "The winning ticket does not have a valid user reference.");
  }

  if (!orderRef) {
    throw new HttpsError("failed-precondition", "The winning ticket does not have a valid order reference.");
  }

  const orderSnap = await transaction.get(orderRef);

  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "The winner's order was not found.");
  }

  if (normalizeStatus(orderSnap.data()?.status) !== "paid") {
    throw new HttpsError("failed-precondition", "The winner's order must be paid before confirming the result.");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const chatRef = db.collection("chats").doc(); // Clean auto-generated ID!
  const winnerNotificationRef = db.collection("ff_user_push_notifications").doc(buildWinnerNotificationId(competitionId));
  const broadcastNotificationRef = db.collection("ff_push_notifications").doc(buildBroadcastNotificationId(competitionId));

  transaction.update(competitionRef, {
    status: "winner_announced",
    winner_ticket_ref: ticketRef,
    winner_ref: winnerRef,
    handover_details: {
      ...buildHandoverDefaults(),
      chat_ref: chatRef, // Store the reference to the clean auto-generated chat!
    },
    updated_at: now,
  });

  transaction.update(ticketRef, {
    is_winner: true,
    status: "winner",
    updated_at: now,
  });

  transaction.update(orderRef, {
    is_winner: true,
    updated_at: now,
  });

  transaction.set(
    chatRef,
    {
      competition_ref: competitionRef,
      chat_type: "winner_chat",
      participants: [adminRef, winnerRef],
      status: "active",
      sender_id: adminRef,
      receiver_id: winnerRef,
      assigned_admin_id: adminRef,
      unread_sender_count: 0,
      unread_receiver_count: 0,
      last_message: "",
      created_at: now,
      last_message_time: now,
      updated_at: now,
      winner_first_admin_message_notified: false,
    },
    { merge: true }
  );

  transaction.set(
    winnerNotificationRef,
    {
      notification_title: "Congratulations, you won!",
      notification_text: "Your entry has been selected as the winner.",
      notification_image_url: competitionData.image?.[0] || "",
      scheduled_time: null,
      notification_sound: "default",
      user_ref: winnerRef,
      user_refs: winnerRef.path,
      sender: adminRef,
      competition_ref: competitionRef,
      order_ref: orderRef,
      chat_ref: chatRef,
      category: "winners",
      type: "congratulations_you_won",
      cta_text: "View prize",
      initial_page_name: "PrizeHandoverDetails",
      parameter_data: JSON.stringify({ competionref: competitionRef.path }),
      is_read: false,
      status: "",
      num_sent: 0,
      timestamp: now,
      created_at: now,
    },
    { merge: true }
  );

  transaction.set(
    broadcastNotificationRef,
    {
      notification_title: "Winner announced",
      notification_text: "The competition winner has been published.",
      notification_image_url: competitionData.image?.[0] || "",
      scheduled_time: null,
      notification_sound: "default",
      parameter_data: JSON.stringify({ compitationRef: competitionRef.path }),
      target_audience: "all_users",
      initial_page_name: "participants",
      user_refs: "",
      batch_index: 0,
      num_batches: 1,
      status: "",
      num_sent: 0,
    },
    { merge: true }
  );

  return {
    competitionId,
    winnerTicketId: ticketRef.id,
    winnerUserId: winnerRef.id,
    winnerTicketSequence: normalizedTicketSequence,
    chatId: chatRef.id,
  };
}

export async function updateWinnerHandoverTransaction(
  transaction,
  { competitionRef, competitionId, adminRef, stage, idProofUrl, handoverPhotoUrl, handoverVideoUrl }
) {
  const competitionSnap = await transaction.get(competitionRef);

  if (!competitionSnap.exists) {
    throw new HttpsError("not-found", "Competition not found.");
  }

  const competitionData = competitionSnap.data();
  const currentStatus = normalizeStatus(competitionData.status);
  const handoverDetails = buildHandoverDefaults(competitionData.handover_details || {});

  if (!competitionData.winner_ref) {
    throw new HttpsError("failed-precondition", "A winner must be selected before updating handover details.");
  }

  if (currentStatus !== "winner_announced" && currentStatus !== "completed") {
    throw new HttpsError("failed-precondition", "Handover updates are only allowed after a winner is announced.");
  }

  const chatRef = competitionData.handover_details?.chat_ref || db.collection("chats").doc(buildWinnerChatId(competitionId));
  const chatSnap = await transaction.get(chatRef);

  if (!chatSnap.exists) {
    throw new HttpsError("not-found", "Winner chat not found.");
  }

  if (chatSnap.data()?.chat_type !== "winner_chat") {
    throw new HttpsError("failed-precondition", "This chat is not a winner handover chat.");
  }

  if (currentStatus === "completed" && stage !== "completed") {
    throw new HttpsError("failed-precondition", "This winner handover has already been completed.");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const updateData = {
    updated_at: now,
  };

  if (typeof idProofUrl === "string" && idProofUrl.trim()) {
    updateData["handover_details.id_proof_url"] = idProofUrl.trim();
  }

  if (typeof handoverPhotoUrl === "string" && handoverPhotoUrl.trim()) {
    updateData["handover_details.handover_photo_url"] = handoverPhotoUrl.trim();
  }

  if (typeof handoverVideoUrl === "string" && handoverVideoUrl.trim()) {
    updateData["handover_details.handover_video_url"] = handoverVideoUrl.trim();
  }

  if (stage) {
    if (stage === "contacted") {
      if (handoverDetails.is_contacted !== true) {
        updateData["handover_details.is_contacted"] = true;
      }
    } else if (stage === "prize_sent") {
      const currentIdProof = idProofUrl || handoverDetails.id_proof_url;
      if (!currentIdProof || !currentIdProof.trim()) {
        throw new HttpsError("failed-precondition", "Winner ID Proof is required before marking the prize as sent.");
      }
      if (handoverDetails.prize_sent !== true) {
        updateData["handover_details.prize_sent"] = true;
      }
    } else if (stage === "completed") {
      // Enforce ID Proof and Video before completion
      const currentIdProof = idProofUrl || handoverDetails.id_proof_url;
      const currentVideo = handoverVideoUrl || handoverDetails.handover_video_url;

      if (!currentIdProof || !currentIdProof.trim()) {
        throw new HttpsError("failed-precondition", "Winner ID Proof is required before completing the handover.");
      }
      if (!currentVideo || !currentVideo.trim()) {
        throw new HttpsError("failed-precondition", "Handover Video is required before completing the handover.");
      }

      if (handoverDetails.handover_completed === true || currentStatus === "completed") {
        transaction.update(competitionRef, {
          updated_at: now,
          status: "completed",
          "handover_details.handover_completed": true,
        });

        transaction.set(
          chatRef,
          {
            status: "closed",
            closed_by: adminRef,
            closed_at: now,
            updated_at: now,
          },
          { merge: true }
        );

        transaction.set(
          db.collection("ff_push_notifications").doc(buildCompletedBroadcastNotificationId(competitionId)),
          {
            notification_title: "Prize Handed Over!",
            notification_text: `The prize for ${competitionData.title || "the competition"} has been successfully handed over.`,
            notification_image_url: competitionData.image?.[0] || "",
            scheduled_time: null,
            notification_sound: "default",
            parameter_data: JSON.stringify({ competitionref: competitionRef.path }),
            target_audience: "all_users",
            initial_page_name: "drawComplated",
            user_refs: "",
            batch_index: 0,
            num_batches: 1,
            status: "",
            num_sent: 0,
          },
          { merge: true }
        );

        return { status: "completed", completed: true };
      }

      updateData["handover_details.handover_completed"] = true;
      updateData.status = "completed";

      transaction.set(
        db.collection("ff_push_notifications").doc(buildCompletedBroadcastNotificationId(competitionId)),
        {
          notification_title: "Prize Handed Over!",
          notification_text: `The prize for ${competitionData.title || "the competition"} has been successfully handed over.`,
          notification_image_url: competitionData.image?.[0] || "",
          scheduled_time: null,
          notification_sound: "default",
          parameter_data: JSON.stringify({ competitionref: competitionRef.path }),
          target_audience: "all_users",
          initial_page_name: "drawComplated",
          user_refs: "",
          batch_index: 0,
          num_batches: 1,
          status: "",
          num_sent: 0,
        },
        { merge: true }
      );

      transaction.set(
        chatRef,
        {
          status: "closed",
          closed_by: adminRef,
          closed_at: now,
          updated_at: now,
        },
        { merge: true }
      );
    } else if (stage !== "none") {
      throw new HttpsError("invalid-argument", "Invalid handover stage.");
    }
  }

  transaction.update(competitionRef, updateData);

  return {
    status: updateData.status || currentStatus,
    contacted: updateData["handover_details.is_contacted"] === true,
    prizeSent: updateData["handover_details.prize_sent"] === true,
    completed: updateData["handover_details.handover_completed"] === true,
  };
}
