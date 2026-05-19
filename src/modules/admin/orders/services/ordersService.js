import { 
  doc, 
  getDoc,
  updateDoc,
  collection, 
  query, 
  where, 
  getCountFromServer,
  getDocs,
  orderBy
} from "firebase/firestore";
import { db, functions } from '@/config/firebase';
import { httpsCallable } from "firebase/functions";

/**
 * Fetches instant aggregate metrics for the orders dashboard header.
 */
export async function fetchOrdersStats() {
  try {
    const [countSnap, dashSnap] = await Promise.all([
      getCountFromServer(collection(db, "order")),
      getDoc(doc(db, "system_metrics", "dashboard"))
    ]);
    return {
      totalOrders: countSnap.data().count,
      totalRevenue: dashSnap.exists() ? (dashSnap.data().total_revenue || 0) : 0
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
 * Marks an order as Refunded via Cloud Function (securely cancels tickets & notifies user).
 */
export async function refundOrder(orderId) {
  const refundOrderFn = httpsCallable(functions, 'refundOrder');
  const result = await refundOrderFn({ orderId });
  return result.data;
}
