import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";
import { createSoftDeleteUserHandler } from "../services/userDeletionService.js";

export const softDeleteUser = onCall(
  createSoftDeleteUserHandler({ db, admin, HttpsError })
);
