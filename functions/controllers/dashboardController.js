import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin } from "../services/functionGuards.js";

const DASHBOARD_DOC_PATH = "system_metrics/dashboard";
const DAILY_HISTORY_PATH = "system_metrics/dashboard/daily_history";
const EVENT_LOGS_PATH = "system_metrics/dashboard/event_logs";
const TIMEZONE = "Europe/Paris";
const ACTIVE_COMPETITION_STATUSES = new Set(["active", "ready_to_draw", "drawing"]);
const WINNER_COMPETITION_STATUSES = new Set(["winner_announced", "completed", "closed"]);

function getTodayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

async function updateDashboard(data) {
  const ref = db.doc(DASHBOARD_DOC_PATH);
  await ref.set({
    ...data,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function updateDailyHistory(dateStr, data) {
  const ref = db.collection(DAILY_HISTORY_PATH).doc(dateStr);
  await ref.set({
    ...data,
    date: dateStr,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

/**
 * Idempotency check to prevent double-counting due to Cloud Function retries.
 */
async function markEventProcessed(eventId) {
  if (!eventId) return false;
  const ref = db.collection(EVENT_LOGS_PATH).doc(eventId);
  
  try {
    await ref.create({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    return false;
  } catch (err) {
    if (err.code === 6 || err.message?.includes("ALREADY_EXISTS")) {
      return true;
    }
    throw err;
  }
}

async function runFullRecalculation() {
  logger.info("[DashboardMetrics] Starting full recalculation...");
  const todayStr = getTodayStr();
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const compSnap = await db.collection("competition").get();
  let totalActive = 0;
  let totalWinners = 0;
  let endingSoon = 0;

  compSnap.forEach(doc => {
    const data = doc.data();
    const status = (data.status || "").toLowerCase();
    const hasWinner = Boolean(data.winner_ref);
    
    if (ACTIVE_COMPETITION_STATUSES.has(status)) {
      totalActive++;
      const drawDate = data.draw_date?.toDate?.() || (data.draw_date ? new Date(data.draw_date) : null);
      if (drawDate && drawDate > now && drawDate <= sevenDaysFromNow) {
        endingSoon++;
      }
    }

    if (hasWinner || WINNER_COMPETITION_STATUSES.has(status)) {
      totalWinners++;
    }
  });

  const userSnap = await db.collection("user")
    .where("is_verified", "==", true)
    .count()
    .get();
  const registeredUsers = userSnap.data().count;

  // Keep total_revenue and total_tickets_sold from atomic increments (do NOT re-scan all orders)
  const dashboardRef = db.doc(DASHBOARD_DOC_PATH);
  const dashboardSnap = await dashboardRef.get();
  const currentDash = dashboardSnap.data() || {};
  const totalRevenue = currentDash.total_revenue || 0;
  const totalTicketsSold = currentDash.total_tickets_sold || 0;
  const totalOrders = currentDash.total_orders || 0;

  // Compute today's stats from daily_history subcollection (source of truth for "today")
  const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(todayStr);
  const dailySnap = await dailyRef.get();
  const ticketsSoldToday = dailySnap.exists ? Number(dailySnap.data().tickets_sold || 0) : 0;

  const openChatsSnap = await db.collection("chats")
    .where("chat_type", "in", ["support", "winner_chat"])
    .where("status", "==", "active")
    .count()
    .get();
  const openSupportChats = openChatsSnap.data().count;

  const closedChatsSnap = await db.collection("chats")
    .where("chat_type", "in", ["support", "winner_chat"])
    .where("status", "==", "closed")
    .count()
    .get();
  const closedSupportChats = closedChatsSnap.data().count;

  const dashboardData = {
    total_active_competitions: totalActive,
    tickets_sold_today: ticketsSoldToday,
    total_revenue: totalRevenue,
    total_tickets_sold: totalTicketsSold,
    total_registered_users: registeredUsers,
    total_winners: totalWinners,
    pending_winners: admin.firestore.FieldValue.delete(),
    draws_ending_soon: endingSoon,
    open_support_chats: openSupportChats,
    closed_support_chats: closedSupportChats,
    total_orders: totalOrders,
  };

  await updateDashboard(dashboardData);
  // Note: daily_history is the source of truth and is only written by orderTransactionService.
  // We do NOT overwrite it here to avoid corrupting the per-day accumulation.

  logger.info("[DashboardMetrics] Recalculation complete.", dashboardData);
  return dashboardData;
}

export const onCompetitionChangeDashboard = onDocumentUpdated("competition/{compId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.status !== after.status || before.draw_date !== after.draw_date) {
    await runFullRecalculation();
  }
});

export const onCompetitionCreatedDashboard = onDocumentCreated("competition/{compId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  await runFullRecalculation();
});

export const onCompetitionDeletedDashboard = onDocumentDeleted("competition/{compId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  await runFullRecalculation();
});

export const onUserChangeDashboard = onDocumentUpdated("user/{userId}", async (event) => {
  if (await markEventProcessed(event.id)) return;

  const before = event.data.before.data();
  const after = event.data.after.data();

  // If user completed onboarding / became verified
  if (!before.is_verified && after.is_verified) {
    await updateDashboard({
      total_registered_users: admin.firestore.FieldValue.increment(1)
    });
  }
});

export const onUserDeletedDashboard = onDocumentDeleted("user/{userId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();
  
  if (data.is_verified) {
    await updateDashboard({
      total_registered_users: admin.firestore.FieldValue.increment(-1)
    });
  }
});

export const onOrderDeletedDashboard = onDocumentDeleted("order/{orderId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();

  // Only decrement stats if the deleted order was actually paid (since unpaid orders are not counted in metrics)
  if (data.status !== "paid") {
    return;
  }

  const batch = db.batch();
  const dashRef = db.doc(DASHBOARD_DOC_PATH);
  
  const amount = Number(data.total_amount || 0);
  const tickets = Number(data.total_ticket || 0);
  const orderDate = data.created_at?.toDate?.() || new Date(data.created_at);
  const orderDateStr = orderDate.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  const todayStr = getTodayStr();

  const dashUpdates = {
    total_orders: admin.firestore.FieldValue.increment(-1),
    total_revenue: admin.firestore.FieldValue.increment(-amount),
    total_tickets_sold: admin.firestore.FieldValue.increment(-tickets),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };

  if (orderDateStr === todayStr) {
    dashUpdates.tickets_sold_today = admin.firestore.FieldValue.increment(-tickets);
  }

  const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(orderDateStr);
  batch.set(dailyRef, {
    revenue: admin.firestore.FieldValue.increment(-amount),
    tickets_sold: admin.firestore.FieldValue.increment(-tickets),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  batch.set(dashRef, dashUpdates, { merge: true });
  await batch.commit();
});

export const syncDashboardMetricsScheduled = onSchedule("0 * * * *", async () => {
  await runFullRecalculation();
});

export const onDayChangeSync = onSchedule({
  schedule: "0 0 * * *",
  timeZone: TIMEZONE
}, async () => {
  logger.info("[DashboardMetrics] Midnight rollover — resetting tickets_sold_today.");
  // Reset the top-level counter so it starts fresh for the new day.
  // The daily_history for the new day will be populated by the first order.
  await updateDashboard({ tickets_sold_today: 0 });
  // Then run a full recalculation to ensure all other stats are consistent.
  await runFullRecalculation();
});

export const syncDashboardMetrics = onCall(async (request) => {
  await assertAdmin(request);
  return await runFullRecalculation();
});

export const onChatCreatedDashboard = onDocumentCreated("chats/{chatId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();
  if (data.status === "active" && ["support", "winner_chat"].includes(data.chat_type)) {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(1)
    });
  }
});

export const onChatUpdatedDashboard = onDocumentUpdated("chats/{chatId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (!["support", "winner_chat"].includes(after.chat_type)) return;

  if (before.status === "active" && after.status === "closed") {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(-1),
      closed_support_chats: admin.firestore.FieldValue.increment(1)
    });
  } else if (before.status === "closed" && after.status === "active") {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(1),
      closed_support_chats: admin.firestore.FieldValue.increment(-1)
    });
  }
});

export const onChatDeletedDashboard = onDocumentDeleted("chats/{chatId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();
  
  if (!["support", "winner_chat"].includes(data.chat_type)) return;

  if (data.status === "active") {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(-1)
    });
  } else if (data.status === "closed") {
    await updateDashboard({
      closed_support_chats: admin.firestore.FieldValue.increment(-1)
    });
  }
});

