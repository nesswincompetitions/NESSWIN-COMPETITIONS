import { Trophy, MapPin, Ticket, Calendar, Quote } from "lucide-react";
import { useTranslation } from "react-i18next";

// ─── Data ─────────────────────────────────────────────────────────────────────

const winners = [
  {
    initials: "YK",
    name: "Yoav K.",
    location: "Haïfa",
    prizeName: "Week-end Dubaï VIP pour 2 personnes",
    competitionTitle: "Week-end VIP à Dubaï — 5 Étoiles",
    priceLabel: "15 000 €",
    ticketNumber: "512",
    drawDate: "21 janvier 2026",
    quote:
      "Le tirage était en direct, tout le monde pouvait vérifier. NessWin a changé ma façon de voir les concours.",
    image:
      "https://images.unsplash.com/photo-1772176289717-cda2287be268?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080",
  },
  {
    initials: "SL",
    name: "Sarah L.",
    location: "Paris",
    prizeName: "Rolex Submariner Date 116618LV",
    competitionTitle: "Rolex Submariner Gold 18k",
    priceLabel: "48 000 €",
    ticketNumber: "1 103",
    drawDate: "15 février 2026",
    quote:
      "Transparent, professionnel, le tirage en direct m'a convaincu dès le départ. Je recommande à 100%.",
    image:
      "https://images.unsplash.com/photo-1572194812951-f9a56327d2f7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080",
  },
  {
    initials: "DM",
    name: "David M.",
    location: "Tel Aviv",
    prizeName: "Ferrari F8 Tributo",
    competitionTitle: "Ferrari F8 Tributo",
    priceLabel: "280 000 €",
    ticketNumber: "2 847",
    drawDate: "2 mars 2026",
    quote:
      "Je n'y croyais pas vraiment... jusqu'à ce que les clés soient dans ma main. Une expérience inoubliable !",
    image:
      "https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080",
  },
];

// ─── WinnerCard ───────────────────────────────────────────────────────────────

function WinnerCard({ winner }) {
  const { t } = useTranslation();
  const {
    initials,
    name,
    location,
    prizeName,
    competitionTitle,
    priceLabel,
    ticketNumber,
    drawDate,
    quote,
    image,
  } = winner;

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

          {/* Name + location + prize */}
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg font-bold leading-tight truncate text-[var(--color-foreground)]">
              {name}
            </h3>
            <p className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
              {location}
            </p>
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
              {drawDate}
            </span>
          </div>
        </div>

        {/* Testimonial quote */}
        <div className="relative pl-4">
          <Quote
            className="absolute top-0 left-0 w-3.5 h-3.5 text-[var(--color-primary)]/40"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--color-muted-foreground)] italic leading-relaxed">
            {quote}
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
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="pt-16 lg:pt-20">
        {/* Hero header */}
        <WinnersHero />

        {/* Winners grid */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {winners.map((winner) => (
              <WinnerCard key={winner.ticketNumber} winner={winner} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}