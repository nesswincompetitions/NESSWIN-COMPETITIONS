import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CircleCheck,
  Lock,
  LogIn,
  Video,
  Users,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { getCompetitionById } from "../../../data/competitions.js";
import { useTranslation } from "react-i18next";

const PARTICIPANTS = [
  {
    initials: "AG",
    name: "Akhil Gupta",
    tickets: 2,
    rank: 1,
    borderColor: "border-amber-500/30",
    rankColor: "text-yellow-400",
  },
  {
    initials: "VK",
    name: "Vrutika Kukadiya",
    tickets: 1,
    rank: 2,
    borderColor: "border-emerald-500/30",
    rankColor: "text-slate-400",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Breadcrumb({ title }) {
  const { t } = useTranslation();
  return (
    <nav
      className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
      aria-label="Breadcrumb"
    >
      <Link
        to="/competitions-component"
        className="flex items-center gap-1.5 hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {t("competitionDetails.competitions")}
      </Link>
      <span aria-hidden="true">/</span>
      <span className="text-(--color-foreground) truncate max-w-50">
        {title}
      </span>
    </nav>
  );
}

function ImageGallery({ images, title }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-4/3 rounded-2xl overflow-hidden">
        <img
          src={images[active]}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent" />
        <span className="absolute top-4 left-4 inline-flex items-center justify-center rounded-md border border-transparent bg-primary text-(--color-primary-foreground) px-2 py-0.5 text-xs font-medium tracking-wider uppercase">
          {t("competitionDetails.ongoing")}
        </span>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
              active === i
                ? "border-primary shadow-[0_0_10px_oklch(0.78_0.14_78/0.4)]"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            <img src={src} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function WhatsIncluded({ items }) {
  const { t } = useTranslation();
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5">
      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
        {t("competitionDetails.whatsIncluded")}
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm">
            <CircleCheck
              className="w-4 h-4 text-primary shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="text-(--color-foreground)">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TicketPurchaseCard({ competition }) {
  const { t } = useTranslation();
  const {
    title,
    images,
    ticketPrice,
    drawDate,
    drawTime,
    sold,
    total,
  } = competition;

  const remaining = total - sold;
  const progress = Math.min(100, Math.round((sold / total) * 100));

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
      {/* Card header image */}
      <div className="relative h-36 overflow-hidden">
        <img
          src={images[0]}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/50 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-black/10 via-transparent to-black/10" />
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-bold mb-0.5">
              {t("competitionDetails.yourPrize")}
            </p>
            <p className="font-serif text-[15px] font-bold text-(--color-foreground) leading-snug line-clamp-1">
              {title}
            </p>
          </div>
          <div className="bg-primary text-(--color-primary-foreground) text-xs font-black px-3 py-1.5 rounded-full shadow-lg tracking-wide shrink-0 ml-2">
            {ticketPrice} € {t("competitionDetails.perTicket")}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-6 space-y-5">
        {/* Sign in prompt */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]">
            <Lock className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <h3 className="font-serif font-bold text-lg text-(--color-foreground)">
            {t("competitionDetails.loginToJoin")}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("competitionDetails.loginSubtitle")}
          </p>
        </div>

        {/* Sign in button */}
        <button className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-medium h-9 px-4 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer">
          <LogIn className="w-4 h-4" aria-hidden="true" />
          {t("competitionDetails.signIn")}
        </button>

        {/* Draw info grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/30 border border-border/40 rounded-2xl p-3.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("competitionDetails.drawOn")}
            </p>
            <p className="text-xs font-semibold leading-tight capitalize text-(--color-foreground)">
              {drawDate}
            </p>
            <p className="text-xs text-primary font-bold mt-0.5">
              {drawTime}
            </p>
          </div>
          <div className="bg-muted/30 border border-border/40 rounded-2xl p-3.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("competitionDetails.left")}
            </p>
            <p className="font-bold text-primary text-base">
              {remaining.toLocaleString()}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="relative w-full h-1.5 rounded-full bg-primary/20 overflow-hidden mt-2"
            >
              <div
                className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live draw note */}
        <div className="flex items-start gap-2 bg-muted/20 rounded-xl p-3">
          <Video
            className="w-4 h-4 text-primary shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("competitionDetails.liveNote")}
          </p>
        </div>

        {/* Free Postal Entry note */}
        <div className="text-center pt-1 border-t border-border/40 mt-4">
          <p className="text-[11px] text-muted-foreground">
            Free Postal Entry available. See <Link to="/terms" className="text-primary hover:underline">Terms & Conditions</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatsGrid({ ticketPrice, maxTickets, sold, priceLabel }) {
  const { t } = useTranslation();
  const stats = [
    { label: t("competitionDetails.stats.ticketPrice"), value: `${ticketPrice} €` },
    { label: t("competitionDetails.stats.maxTickets"), value: maxTickets.toLocaleString() },
    { label: t("competitionDetails.stats.ticketsSold"), value: sold.toLocaleString() },
    { label: t("competitionDetails.stats.prizeValue"), value: priceLabel },
  ];

  return (
    <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map(({ label, value }) => (
        <div
          key={label}
          className="bg-card border border-border/50 rounded-xl p-4 text-center"
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className="font-bold text-lg text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ParticipantCard({ participant }) {
  const { t } = useTranslation();
  const {
    initials,
    name,
    tickets,
    rank,
    borderColor,
    rankColor,
  } = participant;

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card hover:border-primary/20 hover:bg-card/80 transition-colors">
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full border bg-primary/15 ${borderColor} flex items-center justify-center font-bold text-sm shrink-0 text-(--color-foreground)`}
      >
        {initials}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate text-(--color-foreground)">
          {name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
            <Ticket className="w-3 h-3 shrink-0" aria-hidden="true" />
            {tickets} {t("competitionDetails.ticketCount")}
          </span>
        </div>
      </div>
      {/* Rank */}
      <span className={`text-xs font-black shrink-0 ${rankColor}`}>
        #{rank}
      </span>
    </div>
  );
}

function ParticipantsSection({ participants }) {
  const { t } = useTranslation();
  return (
    <section className="mt-14">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <ShieldCheck
                className="w-4 h-4 text-primary"
                aria-hidden="true"
              />
            </div>
            <h2 className="font-serif text-2xl font-bold text-(--color-foreground)">
              {t("competitionDetails.participantsTitle")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg mt-1">
            {t("competitionDetails.participantsSubtitle")}
          </p>
        </div>
        {/* Count badge */}
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2">
          <Users
            className="w-4 h-4 text-primary"
            aria-hidden="true"
          />
          <span className="font-bold text-primary tabular-nums">
            {participants.length}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("competitionDetails.participants")}
          </span>
        </div>
      </div>

      {/* Participant grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {participants.map((p) => (
          <ParticipantCard key={p.rank} participant={p} />
        ))}
      </div>

      {/* Transparency note */}
      <div className="mt-6 flex items-center gap-2.5 bg-muted/20 border border-border/40 rounded-xl p-4">
        <ShieldCheck
          className="w-4 h-4 text-primary shrink-0"
          aria-hidden="true"
        />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t("competitionDetails.transparencyNote")}
        </p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetitionDetails() {
  const { id } = useParams();
  const c = useMemo(() => getCompetitionById(id), [id]);

  if (!c) {
    return <Navigate to="/competitions-component" replace />;
  }

  return (
    <div className="min-h-screen bg-(--color-background)">
      <div className="pt-16 lg:pt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Breadcrumb title={c.title} />

          {/* ── Two-column layout ── */}
          <div className="grid lg:grid-cols-2 gap-10 xl:gap-16">

            {/* LEFT — Gallery + included */}
            <div className="space-y-4">
              <ImageGallery images={c.images} title={c.title} />
              <WhatsIncluded items={c.included} />
            </div>

            {/* RIGHT — Info + purchase card */}
            <div className="flex flex-col gap-6">
              {/* Title block */}
              <div>
                <p className="text-xs font-bold text-primary tracking-[0.2em] uppercase mb-2">
                  {c.category}
                </p>
                <h1 className="font-serif text-4xl font-bold leading-tight text-(--color-foreground)">
                  {c.title}
                </h1>
                <p className="text-3xl font-bold text-primary mt-2">
                  {c.priceLabel}
                </p>
              </div>

              {/* Description */}
              <p className="text-muted-foreground leading-relaxed">
                {c.description}
              </p>

              {/* Divider */}
              <hr className="border-0 h-px bg-border" />

              {/* Ticket purchase card */}
              <TicketPurchaseCard competition={c} />
            </div>
          </div>

          {/* ── Stats row ── */}
          <StatsGrid
            ticketPrice={c.ticketPrice}
            maxTickets={c.total}
            sold={c.sold}
            priceLabel={c.priceLabel}
          />

          {/* ── Participants ── */}
          <ParticipantsSection participants={PARTICIPANTS} />

          {/* Bottom spacing */}
          <div className="pb-20" />
        </div>
      </div>
    </div>
  );
}
