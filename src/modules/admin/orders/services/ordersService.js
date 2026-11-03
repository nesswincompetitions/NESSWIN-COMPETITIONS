import { 
  doc, 
  getDoc,
  collection, 
  query, 
  where, 
  getCountFromServer,
  getDocs,
} from "firebase/firestore";
import { db, functions } from '@/config/firebase';
import { httpsCallable } from "firebase/functions";
import {
  PAID_ORDER_STATUS_VALUES,
  REFUNDED_ORDER_STATUS_VALUES,
} from '@/shared/utils/orderStatus';
import { computeOrderFinancialSummaryFromOrders } from '../../../../../functions/services/orderMetricsService.js';

const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Fetches instant aggregate metrics for the orders dashboard header.
 *
 * Total orders is the complete order population (same scope as the "All"
 * filter). Total revenue is net collected value: verified paid orders plus
 * paid-but-unfulfilled orders, minus confirmed refunds. Pending refund
 * reservations are not subtracted and fully refunded orders contribute zero.
 */
export async function fetchOrdersStats() {
  try {
    const ordersRef = collection(db, "order");
    const paidQuery = query(
      ordersRef,
      where("status", "in", [...PAID_ORDER_STATUS_VALUES, ...REFUNDED_ORDER_STATUS_VALUES]),
    );
    const paidUnfulfilledQuery = query(ordersRef, where("payment_status", "==", "paid"));

    const [countSnap, paidSnap, paidUnfulfilledSnap] = await Promise.all([
      getCountFromServer(ordersRef),
      getDocs(paidQuery),
      getDocs(paidUnfulfilledQuery),
    ]);

    const ordersById = new Map();
    [...paidSnap.docs, ...paidUnfulfilledSnap.docs].forEach(orderDoc => {
      ordersById.set(orderDoc.id, orderDoc.data());
    });
    const financialSummary = computeOrderFinancialSummaryFromOrders([...ordersById.values()]);

    return {
      totalOrders: countSnap.data().count,
      totalRevenue: roundCurrency(financialSummary.totalRevenue),
    };
  } catch (error) {
    console.error("[OrdersService] Error fetching orders stats:", error);
    throw error;
  }
}

/**
 * Fetches a single order's complete details including its generated tickets.
 */
export async function fetchOrderDetail(orderId) {
  try {
    const orderDoc = await getDoc(doc(db, "order", orderId));
    if (!orderDoc.exists()) throw new Error("Order not found");
    const orderData = { id: orderDoc.id, ...orderDoc.data() };

    const ticketsQuery = query(collection(db, "ticket"), where("order_id", "==", orderId));
    const ticketsSnap = await getDocs(ticketsQuery);
    const tickets = ticketsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.ticket_number || 0) - (b.ticket_number || 0));

    let userName = 'Unknown User', userEmail = 'N/A', competitionTitle = 'Unknown Competition';
    try {
      const uId = orderData.user_ref?.id || (typeof orderData.user_ref === 'string' ? orderData.user_ref : null);
      const cId = orderData.competition_id?.id || (typeof orderData.competition_id === 'string' ? orderData.competition_id : null);
      const [uSnap, cSnap] = await Promise.all([
        uId ? getDoc(doc(db, "user", uId)) : Promise.resolve(null),
        cId ? getDoc(doc(db, "competition", cId)) : Promise.resolve(null)
      ]);
      if (uSnap?.exists()) { userName = uSnap.data().display_name || uSnap.data().name || 'Unknown User'; userEmail = uSnap.data().email || 'N/A'; }
      if (cSnap?.exists()) { competitionTitle = cSnap.data().title || 'Unknown Competition'; }
    } catch (e) {
      console.warn('[OrdersService] Could not resolve order refs:', e.message);
    }

    return { ...orderData, user_name: userName, user_email: userEmail, competition_title: competitionTitle, ticketsList: tickets };
  } catch (error) {
    console.error(`[OrdersService] Error fetching order detail for ${orderId}:`, error);
    throw error;
  }
}

/**
 * Reads verified Stripe refund eligibility for an order.
 */
export async function getOrderRefundEligibility(orderId) {
  const fn = httpsCallable(functions, 'getOrderRefundEligibility');
  const result = await fn({ orderId });
  return result.data;
}

/**
 * Issues a Stripe refund for a paid order. This never changes ticket status.
 */
export async function refundOrder({ orderId, amountMinor, reason, requestId }) {
  const refundOrderFn = httpsCallable(functions, 'refundOrder');
  const result = await refundOrderFn({ orderId, amountMinor, reason, requestId });
  return result.data;
}

/**
 * Retries ticket fulfillment for a verified paid-but-unfulfilled order.
 * The backend re-verifies Stripe settlement; this call never charges again.
 */
export async function recoverOrderFulfillment(orderId) {
  const recoverOrderFulfillmentFn = httpsCallable(functions, 'recoverOrderFulfillment');
  const result = await recoverOrderFulfillmentFn({ orderId });
  return result.data;
}
