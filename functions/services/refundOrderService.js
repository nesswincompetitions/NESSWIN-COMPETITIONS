export const REFUND_UNAVAILABLE_MESSAGE =
  "Refund is unavailable in this release because no payment-provider refund has been issued. No order, ticket, payment, or notification data was changed.";

export function createRefundOrderHandler({ assertAdmin, HttpsError }) {
  return async function handleRefundOrder(request) {
    await assertAdmin(request);

    const { orderId } = request.data || {};
    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "orderId is required.");
    }

    throw new HttpsError("failed-precondition", REFUND_UNAVAILABLE_MESSAGE);
  };
}
