import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, toHttpsError } from "../services/functionGuards.js";
import {
  createDeleteCompetitionHandler,
  createSaveCompetitionHandler,
} from "../services/competitionMutationService.js";

const saveCompetition = createSaveCompetitionHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
});

const deleteCompetition = createDeleteCompetitionHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
});

export const saveAdminCompetition = onCall(async (request) => {
  try {
    return await saveCompetition(request);
  } catch (error) {
    logger.error("[saveAdminCompetition] Error:", error);
    throw toHttpsError(error, "Failed to save competition.");
  }
});

export const deleteAdminCompetition = onCall(async (request) => {
  try {
    return await deleteCompetition(request);
  } catch (error) {
    logger.error("[deleteAdminCompetition] Error:", error);
    throw toHttpsError(error, "Failed to delete competition.");
  }
});
