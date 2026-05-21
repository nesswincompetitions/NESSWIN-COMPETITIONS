import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserRoutes, AdminRoutes } from '@/routes';
import { AuthProvider } from '@/shared/state/AuthContext';
import { UserProvider } from '@/contexts/UserContext';
import { Toaster } from 'react-hot-toast';
import { LazyMotion, domAnimation } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/config/queryClient';

// Minimal full-screen spinner shown while a lazy page chunk is being downloaded.
// Matches the app's dark background so there's no white flash.
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'oklch(0.10 0.006 60)',
  }}>
    <div style={{
      width: '2rem',
      height: '2rem',
      border: '3px solid oklch(0.78 0.14 78)',
      borderTopColor: 'transparent',
      borderRadius: '9999px',
      animation: 'spin 0.7s linear infinite',
    }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const App = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('nesswin_referral_code', refCode);
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation}>
        <AuthProvider>
          <UserProvider>
            <Router>
              <Toaster position="top-center" />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {UserRoutes}
                  {AdminRoutes}

                  {/* If the route does not exist (404), redirect to Home */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Router>
          </UserProvider>
        </AuthProvider>
      </LazyMotion>
    </QueryClientProvider>
  );
};

export default App;