import {
  ShieldCheck,
  Trophy,
  Users,
  Globe,
  ArrowRight,
  CirclePlay,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Reveal from "../../../components/ui/Reveal.jsx";
import { useTranslation } from "react-i18next";

/**
 * Lightweight hook — returns true once, after `delay` ms.
 * Used to trigger the page-load entrance animation.
 */
function usePageLoaded(delay = 200) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      requestAnimationFrame(() => setLoaded(true));
    }, delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  return loaded;
}

/**
 * HeroEntry — wraps children with a single "rise from below" entrance.
 * `index` controls stagger: each step adds 70ms on top of the base delay.
 */
function HeroEntry({ children, index = 0, baseDelay = 350 }) {
  const loaded = usePageLoaded(0); // reads from parent's timing via inline style

  // Total delay = baseDelay + (index * stagger)
  const stagger = 130;
  const totalDelay = baseDelay + index * stagger;

  return (
    <div
      style={{
        opacity: loaded ? 1 : 0,
        transform: loaded ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) ${totalDelay}ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) ${totalDelay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function HeroSection() {
  const { t } = useTranslation();
  const loaded = usePageLoaded(120); // background is instant; content waits 120ms
  const stats = [
    { icon: Users, value: "52 847", label: t("hero.stats.participants") },
    { icon: Trophy, value: "1 247", label: t("hero.stats.winners") },
    { icon: ShieldCheck, value: "2.3M€", label: t("hero.stats.prizes") },
    { icon: Globe, value: "12", label: t("hero.stats.countries") },
  ];

  const trustBadges = [
    { label: t("hero.trustBadges.securePayments") },
    { label: t("hero.trustBadges.notarizedDraws") },
    { label: t("hero.trustBadges.publicResults") },
  ];

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-x-hidden bg-(--color-background)">
      {/* Background image — renders immediately, no animation */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1920&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center center",
          }}
        />
        <div className="absolute inset-0 bg-linear-to-b from-(--color-background)/60 via-(--color-background)/40 to-(--color-background)" />
      </div>

      {/* Decorative glows — no animation, instant */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-primary/8 rounded-full blur-[120px]"
          style={{ width: 900, height: 400 }}
        />
        <div
          className="absolute top-1/4 -left-20 bg-primary/5 rounded-full blur-[100px]"
          style={{ width: 400, height: 400 }}
        />
        <div
          className="absolute top-1/3 -right-20 bg-primary/5 rounded-full blur-[100px]"
          style={{ width: 350, height: 350 }}
        />
        {/* Corner diamonds */}
        <div className="absolute top-24 left-8 w-16 h-16 border border-primary/20 rotate-45" />
        <div className="absolute top-28 left-12 w-8 h-8 border border-primary/10 rotate-45" />
        <div className="absolute top-24 right-8 w-16 h-16 border border-primary/20 rotate-45" />
        <div className="absolute top-28 right-12 w-8 h-8 border border-primary/10 rotate-45" />
      </div>

      {/* ── Content — each element staggers up from below ── */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-28 pb-20 sm:pl-7">
        <div className="flex flex-col items-center gap-6">
          {/* Live badge — index 0 → delay 220ms */}
          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) 350ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) 350ms`,
            }}
          >
            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-primary/30 bg-primary/8 text-primary text-xs font-bold tracking-[0.2em] uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              {t("hero.liveBadge")}
            </div>
          </div>

          {/* Headline — index 1 → delay 290ms */}
          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) 480ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) 480ms`,
            }}
          >
            <div className="space-y-1 w-full max-w-[100vw] px-2 sm:px-4 overflow-hidden">
              <h1 className="font-serif text-[2.5rem] leading-[1.1] sm:text-7xl lg:text-[5.5rem] font-bold sm:leading-[1.05] tracking-tight text-(--color-foreground) break-words">
                {t("hero.titleTop")}
              </h1>
              <h1 className="font-serif text-[2.5rem] leading-[1.1] sm:text-7xl lg:text-[5.5rem] font-bold sm:leading-[1.05] tracking-tight text-primary break-words hyphens-auto">
                {t("hero.titleBottom")}
              </h1>
            </div>
          </div>

          {/* Divider — index 2 → delay 360ms */}
          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) 610ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) 610ms`,
            }}
          >
            <div className="flex items-center gap-4">
              <div className="h-px w-16 bg-linear-to-r from-transparent to-primary/50" />
              <Trophy className="w-4 h-4 text-primary/60" aria-hidden="true" />
              <div className="h-px w-16 bg-linear-to-l from-transparent to-primary/50" />
            </div>
          </div>

          {/* Subtitle — index 3 → delay 430ms */}
          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) 740ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) 740ms`,
            }}
          >
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              {t("hero.subtitle")}
            </p>
          </div>

          {/* CTA Buttons — index 4 → delay 500ms */}
          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) 870ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) 870ms`,
            }}
          >
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button
                onClick={() => {
                  const competitionsSection =
                    document.getElementById("competitions");
                  if (competitionsSection) {
                    competitionsSection.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md has-[>svg]:px-4 text-base px-8 py-6 font-semibold tracking-wide shadow-[0_0_35px_rgba(200,155,50,0.35)] hover:shadow-[0_0_50px_rgba(200,155,50,0.55)] transition-all duration-300"
              >
                {t("hero.seeCompetitions")}
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </button>

              <Link
                to="/winner-component"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer hover:text-accent-foreground dark:hover:bg-accent/50 h-10 rounded-md has-[>svg]:px-4 text-base px-8 py-6 border border-border hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
              >
                <CirclePlay className="w-4 h-4 mr-2" aria-hidden="true" />
                {t("hero.ourWinners")}
              </Link>
            </div>
          </div>

          {/* Trust badges — index 5 → delay 570ms */}
          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) 1000ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) 1000ms`,
            }}
          >
            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck
                  className="w-3.5 h-3.5 text-primary"
                  aria-hidden="true"
                />
                {t("hero.trustBadges.securePayments")}
              </span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck
                  className="w-3.5 h-3.5 text-primary"
                  aria-hidden="true"
                />
                {t("hero.trustBadges.notarizedDraws")}
              </span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck
                  className="w-3.5 h-3.5 text-primary"
                  aria-hidden="true"
                />
                {t("hero.trustBadges.publicResults")}
              </span>
            </div>
          </div>

          {/* Stats — index 6 → delay 640ms */}
          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(32px)",
              transition: `opacity 1.1s cubic-bezier(0.16,1,0.3,1) 1130ms, transform 1.1s cubic-bezier(0.16,1,0.3,1) 1130ms`,
            }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-24 pt-6 mt-4 border-t border-border/60 w-full max-w-5xl">
              {stats.map(({ icon, value, label }) => {
                const StatIcon = icon;
                return (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <StatIcon
                      className="w-4 h-4 text-primary mb-0.5"
                      aria-hidden="true"
                    />
                    <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-(--color-foreground)">
                      {value}
                    </span>
                    <span className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator — fades in last, index 7 → delay 720ms */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        style={{
          opacity: loaded ? 1 : 0,
          transition: `opacity 1.1s ease 1180ms`,
        }}
      >
        <div className="w-5 h-8 rounded-full border border-border/60 flex items-start justify-center pt-1.5">
          <div className="w-1 h-2 rounded-full bg-primary/70 animate-bounce" />
        </div>
      </div>
    </section>
  );
}
