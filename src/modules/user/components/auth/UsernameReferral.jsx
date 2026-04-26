import React, { useState, useEffect, useRef } from 'react';
import { AtSign, Gift, CheckCircle, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../utils/firebase';
import { completeOnboarding } from '../../../../services/authService';
import { auth } from '../../../../utils/firebase';

// Username status states
const STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  TAKEN: 'taken',
  TOO_SHORT: 'too_short',
};

export default function UsernameReferral() {
  const [username, setUsername] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(STATUS.IDLE);
  const debounceRef = useRef(null);

  // Real-time debounced username check
  useEffect(() => {
    const trimmed = username.trim();

    // Reset immediately on empty
    if (!trimmed) {
      setUsernameStatus(STATUS.IDLE);
      return;
    }

    // Validation — show inline without hitting DB
    if (trimmed.length < 3 || trimmed.length > 20) {
      setUsernameStatus(STATUS.TOO_SHORT);
      return;
    }

    // Show checking state immediately, then debounce the DB call
    setUsernameStatus(STATUS.CHECKING);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const currentUid = auth.currentUser?.uid;
        const q = query(collection(db, 'user'), where('user_name', '==', trimmed));
        const snap = await getDocs(q);

        if (snap.empty) {
          setUsernameStatus(STATUS.AVAILABLE);
        } else {
          // Available if the only match is the current user themselves
          const takenByOther = snap.docs.some(d => d.id !== currentUid);
          setUsernameStatus(takenByOther ? STATUS.TAKEN : STATUS.AVAILABLE);
        }
      } catch {
        setUsernameStatus(STATUS.IDLE);
      }
    }, 450);

    return () => clearTimeout(debounceRef.current);
  }, [username]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username || username.trim().length < 3) {
      return toast.error('Username must be at least 3 characters');
    }
    if (usernameStatus === STATUS.TAKEN) {
      return toast.error('That username is already taken');
    }
    if (usernameStatus === STATUS.CHECKING) {
      return toast.error('Still checking username — please wait a moment');
    }

    setLoading(true);
    try {
      await completeOnboarding(username, referralCode);
      toast.success('Welcome to Nesswin!');
    } catch (error) {
      toast.error(error.message || 'Failed to complete setup');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic border color for username input
  const inputBorderClass = {
    [STATUS.IDLE]:      'border-[var(--color-border)] focus-within:border-[var(--color-primary)]/60',
    [STATUS.CHECKING]:  'border-[var(--color-border)] focus-within:border-[var(--color-primary)]/60',
    [STATUS.TOO_SHORT]: 'border-[var(--color-border)] focus-within:border-[var(--color-primary)]/60',
    [STATUS.AVAILABLE]: 'border-emerald-500/50 focus-within:border-emerald-500/70',
    [STATUS.TAKEN]:     'border-red-500/50 focus-within:border-red-500/70',
  }[usernameStatus];

  const isSubmitDisabled =
    loading ||
    usernameStatus === STATUS.TAKEN ||
    usernameStatus === STATUS.CHECKING ||
    usernameStatus === STATUS.TOO_SHORT ||
    !username.trim();

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] relative">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />
      <div className="p-8">
        <div className="text-center mb-8">
          <img src="/nesswin_logo.svg" alt="NessWin Logo" className="w-20 h-20 object-contain mx-auto mb-0" />
          <img src="/nesswin_logo_2.svg" alt="NessWin Text" className="h-12 object-contain mx-auto mb-4 -mt-2" />
          <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase mb-2">Final Step</p>
          <h2 className="font-serif text-2xl font-bold text-[var(--color-foreground)] mb-2">Choose Username</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Create your unique identity and enter a referral code if you have one.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
              Username <span className="text-[var(--color-primary)]">*</span>
            </label>
            <div className={`flex items-center gap-3 px-4 h-12 rounded-xl border bg-[var(--color-muted)]/20 transition-all ${inputBorderClass}`}>
              <AtSign className="w-4 h-4 shrink-0 text-[var(--color-muted-foreground)]" />
              <input
                type="text"
                placeholder="yash123"
                value={username}
                maxLength={20}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none"
                autoComplete="username"
              />
              {/* Status icon */}
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                {usernameStatus === STATUS.CHECKING && (
                  <Loader2 className="w-4 h-4 text-[var(--color-muted-foreground)] animate-spin" />
                )}
                {usernameStatus === STATUS.AVAILABLE && (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                )}
                {usernameStatus === STATUS.TAKEN && (
                  <X className="w-4 h-4 text-red-500" />
                )}
              </div>
            </div>

            {/* Status message */}
            <div className="ml-1 mt-1.5 flex flex-col gap-1">
              {usernameStatus === STATUS.IDLE && (
                <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">
                  3-20 characters · Letters, numbers, underscores only
                </p>
              )}
              {usernameStatus === STATUS.TOO_SHORT && (
                <p className="text-[11px] text-red-400">
                  Username must be between 3 and 20 characters
                </p>
              )}
              {usernameStatus === STATUS.CHECKING && (
                <p className="text-[11px] text-[var(--color-muted-foreground)]">Checking availability…</p>
              )}
              {usernameStatus === STATUS.AVAILABLE && (
                <p className="text-[11px] text-emerald-500 font-medium">@{username} is available ✓</p>
              )}
              {usernameStatus === STATUS.TAKEN && (
                <p className="text-[11px] text-red-500 font-medium">@{username} is already taken</p>
              )}
              {usernameStatus === STATUS.IDLE && (
                <p className="text-[11px] text-[var(--color-muted-foreground)]">Only letters, numbers, and underscores</p>
              )}
            </div>
          </div>

          {/* Referral Code */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
              Referral Code <span className="text-[var(--color-muted-foreground)]/50">(Optional)</span>
            </label>
            <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/20 focus-within:border-[var(--color-primary)]/60 transition-all">
              <Gift className="w-4 h-4 shrink-0 text-[var(--color-muted-foreground)]" />
              <input
                type="text"
                placeholder="NESSWIN-YASH1234"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]/30 uppercase tracking-wider"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full h-12 rounded-xl mt-4 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Completing Setup...</>
              : <><CheckCircle className="w-4 h-4" /> Complete Setup</>}
          </button>
        </form>
      </div>
    </div>
  );
}
