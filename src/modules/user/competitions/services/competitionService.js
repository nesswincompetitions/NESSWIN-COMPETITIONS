import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  limit,
  orderBy,
  writeBatch,
  arrayUnion,
  serverTimestamp,
  getCountFromServer,
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

// ─── MODULE 1: Skill Gate ─────────────────────────────────────────────────────

/**
 * Evaluates which step the user is at in the Skill Gate flow.
 *
 * Returns one of:
 *   { status: 'existing_buyer',  questionAnswer: Map }   → Case A
 *   { status: 'eligible',        questionId: string }    → Case B
 *   { status: 'quiz',            question: Object }      → Case C
 *   { status: 'no_questions' }                           → Admin misconfiguration
 *
 * @param {Object} competition  - The competition object (from fetchCompetitionWithParticipants)
 * @param {Object} currentUser  - Firebase Auth user
 * @param {Object} userData     - Firestore user document data (from AuthContext)
 */
export const checkSkillGateStatus = async (competition, currentUser, userData) => {
  const uid = currentUser.uid;
  const userRef = doc(db, 'user', uid);
  const compRef = doc(db, 'competition', competition.id);

  // ── Step 1: Memory checks (zero DB reads) ──────────────────────────────────
  // Check A: Is this user already in the participants array?
  const isExistingBuyer = competition.rawParticipants?.some(
    (ref) => (typeof ref === 'string' ? ref : ref?.id) === uid
  );

  // Check B: Did they already pass the quiz for this competition?
  const hasPassedQuiz = userData?.competition_answered?.some(
    (ref) => ref?.id === competition.id
  );

  // ── CASE A: Existing Buyer ─────────────────────────────────────────────────
  if (isExistingBuyer) {
    try {
      const q = query(
        collection(db, 'order'),
        where('user_ref', '==', userRef),
        where('competition_id', '==', compRef),
        orderBy('created_at', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const orderData = snap.docs[0].data();
        const questionAnswerMap = orderData.question_answer || null;
        const questionId = questionAnswerMap?.question_id || null;

        // Only return if we have a valid question_id — otherwise fall through
        if (questionAnswerMap && questionId) {
          return {
            status: 'existing_buyer',
            questionAnswer: questionAnswerMap,
            questionId,
          };
        }
      }
      // Fallback: order doc missing or corrupted Map — treat as Case B
    } catch (err) {
      console.warn('[SkillGate] Case A query failed, falling back to Case B:', err);
      // Fall through to Case B below
    }
  }

  // ── CASE B: Passed Quiz, No Purchase Yet ───────────────────────────────────
  if (hasPassedQuiz) {
    try {
      const q = query(
        collection(db, 'skill_attempts'),
        where('user_id', '==', userRef),
        where('competition_id', '==', compRef),
        where('passed', '==', true),
        limit(1)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const attemptData = snap.docs[0].data();
        const questionId = attemptData.question_id?.id || attemptData.question_id;

        // Fetch the actual question document to build the Map for the order
        let questionAnswerMap = null;
        if (questionId) {
          const qDoc = await getDoc(doc(db, 'questions', questionId));
          if (qDoc.exists()) {
            const qData = qDoc.data();
            questionAnswerMap = {
              question_id: questionId,
              question: qData.question || '',
              option: qData.option || [],
              image: qData.images || [],
            };
          }
        }

        return {
          status: 'eligible',
          questionId,
          questionAnswer: questionAnswerMap,
        };
      }
      // Fallback: skill_attempts doc missing (e.g. tampered local state) — treat as Case C
    } catch (err) {
      console.warn('[SkillGate] Case B query failed, falling back to Case C:', err);
      // Fall through to Case C below
    }
  }

  // ── CASE C: Brand New User — Must Take Quiz ────────────────────────────────
  try {
    const q = query(
      collection(db, 'questions'),
      where('competition_id', '==', compRef)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      // Admin forgot to add questions
      return { status: 'no_questions' };
    }

    const questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Pick a random question and sanitize it (strip the correct answer)
    const randomIndex = Math.floor(Math.random() * questions.length);
    const selected = questions[randomIndex];
    // eslint-disable-next-line no-unused-vars
    const { answer, created_at, updated_at, competition_id, ...sanitizedQuestion } = selected;

    return {
      status: 'quiz',
      question: sanitizedQuestion,
      // Store the correct answer in memory only — never in state that touches UI
      _correctAnswerId: answer?.option_id,
    };
  } catch (err) {
    console.error('[SkillGate] Case C query failed:', err);
    throw new Error('Failed to load quiz. Please try again.');
  }
};

/**
 * Verifies the user's skill answer locally (no DB write on wrong answer).
 * On a correct answer, performs a Batch Write:
 *   Write 1: Create skill_attempts document
 *   Write 2: Update user.competition_answered with arrayUnion(compRef)
 *
 * @param {string} competitionId
 * @param {Object} question    - The sanitized question object (with .id)
 * @param {number|string} selectedOptionId
 * @param {number|string} correctAnswerId  - From the _correctAnswerId returned by checkSkillGateStatus
 * @param {Object} currentUser
 * @returns {{ passed: boolean, questionId: string }}
 */
export const submitSkillAnswer = async (competitionId, question, selectedOptionId, correctAnswerId, currentUser) => {
  // ── Grade locally (no DB write on wrong) ───────────────────────────────────
  // eslint-disable-next-line eqeqeq
  const passed = String(selectedOptionId) == String(correctAnswerId);

  if (!passed) {
    return { passed: false, questionId: question.id };
  }

  // ── RIGHT ANSWER: Batch Write ──────────────────────────────────────────────
  const uid = currentUser.uid;
  const userRef = doc(db, 'user', uid);
  const compRef = doc(db, 'competition', competitionId);
  const questionRef = doc(db, 'questions', question.id);
  const attemptRef = doc(collection(db, 'skill_attempts'));

  // Find the selected option text for the record
  const selectedOption = question.option?.find(
    (opt) => String(opt.option_id) === String(selectedOptionId)
  );
  const answerGivenText = selectedOption ? selectedOption.option : String(selectedOptionId);

  const batch = writeBatch(db);

  // Write 1: Create skill_attempts document
  batch.set(attemptRef, {
    user_id: userRef,
    competition_id: compRef,
    question_id: questionRef,
    answer_given: answerGivenText,
    passed: true,
    attempt_number: 1,
    attempted_at: serverTimestamp(),
  });

  // Write 2: Update user profile with compRef (DocumentReference, not raw string)
  batch.update(userRef, {
    competition_answered: arrayUnion(compRef),
  });

  await batch.commit();

  return { passed: true, questionId: question.id };
};
