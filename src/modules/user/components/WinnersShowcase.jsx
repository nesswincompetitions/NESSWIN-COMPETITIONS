import { Trophy, MapPin, Calendar, Quote } from "lucide-react";
import Reveal from "../../../components/ui/Reveal.jsx";
import { useTranslation } from "react-i18next";

const winners = [
  {
    initials: "DM",
    name: "David M.",
    location: "Tel Aviv, Israël",
    prize: "Ferrari F8 Tributo",
    amount: "280 000 €",
    quote: "Je n'y croyais pas vraiment... jusqu'à ce que les clés soient dans ma main. Une expérience inoubliable !",
    date: "Mars 2025",
    ticketPrice: "50 €",
    accentFrom: "from-red-500/20",
    accentTo: "to-orange-500/10",
    trophyColor: "text-red-400",
    badgeColor: "text-red-400",
  },
  {
    initials: "SL",
    name: "Sarah L.",
    location: "Paris, France",
    prize: "Rolex Submariner Gold",
    amount: "45 000 €",
    quote: "Transparent, professionnel, le tirage en direct m'a convaincu dès le départ. Je recommande à 100%.",
    date: "Fév. 2025",
    ticketPrice: "25 €",
    accentFrom: "from-yellow-500/20",
    accentTo: "to-amber-500/10",
    trophyColor: "text-yellow-400",
    badgeColor: "text-yellow-400",
  },
  {
    initials: "YK",
    name: "Yoav K.",
    location: "Haïfa, Israël",
    prize: "Week-end Dubai 5 étoiles",
    amount: "12 000 €",
    quote: "Le tirage était en direct, tout le monde pouvait vérifier. NessWin a changé ma façon de voir les concours.",
    date: "Jan. 2025",
    ticketPrice: "20 €",
    accentFrom: "from-blue-500/20",
    accentTo: "to-cyan-500/10",
    trophyColor: "text-blue-400",
    badgeColor: "text-blue-400",
  },
  {
    initials: "MB",
    name: "Michel B.",
    location: "Lyon, France",
    prize: "BMW M4 Competition",
    amount: "95 000 €",
    quote: "Incroyable ! La BMW est dans mon garage depuis 3 mois. Chaque matin je n'en reviens toujours pas.",
    date: "Déc. 2024",
    ticketPrice: "40 €",
    accentFrom: "from-purple-500/20",
    accentTo: "to-violet-500/10",
    trophyColor: "text-purple-400",
    badgeColor: "text-purple-400",
  },
];

function WinnerCard({ winner }) {
  const { t } = useTranslation();
  const { initials, name, location, prize, amount, quote, date, ticketPrice, accentFrom, accentTo, trophyColor, badgeColor } = winner;

  return (
    <article className={`relative flex flex-col gap-4 p-5 rounded-2xl border border-border/60 bg-card overflow-hidden group`}>
      {/* Hover gradient */}
      <div className={`absolute inset-0 bg-linear-to-br ${accentFrom} ${accentTo} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      <Quote className="w-6 h-6 text-primary/20 absolute top-4 right-4" aria-hidden="true" />

      {/* Winner header */}
      <div className="flex items-center gap-3 relative z-10">
        <div className="w-12 h-12 rounded-full border-2 border-primary/30 flex items-center justify-center font-serif text-lg font-bold bg-linear-to-br from-primary/20 to-primary/5 text-(--color-foreground) shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-sm text-(--color-foreground)">{name}</p>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="w-2.5 h-2.5" aria-hidden="true" />
            {location}
          </p>
        </div>
      </div>

      {/* Prize info */}
      <div className="relative z-10 space-y-1">
        <div className="flex items-center gap-1.5">
          <Trophy className={`w-3.5 h-3.5 ${trophyColor}`} aria-hidden="true" />
          <span className={`text-xs font-bold tracking-wide uppercase ${badgeColor}`}>{t("winnersShowcase.prizeWon")}</span>
        </div>
        <p className="font-serif text-base font-bold leading-tight text-(--color-foreground)">{prize}</p>
        <p className="text-primary font-semibold text-sm">{amount}</p>
      </div>

      {/* Quote */}
      <p className="text-sm text-muted-foreground leading-relaxed italic relative z-10 flex-1">
        "{quote}"
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground relative z-10 pt-2 border-t border-border/40">
        <span className="flex items-center gap-1">
          <Calendar className="w-2.5 h-2.5" aria-hidden="true" />
          {date}
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
  return (
    <section id="winners" className="py-24 px-6 bg-(--color-background)">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {winners.map((w, index) => (
            <Reveal key={w.name} delay={index * 70}>
              <WinnerCard winner={w} />
            </Reveal>
          ))}
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
