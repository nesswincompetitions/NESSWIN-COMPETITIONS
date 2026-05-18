import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';
import { logout } from '@/modules/user/auth/services/authService';
import { uploadImages } from '@/shared/services/storageService';
import { updateProfile } from '@/modules/user/profile/services/profileService';
import { createSupportChat } from '@/shared/services/supportChatService';
import {
  subscribeAllReferrals,
} from '@/modules/user/referrals/services/referralService';
import { onActiveUserChatsSnapshot } from '@/shared/services/supportChatService';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users,
  ShoppingBag,
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  Tag,
  Gift,
  Ticket,
  Copy,
  Check,
  LogOut,
  ArrowLeft,
  Camera,
  Pencil,
  X as XIcon,
  LifeBuoy,
  Trash2,
} from "lucide-react";
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';

export default function ProfilePage() {
  const { currentUser } = useAuth();
  const { userData } = useUserData();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [referrals, setReferrals] = useState([]);
  const [referralsLoading, setReferralsLoading] = useState(true);

  // Inline edit state
  const [editingField, setEditingField] = useState(null); // 'display_name' | 'user_name'
  const [editValue, setEditValue] = useState('');
  const [isSavingField, setIsSavingField] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) {
      setReferrals([]);
      setReferralsLoading(false);
      return undefined;
    }

    setReferralsLoading(true);
    const unsubscribe = subscribeAllReferrals(
      currentUser.uid,
      (allReferrals) => {
        setReferrals(allReferrals);
        setReferralsLoading(false);
      },
      (error) => {
        console.warn('Failed to subscribe referrals:', error);
        setReferrals([]);
        setReferralsLoading(false);
      }
    );


    return unsubscribe;
  }, [currentUser?.uid]);

  useEffect(() => {
    if (location.hash === '#referrals') {
      setTimeout(() => {
        document.getElementById('referrals-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [location.hash]);

  useEffect(() => {
    if (location.state?.scrollToTop) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.state]);

  const handleStartEdit = (field) => {
    setEditingField(field);
    setEditValue(field === 'display_name' ? (userData?.display_name ?? '') : (userData?.user_name ?? ''));
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSaveField = async () => {
    if (!currentUser?.uid || !editingField) return;
    const trimmed = editValue.trim();
    if (!trimmed) { toast.error(t('profile.fieldEmptyError')); return; }
    if (editingField === 'user_name' && (trimmed.length < 3 || trimmed.length > 20)) {
      toast.error(t('profile.usernameError')); return;
    }
    if (editingField === 'user_name' && !/^[a-z0-9_]+$/.test(trimmed.toLowerCase())) {
      toast.error(t('profile.usernameFormatError')); return;
    }
    setIsSavingField(true);
    try {
      if (editingField === 'user_name') {
        const { updateUsername } = await import('@/modules/user/profile/services/profileService');
        await updateUsername(currentUser.uid, trimmed.toLowerCase());
      } else {
        await updateProfile(currentUser.uid, { display_name: trimmed });
      }
      toast.success(t('profile.updateSuccess'));
      setEditingField(null);
    } catch (err) {
      toast.error(err.message ?? 'Failed to update.');
    } finally {
      setIsSavingField(false);
    }
  };

  const handleProfilePicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file.");
      return;
    }

    setIsUploading(true);
    try {
      const urls = await uploadImages([file], 'users');
      if (urls && urls.length > 0) {
        const photoUrl = urls[0];
        await updateProfile(currentUser.uid, { photo_url: photoUrl });
        toast.success(t('profile.uploadSuccess'));
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCopyReferral = () => {
    if (userData?.referral_code) {
      navigator.clipboard.writeText(userData.referral_code);
      setCopied(true);
      toast.success(t('profile.copied'));
      setTimeout(() => setCopied(false), 2000);
    }
  };


  const handleLogout = async () => {
    try {
      await logout();
      toast.success(t('profile.signOutSuccess'));
      navigate("/");
    } catch {
      toast.error(t('profile.signOutError'));
    }
  };

  const handleContactSupport = () => {
    navigate('/profile/support');
  };

  // Format Firestore timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    // Choose correct language code for formatting
    const currentLang = i18n.language === 'fr' ? 'fr-FR' : (i18n.language === 'es' ? 'es-ES' : 'en-GB');
    
    return date.toLocaleDateString(currentLang, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getInitials = () => {
    if (userData?.display_name) {
      return userData.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return currentUser?.email?.[0]?.toUpperCase() || "U";
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('profile.back')}
        </button>

        {/* Profile Header Card */}
        <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] overflow-hidden mb-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />

          {/* Banner Gradient */}
          <div className="h-28 bg-gradient-to-br from-[var(--color-primary)]/20 via-[var(--color-primary)]/5 to-transparent relative">
            <div className="absolute -bottom-12 left-6 group">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-[var(--color-card)] shadow-[0_4px_20px_rgba(0,0,0,0.3)] cursor-pointer group-hover:border-[var(--color-primary)] transition-colors"
              >
                {isUploading ? (
                  <div className="w-full h-full bg-black/50 flex items-center justify-center">
                    <LoadingSpinner fullScreen={false} size="w-8 h-8" message="" />
                  </div>
                ) : (
                  <>
                    {userData?.photo_url ? (
                      <img
                        src={userData.photo_url}
                        alt="Profile"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[var(--color-primary)]/15 text-2xl font-bold text-[var(--color-primary)]">
                        {getInitials()}
                      </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white mb-1" />
                      <span className="text-[10px] text-white font-medium uppercase tracking-wider">{t('profile.upload')}</span>
                    </div>
                  </>
                )}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleProfilePicUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* User Info */}
          <div className="pt-16 pb-6 px-6">
            {/* Display Name */}
            {editingField === 'display_name' ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') handleCancelEdit(); }}
                  className="flex-1 bg-[var(--color-muted)]/20 border border-[var(--color-primary)]/50 rounded-lg px-3 py-1 text-lg font-bold text-[var(--color-foreground)] outline-none"
                />
                <button onClick={handleSaveField} disabled={isSavingField} className="p-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 transition cursor-pointer disabled:opacity-50">
                  {isSavingField ? <LoadingSpinner fullScreen={false} size="w-3.5 h-3.5" message="" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleCancelEdit} className="p-1.5 rounded-lg bg-[var(--color-muted)]/30 hover:bg-[var(--color-muted)]/50 transition cursor-pointer">
                  <XIcon className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[var(--color-foreground)]">{userData?.display_name || 'User'}</h1>
                <button
                  onClick={() => handleStartEdit('display_name')}
                  className="p-1 rounded-md hover:bg-[var(--color-muted)]/30 transition-all cursor-pointer"
                  aria-label="Edit display name"
                >
                  <Pencil className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
                </button>
              </div>
            )}

            {/* Username */}
            {editingField === 'user_name' ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-[var(--color-primary)] font-medium">@</span>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') handleCancelEdit(); }}
                  className="flex-1 bg-[var(--color-muted)]/20 border border-[var(--color-primary)]/50 rounded-lg px-3 py-1 text-sm font-medium text-[var(--color-primary)] outline-none"
                />
                <button onClick={handleSaveField} disabled={isSavingField} className="p-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 transition cursor-pointer disabled:opacity-50">
                  {isSavingField ? <LoadingSpinner fullScreen={false} size="w-3.5 h-3.5" message="" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleCancelEdit} className="p-1.5 rounded-lg bg-[var(--color-muted)]/30 hover:bg-[var(--color-muted)]/50 transition cursor-pointer">
                  <XIcon className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-[var(--color-primary)] font-medium">@{userData?.user_name}</p>
                <button
                  onClick={() => handleStartEdit('user_name')}
                  className="p-1 rounded-md hover:bg-[var(--color-muted)]/30 transition-all cursor-pointer"
                  aria-label="Edit username"
                >
                  <Pencil className="w-3 h-3 text-[var(--color-muted-foreground)]" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 mt-3">
              {userData?.role && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${userData.role === "admin"
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20"
                  }`}>
                  <Shield className="w-3 h-3" />
                  {userData.role}
                </span>
              )}
              {userData?.is_verified && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Check className="w-3 h-3" />
                  {t('profile.verified')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid gap-4">
          {/* Contact Information */}
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--color-muted-foreground)] mb-4">
              {t('profile.contactInfo')}
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">{t('profile.email')}</p>
                  <p className="text-sm text-[var(--color-foreground)] truncate">{currentUser?.email || "Not set"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">{t('profile.phone')}</p>
                  <p className="text-sm text-[var(--color-foreground)]">{userData?.phone_number || t('profile.notVerified')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">{t('profile.dateOfBirth')}</p>
                  <p className="text-sm text-[var(--color-foreground)]">{formatDate(userData?.date_of_birth)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">{t('profile.memberSince')}</p>
                  <p className="text-sm text-[var(--color-foreground)]">{formatDate(userData?.created_time)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Referral & Rewards */}
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--color-muted-foreground)] mb-4">
              {t('profile.referralRewards')}
            </h2>
            <div className="space-y-4">
              {/* Referral Code & Link */}
              {userData?.referral_code && (
                <div className="space-y-3">
                  {/* Code */}
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
                      <Tag className="w-4 h-4 text-[var(--color-primary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">{t('profile.referralCode')}</p>
                      <p className="text-sm font-mono font-bold text-[var(--color-primary)]">{userData.referral_code}</p>
                    </div>
                    <button
                      onClick={handleCopyReferral}
                      className="p-2 rounded-lg hover:bg-[var(--color-muted)]/30 transition-colors cursor-pointer flex items-center gap-2"
                      aria-label="Copy referral code"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                      )}
                      <span className="text-xs font-semibold text-[var(--color-muted-foreground)] hidden sm:block">{t('profile.copyCode')}</span>
                    </button>
                  </div>

                </div>
              )}

              {/* Detailed Referrals List */}
              <div id="referrals-section" className="mt-8 space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-muted-foreground)] mb-3 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> {t('profile.yourReferrals')}
                </h3>
                
                {referralsLoading ? (
                  <div className="flex items-center justify-center p-6">
                    <LoadingSpinner fullScreen={false} size="w-6 h-6" message="" />
                  </div>
                ) : referrals.length > 0 ? (
                  <div className="space-y-3">
                    {referrals.map((ref) => (
                      <div key={ref.id} className="rounded-xl border border-[var(--color-border)]/40 bg-[var(--color-muted)]/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--color-muted)]/20 flex items-center justify-center font-bold text-[10px] text-[var(--color-foreground)] shrink-0">
                            {ref.referredUser?.display_name ? ref.referredUser.display_name.slice(0,2).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">{ref.referredUser?.display_name || 'Anonymous User'}</p>
                            <p className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5">{formatDate(ref.created_at)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400">
                            {t('profile.rewarded')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-6 border border-[var(--color-border)]/40 border-dashed rounded-xl">
                    <p className="text-sm text-[var(--color-muted-foreground)]">{t('profile.noReferrals')}</p>
                  </div>
                )}
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Gift className="w-4 h-4 text-[var(--color-primary)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--color-foreground)]">
                    {userData?.referral_count || 0}
                  </p>
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold mt-1">
                    {t('profile.referrals')}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Ticket className="w-4 h-4 text-[var(--color-primary)]" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--color-foreground)]">
                    {userData?.free_tickets || 0}
                  </p>
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold mt-1">
                    {t('profile.freeTickets')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-4">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--color-muted-foreground)] mb-3">{t('profile.quickActions')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { to: '/profile/tickets', icon: Ticket,      label: t('profile.myTickets')     },
                { to: '/profile/orders',  icon: ShoppingBag, label: t('profile.orderHistory')  },
                { to: '/profile/delete',  icon: Trash2,      label: t('profile.deleteAccount') },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-all group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-muted)]/20 group-hover:bg-[var(--color-primary)]/10 flex items-center justify-center transition-colors">
                    <item.icon className="w-4 h-4 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] transition-colors" />
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--color-muted-foreground)] group-hover:text-[var(--color-foreground)] text-center leading-tight transition-colors">{item.label}</span>
                </Link>
              ))}

              <button
                type="button"
                onClick={handleContactSupport}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-all group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-[var(--color-muted)]/20 group-hover:bg-[var(--color-primary)]/10 flex items-center justify-center transition-colors">
                  <LifeBuoy className="w-4 h-4 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] transition-colors" />
                </div>
                <span className="text-[10px] font-semibold text-[var(--color-muted-foreground)] group-hover:text-[var(--color-foreground)] text-center leading-tight transition-colors">
                  {t('profile.contactSupport')}
                </span>
              </button>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            {t('profile.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
