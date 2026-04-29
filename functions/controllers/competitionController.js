import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";

export const createCompetition = onCall(async (request) => {
  // EDGE CASE 1: Authentication & Authorization
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to do this.");
  }

  const userDoc = await db.collection("user").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can create competitions.");
  }

  const { id, competitionData, questionsList, is_draft } = request.data;

  // EDGE CASE 2: Malformed Payload
  if (!competitionData || typeof competitionData !== 'object') {
    throw new HttpsError("invalid-argument", "Malformed competition data received.");
  }

  // EDGE CASE 3: Missing Critical Business Fields
  if (!is_draft) {
    const requiredFields = ['title', 'category', 'ticket_price', 'total_tickets', 'draw_date'];
    for (const field of requiredFields) {
      if (competitionData[field] === undefined || competitionData[field] === null || competitionData[field] === '') {
        throw new HttpsError("invalid-argument", `Missing critical field: ${field}`);
      }
    }
  }

  // EDGE CASE 4: Logical Constraints (No negative money or stock)
  let ticketPrice = 0;
  let totalTickets = 0;

  if (!is_draft) {
    ticketPrice = Number(competitionData.ticket_price);
    totalTickets = Number(competitionData.total_tickets);

    if (isNaN(ticketPrice) || ticketPrice < 0) {
      throw new HttpsError("invalid-argument", "Ticket price cannot be negative.");
    }
    if (isNaN(totalTickets) || totalTickets <= 0) {
      throw new HttpsError("invalid-argument", "Total tickets must be greater than zero.");
    }
  } else {
    // For drafts, we just take whatever is there, default to 0 if missing/invalid
    ticketPrice = Number(competitionData.ticket_price) || 0;
    totalTickets = Number(competitionData.total_tickets) || 0;
  }

  // EDGE CASE 5: Time Travel Prevention
  // Allow a 15-minute buffer for clock skew and timezone differences between browser and server.
  // Only reject if the draw date is more than 15 minutes in the PAST.
  const now = Date.now();
  const CLOCK_SKEW_BUFFER_MS = 15 * 60 * 1000; // 15 minutes
  if (!is_draft && competitionData.draw_date && competitionData.draw_date < (now - CLOCK_SKEW_BUFFER_MS)) {
    throw new HttpsError("invalid-argument", "Draw date must be set in the future.");
  }

  // EDGE CASE 6: Firestore Batch Limits (Max 500 writes per batch)
  // 1 write for competition + N writes for questions.
  if (!is_draft && questionsList && Array.isArray(questionsList)) {
    if (questionsList.length > 490) { // We leave a buffer of 10
      throw new HttpsError("out-of-range", "Too many questions. Maximum allowed is 490.");
    }

    // EDGE CASE 7: Question Integrity
    for (let i = 0; i < questionsList.length; i++) {
      const q = questionsList[i];
      if (!q.question || !q.option || !Array.isArray(q.option) || q.option.length < 2) {
        throw new HttpsError("invalid-argument", `Question ${i + 1} is invalid. It must have text and at least 2 options.`);
      }
    }
  }

  try {
    const batch = db.batch();
    let competitionRef;

    if (id) {
      competitionRef = db.collection("competition").doc(id);
      
      // Delete existing questions for this competition to avoid duplicates/orphans
      const existingQuestions = await db.collection("questions")
        .where("competition_id", "==", competitionRef)
        .get();
      
      existingQuestions.forEach(doc => {
        batch.delete(doc.ref);
      });
    } else {
      competitionRef = db.collection("competition").doc();
    }

    let competitionPayload = {
      ...competitionData,
      // Force strict types for math-dependent fields so React doesn't accidentally pass strings
      ticket_price: ticketPrice, 
      total_tickets: totalTickets,
      stock_quantity: totalTickets, // Stock starts identical to total
      sold_tickets: 0,
      
      status: is_draft ? "draft" : (competitionData.status || "draft"),
      participants: [],
      last_ticket_sequence: 0,
      
      // Timestamps
      created_at: id ? admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(), // Placeholder for logic
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      draw_date: competitionData.draw_date ? admin.firestore.Timestamp.fromMillis(competitionData.draw_date) : null,
      countdown_end: competitionData.countdown_end ? admin.firestore.Timestamp.fromMillis(competitionData.countdown_end) : null,
    };

    // If it's an update, we should preserve created_at and sold_tickets if they exist
    if (id) {
      const existingDoc = await competitionRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        competitionPayload.created_at = data.created_at || admin.firestore.FieldValue.serverTimestamp();
        competitionPayload.sold_tickets = data.sold_tickets || 0;
        competitionPayload.stock_quantity = data.stock_quantity !== undefined ? data.stock_quantity : totalTickets;
        competitionPayload.participants = data.participants || [];
        competitionPayload.last_ticket_sequence = data.last_ticket_sequence || 0;
      }
    }

    batch.set(competitionRef, competitionPayload, { merge: true });

    if (questionsList && Array.isArray(questionsList)) {
      questionsList.forEach((q) => {
        const questionRef = db.collection("questions").doc();
        
        const newQuestion = {
          ...q,
          competition_id: competitionRef, // Safely linking the DocumentReference
          question_id: questionRef.id,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        batch.set(questionRef, newQuestion);
      });
    }

    await batch.commit();

    return { 
      success: true, 
      message: id ? "Competition updated successfully!" : "Competition created securely!",
      competitionId: competitionRef.id 
    };

  } catch (error) {
    console.error("Critical error creating competition:", error);
    // Do not send detailed database errors to the frontend, send a generic one for security
    throw new HttpsError("internal", "Failed to create competition in database.");
  }
});