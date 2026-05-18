import React, { useState } from 'react';
import { CalendarDays, CheckCircle } from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { updateProfile } from '@/modules/user/profile/services/profileService';
import { auth } from '@/config/firebase';

export default function DateOfBirthVerification() {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dateOfBirth) {
      return toast.error('Please enter your date of birth');
    }

    const dobDate = new Date(dateOfBirth);
    const ageDiffMs = Date.now() - dobDate.getTime();
    const ageDate = new Date(ageDiffMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);

    if (age < 18) {
      return toast.error('You must be 18 or older to register and participate in competitions.');
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No user logged in');

      // Update in Firestore
      await updateProfile(user.uid, {
        date_of_birth: dobDate,
      });

      toast.success('Age verified successfully!');
    } catch (error) {
      toast.error(error.message || 'Failed to update date of birth');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] shadow-[0_8px_60px_rgba(0,0,0,0.35)] relative">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent" />
      <div className="p-8">
        <div className="text-center mb-8">
          <img src="/nesswin_logo.svg" alt="NessWin Logo" className="w-20 h-20 object-contain mx-auto mb-0" />
          <img src="/nesswin_logo_2.svg" alt="NessWin Text" className="h-12 object-contain mx-auto mb-4 -mt-2" />
          <p className="text-xs font-bold text-[var(--color-primary)] tracking-[0.25em] uppercase mb-2">Step 1 of 3</p>
          <h2 className="font-serif text-2xl font-bold text-[var(--color-foreground)] mb-2">Age Verification</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Required for legal compliance and competition eligibility. You must be 18 or older.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--color-muted-foreground)]">
              Date of Birth <span className="text-[var(--color-primary)]">*</span>
            </label>
            <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/20 focus-within:border-[var(--color-primary)]/60 transition-all">
              <CalendarDays className="w-4 h-4 shrink-0 text-[var(--color-muted-foreground)]" />
              <input
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !dateOfBirth}
            className="w-full h-12 rounded-xl mt-4 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]"
          >
            {loading ? (
              <><LoadingSpinner fullScreen={false} size="w-4 h-4" message="" /> Verifying...</>
            ) : (
              <><CheckCircle className="w-4 h-4" /> Verify Age</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
