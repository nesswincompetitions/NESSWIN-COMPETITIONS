import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { runOrderTransaction } from "../services/orderTransactionService.js";
import { buildNotificationPayload } from "../services/orderNotificationService.js";
import Stripe from "stripe";

export const stripeWebhook = onRequest({ cors: true }, async (req, res) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    logger.error("[stripeWebhook] Stripe secret key is not configured.");
    return res.status(500).send("Server configuration error.");
  }

  const sig = req.headers["stripe-signature"];
  const stripe = new Stripe(stripeSecretKey);
  let event;

  try {
    // rawBody is attached by Firebase Functions as req.rawBody
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    logger.error(`[stripeWebhook] Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`[stripeWebhook] Received event type: ${event.type}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const paymentIntentId = session.payment_intent;

    if (!orderId) {
      logger.error("[stripeWebhook] Missing orderId in session metadata.");
      return res.status(400).send("Webhook handled, but missing orderId.");
    }

    try {
      const orderRef = db.collection("order").doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        logger.error(`[stripeWebhook] Order ${orderId} not found.`);
        return res.status(404).send("Order not found.");
      }

      const orderData = orderSnap.data();

      // Check if order is already paid or processed
      if (orderData.status === "paid") {
        logger.info(`[stripeWebhook] Order ${orderId} is already marked as paid.`);
        return res.status(200).send("Order already processed.");
      }

      if (orderData.status !== "pending") {
        logger.error(`[stripeWebhook] Order ${orderId} has invalid status: ${orderData.status}`);
        return res.status(400).send("Invalid order status.");
      }

      const uid = orderData.user_ref?.id;
      const competitionId = orderData.competition_id?.id;

      if (!uid || !competitionId) {
        logger.error(`[stripeWebhook] Order ${orderId} is missing user_ref or competition_id.`);
        return res.status(400).send("Invalid order document.");
      }

      logger.info(`[stripeWebhook] Fulfilling order ${orderId} for uid=${uid}`);

      // Call runOrderTransaction to complete the order and issue tickets
      const result = await runOrderTransaction(db, admin, {
        uid,
        competitionId,
        ticketQuantity: orderData.ticket_quantity,
        questionAnswer: orderData.question_answer || {},
        freeTicketsToUse: orderData.free_tickets_to_use || 0,
        referralsToBurn: orderData.referrals_to_burn || [],
        orderId: orderId,
      });

      // Update Stripe payment intent details in Firestore
      await orderRef.update({
        stripe_payment_intent_id: paymentIntentId || "",
        stripe_status: "paid",
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
              pageName: "OrderHistory",
              parameterData: {
                orderRef: orderRef.path,
                competitionRef: competitionRef.path,
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

        await Promise.allSettled(writes);
      } catch (notifErr) {
        logger.warn("[stripeWebhook] Push notification orchestration failed (non-fatal):", notifErr.message);
      }

    } catch (err) {
      logger.error(`[stripeWebhook] Order fulfillment transaction failed for ${orderId}:`, err.message);
      return res.status(500).send(`Fulfillment Error: ${err.message}`);
    }
  }

  return res.status(200).send("Webhook event handled.");
});
