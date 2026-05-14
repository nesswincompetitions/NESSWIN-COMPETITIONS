import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

const getUserRef = (userRefLike) => {
  if (!userRefLike) {
    throw new Error('A valid user reference is required.');
  }

  if (typeof userRefLike === 'string') {
    return doc(db, 'user', userRefLike);
  }

  return userRefLike;
};

const getRefPath = (refLike) => refLike?.path ?? '';

const buildSupportUnavailableError = () => {
  const error = new Error('No support agents are online right now. Please try again later.');
  error.code = 'support/no-online-admins';
  return error;
};

export const createSupportChat = async (currentUserRefLike) => {
  const currentUserRef = getUserRef(currentUserRefLike);

  const existingChatQuery = query(
    collection(db, 'chats'),
    where('chat_type', '==', 'support'),
    where('status', '==', 'active'),
    where('participants', 'array-contains', currentUserRef)
  );
  let existingChatSnap;
  try {
    existingChatSnap = await getDocs(existingChatQuery);
  } catch (error) {
    if (error.message?.includes("index")) {
      console.error("FIRESTORE MISSING INDEX:", error.message);
    }
    throw error;
  }

  if (!existingChatSnap.empty) {
    return existingChatSnap.docs[0].id;
  }

  const adminsQuery = query(
    collection(db, 'user'),
    where('role', '==', 'admin'),
    where('is_online', '==', true),
    orderBy('active_chats', 'asc'),
    limit(1)
  );

  let adminsSnap;
  try {
    adminsSnap = await getDocs(adminsQuery);
  } catch (error) {
    if (error.message?.includes("index")) {
      console.error("FIRESTORE MISSING INDEX:", error.message);
    }
    throw error;
  }
  const selectedAdmin = adminsSnap.docs.find((adminDoc) => getRefPath(adminDoc.ref) !== getRefPath(currentUserRef));

  if (!selectedAdmin) {
    throw buildSupportUnavailableError();
  }

  const adminRef = selectedAdmin.ref;
  const chatRef = doc(collection(db, 'chats'));

  await runTransaction(db, async (transaction) => {
    const adminSnap = await transaction.get(adminRef);

    if (!adminSnap.exists()) {
      throw buildSupportUnavailableError();
    }

    const adminData = adminSnap.data();

    if (adminData.role !== 'admin' || adminData.is_online !== true) {
      throw buildSupportUnavailableError();
    }

    transaction.update(adminRef, {
      active_chats: increment(1),
      last_assigned_at: serverTimestamp(),
    });

    transaction.set(chatRef, {
      participants: [currentUserRef, adminRef],
      chat_type: 'support',
      status: 'active',
      sender_id: currentUserRef,
      receiver_id: adminRef,
      assigned_admin_id: adminRef,
      unread_sender_count: 0,
      unread_receiver_count: 0,
      last_message: '',
      created_at: serverTimestamp(),
      last_message_time: serverTimestamp(),
    });
  });

  return chatRef.id;
};

export const sendMessage = async (chatId, senderRefLike, receiverRefLike, textMessage, imageUrl, isSenderAdmin) => {
  const senderRef = getUserRef(senderRefLike);
  const receiverRef = getUserRef(receiverRefLike);
  const chatRef = doc(db, 'chats', chatId);
  const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
  const trimmedMessage = textMessage?.trim() ?? '';
  const lastMessage = trimmedMessage || (imageUrl ? 'Image attached' : '');

  const batch = writeBatch(db);

  batch.set(messageRef, {
    sender_id: senderRef,
    receiver_id: receiverRef,
    message: trimmedMessage,
    image: imageUrl || '',
    is_seen: false,
    is_delivered: false,
    created_at: serverTimestamp(),
  });

  batch.update(chatRef, {
    last_message: lastMessage,
    last_message_time: serverTimestamp(),
    ...(isSenderAdmin
      ? { unread_receiver_count: increment(1) }
      : { unread_sender_count: increment(1) }),
  });

  await batch.commit();
};

export const markMessagesAsRead = async (chatId, currentUserRefLike, isCurrentUserAdmin) => {
  const currentUserRef = getUserRef(currentUserRefLike);
  const chatRef = doc(db, 'chats', chatId);
  const messagesQuery = query(
    collection(db, 'chats', chatId, 'messages'),
    where('receiver_id', '==', currentUserRef),
    where('is_seen', '==', false)
  );
  const messagesSnap = await getDocs(messagesQuery);

  if (messagesSnap.empty) {
    await updateDoc(chatRef, isCurrentUserAdmin
      ? { unread_sender_count: 0 }
      : { unread_receiver_count: 0 });
    return;
  }

  const batch = writeBatch(db);

  messagesSnap.docs.forEach((messageDoc) => {
    batch.update(messageDoc.ref, {
      is_delivered: true,
      is_seen: true,
    });
  });

  batch.update(chatRef, isCurrentUserAdmin
    ? { unread_sender_count: 0 }
    : { unread_receiver_count: 0 });

  await batch.commit();
};

export const closeSupportChat = async (chatId, closedByRefLike, assignedAdminRefLike) => {
  const closedByRef = getUserRef(closedByRefLike);
  const assignedAdminRef = getUserRef(assignedAdminRefLike);
  const chatRef = doc(db, 'chats', chatId);

  await runTransaction(db, async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    const adminSnap = await transaction.get(assignedAdminRef);

    if (!chatSnap.exists()) {
      throw new Error('Support chat not found.');
    }

    if (!adminSnap.exists()) {
      throw buildSupportUnavailableError();
    }

    const adminData = adminSnap.data();
    const nextActiveChats = Math.max(0, Number(adminData.active_chats ?? 0) - 1);

    transaction.update(chatRef, {
      status: 'closed',
      closed_by: closedByRef,
      closed_at: serverTimestamp(),
    });

    transaction.update(assignedAdminRef, {
      active_chats: nextActiveChats,
    });
  });
};

/**
 * onActiveUserChatsSnapshot
 * 
 * Sets up a real-time listener for all active chats where the current user
 * is a participant. This includes both 'support' and 'winner_chat' types.
 * 
 * @param {string} userUid - The UID of the current user
 * @param {Function} callback - Success callback receiving the chats array
 * @returns {Function} - Unsubscribe function
 */
export const onActiveUserChatsSnapshot = (userUid, callback) => {
  if (!userUid) return () => {};

  const userRef = getUserRef(userUid);
  const chatsRef = collection(db, 'chats');

  const q = query(
    chatsRef,
    where('participants', 'array-contains', userRef),
    where('status', '==', 'active'),
    orderBy('last_message_time', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const chats = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(chats);
    },
    (error) => {
      console.error('[supportChatService] Error fetching user chats:', error);
      if (error.message?.includes("index")) {
        console.error("FIRESTORE MISSING INDEX LINK:", error.message);
      }
    }
  );
};

/**
 * onUserChatHistorySnapshot
 * 
 * Sets up a real-time listener for all closed chats where the current user
 * was a participant.
 * 
 * @param {string} userUid - The UID of the current user
 * @param {Function} callback - Success callback receiving the chats array
 * @returns {Function} - Unsubscribe function
 */
export const onUserChatHistorySnapshot = (userUid, callback) => {
  if (!userUid) return () => {};

  const userRef = getUserRef(userUid);
  const chatsRef = collection(db, 'chats');

  const q = query(
    chatsRef,
    where('participants', 'array-contains', userRef),
    where('status', '==', 'closed'),
    orderBy('last_message_time', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const chats = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(chats);
    },
    (error) => {
      console.error('[supportChatService] Error fetching chat history:', error);
      if (error.message?.includes("index")) {
        console.error("FIRESTORE MISSING INDEX LINK:", error.message);
      }
    }
  );
};