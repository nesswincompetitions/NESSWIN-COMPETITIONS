import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Trophy,
  Award,
  Users,
  ShoppingCart,
  Share2,
  Ticket,
  MessageSquareText,
  Menu,
  X,
  LogOut
} from 'lucide-react';
import useAdminUnreadCounts from '@/shared/hooks/useAdminUnreadCounts';
import { logout } from '@/modules/user/auth/services/authService';
import { toast } from 'react-hot-toast';

const Sidebar = () => {
  const { t } = useTranslation('admin');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { supportUnread, winnerUnread } = useAdminUnreadCounts();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/signin');
    } catch (error) {
      toast.error('Failed to logout');
      console.error('Logout error:', error);
    }
  };

  const menuItems = [
    { name: t('sidebar.dashboard'), path: '/admin/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: t('sidebar.competitions'), path: '/admin/competitions', icon: <Trophy size={20} /> },
    { 
      name: t('sidebar.winners'), 
      path: '/admin/winners', 
      icon: <Award size={20} />,
      badge: winnerUnread > 0 ? winnerUnread : null
    },
    { name: t('sidebar.users'), path: '/admin/users', icon: <Users size={20} /> },
    { name: t('sidebar.orders'), path: '/admin/orders', icon: <ShoppingCart size={20} /> },
    { name: t('sidebar.referrals'), path: '/admin/referrals', icon: <Share2 size={20} /> },
    { name: t('sidebar.bonusTickets'), path: '/admin/bonus-tickets', icon: <Ticket size={20} /> },
    { 
      name: t('sidebar.supportInbox'), 
      path: '/admin/support-inbox', 
      icon: <MessageSquareText size={20} />,
      badge: supportUnread > 0 ? supportUnread : null
    },
  ];

  const toggleSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  return (
    <>
      {!isMobileOpen && (
        <button
          onClick={toggleSidebar}
          className="cursor-pointer md:hidden fixed top-4 left-4 z-50 p-2 bg-[#0a0a0a] border border-white/10 rounded-lg text-white shadow-lg"
        >
          <Menu size={24} />
        </button>
      )}

      <aside className="hidden md:block h-screen sticky top-0 shrink-0">
        <SidebarContent
          menuItems={menuItems}
          title={t('navbar.adminPanel')}
          onClose={toggleSidebar}
          onNavigate={() => setIsMobileOpen(false)}
          onLogout={handleLogout}
          t={t}
        />
      </aside>

      <div className={`cursor-pointer md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={toggleSidebar}
        />
        <div className={`absolute top-0 left-0 h-full transform transition-transform duration-300 ease-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <SidebarContent
            menuItems={menuItems}
            title={t('navbar.adminPanel')}
            onClose={toggleSidebar}
            onNavigate={() => setIsMobileOpen(false)}
            onLogout={handleLogout}
            t={t}
          />
        </div>
      </div>
    </>
  );
};

const SidebarContent = ({ menuItems, title, onClose, onNavigate, onLogout, t }) => (
  <div className="flex flex-col h-full bg-[#0a0a0a] border-r border-white/10 w-64 text-white">
    <div className="p-6 flex items-center justify-between">
      <h2 className="text-2xl font-serif font-bold bg-linear-to-r from-primary to-white bg-clip-text text-transparent">
        {title}
      </h2>
      <button className="cursor-pointer md:hidden text-gray-400 hover:text-white" onClick={onClose}>
        <X size={24} />
      </button>
    </div>

    <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
      {menuItems.map((item) => (
        <NavLink
          key={item.name}
          to={item.path}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
              ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.15)]'
              : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`cursor-pointer transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                {item.icon}
              </span>
              <span className="font-medium">{item.name}</span>
              {item.badge && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center animate-pulse">
                  {item.badge}
                </span>
              )}
              {isActive && !item.badge && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>

    <div className="p-4 border-t border-white/10 shrink-0">
      <button
        onClick={onLogout}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group cursor-pointer"
      >
        <span className="cursor-pointer transition-transform duration-200 group-hover:scale-110">
          <LogOut size={20} />
        </span>
        <span className="font-medium">{t('navbar.logout', 'Logout')}</span>
      </button>
    </div>
  </div>
);

export default Sidebar;
