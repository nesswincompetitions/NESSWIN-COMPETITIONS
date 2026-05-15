import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserRoutes, AdminRoutes } from '@/routes';
import { AuthProvider } from '@/shared/state/AuthContext';
import { UserProvider } from '@/contexts/UserContext';
import { Toaster } from 'react-hot-toast';

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
    <AuthProvider>
      <UserProvider>
        <Router>
          <Toaster position="top-center" />
          <Routes>
            {UserRoutes}
            {AdminRoutes}

            {/* If the route does not exist (404), redirect to Home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </UserProvider>
    </AuthProvider>
  );
};

export default App;