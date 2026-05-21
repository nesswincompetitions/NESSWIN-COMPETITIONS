import React, { useState, useEffect, useRef } from 'react';
import { LogOut, User, Globe, Check } from 'lucide-react';
import { useAuth } from '@/shared/state/AuthContext';
import { logout } from '@/modules/user/auth/services/authService';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const LANGUAGE_OPTIONS = [
  { code: 'en', short: 'GB', flag: '🇬🇧', label: 'English', secondary: 'English' },
  { code: 'fr', short: 'FR', flag: '🇫🇷', label: 'Français', secondary: 'French' },
  { code: 'es', short: 'ES', flag: '🇪🇸', label: 'Español', secondary: 'Spanish' },
];

const AdminNavbar = () => {
  const { t, i18n } = useTranslation('admin');
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageMenuRef = useRef(null);

  const activeLanguage =
    LANGUAGE_OPTIONS.find((option) => i18n.language.startsWith(option.code)) ??
    LANGUAGE_OPTIONS[0];

  const handleLanguageChange = (nextLanguage) => {
    i18n.changeLanguage(nextLanguage);
    window.localStorage.setItem('lang', nextLanguage);
    setLanguageOpen(false);
  };

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (languageOpen && !languageMenuRef.current?.contains(event.target)) {
        setLanguageOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [languageOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/signin');
    } catch (error) {
      toast.error('Failed to logout');
      console.error('Logout error:', error);
    }
  };

  const getInitials = () => {
    if (userData?.display_name) {
      return userData.display_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return currentUser?.email?.[0].toUpperCase() || 'A';
  };

  return (
    <header className="h-16 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Placeholder for breadcrumbs or page title if needed */}
      </div>

      <div className="flex items-center gap-4">
        {/* Language Selector */}
        <div className="relative" ref={languageMenuRef}>
          <button
            type="button"
            onClick={() => setLanguageOpen(!languageOpen)}
            className="flex items-center gap-2 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
          >
            <Globe size={20} />
            <span className="text-sm font-medium hidden sm:block">{activeLanguage.flag}</span>
          </button>

          {languageOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
              {LANGUAGE_OPTIONS.map((option) => {
                const isActive = activeLanguage.code === option.code;
                return (
                  <button
                    key={option.code}
                    onClick={() => handleLanguageChange(option.code)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5 group"
                  >
                    <span className="w-4 flex items-center justify-center">
                      {isActive && <Check size={14} className="text-primary" />}
                    </span>
                    <span className="text-lg">{option.flag}</span>
                    <div className="flex flex-col">
                      <span className={`font-medium ${isActive ? 'text-primary' : 'text-gray-200'}`}>
                        {option.label}
                      </span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                        {option.secondary}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Profile Section */}
        <div className="flex items-center gap-3 pl-4 border-l border-white/10">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-medium text-white">
              {userData?.display_name || t('navbar.adminUser')}
            </span>
            <span className="text-xs text-gray-500">
              {currentUser?.email || 'admin@nesswin.com'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
            {userData?.photo_url ? (
              <img
                src={userData.photo_url}
                alt="Profile"
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              getInitials()
            )}
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer group"
          title="Logout"
        >
          <LogOut size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </header>
  );
};

export default AdminNavbar;

