import { admin } from "../config/firebaseAdmin.js";

/**
 * buildNotificationPayload
 *
 * Constructs a notification document object following the "perfect schema" requested by the user.
 *
 * @param {Object} params
 * @param {string} params.type             - Unique type identifier (e.g. 'payment_success')
 * @param {string} params.title            - Notification title
 * @param {string} params.text             - Notification body text
 * @param {string} [params.status=""]      - Status string (e.g. 'succeeded', 'pending')
 * @param {string} [params.category="Orders"]
 * @param {string} [params.pageName="OrderHistory"]
 * @param {string} [params.userRefs=""]    - Comma-separated user paths
 * @param {FirebaseFirestore.DocumentReference} [params.userRef]
 * @param {FirebaseFirestore.DocumentReference} [params.orderRef]
 * @param {FirebaseFirestore.DocumentReference} [params.competitionRef]
 * @param {FirebaseFirestore.DocumentReference} [params.senderRef]
 * @param {FirebaseFirestore.DocumentReference} [params.chatRef=null]
 * @param {string} [params.ctaText="View"]
 * @param {Object} [params.parameterData={}] - Navigation parameters (JSON stringified)
 *
 * @returns {Object} The notification document to be stored in ff_user_push_notifications
 */
export const buildNotificationPayload = ({
  type,
  title,
  text,
  status = "",
  category = "Orders",
  pageName = "OrderHistory",
  userRefs = "",
  userRef = null,
  orderRef = null,
  competitionRef = null,
  senderRef = null,
  chatRef = null,
  ctaText = "View",
  parameterData = {},
}) => {
  const now = admin.firestore.FieldValue.serverTimestamp();

  return {
    type,
    notification_title: title,
    notification_text: text,
    status,
    category,
    initial_page_name: pageName,
    user_refs: userRefs,
    user_ref: userRef,           // For backward compatibility/specific lookups
    order_ref: orderRef,
    competition_ref: competitionRef,
    sender: senderRef,
    chat_ref: chatRef,
    cta_text: ctaText,
    parameter_data: JSON.stringify(parameterData),
    notification_image_url: " ", // Space as requested
    notification_sound: "default",
    is_read: false,
    num_sent: 0,
    timestamp: now,
    created_at: now,
  };
};
