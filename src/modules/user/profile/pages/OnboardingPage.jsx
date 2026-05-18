import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';
import DateOfBirthVerification from '@/modules/user/auth/components/DateOfBirthVerification';
import PhoneVerification from '@/modules/user/auth/components/PhoneVerification';
import UsernameReferral from '@/modules/user/auth/components/UsernameReferral';

import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';

export default function OnboardingPage() {
  const { loading } = useAuth();
  const { userData } = useUserData();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && userData?.is_verified && userData?.user_name && userData?.date_of_birth) {
      navigate(userData.role === 'admin' ? '/admin' : '/');
    }
  }, [userData, loading, navigate]);

  if (loading || !userData) {
    return <LoadingSpinner />;
  }

  // Step 1: Date of Birth Verification
  if (!userData.date_of_birth) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col pt-24 pb-12">
        <div className="flex-1 flex items-center justify-center px-6">
          <DateOfBirthVerification />
        </div>
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
