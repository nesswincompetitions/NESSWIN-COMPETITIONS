import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Trophy, 
  Award, 
  Users, 
  ShoppingCart, 
  Share2, 
  Ticket, 
  Settings,
  Menu,
  X
} from 'lucide-react';

const Sidebar = () => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Competitions', path: '/admin/competitions', icon: <Trophy size={20} /> },
    { name: 'Winners', path: '/admin/winners', icon: <Award size={20} /> },
    { name: 'Users', path: '/admin/users', icon: <Users size={20} /> },
    { name: 'Orders', path: '/admin/orders', icon: <ShoppingCart size={20} /> },
    { name: 'Referrals', path: '/admin/referrals', icon: <Share2 size={20} /> },
    { name: 'Bonus Tickets', path: '/admin/bonus-tickets', icon: <Ticket size={20} /> },
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  const toggleSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-r border-white/10 w-64 text-white">
      <div className="p-6 flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold bg-gradient-to-r from-primary to-white bg-clip-text text-transparent">
          Admin Panel
        </h2>
        {/* Mobile close button inside sidebar */}
        <button className="md:hidden text-gray-400 hover:text-white" onClick={toggleSidebar}>
          <X size={24} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            onClick={() => setIsMobileOpen(false)} // Close on mobile after click
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.15)]'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                  {item.icon}
                </span>
                <span className="font-medium">{item.name}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
            A
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Admin User</span>
            <span className="text-xs text-gray-500">admin@nesswin.com</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button (visible only when sidebar is closed on mobile) */}
      {!isMobileOpen && (
        <button
          onClick={toggleSidebar}
          className="md:hidden fixed top-4 left-4 z-50 p-2 bg-[#0a0a0a] border border-white/10 rounded-lg text-white shadow-lg"
        >
          <Menu size={24} />
        </button>
      )}

      {/* Desktop Sidebar (Static) */}
      <aside className="hidden md:block h-screen sticky top-0 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar (Overlay) */}
      <div className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={toggleSidebar}
        />
        {/* Sliding Sidebar */}
        <div className={`absolute top-0 left-0 h-full transform transition-transform duration-300 ease-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <SidebarContent />
        </div>
      </div>
    </>
  );
};

export default Sidebar;
