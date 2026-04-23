import { useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Sparkles, Tag, Users, Ticket } from "lucide-react";
import CountdownTimer from "../components/ui/CountdownTimer.jsx";
import { competitions } from "../data/competitions.js";
import Reveal from "../components/ui/Reveal.jsx";
import { useTranslation } from "react-i18next";

// ─── Data ────────────────────────────────────────────────────────────────────

const STATUS_FILTER_KEYS = ["all", "ongoing", "comingSoon", "completed"];
const CATEGORY_FILTER_KEYS = ["allCategories", "cars", "watches", "travel", "realEstate", "tech", "other"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ type, label }) {
  const isHot = type === "hot";
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-[0.15em] ${
        isHot
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      }`}
    >
      {isHot ? (
        <Flame className="w-3 h-3" aria-hidden="true" />
      ) : (
        <Sparkles className="w-3 h-3" aria-hidden="true" />
      )}
      {label.toUpperCase()}
    </div>
  );
}

function CompetitionCard({ competition }) {
  const { t } = useTranslation();
  const {
    id,
    image,
    badgeType,
    badgeLabel,
    ticketPrice,
    category,
    title,
    priceLabel,
    sold,
    total,
    endsAt,
  } = competition;

  const remaining = total - sold;
  const progress = Math.min(100, Math.round((sold / total) * 100));

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md transform-gpu motion-reduce:transform-none h-full"
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
          <StatusBadge type={badgeType} label={badgeLabel} />
        </div>
        <div className="absolute top-3 right-3 bg-(--color-background)/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-bold text-primary flex items-center gap-1">
          <Tag className="w-3 h-3" aria-hidden="true" />
          {ticketPrice}€
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-white/70 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded">
            {category}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col p-5 flex-1">
        {/* Title + price — fixed height so all cards align below */}
        <div className="min-h-18">
          <h3
            className="font-serif text-xl font-bold leading-tight line-clamp-2 text-(--color-foreground)"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            {title}
          </h3>
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
              className="relative w-full h-1.5 rounded-full bg-primary/20 overflow-hidden"
            >
              <div
                className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
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
          <Link
            to={`/competitions/${id}`}
            className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold tracking-wide px-4 py-2 h-9 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer"
          >
            <Ticket className="w-4 h-4 mr-2" aria-hidden="true" />
            {t("common.participate")}
          </Link>
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
              className={`px-4 py-2 rounded-full text-xs font-semibold tracking-[0.12em] uppercase transition-all duration-200 border cursor-pointer ${
                isActive
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
              className={`px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-200 border cursor-pointer ${
                isActive
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
  const [activeStatusKey, setActiveStatusKey] = useState("all");
  const [activeCategoryKey, setActiveCategoryKey] = useState("allCategories");
  const [nowTs] = useState(() => Date.now());

  // Client-side filtering logic
  const filtered = competitions.filter((c) => {
    const statusMatch =
      activeStatusKey === "all" ||
      (activeStatusKey === "ongoing" && (c.endsAt && c.endsAt > nowTs || c.badgeLabel === "Draw Soon")) ||
      (activeStatusKey === "comingSoon" && !c.endsAt && c.sold === 0) ||
      (activeStatusKey === "completed" && c.sold === c.total && c.badgeLabel !== "Draw Soon");

    const categoryMap = {
      cars: ["Luxury Car"],
      watches: ["Luxury Watch"],
      travel: ["Dream Travel"],
      tech: ["High-Tech"],
      allCategories: null,
    };
    const mapped = categoryMap[activeCategoryKey];
    const categoryMatch =
      activeCategoryKey === "allCategories" ||
      (mapped ? mapped.includes(c.category) : c.category.toLowerCase().includes(activeCategoryKey.toLowerCase()));

    return statusMatch && categoryMatch;
  });

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
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((comp, index) => (
                <Reveal key={comp.id} delay={index * 65}>
                  <CompetitionCard competition={comp} />
                </Reveal>
              ))}
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