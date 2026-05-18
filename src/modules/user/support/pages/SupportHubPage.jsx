import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MessageSquareText, 
  LifeBuoy, 
  Gift, 
  History, 
  PlusCircle, 
  ArrowLeft, 
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/shared/state/AuthContext';
import { 
  onActiveUserChatsSnapshot, 
  onUserChatHistorySnapshot,
  createSupportChat 
} from '@/shared/services/supportChatService';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import FAQSection from '@/modules/user/support/components/FAQSection';
import { useTranslation } from 'react-i18next';

export default function SupportHubPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [activeChats, setActiveChats] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;

    setLoading(true);
    
    const unsubscribeActive = onActiveUserChatsSnapshot(currentUser.uid, (chats) => {
      setActiveChats(chats);
      setLoading(false);
    });

    const unsubscribeHistory = onUserChatHistorySnapshot(currentUser.uid, (chats) => {
      setChatHistory(chats);
    });

    return () => {
      unsubscribeActive();
      unsubscribeHistory();
    };
  }, [currentUser?.uid]);

  const hasActiveSupportChat = activeChats.some(chat => chat.chat_type === 'support');

  const handleStartNewSupport = async () => {
    if (hasActiveSupportChat) {
      toast.error(t('profile.support.activeChatError'));
      return;
    }

    const toastId = toast.loading(t('profile.support.startingTicket'));
    setIsCreating(true);
    try {
      const chatId = await createSupportChat(currentUser.uid);
      toast.success(t('profile.support.activeChat'), { id: toastId });
      navigate(`/profile/support/${chatId}`);
    } catch (error) {
      console.error('Failed to create support chat:', error);
      toast.error(error.message || t('profile.support.agentsUnavailable'), { id: toastId });
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (timestamp, langCode) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const currentLang = langCode === 'fr' ? 'fr-FR' : (langCode === 'es' ? 'es-ES' : 'en-GB');
    return date.toLocaleDateString(currentLang, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center pt-24 pb-16">
        <LoadingSpinner fullScreen={false} size="w-10 h-10" message={t('profile.support.loadingConversations')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-1">
            <button
              onClick={() => navigate('/profile', { replace: true })}
              className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-4 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              {t('profile.backToProfile')}
            </button>
            <h1 className="text-4xl font-bold text-[var(--color-foreground)] tracking-tight">{t('profile.support.supportCenter')}</h1>
            <p className="text-[var(--color-muted-foreground)] text-lg">{t('profile.support.supportDesc')}</p>
          </div>

          <button
            onClick={handleStartNewSupport}
            disabled={isCreating || hasActiveSupportChat}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-primary/10
              ${hasActiveSupportChat 
                ? 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] cursor-not-allowed border border-[var(--color-border)]/40' 
                : 'bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-95'
              }`}
          >
            {isCreating ? (
              <LoadingSpinner fullScreen={false} size="w-4 h-4" message="" />
            ) : hasActiveSupportChat ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <PlusCircle className="w-4 h-4" />
            )}
            {hasActiveSupportChat ? t('profile.support.ticketActive') : t('profile.support.startNewTicket')}
          </button>
        </div>

        {/* ── Two-Column Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Left Column: Chats (takes 2/3 on desktop) ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Active Conversations */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">{t('profile.support.activeConversations')}</h2>
              </div>
              
              {activeChats.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {activeChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => navigate(`/profile/support/${chat.id}`)}
                      className="flex flex-col p-5 rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-card)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-all text-left group shadow-sm hover:shadow-xl hover:shadow-primary/5 relative overflow-hidden"
                    >
                      {/* Decorative Gradient */}
                      <div className={`absolute top-0 right-0 w-24 h-24 blur-3xl opacity-10 transition-opacity group-hover:opacity-20 ${
                        chat.chat_type === 'winner_chat' ? 'bg-amber-500' : 'bg-[var(--color-primary)]'
                      }`} />

                      <div className="flex items-start justify-between mb-4 relative">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-colors ${
                          chat.chat_type === 'winner_chat' 
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                            : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20'
                        }`}>
                          {chat.chat_type === 'winner_chat' ? <Gift className="w-6 h-6" /> : <LifeBuoy className="w-6 h-6" />}
                        </div>
                        {chat.unread_receiver_count > 0 && (
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white animate-bounce">
                            {chat.unread_receiver_count}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 relative">
                        <h3 className="font-bold text-[var(--color-foreground)] text-lg">
                          {chat.chat_type === 'winner_chat' ? t('profile.support.prizeHandover') : t('profile.support.customerSupport')}
                        </h3>
                        <p className="text-sm text-[var(--color-muted-foreground)] line-clamp-2 italic min-h-[40px]">
                          {chat.last_message || t('profile.support.waitingFirstMessage')}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted-foreground)]/60 border-t border-[var(--color-border)]/40 pt-4">
                        <span>{formatDate(chat.last_message_time, i18n.language)}</span>
                        <span className="flex items-center gap-1 text-[var(--color-primary)] group-hover:translate-x-1 transition-transform">
                          {t('profile.support.openChat')} <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 rounded-3xl border border-dashed border-[var(--color-border)]/60 bg-[var(--color-muted)]/5 text-center">
                  <div className="w-16 h-16 rounded-full bg-[var(--color-muted)]/20 flex items-center justify-center mb-4">
                    <MessageSquareText className="w-8 h-8 text-[var(--color-muted-foreground)]/40" />
                  </div>
                  <p className="text-[var(--color-muted-foreground)] font-medium">{t('profile.support.noActiveChats')}</p>
                </div>
              )}
            </section>

            {/* Chat History */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <History className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">{t('profile.support.resolvedTickets')}</h2>
              </div>

              <div className="rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden divide-y divide-[var(--color-border)]/40">
                {chatHistory.length > 0 ? (
                  chatHistory.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => navigate(`/profile/support/${chat.id}`)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-[var(--color-muted)]/10 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-muted)]/20 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-[var(--color-foreground)] truncate">
                            {chat.chat_type === 'winner_chat' ? t('profile.support.winnerSupportHistory') : t('profile.support.supportTicket')}
                          </h4>
                          <span className="text-[10px] text-[var(--color-muted-foreground)] whitespace-nowrap">{formatDate(chat.closed_at, i18n.language)}</span>
                        </div>
                        <p className="text-xs text-[var(--color-muted-foreground)] truncate italic">{chat.last_message || t('profile.support.closedConversation')}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--color-muted-foreground)]/40 group-hover:text-[var(--color-primary)] transition-all" />
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-sm text-[var(--color-muted-foreground)]">{t('profile.support.resolvedTicketsDesc')}</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ── Right Column: FAQ Sidebar (1/3 on desktop, stacks below on mobile) ── */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-28">
              <FAQSection />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
