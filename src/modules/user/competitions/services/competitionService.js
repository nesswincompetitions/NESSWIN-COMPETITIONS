import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { callFunction } from '@/shared/services/functionClient';

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

/**
 * Fetches a single live competition by ID with resolved participants.
 */
export const fetchCompetitionWithParticipants = async (id) => {
  const compDoc = await getDoc(doc(db, 'competition', id));
  if (!compDoc.exists()) return null;

  const data = compDoc.data();
  const rawDate = data.draw_date;
  const drawDateObj = rawDate?.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);

  const participantRefs = data.participants || [];
  const resolvedParticipants = await Promise.all(
    participantRefs.slice(0, 15).map(async (ref) => {
      try {
        const userRef = typeof ref === 'string'
          ? (ref.includes('/') ? doc(db, ref) : doc(db, 'user', ref))
          : ref;
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          return { name: userData.display_name || userData.name || 'Anonymous User', tickets: 1 };
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
    status: data.status,
    docRef: compDoc.ref,
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


/**
 * Phase 1 — Skill Gate Status Check
 * Evaluates user's eligibility securely on the backend
 * @param {{ competitionId: string }} payload
 * @returns {Promise<{ status: string, question?: object, message?: string, remainingCount?: number, passedQuestionId?: string, passedOptionId?: string }>}
 */
export const getSkillGateStatus = async (payload) => {
  return callFunction("getSkillGateStatus", payload, "Failed to load skill gate status.");
};

/**
 * Phase 1 — Skill Gate: Verifies the user's skill answer
 * @param {{ competitionId: string, questionId: string, selectedOptionId: string|number }} payload
 * @returns {Promise<{ success: boolean }>}
 */
export const verifySkillAnswer = async (payload) => {
  return callFunction("verifySkillAnswer", payload, "Failed to verify answer.");
};

/**
 * Phase 2 — Order Engine: Processes the mock checkout atomically
 * @param {{ competitionId: string, ticketQuantity: number, questionId: string, selectedOptionId: string|number }} payload
 * @returns {Promise<{ success: boolean, orderId: string, tickets: Array, totalAmount: number }>}
 */
export const processOrder = async (payload) => {
  return callFunction("processOrder", payload, "Failed to process checkout.");
};
