import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../modules/admin/components/sidebar/Sidebar';

const AdminLayout = () => {
  return (
    <div className="flex min-h-screen bg-[#050505] text-white selection:bg-primary/30">
      <Sidebar />
      <main className="flex-1 w-full overflow-hidden flex flex-col h-screen">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
