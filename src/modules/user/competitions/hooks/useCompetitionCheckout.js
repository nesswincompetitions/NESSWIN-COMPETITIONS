import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  orderBy,
} from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import { processOrder } from '@/modules/user/competitions/services/orderService';

// ── Cloud Function callables ───────────────────────────────────────────────────
const getSkillQuestionFn = httpsCallable(functions, 'getSkillQuestion');
const submitSkillAnswerFn = httpsCallable(functions, 'submitSkillAnswer');

/**
 * useCompetitionCheckout
 *
 * Manages the full Skill Gate → Ticket Selection → Checkout flow.
 *
 * Skill gate question fetching and answer grading are fully server-side.
 * The correct answer NEVER reaches the client.
 *
 * Gate Status Values:
 *   'idle'         — Initial state, not yet evaluated
 *   'loading'      — Gate check in progress
 *   'quiz'         — Show quiz modal
 *   'eligible'     — Passed, show ticket selector
 *   'no_questions' — Admin misconfigured, show alert
 */
export function useCompetitionCheckout({ currentUser, userData, competitionId, competition, setCompetition }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [gateStatus, setGateStatus] = useState('idle');

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [skillPassed, setSkillPassed] = useState(false);

  // Free tickets from referrals query
  const [pendingReferrals, setPendingReferrals] = useState([]);
  const pendingReferralCount = pendingReferrals.length;
  const [freeTicketsQuantity, setFreeTicketsQuantity] = useState(0);

  // Whether the user already has ≥1 ticket for this competition
  const [userHasTickets, setUserHasTickets] = useState(false);
  const [userTickets, setUserTickets] = useState([]);

  // Stores the question_answer Map to embed into the order document
  const [questionAnswerMap, setQuestionAnswerMap] = useState(null);
  // Stores the question ID for building the order
  const [resolvedQuestionId, setResolvedQuestionId] = useState(null);

  const skillAnswerStorageKey = currentUser?.uid && competitionId
    ? `nesswin_skill_answer_${currentUser.uid}_${competitionId}`
    : null;

  const persistSkillAnswer = (nextQuestionId, nextQuestionAnswerMap) => {
    if (!skillAnswerStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        skillAnswerStorageKey,
        JSON.stringify({
          questionId: nextQuestionId || null,
          questionAnswerMap: nextQuestionAnswerMap || null,
        })
      );
    } catch (err) {
      console.error('Failed to persist skill answer:', err);
    }
  };

  const restorePersistedSkillAnswer = () => {
    if (!skillAnswerStorageKey || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(skillAnswerStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.questionAnswerMap) return null;
      return parsed;
    } catch (err) {
      console.error('Failed to restore skill answer:', err);
      return null;
    }
  };

  const buildQuestionAnswerMap = (dataQuestion, answerData) => {
    if (!dataQuestion) return null;

    const options = Array.isArray(dataQuestion.option) ? dataQuestion.option : [];
    const selectedOption =
      options.find((o) => String(o.option_id) === String(answerData?.option_id)) || {};

    return {
      question_id: dataQuestion.id || answerData?.questionId || '',
      question: dataQuestion.question || '',
      option: options,
      image: dataQuestion.image || dataQuestion.images || [],
      answer: {
        option_id: selectedOption.option_id || answerData?.option_id || '',
        option: selectedOption.option || answerData?.option || '',
      },
    };
  };

  const applyPassedSkillData = (data) => {
    const restored = data?.question
      ? buildQuestionAnswerMap(data.question, {
          option_id: data.answer?.option_id,
          option: data.answer?.option,
          questionId: data.questionId,
        })
      : restorePersistedSkillAnswer();

    if (restored?.questionAnswerMap) {
      setQuestionAnswerMap(restored.questionAnswerMap);
      setResolvedQuestionId(restored.questionId || restored.questionAnswerMap.question_id || null);
      persistSkillAnswer(
        restored.questionId || restored.questionAnswerMap.question_id || null,
        restored.questionAnswerMap
      );
    } else if (data?.question) {
      const nextMap = buildQuestionAnswerMap(data.question, {
        option_id: data.answer?.option_id,
        option: data.answer?.option,
        questionId: data.questionId,
      });
      setQuestionAnswerMap(nextMap);
      setResolvedQuestionId(data.questionId || data.question?.id || null);
      persistSkillAnswer(data.questionId || data.question?.id || null, nextMap);
    }

    setSkillPassed(true);
    setGateStatus('eligible');
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Calls the getSkillQuestion Cloud Function and updates state accordingly.
   * Returns true if the modal should stay open (quiz), false if it should close.
   */
  const loadSkillQuestion = async () => {
    setGateStatus('loading');
    try {
      const { data } = await getSkillQuestionFn({ competitionId });

      if (data.passed) {
        // User already passed — immediately eligible and rebuild the answer map
        applyPassedSkillData(data);
        return false; // close modal
      }

      if (data.question) {
        setActiveQuestion(data.question);
        setSelectedOptionId(null);
        setVerifyError('');
        setGateStatus('quiz');
        return true; // keep modal open
      }

      // Unexpected response shape
      setGateStatus('idle');
      return false;
    } catch (err) {
      // Edge case 5: admin has not configured questions
      if (err?.code === 'functions/failed-precondition') {
        setGateStatus('no_questions');
        return true; // keep modal open showing the no_questions state
      }
      throw err;
    }
  };

  // ── Eager Evaluation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !competition?.id) return;
    
    let isMounted = true;
    let hasRestoredAnswer = false;

    const userRef = doc(db, 'user', currentUser.uid);
    const compRef = doc(db, 'competition', competitionId);

    const referralsQuery = query(
      collection(db, 'referrals'),
      where('referrer_id', '==', userRef),
      where('reward_issued', '==', false),
      orderBy('created_at', 'asc')
    );

    const ticketsQuery = query(
      collection(db, 'ticket'),
      where('user_id', '==', userRef),
      where('competition_id', '==', compRef),
      orderBy('created_at', 'desc')
    );

    const unsubscribeReferrals = onSnapshot(
      referralsQuery,
      (snap) => {
        if (!isMounted) return;
        setPendingReferrals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error('Error subscribing referrals:', err);
      }
    );

    const unsubscribeTickets = onSnapshot(
      ticketsQuery,
      (snap) => {
        if (!isMounted) return;
        const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUserTickets(tickets);
        setUserHasTickets(tickets.length > 0);

        if (tickets.length > 0) {
          setSkillPassed(true);
          setGateStatus('eligible');
        }
      },
      (err) => {
        console.error('Error subscribing user tickets:', err);
      }
    );

    const restored = restorePersistedSkillAnswer();
    if (restored?.questionAnswerMap) {
      setQuestionAnswerMap(restored.questionAnswerMap);
      setResolvedQuestionId(restored.questionId || restored.questionAnswerMap.question_id || null);
      setSkillPassed(true);
      setGateStatus('eligible');
      hasRestoredAnswer = true;
    }

    // Pre-load the skill gate question if verified
    if (userData?.is_verified) {
      const preLoadGate = async () => {
        try {
          const { data } = await getSkillQuestionFn({ competitionId });
          if (!isMounted) return;

          if (data.passed) {
            applyPassedSkillData(data);
          } else if (hasRestoredAnswer) {
            setGateStatus('eligible');
          } else if (data.question) {
            setActiveQuestion(data.question);
            setGateStatus('quiz_ready');
          } else {
            setGateStatus('idle');
          }
        } catch (err) {
          if (!isMounted) return;
          if (err?.code === 'functions/failed-precondition') {
            setGateStatus('no_questions');
          } else {
            console.error('[Eager Skill Gate Load] Error:', err);
            setGateStatus('idle');
          }
        }
      };
      preLoadGate();
    }

    return () => {
      isMounted = false;
      unsubscribeReferrals();
      unsubscribeTickets();
    };
  }, [currentUser?.uid, userData?.is_verified, competition?.id]);

  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [orderResult, setOrderResult] = useState(null);

  // ── Handle "Participate" Click ─────────────────────────────────────────────
  const handleParticipateClick = async () => {
    if (!currentUser || !userData?.is_verified) {
      toast.error('Complete signup and phone verification before purchasing tickets.');
      return;
    }
    if (!userData?.date_of_birth) {
      toast.error('Please complete your age verification in onboarding before participating.');
      return;
    }
    if (!competition) return;

    // Already eligible — scroll to the ticket card
    if (skillPassed || gateStatus === 'eligible') {
      document.getElementById('ticket-purchase-card')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // Quiz pre-loaded eagerly — just open the modal
    if (gateStatus === 'quiz_ready' && activeQuestion) {
      setVerifyError('');
      setSelectedOptionId(null);
      setGateStatus('quiz');
      setIsModalOpen(true);
      return;
    }

    // No questions configured
    if (gateStatus === 'no_questions') {
      setIsModalOpen(true);
      return;
    }

    // Fallback: lazy-load the question now
    setIsModalOpen(true);
    try {
      const shouldStayOpen = await loadSkillQuestion();
      if (!shouldStayOpen) {
        setIsModalOpen(false);
        document.getElementById('ticket-purchase-card')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      setGateStatus('idle');
      setIsModalOpen(false);
      toast.error(err?.message || 'Could not load quiz. Please try again.');
    }
  };

  // ── Handle Quiz Answer Submission ──────────────────────────────────────────
  const handleVerifyAnswer = async () => {
    if (!activeQuestion) return;
    if (selectedOptionId === null || selectedOptionId === undefined) {
      setVerifyError('Please select an answer before continuing.');
      return;
    }

    setIsVerifying(true);
    setVerifyError('');

    try {
      const { data } = await submitSkillAnswerFn({
        competitionId,
        selectedOptionId,
      });

      if (data.passed) {
        // Find the selected option details for the answer map
        const options = activeQuestion.option || [];
        const selectedOption = options.find((o) => o.option_id === selectedOptionId) || {};

        // Build the question_answer Map to embed in the order
        const nextMap = {
          question_id: data.questionId,
          question: activeQuestion.question || '',
          option: options,
          image: activeQuestion.image || activeQuestion.images || [],
          answer: {
            option_id: selectedOption.option_id || String(selectedOptionId),
            option:    selectedOption.option    || '',
          },
        };
        setQuestionAnswerMap(nextMap);
        setResolvedQuestionId(data.questionId);
        persistSkillAnswer(data.questionId, nextMap);
        setSkillPassed(true);
        setGateStatus('eligible');
        setIsModalOpen(false);
        toast.success('Skill verified! Now select your tickets.');
      } else {
        // Wrong answer — server already incremented attempt_number and cleared the active question.
        toast.error('Incorrect answer. Loading the next question.');
        setSelectedOptionId(null);
        await loadSkillQuestion();
      }
    } catch (err) {
      const msg = err?.message || 'Verification failed. Please try again.';
      setVerifyError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  // ── Handle Ticket Purchase ─────────────────────────────────────────────────
  const handleBuyTickets = async () => {
    if (!currentUser || !userData?.is_verified) {
      toast.error('Complete signup and phone verification before purchasing tickets.');
      return;
    }
    if (!userData?.date_of_birth) {
      toast.error('Please complete your age verification in onboarding before purchasing tickets.');
      return;
    }
    if (!skillPassed) {
      toast.error('Please complete the skill gate first.');
      return;
    }
    if (!resolvedQuestionId && !questionAnswerMap) {
      toast.error('Skill gate data missing. Please click Participate again.');
      return;
    }

    setIsProcessing(true);
    setCheckoutError('');

    try {
      const result = await processOrder({
        competitionId: competition.id,
        competitionTitle: competition.title,
        ticketQuantity,
        questionId: resolvedQuestionId,
        questionAnswer: questionAnswerMap,
        currentUser,
        freeTicketsToUse: freeTicketsQuantity,
        referralsToBurn: pendingReferrals.slice(0, freeTicketsQuantity),
      });

      setOrderResult(result);
      setUserHasTickets(true);
      persistSkillAnswer(null, null);
      try {
        if (skillAnswerStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(skillAnswerStorageKey);
        }
      } catch (err) {
        console.error('Failed to clear persisted skill answer:', err);
      }

      // Refresh ticket list
      const userRef = doc(db, 'user', currentUser.uid);
      const compRef = doc(db, 'competition', competition.id);
      const q = query(
        collection(db, 'ticket'),
        where('user_id', '==', userRef),
        where('competition_id', '==', compRef),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      setUserTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Optimistically update competition stats in UI
      setCompetition((prev) => ({
        ...prev,
        sold: prev.sold + ticketQuantity + (result.freeTickets || 0),
      }));

      const total = ticketQuantity + (result.freeTickets || 0);
      toast.success(`${total} ticket${total > 1 ? 's' : ''} purchased successfully!`);
    } catch (err) {
      const msg = err?.message || 'Purchase failed. Please try again.';
      setCheckoutError(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    // Modal
    isModalOpen,
    setIsModalOpen,
    // Quiz state
    activeQuestion,
    selectedOptionId,
    setSelectedOptionId,
    gateStatus,
    isVerifying,
    verifyError,
    skillPassed,
    // Referrals (full array for useCheckout, count for UI)
    pendingReferrals,
    pendingReferralCount,
    // Question answer (for useCheckout)
    questionAnswerMap,
    resolvedQuestionId,
    // User ticket state
    userHasTickets,
    userTickets,
    // Handlers
    handleParticipateClick,
    handleVerifyAnswer,
  };
}
