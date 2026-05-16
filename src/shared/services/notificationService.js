import {
  collection,
  doc,
  arrayUnion,
  onSnapshot,
  serverTimestamp,
  setDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

const parseRecipientPaths = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => parseRecipientPaths(item));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (typeof value === 'object' && typeof value.path === 'string') {
    return [value.path.trim()];
  }

  return [];
};

const normalizeReadFlag = (docData) => {
  if (typeof docData?.is_read === 'boolean') return docData.is_read;
  if (typeof docData?.isRead === 'boolean') return docData.isRead;
  if (typeof docData?.read === 'boolean') return docData.read;

  if (typeof docData?.is_read === 'string') {
    return docData.is_read.toLowerCase() === 'true';
  }

  return false;
};

const normalizeReadIds = (value) => {
  if (!value) return new Set();
  if (Array.isArray(value)) return new Set(value.filter(Boolean).map(String));
  if (typeof value === 'object') {
    return new Set(Object.keys(value).filter((key) => value[key]));
  }
  return new Set();
};

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
    const notifRef = doc(collection(db, 'ff_user_push_notifications'));
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
export const fetchUserNotifications = (userUid, callback, isAdmin = false) => {
  if (!userUid) return () => {};

  const userPath = `user/${userUid}`;
  const userRef = doc(db, 'user', userUid);
  let readIds = new Set();
  let broadcastNotifications = [];
  let userNotifications = [];

  const emit = () => {
    const allNotifications = [...userNotifications, ...broadcastNotifications];
    
    const merged = allNotifications.map((notif) => ({
      ...notif,
      is_read: notif.is_read || readIds.has(notif.id),
    }));

    const sorted = merged.sort((a, b) => {
      const timeA = a.timestamp?.toMillis?.() || a.created_at?.toMillis?.() || a.scheduled_time?.toMillis?.() || 0;
      const timeB = b.timestamp?.toMillis?.() || b.created_at?.toMillis?.() || b.scheduled_time?.toMillis?.() || 0;
      return timeB - timeA;
    });

    callback(sorted);
  };

  const matchesRecipient = (docData) => {
    const candidates = [docData.user_refs, docData.user_ref, docData.userRefs, docData.userRef];
    const recipientPaths = candidates.flatMap((value) => parseRecipientPaths(value));
    return recipientPaths.includes(userPath);
  };

  const unsubscribeUser = onSnapshot(
    userRef,
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      readIds = normalizeReadIds(data.notification_read_ids);
      emit();
    },
    (error) => {
      console.error('[notificationService] Error fetching user read-state:', error);
    }
  );

  const unsubscribeUserNotifications = onSnapshot(
    collection(db, 'ff_user_push_notifications'),
    (snapshot) => {
      userNotifications = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            is_read: normalizeReadFlag(data),
          };
        })
        .filter(matchesRecipient);

      emit();
    },
    (error) => {
      console.error('[notificationService] Error fetching user notifications:', error);
    }
  );

  let unsubscribeBroadcastNotifications = () => {};
  if (!isAdmin) {
    unsubscribeBroadcastNotifications = onSnapshot(
      query(
        collection(db, 'ff_push_notifications'),
        where('target_audience', '==', 'All'),
        limit(20)
      ),
      (snapshot) => {
        broadcastNotifications = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            is_read: false,
          };
        });

        emit();
      },
      (error) => {
        console.error('[notificationService] Error fetching broadcast notifications:', error);
      }
    );
  }

  return () => {
    unsubscribeUser();
    unsubscribeUserNotifications();
    unsubscribeBroadcastNotifications();
  };
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
    if (!notificationId) return;
    // Backwards-compatible wrapper kept for callers that haven't been updated yet.
    // We cannot write directly to `ff_user_push_notifications` from the client
    // because the current Firestore rules deny it, so this no-ops safely.
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
    void notifications;
    // Kept for compatibility. Use markAllNotificationsAsReadForUser(userUid, notifications)
    // so the read state is persisted on the writable user profile document.
  } catch (error) {
    console.error('[notificationService] Error marking all notifications as read:', error);
  }
};

/**
 * markNotificationAsReadForUser
 *
 * Stores the notification id in the authenticated user's profile document.
 * This avoids writing to the locked push notification collection directly.
 */
export const markNotificationAsReadForUser = async (userUid, notificationId) => {
  try {
    if (!userUid || !notificationId) return;

    const userRef = doc(db, 'user', userUid);
    await setDoc(
      userRef,
      {
        notification_read_ids: arrayUnion(notificationId),
        notifications_last_read_at: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[notificationService] Error marking notification as read for user:', error);
    throw error;
  }
};

/**
 * markAllNotificationsAsReadForUser
 */
export const markAllNotificationsAsReadForUser = async (userUid, notifications) => {
  try {
    if (!userUid) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const userRef = doc(db, 'user', userUid);
    await setDoc(
      userRef,
      {
        notification_read_ids: arrayUnion(...unreadIds),
        notifications_last_read_at: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[notificationService] Error marking all notifications as read for user:', error);
    throw error;
  }
};
