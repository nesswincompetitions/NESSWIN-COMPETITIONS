import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, Inbox, Ticket, ShoppingBag, Info, ExternalLink } from 'lucide-react';
import { useAuth } from '@/shared/state/AuthContext';
import { fetchUserNotifications, markNotificationAsReadForUser, markAllNotificationsAsReadForUser } from '@/shared/services/notificationService';
const formatTimeAgo = (date) => {
  if (!date) return '';
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
};
import { useNavigate, Link } from 'react-router-dom';

export default function NotificationBell() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropdownRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const unsubscribe = fetchUserNotifications(currentUser.uid, (data) => {
      setNotifications(data);
    }, isAdmin);

    return () => unsubscribe();
  }, [currentUser?.uid, isAdmin]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (type) => {
    switch (type) {
      case 'payment_success':
        return <ShoppingBag className="w-4 h-4 text-green-400" />;
      case 'ticket_issued':
        return <Ticket className="w-4 h-4 text-blue-400" />;
      default:
        return <Info className="w-4 h-4 text-primary" />;
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsReadForUser(currentUser?.uid, notifications);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = async (notif) => {
    // Mark as read in UI immediately, then persist to Firestore.
    if (!notif.is_read) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));

      try {
        await markNotificationAsReadForUser(currentUser?.uid, notif.id);
      } catch (err) {
        console.error("Failed to mark as read:", err);
        // Roll back if update fails (permissions/network).
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: false } : n));
      }
    }

    // Navigate based on type.
    setIsOpen(false);
    
    // Give the dropdown a moment to start closing before navigating
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (notif.type === 'payment_success' || notif.type === 'ticket_issued' || notif.initial_page_name === 'MyTickets') {
      navigate('/profile/tickets');
    } else if (notif.initial_page_name === 'detailsPage' || notif.initial_page_name === 'participants') {
      let compId = null;
      if (notif.parameter_data) {
        try {
          const params = typeof notif.parameter_data === 'string' 
            ? JSON.parse(notif.parameter_data) 
            : notif.parameter_data;
          
          // Try multiple possible keys based on inconsistent backend patterns
          const path = params.compitation || params.competition_ref || params.competitionref || params.compitationRef || params.compitation_ref;
          
          if (path && typeof path === 'string') {
            compId = path.split('/').pop();
          } else if (params.competitionId) {
            compId = params.competitionId;
          }
        } catch (e) {
          console.warn('Failed to parse notification parameter_data:', e);
        }
      }
      
      if (compId) {
        navigate(`/competitions/${compId}`);
      } else {
        navigate('/competitions');
      }
    } else if (
      notif.category === 'Messages' || 
      notif.category === 'messages' || 
      notif.type === 'support_replied' || 
      notif.category === 'Support' || 
      notif.initial_page_name === 'SupportChat' ||
      notif.initial_page_name === 'chats'
    ) {
      // Extract chatId from multiple possible sources
      let chatId = null;
      
      // Try parameter_data first (common for push notifications)
      if (notif.parameter_data) {
        try {
          const params = typeof notif.parameter_data === 'string' 
            ? JSON.parse(notif.parameter_data) 
            : notif.parameter_data;
          
          chatId = params.chatId || params.chat_id;
          
          // Check for chatRef path (e.g. "chats/ID")
          if (!chatId && params.chatRef && typeof params.chatRef === 'string') {
            chatId = params.chatRef.split('/').pop();
          }
        } catch (e) {
          console.warn('Failed to parse notification parameter_data:', e);
        }
      }
      
      // Fallback to chat_ref or explicit chat_id
      if (!chatId && notif.chat_ref) {
        chatId = typeof notif.chat_ref === 'string' 
          ? notif.chat_ref.split('/').pop() 
          : notif.chat_ref.id;
      }
      
      if (!chatId && notif.chat_id) {
        chatId = notif.chat_id;
      }
  
      if (chatId) {
        navigate(`/profile/support/${chatId}`);
      } else {
        navigate('/profile');
      }
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted-foreground hover:text-primary transition-all duration-300 outline-none cursor-pointer group"
        aria-label="Notifications"
      >
        <Bell className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'scale-110' : 'group-hover:rotate-12'}`} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-background animate-in zoom-in duration-300">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-[320px] sm:w-[380px] bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-muted/20">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">
                  {unreadCount} New
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {notifications.length > 0 ? (
              <div className="divide-y divide-border/30">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`relative p-4 transition-all duration-200 hover:bg-muted/30 cursor-pointer ${!notif.is_read ? 'bg-primary/[0.03]' : ''}`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    {!notif.is_read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
                    )}
                    <div className="flex gap-4">
                      <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${!notif.is_read ? 'bg-primary/20' : 'bg-muted'}`}>
                        {getIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-0.5">
                          <p className={`text-sm font-semibold truncate ${!notif.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {notif.notification_title}
                          </p>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1">
                            {notif.timestamp?.seconds 
                              ? formatTimeAgo(new Date(notif.timestamp.seconds * 1000))
                              : 'Just now'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
                          {notif.notification_text}
                        </p>
                        
                        {notif.type === 'payment_success' && (
                          <Link
                            to="/profile/tickets"
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider hover:opacity-80 transition-opacity"
                          >
                            {notif.cta_text || 'View Tickets'}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                  <Inbox className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">No notifications yet</h4>
                <p className="text-xs text-muted-foreground">
                  When you win a prize or complete an order, we'll notify you here.
                </p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border/40 bg-muted/10 text-center">
            <Link
              to="/profile"
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
            >
              See all profile activity
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
