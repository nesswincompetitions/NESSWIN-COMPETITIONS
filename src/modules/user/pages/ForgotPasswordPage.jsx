import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  KeyRound,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { passwordReset } from "../../../services/authService";

// ─── Reusable Components (Matching SignupPage) ────────────────────────────────
function InputField({ id, name, type, label, placeholder, value, onChange, focused, onFocus, onBlur, icon: Icon }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <div className={`flex items-center gap-3 px-4 h-12 rounded-xl border bg-[var(--color-muted)]/20 transition-all duration-200 ${focused ? "border-[var(--color-primary)]/60 shadow-[0_0_0_3px_oklch(0.78_0.14_78/0.12)]" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30"}`}>
        <Icon className={`w-4 h-4 shrink-0 transition-colors duration-200 ${focused ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"}`} aria-hidden="true" />
        <input id={id} name={name} type={type} placeholder={placeholder} value={value} onChange={onChange} onFocus={onFocus} onBlur={onBlur} className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 outline-none w-full" />
      </div>
    </div>
  );
}

function AuthCard({ children }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] overflow-hidden">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />
      <div className="p-8">{children}</div>
    </div>
  );
}

function CardHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="text-center mb-6">
      <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center mx-auto mb-4 border border-[var(--color-primary)]/20 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.1)]">
        <KeyRound className="w-10 h-10 text-[var(--color-primary)]" />
      </div>
      <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase mb-2">{eyebrow}</p>
      <h1 className="font-serif text-3xl font-bold text-[var(--color-foreground)] mb-2">{title}</h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>
    </div>
  );
}

function SubmitButton({ label, icon: Icon, loading }) {
  return (
    <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-300 shadow-[0_0_30px_oklch(0.78_0.14_78/0.3)] hover:shadow-[0_0_45px_oklch(0.78_0.14_78/0.5)] cursor-pointer disabled:opacity-50">
      {loading ? "Sending..." : label}
      {!loading && <Icon className="w-4 h-4" aria-hidden="true" />}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      await passwordReset(email);
      setSubmitted(true);
      toast.success("Reset link sent to your email!");
    } catch (error) {
      toast.error(error.message || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col pt-24 pb-12">
      <div className="flex-1 flex items-center justify-center px-6 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[var(--color-primary)]/6 rounded-full blur-[120px]" />
          <div className="absolute top-8 left-8 w-16 h-16 border border-[var(--color-primary)]/15 rotate-45" />
          <div className="absolute top-12 left-12 w-8 h-8 border border-[var(--color-primary)]/10 rotate-45" />
          <div className="absolute bottom-8 right-8 w-16 h-16 border border-[var(--color-primary)]/15 rotate-45" />
          <div className="absolute bottom-12 right-12 w-8 h-8 border border-[var(--color-primary)]/10 rotate-45" />
        </div>

        <div className="relative w-full max-w-md z-10">
          <AuthCard>
            {!submitted ? (
              <>
                <CardHeader 
                  eyebrow="Security" 
                  title="Reset Password" 
                  subtitle="Enter your email and we'll send you a link to reset your password" 
                />
                <form onSubmit={handleSubmit} noValidate className="space-y-6">
                  <InputField 
                    id="reset-email" 
                    name="email" 
                    type="email" 
                    label="Email Address" 
                    placeholder="Enter your email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    focused={focused === "email"} 
                    onFocus={() => setFocused("email")} 
                    onBlur={() => setFocused("")} 
                    icon={Mail} 
                  />
                  <SubmitButton label="Send Reset Link" icon={ArrowRight} loading={loading} />
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                  <Mail className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-serif font-bold text-[var(--color-foreground)] mb-3">Check Your Email</h2>
                <p className="text-sm text-[var(--color-muted-foreground)] mb-8 leading-relaxed">
                  We've sent a password reset link to <span className="text-[var(--color-foreground)] font-semibold">{email}</span>. 
                  Please check your inbox and follow the instructions.
                </p>
                <button 
                  onClick={() => setSubmitted(false)}
                  className="text-xs text-[var(--color-primary)] font-bold tracking-widest uppercase hover:underline cursor-pointer"
                >
                  Didn't receive the email? Try again
                </button>
              </div>
            )}

            <div className="mt-8 text-center border-t border-[var(--color-border)]/40 pt-6">
              <Link to="/signin" className="inline-flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                Back to Sign In
              </Link>
            </div>
          </AuthCard>
        </div>
      </div>
    </div>
  );
}
