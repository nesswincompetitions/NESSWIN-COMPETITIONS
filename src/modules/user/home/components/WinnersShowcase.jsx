import React, { useState, useEffect } from 'react';
import { Trophy, Calendar, Quote, Loader2 } from 'lucide-react';
import Reveal from '@/shared/components/ui/Reveal';
import { useTranslation } from 'react-i18next';
import { subscribeRecentWinners } from '../../competitions/services/competitionService';

const COLOR_THEMES = [
  {
    accentFrom: "from-red-500/20",
    accentTo: "to-orange-500/10",
    trophyColor: "text-red-400",
    badgeColor: "text-red-400",
  },
  {
    accentFrom: "from-yellow-500/20",
    accentTo: "to-amber-500/10",
    trophyColor: "text-yellow-400",
    badgeColor: "text-yellow-400",
  },
  {
    accentFrom: "from-blue-500/20",
    accentTo: "to-cyan-500/10",
    trophyColor: "text-blue-400",
    badgeColor: "text-blue-400",
  },
  {
    accentFrom: "from-purple-500/20",
    accentTo: "to-violet-500/10",
    trophyColor: "text-purple-400",
    badgeColor: "text-purple-400",
  }
];


function WinnerCard({ winner }) {
  const { i18n, t } = useTranslation();
  const { initials, name, prizeName, amount, quote, drawDateRaw, ticketPrice, accentFrom, accentTo, trophyColor, badgeColor } = winner;

  // Localized placeholder
  const noCommentsLabel = t("winnersShowcase.noComments");
  const isNoQuote = !quote || quote === "";

  // Localized date
  const formattedDate = drawDateRaw 
    ? new Intl.DateTimeFormat(i18n.language, { month: 'short', year: 'numeric' }).format(drawDateRaw)
    : "—";

  return (
    <article className={`relative flex flex-col gap-4 p-5 rounded-2xl border border-border/60 bg-card overflow-hidden group`}>
      {/* Hover gradient */}
      <div className={`absolute inset-0 bg-linear-to-br ${accentFrom} ${accentTo} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      {!isNoQuote && (
        <Quote className="w-6 h-6 text-primary/20 absolute top-4 right-4" aria-hidden="true" />
      )}

      {/* Winner header */}
      <div className="flex items-center gap-3 relative z-10">
        <div className="w-12 h-12 rounded-full border-2 border-primary/30 flex items-center justify-center font-serif text-lg font-bold bg-linear-to-br from-primary/20 to-primary/5 text-(--color-foreground) shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-sm text-(--color-foreground)">{name}</p>
        </div>
      </div>

      <div className="relative z-10 space-y-1">
        <div className="flex items-center gap-1.5">
          <Trophy className={`w-3.5 h-3.5 ${trophyColor}`} aria-hidden="true" />
          <span className={`text-xs font-bold tracking-wide uppercase ${badgeColor}`}>{t("winnersShowcase.prizeWon")}</span>
        </div>
        <p className="font-serif text-base font-bold leading-tight text-(--color-foreground)">{prizeName}</p>
        <p className="text-primary font-semibold text-sm">{amount}</p>
      </div>

      {/* Quote */}
      <p className={`text-sm leading-relaxed relative z-10 flex-1 ${isNoQuote ? "text-muted-foreground/50 not-italic" : "text-muted-foreground italic"}`}>
        {isNoQuote ? noCommentsLabel : `"${quote}"`}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground relative z-10 pt-2 border-t border-border/40">
        <span className="flex items-center gap-1">
          <Calendar className="w-2.5 h-2.5" aria-hidden="true" />
          {formattedDate}
        </span>
        <span>
          {t("winnersShowcase.tickets")}: <span className="text-(--color-foreground) font-medium">{ticketPrice}</span>
        </span>
      </div>
    </article>
  );
}

export default function WinnersShowcase() {
  const { t } = useTranslation();
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeRecentWinners(4, (data) => {
      // Add theme colors back to the dynamic data
      const themedWinners = data.map((w, index) => ({
        ...w,
        ...COLOR_THEMES[index % COLOR_THEMES.length]
      }));
      setWinners(themedWinners);
      setLoading(false);
    }, (err) => {
      console.error('Failed to subscribe winners showcase:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (!loading && winners.length === 0) return null;

  return (
    <section id="winners" className="py-24 px-6 bg-(--color-background) scroll-mt-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <Reveal delay={20}>
            <p className="text-xs font-bold text-primary tracking-[0.25em] uppercase mb-3">
              {t("winnersShowcase.overline")}
            </p>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold mb-4 text-(--color-foreground)">
              {t("winnersShowcase.title")}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              {t("winnersShowcase.subtitle")}
            </p>
          </Reveal>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {loading ? (
             Array.from({ length: 4 }).map((_, i) => (
               <div key={i} className="w-full sm:w-[calc(50%-1.5rem)] lg:w-[calc(25%-1.5rem)] h-[300px] rounded-2xl bg-card animate-pulse border border-border/60" />
             ))
          ) : (
            winners.map((w, index) => (
              <Reveal key={w.id} delay={index * 70} className="w-full sm:w-[calc(50%-1.5rem)] lg:w-[calc(25%-1.5rem)] min-w-[280px] max-w-[320px]">
                <WinnerCard winner={w} />
              </Reveal>
            ))
          )}
        </div>

        {/* Social proof banner */}
        <Reveal delay={150}>
          <div className="mt-14 rounded-2xl border border-primary/20 bg-linear-to-br from-primary/8 to-primary/3 p-8 sm:p-12 text-center">
            <Trophy className="w-10 h-10 text-primary mx-auto mb-4" aria-hidden="true" />
            <h3 className="font-serif text-2xl sm:text-3xl font-bold mb-3 text-(--color-foreground)">
              {t("winnersShowcase.launchTitle")}
            </h3>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
              {t("winnersShowcase.launchText")}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
