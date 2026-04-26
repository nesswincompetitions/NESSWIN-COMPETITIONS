import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  LogIn,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { signUpWithEmail, signInWithEmail, signInWithGoogle, signInWithApple } from "../../../services/authService";

// ─── Reusable Input Field ─────────────────────────────────────────────────────
function InputField({ id, name, type, label, placeholder, value, onChange, focused, onFocus, onBlur, icon: Icon, rightSlot }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <div className={`flex items-center gap-3 px-4 h-12 rounded-xl border bg-[var(--color-muted)]/20 transition-all duration-200 ${focused ? "border-[var(--color-primary)]/60 shadow-[0_0_0_3px_oklch(0.78_0.14_78/0.12)]" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30"}`}>
        <Icon className={`w-4 h-4 shrink-0 transition-colors duration-200 ${focused ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"}`} aria-hidden="true" />
        <input id={id} name={name} type={type} placeholder={placeholder} value={value} onChange={onChange} onFocus={onFocus} onBlur={onBlur} className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 outline-none w-full" />
        {rightSlot}
      </div>
    </div>
  );
}

// ─── Password Strength ────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const getStrength = () => {
    if (password.length < 6) return { label: "Weak", color: "bg-red-500", width: "w-1/3", textColor: "text-red-400" };
    if (password.length < 10) return { label: "Fair", color: "bg-amber-500", width: "w-2/3", textColor: "text-amber-400" };
    return { label: "Strong", color: "bg-emerald-500", width: "w-full", textColor: "text-emerald-400" };
  };
  const s = getStrength();
  return (
    <div className="space-y-1 pt-1">
      <div className="w-full h-1 rounded-full bg-[var(--color-muted)]/40 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${s.color} ${s.width}`} />
      </div>
      <p className={`text-[11px] font-medium ${s.textColor}`}>{s.label} password</p>
    </div>
  );
}

// ─── Card Components ────────────────────────────────────────────────────────
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
      <img src="/nesswin_logo.svg" alt="NessWin Logo" className="w-24 h-24 object-contain mx-auto mb-1.5" />
      <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase mb-2">{eyebrow}</p>
      <h1 className="font-serif text-3xl font-bold text-[var(--color-foreground)] mb-2">{title}</h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>
    </div>
  );
}

function SubmitButton({ label, icon: Icon, loading }) {
  return (
    <button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-300 shadow-[0_0_30px_oklch(0.78_0.14_78/0.3)] hover:shadow-[0_0_45px_oklch(0.78_0.14_78/0.5)] cursor-pointer disabled:opacity-50">
      {loading ? "Please wait..." : label}
      {!loading && <Icon className="w-4 h-4" aria-hidden="true" />}
    </button>
  );
}

function SocialLogin({ loading }) {
  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
      toast.success("Signed in with Google!");
    } catch (error) {
      toast.error(error.message || "Failed to sign in with Google");
    }
  };

  const handleApple = async () => {
    try {
      await signInWithApple();
      toast.success("Signed in with Apple!");
    } catch (error) {
      toast.error(error.message || "Failed to sign in with Apple");
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-[var(--color-border)]" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-[var(--color-card)] px-2 text-[var(--color-muted-foreground)]">Or continue with</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={loading} onClick={handleGoogle} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]/20 transition-colors cursor-pointer text-sm font-medium text-[var(--color-foreground)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
          Google
        </button>
        <button type="button" disabled={loading} onClick={handleApple} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]/20 transition-colors cursor-pointer text-sm font-medium text-[var(--color-foreground)]">
          <svg className="h-4 w-4 text-[var(--color-foreground)]" fill="currentColor" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05 1.8-3.08 1.8-1.08 0-1.55-.65-2.83-.65-1.25 0-1.78.63-2.8.68-1.05.05-2.25-.95-3.1-2.23C3.38 17.13 1.95 13.5 2.88 11c.45-1.2 1.55-2 2.83-2.03 1.05-.03 2.03.7 2.8.7.75 0 1.98-.85 3.23-.8 1.35.05 2.53.63 3.25 1.68-2.75 1.63-2.3 5.48.5 6.6-.68 1.6-1.58 2.78-2.61 3.13h.02zM14.93 5.2c-.65.8-1.6 1.3-2.58 1.25.15-1.03.65-1.95 1.33-2.58.68-.65 1.6-.13 2.45-1.15.2 1.08-.2 2.08-.85 2.88l-.35-.4z"/></svg>
          Apple
        </button>
      </div>
    </div>
  );
}

// ─── Sign Up Form ─────────────────────────────────────────────────────────────
function SignUpForm({ onSwitch }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [focused, setFocused] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await signUpWithEmail(form.email, form.password, form.name);
      toast.success("Account created successfully!");
    } catch (error) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <CardHeader eyebrow="Join NessWin" title="Create Account" subtitle="Start winning extraordinary prizes today" />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <InputField id="signup-name" name="name" type="text" label="Full Name" placeholder="Enter your full name" value={form.name} onChange={handleChange} focused={focused === "name"} onFocus={() => setFocused("name")} onBlur={() => setFocused("")} icon={User} />
        <InputField id="signup-email" name="email" type="email" label="Email Address" placeholder="Enter your email" value={form.email} onChange={handleChange} focused={focused === "email"} onFocus={() => setFocused("email")} onBlur={() => setFocused("")} icon={Mail} />
        <div className="space-y-1.5 pb-2">
          <InputField id="signup-password" name="password" type={showPassword ? "text" : "password"} label="Password" placeholder="Enter your password (Min. 8 characters)" value={form.password} onChange={handleChange} focused={focused === "password"} onFocus={() => setFocused("password")} onBlur={() => setFocused("")} icon={Lock} rightSlot={<button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer shrink-0" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>} />
          <PasswordStrength password={form.password} />
        </div>
        <SubmitButton label="Create Account" icon={ArrowRight} loading={loading} />
      </form>
      <SocialLogin loading={loading} />
      <div className="mt-6 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Already have an account? <button type="button" onClick={onSwitch} className="text-[var(--color-primary)] font-semibold hover:underline cursor-pointer transition-all">Sign In</button>
        </p>
      </div>
    </AuthCard>
  );
}

// ─── Sign In Form ─────────────────────────────────────────────────────────────
function SignInForm({ onSwitch }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [focused, setFocused] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(form.email, form.password);
      toast.success("Signed in successfully!");
    } catch (error) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <CardHeader eyebrow="Welcome Back" title="Sign In" subtitle="Enter your credentials to access your account" />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <InputField id="signin-email" name="email" type="email" label="Email Address" placeholder="Enter your email" value={form.email} onChange={handleChange} focused={focused === "email"} onFocus={() => setFocused("email")} onBlur={() => setFocused("")} icon={Mail} />
        <div className="space-y-1.5 pb-2">
          <InputField id="signin-password" name="password" type={showPassword ? "text" : "password"} label="Password" placeholder="Enter your password" value={form.password} onChange={handleChange} focused={focused === "password"} onFocus={() => setFocused("password")} onBlur={() => setFocused("")} icon={Lock} rightSlot={<button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer shrink-0" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>} />
          <div className="flex justify-end pt-1">
            <Link to="/forgot-password" className="text-xs text-[var(--color-primary)] hover:underline font-medium">Forgot password?</Link>
          </div>
        </div>
        <SubmitButton label="Sign In" icon={LogIn} loading={loading} />
      </form>
      <SocialLogin loading={loading} />
      <div className="mt-6 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Don't have an account yet? <button type="button" onClick={onSwitch} className="text-[var(--color-primary)] font-semibold hover:underline cursor-pointer transition-all">Sign Up</button>
        </p>
      </div>
    </AuthCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SignupPage() {
  const [mode, setMode] = useState("signup");

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col pt-24 pb-12">
      <div className="flex-1 flex items-center justify-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[var(--color-primary)]/6 rounded-full blur-[120px]" />
          <div className="absolute top-8 left-8 w-16 h-16 border border-[var(--color-primary)]/15 rotate-45" />
          <div className="absolute top-12 left-12 w-8 h-8 border border-[var(--color-primary)]/10 rotate-45" />
          <div className="absolute bottom-8 right-8 w-16 h-16 border border-[var(--color-primary)]/15 rotate-45" />
          <div className="absolute bottom-12 right-12 w-8 h-8 border border-[var(--color-primary)]/10 rotate-45" />
        </div>
        <div className="relative w-full max-w-md z-10">
          {mode === "signup" ? <SignUpForm onSwitch={() => setMode("signin")} /> : <SignInForm onSwitch={() => setMode("signup")} />}
        </div>
      </div>
    </div>
  );
}
