import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, assertAuthenticated, toHttpsError } from "../services/functionGuards.js";
import {
  createAdditionalPaymentRequestHandler as buildCreateAdditionalPaymentRequestHandler,
  createGetAdditionalPaymentCheckoutUrlHandler as buildGetAdditionalPaymentCheckoutUrlHandler,
  createGetMyAdditionalPaymentRequestsHandler as buildGetMyAdditionalPaymentRequestsHandler,
  createListAdditionalPaymentRequestsHandler as buildListAdditionalPaymentRequestsHandler,
} from "../services/additionalPaymentService.js";

const handleCreateAdditionalPaymentRequest = buildCreateAdditionalPaymentRequestHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
});

const handleListAdditionalPaymentRequests = buildListAdditionalPaymentRequestsHandler({
  db,
  assertAdmin,
  HttpsError,
});

const handleGetMyAdditionalPaymentRequests = buildGetMyAdditionalPaymentRequestsHandler({
  db,
  assertAuthenticated,
});

const handleGetAdditionalPaymentCheckoutUrl = buildGetAdditionalPaymentCheckoutUrlHandler({
  db,
  admin,
  logger,
  assertAuthenticated,
  HttpsError,
});

export const createAdditionalPaymentRequest = onCall(async (request) => {
  try {
    return await handleCreateAdditionalPaymentRequest(request);
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      logger.error("[createAdditionalPaymentRequest] Error:", error);
    }
    throw toHttpsError(error, "Failed to create additional payment request.");
  }
});

export const listAdditionalPaymentRequests = onCall(async (request) => {
  try {
    return await handleListAdditionalPaymentRequests(request);
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      logger.error("[listAdditionalPaymentRequests] Error:", error);
    }
    throw toHttpsError(error, "Failed to load additional payment requests.");
  }
});

export const getMyAdditionalPaymentRequests = onCall(async (request) => {
  try {
    return await handleGetMyAdditionalPaymentRequests(request);
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      logger.error("[getMyAdditionalPaymentRequests] Error:", error);
    }
    throw toHttpsError(error, "Failed to load payment requests.");
  }
});

export const getAdditionalPaymentCheckoutUrl = onCall(async (request) => {
  try {
    return await handleGetAdditionalPaymentCheckoutUrl(request);
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      logger.error("[getAdditionalPaymentCheckoutUrl] Error:", error);
    }
    throw toHttpsError(error, "Failed to retrieve the payment link.");
  }
});
