import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  collection,
  query,
  where,
  getDocs,
  doc
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  checkSkillGateStatus,
  submitSkillAnswer,
} from '@/modules/user/competitions/services/competitionService';
import { processOrder } from '@/modules/user/competitions/services/orderService';

/**
 * useCompetitionCheckout
 *
 * Manages the full Skill Gate → Ticket Selection → Checkout flow.
 *
 * Gate Status Values:
 *   'idle'         — Initial state, not yet evaluated
 *   'loading'      — Gate check in progress
 *   'quiz'         — Show quiz modal (Case C)
 *   'eligible'     — Passed, show ticket selector (Case B / A)
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

  // Free tickets from referrals query (replaces old wallet balance)
  const [pendingReferrals, setPendingReferrals] = useState([]);
  const pendingReferralCount = pendingReferrals.length;
  const [useFreeTickets, setUseFreeTickets] = useState(false);

  // Stores the question_answer Map to embed into the order document
  const [questionAnswerMap, setQuestionAnswerMap] = useState(null);
  // Stores the question ID for building the order (Case A/B path)
  const [resolvedQuestionId, setResolvedQuestionId] = useState(null);
  // In-memory only — never rendered — the correct answer for local grading
  const correctAnswerId = useRef(null);
  // Ensures eager evaluation only runs once
  const hasEvaluated = useRef(false);

  // ── Eager Evaluation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !userData?.is_verified || !competition) return;
    if (hasEvaluated.current) return;

    hasEvaluated.current = true;
    let isMounted = true;

    const loadReferrals = async () => {
      try {
        const userRef = doc(db, 'user', currentUser.uid);
        const q = query(
          collection(db, 'referrals'),
          where('referrer_id', '==', userRef),
          where('reward_issued', '==', false)
        );
        const snap = await getDocs(q);
        if (isMounted) {
          setPendingReferrals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error("Error loading referrals:", err);
      }
    };
    loadReferrals();

    const preLoadGateStatus = async () => {
      setGateStatus('loading');
      try {
        const result = await checkSkillGateStatus(competition, currentUser, userData);
        if (!isMounted) return;

        if (result.status === 'existing_buyer') {
          setQuestionAnswerMap(result.questionAnswer);
          setResolvedQuestionId(result.questionId);
          setSkillPassed(true);
          setGateStatus('eligible');
        } else if (result.status === 'eligible') {
          setQuestionAnswerMap(result.questionAnswer);
          setResolvedQuestionId(result.questionId);
          setSkillPassed(true);
          setGateStatus('eligible');
        } else if (result.status === 'quiz') {
          setActiveQuestion(result.question);
          correctAnswerId.current = result._correctAnswerId;
          setGateStatus('quiz_ready');
        } else if (result.status === 'no_questions') {
          setGateStatus('no_questions');
        }
      } catch (err) {
        console.error('[Eager Skill Gate Load] Error:', err);
        if (isMounted) setGateStatus('idle');
      }
    };

    preLoadGateStatus();

    return () => { isMounted = false; };
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
    if (!competition) return;

    // If already eligible (eagerly evaluated), just scroll to the ticket card
    if (skillPassed || gateStatus === 'eligible') {
      document.getElementById('ticket-purchase-card')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // If quiz is pre-loaded and ready
    if (gateStatus === 'quiz_ready') {
      setVerifyError('');
      setSelectedOptionId(null);
      setGateStatus('quiz');
      setIsModalOpen(true);
      return;
    }

    // If no questions were found eagerly
    if (gateStatus === 'no_questions') {
      setIsModalOpen(true);
      return;
    }

    // Fallback: If eager load hasn't finished, wait and lazy-load it
    setGateStatus('loading');
    setIsModalOpen(true);

    try {
      const result = await checkSkillGateStatus(competition, currentUser, userData);

      if (result.status === 'existing_buyer') {
        setQuestionAnswerMap(result.questionAnswer);
        setResolvedQuestionId(result.questionId);
        setSkillPassed(true);
        setGateStatus('eligible');
        setIsModalOpen(false);
        document.getElementById('ticket-purchase-card')?.scrollIntoView({ behavior: 'smooth' });
      } else if (result.status === 'eligible') {
        setQuestionAnswerMap(result.questionAnswer);
        setResolvedQuestionId(result.questionId);
        setSkillPassed(true);
        setGateStatus('eligible');
        setIsModalOpen(false);
        document.getElementById('ticket-purchase-card')?.scrollIntoView({ behavior: 'smooth' });
      } else if (result.status === 'quiz') {
        setActiveQuestion(result.question);
        correctAnswerId.current = result._correctAnswerId;
        setGateStatus('quiz');
        setVerifyError('');
        setSelectedOptionId(null);
      } else if (result.status === 'no_questions') {
        setGateStatus('no_questions');
      }
    } catch (err) {
      console.error('[handleParticipateClick] Error:', err);
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
      const result = await submitSkillAnswer(
        competitionId,
        activeQuestion,
        selectedOptionId,
        correctAnswerId.current,
        currentUser
      );

      if (result.passed) {
        // Build the question_answer Map to embed in the order (mirrors backend shape)
        setQuestionAnswerMap({
          question_id: activeQuestion.id,
          question: activeQuestion.question || '',
          option: activeQuestion.option || [],
          // answer field intentionally omitted (answer is not in sanitizedQuestion)
          image: activeQuestion.images || [],
        });
        setResolvedQuestionId(result.questionId);
        setSkillPassed(true);
        setGateStatus('eligible');
        setIsModalOpen(false);
        toast.success('Skill verified! Now select your tickets.');
      } else {
        // Wrong answer — UI error only, unlimited attempts, zero DB writes
        setVerifyError('Incorrect answer. Please try again.');
        setSelectedOptionId(null);
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
        freeTicketsToUse: useFreeTickets ? pendingReferralCount : 0,
        referralsToBurn: useFreeTickets ? pendingReferrals : [],
      });

      setOrderResult(result);

      // Optimistically update the competition stats in UI
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
    isModalOpen,
    setIsModalOpen,
    activeQuestion,
    selectedOptionId,
    setSelectedOptionId,
    gateStatus,
    isVerifying,
    verifyError,
    skillPassed,
    ticketQuantity,
    setTicketQuantity,
    isProcessing,
    checkoutError,
    orderResult,
    pendingReferralCount,
    useFreeTickets,
    setUseFreeTickets,
    handleParticipateClick,
    handleVerifyAnswer,
    handleBuyTickets,
  };
}
