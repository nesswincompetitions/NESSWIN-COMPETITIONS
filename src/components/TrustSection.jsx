import { Eye, ShieldCheck, Headphones, BadgeCheck } from "lucide-react";
import Reveal from "./ui/Reveal.jsx";
import { useTranslation } from "react-i18next";

const certifications = [
  "ISO 27001 Certified",
  "PCI DSS Level 1",
  "GDPR Compliant",
  "SSL 256-bit",
];

export default function TrustSection() {
  const { t } = useTranslation();
  const trustItems = [
    {
      icon: Eye,
      title: t("trust.items.publicResults.title"),
      desc: t("trust.items.publicResults.desc"),
      badge: t("trust.items.publicResults.badge"),
    },
    {
      icon: ShieldCheck,
      title: t("trust.items.securePayments.title"),
      desc: t("trust.items.securePayments.desc"),
      badge: t("trust.items.securePayments.badge"),
    },
    {
      icon: Headphones,
      title: t("trust.items.support.title"),
      desc: t("trust.items.support.desc"),
      badge: t("trust.items.support.badge"),
    },
  ];

  return (
    <section className="py-24 px-6 bg-card/20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <Reveal delay={20}>
            <p className="text-xs font-bold text-primary tracking-[0.25em] uppercase mb-3">
              {t("trust.overline")}
            </p>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold mb-4 text-(--color-foreground)">
              {t("trust.title")}
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              {t("trust.subtitle")}
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {trustItems.map(({ icon, title, desc, badge }, index) => {
            const TrustIcon = icon;
            return (
            <Reveal key={title} delay={index * 80}>
              <div className="flex flex-col gap-4 p-6 rounded-2xl border border-border/60 bg-card hover:border-primary/30 transition-colors duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                  <TrustIcon className="w-6 h-6 text-primary" aria-hidden="true" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-serif text-lg font-bold text-(--color-foreground)">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  {badge}
                </div>
              </div>
            </Reveal>
            );
          })}
        </div>

        <Reveal delay={150}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {certifications.map((cert) => (
              <div key={cert} className="flex items-center gap-2 text-xs text-muted-foreground">
                <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                {cert}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}