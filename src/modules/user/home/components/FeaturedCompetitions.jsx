import { Link, useNavigate } from 'react-router-dom';
import { Clock, Flame, ShoppingCart, Sparkles, Users, Ticket, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';
import Badge from '@/shared/components/ui/Badge';
import CountdownTimer from '@/shared/components/ui/CountdownTimer';
import Reveal from '@/shared/components/ui/Reveal';
import { useTranslation } from 'react-i18next';
import { subscribeLiveCompetitions } from '@/modules/user/competitions/services/competitionService';
import { useUserTicketedCompetitions } from '@/modules/user/competitions/hooks/useUserTicketedCompetitions';

function CompetitionCard({ competition, onNavigate, hasTicket }) {
  const { t } = useTranslation();
  const { id, image, badgeType, badgeLabel, ticketPriceLabel, category, title, subTitle, priceLabel, sold, total, endsAt, status } = competition;
  const isReadyToDraw = status === 'ready_to_draw';
  const isDrawing     = status === 'drawing';
  const isSoldOut     = status === 'sold_out';
  const isWinnerAnnounced = status === 'winner_announced';
  const isCompleted = status === 'completed' || status === 'end';
  const isClosed      = isReadyToDraw || isDrawing || isSoldOut || isWinnerAnnounced || isCompleted;
  const isEnded       = status === 'end' || status === 'completed';
  const isDisabled    = isClosed;
  const progress      = isClosed ? 100 : Math.round((sold / total) * 100);
  const remaining     = total - sold;
  const [hovered, setHovered] = useState(false);

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-card transform-gpu"
      style={{
        border: hovered
          ? "1px solid oklch(0.78 0.14 78 / 0.38)"
          : "1px solid oklch(1 0 0 / 0.08)",
        boxShadow: hovered
          ? "0 28px 60px -10px oklch(0.78 0.14 78 / 0.28), 0 10px 28px -6px rgba(0,0,0,0.35)"
          : "0 4px 16px rgba(0,0,0,0.12)",
        transform: hovered ? "translateY(-8px) scale(1.012)" : "translateY(0) scale(1)",
        transition: "transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.8s cubic-bezier(0.25,0.46,0.45,0.94), border-color 0.6s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div className="relative h-56 overflow-hidden">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/20 to-transparent" />
        <div className="absolute top-3 left-3">
          <Badge variant={(isClosed || isReadyToDraw || isDrawing || isSoldOut || isEnded) ? "ended" : badgeType}>
            {(isClosed || isReadyToDraw || isDrawing || isSoldOut || isEnded) ? (
              <Lock className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Sparkles className="w-3 h-3" aria-hidden="true" />
            )}
            {isWinnerAnnounced
              ? t("common.winnerAnnounced").toUpperCase()
              : isCompleted
              ? t("common.drawCompleted").toUpperCase()
              : isEnded
              ? t("common.ended").toUpperCase()
              : isDrawing
              ? t("common.drawing").toUpperCase()
              : isSoldOut
              ? t("common.soldOut").toUpperCase()
              : isClosed || isReadyToDraw
              ? t("common.drawPending").toUpperCase()
              : t("common.active").toUpperCase()}
          </Badge>
        </div>
        <div className="absolute top-3 right-3 bg-(--color-background)/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-bold text-primary">
          {ticketPriceLabel}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-5 flex-1">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] mb-1">{category}</p>
          <h3 className="font-serif text-xl font-bold leading-tight line-clamp-1 text-(--color-foreground)" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>{title}</h3>
          {subTitle && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {subTitle}
            </p>
          )}
          <p className="text-primary font-semibold text-lg mt-1">{priceLabel}</p>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" aria-hidden="true" />
                {sold.toLocaleString()} {t("common.sold")}
              </span>
              <span className="text-(--color-foreground) font-medium">
                {remaining.toLocaleString()} {t("common.remaining")}
              </span>
            </div>
            <div className="relative w-full h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-linear-to-r from-primary via-primary to-primary/80 rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${progress}%`,
                  boxShadow: progress > 0 ? '0 0 12px oklch(0.78 0.14 78 / 0.4)' : 'none'
                }}
              />
            </div>
          </div>

        {/* Countdown */}
        <div className="flex items-center justify-between">
            <CountdownTimer endsAt={endsAt} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {t("common.beforeDraw")}
            </span>
          </div>

        {/* CTA */}
        {(isClosed || isReadyToDraw || isDrawing || isWinnerAnnounced || isCompleted) ? (
          <button
            onClick={() => onNavigate(id)}
            className="mt-auto inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold tracking-wide px-4 py-2 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer shadow-[0_0_15px_oklch(0.78_0.14_78/0.3)]"
          >
            {isWinnerAnnounced ? (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {t("common.winnerAnnounced")}
              </>
            ) : isCompleted ? (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {t("common.viewWinners")}
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" aria-hidden="true" />
                {isDrawing ? t("common.drawing") : t("common.drawPending")}
              </>
            )}
          </button>
        ) : isSoldOut ? (
          <button
            disabled
            className="mt-auto inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold tracking-wide px-4 py-2 bg-white/5 border border-white/10 text-muted-foreground cursor-default"
          >
            <Ticket className="w-4 h-4" aria-hidden="true" />
            {t("common.soldOut")}
          </button>
        ) : (
          <button
            onClick={() => onNavigate(id)}
            className={`mt-auto inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold tracking-wide px-4 py-2 transition-all cursor-pointer ${
              isEnded
                ? "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                : "bg-primary text-(--color-primary-foreground) hover:opacity-90"
            }`}
          >
            {isEnded ? (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {t("common.viewResults")}
              </>
            ) : hasTicket ? (
              <>
                <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                {t("common.buyMoreTickets")}
              </>
            ) : (
              <>
                <Ticket className="w-4 h-4" aria-hidden="true" />
                {t("common.participate")}
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}

export default function FeaturedCompetitions({ onLoadComplete }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [featuredComps, setFeaturedComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const { ticketedIds } = useUserTicketedCompetitions();

  useEffect(() => {
    const unsubscribe = subscribeLiveCompetitions(
      (comps) => {
        const allComps = comps.map((data) => ({
          id: data.id,
          is_featured: data.is_featured || false,
          sold: data.sold_tickets || 0,
          image: data.image?.[0] || 'https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
          images: data.image || [],
          created_at: data.created_at?.toMillis() || 0,
          badgeType: 'new',
          badgeLabel: data.status,
          ticketPriceLabel: `${data.ticket_price || 0}€/ticket`,
          category: data.category || 'Other',
          title: data.title || 'Untitled',
          subTitle: data.sub_title || '',
          priceLabel: `${data.prize_value?.toLocaleString() || 0} €`,
          total: data.total_tickets || 1000,
          endsAt: data.draw_date ? data.draw_date.toMillis() : null,
          status: data.status,
        }));

        const filtered = allComps.filter((c) => ['active', 'sold_out', 'ready_to_draw'].includes(c.status));
        const sorted = filtered.sort((a, b) => {
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          return b.created_at - a.created_at;
        });

        setFeaturedComps(sorted.slice(0, 6));
        setLoading(false);
        if (onLoadComplete) onLoadComplete();
      },
      (err) => {
        console.error('Error subscribing featured competitions:', err);
        setLoading(false);
        if (onLoadComplete) onLoadComplete();
      }
    );

    return unsubscribe;
  }, []);

  const handleNavigate = (compId) => {
    const path = `/competitions/${compId}`;
    navigate(path);
  };

  return (
    <section id="competitions" className="py-24 px-6 bg-(--color-background) scroll-mt-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <Reveal delay={30}>
            <p className="text-xs font-bold text-primary tracking-[0.25em] uppercase mb-3">
              {t("featured.overline")}
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold mb-4 text-(--color-foreground)">
              {t("featured.title")}
            </h2>
          </Reveal>
          <Reveal delay={130}>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              {t("featured.subtitle")}
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            null
          ) : featuredComps.length > 0 ? (
            featuredComps.map((comp, index) => (
              <Reveal key={comp.id} delay={index * 70}>
                <CompetitionCard
                  competition={comp}
                  onNavigate={handleNavigate}
                  hasTicket={ticketedIds.has(comp.id)}
                />
              </Reveal>
            ))
          ) : (
            <div className="col-span-full text-center py-10 text-muted-foreground">No featured competitions at the moment.</div>
          )}
        </div>

        <div className="text-center mt-12">
          <Reveal delay={120}>
            <Link
              to="/competitions"
              className="inline-flex items-center gap-2 px-6 py-2.5 border border-border rounded-md text-sm font-medium text-(--color-foreground) hover:border-primary/40 hover:bg-primary/5 transition-all tracking-wide"
            >
              {t("featured.seeAll")}
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
