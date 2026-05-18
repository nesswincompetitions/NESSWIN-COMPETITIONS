import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';

export const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { currentUser, userData, initialLoading } = useAuth();
  const location = useLocation();

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not logged in
  if (!currentUser) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  // Logged in but no user data (should be rare due to sparse doc creation, but just in case)
  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Logged in but not verified or onboarding incomplete -> force onboarding (skip for admins)
  if (userData.role !== 'admin' && (!userData.is_verified || !userData.user_name || !userData.date_of_birth)) {
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
  }

  // If verified and trying to access onboarding, redirect them away
  if (userData.role !== 'admin' && userData.is_verified && userData.user_name && userData.date_of_birth && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  // Role-based access control
  if (requireAdmin && userData.role !== 'admin') {
    // Non-admin trying to access admin routes
    return <Navigate to="/" replace />;
  }

  if (!requireAdmin && userData.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return children;
};

// Optional: A wrapper to redirect logged-in verified users away from Auth pages (like /signin)
export const AuthRoute = ({ children }) => {
  const { currentUser, userData, initialLoading } = useAuth();

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (currentUser && userData) {
    if (userData.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    if (!userData.is_verified || !userData.user_name || !userData.date_of_birth) {
      return <Navigate to="/onboarding" replace />;
    } else {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};
