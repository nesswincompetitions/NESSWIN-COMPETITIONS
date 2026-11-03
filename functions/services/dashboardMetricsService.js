import { randomUUID } from 'node:crypto';
import { HttpsError as DefaultHttpsError } from 'firebase-functions/v2/https';
import {
  computeOrderFinancialSummaryFromAggregates,
  FINANCIAL_EXCLUDED_PAID_STATUS_VALUES,
  PAID_ORDER_STATUS_VALUES,
  REFUNDED_ORDER_STATUS_VALUES,
} from './orderMetricsService.js';

export const DASHBOARD_DOC_PATH = 'system_metrics/dashboard';
export const DAILY_HISTORY_PATH = 'system_metrics/dashboard/daily_history';
export const DASHBOARD_REFRESH_LOCK_PATH = 'system_metrics/dashboard_refresh_lock';
export const TIMEZONE = 'Europe/Paris';

export const REFRESH_LOCK_TTL_MS = 10 * 60 * 1000;
export const REFRESH_LOCK_WAIT_MS = 20 * 1000;
export const REFRESH_LOCK_POLL_MS = 250;
export const MANUAL_REFRESH_COOLDOWN_MS = 10 * 1000;

const ACTIVE_COMPETITION_STATUSES = new Set(['active', 'ready_to_draw', 'drawing']);
const WINNER_COMPETITION_STATUSES = new Set(['winner_announced', 'completed', 'closed']);

function getTodayStr(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createDashboardMetricsService({
  db,
  admin,
  logger,
  HttpsError = DefaultHttpsError,
  now = () => Date.now(),
  ownerId = () => randomUUID(),
  recalculateMetrics = null,
} = {}) {
  const refreshLockRef = db.collection('system_metrics').doc('dashboard_refresh_lock');
  const dashboardRef = db.collection('system_metrics').doc('dashboard');

  function staleLeaseError() {
    return new HttpsError(
      'aborted',
      'The dashboard refresh lease was taken over or expired before completion. Please retry.',
    );
  }

  async function updateDashboard(data) {
    await dashboardRef.set(
      {
        ...data,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function writeFencedDashboardMetrics({ owner, fence, dashboardData }) {
    await db.runTransaction(async transaction => {
      const lockSnapshot = await transaction.get(refreshLockRef);
      if (!lockSnapshot.exists) {
        throw staleLeaseError();
      }

      const lock = lockSnapshot.data();
      const currentFence = Number(lock.fence || 0);
      const expiresAt = Number(lock.expires_at_millis || 0);

      if (lock.owner !== owner || currentFence !== fence || expiresAt <= now()) {
        throw staleLeaseError();
      }

      transaction.set(
        dashboardRef,
        {
          ...dashboardData,
          last_refreshed_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  }

  async function readOrderFinancialTotals() {
    const { AggregateField } = admin.firestore;
    const ordersRef = db.collection('order');
    const aggregateSpec = {
      count: AggregateField.count(),
      gross: AggregateField.sum('total_amount'),
      refunded: AggregateField.sum('refunded_amount'),
      tickets: AggregateField.sum('total_ticket'),
    };

    const paidQuery = ordersRef.where('status', 'in', Array.from(PAID_ORDER_STATUS_VALUES));
    const paidUnfulfilledQuery = ordersRef
      .where('payment_status', '==', 'paid')
      .where('status', 'not-in', Array.from(FINANCIAL_EXCLUDED_PAID_STATUS_VALUES));
    const refundedQuery = ordersRef.where('status', 'in', Array.from(REFUNDED_ORDER_STATUS_VALUES));

    const [paidSnap, unfulfilledSnap, refundedSnap] = await Promise.all([
      paidQuery.aggregate(aggregateSpec).get(),
      paidUnfulfilledQuery.aggregate(aggregateSpec).get(),
      refundedQuery.aggregate(aggregateSpec).get(),
    ]);

    const paid = paidSnap.data();
    const unfulfilled = unfulfilledSnap.data();
    const refunded = refundedSnap.data();

    console.log('[DashboardMetrics] Aggregate diagnostics', {
      paid: paidSnap.data(),
      unfulfilled: unfulfilledSnap.data(),
      refunded: refundedSnap.data(),
    });

    return computeOrderFinancialSummaryFromAggregates({
      paidCount: paid.count,
      paidGross: paid.gross,
      paidRefunded: paid.refunded,
      paidTickets: paid.tickets,
      unfulfilledCount: unfulfilled.count,
      unfulfilledGross: unfulfilled.gross,
      unfulfilledRefunded: unfulfilled.refunded,
      unfulfilledTickets: unfulfilled.tickets,
      refundedCount: refunded.count,
      refundedTickets: refunded.tickets,
    });
  }

  async function recalculateMetricsImpl() {
    logger.info('[DashboardMetrics] Starting full recalculation...');
    const currentDate = new Date(now());
    const todayStr = getTodayStr(currentDate);
    const sevenDaysFromNow = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch ONLY active competitions (usually very few) to get totalActive and endingSoon count.
    const activeCompSnap = await db
      .collection('competition')
      .where('status', 'in', Array.from(ACTIVE_COMPETITION_STATUSES))
      .get();

    let totalActive = activeCompSnap.size;
    let endingSoon = 0;

    activeCompSnap.forEach(doc => {
      const data = doc.data();
      const drawDate =
        data.draw_date?.toDate?.() || (data.draw_date ? new Date(data.draw_date) : null);
      if (drawDate && drawDate > currentDate && drawDate <= sevenDaysFromNow) {
        endingSoon++;
      }
    });

    // Count winner/completed competitions via cheap .count() aggregation query.
    const winnersCountSnap = await db
      .collection('competition')
      .where('status', 'in', Array.from(WINNER_COMPETITION_STATUSES))
      .count()
      .get();
    const totalWinners = winnersCountSnap.data().count;

    const userSnap = await db.collection('user').where('is_verified', '==', true).count().get();
    const registeredUsers = userSnap.data().count;

    // Order totals are reconciled from the order collection, not from prior
    // incremental values, so missed events or legacy writes cannot leave the
    // dashboard negative or stale.
    const orderFinancials = await readOrderFinancialTotals();

    // Compute today's stats from daily_history subcollection (source of truth for "today")
    const dailyRef = db.collection(DAILY_HISTORY_PATH).doc(todayStr);
    const dailySnap = await dailyRef.get();
    const ticketsSoldToday = dailySnap.exists ? Number(dailySnap.data().tickets_sold || 0) : 0;

    const openChatsSnap = await db
      .collection('chats')
      .where('chat_type', 'in', ['support', 'winner_chat'])
      .where('status', '==', 'active')
      .count()
      .get();
    const openSupportChats = openChatsSnap.data().count;

    const closedChatsSnap = await db
      .collection('chats')
      .where('chat_type', 'in', ['support', 'winner_chat'])
      .where('status', '==', 'closed')
      .count()
      .get();
    const closedSupportChats = closedChatsSnap.data().count;

    const dashboardData = {
      total_active_competitions: totalActive,
      tickets_sold_today: ticketsSoldToday,
      total_revenue: orderFinancials.totalRevenue,
      total_tickets_sold: orderFinancials.totalTicketsSold,
      total_registered_users: registeredUsers,
      total_winners: totalWinners,
      pending_winners: admin.firestore.FieldValue.delete(),
      draws_ending_soon: endingSoon,
      open_support_chats: openSupportChats,
      closed_support_chats: closedSupportChats,
      total_orders: orderFinancials.totalOrders,
    };

    return dashboardData;
  }

  const performRecalculation = recalculateMetrics || recalculateMetricsImpl;

  async function acquireRefreshLock({ owner, startedAt, manual, lockMode }) {
    let currentNow = startedAt;
    const deadline = startedAt + REFRESH_LOCK_WAIT_MS;

    for (;;) {
      const result = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(refreshLockRef);
        const existing = snapshot.exists ? snapshot.data() : {};
        const currentOwner = existing.owner || null;
        const expiresAt = Number(existing.expires_at_millis || 0);

        if (currentOwner && expiresAt > currentNow) {
          return { acquired: false, reason: 'locked', expiresAt };
        }

        if (manual) {
          const lastAttempt = Number(existing.last_manual_attempt_at_millis || 0);
          const elapsed = currentNow - lastAttempt;
          if (lastAttempt && elapsed < MANUAL_REFRESH_COOLDOWN_MS) {
            return {
              acquired: false,
              reason: 'cooldown',
              retryAfterMillis: MANUAL_REFRESH_COOLDOWN_MS - elapsed,
            };
          }
        }

        const nextFence = Number(existing.fence || 0) + 1;

        transaction.set(refreshLockRef, {
          ...existing,
          owner,
          fence: nextFence,
          expires_at_millis: currentNow + REFRESH_LOCK_TTL_MS,
          acquired_at: admin.firestore.FieldValue.serverTimestamp(),
          last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
          ...(manual ? { last_manual_attempt_at_millis: currentNow } : {}),
        });

        return { acquired: true, fence: nextFence };
      });

      if (result.acquired) {
        return { fence: result.fence };
      }

      if (result.reason === 'cooldown') {
        throw new HttpsError(
          'resource-exhausted',
          'Dashboard metrics were refreshed recently. Please wait a moment before trying again.',
        );
      }

      if (lockMode !== 'wait') {
        if (manual) {
          throw new HttpsError(
            'resource-exhausted',
            'A dashboard refresh is already running. Please try again shortly.',
          );
        }
        throw new Error('A dashboard refresh is already running.');
      }

      if (currentNow >= deadline) {
        if (manual) {
          throw new HttpsError(
            'resource-exhausted',
            'A dashboard refresh is already running. Please try again shortly.',
          );
        }
        throw new Error('Timed out waiting for the dashboard refresh lock.');
      }

      await sleep(Math.min(REFRESH_LOCK_POLL_MS, Math.max(25, result.expiresAt - currentNow + 25)));
      currentNow = now();
    }
  }

  async function releaseRefreshLock(owner, fence, { manual, success }) {
    const releasedAt = now();

    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(refreshLockRef);
      if (!snapshot.exists) {
        return;
      }

      const existing = snapshot.data();
      const currentFence = Number(existing.fence || 0);
      if (existing.owner !== owner || currentFence !== fence) {
        logger.warn('[DashboardMetrics] Refresh lock is owned by another execution; skipping release.', {
          owner,
          fence,
          currentOwner: existing.owner || null,
          currentFence,
        });
        return;
      }

      transaction.set(refreshLockRef, {
        ...existing,
        owner: null,
        expires_at_millis: 0,
        released_at: admin.firestore.FieldValue.serverTimestamp(),
        last_success_at: success
          ? admin.firestore.FieldValue.serverTimestamp()
          : existing.last_success_at || null,
        last_failure_at: success ? existing.last_failure_at || null : admin.firestore.FieldValue.serverTimestamp(),
        ...(manual && success ? { last_manual_success_at_millis: releasedAt } : {}),
      });
    });
  }

  async function runFullRecalculation({ source = 'internal', manual = false, lockMode = 'wait' } = {}) {
    const startedAt = now();
    const owner = ownerId();

    const { fence } = await acquireRefreshLock({ owner, startedAt, manual, lockMode });

    try {
      await updateDashboard({
        last_refresh_attempted_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      const dashboardData = await performRecalculation();
      await writeFencedDashboardMetrics({ owner, fence, dashboardData });

      try {
        await releaseRefreshLock(owner, fence, { manual, success: true });
      } catch (releaseError) {
        logger.error('[DashboardMetrics] Failed to release refresh lock after successful recalculation.', {
          owner,
          fence,
          source,
          message: releaseError?.message,
        });
      }

      logger.info('[DashboardMetrics] Recalculation complete.', {
        source,
        fence,
        dashboardData,
      });
      return dashboardData;
    } catch (error) {
      try {
        await releaseRefreshLock(owner, fence, { manual, success: false });
      } catch (releaseError) {
        logger.error('[DashboardMetrics] Failed to release refresh lock after recalculation failure.', {
          owner,
          fence,
          source,
          message: releaseError?.message,
        });
      }
      throw error;
    }
  }

  async function refreshDashboardMetrics({ request, assertAdmin }) {
    await assertAdmin(request);

    try {
      await runFullRecalculation({
        source: 'manual',
        manual: true,
        lockMode: 'throw',
      });

      return {
        success: true,
        refreshedAt: now(),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error('[DashboardMetrics] Manual refresh failed.', {
        message: error?.message,
        stack: error?.stack,
      });
      throw new HttpsError(
        'internal',
        'Unable to refresh dashboard metrics. Please try again.',
      );
    }
  }

  return {
    updateDashboard,
    runFullRecalculation,
    refreshDashboardMetrics,
    recalculateMetricsImpl,
  };
}
