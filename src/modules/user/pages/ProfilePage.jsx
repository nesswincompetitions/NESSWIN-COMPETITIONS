import React, { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { logout } from "../../../services/authService";
import { useNavigate } from "react-router-dom";
import {
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
} from "lucide-react";
import { toast } from "react-hot-toast";

export default function ProfilePage() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopyReferral = () => {
    if (userData?.referral_code) {
      navigator.clipboard.writeText(userData.referral_code);
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out successfully");
      navigate("/");
    } catch (error) {
      toast.error("Failed to sign out");
    }
  };

  // Format Firestore timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
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
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Profile Header Card */}
        <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] overflow-hidden mb-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />

          {/* Banner Gradient */}
          <div className="h-28 bg-gradient-to-br from-[var(--color-primary)]/20 via-[var(--color-primary)]/5 to-transparent relative">
            <div className="absolute -bottom-12 left-6">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[var(--color-card)] shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
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
              </div>
            </div>
          </div>

          {/* User Info */}
          <div className="pt-16 pb-6 px-6">
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">
              {userData?.display_name || "User"}
            </h1>
            {userData?.user_name && (
              <p className="text-sm text-[var(--color-primary)] font-medium mt-0.5">
                @{userData.user_name}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              {userData?.role && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                  userData.role === "admin"
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
                  Verified
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
              Contact Information
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">Email</p>
                  <p className="text-sm text-[var(--color-foreground)] truncate">{currentUser?.email || "Not set"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">Phone</p>
                  <p className="text-sm text-[var(--color-foreground)]">{userData?.phone_number || "Not verified"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">Member Since</p>
                  <p className="text-sm text-[var(--color-foreground)]">{formatDate(userData?.created_time)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Referral & Rewards */}
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--color-muted-foreground)] mb-4">
              Referral & Rewards
            </h2>
            <div className="space-y-4">
              {/* Referral Code */}
              {userData?.referral_code && (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
                    <Tag className="w-4 h-4 text-[var(--color-primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">Your Referral Code</p>
                    <p className="text-sm font-mono font-bold text-[var(--color-primary)]">{userData.referral_code}</p>
                  </div>
                  <button
                    onClick={handleCopyReferral}
                    className="p-2 rounded-lg hover:bg-[var(--color-muted)]/30 transition-colors cursor-pointer"
                    aria-label="Copy referral code"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                    )}
                  </button>
                </div>
              )}

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
                    Referrals
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
                    Free Tickets
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
