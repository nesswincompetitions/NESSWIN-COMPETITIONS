import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { CheckCircle2, Circle, Inbox, Loader2, MessageSquareText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/shared/state/AuthContext';
import { db } from '@/config/firebase';
import SupportChatWidget from '@/shared/components/support/SupportChatWidget';
import { markMessagesAsRead } from '@/shared/services/supportChatService';

const getRefPath = (refLike) => refLike?.path ?? '';

export default function SupportInboxPage() {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState([]);
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

            if (customerRef) {
              const cached = participantCacheRef.current.get(getRefPath(customerRef));
              if (cached) {
                customerName = cached.customerName;
                customerEmail = cached.customerEmail;
              } else {
                const customerSnap = await getDoc(customerRef);
                if (customerSnap.exists()) {
                  const customerData = customerSnap.data();
                  customerName = customerData.display_name || customerData.user_name || customerData.name || 'Unknown User';
                  customerEmail = customerData.email || '';
                  participantCacheRef.current.set(getRefPath(customerRef), { customerName, customerEmail });
                }
              }
            }

            return {
              id: chatDoc.id,
              ...chatData,
              customerName,
              customerEmail,
            };
          }));

          if (!isMounted) return;

          setChats(rows);
          setLoadingChats(false);

          if (selectedChatIdRef.current && !rows.some((row) => row.id === selectedChatIdRef.current)) {
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

    return () => {
      isMounted = false;
      unsubscribe();
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
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
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
        <aside className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_20px_80px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-(--color-foreground)">Active Tickets</h2>
              <p className="text-sm text-muted-foreground">{chats.length} open conversation{chats.length === 1 ? '' : 's'}</p>
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

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => handleSelectChat(chat)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${isSelected
                        ? 'border-primary/30 bg-primary/10 shadow-[0_12px_35px_rgba(0,0,0,0.14)]'
                        : 'border-border/50 bg-muted/10 hover:border-primary/20 hover:bg-primary/5'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">
                          {chat.customerName?.slice(0, 2).toUpperCase() || 'U'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate font-semibold text-(--color-foreground)">{chat.customerName}</p>
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

        <section className="min-h-190 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
          {selectedChat ? (
            <SupportChatWidget
              chatId={selectedChat.id}
              currentUserRef={currentUser?.uid}
              receiverRef={selectedChat.sender_id}
              assignedAdminRef={selectedChat.assigned_admin_id}
              isCurrentUserAdmin={true}
              title={selectedChat.customerName}
              closeLabel="Resolve & Close"
              onCloseTicket={handleClosed}
              unreadCount={selectedChat.unread_admin_count ?? 0}
              status={selectedChat.status ?? 'active'}
            />
          ) : (
            <div className="flex min-h-190 flex-col items-center justify-center px-6 text-center">
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