import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import ScrollManager from '../components/common/ScrollManager';

const UserLayout = () => {
  const location = useLocation();

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
