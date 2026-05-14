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

/**
 * Helper: Get today's date string in YYYY-MM-DD
 */
function getTodayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/**
 * Helper: Update the dashboard document with incremental or absolute values
 */
async function updateDashboard(data) {
  const ref = db.doc(DASHBOARD_DOC_PATH);
  await ref.set({
    ...data,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

/**
 * Helper: Update daily history
 */
async function updateDailyHistory(dateStr, data) {
  const ref = db.collection(DAILY_HISTORY_PATH).doc(dateStr);
  await ref.set({
    ...data,
    date: dateStr,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

/**
 * Helper: Idempotency check to prevent double-counting due to Cloud Function retries.
 * Returns true if the event has already been processed.
 */
async function markEventProcessed(eventId) {
  if (!eventId) return false;
  const ref = db.collection(EVENT_LOGS_PATH).doc(eventId);
  
  try {
    await ref.create({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7-day TTL for cleanup
    });
    return false; // Not processed before
  } catch (err) {
    if (err.code === 6 || err.message?.includes("ALREADY_EXISTS")) {
      return true; // Already processed
    }
    throw err;
  }
}

// ─── AGGREGATION LOGIC ────────────────────────────────────────────────────────

/**
 * Full recalculation of all metrics to ensure "perfect" accuracy.
 * Can be called manually by admin or triggered by schedule.
 */
async function runFullRecalculation() {
  logger.info("[DashboardMetrics] Starting full recalculation...");
  const todayStr = getTodayStr();
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. Competitions
  const compSnap = await db.collection("competition").get();
  let totalActive = 0;
  let pendingWinners = 0;
  let endingSoon = 0;

  compSnap.forEach(doc => {
    const data = doc.data();
    const status = (data.status || "").toLowerCase();
    
    if (status === "active") {
      totalActive++;
      const drawDate = data.draw_date?.toDate?.() || (data.draw_date ? new Date(data.draw_date) : null);
      if (drawDate && drawDate > now && drawDate <= sevenDaysFromNow) {
        endingSoon++;
      }
    } else if (status === "winner_announced") {
      pendingWinners++;
    }
  });

  // 2. Users
  const userSnap = await db.collection("user")
    .where("is_verified", "==", true)
    .where("is_deleted", "==", false)
    .count()
    .get();
  const registeredUsers = userSnap.data().count;

  // 3. Orders (Revenue & Today's Tickets)
  // For massive databases, we'd use indexed sums, but for NESSWIN, we can query or rely on global counters.
  // To be "perfect", we'll check global_stats and verify with a quick check if possible.
  const globalRef = db.doc("system_metrics/global_stats");
  const globalSnap = await globalRef.get();
  const globalData = globalSnap.data() || {};
  
  const totalRevenue = globalData.total_revenue || 0;

  // 4. Tickets Sold Today
  // We query orders from today
  const startOfToday = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
  startOfToday.setHours(0, 0, 0, 0);
  
  const ordersTodaySnap = await db.collection("order")
    .where("status", "==", "paid")
    .where("created_at", ">=", admin.firestore.Timestamp.fromDate(startOfToday))
    .get();
    
  let ticketsSoldToday = 0;
  ordersTodaySnap.forEach(doc => {
    ticketsSoldToday += Number(doc.data().total_ticket || 0);
  });

  const dashboardData = {
    total_active_competitions: totalActive,
    tickets_sold_today: ticketsSoldToday,
    total_revenue: totalRevenue,
    registered_users: registeredUsers,
    pending_winners: pendingWinners,
    draws_ending_soon: endingSoon,
  };

  await updateDashboard(dashboardData);
  await updateDailyHistory(todayStr, {
    tickets_sold: ticketsSoldToday,
    revenue: ordersTodaySnap.docs.reduce((acc, doc) => acc + Number(doc.data().total_amount || 0), 0)
  });

  logger.info("[DashboardMetrics] Recalculation complete.", dashboardData);
  return dashboardData;
}

// ─── TRIGGERS ────────────────────────────────────────────────────────────────

/**
 * Listen for competition changes to update status-based counts
 */
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

/**
 * Listen for user changes to update registered_users
 */
export const onUserChangeDashboard = onDocumentUpdated("user/{userId}", async (event) => {
  if (await markEventProcessed(event.id)) return;

  const before = event.data.before.data();
  const after = event.data.after.data();

  if (!before.is_verified && after.is_verified) {
    await updateDashboard({
      registered_users: admin.firestore.FieldValue.increment(1)
    });
    const todayStr = getTodayStr();
    await updateDailyHistory(todayStr, {
      new_users: admin.firestore.FieldValue.increment(1)
    });
  } else if (before.is_deleted === false && after.is_deleted === true && after.is_verified) {
    await updateDashboard({
      registered_users: admin.firestore.FieldValue.increment(-1)
    });
  }
});

export const onUserDeletedDashboard = onDocumentDeleted("user/{userId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();
  
  if (data.is_verified && !data.is_deleted) {
    await updateDashboard({
      registered_users: admin.firestore.FieldValue.increment(-1)
    });
  }
});

/**
 * Listen for paid orders to update revenue and tickets
 */
export const onOrderChangeDashboard = onDocumentUpdated("order/{orderId}", async (event) => {
  if (await markEventProcessed(event.id)) return;

  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.status !== "paid" && after.status === "paid") {
    const amount = Number(after.total_amount || 0);
    const tickets = Number(after.total_ticket || 0);
    const todayStr = getTodayStr();

    const batch = db.batch();
    
    // Update live dashboard
    const dashRef = db.doc(DASHBOARD_DOC_PATH);
    batch.set(dashRef, {
      total_revenue: admin.firestore.FieldValue.increment(amount),
      tickets_sold_today: admin.firestore.FieldValue.increment(tickets),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update global stats
    const globalRef = db.doc("system_metrics/global_stats");
    batch.set(globalRef, {
      total_revenue: admin.firestore.FieldValue.increment(amount),
      total_tickets_sold: admin.firestore.FieldValue.increment(tickets)
    }, { merge: true });

    // Update daily history
    const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(todayStr);
    batch.set(dailyRef, {
      revenue: admin.firestore.FieldValue.increment(amount),
      tickets_sold: admin.firestore.FieldValue.increment(tickets),
      date: todayStr,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
  }
});

export const onOrderDeletedDashboard = onDocumentDeleted("order/{orderId}", async (event) => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();

  if (data.status === "paid") {
    const amount = Number(data.total_amount || 0);
    const tickets = Number(data.total_ticket || 0);
    const orderDate = data.created_at?.toDate?.() || new Date(data.created_at);
    const orderDateStr = orderDate.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
    const todayStr = getTodayStr();

    const batch = db.batch();
    
    // Decrement live dashboard
    const dashRef = db.doc(DASHBOARD_DOC_PATH);
    const dashUpdates = {
      total_revenue: admin.firestore.FieldValue.increment(-amount),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    // Only decrement "today" tickets if the order was actually from today
    if (orderDateStr === todayStr) {
      dashUpdates.tickets_sold_today = admin.firestore.FieldValue.increment(-tickets);
    }
    batch.set(dashRef, dashUpdates, { merge: true });

    // Decrement global stats
    const globalRef = db.doc("system_metrics/global_stats");
    batch.set(globalRef, {
      total_revenue: admin.firestore.FieldValue.increment(-amount),
      total_tickets_sold: admin.firestore.FieldValue.increment(-tickets)
    }, { merge: true });

    // Decrement daily history for that specific day
    const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(orderDateStr);
    batch.set(dailyRef, {
      revenue: admin.firestore.FieldValue.increment(-amount),
      tickets_sold: admin.firestore.FieldValue.increment(-tickets),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
  }
});

// ─── SCHEDULED & CALLABLE ────────────────────────────────────────────────────

/**
 * Hourly sync to fix any drift and update "Draws Ending Soon"
 */
export const syncDashboardMetricsScheduled = onSchedule("0 * * * *", async () => {
  await runFullRecalculation();
});

/**
 * Midnight sync to reset "Tickets Sold Today"
 */
export const onDayChangeSync = onSchedule({
  schedule: "0 0 * * *",
  timeZone: TIMEZONE
}, async () => {
  logger.info("[DashboardMetrics] Midnight rollover started.");
  await runFullRecalculation();
});

/**
 * Manually trigger sync from Admin Dashboard
 */
export const syncDashboardMetrics = onCall(async (request) => {
  await assertAdmin(request);
  return await runFullRecalculation();
});
