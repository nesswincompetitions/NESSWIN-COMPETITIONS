import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { admin, db } from '../config/firebaseAdmin.js';
import { assertAdmin } from '../services/functionGuards.js';
import { isFinanciallyPaidOrder } from '../services/orderMetricsService.js';
import {
  createDashboardMetricsService,
  DAILY_HISTORY_PATH,
  TIMEZONE,
} from '../services/dashboardMetricsService.js';

const EVENT_LOGS_PATH = 'system_metrics/dashboard/event_logs';

const dashboardMetrics = createDashboardMetricsService({ db, admin, logger });

const { updateDashboard, runFullRecalculation } = dashboardMetrics;

/**
 * Idempotency check to prevent double-counting due to Cloud Function retries.
 */
async function markEventProcessed(eventId) {
  if (!eventId) return false;
  const ref = db.collection(EVENT_LOGS_PATH).doc(eventId);

  try {
    await ref.create({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return false;
  } catch (err) {
    if (err.code === 6 || err.message?.includes('ALREADY_EXISTS')) {
      return true;
    }
    throw err;
  }
}

export const onCompetitionChangeDashboard = onDocumentUpdated(
  'competition/{compId}',
  async event => {
    if (await markEventProcessed(event.id)) return;

    const before = event.data.before.data();
    const after = event.data.after.data();

    const beforeTime = before.draw_date?.toMillis?.() || null;
    const afterTime = after.draw_date?.toMillis?.() || null;

    if (before.status !== after.status || beforeTime !== afterTime) {
      await runFullRecalculation();
    }
  },
);

export const onCompetitionCreatedDashboard = onDocumentCreated(
  'competition/{compId}',
  async event => {
    if (await markEventProcessed(event.id)) return;
    await runFullRecalculation();
  },
);

export const onCompetitionDeletedDashboard = onDocumentDeleted(
  'competition/{compId}',
  async event => {
    if (await markEventProcessed(event.id)) return;
    await runFullRecalculation();
  },
);

export const onUserChangeDashboard = onDocumentUpdated('user/{userId}', async event => {
  if (await markEventProcessed(event.id)) return;

  const before = event.data.before.data();
  const after = event.data.after.data();

  // If user completed onboarding / became verified
  if (!before.is_verified && after.is_verified) {
    await updateDashboard({
      total_registered_users: admin.firestore.FieldValue.increment(1),
    });
  }
});

export const onUserDeletedDashboard = onDocumentDeleted('user/{userId}', async event => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();

  if (data.is_verified) {
    await updateDashboard({
      total_registered_users: admin.firestore.FieldValue.increment(-1),
    });
  }
});

export const onOrderCreatedDashboard = onDocumentCreated('order/{orderId}', async event => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();

  if (!isFinanciallyPaidOrder(data)) {
    return;
  }

  const amount = Number(data.total_amount || 0);
  const tickets = Number(data.total_ticket || 0);
  const orderDate = data.created_at?.toDate?.() || new Date(data.created_at);
  const orderDateStr = orderDate.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(orderDateStr);
  await dailyRef.set(
    {
      revenue: admin.firestore.FieldValue.increment(amount),
      tickets_sold: admin.firestore.FieldValue.increment(tickets),
      date: orderDateStr,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await runFullRecalculation();
});

export const onOrderUpdatedDashboard = onDocumentUpdated('order/{orderId}', async event => {
  if (await markEventProcessed(event.id)) return;

  const before = event.data.before.data();
  const after = event.data.after.data();
  const changed = field => before[field] !== after[field];

  // Normal checkout orders are created pending, then updated to paid by the
  // payment webhook. Record that transition in daily_history exactly once.
  if (!isFinanciallyPaidOrder(before) && isFinanciallyPaidOrder(after)) {
    const amount = Number(after.total_amount || 0);
    const tickets = Number(after.total_ticket || 0);
    const paidAt = after.paid_at?.toDate?.() || after.created_at?.toDate?.() || new Date();
    const orderDateStr = paidAt.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

    const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(orderDateStr);
    await dailyRef.set(
      {
        revenue: admin.firestore.FieldValue.increment(amount),
        tickets_sold: admin.firestore.FieldValue.increment(tickets),
        date: orderDateStr,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (
    changed('status') ||
    changed('payment_status') ||
    changed('total_amount') ||
    changed('total_ticket') ||
    changed('refunded_amount') ||
    changed('refunded_amount_minor')
  ) {
    await runFullRecalculation();
  }
});

export const onOrderDeletedDashboard = onDocumentDeleted('order/{orderId}', async event => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();

  if (!isFinanciallyPaidOrder(data)) {
    return;
  }

  const amount = Number(data.total_amount || 0);
  const tickets = Number(data.total_ticket || 0);
  const orderDate = data.paid_at?.toDate?.() || data.created_at?.toDate?.() || new Date();
  const orderDateStr = orderDate.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(orderDateStr);
  await dailyRef.set(
    {
      revenue: admin.firestore.FieldValue.increment(-amount),
      tickets_sold: admin.firestore.FieldValue.increment(-tickets),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await runFullRecalculation();
});

export const syncDashboardMetricsScheduled = onSchedule('0 * * * *', async () => {
  await runFullRecalculation();
});

export const onDayChangeSync = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: TIMEZONE,
  },
  async () => {
    logger.info('[DashboardMetrics] Midnight rollover — resetting tickets_sold_today.');
    // Reset the top-level counter so it starts fresh for the new day.
    // The daily_history for the new day will be populated by the first order.
    await updateDashboard({ tickets_sold_today: 0 });
    // Then run a full recalculation to ensure all other stats are consistent.
    await runFullRecalculation();
  },
);

export const syncDashboardMetrics = onCall(async request => {
  await assertAdmin(request);
  return await runFullRecalculation({ source: 'syncDashboardMetrics', manual: false });
});

export const refreshDashboardMetrics = onCall(async request => {
  return dashboardMetrics.refreshDashboardMetrics({ request, assertAdmin });
});

export const onChatCreatedDashboard = onDocumentCreated('chats/{chatId}', async event => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();
  if (data.status === 'active' && ['support', 'winner_chat'].includes(data.chat_type)) {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(1),
    });
  }
});

export const onChatUpdatedDashboard = onDocumentUpdated('chats/{chatId}', async event => {
  if (await markEventProcessed(event.id)) return;
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (!['support', 'winner_chat'].includes(after.chat_type)) return;

  if (before.status === 'active' && after.status === 'closed') {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(-1),
      closed_support_chats: admin.firestore.FieldValue.increment(1),
    });
  } else if (before.status === 'closed' && after.status === 'active') {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(1),
      closed_support_chats: admin.firestore.FieldValue.increment(-1),
    });
  }
});

export const onChatDeletedDashboard = onDocumentDeleted('chats/{chatId}', async event => {
  if (await markEventProcessed(event.id)) return;
  const data = event.data.data();

  if (!['support', 'winner_chat'].includes(data.chat_type)) return;

  if (data.status === 'active') {
    await updateDashboard({
      open_support_chats: admin.firestore.FieldValue.increment(-1),
    });
  } else if (data.status === 'closed') {
    await updateDashboard({
      closed_support_chats: admin.firestore.FieldValue.increment(-1),
    });
  }
});
