import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, toHttpsError } from "../services/functionGuards.js";

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