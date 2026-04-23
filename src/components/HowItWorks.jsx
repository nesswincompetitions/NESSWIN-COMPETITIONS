import { Search, Ticket, Video, Gift } from "lucide-react";
import Reveal from "./ui/Reveal.jsx";
import { useTranslation } from "react-i18next";

export default function HowItWorks() {
  const { t } = useTranslation();
  const steps = [
    {
      num: "01",
      step: 1,
      icon: Search,
      title: t("howItWorks.steps.one.title"),
      desc: t("howItWorks.steps.one.desc"),
    },
    {
      num: "02",
      step: 2,
      icon: Ticket,
      title: t("howItWorks.steps.two.title"),
      desc: t("howItWorks.steps.two.desc"),
    },
    {
      num: "03",
      step: 3,
      icon: Video,
      title: t("howItWorks.steps.three.title"),
      desc: t("howItWorks.steps.three.desc"),
    },
    {
      num: "04",
      step: 4,
      icon: Gift,
      title: t("howItWorks.steps.four.title"),
      desc: t("howItWorks.steps.four.desc"),
    },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-card/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Reveal delay={20}>
            <p className="text-xs font-bold text-primary tracking-[0.25em] uppercase mb-3">
              {t("howItWorks.overline")}
            </p>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold mb-4 text-(--color-foreground)">
              {t("howItWorks.title")}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              {t("howItWorks.subtitle")}
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {/* Connecting line (desktop) */}
          <div className="hidden lg:block absolute top-10 left-[12.5%] right-[12.5%] h-px bg-linear-to-r from-transparent via-primary/30 to-transparent" />

          {steps.map(({ num, step, icon, title, desc }, index) => {
            const StepIcon = icon;
            return (
            <Reveal key={num} delay={index * 90} className="flex">
              <div className="flex flex-col items-center text-center gap-4 relative w-full">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] relative z-10">
                    <StepIcon className="w-8 h-8 text-primary" aria-hidden="true" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-(--color-primary-foreground) text-[10px] font-bold flex items-center justify-center shadow-lg">
                    {step}
                  </span>
                </div>
                <span className="font-mono text-xs text-primary/40 tracking-widest">{num}</span>
                <div className="space-y-2">
                  <h3 className="font-serif text-xl font-bold text-(--color-foreground)">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed max-w-55 mx-auto">
                    {desc}
                  </p>
                </div>
              </div>
            </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}