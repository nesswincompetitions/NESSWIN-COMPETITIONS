import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import PhoneVerification from '../components/auth/PhoneVerification';
import UsernameReferral from '../components/auth/UsernameReferral';

export default function OnboardingPage() {
  const { userData, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && userData?.is_verified) {
      navigate(userData.role === 'admin' ? '/admin' : '/');
    }
  }, [userData, loading, navigate]);

  if (loading || !userData) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Step 2: Phone Verification
  if (!userData.phone_number) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col pt-24 pb-12">
        <div className="flex-1 flex items-center justify-center px-6">
          <PhoneVerification />
        </div>
      </div>
    );
  }

  // Step 3: Username & Referral
  if (!userData.user_name || !userData.is_verified) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col pt-24 pb-12">
        <div className="flex-1 flex items-center justify-center px-6">
          <UsernameReferral />
        </div>
      </div>
    );
  }

  return null;
}
