import { Trophy, LogIn } from "lucide-react";
import Reveal from "../../../components/ui/Reveal.jsx";
import { useTranslation } from "react-i18next";

export default function CTASection() {
  const { t } = useTranslation();
  return (
    <section className="py-24 px-6 bg-(--color-background) relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-linear-to-br from-primary/8 via-(--color-background) to-primary/5" />
        <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/20 to-transparent" />
        <div className="absolute top-8 left-8 w-20 h-20 border border-primary/15 rotate-45" />
        <div className="absolute bottom-8 right-8 w-20 h-20 border border-primary/15 rotate-45" />
        <div className="absolute top-12 left-12 w-10 h-10 border border-primary/10 rotate-45" />
        <div className="absolute bottom-12 right-12 w-10 h-10 border border-primary/10 rotate-45" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <div className="flex flex-col items-center gap-6">
          <Reveal delay={30}>
            <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shadow-[0_0_40px_oklch(0.78_0.14_78/0.3)]">
              <Trophy className="w-7 h-7 text-primary" aria-hidden="true" />
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="space-y-3">
              <h2 className="font-serif text-4xl sm:text-5xl font-bold leading-tight text-(--color-foreground)">
                {t("cta.titleTop")}<br />
                <span className="text-primary">{t("cta.titleBottom")}</span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
                {t("cta.subtitle")}
              </p>
            </div>
          </Reveal>

          <Reveal delay={130}>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-medium bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer">
                <LogIn className="w-4 h-4" aria-hidden="true" />
                {t("cta.signIn")}
              </button>
              <button className="inline-flex items-center justify-center gap-2 text-base font-medium px-8 py-3 rounded-md border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-(--color-foreground) cursor-pointer">
                {t("cta.nextDraw")}
              </button>
            </div>
          </Reveal>

          <Reveal delay={170}>
            <p className="text-xs text-muted-foreground max-w-sm">
              {t("cta.legal")}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
