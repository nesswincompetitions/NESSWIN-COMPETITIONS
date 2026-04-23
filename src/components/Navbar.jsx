import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { LogIn, Globe, Menu, X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const LANGUAGE_OPTIONS = [
  { code: "en", short: "GB", flag: "🇬🇧", label: "English", secondary: "English" },
  { code: "fr", short: "FR", flag: "🇫🇷", label: "Français", secondary: "French" },
];

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const desktopLanguageMenuRef = useRef(null);
  const mobileLanguageMenuRef = useRef(null);

  const navLinks = [
    { label: t("navbar.competitions"), href: "/competitions" },
    { label: t("navbar.howItWorks"), href: "/how-it-works" },
    { label: t("navbar.winners"), href: "/winners" },
  ];

  const activeLanguage =
    LANGUAGE_OPTIONS.find((option) => i18n.language.startsWith(option.code)) ??
    LANGUAGE_OPTIONS[0];

  const handleLanguageChange = (nextLanguage) => {
    i18n.changeLanguage(nextLanguage);
    window.localStorage.setItem("lang", nextLanguage);
    setLanguageOpen(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => setLoaded(true));
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const insideDesktop = desktopLanguageMenuRef.current?.contains(event.target);
      const insideMobile = mobileLanguageMenuRef.current?.contains(event.target);
      if (!insideDesktop && !insideMobile) {
        setLanguageOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const renderLanguageDropdown = (width = "w-44") => (
    <div className={`absolute right-0 top-full mt-1 ${width} rounded-md border border-border/70 bg-black shadow-[0_4px_12px_rgba(0,0,0,0.45)] z-50 overflow-hidden`}>
      {LANGUAGE_OPTIONS.map((option) => {
        const isActive = activeLanguage.code === option.code;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => handleLanguageChange(option.code)}
            className="group w-full flex items-center gap-1.5 px-2.5 py-2 text-left text-xs text-white transition-colors cursor-pointer hover:bg-[#f0b33f] hover:text-black"
          >
            <span className="w-3 h-3 shrink-0 flex items-center justify-center">
              {isActive ? <Check className="w-3 h-3 text-[#f0b33f]" aria-hidden="true" /> : null}
            </span>
            <span className="w-5 text-[10px] font-semibold tracking-[0.08em]">{option.short}</span>
            <span className="font-semibold">{option.label}</span>
            <span className="ml-1 text-[11px] text-muted-foreground group-hover:text-black/60">
              {option.secondary}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <header
      className={`
        fixed top-0 left-0 right-0 z-50
        transition-[background-color,border-color,box-shadow] duration-500 ease-in-out
        ${
          scrolled
            ? "bg-(--color-background)/95 backdrop-blur-xl border-b border-border shadow-[0_4px_30px_rgba(0,0,0,0.4)]"
            : "bg-transparent border-b border-transparent"
        }
      `}
    >
      <div
        className="max-w-7xl mx-auto px-6 lg:px-8"
        style={{
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(-28px)",
          transition: loaded
            ? "opacity 1.0s cubic-bezier(0.16,1,0.3,1) 0.25s, transform 1.0s cubic-bezier(0.16,1,0.3,1) 0.25s"
            : "none",
        }}
      >
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-0 shrink-0 transition-opacity hover:opacity-90 w-[180px] lg:w-[200px]">
            {/* Trophy Icon */}
            <img
              src="/nesswin_logo.svg"
              alt="NessWin Icon"
              className="h-12 lg:h-14 w-auto object-contain shrink-0"
            />
            
            {/* Text Wordmark */}
            <img
              src="/nesswin_logo_2.svg"
              alt="NessWin Text"
              className="h-10 lg:h-12 w-auto object-contain shrink-0 translate-y-1 lg:translate-y-1.5 -ml-1 lg:-ml-2" 
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-8" aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className="text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground hover:text-primary transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop right */}
          <div className="hidden lg:flex items-center gap-2 justify-end w-[180px] lg:w-[200px]">
            <div className="relative" ref={desktopLanguageMenuRef}>
              <button
                type="button"
                onClick={() => setLanguageOpen((v) => !v)}
                className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer hover:bg-accent dark:hover:bg-accent/50 h-8 rounded-md has-[>svg]:px-2.5 gap-1.5 text-muted-foreground hover:text-primary px-2"
                aria-haspopup="menu"
                aria-expanded={languageOpen}
                aria-label={t("navbar.languageLabel")}
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm font-semibold">{activeLanguage.flag}</span>
              </button>
              {languageOpen && renderLanguageDropdown("w-44")}
            </div>

            {/* UPDATED: Desktop Sign In Link */}
            <Link 
              to="/signin" 
              className="inline-flex items-center gap-2 px-3 py-2 h-9 rounded-md text-sm font-medium bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              {t("navbar.signIn")}
            </Link>
          </div>

          {/* Mobile right */}
          <div className="lg:hidden flex items-center gap-1">
            <div className="relative" ref={mobileLanguageMenuRef}>
              <button
                type="button"
                onClick={() => setLanguageOpen((v) => !v)}
                className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer hover:bg-accent dark:hover:bg-accent/50 h-8 rounded-md has-[>svg]:px-2.5 gap-1.5 text-muted-foreground hover:text-primary px-2"
                aria-haspopup="menu"
                aria-expanded={languageOpen}
                aria-label={t("navbar.languageLabel")}
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-semibold">{activeLanguage.flag}</span>
              </button>
              {languageOpen && renderLanguageDropdown("w-44")}
            </div>

            <button
              className="p-2 text-(--color-foreground) rounded-md hover:bg-muted transition-colors cursor-pointer"
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          className={`
            lg:hidden overflow-hidden transition-all duration-300 ease-in-out
            ${menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
            bg-card/98 backdrop-blur-xl border-b border-border
          `}
        >
          <div className="px-6 py-5 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className="flex items-center py-3 text-sm font-semibold tracking-[0.15em] uppercase text-muted-foreground hover:text-primary transition-colors border-b border-border/50 last:border-0"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3">
              {/* UPDATED: Mobile Sign In Link */}
              <Link 
                to="/signin" 
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                {t("navbar.signIn")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}