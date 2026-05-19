import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import Sidebar from '@/modules/admin/shared/components/Sidebar';
import AdminNavbar from '@/modules/admin/shared/components/AdminNavbar';
import { db } from '@/config/firebase';
import { useAuth } from '@/shared/state/AuthContext';
import useAdminUnreadCounts from '@/shared/hooks/useAdminUnreadCounts';

const AdminLayout = () => {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { totalUnread } = useAdminUnreadCounts();
  const prevUnreadRef = React.useRef(totalUnread);

  // 1. Manage Admin Online Status
  useEffect(() => {
    if (!currentUser?.uid) return;

    const adminRef = doc(db, 'user', currentUser.uid);

    // Set online
    const setOnline = async (status) => {
      try {
        await updateDoc(adminRef, {
          is_online: status,
          last_active_at: serverTimestamp()
        });
      } catch (err) {
        console.error('Failed to update online status:', err);
      }
    };

    setOnline(true);

    // Set offline on unmount or tab close
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setOnline(false);
      } else {
        setOnline(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      setOnline(false);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser?.uid]);

  // 2. Global Unread Notification Toast
  useEffect(() => {
    if (totalUnread > prevUnreadRef.current) {
      // Only toast if we're not already on the support or winner pages
      const isOnChatPage = location.pathname.includes('support-inbox') || location.pathname.includes('winners/');
      if (!isOnChatPage) {
        toast('New message received!', {
          icon: '💬',
          duration: 4000,
          position: 'bottom-right',
          style: {
            background: '#121212',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)'
          }
        });
      }
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread, location.pathname]);

  return (
    <div className="flex min-h-screen bg-[#050505] text-white selection:bg-primary/30">
      <Sidebar />
      <main className="flex-1 w-full overflow-hidden flex flex-col h-screen">
        <AdminNavbar />
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="route-page" key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

