import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, toFirestoreTimestamp, toHttpsError } from "../services/functionGuards.js";

const MAX_QUESTION_BATCH_SIZE = 490;
const ALLOWED_PAST_DRAW_BUFFER_MS = 15 * 60 * 1000;

function validateCompetitionPayload(competitionData, questionsList, isDraft) {
  if (!competitionData || typeof competitionData !== "object") {
    throw new HttpsError("invalid-argument", "Malformed competition data received.");
  }

  if (!isDraft) {
    const requiredFields = ["title", "category", "ticket_price", "total_tickets", "draw_date"];
    for (const field of requiredFields) {
      if (competitionData[field] === undefined || competitionData[field] === null || competitionData[field] === "") {
        throw new HttpsError("invalid-argument", `Missing critical field: ${field}`);
      }
    }
  }

  const ticketPrice = Number(competitionData.ticket_price);
  const totalTickets = Number(competitionData.total_tickets);

  if (isDraft) {
    return {
      ticketPrice: Number.isFinite(ticketPrice) && ticketPrice > 0 ? ticketPrice : 0,
      totalTickets: Number.isFinite(totalTickets) && totalTickets > 0 ? totalTickets : 0,
    };
  }

  if (!Number.isFinite(ticketPrice) || ticketPrice < 0) {
    throw new HttpsError("invalid-argument", "Ticket price cannot be negative.");
  }

  if (!Number.isInteger(totalTickets) || totalTickets <= 0) {
    throw new HttpsError("invalid-argument", "Total tickets must be greater than zero.");
  }

  const drawDate = Number(competitionData.draw_date);
  if (Number.isFinite(drawDate) && drawDate < (Date.now() - ALLOWED_PAST_DRAW_BUFFER_MS)) {
    throw new HttpsError("invalid-argument", "Draw date must be set in the future.");
  }

  if (Array.isArray(questionsList)) {
    if (questionsList.length > MAX_QUESTION_BATCH_SIZE) {
      throw new HttpsError("out-of-range", `Too many questions. Maximum allowed is ${MAX_QUESTION_BATCH_SIZE}.`);
    }

    questionsList.forEach((question, index) => {
      if (!question?.question || !Array.isArray(question.option) || question.option.length < 2) {
        throw new HttpsError("invalid-argument", `Question ${index + 1} is invalid. It must contain text and at least 2 options.`);
      }
    });
  }

  return { ticketPrice, totalTickets };
}

export const createCompetition = onCall({ cors: true }, async (request) => {
  await assertAdmin(request);

  const { id, competitionData, questionsList, is_draft: isDraft } = request.data || {};
  const { ticketPrice, totalTickets } = validateCompetitionPayload(competitionData, questionsList, Boolean(isDraft));

  try {
    const batch = db.batch();
    const competitionRef = id
      ? db.collection("competition").doc(id)
      : db.collection("competition").doc();

    const existingDoc = id ? await competitionRef.get() : null;
    const existingData = existingDoc?.exists ? existingDoc.data() : null;

    if (id) {
      const existingQuestions = await db.collection("questions")
        .where("competition_id", "==", competitionRef)
        .get();

      existingQuestions.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
    }

    const competitionPayload = {
      ...competitionData,
      ticket_price: ticketPrice,
      total_tickets: totalTickets,
      stock_quantity: existingData?.stock_quantity ?? totalTickets,
      sold_tickets: existingData?.sold_tickets ?? 0,

      status: isDraft ? "draft" : (competitionData.status || "active"),
      participants: existingData?.participants ?? [],
      last_ticket_sequence: existingData?.last_ticket_sequence ?? 0,

      created_at: existingData?.created_at ?? admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      draw_date: toFirestoreTimestamp(admin, competitionData.draw_date),
      countdown_end: toFirestoreTimestamp(admin, competitionData.countdown_end),
    };

    batch.set(competitionRef, competitionPayload, { merge: true });

    if (Array.isArray(questionsList)) {
      questionsList.forEach((q) => {
        const questionRef = db.collection("questions").doc();

        batch.set(questionRef, {
          ...q,
          competition_id: competitionRef,
          question_id: questionRef.id,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    }

    await batch.commit();

    return {
      success: true,
      message: id ? "Competition updated successfully!" : "Competition created securely!",
      competitionId: competitionRef.id,
    };
  } catch (error) {
    console.error("Critical error creating competition:", error);
    throw toHttpsError(error, "Failed to create competition in database.");
  }
});

export const softDeleteCompetition = onCall({ cors: true }, async (request) => {
  await assertAdmin(request);

  const { id } = request.data || {};
  if (!id) {
    throw new HttpsError("invalid-argument", "Missing competition ID.");
  }

  try {
    await db.collection("competition").doc(id).update({
      status: "deleted",
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: "Competition deleted successfully." };
  } catch (error) {
    console.error("Error soft deleting competition:", error);
    throw toHttpsError(error, "Failed to delete competition.");
  }
});