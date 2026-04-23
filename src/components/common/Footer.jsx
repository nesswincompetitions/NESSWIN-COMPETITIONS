import { MapPin, Phone, Building } from "lucide-react";
import { FaInstagram, FaTwitter, FaYoutube } from "react-icons/fa";
import { useTranslation } from "react-i18next";

function LinkGroup({ heading, links }) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold tracking-[0.2em] uppercase text-(--color-foreground)">
        {heading}
      </h4>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const { t } = useTranslation();
  const platformLinks = [
    { label: t("footer.links.competitions"), href: "/competitions" },
    { label: t("footer.links.howItWorks"), href: "/#how-it-works" },
    { label: t("footer.links.winners"), href: "/winners" },
    { label: t("footer.links.liveDraws"), href: "/live-draws" },
  ];

  const companyLinks = [
    { label: t("footer.links.press"), href: "/press" },
    { label: t("footer.links.affiliates"), href: "/affiliates" },
    { label: t("footer.links.careers"), href: "/careers" },
  ];

  const legalLinks = [
    { label: t("footer.links.terms"), href: "/terms" },
    { label: t("footer.links.privacy"), href: "/privacy" },
    { label: t("footer.links.rules"), href: "/rules" },
  ];

  return (
    <footer className="bg-card/50 border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Updated Logo Alignment & Sizing */}
            <a href="/" className="inline-flex items-center gap-0 transition-opacity hover:opacity-90">
              <img
                src="/nesswin_logo.svg"
                alt="NessWin Icon"
                className="h-12 lg:h-14 w-auto object-contain shrink-0"
              />
              <img
                src="/nesswin_logo_2.svg"
                alt="NessWin Text"
                className="h-10 lg:h-12 w-auto object-contain shrink-0 translate-y-1 lg:translate-y-1.5 -ml-1 lg:-ml-2"
              />
            </a>

            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mt-2">
              {t("footer.description")}
            </p>
            <div className="flex items-center gap-3 pt-2">
              {[
                { icon: <FaInstagram className="w-4 h-4" aria-hidden="true" />, label: "Instagram" },
                { icon: <FaTwitter className="w-4 h-4" aria-hidden="true" />, label: "Twitter" },
                { icon: <FaYoutube className="w-4 h-4" aria-hidden="true" />, label: "YouTube" },
              ].map(({ icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>

          <LinkGroup heading={t("footer.platform")} links={platformLinks} />
          <LinkGroup heading={t("footer.company")} links={companyLinks} />
          <LinkGroup heading={t("footer.legal")} links={legalLinks} />
        </div>

        {/* Company info */}
        <div className="mt-14 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              128 City Road, London EC1V 2NX, United Kingdom
            </span>
            
            <a
              href="tel:+447488876770"
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              +44 7488 876770
            </a>
            
            <span className="flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Companies House No. 17105471
            </span>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {t("footer.rights")}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t("footer.systems")}
          </div>
        </div>
      </div>
    </footer>
  );
}