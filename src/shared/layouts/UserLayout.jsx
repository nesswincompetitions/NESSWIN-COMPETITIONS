import React from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Navbar from '@/shared/components/common/Navbar';
import Footer from '@/shared/components/common/Footer';
import ScrollManager from '@/shared/components/common/ScrollManager';
import { useAuth } from '@/shared/state/AuthContext';

const UserLayout = () => {
  const location = useLocation();
  const { userData, loading } = useAuth();

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
