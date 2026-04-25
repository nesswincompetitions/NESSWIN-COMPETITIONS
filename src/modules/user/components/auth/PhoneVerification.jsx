import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, CheckCircle, ArrowRight, ChevronDown, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { linkWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../../utils/firebase';

// ─── Country Code Data ──────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+1',  country: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+1',  country: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
  { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: '+966', country: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
  { code: '+82', country: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: '+31', country: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: '+46', country: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: '+47', country: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: '+45', country: 'DK', flag: '🇩🇰', name: 'Denmark' },
  { code: '+353', country: 'IE', flag: '🇮🇪', name: 'Ireland' },
  { code: '+65', country: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: '+60', country: 'MY', flag: '🇲🇾', name: 'Malaysia' },
  { code: '+63', country: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: '+92', country: 'PK', flag: '🇵🇰', name: 'Pakistan' },
  { code: '+880', country: 'BD', flag: '🇧🇩', name: 'Bangladesh' },
  { code: '+234', country: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+27', country: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: '+254', country: 'KE', flag: '🇰🇪', name: 'Kenya' },
  { code: '+55', country: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: '+52', country: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: '+7',  country: 'RU', flag: '🇷🇺', name: 'Russia' },
  { code: '+90', country: 'TR', flag: '🇹🇷', name: 'Turkey' },
  { code: '+48', country: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: '+62', country: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: '+66', country: 'TH', flag: '🇹🇭', name: 'Thailand' },
  { code: '+84', country: 'VN', flag: '🇻🇳', name: 'Vietnam' },
];

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
        className="flex items-center gap-1.5 h-12 px-3 rounded-l-xl border border-r-0 border-[var(--color-border)] bg-[var(--color-muted)]/30 hover:bg-[var(--color-muted)]/50 transition-colors cursor-pointer min-w-[100px]"
      >
        <span className="text-lg leading-none">{selected.flag}</span>
        <span className="text-sm font-medium text-[var(--color-foreground)]">{selected.code}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-[280px] max-h-[260px] bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] z-50 overflow-hidden">
          <div className="p-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[var(--color-muted)]/30">
              <Search className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
              <input
                type="text"
                placeholder="Search country..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]/50"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[200px]">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)] text-center py-4">No results</p>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={`${c.country}-${i}`}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-muted)]/30 transition-colors cursor-pointer ${
                    selected.country === c.country && selected.code === c.code ? 'bg-[var(--color-primary)]/10' : ''
                  }`}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="text-sm text-[var(--color-foreground)] flex-1">{c.name}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)] font-mono">{c.code}</span>
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

  const setupRecaptcha = useCallback(() => {
    // Fully destroy any existing verifier first
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch (_) {}
      window.recaptchaVerifier = null;
    }

    // Reset the grecaptcha widget registry so the next render() call
    // doesn't think the container is already occupied
    if (typeof grecaptcha !== 'undefined' && window.recaptchaWidgetId !== undefined) {
      try { grecaptcha.reset(window.recaptchaWidgetId); } catch (_) {}
      window.recaptchaWidgetId = undefined;
    }

    // Wipe the DOM node so there's no leftover iframe/script
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';

    // Create a fresh verifier tied to the clean container
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => toast.error('reCAPTCHA expired. Please try again.'),
    });

    window.recaptchaVerifier.render().then((widgetId) => {
      window.recaptchaWidgetId = widgetId;
    }).catch((_) => {
      // If render itself fails (e.g. element still busy), wipe and retry once
      const el = document.getElementById('recaptcha-container');
      if (el) el.innerHTML = '';
    });
  }, []);

  useEffect(() => {
    setupRecaptcha();
    return () => {
      // Full cleanup on unmount so the next mount starts totally fresh
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
      const result = await linkWithPhoneNumber(user, fullNumber, window.recaptchaVerifier);
      setConfirmationResult(result);
      setStep('code');
      toast.success('Verification code sent!');
    } catch (error) {
      console.error('Send code error:', error);
      if (error.code === 'auth/too-many-requests') toast.error('Too many attempts. Please try again later.');
      else if (error.code === 'auth/invalid-phone-number') toast.error('Invalid phone number. Please check and try again.');
      else if (error.code === 'auth/credential-already-in-use') toast.error('This phone number is already linked to another account.');
      else if (error.code === 'auth/invalid-app-credential') toast.error('Verification failed. Please ensure Phone Auth is enabled in Firebase Console.');
      else toast.error(error.message || 'Failed to send verification code');

      if (window.recaptchaWidgetId !== undefined && typeof grecaptcha !== 'undefined') {
        grecaptcha.reset(window.recaptchaWidgetId);
      } else {
        setupRecaptcha();
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
      const userRef = doc(db, 'user', result.user.uid);
      await setDoc(userRef, { phone_number: result.user.phoneNumber }, { merge: true });
      toast.success('Phone verified successfully!');
    } catch (error) {
      console.error('Verify code error:', error);
      if (error.code === 'auth/invalid-verification-code') toast.error('Invalid code. Please check and try again.');
      else if (error.code === 'auth/credential-already-in-use') toast.error('This phone number is already linked to another account.');
      else toast.error(error.message || 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    setVerificationCode('');
    setStep('phone');
    setupRecaptcha();
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] overflow-hidden">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />
      <div className="p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 mb-4">
            <Phone className="w-6 h-6 text-[var(--color-primary)]" />
          </div>
          <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase mb-2">Step 2 of 3</p>
          <h2 className="font-serif text-2xl font-bold text-[var(--color-foreground)] mb-2">Verify Phone</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {step === 'phone'
              ? 'Enter your phone number to receive a verification code.'
              : `We sent a 6-digit code to ${selectedCountry.flag} ${selectedCountry.code} ••••${phoneNumber.slice(-4)}`}
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendCode} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
                Phone Number
              </label>
              <div className="flex">
                <CountryCodeSelect selected={selectedCountry} onChange={setSelectedCountry} />
                <div className="flex-1 flex items-center h-12 px-4 rounded-r-xl border border-[var(--color-border)] bg-[var(--color-muted)]/20 focus-within:border-[var(--color-primary)]/60 transition-all">
                  <input
                    type="tel"
                    placeholder="7700 900000"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                    className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]/40"
                    autoComplete="tel-national"
                  />
                </div>
              </div>
            </div>

            {/* Invisible reCAPTCHA container */}
            <div id="recaptcha-container"></div>

            <button
              id="send-code-button"
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-[var(--color-primary-foreground)] border-t-transparent rounded-full animate-spin"></div> Sending...</>
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
                <><div className="w-4 h-4 border-2 border-[var(--color-primary-foreground)] border-t-transparent rounded-full animate-spin"></div> Verifying...</>
              ) : (
                <>Verify &amp; Continue <CheckCircle className="w-4 h-4" /></>
              )}
            </button>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleResend}
                className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >
                ← Change number
              </button>
              <button
                type="button"
                onClick={() => { setVerificationCode(''); handleSendCode(); }}
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
