import { useEffect, useState, useCallback } from 'react';
import { Navigate, useParams, useLocation } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';
import { subscribeCompetitionWithParticipants } from '@/modules/user/competitions/services/competitionService';
import Modal from '@/shared/components/ui/Modal';
import { Ticket, Trophy, Star, Quote } from 'lucide-react';
import {
  Breadcrumb,
  ImageGallery,
  ParticipantsSection,
  StatsGrid,
  TicketPurchaseCard,
  BigCountdown,
  InstagramLiveCard,
  WhatsIncluded,
  WinnerHallOfFame,
  Confetti,
} from '@/modules/user/competitions/components/CompetitionDetailsSections';
import WinnerReviewForm from '@/modules/user/competitions/components/WinnerReviewForm';
import { SkillGateModalContent } from '@/modules/user/competitions/components/SkillGateModalContent';
import { useCompetitionCheckout } from '@/modules/user/competitions/hooks/useCompetitionCheckout';
import { useCheckout } from '@/modules/user/competitions/hooks/useCheckout';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';

const WinnerAnnouncement = ({ winnerName, ticketNumber, isWinner, comment, rating, date, isLoading }) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/3 p-8 mb-8 text-center animate-pulse">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-white/5" />
          <div className="space-y-2">
            <div className="h-4 w-24 bg-white/5 rounded mx-auto" />
            <div className="h-8 w-48 bg-white/5 rounded mx-auto" />
          </div>
          <div className="h-10 w-32 bg-white/5 rounded-xl mx-auto" />
        </div>
      </div>
    );
  }

  const hasTestimonial = !!comment;
  const formattedDate = date ? (date.toMillis ? new Date(date.toMillis()).toLocaleDateString() : new Date(date).toLocaleDateString()) : null;

  return (
    <motion.div 
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
      style={{ willChange: "transform, opacity" }}
      className={`relative overflow-hidden rounded-[2rem] border mb-8 shadow-xl ${
        isWinner 
          ? 'bg-primary/5 border-primary/20 shadow-[0_0_50px_-10px_rgba(var(--color-primary-rgb),0.15)]' 
          : 'bg-white/3 border-white/10'
      }`}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <Confetti />
      </div>
      
      <div className={`grid ${hasTestimonial ? 'md:grid-cols-2' : 'grid-cols-1'} divide-y md:divide-y-0 md:divide-x divide-white/10`}>
        <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${
            isWinner ? 'bg-primary/10 border border-primary/20' : 'bg-white/5 border border-white/10'
          }`}>
            <Trophy className={`h-6 w-6 ${isWinner ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
              {isWinner ? t('competitionDetails.winningCard.youWon') : t('competitionDetails.winningCard.officialWinner')}
            </p>
            <h2 className="text-2xl font-serif font-black text-white tracking-tight uppercase leading-tight">
              {isWinner ? t('competitionDetails.winningCard.congratulations') : (winnerName || t('competitionDetails.winningCard.announced'))}
            </h2>
          </div>

          <div className="px-5 py-2 rounded-xl bg-white/5 border border-white/10">
            <p className="text-[9px] text-muted-foreground uppercase tracking-[0.1em] mb-0.5 font-bold">
              {t('competitionDetails.winningCard.winningTicket')}
            </p>
            <p className="text-xl font-mono font-black text-primary">#{ticketNumber || '---'}</p>
          </div>
        </div>

        {hasTestimonial && (
          <div className="p-8 bg-white/[0.02] flex flex-col justify-center relative">
            <Quote className="absolute top-6 right-8 text-primary/5 w-16 h-16 pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    className={i < Math.floor(rating || 5) ? "fill-amber-500 text-amber-500" : "text-white/10"}
                  />
                ))}
              </div>
              <p className="text-sm font-medium text-white/90 italic leading-relaxed">
                "{comment}"
              </p>
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{winnerName}</span>
                <span className="text-[10px] text-white/20 uppercase tracking-tighter">
                  {formattedDate || t('competitionDetails.winningCard.recentWinner')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const CompetitionSkeleton = () => {
  return (
    <div className="min-h-screen bg-(--color-background) pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex gap-2 mb-8 items-center">
          <div className="h-4 w-20 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-4 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
        </div>

        <div className="h-48 w-full bg-white/5 border border-white/5 rounded-[2rem] mb-12 animate-pulse" />

        <div className="grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-12">
            <div className="aspect-4/3 w-full bg-white/5 rounded-3xl animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 bg-white/5 rounded animate-pulse" />
              <div className="h-20 w-full bg-white/5 rounded animate-pulse" />
            </div>
          </div>
          <div className="space-y-8">
            <div className="h-[400px] w-full bg-white/5 border border-white/5 rounded-3xl animate-pulse" />
            <div className="h-32 w-full bg-white/5 border border-white/5 rounded-3xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
};

const UserTicketsDisplay = ({ tickets, onViewAll }) => {
  const { t } = useTranslation();
  if (!tickets || tickets.length === 0) return null;

  return (
    <div className="mb-8 bg-white/2 border border-white/5 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Ticket className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            {t('competitionDetails.yourEntries.yourEntriesTitle')}
          </h3>
        </div>
        <button
          onClick={onViewAll}
          className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline cursor-pointer"
        >
          {t('competitionDetails.yourEntries.viewAll')} ({tickets.length})
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
        {tickets.slice(0, 7).map((tk) => (
          <div key={tk.id} className="h-10 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center">
            <span className="text-[11px] font-mono font-bold text-muted-foreground">{tk.ticket_sequence}</span>
          </div>
        ))}
        {tickets.length > 7 && (
          <button onClick={onViewAll} className="h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-all">
            <span className="text-[10px] font-bold text-primary">
              +{tickets.length - 7} {t('competitionDetails.yourEntries.more')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export default function CompetitionDetails() {
  const { id } = useParams();
  const location = useLocation();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { userData, loading: userLoading } = useUserData();
  
  const initialComp = location.state?.competition 
    ? { ...location.state.competition, participants: location.state.competition.participants || [] }
    : null;
    
  const [c, setC] = useState(initialComp);
  const [loading, setLoading] = useState(!initialComp || userLoading);

  useEffect(() => {
    if (!userLoading && initialComp) {
      setLoading(false);
    }
  }, [userLoading, initialComp]);

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

  const onOrderSuccess = useCallback((result) => {
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

  useEffect(() => {
    window.scrollTo(0, 0);

    if (!id) {
      setLoading(false);
      return undefined;
    }

    if (!c) setLoading(true);
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

  if (!c && !loading) {
    return <Navigate to="/competitions" replace />;
  }

  if (loading && !c) {
    return <CompetitionSkeleton />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div 
        key={id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
        style={{ willChange: "transform, opacity" }}
        className="min-h-screen bg-(--color-background)"
      >
        <div className="pt-16 lg:pt-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Breadcrumb title={c.title} />
          
          {(loading || c?.status === 'completed' || c?.status === 'winner_announced' || c?.status === 'end') ? (
            <>
              <WinnerAnnouncement 
                winnerName={c?.winner_name} 
                ticketNumber={c?.winner_ticket_number} 
                isWinner={typeof c?.winner_ref === 'string' ? c.winner_ref === currentUser?.uid : c?.winner_ref?.id === currentUser?.uid}
                comment={c?.winner_comment}
                rating={c?.winner_rating}
                date={c?.winner_review_at}
                isLoading={loading || !c?.winner_name} 
              />
              
              {!loading && (
                <UserTicketsDisplay 
                  tickets={userTickets} 
                  onViewAll={() => setIsTicketsModalOpen(true)} 
                />
              )}
            </>
          ) : null}
          
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

          <div className="pb-20" />
        </div>
      </div>

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

      <Modal
        isOpen={isTicketsModalOpen}
        onClose={() => setIsTicketsModalOpen(false)}
        title={t('competitionDetails.yourEntries.yourTicketsTitle')}
        description={t('competitionDetails.yourEntries.activeEntriesDesc', { count: userTickets.length })}
      >
        <div className="max-w-md mx-auto w-full max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-2 gap-3 pb-4">
            {userTickets.map((tk) => (
              <div
                key={tk.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-white/3 border border-white/10 hover:border-primary/30 transition-all group"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-primary/70 transition-colors">
                    {t('competitionDetails.yourEntries.ticketId')}
                  </span>
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
            {t('competitionDetails.yourEntries.close')}
          </button>
        </div>
      </Modal>
    </motion.div>
  </AnimatePresence>
  );
}
