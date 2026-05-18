import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, MessageSquareText } from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/shared/state/AuthContext';
import { db } from '@/config/firebase';
import SupportChatWidget from '@/shared/components/support/SupportChatWidget';
import { useTranslation } from 'react-i18next';

export default function SupportChatPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [chatData, setChatData] = useState(null);
  const [hasLoadedChat, setHasLoadedChat] = useState(false);

  useEffect(() => {
    if (!chatId) return undefined;
    const chatRef = doc(db, 'chats', chatId);

    const unsubscribe = onSnapshot(
      chatRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setChatData({ id: snapshot.id, ...snapshot.data() });
        } else {
          setChatData(null);
        }
        setHasLoadedChat(true);
      },
      (error) => {
        console.warn('Support chat metadata listener error:', error.code, error.message);
        setChatData(null);
        setHasLoadedChat(true);
        toast.error(t('profile.support.chatUnavailable'));
      }
    );

    return unsubscribe;
  }, [chatId]);

  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 pb-16 pt-24">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <button
          onClick={() => navigate('/profile/support')}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('profile.support.backToSupport')}
        </button>

        <div className="rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-primary)]">
            <MessageSquareText className="h-4 w-4" />
            {chatData?.chat_type === 'winner_chat' ? t('profile.support.winnerSupport') : t('profile.support.supportTicket')}
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">
            {chatData?.chat_type === 'winner_chat' ? t('profile.support.prizeHandover') : t('profile.support.yourSupportChat')}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            {chatData?.chat_type === 'winner_chat' 
              ? t('profile.support.prizeHandoverDesc')
              : t('profile.support.supportChatDesc')}
          </p>
        </div>

        {!hasLoadedChat ? (
          <div className="flex min-h-[440px] items-center justify-center rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-card)]">
            <LoadingSpinner fullScreen={false} size="w-8 h-8" message="" />
          </div>
        ) : chatData ? (
          <div className="h-[65vh] md:h-[600px] w-full rounded-3xl border border-[var(--color-border)]/60 shadow-lg overflow-hidden flex flex-col bg-[var(--color-card)]">
            <SupportChatWidget
              chatId={chatId}
              currentUserRef={currentUser?.uid}
              receiverRef={chatData.assigned_admin_id || (chatData.chat_type === 'winner_chat' ? chatData.sender_id : chatData.receiver_id)}
              assignedAdminRef={chatData.assigned_admin_id || (chatData.chat_type === 'winner_chat' ? chatData.sender_id : chatData.receiver_id)}
              isCurrentUserAdmin={false}
              chatType={chatData.chat_type}
              title={chatData.chat_type === 'winner_chat' ? t('profile.support.prizeHandoverChat') : t('profile.support.supportChat')}
              closeLabel={chatData.chat_type === 'winner_chat' ? t('profile.support.endConversation') : t('profile.support.closeTicket')}
              onCloseTicket={() => navigate('/profile/support')}
              unreadCount={chatData.unread_receiver_count ?? 0}
              status={chatData.status ?? 'active'}
            />
          </div>
        ) : (
          <div className="flex min-h-[440px] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--color-border)]/60 bg-[var(--color-card)] px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <MessageSquareText className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-foreground)]">{t('profile.support.chatUnavailable')}</h2>
            <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
              {t('profile.support.chatUnavailableDesc')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}