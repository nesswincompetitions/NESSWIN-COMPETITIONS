import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAuthenticated, toHttpsError } from "../services/functionGuards.js";
import { runOrderTransaction } from "../services/orderTransactionService.js";
import { buildNotificationPayload } from "../services/orderNotificationService.js";
import { getOrderPricing } from "../services/orderPricingService.js";
import Stripe from "stripe";
import { CloudTasksClient } from "@google-cloud/tasks";

const tasksClient = new CloudTasksClient();

// ─── Constants ────────────────────────────────────────────────────────────────
const REGION = "us-central1";
const QUEUE_NAME = "order-notification-queue";
const DELAY_MINUTES = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProjectId() {
  return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || admin.app().options.projectId;
}

function getQueuePath() {
  return `projects/${getProjectId()}/locations/${REGION}/queues/${QUEUE_NAME}`;
}

function getWorkerUrl() {
  return `https://${REGION}-${getProjectId()}.cloudfunctions.net/paymentPendingWorker`;
}

async function getServiceAccountEmail() {
  return `${getProjectId()}@appspot.gserviceaccount.com`;
}

/**
 * Schedules a Cloud Task to check for abandoned cart (payment_pending).
 */
async function schedulePaymentPendingTask(orderId, userId) {
  const queuePath = getQueuePath();
  const workerUrl = getWorkerUrl();
  const serviceAccountEmail = await getServiceAccountEmail();

  const scheduleTime = Math.floor(Date.now() / 1000) + (DELAY_MINUTES * 60);

  const payload = { orderId, userId };
  const body = Buffer.from(JSON.stringify({ data: payload })).toString("base64");

  try {
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        scheduleTime: { seconds: scheduleTime },
        httpRequest: {
          httpMethod: "POST",
          url: workerUrl,
          headers: { "Content-Type": "application/json" },
          oidcToken: { serviceAccountEmail },
          body: body,
        },
      },
    });
    logger.info(`[schedulePaymentPendingTask] Scheduled task for order=${orderId} in ${DELAY_MINUTES}m`);
  } catch (error) {
    logger.error(`[schedulePaymentPendingTask] Failed to schedule task for order=${orderId}:`, error.message);
  }
}

// ─── processOrder ─────────────────────────────────────────────────────────────

/**
 * Callable: processOrder
 *
 * Handles the complete ticket purchase flow atomically.
 * All critical Firestore writes (order, tickets, free_ticket_log) happen
 * server-side so Security Rules can fully lock down those collections.
 *
 * Expected payload:
 * {
 *   competitionId:    string,
 *   ticketQuantity:   number,   // Paid tickets
 *   questionAnswer:   object,   // Embedded question_answer Map
 *   freeTicketsToUse: number,   // Referral tickets to redeem (optional, default 0)
 *   referralsToBurn:  Array<{ id: string }>,  // Referral doc IDs (optional)
 * }
 *
 * Returns:
 * {
 *   orderId:    string,
 *   tickets:    Array<{ ticketId, ticketNumber, ticketSequence }>,
 *   totalAmount: number,
 *   packType:   string,
 *   freeTickets: number,
 * }
 */

/**
 * Callable: initiateOrder
 * Creates a "pending" order document and schedules a Cloud Task for abandoned cart notification.
 */
export const initiateOrder = onCall(async (request) => {
  const uid = assertAuthenticated(request);
  const { competitionId } = request.data;

  if (!competitionId) {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }

  try {
    const orderRef = db.collection("order").doc();
    const userRef = db.collection("user").doc(uid);
    const competitionRef = db.collection("competition").doc(competitionId);

    // Basic pending doc
    await orderRef.set({
      user_ref: userRef,
      competition_id: competitionRef,
      status: "pending",
      total_amount: 0, // Placeholder until processed
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Schedule Sniper Task
    await schedulePaymentPendingTask(orderRef.id, uid);

    return { orderId: orderRef.id };
  } catch (err) {
    logger.error("[initiateOrder] Error:", err.message);
    throw toHttpsError(err, "Failed to initiate order.");
  }
});

export const processOrder = onCall(async (request) => {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const uid = assertAuthenticated(request);

  const {
    competitionId,
    ticketQuantity,
    questionAnswer,
    freeTicketsToUse = 0,
    referralsToBurn = [],
    orderId = null, // Optional: if coming from initiateOrder
  } = request.data;

  // ── Input validation ────────────────────────────────────────────────────────
  if (!competitionId || typeof competitionId !== "string") {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }

  const qty = Number(ticketQuantity);
  const freeUse = Number(freeTicketsToUse) || 0;
  const referralsArr = Array.isArray(referralsToBurn) ? referralsToBurn : [];

  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) {
    throw new HttpsError("invalid-argument", "ticketQuantity must be a non-negative integer.");
  }

  // Allow zero paid tickets only when the user is redeeming free/referral tickets
  if (qty === 0 && freeUse === 0 && referralsArr.length === 0) {
    throw new HttpsError("invalid-argument", "At least one ticket must be requested (paid or free).");
  }
  if (qty > 100) {
    throw new HttpsError("invalid-argument", "Maximum 100 tickets per order.");
  }

  logger.info(`[processOrder] uid=${uid} competition=${competitionId} qty=${qty} referrals=${referralsToBurn?.length || 0}`);

  try {
    // ── Run atomic transaction ─────────────────────────────────────────────────
    const result = await runOrderTransaction(db, admin, {
      uid,
      competitionId,
      ticketQuantity: qty,
      questionAnswer,
      freeTicketsToUse: Number(freeTicketsToUse) || 0,
      referralsToBurn: Array.isArray(referralsToBurn) ? referralsToBurn : [],
      orderId, // Pass through if exists
    });

    logger.info(`[processOrder] ✅ Order ${result.orderId} created — ${result.tickets.length} tickets`);

    // ── Non-blocking push notifications ───────────────────────────────────────
    // Fire-and-forget — notification failures must never roll back the order.
    try {
      const userRef = db.collection("user").doc(uid);
      const competitionSnap = await db.collection("competition").doc(competitionId).get();
      const compTitle = competitionSnap.data()?.title || "Competition";
      const orderRef = db.collection("order").doc(result.orderId);
      const competitionRef = db.collection("competition").doc(competitionId);

      const writes = [];

      // 1) payment_success (Order confirmed)
      const totalAllocated = result.tickets.length;
      writes.push(
        db.collection("ff_user_push_notifications").add(
          buildNotificationPayload({
            type: "payment_success",
            title: "Payment Successful 🎟️",
            text: `Your payment was successful and your entry for ${compTitle} is confirmed.`,
            userRefs: userRef.path,
            orderRef: orderRef,
            competitionRef: competitionRef,
            senderRef: userRef,
            ctaText: "View Tickets",
            pageName: "OrderHistory",
            parameterData: {
              orderRef: orderRef.path,
              competitionRef: competitionRef.path,
              compName: compTitle,
              quantity: totalAllocated,
            },
          })
        )
      );

      // 2) referral_reward_used
      if (typeof result.referralTicketsUsed === "number" && result.referralTicketsUsed > 0) {
        writes.push(
          db.collection("ff_user_push_notifications").add(
            buildNotificationPayload({
              type: "referral_reward_used",
              title: "Referral Discount Applied",
              text: `You successfully checked out using ${result.referralTicketsUsed} referral ticket${result.referralTicketsUsed > 1 ? "s" : ""}.`,
              userRefs: userRef.path,
              orderRef: orderRef,
              competitionRef: competitionRef,
              senderRef: userRef,
              pageName: "Reffral",
              parameterData: {
                orderRef: orderRef.path,
                competitionRef: competitionRef.path,
              },
            })
          )
        );
      }

      // 3) bonus_tickets_added
      if (typeof result.packBonusTickets === "number" && result.packBonusTickets > 0) {
        writes.push(
          db.collection("ff_user_push_notifications").add(
            buildNotificationPayload({
              type: "bonus_tickets_added",
              title: "Bonus Tickets Added",
              text: `You received ${result.packBonusTickets} bonus ticket${result.packBonusTickets > 1 ? "s" : ""} with your bundle!`,
              userRefs: userRef.path,
              orderRef: orderRef,
              competitionRef: competitionRef,
              senderRef: userRef,
              pageName: "OrderHistory",
              parameterData: {
                orderRef: orderRef.path,
                competitionRef: competitionRef.path,
              },
            })
          )
        );
      }

      // Await all writes but don't let failures roll back order — log if any fail.
      const settled = await Promise.allSettled(writes);
      settled.forEach((s) => {
        if (s.status === "rejected") {
          logger.warn("[processOrder] Notification write failed (non-fatal):", s.reason?.message || s.reason);
        }
      });
    } catch (notifErr) {
      logger.warn("[processOrder] Notification orchestration failed (non-fatal):", notifErr.message || notifErr);
    }

    return result;
  } catch (err) {
    logger.error("[processOrder] Error:", err.message);
    throw toHttpsError(err, "Order processing failed. Please try again.");
  }
});

export const createStripeCheckoutSession = onCall(async (request) => {
  const uid = assertAuthenticated(request);
  const {
    competitionId,
    ticketQuantity,
    questionAnswer,
    freeTicketsToUse = 0,
    referralsToBurn = [],
    origin,
    success_url,
    cancel_url,
    success_path,
    cancel_path,
    notification_page_name,
  } = request.data;

  if (!competitionId || typeof competitionId !== "string") {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }
  if ((!origin || typeof origin !== "string") && (!success_url || !cancel_url)) {
    throw new HttpsError("invalid-argument", "origin is required unless both success_url and cancel_url are provided.");
  }

  const qty = Number(ticketQuantity);
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError("invalid-argument", "ticketQuantity must be a positive integer.");
  }
  if (qty > 100) {
    throw new HttpsError("invalid-argument", "Maximum 100 tickets per order.");
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new HttpsError("failed-precondition", "Stripe secret key is not configured on the server.");
  }

  try {
    const competitionRef = db.collection("competition").doc(competitionId);
    const compSnap = await competitionRef.get();
    if (!compSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }
    const compData = compSnap.data();
    if (compData.status !== "active") {
      throw new HttpsError("failed-precondition", "Competition is not active.");
    }

    const ticketPrice = Number(compData.ticket_price || 0);
    const { discount } = getOrderPricing(qty);
    const subtotal = qty * ticketPrice;
    const discountAmount = subtotal * discount;
    const totalAmount = subtotal - discountAmount;

    if (totalAmount <= 0) {
      throw new HttpsError("invalid-argument", "This session requires payment. Use processOrder for free purchases.");
    }

    const orderRef = db.collection("order").doc();
    const userRef = db.collection("user").doc(uid);

    // Save pending order with all checkout details
    await orderRef.set({
      user_ref: userRef,
      competition_id: competitionRef,
      status: "pending",
      ticket_quantity: qty,
      free_tickets_to_use: Number(freeTicketsToUse) || 0,
      referrals_to_burn: Array.isArray(referralsToBurn) ? referralsToBurn : [],
      question_answer: questionAnswer || {},
      total_amount: totalAmount,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Schedule Sniper Cloud Task for abandoned cart notifications
    await schedulePaymentPendingTask(orderRef.id, uid);

    let successUrlFinal = success_url;
    if (!successUrlFinal) {
      const path = success_path || "/profile/tickets";
      successUrlFinal = `${origin}${path}`;
    }
    const sep1 = successUrlFinal.includes("?") ? "&" : "?";
    successUrlFinal = `${successUrlFinal}${sep1}success=true&order_id=${orderRef.id}`;

    let cancelUrlFinal = cancel_url;
    if (!cancelUrlFinal) {
      const path = cancel_path || `/competitions/${competitionId}`;
      cancelUrlFinal = `${origin}${path}`;
    }
    const sep2 = cancelUrlFinal.includes("?") ? "&" : "?";
    cancelUrlFinal = `${cancelUrlFinal}${sep2}cancel=true`;

    // Stripe checkout success_url and cancel_url must start with http:// or https://
    // If they are custom schemes, wrap them in our paymentRedirect Cloud Function endpoint
    const isCustomScheme = (url) => url && !url.startsWith("http://") && !url.startsWith("https://");

    if (isCustomScheme(successUrlFinal)) {
      const redirectBase = `https://${REGION}-${getProjectId()}.cloudfunctions.net/paymentRedirect`;
      successUrlFinal = `${redirectBase}?redirect_url=${encodeURIComponent(successUrlFinal)}`;
    }

    if (isCustomScheme(cancelUrlFinal)) {
      const redirectBase = `https://${REGION}-${getProjectId()}.cloudfunctions.net/paymentRedirect`;
      cancelUrlFinal = `${redirectBase}?redirect_url=${encodeURIComponent(cancelUrlFinal)}`;
    }

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${compData.title || "Competition Entry"} - Nesswin`,
              images: compData.image && compData.image.length > 0 ? [compData.image[0]] : [],
            },
            unit_amount: Math.round(totalAmount * 100), // in cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrlFinal,
      cancel_url: cancelUrlFinal,
      metadata: {
        orderId: orderRef.id,
        notificationPageName: notification_page_name || "OrderHistory",
      },
    });

    // Update the pending order with stripe details
    await orderRef.update({
      stripe_checkout_session_id: session.id,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { sessionUrl: session.url };
  } catch (err) {
    logger.error("[createStripeCheckoutSession] Error:", err.message);
    throw toHttpsError(err, "Failed to create Stripe checkout session.");
  }
});

export const paymentRedirect = onRequest({ cors: true }, (req, res) => {
  const { redirect_url } = req.query;
  if (!redirect_url || typeof redirect_url !== "string") {
    res.status(400).send("Missing redirect_url query parameter.");
    return;
  }
  logger.info(`[paymentRedirect] Redirecting to: ${redirect_url}`);
  res.redirect(302, redirect_url);
});
