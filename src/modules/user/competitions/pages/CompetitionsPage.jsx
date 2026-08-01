import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useFirestorePagination } from '@/shared/hooks/useFirestorePagination';
import { orderBy } from 'firebase/firestore';
import { Clock, Flame, ShoppingCart, Sparkles, Tag, Users, Ticket, Lock, CheckCircle, Loader2 } from 'lucide-react';
import CountdownTimer from '@/shared/components/ui/CountdownTimer';
import Reveal from '@/shared/components/ui/Reveal';
import { useTranslation } from 'react-i18next';
import { getCachedCompetitionList, cacheCompetitionList } from '@/shared/services/competitionCache';
import { useUserTicketedCompetitions } from '@/modules/user/competitions/hooks/useUserTicketedCompetitions';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';

// ─── Data ────────────────────────────────────────────────────────────────────

const STATUS_FILTER_KEYS = ["all", "ongoing", "drawSoon", "soldOut", "drawing", "completed"];
const CATEGORY_FILTER_KEYS = ["allCategories", "cars", "watches", "travel", "realEstate", "tech", "other"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ type, label }) {
  const isHot = type === "hot" || type === "featured";
  const isSoldOut = type === "sold_out";
  const isWinnerAnnounced = type === "winner_announced";
  const isCompleted = type === "completed" || type === "end";
  const isDrawSoon = type === "ready_to_draw";
  const isDrawing = type === "drawing";
  const isActive = type === "active";

  let colorClasses = "bg-primary/20 text-white border-primary/40 shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]";
  
  if (isSoldOut) {
    colorClasses = "bg-red-600/35 text-white border-red-500/50 shadow-[0_0_12px_rgba(220,38,38,0.3)]";
  } else if (isCompleted || isActive || isWinnerAnnounced || isHot) {
    colorClasses = "bg-emerald-600/35 text-white border-emerald-400/50 shadow-[0_0_12px_rgba(5,150,105,0.3)]";
  } else if (isDrawing || isDrawSoon) {
    colorClasses = "bg-amber-600/35 text-white border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]";
  } else if (type === "ended") {
    colorClasses = "bg-zinc-800/80 text-zinc-400 border-zinc-700/50 grayscale";
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-[0.15em] backdrop-blur-md ${colorClasses}`}
    >
      {isCompleted ? (
        <CheckCircle className="w-3 h-3" aria-hidden="true" />
      ) : (isSoldOut || type === "ended") ? (
        <Lock className="w-3 h-3" aria-hidden="true" />
      ) : (isDrawSoon || isDrawing) ? (
        <Clock className="w-3 h-3" aria-hidden="true" />
      ) : (
        <Sparkles className="w-3 h-3" aria-hidden="true" />
      )}
      {label.toUpperCase()}
    </div>
  );
}

function CompetitionCard({ competition, hasTicket }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    id,
    image,
    badgeType,
    badgeLabel,
    ticketPrice,
    tag,
    title,
    subTitle,
    priceLabel,
    sold,
    total,
    endsAt,
    status,
  } = competition;

  const isReadyToDraw = status === 'ready_to_draw';
  const isDrawing     = status === 'drawing';
  const isSoldOut     = status === 'sold_out';
  const isWinnerAnnounced = status === 'winner_announced';
  const isCompleted = status === 'completed' || status === 'end';
  const isClosed      = (status === 'active' && endsAt && endsAt < Date.now()) || isReadyToDraw || isDrawing || isWinnerAnnounced || isCompleted;
  const isEnded       = status === 'end';
  const remaining     = total - sold;
  const progress      = isClosed ? 100 : Math.min(100, Math.round((sold / total) * 100));

  return (
    <article
      onClick={() => navigate(`/competitions/${id}`, { state: { competition, fromSearch: location.search } })}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md transform-gpu motion-reduce:transform-none h-full cursor-pointer"
      style={{
        transition:
          "transform 0.45s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.45s cubic-bezier(0.34,1.56,0.64,1), border-color 0.35s ease",
        willChange: "transform",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-10px) scale(1.012)";
        e.currentTarget.style.boxShadow =
          "0 24px 60px -8px oklch(0.78 0.14 78 / 0.28), 0 8px 24px -4px rgba(0,0,0,0.3)";
        e.currentTarget.style.borderColor = "oklch(0.78 0.14 78 / 0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.borderColor = "";
      }}
    >
      {/* ── Image block ── */}
      <div className="relative h-52 shrink-0 overflow-hidden">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/20 to-transparent" />
        <div className="absolute top-3 left-3">
          <StatusBadge 
            type={status} 
            label={
              isWinnerAnnounced ? t("common.winnerAnnounced") :
              isCompleted ? t("common.drawCompleted") :
              isEnded ? t("common.ended") : 
              isDrawing ? t("common.drawing") :
              isReadyToDraw ? t("competitionsPage.statusFilters.drawSoon") : 
              isSoldOut ? t("common.soldOut") : 
              isClosed ? t("common.closed") : 
              t("common.active")
            } 
          />
        </div>
        <div className="absolute top-3 right-3 bg-(--color-background)/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-bold text-primary flex items-center gap-1">
          <Tag className="w-3 h-3" aria-hidden="true" />
          £{ticketPrice}
        </div>
        {!isWinnerAnnounced && !isCompleted && (
          <div className="absolute bottom-3 left-3">
            <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-white/70 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded">
              {tag}
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col p-5 flex-1">
        {/* Title + price — fixed height so all cards align below */}
        <div className="min-h-18">
          <h3
            className="font-serif text-xl font-bold leading-tight line-clamp-1 text-(--color-foreground)"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            {title}
          </h3>
          {subTitle && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {subTitle}
            </p>
          )}
          <p className="text-primary font-bold text-xl mt-1">{priceLabel}</p>
        </div>

        {/* Push everything below to the bottom */}
        <div className="flex flex-col gap-3 flex-1 justify-end">
          {/* Progress block */}
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
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="relative w-full h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden"
              >
                <div
                  className="absolute left-0 top-0 h-full bg-linear-to-r from-primary via-primary to-primary/80 rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progress}%`,
                    boxShadow: progress > 0 ? '0 0 12px oklch(0.78 0.14 78 / 0.4)' : 'none'
                  }}
                />
              </div>
            </div>

          {/* Countdown + label */}
          <div className="flex items-center justify-between">
              <CountdownTimer endsAt={endsAt} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("common.beforeDraw")}
              </span>
            </div>

          {/* CTA */}
          {(isClosed || isReadyToDraw || isDrawing || isWinnerAnnounced || isCompleted) ? (
            <button
              onClick={() => navigate(`/competitions/${id}`, { state: { competition, fromSearch: location.search } })}
              className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold tracking-wide px-4 py-2 h-9 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer shadow-[0_0_15px_oklch(0.78_0.14_78/0.3)]"
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
              onClick={() => navigate(`/competitions/${id}`, { state: { competition, fromSearch: location.search } })}
              className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold tracking-wide px-4 py-2 h-9 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer shadow-[0_0_15px_oklch(0.78_0.14_78/0.3)]"
            >
              <Ticket className="w-4 h-4" aria-hidden="true" />
              {t("common.soldOut")}
            </button>
          ) : (
            <button
              onClick={() => navigate(`/competitions/${id}`, { state: { competition, fromSearch: location.search } })}
              className={`inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold tracking-wide px-4 py-2 h-9 transition-all cursor-pointer ${
                isEnded
                  ? "bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10"
                  : "bg-primary text-(--color-primary-foreground) hover:opacity-90 shadow-[0_0_15px_oklch(0.78_0.14_78/0.3)]"
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
      </div>
    </article>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ activeStatusKey, setActiveStatusKey, activeCategoryKey, setActiveCategoryKey, statusFilters, categoryFilters }) {
  return (
    <div className="space-y-4">
      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(({ key, label }) => {
          const isActive = activeStatusKey === key;
          return (
            <button
              key={key}
              onClick={() => setActiveStatusKey(key)}
              className={`px-4 py-2 rounded-full text-xs font-semibold tracking-[0.12em] uppercase transition-all duration-200 border cursor-pointer ${isActive
                ? "bg-primary text-(--color-primary-foreground) border-primary shadow-[0_0_15px_oklch(0.78_0.14_78/0.3)]"
                : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-(--color-foreground)"
                }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {categoryFilters.map(({ key, label }) => {
          const isActive = activeCategoryKey === key;
          return (
            <button
              key={key}
              onClick={() => setActiveCategoryKey(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-200 border cursor-pointer ${isActive
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-transparent border-border/50 text-muted-foreground hover:border-primary/30 hover:text-(--color-foreground)"
                }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetitionsPage() {
  const { t } = useTranslation();
  const statusFilters = STATUS_FILTER_KEYS.map((key) => ({ key, label: t(`competitionsPage.statusFilters.${key}`) }));
  const categoryFilters = CATEGORY_FILTER_KEYS.map((key) => ({ key, label: t(`competitionsPage.categoryFilters.${key}`) }));
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const categoryParam = searchParams.get('category');

  const activeStatusKey = useMemo(() => {
    return (statusParam && STATUS_FILTER_KEYS.includes(statusParam)) ? statusParam : "all";
  }, [statusParam]);

  const activeCategoryKey = useMemo(() => {
    return (categoryParam && CATEGORY_FILTER_KEYS.includes(categoryParam)) ? categoryParam : "allCategories";
  }, [categoryParam]);

  const setActiveStatusKey = (status) => {
    const params = new URLSearchParams(searchParams);
    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    setSearchParams(params, { replace: true });
  };

  const setActiveCategoryKey = (category) => {
    const params = new URLSearchParams(searchParams);
    if (category === 'allCategories') {
      params.delete('category');
    } else {
      params.set('category', category);
    }
    setSearchParams(params, { replace: true });
  };

  const [nowTs] = useState(() => Date.now());
  const { ticketedIds } = useUserTicketedCompetitions();

  const observerRef = useRef(null);
  // Track how many filtered cards were rendered before latest page loaded
  const prevFilteredCountRef = useRef(0);

  const baseConstraints = useMemo(() => [orderBy('created_at', 'desc')], []);
  const {
    items: rawCompetitions,
    loading,
    loadingMore,
    hasMore,
    nextPage: loadMore,
  } = useFirestorePagination({
    collectionName: 'competition',
    baseConstraints,
    pageSize: 12,
    mode: 'append',
  });

  // Pure infinite scroll — trigger 400px before bottom for zero-lag feel
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0, rootMargin: '400px' }
    );

    const currentRef = observerRef.current;
    if (currentRef) observer.observe(currentRef);
    return () => { if (currentRef) observer.unobserve(currentRef); };
  }, [hasMore, loadingMore, loadMore]);

  const liveCompetitions = useMemo(() => {
    return rawCompetitions
      .filter((data) => data.status !== 'draft' && data.status !== 'deleted')
      .map((data) => {
        const drawDateObj = data.draw_date?.toDate ? data.draw_date.toDate() : (data.draw_date ? new Date(data.draw_date) : null);
        return {
          id: data.id,
          image: data.image?.[0] || 'https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
          images: data.image || [],
          badgeType: data.status === 'active' ? 'new' : 'ended',
          badgeLabel: data.status,
          ticketPrice: data.ticket_price || 0,
          ticketPriceLabel: `£${data.ticket_price || 0}/ticket`,
          category: data.category || 'Other',
          tag: data.tag || '',
          title: data.title || 'Untitled',
          subTitle: data.sub_title || '',
          priceLabel: `£${data.prize_value?.toLocaleString() || 0}`,
          sold: data.sold_tickets || 0,
          total: data.total_tickets || 1000,
          endsAt: data.draw_date?.toMillis ? data.draw_date.toMillis() : (data.draw_date ? new Date(data.draw_date).getTime() : null),
          created_at: data.created_at?.toMillis ? data.created_at.toMillis() : (data.created_at ? new Date(data.created_at).getTime() : 0),
          drawDate: drawDateObj ? drawDateObj.toLocaleDateString() : '',
          drawTime: drawDateObj ? drawDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
          description: data.description || '',
          included: data.included_things || [],
          status: data.status,
          is_featured: data.is_featured || false
        };
      });
  }, [rawCompetitions]);


  const filtered = liveCompetitions.filter((c) => {
    const statusMatch =
      activeStatusKey === "all" ||
      (activeStatusKey === "ongoing" && c.status === "active") ||
      (activeStatusKey === "drawSoon" && c.status === "ready_to_draw") ||
      (activeStatusKey === "soldOut" && c.status === "sold_out") ||
      (activeStatusKey === "drawing" && c.status === "drawing") ||
      (activeStatusKey === "completed" && (c.status === "completed" || c.status === "end"));

    const categoryMap = {
      cars: ["Cars", "Luxury Car"],
      watches: ["Watches", "Luxury Watch", "Jewellery"],
      travel: ["Travel", "Dream Travel", "Experiences"],
      realEstate: ["Real Estate", "Luxury Home"],
      tech: ["Tech", "High-Tech", "Fashion"],
      allCategories: null,
    };
    const mapped = categoryMap[activeCategoryKey];
    const categoryMatch =
      activeCategoryKey === "allCategories" ||
      (mapped 
        ? mapped.some(m => c.category?.toLowerCase() === m.toLowerCase()) 
        : c.category?.toLowerCase().includes(activeCategoryKey.toLowerCase()));

    return statusMatch && categoryMatch;
  });

  // After a loadMore completes, advance the "batch start" cursor so that
  // next batch gets fresh stagger delays and existing cards stay at delay=0.
  useLayoutEffect(() => {
    if (!loadingMore) {
      prevFilteredCountRef.current = filtered.length;
    }
  }, [loadingMore, filtered.length]);

  return (
    <div className="min-h-screen bg-(--color-background)">
      <div className="pt-24 pb-20 px-0">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          {/* ── Page header ── */}
          <div className="mb-10">
            <Reveal delay={30}>
              <p className="text-xs font-bold text-primary tracking-[0.25em] uppercase mb-3">
                {t("competitionsPage.overline")}
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-4 text-(--color-foreground)">
                {t("competitionsPage.title")}
              </h1>
            </Reveal>
            <Reveal delay={130}>
              <p className="text-muted-foreground text-lg max-w-2xl">
                {t("competitionsPage.subtitle")}
              </p>
            </Reveal>
          </div>

          {/* ── Filter bar ── */}
          <div className="mb-10">
            <Reveal delay={90}>
              <FilterBar
                activeStatusKey={activeStatusKey}
                setActiveStatusKey={setActiveStatusKey}
                activeCategoryKey={activeCategoryKey}
                setActiveCategoryKey={setActiveCategoryKey}
                statusFilters={statusFilters}
                categoryFilters={categoryFilters}
              />
            </Reveal>
          </div>

          {/* ── Cards grid ── */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-full rounded-2xl bg-[var(--color-card)] animate-pulse border border-[var(--color-border)]/30 overflow-hidden flex flex-col h-[480px]">
                  <div className="h-56 bg-[var(--color-muted)]/30 relative shrink-0">
                    <div className="absolute top-3 left-3 w-16 h-6 bg-[var(--color-muted)]/50 rounded-full" />
                    <div className="absolute top-3 right-3 w-20 h-6 bg-[var(--color-muted)]/50 rounded-full" />
                  </div>
                  <div className="flex flex-col gap-3 p-5 flex-1">
                    <div className="space-y-2">
                      <div className="h-3 bg-[var(--color-muted)]/40 rounded w-1/4 mb-2" />
                      <div className="h-6 bg-[var(--color-muted)]/50 rounded w-3/4" />
                      <div className="h-4 bg-[var(--color-muted)]/30 rounded w-1/2" />
                      <div className="h-5 bg-[var(--color-muted)]/40 rounded w-1/3 mt-2" />
                    </div>
                    <div className="space-y-2 mt-2">
                      <div className="flex justify-between">
                        <div className="h-3 bg-[var(--color-muted)]/40 rounded w-1/4" />
                        <div className="h-3 bg-[var(--color-muted)]/40 rounded w-1/4" />
                      </div>
                      <div className="h-2 bg-[var(--color-muted)]/30 rounded-full w-full" />
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex gap-1">
                         <div className="h-6 w-6 bg-[var(--color-muted)]/40 rounded" />
                         <div className="h-6 w-6 bg-[var(--color-muted)]/40 rounded" />
                         <div className="h-6 w-6 bg-[var(--color-muted)]/40 rounded" />
                         <div className="h-6 w-6 bg-[var(--color-muted)]/40 rounded" />
                      </div>
                      <div className="h-3 bg-[var(--color-muted)]/30 rounded w-1/4" />
                    </div>
                    <div className="mt-auto pt-2">
                      <div className="h-10 bg-[var(--color-muted)]/40 rounded-md w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((comp, index) => {
                  const batchStart = prevFilteredCountRef.current;
                  const isNewCard = index >= batchStart;
                  // Animate new cards with a small per-card delay, capped so last card
                  // never waits more than 200ms — no visible lag
                  const delay = isNewCard
                    ? Math.min(index - batchStart, 4) * 50
                    : 0;
                  return (
                    <Reveal key={comp.id} delay={delay}>
                      <CompetitionCard
                        competition={comp}
                        hasTicket={ticketedIds.has(comp.id)}
                      />
                    </Reveal>
                  );
                })}
              </div>

              {/* Invisible sentinel — sits below grid, triggers next page load */}
              <div ref={observerRef} className="h-4 w-full mt-8" />

              {/* Subtle loading indicator — only visible while fetching */}
              {loadingMore && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary opacity-60" />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-24 text-muted-foreground">
              <p className="text-lg">{t("competitionsPage.noResults")}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
