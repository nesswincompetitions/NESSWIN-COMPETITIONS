import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { getSkillGateStatus, processOrder, verifySkillAnswer } from '@/modules/user/competitions/services/competitionService';

export function useCompetitionCheckout({ currentUser, competitionId, competition, setCompetition }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [gateStatus, setGateStatus] = useState("loading");
  const [remainingCount, setRemainingCount] = useState(0);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [skillPassed, setSkillPassed] = useState(false);
  const [verifiedQuestionId, setVerifiedQuestionId] = useState(null);
  const [verifiedOptionId, setVerifiedOptionId] = useState(null);

  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderResult, setOrderResult] = useState(null);

  const loadSkillGateStatus = async () => {
    if (!currentUser || !competitionId) return;
    setGateStatus("loading");
    try {
      const response = await getSkillGateStatus({ competitionId });

      setGateStatus(response.status);

      if (response.status === "eligible") {
        setSkillPassed(true);
        if (response.passedQuestionId) {
          setVerifiedQuestionId(response.passedQuestionId);
          setVerifiedOptionId(response.passedOptionId);
        }
      } else if (response.status === "needs_attempt") {
        setActiveQuestion(response.question);
        setRemainingCount(response.remainingCount);
        setSkillPassed(false);
      } else if (response.status === "locked") {
        setSkillPassed(false);
        setActiveQuestion(null);
      }
    } catch (err) {
      console.error("Error fetching skill gate status:", err);
      setGateStatus("loading");
    }
  };

  useEffect(() => {
    loadSkillGateStatus();
  }, [currentUser, competitionId]);

  const handleParticipateClick = async () => {
    if (gateStatus === "needs_attempt" && activeQuestion) {
      setIsModalOpen(true);
      setVerifyError("");
      setSelectedOptionId(null);
    } else if (gateStatus === "eligible") {
      document.getElementById("ticket-purchase-card")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleVerifyAnswer = async () => {
    if (!activeQuestion) return;
    if (selectedOptionId === null || selectedOptionId === undefined) {
      setVerifyError("Please select an answer before continuing.");
      return;
    }

    setIsVerifying(true);
    setVerifyError("");
    try {
      const result = await verifySkillAnswer({
        competitionId: competition.id,
        questionId: activeQuestion.id,
        selectedOptionId,
      });

      if (result.success) {
        setVerifiedQuestionId(activeQuestion.id);
        setVerifiedOptionId(selectedOptionId);
        setSkillPassed(true);
        setGateStatus("eligible");
        setIsModalOpen(false);
        toast.success("Skill verified! Now select your tickets.");
      } else {
        toast.error("Incorrect answer. Let's see if you get another try...");
        await loadSkillGateStatus();
        setSelectedOptionId(null);
      }
    } catch (err) {
      const msg = err?.message || "Verification failed. Please try again.";
      setVerifyError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (gateStatus === "locked" && isModalOpen) {
      setIsModalOpen(false);
      toast.error("You answered all available questions incorrectly. You are no longer eligible.");
    }
  }, [gateStatus, isModalOpen]);

  const handleBuyTickets = async () => {
    if (!verifiedQuestionId || verifiedOptionId === null) {
      toast.error("Please complete the skill gate first.");
      return;
    }

    setIsProcessing(true);
    setCheckoutError("");
    try {
      const result = await processOrder({
        competitionId: competition.id,
        ticketQuantity,
        questionId: verifiedQuestionId,
        selectedOptionId: verifiedOptionId,
      });

      if (result.success) {
        setOrderResult(result);
        setCompetition((prev) => ({
          ...prev,
          sold: prev.sold + ticketQuantity,
          total: prev.total,
        }));
        toast.success(`${ticketQuantity} ticket${ticketQuantity > 1 ? "s" : ""} purchased successfully!`);
      }
    } catch (err) {
      const msg = err?.details || err?.message || "Purchase failed. Please try again.";
      setCheckoutError(msg);
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
    remainingCount,
    isVerifying,
    verifyError,
    skillPassed,
    ticketQuantity,
    setTicketQuantity,
    isProcessing,
    checkoutError,
    orderResult,
    handleParticipateClick,
    handleVerifyAnswer,
    handleBuyTickets,
  };
}
