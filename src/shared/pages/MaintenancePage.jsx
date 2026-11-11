import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronDown,
  Clock,
  Globe,
  Mail,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '@/config/languages';

const LANGUAGE_STORAGE_KEY = 'lang';

export default function MaintenancePage() {
  const { t, i18n } = useTranslation();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageMenuRef = useRef(null);

  const activeLanguage =
    LANGUAGE_OPTIONS.find((option) => i18n.language.startsWith(option.code)) ??
    LANGUAGE_OPTIONS[0];

  const handleLanguageChange = (nextLanguage) => {
    i18n.changeLanguage(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageOpen(false);
  };

  useEffect(() => {
    document.title = t('maintenance.pageTitle');
    document.documentElement.lang = activeLanguage.code;
  }, [t, activeLanguage.code]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        languageOpen &&
        !languageMenuRef.current?.contains(event.target)
      ) {
        setLanguageOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [languageOpen]);

  const highlights = [
    {
      icon: Wrench,
      title: t('maintenance.points.maintenanceTitle'),
      description: t('maintenance.points.maintenanceText'),
    },
    {
      icon: ShieldCheck,
      title: t('maintenance.points.dataTitle'),
      description: t('maintenance.points.dataText'),
    },
    {
      icon: Clock,
      title: t('maintenance.points.backTitle'),
      description: t('maintenance.points.backText'),
    },
  ];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-(--color-background) text-(--color-foreground)">
      {/* Ambient background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,oklch(0.78_0.14_78/0.16),transparent_58%)]" />
        <div className="absolute -left-32 top-1/3 h-72 w-72 rounded-full bg-[oklch(0.78_0.14_78/0.07)] blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-[oklch(0.78_0.14_78/0.05)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      </div>

      <header className="relative z-20 w-full px-5 py-5 sm:px-8 sm:py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-0" aria-label="NessWin">
            <img
              src="/nesswin_logo.svg"
              alt=""
              className="h-10 w-auto shrink-0 object-contain sm:h-12"
            />
            <img
              src="/nesswin_logo_2.svg"
              alt="NessWin"
              className="-ml-1 h-8 w-auto shrink-0 translate-y-1 object-contain sm:h-10 sm:-ml-2 sm:translate-y-1.5"
            />
          </div>

          <div className="relative" ref={languageMenuRef}>
            <button
              type="button"
              onClick={() => setLanguageOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={languageOpen}
              aria-label={t('maintenance.languageLabel')}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border/70 bg-card/70 px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm font-semibold">{activeLanguage.flag}</span>
              <span className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] sm:inline">
                {activeLanguage.short}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${languageOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {languageOpen && (
              <div
                role="listbox"
                aria-label={t('maintenance.languageLabel')}
                className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg border border-border/70 bg-[#050505] shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
              >
                {LANGUAGE_OPTIONS.map((option) => {
                  const isActive = activeLanguage.code === option.code;

                  return (
                    <button
                      key={option.code}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleLanguageChange(option.code)}
                      className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-white transition-colors hover:bg-primary hover:text-(--color-primary-foreground)"
                    >
                      <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                        {isActive ? (
                          <Check className="h-3 w-3 text-primary group-hover:text-(--color-primary-foreground)" aria-hidden="true" />
                        ) : null}
                      </span>
                      <span className="w-5 text-[10px] font-semibold tracking-[0.08em]">
                        {option.short}
                      </span>
                      <span className="font-semibold">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
        <div className="w-full max-w-3xl">
          <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 px-5 py-9 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-3xl sm:px-10 sm:py-12 lg:px-14 lg:py-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            />

            <div className="flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary sm:text-[11px]">
                  {t('maintenance.badge')}
                </span>
              </div>

              <div className="relative mt-7">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-2xl bg-primary/25 blur-2xl"
                />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 sm:h-20 sm:w-20">
                  <Wrench className="h-7 w-7 text-primary sm:h-9 sm:w-9" strokeWidth={1.75} aria-hidden="true" />
                </div>
              </div>

              <h1 className="mt-6 max-w-2xl font-serif text-3xl leading-tight tracking-tight text-(--color-foreground) sm:text-5xl lg:text-6xl">
                {t('maintenance.title')}
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                {t('maintenance.message')}
              </p>

              <p className="mt-3 text-xs font-semibold text-primary sm:text-sm">
                {t('maintenance.eta')}
              </p>

              <div className="mt-8 grid w-full gap-3 sm:mt-10 sm:grid-cols-3">
                {highlights.map((highlight) => {
                  const HighlightIcon = highlight.icon;

                  return (
                    <div
                      key={highlight.title}
                      className="rounded-xl border border-border/60 bg-(--color-background)/50 p-4 text-left transition-colors hover:border-primary/25"
                    >
                      <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <HighlightIcon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <p className="text-xs font-semibold text-(--color-foreground) sm:text-sm">
                        {highlight.title}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground sm:text-xs sm:leading-5">
                        {highlight.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex w-full flex-col items-center gap-4 border-t border-border/60 pt-6 sm:mt-10 sm:flex-row sm:justify-between sm:text-left">
                <div>
                  <p className="text-xs font-semibold text-(--color-foreground) sm:text-sm">
                    {t('maintenance.supportLabel')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {t('maintenance.supportText')}
                  </p>
                </div>
                <a
                  href="mailto:support@nesswin.com"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-(--color-primary-foreground) sm:w-auto sm:text-sm"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  support@nesswin.com
                </a>
              </div>

              <p className="mt-6 text-[11px] leading-5 text-muted-foreground sm:text-xs">
                {t('maintenance.reassurance')}
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/50 px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-[11px] text-muted-foreground sm:flex-row sm:text-xs">
          <p className="text-center sm:text-left">{t('maintenance.rights')}</p>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            {t('maintenance.status')}
          </div>
        </div>
      </footer>
    </div>
  );
}
