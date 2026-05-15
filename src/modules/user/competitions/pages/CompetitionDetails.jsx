import { useEffect, useState, useCallback } from 'react';
import { Navigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';
import { subscribeCompetitionWithParticipants } from '@/modules/user/competitions/services/competitionService';
import Modal from '@/shared/components/ui/Modal';
import { Ticket } from 'lucide-react';
import {
  Breadcrumb,
  ImageGallery,
  ParticipantsSection,
  StatsGrid,
  TicketPurchaseCard,
  BigCountdown,
  InstagramLiveCard,
  WhatsIncluded,
  ReviewSection,
} from '@/modules/user/competitions/components/CompetitionDetailsSections';
import WinnerReviewForm from '@/modules/user/competitions/components/WinnerReviewForm';
import { SkillGateModalContent } from '@/modules/user/competitions/components/SkillGateModalContent';
import { useCompetitionCheckout } from '@/modules/user/competitions/hooks/useCompetitionCheckout';
import { useCheckout } from '@/modules/user/competitions/hooks/useCheckout';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';

export default function CompetitionDetails() {
  const { id } = useParams();
  const location = useLocation();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { userData, loading: userLoading } = useUserData();
  
  // Initial state from navigation if available
  const initialComp = location.state?.competition 
    ? { ...location.state.competition, participants: location.state.competition.participants || [] }
    : null;
    
  const [c, setC] = useState(initialComp);
  // Only stop loading if we have initial data AND auth state is resolved
  const [loading, setLoading] = useState(!initialComp || userLoading);

  // Sync loading state with auth loading
  useEffect(() => {
    if (!userLoading && initialComp) {
      setLoading(false);
    }
  }, [userLoading, initialComp]);

  // ── Skill Gate hook (manages quiz modal, eligibility check) ─────────────────
  const {
    isModalOpen,
    setIsModalOpen,
    activeQuestion,
    selectedOptionId,
    setSelectedOptionId,
    gateStatus,
    isVerifying,
    verifyError,
    skillPassed,
    pendingReferrals,
    pendingReferralCount,
    userHasTickets,
    userTickets,
    handleParticipateClick,
    handleVerifyAnswer,
    questionAnswerMap,
    resolvedQuestionId,
  } = useCompetitionCheckout({
    currentUser,
    userData,
    competitionId: id,
    competition: c,
    setCompetition: setC,
  });

  // ── Checkout hook (manages ticket selection + order submission) ─────────────
  const onOrderSuccess = useCallback((result) => {
    // Optimistically update competition stats in UI
    setC((prev) => prev ? ({
      ...prev,
      sold: prev.sold + result.tickets.length,
    }) : prev);
  }, []);

  const {
    paidTicketQty,
    referralTicketsToUse,
    maxReferralTickets,
    handleSetPaidQty,
    handleSetReferralQty,
    bonusTickets,
    totalTickets,
    totalAmount,
    subtotal,
    discountAmt,
    isZeroPayment,
    isProcessing,
    checkoutError,
    orderResult,
    resetOrder,
    submitOrder,
  } = useCheckout({
    currentUser,
    competition: c,
    pendingReferrals,
    resolvedQuestionId,
    questionAnswerMap,
    onSuccess: onOrderSuccess,
  });

  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState(false);

  // ── Fetch competition ────────────────────────────────────────────────────────
  useEffect(() => {
    window.scrollTo(0, 0);

    if (!id) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = subscribeCompetitionWithParticipants(
      id,
      (competition) => {
        setC(competition);
        setLoading(false);
      },
      (err) => {
        console.error('Error subscribing competition details:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!c) {
    return <Navigate to="/competitions" replace />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div 
        key={id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="min-h-screen bg-(--color-background)"
      >
        <div className="pt-16 lg:pt-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Breadcrumb title={c.title} />
          
          {/* Winner Review Section */}
          {currentUser && c?.status === 'completed' && (
            (() => {
              const winnerId = typeof c.winner_ref === 'string' ? c.winner_ref : c.winner_ref?.id;
              const isWinner = winnerId === currentUser.uid;
              
              if (isWinner) {
                return (
                  <div className="mb-12">
                    <WinnerReviewForm 
                      competitionId={c.id} 
                      userId={currentUser.uid} 
                      alreadyReviewed={!!c.winner_comment}
                    />
                  </div>
                );
              }
              return null;
            })()
          )}

          <div className="grid lg:grid-cols-2 gap-10 xl:gap-16">
            <div className="space-y-4">
              <ImageGallery images={c.images} title={c.title} status={c.status} endsAt={c.endsAt} />

              <div className="hidden lg:block space-y-4">
                <WhatsIncluded items={c.included} />
                {(c.status === 'active' || c.status === 'sold_out') && (
                  <BigCountdown endsAt={c.endsAt} />
                )}
                {(c.status === 'drawing' || c.status === 'ready_to_draw') && c.instagramLiveUrl && (
                  <InstagramLiveCard url={c.instagramLiveUrl} />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div>
                <p className="text-xs font-bold text-primary tracking-[0.25em] uppercase mb-2">{c.tag}</p>
                <h1 className="font-serif text-4xl font-bold leading-tight text-(--color-foreground)">{c.title}</h1>
                {c.subTitle && <p className="text-lg text-muted-foreground mt-1">{c.subTitle}</p>}
                <p className="text-3xl font-bold text-primary mt-2">{c.priceLabel}</p>
              </div>

              <p className="text-muted-foreground leading-relaxed">{c.description}</p>

              <hr className="border-0 h-px bg-border" />

              <div id="ticket-purchase-card">
                <TicketPurchaseCard
                  competition={{ ...c, onParticipate: handleParticipateClick, gateStatus }}
                  skillPassed={skillPassed}
                  // useCheckout props
                  paidTicketQty={paidTicketQty}
                  setPaidTicketQty={handleSetPaidQty}
                  referralTicketsToUse={referralTicketsToUse}
                  setReferralTickets={handleSetReferralQty}
                  bonusTickets={bonusTickets}
                  totalTickets={totalTickets}
                  totalAmount={totalAmount}
                  subtotal={subtotal}
                  discountAmt={discountAmt}
                  isZeroPayment={isZeroPayment}
                  onSubmitOrder={submitOrder}
                  isProcessing={isProcessing}
                  orderResult={orderResult}
                  onBuyMore={resetOrder}
                  checkoutError={checkoutError}
                  userHasTickets={userHasTickets}
                  userTickets={userTickets}
                  onViewAllTickets={() => setIsTicketsModalOpen(true)}
                  pendingReferralCount={pendingReferralCount}
                />
              </div>
            </div>
          </div>

          <StatsGrid ticketPrice={c.ticketPrice} maxTickets={c.total} sold={c.sold} priceLabel={c.priceLabel} />

          <div className="lg:hidden mt-8 space-y-8">
            <WhatsIncluded items={c.included} />
            {(c.status === 'active' || c.status === 'sold_out') && (
              <BigCountdown endsAt={c.endsAt} />
            )}
            {(c.status === 'drawing' || c.status === 'ready_to_draw') && c.instagramLiveUrl && (
              <InstagramLiveCard url={c.instagramLiveUrl} />
            )}
          </div>

          <ParticipantsSection participants={c.participants} />

          {c.status === 'completed' && c.winner_comment && (
            <ReviewSection 
              winnerName={c.participants?.find(p => p.id === (typeof c.winner_ref === 'string' ? c.winner_ref : c.winner_ref?.id))?.name || 'The Winner'}
              comment={c.winner_comment}
              rating={c.winner_rating}
              date={c.winner_review_at?.toMillis ? c.winner_review_at.toMillis() : c.winner_review_at}
            />
          )}

          <div className="pb-20" />
        </div>
      </div>

      {/* Skill Gate Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('common.participate')}
        description="Verify your skill to enter the draw."
      >
        <div className="max-w-md mx-auto w-full">
          <SkillGateModalContent
            gateStatus={gateStatus}
            isVerifying={isVerifying}
            activeQuestion={activeQuestion}
            selectedOptionId={selectedOptionId}
            setSelectedOptionId={setSelectedOptionId}
            verifyError={verifyError}
            handleVerifyAnswer={handleVerifyAnswer}
            setIsModalOpen={setIsModalOpen}
          />
        </div>
      </Modal>

      {/* User Tickets Modal */}
      <Modal
        isOpen={isTicketsModalOpen}
        onClose={() => setIsTicketsModalOpen(false)}
        title="Your Tickets"
        description={`You have ${userTickets.length} active entries in this competition.`}
      >
        <div className="max-w-md mx-auto w-full max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-2 gap-3 pb-4">
            {userTickets.map((tk) => (
              <div
                key={tk.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-white/3 border border-white/10 hover:border-primary/30 transition-all group"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-primary/70 transition-colors">Ticket ID</span>
                  <span className="text-sm font-mono font-bold text-white group-hover:text-primary transition-colors">{tk.ticket_sequence}</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Ticket className="w-4 h-4 text-primary" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-border/40 text-center">
          <button
            onClick={() => setIsTicketsModalOpen(false)}
            className="w-full py-3 rounded-xl bg-primary text-black font-black uppercase tracking-widest text-xs hover:opacity-90 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </Modal>
    </motion.div>
  </AnimatePresence>
  );
}
