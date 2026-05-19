import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, ArrowRight, ChevronDown, Search } from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { linkWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { updateProfile } from '@/modules/user/profile/services/profileService';

// ─── Country Code Data ──────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India', format: '##### #####' },
  { code: '+1',  country: 'US', flag: '🇺🇸', name: 'United States', format: '(###) ###-####' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom', format: '#### ### ####' },
  { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE', format: '## ### ####' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France', format: '## ## ## ## ##' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain', format: '### ### ###' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy', format: '### ### ####' },
  { code: '+31', country: 'NL', flag: '🇳🇱', name: 'Netherlands', format: '## ### ####' },
  { code: '+32', country: 'BE', flag: '🇧🇪', name: 'Belgium', format: '### ## ## ##' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany', format: '###########' },
];

/**
 * formatPhoneNumber
 * Applies a mask (e.g. "#### ### ####") to a raw digit string.
 */
const formatPhoneNumber = (value, mask) => {
  if (!mask) return value;
  const digits = value.replace(/\D/g, '');
  let formatted = '';
  let digitIndex = 0;

  for (let i = 0; i < mask.length && digitIndex < digits.length; i++) {
    if (mask[i] === '#') {
      formatted += digits[digitIndex];
      digitIndex++;
    } else {
      formatted += mask[i];
    }
  }
  return formatted;
};

// ─── Country Code Dropdown ──────────────────────────────────────────────────
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
                <p className="text-xs text-[var(--color-muted-foreground)]">No countries found matching your search</p>
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={`${c.country}-${c.code}`}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                    setSearch('');
                  }}
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
                    <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold">
                      {c.country}
                    </p>
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
      const nextIndex = Math.min(pastedData.length, 5);
      inputsRef.current[nextIndex]?.focus();
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
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('phone'); // 'phone' | 'code'

  const fullNumber = `${selectedCountry.code}${phoneNumber.replace(/\s/g, '')}`;

  /**
   * setupRecaptcha — returns a Promise that resolves ONLY after the verifier
   * has been fully rendered. This prevents the race-condition where
   * linkWithPhoneNumber() is called before Firebase has finished setting up
   * the invisible reCAPTCHA, which causes auth/argument-error.
   */
  const setupRecaptcha = useCallback(() => {
    return new Promise((resolve, reject) => {
      // 1. Destroy any existing verifier completely
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch (_) {}
        window.recaptchaVerifier = null;
      }

      // 2. Reset the grecaptcha widget registry
      if (typeof grecaptcha !== 'undefined' && window.recaptchaWidgetId !== undefined) {
        try { grecaptcha.reset(window.recaptchaWidgetId); } catch (_) {}
        window.recaptchaWidgetId = undefined;
      }

      // 3. Wipe the DOM container — no leftover iframes or scripts
      const container = document.getElementById('recaptcha-container');
      if (!container) {
        // Container not mounted yet — harmless, will be retried on next call
        resolve();
        return;
      }
      container.innerHTML = '';

      // 4. Create a fresh verifier
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => toast.error('reCAPTCHA expired. Please try again.'),
      });

      // 5. Wait for render to complete before resolving
      window.recaptchaVerifier.render()
        .then((widgetId) => {
          window.recaptchaWidgetId = widgetId;
          resolve();
        })
        .catch((err) => {
          const el = document.getElementById('recaptcha-container');
          if (el) el.innerHTML = '';
          reject(err);
        });
    });
  }, []);

  useEffect(() => {
    setupRecaptcha().catch(() => {});
    return () => {
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch (_) {}
        window.recaptchaVerifier = null;
      }
      if (typeof grecaptcha !== 'undefined' && window.recaptchaWidgetId !== undefined) {
        try { grecaptcha.reset(window.recaptchaWidgetId); } catch (_) {}
        window.recaptchaWidgetId = undefined;
      }
      const container = document.getElementById('recaptcha-container');
      if (container) container.innerHTML = '';
    };
  }, [setupRecaptcha]);

  const handleSendCode = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!phoneNumber.trim()) return toast.error('Please enter your phone number');

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No user is logged in.');

      // CRITICAL: always await the full recaptcha setup before calling Firebase.
      // Without this await the verifier may not be ready → auth/argument-error.
      await setupRecaptcha();

      const result = await linkWithPhoneNumber(user, fullNumber, window.recaptchaVerifier);
      setConfirmationResult(result);
      setStep('code');
      toast.success('Verification code sent!');
    } catch (error) {
      console.error('Send code error:', error);
      if (error.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later.');
      } else if (error.code === 'auth/invalid-phone-number') {
        toast.error('Invalid phone number. Please check and try again.');
      } else if (error.code === 'auth/credential-already-in-use') {
        toast.error('This phone number is already linked to another account.');
      } else if (error.code === 'auth/invalid-app-credential') {
        toast.error('Verification failed. Please ensure Phone Auth is enabled in Firebase Console.');
      } else {
        toast.error(error.message || 'Failed to send verification code');
      }
      // Reset verifier so the next attempt starts clean
      await setupRecaptcha().catch(() => {});
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
        is_verified: true
      });
      toast.success('Phone verified successfully!');
    } catch (error) {
      console.error('Verify code error:', error);
      if (error.code === 'auth/invalid-verification-code') {
        toast.error('Invalid code. Please check and try again.');
      } else if (error.code === 'auth/credential-already-in-use') {
        toast.error('This phone number is already linked to another account.');
      } else {
        toast.error(error.message || 'Failed to verify code');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleResend — goes back to the phone step and fires a fresh OTP.
   * We set the step first so React re-renders (keeping recaptcha-container in DOM),
   * then wait one tick before sending so the container is guaranteed to be present.
   */
  const handleResend = async () => {
    setVerificationCode('');
    setConfirmationResult(null);
    setStep('phone');
    // Give React one tick to commit the state change before touching the DOM
    await new Promise((r) => setTimeout(r, 50));
    handleSendCode();
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
          IMPORTANT: This container MUST stay in the DOM at all times — not inside
          the step === 'phone' conditional. If it unmounts when we switch to the OTP
          step, setupRecaptcha() can't find the element and Firebase will throw
          auth/argument-error on any resend/retry attempt.
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
                  onChange={(c) => {
                    setSelectedCountry(c);
                    setPhoneNumber('');
                  }}
                />
                <div className="flex-1 flex items-center h-12 px-4 rounded-r-xl border border-[var(--color-border)] bg-[var(--color-muted)]/20 focus-within:border-[var(--color-primary)]/60 transition-all">
                  <input
                    type="tel"
                    placeholder="Enter your phone number"
                    value={phoneNumber}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      const formatted = formatPhoneNumber(raw, selectedCountry.format);
                      setPhoneNumber(formatted);
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
              {loading ? (
                <><LoadingSpinner fullScreen={false} size="w-4 h-4" message="" /> Sending...</>
              ) : (
                <>Send Code <ArrowRight className="w-4 h-4" /></>
              )}
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
              {loading ? (
                <><LoadingSpinner fullScreen={false} size="w-4 h-4" message="" /> Verifying...</>
              ) : (
                <>Verify &amp; Continue <CheckCircle className="w-4 h-4" /></>
              )}
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
