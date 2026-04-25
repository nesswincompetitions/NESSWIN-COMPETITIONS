import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { currentUser, userData, loading } = useAuth();
  const location = useLocation();

  if (loading) {
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

  // Logged in but not verified -> force onboarding
  if (!userData.is_verified) {
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
  }

  // If verified and trying to access onboarding, redirect them away
  if (userData.is_verified && location.pathname === '/onboarding') {
    return <Navigate to={userData.role === 'admin' ? '/admin' : '/'} replace />;
  }

  // Role-based access control
  if (requireAdmin && userData.role !== 'admin') {
    // Non-admin trying to access admin routes
    return <Navigate to="/" replace />;
  }

  if (!requireAdmin && userData.role === 'admin') {
    // Admin trying to access regular protected routes (e.g., /competitions) 
    // Usually admins can see user routes, but based on the prompt "if role == admin navigate to admin panel"
    // we might want to strictly redirect them if they try to use the user app
    // I'll redirect them if they go to the root user app route, or let's be strict if needed.
    // For now, if an admin is here and the route doesn't require admin, we can redirect to /admin
    // But this might break if they want to view the public site. 
    // Let's only redirect if they go to specifically protected user routes.
  }

  return children;
};

// Optional: A wrapper to redirect logged-in verified users away from Auth pages (like /signin)
export const AuthRoute = ({ children }) => {
  const { currentUser, userData, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (currentUser && userData) {
    if (!userData.is_verified) {
      return <Navigate to="/onboarding" replace />;
    } else {
      return <Navigate to={userData.role === 'admin' ? '/admin' : '/'} replace />;
    }
  }

  return children;
};
