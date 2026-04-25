import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Globe, Menu, X, Check, User, Settings, LogOut, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { logout } from "../../services/authService";

const LANGUAGE_OPTIONS = [
  { code: "en", short: "GB", flag: "🇬🇧", label: "English", secondary: "English" },
  { code: "fr", short: "FR", flag: "🇫🇷", label: "Français", secondary: "French" },
];

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const desktopLanguageMenuRef = useRef(null);
  const mobileLanguageMenuRef = useRef(null);
  const desktopProfileMenuRef = useRef(null);
  const mobileProfileMenuRef = useRef(null);

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

  const handleLogout = async () => {
    try {
      await logout();
      setProfileOpen(false);
      setMenuOpen(false);
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
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
    const handleOutsideClick = (event) => {
      // Language Menu
      if (
        languageOpen &&
        !desktopLanguageMenuRef.current?.contains(event.target) &&
        !mobileLanguageMenuRef.current?.contains(event.target)
      ) {
        setLanguageOpen(false);
      }

      // Profile Menu
      if (
        profileOpen &&
        !desktopProfileMenuRef.current?.contains(event.target) &&
        !mobileProfileMenuRef.current?.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [languageOpen, profileOpen]);

  const getInitials = () => {
    if (userData?.display_name) {
      return userData.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (userData?.user_name) {
      return userData.user_name.slice(0, 2).toUpperCase();
    }
    if (currentUser?.email) {
      return currentUser.email[0].toUpperCase();
    }
    return "U";
  };

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

  const renderProfileAvatar = (size = "w-9 h-9", textSize = "text-xs") => (
    <div className={`${size} rounded-full overflow-hidden border-2 border-[var(--color-primary)]/40 hover:border-[var(--color-primary)] transition-all cursor-pointer shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.15)]`}>
      {userData?.photo_url ? (
        <img
          src={userData.photo_url}
          alt="Profile"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className={`w-full h-full flex items-center justify-center bg-[var(--color-primary)]/15 ${textSize} font-bold text-[var(--color-primary)]`}>
          {getInitials()}
        </div>
      )}
    </div>
  );

  const renderProfileDropdown = () => (
    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_30px_rgba(0,0,0,0.4)] z-[999] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]/40">
        <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
          {userData?.display_name || userData?.user_name || "User"}
        </p>
        <p className="text-[11px] text-[var(--color-muted-foreground)] truncate mt-0.5">
          {currentUser?.email}
        </p>
        {userData?.user_name && (
          <p className="text-[10px] text-[var(--color-primary)] font-medium mt-1">
            @{userData.user_name}
          </p>
        )}
      </div>
      <div className="py-1">
        <Link
          to="/profile"
          onClick={() => setProfileOpen(false)}
          className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/30 transition-colors cursor-pointer"
        >
          <User className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          My Profile
        </Link>
        {userData?.role === "admin" && (
          <Link
            to="/admin"
            onClick={() => setProfileOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/30 transition-colors cursor-pointer"
          >
            <Shield className="w-4 h-4 text-[var(--color-muted-foreground)]" />
            Admin Panel
          </Link>
        )}
      </div>
      <div className="border-t border-[var(--color-border)]/40 py-1">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
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
          <Link to="/" className="flex items-center gap-0 shrink-0 transition-opacity hover:opacity-90 w-[180px] lg:w-[200px]">
            <img src="/nesswin_logo.svg" alt="NessWin Icon" className="h-12 lg:h-14 w-auto object-contain shrink-0" />
            <img src="/nesswin_logo_2.svg" alt="NessWin Text" className="h-10 lg:h-12 w-auto object-contain shrink-0 translate-y-1 lg:translate-y-1.5 -ml-1 lg:-ml-2" />
          </Link>

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

          <div className="hidden lg:flex items-center gap-2 justify-end w-[180px] lg:w-[200px]">
            <div className="relative" ref={desktopLanguageMenuRef}>
              <button
                type="button"
                onClick={() => setLanguageOpen((v) => !v)}
                className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 h-8 rounded-md px-2 gap-1.5 text-muted-foreground hover:text-primary cursor-pointer"
              >
                <Globe className="h-4 w-4" />
                <span className="text-sm font-semibold">{activeLanguage.flag}</span>
              </button>
              {languageOpen && renderLanguageDropdown("w-44")}
            </div>

            {currentUser ? (
              <div className="relative z-[60]" ref={desktopProfileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="outline-none cursor-pointer"
                >
                  {renderProfileAvatar()}
                </button>
                {profileOpen && renderProfileDropdown()}
              </div>
            ) : (
              <Link 
                to="/signin" 
                className="inline-flex items-center gap-2 px-3 py-2 h-9 rounded-md text-sm font-medium bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                {t("navbar.signIn")}
              </Link>
            )}
          </div>

          <div className="lg:hidden flex items-center gap-1">
            <div className="relative" ref={mobileLanguageMenuRef}>
              <button
                type="button"
                onClick={() => setLanguageOpen((v) => !v)}
                className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all h-8 rounded-md px-2 gap-1.5 text-muted-foreground hover:text-primary cursor-pointer"
              >
                <Globe className="h-4 w-4" />
                <span className="text-xs font-semibold">{activeLanguage.flag}</span>
              </button>
              {languageOpen && renderLanguageDropdown("w-44")}
            </div>

            {currentUser && (
              <div className="relative z-[60]" ref={mobileProfileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="outline-none cursor-pointer"
                >
                  {renderProfileAvatar("w-8 h-8", "text-[10px]")}
                </button>
                {profileOpen && renderProfileDropdown()}
              </div>
            )}

            <button
              className="p-2 text-(--color-foreground) rounded-md hover:bg-muted transition-colors cursor-pointer"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"} bg-card/98 backdrop-blur-xl border-b border-border`}>
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
              {currentUser ? (
                <Link to="/profile" onClick={() => setMenuOpen(false)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer">
                  <User className="w-4 h-4" /> My Profile
                </Link>
              ) : (
                <Link to="/signin" onClick={() => setMenuOpen(false)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer">
                  <LogIn className="w-4 h-4" /> {t("navbar.signIn")}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}