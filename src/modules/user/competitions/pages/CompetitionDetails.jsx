import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/state/AuthContext';
import { fetchCompetitionWithParticipants } from '@/modules/user/competitions/services/competitionService';
import Modal from '@/shared/components/ui/Modal';
import { Ticket } from 'lucide-react';
import {
  Breadcrumb,
  ImageGallery,
  ParticipantsSection,
  PrizeVideo,
  StatsGrid,
  TicketPurchaseCard,
  BigCountdown,
  InstagramLiveCard,
  WhatsIncluded,
} from '@/modules/user/competitions/components/CompetitionDetailsSections';
import { SkillGateModalContent } from '@/modules/user/competitions/components/SkillGateModalContent';
import { useCompetitionCheckout } from '@/modules/user/competitions/hooks/useCompetitionCheckout';

export default function CompetitionDetails() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { currentUser, userData } = useAuth();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

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
    ticketQuantity,
    setTicketQuantity,
    isProcessing,
    checkoutError,
    orderResult,
    setOrderResult,
    pendingReferralCount,
    freeTicketsQuantity,
    setFreeTicketsQuantity,
    userHasTickets,
    userTickets,
    handleParticipateClick,
    handleVerifyAnswer,
    handleBuyTickets,
  } = useCompetitionCheckout({
    currentUser,
    userData,
    competitionId: id,
    competition: c,
    setCompetition: setC,
  });

  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState(false);

  useEffect(() => {
    if (!c || !c.endsAt || c.status === "end") return;

    const interval = setInterval(() => {
      if (Date.now() >= c.endsAt) {
        setC((prev) => ({ ...prev, status: "end" }));
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [c?.endsAt, c?.status]);

  useEffect(() => {
    const fetchCompetition = async () => {
      try {
        const competition = await fetchCompetitionWithParticipants(id);
        if (competition) {
          setC(competition);
        }
      } catch (err) {
        console.error("Error fetching competition details:", err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchCompetition();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-primary">Loading...</div>;
  }

  if (!c) {
    return <Navigate to="/competitions" replace />;
  }

  return (
    <div className="min-h-screen bg-(--color-background)">
      <div className="pt-16 lg:pt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Breadcrumb title={c.title} />

          <div className="grid lg:grid-cols-2 gap-10 xl:gap-16">
            <div className="space-y-4">
              <ImageGallery images={c.images} title={c.title} status={c.status} endsAt={c.endsAt} />

              <div className="hidden lg:block space-y-4">
                <WhatsIncluded items={c.included} />
                <PrizeVideo url={c.prizeVideoUrl} />
                <BigCountdown endsAt={c.endsAt} />
                <InstagramLiveCard url={c.instagramLiveUrl} />
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
                  ticketQuantity={ticketQuantity}
                  setTicketQuantity={setTicketQuantity}
                  pendingReferralCount={pendingReferralCount}
                  freeTicketsQuantity={freeTicketsQuantity}
                  setFreeTicketsQuantity={setFreeTicketsQuantity}
                  onBuyTickets={handleBuyTickets}
                  isProcessing={isProcessing}
                  orderResult={orderResult}
                  onBuyMore={() => setOrderResult(null)}
                  checkoutError={checkoutError}
                  userHasTickets={userHasTickets}
                  userTickets={userTickets}
                  onViewAllTickets={() => setIsTicketsModalOpen(true)}
                />
              </div>
            </div>
          </div>

          <StatsGrid ticketPrice={c.ticketPrice} maxTickets={c.total} sold={c.sold} priceLabel={c.priceLabel} />

          <div className="lg:hidden mt-8 space-y-8">
            <WhatsIncluded items={c.included} />
            <PrizeVideo url={c.prizeVideoUrl} />
            <BigCountdown endsAt={c.endsAt} />
            <InstagramLiveCard url={c.instagramLiveUrl} />
          </div>

          <ParticipantsSection participants={c.participants} />

          <div className="pb-20" />
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("common.participate")}
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
        title="Your Tickets"
        description={`You have ${userTickets.length} active entries in this competition.`}
      >
        <div className="max-w-md mx-auto w-full max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-2 gap-3 pb-4">
            {userTickets.map((tk) => (
              <div 
                key={tk.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-primary/30 transition-all group"
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
    </div>
  );
}
