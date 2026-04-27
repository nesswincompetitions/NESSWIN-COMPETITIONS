import React from 'react';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { logout } from '../../../services/authService';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const AdminNavbar = () => {
  const { currentUser, userData } = useAuth();
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

  const getInitials = () => {
    if (userData?.display_name) {
      return userData.display_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return currentUser?.email?.[0].toUpperCase() || 'A';
  };

  return (
    <header className="h-16 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Placeholder for breadcrumbs or page title if needed */}
        <h1 className="text-sm font-medium text-gray-400 hidden md:block">
          Overview
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Profile Section */}
        <div className="flex items-center gap-3 pl-4 border-l border-white/10">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-medium text-white">
              {userData?.display_name || 'Admin User'}
            </span>
            <span className="text-xs text-gray-500">
              {currentUser?.email || 'admin@nesswin.com'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
            {userData?.photo_url ? (
              <img 
                src={userData.photo_url} 
                alt="Profile" 
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              getInitials()
            )}
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer group"
          title="Logout"
        >
          <LogOut size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </header>
  );
};

export default AdminNavbar;
