import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

/**
 * createAppNotification
 *
 * Writes a new document to `ff_user_push_notifications`, which triggers the
 * FlutterFlow-deployed `sendUserPushNotificationsTrigger` Cloud Function
 * to deliver the actual FCM push.
 *
 * The document schema matches exactly what FlutterFlow expects — no extra
 * fields are added. This is critical because the FlutterFlow CF validates
 * and reads specific fields.
 *
 * This function is intentionally fire-and-forget: it must NEVER throw up to
 * its caller. If the write fails (e.g. offline, quota exceeded), the error is
 * logged silently and the checkout flow continues unaffected.
 *
 * @param {Object}  params
 * @param {import('firebase/firestore').DocumentReference} params.currentUserRef
 * @param {import('firebase/firestore').DocumentReference} params.competitionRef
 * @param {import('firebase/firestore').DocumentReference} params.orderRef
 * @param {string}  params.competitionTitle
 *
 * @returns {Promise<void>}
 */
export const createAppNotification = async ({
  currentUserRef,
  competitionRef,
  orderRef,
  competitionTitle,
}) => {
  try {
    // ── Construct the notification document (FlutterFlow schema) ──────────────
    const notificationPayload = {
      // ── Display fields ─────────────────────────────────────────────────────
      notification_title: 'Payment Successful',
      notification_text: `Your payment was successful and your entry for ${competitionTitle} is confirmed.`,
      notification_image_url: '',
      notification_sound: 'default',

      // ── Targeting ──────────────────────────────────────────────────────────
      // Comma-separated string of Firestore document paths.
      user_refs: currentUserRef.path,

      // ── Deep-link routing ──────────────────────────────────────────────────
      initial_page_name: 'MyTickets',
      parameter_data: '{}',

      // ── Classification ─────────────────────────────────────────────────────
      category: 'Orders',
      type: 'payment_success',
      cta_text: 'View Tickets',

      // ── State ──────────────────────────────────────────────────────────────
      status: '',
      is_read: false,
      num_sent: 0,

      // ── Cross-reference links ──────────────────────────────────────────────
      order_ref: orderRef,
      competition_ref: competitionRef,
      sender: currentUserRef,
      chat_ref: null,

      // ── Timestamps ─────────────────────────────────────────────────────────
      timestamp: serverTimestamp(),
      created_at: serverTimestamp(),
    };

    // ── Write to Firestore ────────────────────────────────────────────────────
    // Use a deterministic document ID based on the order so that if
    // createAppNotification is ever called more than once (e.g. React re-render),
    // the second setDoc is a silent overwrite and does NOT trigger
    // onDocumentCreated again.
    const notifRef = doc(db, 'ff_user_push_notifications', `order_${orderRef.id}`);
    await setDoc(notifRef, notificationPayload);

    console.log(
      `[notificationService] Push notification document created: ${notifRef.id}`
    );
  } catch (error) {
    // Log but never re-throw — the caller (checkout) must not be disrupted.
    console.error(
      '[notificationService] Failed to create push notification document. ' +
        'The checkout flow will continue normally.',
      error
    );
  }
};
/**
 * fetchUserNotifications
 *
 * Sets up a real-time listener for notifications targeting the specific user.
 * Matches the user path in the `user_refs` string field.
 *
 * @param {string} userUid - The UID of the current user
 * @param {Function} callback - Success callback receiving the notifications array
 * @returns {Function} - Unsubscribe function
 */
export const fetchUserNotifications = (userUid, callback) => {
  if (!userUid) return () => {};

  const userPath = `user/${userUid}`;
  const notificationsRef = collection(db, 'ff_user_push_notifications');

  // We query for the user path.
  // Note: Removing 'orderBy' temporarily to ensure all docs are fetched
  // even if 'timestamp' field is missing or if an index hasn't been created yet.
  const q = query(
    notificationsRef,
    where('user_refs', '==', userPath)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notifications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      // Sort manually in JS to avoid needing a composite index in Firestore
      // while we are still debugging/developing.
      const sorted = notifications.sort((a, b) => {
        const timeA = a.timestamp?.toMillis?.() || a.created_at?.toMillis?.() || 0;
        const timeB = b.timestamp?.toMillis?.() || b.created_at?.toMillis?.() || 0;
        return timeB - timeA;
      });

      console.log(`[notificationService] Fetched ${sorted.length} notifications for user ${userUid}`);
      callback(sorted);
    },
    (error) => {
      console.error('[notificationService] Error fetching notifications:', error);
    }
  );
};

/**
 * markNotificationAsRead
 *
 * Updates a notification document to set `is_read` to true.
 *
 * @param {string} notificationId - The ID of the notification to mark as read
 * @returns {Promise<void>}
 */
export const markNotificationAsRead = async (notificationId) => {
  try {
    const notifRef = doc(db, 'ff_user_push_notifications', notificationId);
    await updateDoc(notifRef, {
      is_read: true,
    });
  } catch (error) {
    console.error('[notificationService] Error marking notification as read:', error);
    throw error;
  }
};

/**
 * markAllAsRead
 *
 * Marks all unread notifications for a user as read.
 *
 * @param {Array} notifications - List of notification objects
 * @returns {Promise<void>}
 */
export const markAllAsRead = async (notifications) => {
  try {
    const unread = notifications.filter((n) => !n.is_read);
    const promises = unread.map((n) => markNotificationAsRead(n.id));
    await Promise.all(promises);
  } catch (error) {
    console.error('[notificationService] Error marking all notifications as read:', error);
  }
};
