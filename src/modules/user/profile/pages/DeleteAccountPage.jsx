import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import { reauthenticate, deleteAccount } from '@/modules/user/profile/services/profileService';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

export default function DeleteAccountPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!confirmed) {
      toast.error('Please confirm you understand this action is irreversible.');
      return;
    }
    if (!password) {
      toast.error('Please enter your password to confirm deletion.');
      return;
    }

    setLoading(true);
    try {
      await reauthenticate(password);
      await deleteAccount(currentUser.uid);
      toast.success('Your account has been permanently deleted.');
      navigate('/');
    } catch (err) {
      toast.error(err.message ?? 'Failed to delete account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </button>

        {/* Warning card */}
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 mb-6 flex gap-4">
          <ShieldAlert className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-red-400 mb-2">This action is permanent</h2>
            <ul className="space-y-1 text-xs text-red-300/80 list-disc list-inside">
              <li>Your profile and all personal data will be deleted immediately</li>
              <li>All your tickets and order history will be lost</li>
              <li>Unclaimed referral rewards will be forfeited</li>
              <li>This cannot be reversed or recovered</li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-red-500 to-transparent mb-6" />

          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
              <Trash2 className="w-7 h-7 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Delete Account</h1>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-2">
              Permanently remove <span className="font-semibold text-[var(--color-foreground)]">{currentUser?.email}</span> and all associated data.
            </p>
          </div>

          <form onSubmit={handleDelete} className="space-y-5">
            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="delete-password" className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
                Confirm Password
              </label>
              <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/20 focus-within:border-red-500/60 transition-all">
                <input
                  id="delete-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${confirmed ? 'bg-red-500 border-red-500' : 'border-[var(--color-border)] group-hover:border-red-500/60'}`}>
                {confirmed && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only"
              />
              <span className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                I understand this will permanently delete my account and all my data. This action{' '}
                <span className="text-red-400 font-semibold">cannot be undone</span>.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !confirmed || !password}
              className="w-full h-12 rounded-xl bg-red-500 text-white text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Deleting Account...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Permanently Delete Account</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
