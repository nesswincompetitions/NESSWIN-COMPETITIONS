import React from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import ScrollManager from '../components/common/ScrollManager';
import { useAuth } from '../context/AuthContext';

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
