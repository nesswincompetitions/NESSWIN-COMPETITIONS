import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../config/firebaseAdmin.js";

export function assertAuthenticated(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  return request.auth.uid;
}

export async function assertAdmin(request) {
  const uid = assertAuthenticated(request);
  const userSnap = await db.collection("user").doc(uid).get();

  if (!userSnap.exists || userSnap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can perform this action.");
  }

  return uid;
}

export function toHttpsError(error, fallbackMessage = "An internal error occurred.") {
  if (error instanceof HttpsError) {
    return error;
  }

  // Preserve the message if it's a standard Error
  const message = error?.message || fallbackMessage;
  // logger.error("[toHttpsError] Original error:", error); // logger not imported here

  return new HttpsError("internal", message);
}

export function toFirestoreTimestamp(admin, value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const millis = Number(value);
  if (!Number.isFinite(millis)) {
    throw new HttpsError("invalid-argument", "Invalid timestamp value.");
  }

  return admin.firestore.Timestamp.fromMillis(millis);
}
