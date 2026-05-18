import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, Circle, Inbox, Loader2, MessageSquareText, Trophy, Gift, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/shared/state/AuthContext';
import { db } from '@/config/firebase';
import SupportChatWidget from '@/shared/components/support/SupportChatWidget';
import { markMessagesAsRead } from '@/shared/services/supportChatService';

const getRefPath = (refLike) => refLike?.path ?? '';

function WinnerChatBanner({ competitionRef }) {
  const navigate = useNavigate();
  const [compData, setCompData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!competitionRef) return;
    setLoading(true);
    getDoc(competitionRef).then(snap => {
      if (snap.exists()) {
        setCompData(snap.data());
      }
      setLoading(false);
    }).catch(err => {
      console.error("Error loading competition for banner:", err);
      setLoading(false);
    });
  }, [competitionRef]);

  if (loading) {
    return (
      <div className="bg-amber-500/5 border-b border-amber-500/20 px-6 py-3 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-amber-500/50" />
          </div>
          <div>
            <div className="h-4 w-32 bg-white/10 rounded mb-1.5" />
            <div className="h-3 w-48 bg-white/5 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!compData) return null;

  return (
    <div 
      className="relative bg-gradient-to-r from-amber-950/30 via-amber-900/5 to-transparent border-b border-amber-500/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 overflow-hidden"
      style={{
        animation: 'bannerSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      <style>{`
        @keyframes bannerSlideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Decorative ambient glow */}
      <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

      <div className="flex items-center gap-4 relative z-10">
        <div className="w-12 h-12 shrink-0 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.15)]">
          <Trophy className="h-6 w-6 text-amber-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
              Handover Chat
            </span>
            <span className="text-[10px] text-muted-foreground">
              ID: {competitionRef.id.slice(0, 8)}...
            </span>
          </div>
          <h4 className="text-sm font-semibold text-foreground truncate mt-1">{compData.title || "Prize Handover"}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Gift className="h-3 w-3 text-amber-500" />
            <span>Handover details and assets are ready to manage</span>
          </p>
        </div>
      </div>

      <button
        onClick={() => navigate(`/admin/winners/${competitionRef.id}`)}
        className="shrink-0 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(245,158,11,0.2)] hover:shadow-[0_4px_25px_rgba(245,158,11,0.35)] hover:scale-102 active:scale-98 cursor-pointer relative z-10"
      >
        <span>Manage Handover</span>
        <ExternalLink className="h-3.5 w-3.5 stroke-[2.5]" />
      </button>
    </div>
  );
}

export default function SupportInboxPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [globalOpenCount, setGlobalOpenCount] = useState(0);
  const [globalClosedCount, setGlobalClosedCount] = useState(0);
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const participantCacheRef = useRef(new Map());
  const selectedChatIdRef = useRef(null);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;

    const currentAdminRef = doc(db, 'user', currentUser.uid);
    const inboxQuery = query(
      collection(db, 'chats'),
      where('chat_type', 'in', ['support', 'winner_chat']),
      where('assigned_admin_id', '==', currentAdminRef),
      where('status', '==', 'active'),
      orderBy('last_message_time', 'desc')
    );

    let isMounted = true;

    const unsubscribe = onSnapshot(
      inboxQuery,
      (snapshot) => {
        void (async () => {
          const rows = await Promise.all(snapshot.docs.map(async (chatDoc) => {
            const chatData = chatDoc.data();
            const customerRef = getRefPath(chatData.sender_id) === getRefPath(currentAdminRef)
              ? chatData.receiver_id
              : chatData.sender_id;

            let customerName = 'Unknown User';
            let customerEmail = '';
            let customerPhoto = '';
            let customerId = '';

            if (customerRef) {
              const cached = participantCacheRef.current.get(getRefPath(customerRef));
              if (cached) {
                customerName = cached.customerName;
                customerEmail = cached.customerEmail;
                customerPhoto = cached.customerPhoto;
                customerId = cached.customerId;
              } else {
                const customerSnap = await getDoc(customerRef);
                if (customerSnap.exists()) {
                  const customerData = customerSnap.data();
                  customerName = customerData.display_name || customerData.user_name || customerData.name || 'Unknown User';
                  customerEmail = customerData.email || '';
                  customerPhoto = customerData.photo_url || customerData.profile_image || '';
                  customerId = customerSnap.id;
                  participantCacheRef.current.set(getRefPath(customerRef), {
                    customerName,
                    customerEmail,
                    customerPhoto,
                    customerId,
                  });
                }
              }
            }

            return {
              id: chatDoc.id,
              ...chatData,
              customerName,
              customerEmail,
              customerPhoto,
              customerId,
            };
          }));

          if (!isMounted) return;

          const filteredRows = rows.filter(
            (chat) => chat.last_message && chat.last_message.trim() !== ''
          );

          setChats(filteredRows);
          setLoadingChats(false);

          if (selectedChatIdRef.current && !filteredRows.some((row) => row.id === selectedChatIdRef.current)) {
            setSelectedChatId(null);
            setSelectedChat(null);
          }
        })().catch((error) => {
          console.error('Failed to build support inbox rows:', error);
          if (error.message?.includes("index")) {
            console.error("MISSING INDEX LINK:", error.message);
          }
          if (isMounted) {
            setChats([]);
            setLoadingChats(false);
          }
        });
      },
      (error) => {
        console.error('Support inbox listener error:', error.code, error.message, error);
        if (error.message?.includes("index")) {
          console.error("MISSING INDEX LINK:", error.message);
        }
        setChats([]);
        setLoadingChats(false);
        toast.error('Unable to load support inbox.');
      }
    );

    const dashboardRef = doc(db, 'system_metrics', 'dashboard');
    const unsubscribeDashboard = onSnapshot(
      dashboardRef,
      (snapshot) => {
        if (!isMounted) return;
        const data = snapshot.data() || {};
        setGlobalOpenCount(data.open_support_chats || 0);
        setGlobalClosedCount(data.closed_support_chats || 0);
      },
      (error) => {
        console.error('Error fetching dashboard support metrics:', error);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
      unsubscribeDashboard();
    };
  }, [currentUser?.uid]);

  const handleSelectChat = (chat) => {
    setSelectedChatId(chat.id);
    setSelectedChat(chat);

    void markMessagesAsRead(chat.id, currentUser?.uid, true).catch((error) => {
      console.warn('Failed to mark support inbox thread as read:', error);
    });
  };

  const handleClosed = () => {
    setSelectedChatId(null);
    setSelectedChat(null);
  };

  return (
    <div className={`mx-auto max-w-7xl ${selectedChatId ? 'space-y-0 xl:space-y-6 pb-0 xl:pb-12' : 'space-y-6 pb-12'}`}>
      <div className={`${selectedChatId ? 'hidden xl:block' : 'block'} rounded-3xl border border-border/60 bg-card p-6 shadow-[0_20px_80px_rgba(0,0,0,0.22)]`}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            <Inbox className="h-4 w-4" />
            Support Inbox
          </div>
          <h1 className="text-3xl font-bold text-(--color-foreground)">Support Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Live support threads assigned to you. Open a conversation on the left and handle it in real time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className={`${selectedChatId ? 'hidden xl:block' : 'block'} overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_20px_80px_rgba(0,0,0,0.18)]`}>
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-(--color-foreground)">Active Tickets</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center rounded-lg bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                  {globalOpenCount} Open
                </span>
                <span className="inline-flex items-center rounded-lg bg-muted/20 px-2 py-0.5 text-xs font-semibold text-muted-foreground border border-border/30">
                  {globalClosedCount} Resolved
                </span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquareText className="h-5 w-5" />
            </div>
          </div>

          <div className="max-h-175 overflow-y-auto p-3">
            {loadingChats ? (
              <div className="flex min-h-90 items-center justify-center text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : chats.length > 0 ? (
              <div className="space-y-2">
                {chats.map((chat) => {
                  const isSelected = chat.id === selectedChatId;
                  const isWinnerChat = chat.chat_type === 'winner_chat';

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => handleSelectChat(chat)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${isSelected
                        ? isWinnerChat
                          ? 'border-amber-500/40 bg-amber-500/10 shadow-[0_12px_35px_rgba(245,158,11,0.08)]'
                          : 'border-primary/30 bg-primary/10 shadow-[0_12px_35px_rgba(0,0,0,0.14)]'
                        : 'border-border/50 bg-muted/10 hover:border-primary/20 hover:bg-primary/5'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold overflow-hidden ${
                          isWinnerChat && !chat.customerPhoto
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25 animate-pulse'
                            : 'bg-primary/10 text-primary'
                        }`}>
                          {chat.customerPhoto ? (
                            <img src={chat.customerPhoto} alt="" className="h-full w-full object-cover" />
                          ) : (
                            chat.customerName?.slice(0, 2).toUpperCase() || 'U'
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="truncate font-semibold text-(--color-foreground)">{chat.customerName}</p>
                              {isWinnerChat && (
                                <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/20">
                                  🏆 Winner
                                </span>
                              )}
                            </div>
                            {chat.unread_sender_count > 0 ? (
                              <span className="inline-flex h-3 w-3 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.14)]" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {chat.last_message || 'New support chat'}
                          </p>
                          <div className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            <span>{chat.customerEmail || 'Customer'}</span>
                            {chat.last_message_time?.toDate ? chat.last_message_time.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-90 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Circle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-(--color-foreground)">No active support chats</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  New tickets will appear here as soon as they are assigned to you.
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className={`${selectedChatId ? 'block' : 'hidden xl:block'} h-[calc(100dvh-120px)] xl:h-190 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_20px_80px_rgba(0,0,0,0.22)] flex flex-col`}>
          {selectedChat ? (
            <>
              {selectedChat.chat_type === 'winner_chat' && (
                <WinnerChatBanner competitionRef={selectedChat.competition_ref} />
              )}
              <div className="flex-1 min-h-0">
                <SupportChatWidget
                  chatId={selectedChat.id}
                  currentUserRef={currentUser?.uid}
                  receiverRef={selectedChat.sender_id}
                  assignedAdminRef={selectedChat.assigned_admin_id}
                  isCurrentUserAdmin={true}
                  title={selectedChat.customerName}
                  customerId={selectedChat.customerId}
                  customerPhoto={selectedChat.customerPhoto}
                  closeLabel="Resolve & Close"
                  onCloseTicket={handleClosed}
                  onBack={handleClosed}
                  unreadCount={selectedChat.unread_admin_count ?? 0}
                  status={selectedChat.status ?? 'active'}
                />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-18 w-18 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <MessageSquareText className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold text-(--color-foreground)">Select a support ticket</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Open a ticket from the inbox to inspect the thread, reply in real time, and close it when resolved.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}