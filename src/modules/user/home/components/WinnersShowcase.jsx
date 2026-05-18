import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Calendar, Quote, Loader2 } from 'lucide-react';
import Reveal from '@/shared/components/ui/Reveal';
import { useTranslation } from 'react-i18next';
import { subscribeRecentWinners, getPlatformWinnersCount } from '../../competitions/services/competitionService';

// ─── VideoModal ─────────────────────────────────────────────────────────────

function VideoModal({ videoUrl, onClose }) {
  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={onClose}
      style={{
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div 
        className="relative w-full max-w-3xl rounded-3xl border border-border/40 bg-card overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-muted/10">
          <h3 className="font-serif text-lg font-bold text-foreground flex items-center gap-2">
            <span>Prize Handover Video</span> 🎁
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer bg-muted/40 hover:scale-105 active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Video Player */}
        <div className="aspect-video w-full bg-black flex items-center justify-center">
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full h-full object-contain shadow-inner"
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

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


function WinnerCard({ winner, onWatchVideo }) {
  const { i18n, t } = useTranslation();
  const { initials, name, photoUrl, handoverVideoUrl, prizeName, amount, quote, drawDateRaw, ticketPrice, accentFrom, accentTo, trophyColor, badgeColor } = winner;

  // Localized placeholder
  const isNoQuote = !quote || quote === "";

  // Localized date
  const formattedDate = drawDateRaw 
    ? new Intl.DateTimeFormat(i18n.language, { month: 'short', year: 'numeric' }).format(drawDateRaw)
    : "—";

  return (
    <article className={`relative flex flex-col gap-4 p-5 rounded-2xl border border-border/60 bg-card overflow-hidden group h-full justify-between`}>
      {/* Hover gradient */}
      <div className={`absolute inset-0 bg-linear-to-br ${accentFrom} ${accentTo} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      {!isNoQuote && (
        <Quote className="w-6 h-6 text-primary/20 absolute top-4 right-4" aria-hidden="true" />
      )}

      {/* Winner header */}
      <div className="flex items-center gap-3 relative z-10 shrink-0">
        <div className="w-12 h-12 rounded-full border-2 border-primary/30 flex items-center justify-center font-serif text-lg font-bold bg-linear-to-br from-primary/20 to-primary/5 text-(--color-foreground) shrink-0 overflow-hidden">
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div>
          <p className="font-semibold text-sm text-(--color-foreground)">{name}</p>
        </div>
      </div>

      <div className="relative z-10 space-y-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <Trophy className={`w-3.5 h-3.5 ${trophyColor}`} aria-hidden="true" />
          <span className={`text-xs font-bold tracking-wide uppercase ${badgeColor}`}>{t("winnersShowcase.prizeWon")}</span>
        </div>
        <p className="font-serif text-base font-bold leading-tight text-(--color-foreground)">{prizeName}</p>
        <p className="text-primary font-semibold text-sm">{amount}</p>
      </div>

      {/* Quote */}
      {!isNoQuote && (
        <p className="text-sm leading-relaxed relative z-10 flex-1 text-muted-foreground italic">
          "{quote}"
        </p>
      )}

      {/* Handover Video Button */}
      {handoverVideoUrl && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWatchVideo(handoverVideoUrl);
          }}
          className="w-full h-8 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_20px_rgba(245,158,11,0.35)] cursor-pointer mt-1 relative z-10 shrink-0"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-black"></span>
          </span>
          View Handover Video
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground relative z-10 pt-2 border-t border-border/40 shrink-0">
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
  const [totalWinnersCount, setTotalWinnersCount] = useState(1247);
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);

  useEffect(() => {
    const fetchCount = async () => {
      const count = await getPlatformWinnersCount();
      if (count > 0) setTotalWinnersCount(count);
    };
    fetchCount();
  }, []);

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
                <WinnerCard winner={w} onWatchVideo={setActiveVideoUrl} />
              </Reveal>
            ))
          )}
        </div>

        {/* Social proof banner */}
        <Reveal delay={150}>
          <div className="mt-14 rounded-2xl border border-primary/20 bg-linear-to-br from-primary/8 to-primary/3 p-8 sm:p-12 text-center">
            <Trophy className="w-10 h-10 text-primary mx-auto mb-4" aria-hidden="true" />
            <h3 className="font-serif text-2xl sm:text-3xl font-bold mb-3 text-(--color-foreground)">
              {t("winnersShowcase.launchTitle", { count: totalWinnersCount.toLocaleString() })}
            </h3>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
              {t("winnersShowcase.launchText")}
            </p>
          </div>
        </Reveal>
      </div>

      {activeVideoUrl && (
        <VideoModal videoUrl={activeVideoUrl} onClose={() => setActiveVideoUrl(null)} />
      )}
    </section>
  );
}
