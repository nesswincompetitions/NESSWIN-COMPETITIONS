import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  ArrowLeft,
  CheckCheck,
  Check as CheckIcon,
  Image as ImageIcon,
  LifeBuoy,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  X,
  Gift,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '@/config/firebase';
import {
  closeSupportChat,
  markMessagesAsRead,
  sendMessage,
} from '@/shared/services/supportChatService';
import { uploadImages } from '@/shared/services/storageService';

const getRefPath = (refLike) => {
  if (!refLike) return '';
  if (typeof refLike === 'string') return `user/${refLike}`;
  return refLike.path ?? '';
};

const formatMessageTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateDivider = (timestamp) => {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

function DateDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-6 select-none">
      <div className="flex-1 h-px bg-[var(--color-border)]/30" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]/60 px-1">
        {label}
      </span>
      <div className="flex-1 h-px bg-[var(--color-border)]/30" />
    </div>
  );
}

function MessageBubble({ message, isOwnMessage, isFirstInGroup, isLastInGroup }) {
  const formattedTime = formatMessageTime(message.created_at);

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-8' : 'mt-3'}`}>
      <div className={`max-w-[78%] md:max-w-[65%] flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} gap-0.5`}>
        {/* Bubble */}
        {message.message && (
          <div
            className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm
              ${isOwnMessage
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-muted)]/25 border border-[var(--color-border)]/50 text-[var(--color-foreground)]'
              }
              ${isOwnMessage
                ? (isFirstInGroup && isLastInGroup ? 'rounded-2xl rounded-br-sm'
                  : isFirstInGroup ? 'rounded-2xl rounded-br-sm'
                    : isLastInGroup ? 'rounded-2xl rounded-tr-sm rounded-br-sm'
                      : 'rounded-lg rounded-r-sm')
                : (isFirstInGroup && isLastInGroup ? 'rounded-2xl rounded-bl-sm'
                  : isFirstInGroup ? 'rounded-2xl rounded-bl-sm'
                    : isLastInGroup ? 'rounded-2xl rounded-tl-sm rounded-bl-sm'
                      : 'rounded-lg rounded-l-sm')
              }
            `}
          >
            {message.message}
          </div>
        )}

        {/* Attached image */}
        {message.image && (
          <a
            href={message.image}
            target="_blank"
            rel="noreferrer"
            className={`overflow-hidden border shadow-sm max-w-xs rounded-2xl ${isOwnMessage ? 'border-[var(--color-primary)]/30' : 'border-[var(--color-border)]/40'
              }`}
          >
            <img src={message.image} alt="Attached" className="max-h-56 w-full object-cover" />
          </a>
        )}

        {/* Timestamp + delivery status — only on last bubble in group */}
        {isLastInGroup && (
          <div className={`flex items-center gap-1 px-1 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
            {isOwnMessage && (
              <span className="flex items-center">
                {message.is_seen ? (
                  <CheckCheck className="w-3 h-3 text-emerald-400" />
                ) : message.is_delivered ? (
                  <CheckCheck className="w-3 h-3 text-[var(--color-muted-foreground)]/60" />
                ) : (
                  <CheckIcon className="w-3 h-3 text-[var(--color-muted-foreground)]/60" />
                )}
              </span>
            )}
            <span className="text-[10px] text-[var(--color-muted-foreground)]/60">{formattedTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupportChatWidget({
  chatId,
  currentUserRef,
  receiverRef,
  assignedAdminRef,
  isCurrentUserAdmin = false,
  chatType = 'support',
  title = 'Support Chat',
  customerId = '',
  customerPhoto = '',
  closeLabel = 'Close Ticket',
  onCloseTicket,
  onBack,
  className = '',
  unreadCount = 0,
  status = 'active',
}) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [closing, setClosing] = useState(false);

  // ... existing hooks ...
  const scrollAreaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  // Track whether user is near bottom
  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < 80;
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setLoadingMessages(false);
      return undefined;
    }

    setLoadingMessages(true);
    isInitialLoadRef.current = true;

    const messagesQuery = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('created_at', 'asc')
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingMessages(false);
      },
      (error) => {
        console.error('Support chat listener error:', error.code, error.message, error);
        if (error.message?.includes('index')) {
          console.error('MISSING INDEX LINK:', error.message);
        }
        setMessages([]);
        setLoadingMessages(false);
      }
    );

    return unsubscribe;
  }, [chatId]);

  // Smart scroll: initial load → instant jump; new messages → smooth only if near bottom
  useEffect(() => {
    if (loadingMessages) return;
    if (isInitialLoadRef.current) {
      // First load: jump instantly to bottom
      scrollToBottom('auto');
      isInitialLoadRef.current = false;
    } else if (isNearBottomRef.current) {
      // Already near bottom (e.g. user sent or received a message) → smooth scroll
      scrollToBottom('smooth');
    }
    // If user scrolled up to read history → do nothing, don't disturb them
  }, [messages, loadingMessages, scrollToBottom]);

  useEffect(() => {
    if (!chatId || !currentUserRef) return;
    void markMessagesAsRead(chatId, currentUserRef, isCurrentUserAdmin).catch((error) => {
      console.error('Failed to mark support chat messages as read:', error);
    });
  }, [chatId, currentUserRef, isCurrentUserAdmin, messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [draftMessage]);

  const handleAttachmentChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a valid image file.');
      return;
    }
    setAttachmentFile(file);
  };

  const clearAttachment = () => {
    setAttachmentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const trimmed = draftMessage.trim();
    if (!trimmed && !attachmentFile) return;
    if (!chatId || !currentUserRef || !receiverRef) {
      toast.error('Support chat is not ready yet.');
      return;
    }

    // Force scroll to bottom when user sends
    isNearBottomRef.current = true;

    setSending(true);
    try {
      let imageUrl = '';
      if (attachmentFile) {
        const [uploadedImage] = await uploadImages([attachmentFile], 'support-chats');
        imageUrl = uploadedImage ?? '';
      }
      await sendMessage(chatId, currentUserRef, receiverRef, trimmed, imageUrl, isCurrentUserAdmin);
      setDraftMessage('');
      clearAttachment();
    } catch (error) {
      toast.error(error.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleCloseChat = async () => {
    if (!chatId || !currentUserRef || !assignedAdminRef) {
      toast.error('Support chat is not ready yet.');
      return;
    }
    setClosing(true);
    try {
      await closeSupportChat(chatId, currentUserRef, assignedAdminRef);
      toast.success('Support chat closed.');
      onCloseTicket?.();
    } catch (error) {
      toast.error(error.message || 'Failed to close support chat.');
    } finally {
      setClosing(false);
    }
  };

  const currentUserPath = getRefPath(currentUserRef);

  // Build enriched message list (date dividers + grouping)
  const renderable = [];
  let lastDateLabel = null;

  messages.forEach((msg, idx) => {
    const dateLabel = msg.created_at ? formatDateDivider(msg.created_at) : null;
    if (dateLabel && dateLabel !== lastDateLabel) {
      renderable.push({ type: 'divider', key: `div-${idx}`, label: dateLabel });
      lastDateLabel = dateLabel;
    }

    const senderPath = getRefPath(msg.sender_id);
    const isOwn = senderPath === currentUserPath;
    const prev = messages[idx - 1];
    const next = messages[idx + 1];
    const prevPath = prev ? getRefPath(prev.sender_id) : null;
    const nextPath = next ? getRefPath(next.sender_id) : null;
    const isFirst = senderPath !== prevPath;
    const isLast = senderPath !== nextPath;

    renderable.push({ type: 'msg', key: msg.id, msg, isOwn, isFirst, isLast });
  });

  const canClose = isCurrentUserAdmin || chatType !== 'winner_chat';

  return (
    <div className={`flex flex-col overflow-hidden bg-[var(--color-card)] ${className}`} style={{ height: '100%', minHeight: '560px' }}>
      {/* ─── Header ─── */}
      <header className="flex-shrink-0 flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[var(--color-border)]/50">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="xl:hidden flex-shrink-0 -ml-2 mr-0.5 p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/10 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div
            className={`group flex items-center gap-3 min-w-0 ${isCurrentUserAdmin && customerId ? 'cursor-pointer' : ''
            }`}
            onClick={() => {
              if (isCurrentUserAdmin && customerId) {
                navigate(`/admin/users/${customerId}`);
              }
            }}
          >
            <div className="relative flex-shrink-0">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 overflow-hidden transition-transform ${isCurrentUserAdmin && customerId ? 'group-hover:scale-105 group-hover:border-primary/40' : ''}`}>
                {isCurrentUserAdmin && customerPhoto ? (
                  <img src={customerPhoto} alt="" className="h-full w-full object-cover" />
                ) : (
                  chatType === 'winner_chat' ? <Gift className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />
                )}
              </div>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <h3 className={`truncate text-[15px] font-semibold text-[var(--color-foreground)] transition-colors ${isCurrentUserAdmin && customerId ? 'group-hover:text-primary' : ''}`}>
              {title}
            </h3>
            {unreadCount > 0 ? (
              <p className="text-[11px] text-red-400 font-medium">
                {unreadCount} unread {unreadCount === 1 ? 'message' : 'messages'}
              </p>
            ) : isCurrentUserAdmin && customerId ? (
              <p className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                Click to view profile
              </p>
            ) : null}
          </div>
        </div>

        {canClose && (
          <button
            type="button"
            onClick={handleCloseChat}
            disabled={closing}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/8 hover:bg-red-500/15 px-2 py-2 sm:px-3.5 text-xs font-semibold text-red-400 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            title={closeLabel}
          >
            {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{closeLabel}</span>
          </button>
        )}
      </header>

      {/* ─── Messages ─── */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border) transparent' }}
      >
        {loadingMessages ? (
          <div className="flex h-full min-h-[320px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
              <p className="text-xs text-[var(--color-muted-foreground)]">Loading messages…</p>
            </div>
          </div>
        ) : renderable.length > 0 ? (
          <div>
            {renderable.map((item) =>
              item.type === 'divider' ? (
                <DateDivider key={item.key} label={item.label} />
              ) : (
                <MessageBubble
                  key={item.key}
                  message={item.msg}
                  isOwnMessage={item.isOwn}
                  isFirstInGroup={item.isFirst}
                  isLastInGroup={item.isLast}
                />
              )
            )}
            {/* Invisible anchor for scrolling */}
            <div ref={messagesEndRef} className="h-px" />
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center">
              <LifeBuoy className="h-6 w-6 text-[var(--color-primary)]" />
            </div>
            <div>
              <h4 className="text-[15px] font-semibold text-[var(--color-foreground)]">No messages yet</h4>
              <p className="mt-1 max-w-xs text-sm text-[var(--color-muted-foreground)]">
                Send your first message to start the conversation.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Input ─── */}
      <div className="flex-shrink-0 border-t border-[var(--color-border)]/50 px-4 py-3 md:px-5">
        {status !== 'active' ? (
          /* Chat closed – no more messages */
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-[var(--color-border)]/50 bg-[var(--color-muted)]/5 py-5 text-center">
            <p className="text-sm font-semibold text-[var(--color-foreground)]">This conversation has been closed</p>
            <p className="text-xs text-[var(--color-muted-foreground)]/70">Start a new support request if you need further help</p>
          </div>
        ) : (
          <>
            {/* Attachment preview */}
            {attachmentFile && (
              <div className="mb-2.5 flex items-center gap-3 rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-muted)]/10 px-3.5 py-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--color-foreground)]">{attachmentFile.name}</p>
                  <p className="text-[10px] text-[var(--color-muted-foreground)]">
                    {(attachmentFile.size / 1024).toFixed(0)} KB · Image ready
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearAttachment}
                  className="rounded-lg p-1.5 text-[var(--color-muted-foreground)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              {/* Attach */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)]/50 text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
                aria-label="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAttachmentChange} className="hidden" />

              {/* Text */}
              <div className="flex-1 rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-muted)]/10 focus-within:border-[var(--color-primary)]/40 focus-within:bg-[var(--color-primary)]/5 transition-all px-3.5 py-2">
                <label htmlFor={`support-chat-input-${chatId}`} className="sr-only">Message</label>
                <textarea
                  ref={textareaRef}
                  id={`support-chat-input-${chatId}`}
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Write a message… (Enter to send)"
                  className="w-full resize-none bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/60 outline-none leading-relaxed"
                  style={{ maxHeight: '128px' }}
                />
              </div>

              {/* Send */}
              <button
                type="submit"
                disabled={sending || (!draftMessage.trim() && !attachmentFile)}
                className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-40 shadow-md"
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  // Use lucide Send icon when available, otherwise fallback to inline SVG
                  <>
                    <Send className="h-4 w-4" />
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden className="h-4 w-4 absolute">
                      <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}