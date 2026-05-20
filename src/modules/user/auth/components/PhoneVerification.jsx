import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, ArrowRight, ChevronDown, Search } from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { linkWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { updateProfile } from '@/modules/user/profile/services/profileService';
import { defaultCountries, parseCountry } from 'react-international-phone';

// ─── Country Code Helper Utilities ──────────────────────────────────────────
const getFlagEmoji = (countryCode) => {
  if (!countryCode) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch (e) {
    return '';
  }
};

const getFormatString = (parsed) => {
  if (!parsed.format) return '';
  if (typeof parsed.format === 'string') {
    return parsed.format;
  }
  if (typeof parsed.format === 'object' && parsed.format.default) {
    return parsed.format.default;
  }
  return '';
};

// ─── Country Code Data (Loaded dynamically) ─────────────────────────────────
const COUNTRY_CODES = defaultCountries.map((c) => {
  const parsed = parseCountry(c);
  const formatString = getFormatString(parsed);
  return {
    code: `+${parsed.dialCode}`,
    country: parsed.iso2.toUpperCase(),
    flag: getFlagEmoji(parsed.iso2),
    name: parsed.name,
    format: formatString ? formatString.replace(/\./g, '#') : undefined,
  };
});

const formatPhoneNumber = (value, mask) => {
  if (!mask) return value;
  const digits = value.replace(/\D/g, '');
  let formatted = '';
  let digitIndex = 0;
  for (let i = 0; i < mask.length && digitIndex < digits.length; i++) {
    if (mask[i] === '#') { formatted += digits[digitIndex]; digitIndex++; }
    else { formatted += mask[i]; }
  }
  return formatted;
};

function CountryCodeSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = COUNTRY_CODES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.includes(search) ||
      c.country.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-2 h-12 px-4 rounded-l-xl border border-r-0 transition-all cursor-pointer min-w-[110px]
          ${open
            ? 'border-[var(--color-primary)]/60 bg-[var(--color-primary)]/5'
            : 'border-[var(--color-border)] bg-[var(--color-muted)]/20 hover:border-[var(--color-primary)]/30'}
        `}
      >
        <span className="text-xl leading-none">{selected.flag}</span>
        <span className="text-sm font-bold text-[var(--color-foreground)]">{selected.code}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-muted-foreground)] transition-transform duration-300 ${open ? 'rotate-180 text-[var(--color-primary)]' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-[300px] bg-[var(--color-card)] border border-[var(--color-border)]/60 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-3 border-b border-[var(--color-border)]/40 bg-[var(--color-muted)]/10">
            <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)]/60 focus-within:border-[var(--color-primary)]/40 transition-all">
              <Search className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              <input
                type="text"
                placeholder="Search country..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]/50"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[240px] py-1 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <Search className="w-8 h-8 text-[var(--color-muted-foreground)]/20 mb-2" />
                <p className="text-xs text-[var(--color-muted-foreground)]">No countries found</p>
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={`${c.country}-${c.code}`}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); setSearch(''); }}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 text-left transition-all cursor-pointer
                    ${selected.country === c.country && selected.code === c.code
                      ? 'bg-[var(--color-primary)]/10'
                      : 'hover:bg-[var(--color-muted)]/40'}
                  `}
                >
                  <span className="text-xl leading-none">{c.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${selected.country === c.country ? 'font-bold text-[var(--color-primary)]' : 'font-medium text-[var(--color-foreground)]'}`}>
                      {c.name}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">{c.country}</p>
                  </div>
                  <span className={`text-xs font-mono font-bold ${selected.country === c.country ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-foreground)]'}`}>
                    {c.code}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OTP Input ──────────────────────────────────────────────────────────────
function OtpInput({ value, onChange }) {
  const inputsRef = useRef([]);
  const otpArray = value.split('').concat(Array(6).fill('')).slice(0, 6);

  const handleInputChange = (index, e) => {
    const val = e.target.value;
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otpArray];
    newOtp[index] = val.substring(val.length - 1);
    onChange(newOtp.join(''));
    if (val && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otpArray[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
        const newOtp = [...otpArray];
        newOtp[index - 1] = '';
        onChange(newOtp.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData) {
      onChange(pastedData);
      inputsRef.current[Math.min(pastedData.length, 5)]?.focus();
    }
  };

  return (
    <div className="flex gap-3 justify-center py-2">
      {otpArray.map((digit, i) => (
        <div key={i} className="relative group">
          <input
            ref={(el) => (inputsRef.current[i] = el)}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleInputChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={`
              w-12 h-14 rounded-xl border-2 text-center text-xl font-bold transition-all outline-none
              ${digit
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-foreground)]'
                : 'border-[var(--color-border)] bg-[var(--color-muted)]/20 text-[var(--color-foreground)]/40 focus:border-[var(--color-primary)]/60 focus:bg-[var(--color-primary)]/5'
              }
            `}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function PhoneVerification() {
  const defaultCountry = COUNTRY_CODES.find((c) => c.country === 'IN') || COUNTRY_CODES[0];
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('phone'); // 'phone' | 'code'

  // ─── Refs hold the verifier and widget ID — no window globals needed ────
  // Using refs (not state) because these are imperative handles, not render data.
  const verifierRef = useRef(null);
  const widgetIdRef = useRef(null);

  const fullNumber = `${selectedCountry.code}${phoneNumber.replace(/\D/g, '')}`;

  /**
   * getVerifier — Production-level reCAPTCHA management.
   *
   * Strategy: CREATE ONCE, RESET ON RETRY.
   *
   * Why not destroy+recreate every time?
   * Because calling `.render()` on a container that grecaptcha has already
   * registered (even after innerHTML = '') causes:
   *   "reCAPTCHA has already been rendered in this element"
   * grecaptcha tracks rendered containers internally and doesn't respect DOM wipes.
   *
   * The correct approach:
   *   1. First call → create verifier, call render(), cache the widgetId.
   *   2. Subsequent calls (retry/resend) → grecaptcha.reset(widgetId) to refresh
   *      the token without touching the DOM or creating a new verifier.
   *   3. Only fully recreate if the verifier ref was lost (component remount).
   */
  const getVerifier = useCallback(() => {
    return new Promise((resolve, reject) => {
      // Case 1: Verifier already exists and is rendered — just reset the token.
      if (verifierRef.current !== null && widgetIdRef.current !== null) {
        try {
          if (typeof grecaptcha !== 'undefined') {
            grecaptcha.reset(widgetIdRef.current);
          }
          resolve(verifierRef.current);
        } catch (err) {
          // If reset fails for any reason, fall through to full recreation below.
          verifierRef.current = null;
          widgetIdRef.current = null;
          getVerifier().then(resolve).catch(reject);
        }
        return;
      }

      // Case 2: No verifier yet (first mount or after component remount).
      // Ensure the container is clean before creating a new one.
      const container = document.getElementById('recaptcha-container');
      if (!container) {
        reject(new Error('reCAPTCHA container not found in DOM'));
        return;
      }
      container.innerHTML = '';

      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => {
          // Token expired — reset the widget so it can be re-solved on next send
          if (widgetIdRef.current !== null && typeof grecaptcha !== 'undefined') {
            try { grecaptcha.reset(widgetIdRef.current); } catch (_) {}
          }
          toast.error('Security token expired. Please click Send Code again.');
        },
      });

      verifier.render()
        .then((widgetId) => {
          verifierRef.current = verifier;
          widgetIdRef.current = widgetId;
          resolve(verifier);
        })
        .catch((err) => {
          // render() itself failed — clean up fully
          try { verifier.clear(); } catch (_) {}
          container.innerHTML = '';
          verifierRef.current = null;
          widgetIdRef.current = null;
          reject(err);
        });
    });
  }, []);

  // Initialize verifier on mount, destroy cleanly on unmount.
  useEffect(() => {
    getVerifier().catch(() => {});

    return () => {
      if (verifierRef.current) {
        try { verifierRef.current.clear(); } catch (_) {}
        verifierRef.current = null;
        widgetIdRef.current = null;
      }
      const container = document.getElementById('recaptcha-container');
      if (container) container.innerHTML = '';
    };
  }, [getVerifier]);

  const handleSendCode = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!phoneNumber.trim()) return toast.error('Please enter your phone number');

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No user is logged in.');

      // ── Pre-check: Is this number already registered? ──────────────────────
      // Query Firestore BEFORE triggering the SMS — saves cost and gives an
      // instant, friendly error instead of the raw Firebase auth error.
      const phoneQuery = query(
        collection(db, 'user'),
        where('phone_number', '==', fullNumber)
      );
      const phoneSnap = await getDocs(phoneQuery);
      if (!phoneSnap.empty) {
        // Check if it's already linked to THIS user (edge case: retry after partial success)
        const existingDoc = phoneSnap.docs[0];
        if (existingDoc.id !== user.uid) {
          toast.error('This phone number is already registered to another account.');
          setLoading(false);
          return;
        }
      }

      // Get (or reset) the verifier — awaited so Firebase always gets a live token.
      const verifier = await getVerifier();

      const result = await linkWithPhoneNumber(user, fullNumber, verifier);
      setConfirmationResult(result);
      setStep('code');
      toast.success('Verification code sent!');
    } catch (error) {
      console.error('Send code error:', error);
      if (error.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later.');
      } else if (error.code === 'auth/invalid-phone-number') {
        toast.error('Invalid phone number. Please check and try again.');
      } else if (
        error.code === 'auth/credential-already-in-use' ||
        error.code === 'auth/account-exists-with-different-credential'
      ) {
        toast.error('This phone number is already registered to another account.');
      } else if (error.code === 'auth/provider-already-linked') {
        toast.error('A phone number is already linked to your account.');
      } else if (error.code === 'auth/invalid-app-credential') {
        toast.error('Verification setup failed. Please refresh and try again.');
      } else if (error.code === 'auth/captcha-check-failed') {
        toast.error('Security check failed. Please refresh the page and try again.');
      } else {
        toast.error('Failed to send verification code. Please try again.');
      }
      // On any error reset the widget so the next attempt gets a fresh token.
      if (widgetIdRef.current !== null && typeof grecaptcha !== 'undefined') {
        try { grecaptcha.reset(widgetIdRef.current); } catch (_) {}
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (verificationCode.length < 6) return toast.error('Please enter the full 6-digit code');

    setLoading(true);
    try {
      const result = await confirmationResult.confirm(verificationCode);
      await updateProfile(result.user.uid, {
        phone_number: result.user.phoneNumber,
        is_verified: true,
      });
      toast.success('Phone verified successfully!');
    } catch (error) {
      console.error('Verify code error:', error);
      if (error.code === 'auth/invalid-verification-code') {
        toast.error('Incorrect code. Please double-check and try again.');
      } else if (error.code === 'auth/code-expired') {
        toast.error('Code expired. Please request a new one.');
        // Go back to phone step so user can resend
        setStep('phone');
        setVerificationCode('');
        setConfirmationResult(null);
      } else if (
        error.code === 'auth/credential-already-in-use' ||
        error.code === 'auth/account-exists-with-different-credential'
      ) {
        toast.error('This phone number is already registered to another account.');
      } else if (error.code === 'auth/provider-already-linked') {
        toast.error('A phone number is already linked to your account.');
      } else {
        toast.error('Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Resend: just go back to phone step and re-send. getVerifier() will do a
  // grecaptcha.reset() internally — no DOM teardown needed.
  const handleResend = () => {
    setVerificationCode('');
    setConfirmationResult(null);
    setStep('phone');
    // Wait one tick for React to commit, then send
    setTimeout(() => handleSendCode(), 0);
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] relative">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />
      <div className="p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/nesswin_logo.svg" alt="NessWin Logo" className="w-20 h-20 object-contain mx-auto mb-0" />
          <img src="/nesswin_logo_2.svg" alt="NessWin Text" className="h-12 object-contain mx-auto mb-4 -mt-2" />
          <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase mb-2">Step 2 of 3</p>
          <h2 className="font-serif text-2xl font-bold text-[var(--color-foreground)] mb-2">Verify Phone</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {step === 'phone'
              ? 'Required for competition integrity and account security.'
              : `We sent a 6-digit code to ${selectedCountry.flag} ${selectedCountry.code} ••••${phoneNumber.slice(-4)}`}
          </p>
        </div>

        {/*
          recaptcha-container must ALWAYS stay in the DOM (not inside any conditional)
          so that the verifier's DOM node is never unmounted while it is still active.
          className="hidden" keeps it invisible while still being mounted.
        */}
        <div id="recaptcha-container" className="hidden" />

        {step === 'phone' ? (
          <form onSubmit={handleSendCode} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
                Phone Number
              </label>
              <div className="flex">
                <CountryCodeSelect
                  selected={selectedCountry}
                  onChange={(c) => { setSelectedCountry(c); setPhoneNumber(''); }}
                />
                <div className="flex-1 flex items-center h-12 px-4 rounded-r-xl border border-[var(--color-border)] bg-[var(--color-muted)]/20 focus-within:border-[var(--color-primary)]/60 transition-all">
                  <input
                    type="tel"
                    placeholder="Enter your phone number"
                    value={phoneNumber}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      setPhoneNumber(formatPhoneNumber(raw, selectedCountry.format));
                    }}
                    className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]/40"
                    autoComplete="tel-national"
                  />
                </div>
              </div>
            </div>

            <button
              id="send-code-button"
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]"
            >
              {loading
                ? <><LoadingSpinner fullScreen={false} size="w-4 h-4" message="" /> Sending...</>
                : <>Send Code <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-6">
            <div className="space-y-4 py-2">
              <label className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)] text-center block">
                Enter Verification Code
              </label>
              <OtpInput value={verificationCode} onChange={setVerificationCode} />
            </div>

            <button
              type="submit"
              disabled={loading || verificationCode.length < 6}
              className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]"
            >
              {loading
                ? <><LoadingSpinner fullScreen={false} size="w-4 h-4" message="" /> Verifying...</>
                : <>Verify &amp; Continue <CheckCircle className="w-4 h-4" /></>}
            </button>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setVerificationCode('');
                  setConfirmationResult(null);
                }}
                className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >
                ← Change number
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="text-xs text-[var(--color-primary)] hover:underline transition-colors cursor-pointer disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
