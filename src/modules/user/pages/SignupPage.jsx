import { useState } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  LogIn,
} from "lucide-react";

// ─── Reusable Input Field ─────────────────────────────────────────────────────

function InputField({
  id,
  name,
  type,
  label,
  placeholder,
  value,
  onChange,
  focused,
  onFocus,
  onBlur,
  icon: Icon,
  rightSlot,
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]"
      >
        {label}
      </label>
      <div
        className={`
          flex items-center gap-3 px-4 h-12 rounded-xl border
          bg-[var(--color-muted)]/20 transition-all duration-200
          ${
            focused
              ? "border-[var(--color-primary)]/60 shadow-[0_0_0_3px_oklch(0.78_0.14_78/0.12)]"
              : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30"
          }
        `}
      >
        <Icon
          className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
            focused
              ? "text-[var(--color-primary)]"
              : "text-[var(--color-muted-foreground)]"
          }`}
          aria-hidden="true"
        />
        <input
          id={id}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          autoComplete={
            name === "email"
              ? "email"
              : name === "password"
              ? "current-password"
              : name === "name"
              ? "name"
              : "off"
          }
          className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 outline-none"
        />
        {rightSlot}
      </div>
    </div>
  );
}

// ─── Password Strength ────────────────────────────────────────────────────────

function PasswordStrength({ password }) {
  if (!password) return null;

  const getStrength = () => {
    if (password.length < 6)
      return { label: "Weak", color: "bg-red-500", width: "w-1/3", textColor: "text-red-400" };
    if (password.length < 10)
      return { label: "Fair", color: "bg-amber-500", width: "w-2/3", textColor: "text-amber-400" };
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

// ─── Card Shell ───────────────────────────────────────────────────────────────

function AuthCard({ children }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] overflow-hidden">
      {/* Gold accent top line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />
      <div className="p-8">{children}</div>
    </div>
  );
}

// ─── Card Header ─────────────────────────────────────────────────────────────

function CardHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="text-center mb-8">
      <img 
        src="/nesswin_logo.svg" 
        alt="NessWin Logo" 
        className="w-24 h-24 object-contain mx-auto mb-1.5" 
      />
      <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase mb-2">
        {eyebrow}
      </p>
      <h1 className="font-serif text-3xl font-bold text-[var(--color-foreground)] mb-2">
        {title}
      </h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>
    </div>
  );
}

// ─── Submit Button ────────────────────────────────────────────────────────────

function SubmitButton({ label, icon: Icon }) {
  return (
    <button
      type="submit"
      className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-300 shadow-[0_0_30px_oklch(0.78_0.14_78/0.3)] hover:shadow-[0_0_45px_oklch(0.78_0.14_78/0.5)] cursor-pointer"
    >
      {label}
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

// ─── Sign Up Form ─────────────────────────────────────────────────────────────

function SignUpForm({ onSwitch }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [focused, setFocused] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Sign up:", form);
  };

  return (
    <AuthCard>
      <CardHeader
        eyebrow="Join NessWin"
        title="Create Account"
        subtitle="Start winning extraordinary prizes today"
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Name */}
        <InputField
          id="signup-name"
          name="name"
          type="text"
          label="Full Name"
          placeholder="John Doe"
          value={form.name}
          onChange={handleChange}
          focused={focused === "name"}
          onFocus={() => setFocused("name")}
          onBlur={() => setFocused("")}
          icon={User}
        />

        {/* Email */}
        <InputField
          id="signup-email"
          name="email"
          type="email"
          label="Email Address"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange}
          focused={focused === "email"}
          onFocus={() => setFocused("email")}
          onBlur={() => setFocused("")}
          icon={Mail}
        />

        {/* Password */}
        <div className="space-y-1.5 pb-2">
          <InputField
            id="signup-password"
            name="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            placeholder="Min. 8 characters"
            value={form.password}
            onChange={handleChange}
            focused={focused === "password"}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused("")}
            icon={Lock}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer shrink-0"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword
                  ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                  : <Eye className="w-4 h-4" aria-hidden="true" />
                }
              </button>
            }
          />
          <PasswordStrength password={form.password} />
        </div>

        <SubmitButton label="Create Account" icon={ArrowRight} />
      </form>

      {/* Switch to Sign In */}
      <div className="mt-6 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitch}
            className="text-[var(--color-primary)] font-semibold hover:underline cursor-pointer transition-all"
          >
            Sign In
          </button>
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

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Sign in:", form);
  };

  return (
    <AuthCard>
      <CardHeader
        eyebrow="Welcome Back"
        title="Sign In"
        subtitle="Enter your credentials to access your account"
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Email */}
        <InputField
          id="signin-email"
          name="email"
          type="email"
          label="Email Address"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange}
          focused={focused === "email"}
          onFocus={() => setFocused("email")}
          onBlur={() => setFocused("")}
          icon={Mail}
        />

        {/* Password */}
        <div className="space-y-1.5 pb-2">
          <InputField
            id="signin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            placeholder="Your password"
            value={form.password}
            onChange={handleChange}
            focused={focused === "password"}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused("")}
            icon={Lock}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer shrink-0"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword
                  ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                  : <Eye className="w-4 h-4" aria-hidden="true" />
                }
              </button>
            }
          />
          {/* Forgot password */}
          <div className="flex justify-end pt-1">
            <Link
              to="/forgot-password"
              className="text-xs text-[var(--color-primary)] hover:underline font-medium"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <SubmitButton label="Sign In" icon={LogIn} />
      </form>

      {/* Switch to Sign Up */}
      <div className="mt-6 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Don't have an account yet?{" "}
          <button
            type="button"
            onClick={onSwitch}
            className="text-[var(--color-primary)] font-semibold hover:underline cursor-pointer transition-all"
          >
            Sign Up
          </button>
        </p>
      </div>
    </AuthCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const [mode, setMode] = useState("signup"); // "signup" | "signin"

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col pt-24 pb-12">
      {/* ── Main ── */}
      <div className="flex-1 flex items-center justify-center px-6 relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[var(--color-primary)]/6 rounded-full blur-[120px]" />
          <div className="absolute top-8 left-8 w-16 h-16 border border-[var(--color-primary)]/15 rotate-45" />
          <div className="absolute top-12 left-12 w-8 h-8 border border-[var(--color-primary)]/10 rotate-45" />
          <div className="absolute bottom-8 right-8 w-16 h-16 border border-[var(--color-primary)]/15 rotate-45" />
          <div className="absolute bottom-12 right-12 w-8 h-8 border border-[var(--color-primary)]/10 rotate-45" />
        </div>

        <div className="relative w-full max-w-md z-10">
          {mode === "signup"
            ? <SignUpForm onSwitch={() => setMode("signin")} />
            : <SignInForm onSwitch={() => setMode("signup")} />
          }
        </div>
      </div>
    </div>
  );
}
