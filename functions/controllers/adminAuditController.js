import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db } from "../config/firebaseAdmin.js";
import { assertAdmin, toHttpsError } from "../services/functionGuards.js";
import { createListAdminAuditEventsHandler } from "../services/adminAuditService.js";

const listAdminAuditEventsHandler = createListAdminAuditEventsHandler({
  db,
  assertAdmin,
  HttpsError,
});

export const listAdminAuditEvents = onCall(async (request) => {
  try {
    return await listAdminAuditEventsHandler(request);
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      logger.error("[listAdminAuditEvents] Error:", error);
    }
    throw toHttpsError(error, "Failed to load audit events.");
  }
});
