import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  getCountFromServer,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

// ─── Storage Helper ──────────────────────────────────────────────────────────

/**
 * Uploads an array of File objects to Firebase Storage and returns download URLs.
 */
export const uploadImages = async (files, folderPath) => {
  if (!files || files.length === 0) return [];
  const uploadPromises = files.map(async (file) => {
    if (file instanceof File) {
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `${folderPath}/${fileName}`);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    }
    return file;
  });
  return await Promise.all(uploadPromises);
};

// ─── Competition Fetch ────────────────────────────────────────────────────────

/**
 * Fetches a single live competition by ID with resolved participants.
 * Also returns `rawParticipants` (raw DocumentReference[]) for membership checks.
 */
export const fetchCompetitionWithParticipants = async (id) => {
  const compDoc = await getDoc(doc(db, 'competition', id));
  if (!compDoc.exists()) return null;

  const data = compDoc.data();
  const rawDate = data.draw_date;
  const drawDateObj = rawDate?.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);

  // Keep the raw refs for isExistingBuyer / hasPassedQuiz checks in the hook
  const rawParticipants = data.participants || [];

  const resolvedParticipants = await Promise.all(
    rawParticipants.slice(0, 15).map(async (participantRef) => {
      try {
        const userRef = typeof participantRef === 'string'
          ? (participantRef.includes('/') ? doc(db, participantRef) : doc(db, 'user', participantRef))
          : participantRef;
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          
          let ticketsCount = 1;
          try {
            const ticketsQuery = query(
              collection(db, 'ticket'),
              where('competition_id', '==', compDoc.ref),
              where('user_id', '==', userRef)
            );
            const countSnap = await getCountFromServer(ticketsQuery);
            ticketsCount = countSnap.data().count;
            
            // Fallback for older string-based IDs if count is 0
            if (ticketsCount === 0) {
              const strQuery = query(
                collection(db, 'ticket'),
                where('competition_id', '==', id),
                where('user_id', '==', userRef.id)
              );
              const strCountSnap = await getCountFromServer(strQuery);
              ticketsCount = strCountSnap.data().count;
            }
          } catch (err) {
            console.error('Error fetching ticket count for participant:', err);
          }

          return { name: userData.display_name || userData.name || 'Anonymous User', tickets: ticketsCount };
        }
      } catch (e) {
        console.error('Error fetching participant:', e);
      }
      return null;
    })
  );

  return {
    id: compDoc.id,
    image: data.image?.[0] || 'https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    images: data.image?.length > 0 ? data.image : ['https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080'],
    badgeType: data.status === 'active' ? 'new' : 'ended',
    badgeLabel: data.is_featured ? 'Featured' : (data.status === 'active' ? 'Active' : data.status),
    ticketPrice: data.ticket_price || 0,
    ticketPriceLabel: `${data.ticket_price || 0}€/ticket`,
    category: data.category || 'Other',
    tag: data.tag || '',
    title: data.title || 'Untitled',
    subTitle: data.sub_title || '',
    priceLabel: `${data.prize_value?.toLocaleString() || 0} €`,
    sold: Number(data.sold_tickets || 0),
    total: Number(data.total_tickets || 1000),
    endsAt: data.draw_date ? data.draw_date.toMillis() : null,
    drawDate: drawDateObj ? drawDateObj.toLocaleDateString() : '',
    drawTime: drawDateObj ? drawDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    description: data.description || '',
    included: data.included_things || [],
    prizeVideoUrl: data.prize_video_url || '',
    instagramLiveUrl: data.instagram_live_url || '',
    status: data.status,
    docRef: compDoc.ref,
    rawParticipants,                                          // ← raw refs for membership check
    participants: resolvedParticipants.filter((p) => p !== null),
  };
};

/**
 * Fetches all live competitions (excluding drafts and deleted).
 */
export const fetchLiveCompetitions = async () => {
  const q = query(collection(db, 'competition'), where('status', 'not-in', ['draft', 'deleted']));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ─── Skill Gate ───────────────────────────────────────────────────────────────
// NOTE: All skill gate logic (question selection, answer grading, attempt tracking)
// is now handled server-side via Cloud Functions:
//   - getSkillQuestion  (functions/controllers/skillGateController.js)
//   - submitSkillAnswer (functions/controllers/skillGateController.js)
//
// The frontend calls these via httpsCallable — see useCompetitionCheckout.js.

/**
 * Submits a winner review for a completed competition.
 * 
 * @param {string} competitionId 
 * @param {string} userId 
 * @param {string} comment 
 * @param {number} rating 
 */
export const submitWinnerReview = async (competitionId, userId, comment, rating) => {
  const compRef = doc(db, 'competition', competitionId);
  const compSnap = await getDoc(compRef);
  
  if (!compSnap.exists()) throw new Error('Competition not found');
  
  const data = compSnap.data();
  
  // Validation
  if (data.status !== 'completed') {
    throw new Error('Review can only be submitted after the prize handover is complete.');
  }
  
  const winnerRef = data.winner_ref;
  const winnerId = typeof winnerRef === 'string' ? winnerRef : winnerRef?.id;
  
  if (winnerId !== userId) {
    throw new Error('Only the winner of this competition can submit a review.');
  }
  
  await updateDoc(compRef, {
    winner_comment: comment,
    winner_rating: Number(rating),
    winner_review_at: serverTimestamp()
  });
  
  return { success: true };
};
