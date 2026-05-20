import React from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Navbar from '@/shared/components/common/Navbar';
import Footer from '@/shared/components/common/Footer';
import ScrollManager from '@/shared/components/common/ScrollManager';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';

const UserLayout = () => {
  const location = useLocation();
  const { loading } = useAuth();
  const { userData } = useUserData();

  const cachedRole = localStorage.getItem('nesswin_user_role');
  if (loading && cachedRole === 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!loading && userData?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="bg-[#050505] min-h-screen flex flex-col">
      <ScrollManager />
      <Navbar />

      <main className="grow">
        <div className="route-page" key={location.pathname}>
          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default UserLayout;
