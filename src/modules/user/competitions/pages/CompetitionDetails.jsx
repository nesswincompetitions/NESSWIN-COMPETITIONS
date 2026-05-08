import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/state/AuthContext';
import { fetchCompetitionWithParticipants } from '@/modules/user/competitions/services/competitionService';
import Modal from '@/shared/components/ui/Modal';
import {
  Breadcrumb,
  ImageGallery,
  ParticipantsSection,
  PrizeVideo,
  StatsGrid,
  TicketPurchaseCard,
  WhatsIncluded,
} from '@/modules/user/competitions/components/CompetitionDetailsSections';
import { SkillGateModalContent } from '@/modules/user/competitions/components/SkillGateModalContent';
import { useCompetitionCheckout } from '@/modules/user/competitions/hooks/useCompetitionCheckout';

export default function CompetitionDetails() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  const {
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
  } = useCompetitionCheckout({
    currentUser,
    competitionId: id,
    competition: c,
    setCompetition: setC,
  });

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
                  onBuyTickets={handleBuyTickets}
                  isProcessing={isProcessing}
                  orderResult={orderResult}
                  checkoutError={checkoutError}
                />
              </div>
            </div>
          </div>

          <StatsGrid ticketPrice={c.ticketPrice} maxTickets={c.total} sold={c.sold} priceLabel={c.priceLabel} />

          <div className="lg:hidden mt-8 space-y-8">
            <WhatsIncluded items={c.included} />
            <PrizeVideo url={c.prizeVideoUrl} />
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
            remainingCount={remainingCount}
            selectedOptionId={selectedOptionId}
            setSelectedOptionId={setSelectedOptionId}
            verifyError={verifyError}
            handleVerifyAnswer={handleVerifyAnswer}
            setIsModalOpen={setIsModalOpen}
          />
        </div>
      </Modal>
    </div>
  );
}
