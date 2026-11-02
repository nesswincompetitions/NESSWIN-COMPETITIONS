import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import {
  AccountNotEligibleError,
  CheckoutValidationError,
  recordPaidUnfulfilledOrder,
  runOrderTransaction,
  validatePersistedCheckoutInputs,
} from "../services/orderTransactionService.js";
import { buildNotificationPayload } from "../services/orderNotificationService.js";
import {
  evaluateCheckoutSettlement,
  SettlementValidationError,
} from "../services/stripeSettlementService.js";
import { PAYMENT_SETTLEMENT } from "../services/ticketOrigin.js";
import { processAdditionalPaymentWebhookEvent } from "../services/additionalPaymentService.js";
import { processRefundWebhookEvent } from "../services/refundOrderService.js";
import Stripe from "stripe";

export function createStripeWebhookHandler({
  db,
  admin,
  logger,
  runOrderTransaction,
  buildNotificationPayload,
  evaluateCheckoutSettlement,
  SettlementValidationError,
  PAYMENT_SETTLEMENT,
  recordPaidUnfulfilledOrder: recordPaidUnfulfilled = recordPaidUnfulfilledOrder,
  stripeFactory = (key) => new Stripe(key),
  getStripeSecretKey = () => process.env.STRIPE_SECRET_KEY,
  getWebhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET,
}) {
  return async function handleStripeWebhook(req, res) {
  const stripeSecretKey = getStripeSecretKey();
  const webhookSecret = getWebhookSecret();

  if (!stripeSecretKey) {
    logger.error("[stripeWebhook] Stripe secret key is not configured.");
    return res.status(500).send("Server configuration error.");
  }

  const sig = req.headers["stripe-signature"];
  const stripe = stripeFactory(stripeSecretKey);
  let event;

  try {
    // rawBody is attached by Firebase Functions as req.rawBody
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    logger.error(`[stripeWebhook] Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`[stripeWebhook] Received event type: ${event.type}`);

  if (typeof event.type === "string" && event.type.startsWith("refund.")) {
    const outcome = await processRefundWebhookEvent({
      db,
      admin,
      logger,
      event,
      stripe,
    });
    if (outcome) {
      return res.status(outcome.statusCode).send(outcome.body);
    }
    return res.status(200).send("Refund event ignored.");
  }

  const additionalPaymentRequestId =
    event?.data?.object?.metadata?.additionalPaymentRequestId;
  if (additionalPaymentRequestId) {
    const outcome = await processAdditionalPaymentWebhookEvent({
      db,
      admin,
      logger,
      event,
    });
    if (outcome) {
      return res.status(outcome.statusCode).send(outcome.body);
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const notificationPageName = session.metadata?.notificationPageName || "OrderHistory";
    let decision = null;
    let transactionCompleted = false;

    if (!orderId) {
      logger.error("[stripeWebhook] Missing orderId in session metadata.");
      return res.status(400).send("Webhook handled, but missing orderId.");
    }

    const orderRef = db.collection("order").doc(orderId);

    try {
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        logger.error(`[stripeWebhook] Order ${orderId} not found.`);
        return res.status(404).send("Order not found.");
      }

      const orderData = orderSnap.data();

      try {
        decision = evaluateCheckoutSettlement({
          eventType: event.type,
          session,
          orderData,
        });
      } catch (validationError) {
        if (validationError instanceof SettlementValidationError) {
          logger.error(
            `[stripeWebhook] Settlement validation failed for order ${orderId}: ${validationError.code} — ${validationError.message}`
          );
          return res.status(validationError.statusCode).send(validationError.message);
        }
        throw validationError;
      }

      if (decision.action === "ignore") {
        return res.status(200).send("Webhook event ignored.");
      }

      if (decision.action === "pending") {
        logger.info(
          `[stripeWebhook] Order ${orderId} payment is still pending (${decision.reason || "unpaid"}).`
        );
        return res.status(200).send("Payment pending.");
      }

      if (decision.action === "already_processed") {
        const updates = {};
        if (
          decision.expectedStripeStatus &&
          orderData.stripe_status !== decision.expectedStripeStatus
        ) {
          updates.stripe_status = decision.expectedStripeStatus;
        }
        if (
          decision.paymentIntentId &&
          orderData.stripe_payment_intent_id !== decision.paymentIntentId
        ) {
          updates.stripe_payment_intent_id = decision.paymentIntentId;
        }
        if (Object.keys(updates).length > 0) {
          await orderRef.update({
            ...updates,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        logger.info(`[stripeWebhook] Order ${orderId} is already marked as paid.`);
        return res.status(200).send("Order already processed.");
      }

      const uid = orderData.user_ref?.id;
      const competitionId = orderData.competition_id?.id;

      if (!uid || !competitionId) {
        logger.error(`[stripeWebhook] Order ${orderId} is missing user_ref or competition_id.`);
        return res.status(400).send("Invalid order document.");
      }

      const checkoutInput = validatePersistedCheckoutInputs(orderData);

      logger.info(`[stripeWebhook] Fulfilling order ${orderId} for uid=${uid}`);

      const result = await runOrderTransaction(db, admin, {
        uid,
        competitionId,
        ticketQuantity: checkoutInput.ticketQuantity,
        questionAnswer: orderData.question_answer || {},
        freeTicketsToUse: checkoutInput.freeTicketsToUse,
        referralsToBurn: checkoutInput.referralIds.map((id) => ({ id })),
        orderId: orderId,
        paymentSettlement: decision.settlementContext,
      });
      transactionCompleted = true;

      await orderRef.update({
        stripe_payment_intent_id: decision.paymentIntentId || "",
        stripe_status:
          decision.settlement === PAYMENT_SETTLEMENT.STRIPE_PAID ? "paid" : "free",
        payment_status:
          decision.settlement === PAYMENT_SETTLEMENT.STRIPE_PAID ? "paid" : "not_required",
        fulfillment_status: "fulfilled",
        fulfillment_error: admin.firestore.FieldValue.delete(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`[stripeWebhook] ✅ Order ${orderId} fulfilled successfully!`);

      // Orchestrate Push Notifications (matching processOrder function)
      try {
        const userRef = db.collection("user").doc(uid);
        const competitionSnap = await db.collection("competition").doc(competitionId).get();
        const compTitle = competitionSnap.data()?.title || "Competition";
        const competitionRef = db.collection("competition").doc(competitionId);
        
        const writes = [];

        // 1) payment_success
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
              pageName: notificationPageName,
              parameterData: {
                orderRef: orderRef.path,
                competitionRef: competitionRef.path,
                compName: compTitle,
                quantity: result.tickets?.length || orderData.ticket_quantity || 1,
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
                pageName: notificationPageName,
                parameterData: {
                  orderRef: orderRef.path,
                  competitionRef: competitionRef.path,
                },
              })
            )
          );
        }

        await Promise.allSettled(writes);
      } catch (notifErr) {
        logger.warn("[stripeWebhook] Push notification orchestration failed (non-fatal):", notifErr.message);
      }

    } catch (err) {
      if (!transactionCompleted && decision?.action === "fulfill") {
        try {
          const recorded = await recordPaidUnfulfilled(db, admin, {
            orderId,
            checkoutSessionId: session?.id,
            paymentIntentId: decision.paymentIntentId,
            settlement: decision.settlement,
            failureReason: err?.message || "Ticket fulfillment failed.",
          });
          logger.warn(
            `[stripeWebhook] Recorded paid-unfulfilled order ${orderId}: ${recorded.outcome}`
          );
        } catch (recordError) {
          logger.error(
            `[stripeWebhook] Failed to record paid-unfulfilled order ${orderId}:`,
            recordError.message
          );
        }
      }

      if (err instanceof AccountNotEligibleError) {
        logger.error(
          `[stripeWebhook] Account not eligible for order ${orderId}:`,
          err.message
        );
        return res.status(400).send(`Account not eligible: ${err.message}`);
      }

      if (err instanceof CheckoutValidationError) {
        logger.error(
          `[stripeWebhook] Checkout validation failed for order ${orderId}:`,
          err.message
        );
        const statusCode = err.code === "invalid-argument" ? 400 : 500;
        return res.status(statusCode).send(`Checkout validation failed: ${err.message}`);
      }

      if (!transactionCompleted) {
        const freshOrder = await orderRef.get().catch(() => null);
        const freshData = freshOrder?.exists ? freshOrder.data() : null;
        if (freshData?.status === "paid") {
          if (
            decision?.action === "fulfill" &&
            freshData.stripe_status !== "paid" &&
            freshData.stripe_status !== "free"
          ) {
            try {
              await orderRef.update({
                stripe_payment_intent_id: decision.paymentIntentId || "",
                stripe_status:
                  decision.settlement === PAYMENT_SETTLEMENT.STRIPE_PAID ? "paid" : "free",
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
              });
            } catch (updateError) {
              logger.warn(
                `[stripeWebhook] Could not reconcile Stripe fields for already-paid order ${orderId}:`,
                updateError.message
              );
            }
          }
          logger.info(`[stripeWebhook] Order ${orderId} was completed concurrently.`);
          return res.status(200).send("Order already processed.");
        }
      }
      logger.error(`[stripeWebhook] Order fulfillment transaction failed for ${orderId}:`, err.message);
      return res.status(500).send(`Fulfillment Error: ${err.message}`);
    }
  }

  return res.status(200).send("Webhook event handled.");
  };
}

export const stripeWebhook = onRequest(
  { cors: true },
  createStripeWebhookHandler({
    db,
    admin,
    logger,
    runOrderTransaction,
    buildNotificationPayload,
    evaluateCheckoutSettlement,
    SettlementValidationError,
    PAYMENT_SETTLEMENT,
    recordPaidUnfulfilledOrder,
  })
);
