import React, { useState, useEffect } from 'react';
import { Trophy, Ticket, Calendar, Quote, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { subscribeRecentWinners } from '../services/competitionService';


// ─── WinnerCard ───────────────────────────────────────────────────────────────

function WinnerCard({ winner }) {
  const { t } = useTranslation();
  const {
    initials,
    name,
    prizeName,
    competitionTitle,
    priceLabel,
    ticketNumber,
    drawDateRaw,
    quote,
    image,
  } = winner;

  const { i18n } = useTranslation();
  const noCommentsLabel = t("winnersPage.noComments") || t("winnersShowcase.noComments");
  const isNoQuote = !quote || quote === "";

  const formattedDate = drawDateRaw 
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }).format(drawDateRaw)
    : "—";

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] hover:border-[var(--color-primary)]/30 hover:shadow-xl hover:shadow-[var(--color-primary)]/10 transition-all duration-300">

      {/* ── Prize image ── */}
      <div className="relative h-40 overflow-hidden">
        <img
          src={image}
          alt={competitionTitle}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-card)] to-transparent" />
        <div className="absolute bottom-3 right-3 bg-[var(--color-primary)]/90 backdrop-blur-sm text-[var(--color-primary-foreground)] px-3 py-1 rounded-full text-sm font-bold">
          {priceLabel}
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Winner identity row */}
        <div className="flex items-start gap-4">
          {/* Avatar with trophy badge */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/20 border-2 border-[var(--color-primary)]/40 flex items-center justify-center text-[var(--color-primary)] font-bold text-xl">
              {initials}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--color-primary)] flex items-center justify-center shadow-lg">
              <Trophy
                className="w-3 h-3 text-[var(--color-primary-foreground)]"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Name + prize */}
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg font-bold leading-tight truncate text-[var(--color-foreground)]">
              {name}
            </h3>
            <p className="text-[var(--color-primary)] font-semibold text-sm mt-1 line-clamp-1">
              {prizeName}
            </p>
          </div>
        </div>

        {/* Competition meta panel */}
        <div className="bg-[var(--color-muted)]/30 rounded-xl p-3 space-y-1.5">
          <p className="text-xs text-[var(--color-muted-foreground)] font-medium tracking-wide uppercase">
            {competitionTitle}
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[var(--color-foreground)]">
              <Ticket
                className="w-3.5 h-3.5 text-[var(--color-primary)]"
                aria-hidden="true"
              />
              {t("winnersPage.ticket")} #{ticketNumber}
            </span>
            <span className="flex items-center gap-1 text-[var(--color-muted-foreground)]">
              <Calendar className="w-3 h-3" aria-hidden="true" />
              {formattedDate}
            </span>
          </div>
        </div>

        {/* Testimonial quote */}
        <div className="relative pl-4 flex-1">
          {!isNoQuote && (
            <Quote
              className="absolute top-0 left-0 w-3.5 h-3.5 text-[var(--color-primary)]/40"
              aria-hidden="true"
            />
          )}
          <p className={`text-sm leading-relaxed ${isNoQuote ? "text-[var(--color-muted-foreground)]/50 not-italic" : "text-[var(--color-muted-foreground)] italic"}`}>
            {isNoQuote ? noCommentsLabel : quote}
          </p>
        </div>

      </div>
    </article>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function WinnersHero() {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-hidden bg-[var(--color-background)]">
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-[var(--color-primary)]/6 rounded-full blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          {/* Trophy icon */}
          <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 flex items-center justify-center shadow-[0_0_30px_oklch(0.78_0.14_78/0.3)]">
            <Trophy
              className="w-8 h-8 text-[var(--color-primary)]"
              aria-hidden="true"
            />
          </div>

          <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase">
            {t("winnersPage.hallOfFame")}
          </p>

          <h1 className="font-serif text-5xl sm:text-6xl font-bold text-[var(--color-foreground)]">
            {t("winnersPage.title")}
          </h1>

          <p className="text-[var(--color-muted-foreground)] text-lg max-w-xl">
            {t("winnersPage.subtitle")}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WinnersPage() {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeRecentWinners(4, (data) => {
      setWinners(data);
      setLoading(false);
    }, (err) => {
      console.error('Failed to subscribe winners:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="pt-16 lg:pt-20">
        {/* Hero header */}
        <WinnersHero />

        {/* Winners grid */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-16">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-[var(--color-primary)] animate-spin" />
            </div>
          ) : winners.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[var(--color-muted-foreground)] text-lg">
                No winners announced yet. Check back soon!
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-6">
              {winners.map((winner) => (
                <div key={winner.id} className="w-full sm:w-[calc(50%-1.5rem)] lg:w-[calc(25%-1.5rem)] min-w-[300px] max-w-[380px]">
                  <WinnerCard winner={winner} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
