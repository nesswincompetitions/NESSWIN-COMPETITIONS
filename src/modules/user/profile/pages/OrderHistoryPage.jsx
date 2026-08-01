import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import {
  subscribeOrdersFirstPage,
  fetchOrdersNextPage,
  subscribeOrderTickets,
} from '@/modules/user/profile/services/profileService';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ShoppingBag,
  Ticket,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  Inbox,
  ChevronDown,
  ChevronUp,
  Hash,
  Gift,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';

const ITEMS_PER_PAGE = 10;

const formatDate = (ts, langCode) => {
  if (!ts) return 'N/A';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const currentLang = langCode === 'fr' ? 'fr-FR' : (langCode === 'es' ? 'es-ES' : 'en-GB');
  return d.toLocaleDateString(currentLang, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatCurrency = (value, currency = 'GBP', langCode) => {
  if (value == null) return 'N/A';
  const currentLang = langCode === 'fr' ? 'fr-FR' : (langCode === 'es' ? 'es-ES' : 'en-GB');
  return new Intl.NumberFormat(currentLang, { style: 'currency', currency }).format(value);
};

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, label: 'Completed', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  paid:      { icon: CheckCircle, label: 'Paid',      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed:    { icon: XCircle,     label: 'Failed',    classes: 'bg-red-500/10     text-red-400     border-red-500/20'     },
  pending:   { icon: Clock,       label: 'Pending',   classes: 'bg-blue-500/10    text-blue-400    border-blue-500/20'    },
  default:   { icon: Clock,       label: 'Processing',classes: 'bg-white/5        text-white/40    border-white/10'       },
};

function OrderCard({ order }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = React.useState(false);
  const [tickets, setTickets] = React.useState([]);
  const [loadingTickets, setLoadingTickets] = React.useState(false);
  const {
    id, competition, total_ticket, free_ticket, free_used, total_amount,
    subtotal, discount_amount, discount_percent, pack_type,
    currency, created_at, paid_at, status,
    question_answer,
  } = order;

  useEffect(() => {
    if (!expanded) return undefined;
    setLoadingTickets(true);
    const unsubscribe = subscribeOrderTickets(
      id,
      (liveTickets) => {
        setTickets(liveTickets);
        setLoadingTickets(false);
      },
      (error) => {
        console.error('Failed to subscribe order tickets', error);
        setTickets([]);
        setLoadingTickets(false);
      }
    );
    return unsubscribe;
  }, [expanded, id]);

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['default'];
  const StatusIcon = cfg.icon;
  const image = competition?.image?.[0];
  const statusLabel = t(`profile.ordersPage.status.${status}`, cfg.label);
  const compId = competition?.id || order.competition_id;

  const handleCompetitionClick = () => {
    if (compId) navigate(`/competitions/${compId}`);
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.22)] duration-300">
      <div className="flex items-center gap-4 p-5">
        <div
          onClick={handleCompetitionClick}
          className={`flex items-center gap-4 flex-1 min-w-0 rounded-xl p-1.5 -m-1.5 transition-all duration-300 ${
            compId ? 'cursor-pointer group hover:bg-[var(--color-muted)]/10' : ''
          }`}
        >
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-[var(--color-border)]/40 group-hover:border-[var(--color-primary)]/40 group-hover:shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.1)] transition-all duration-300">
            {image ? (
              <img src={image} alt={competition?.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[var(--color-muted)]/20">
                <ShoppingBag className="w-6 h-6 text-[var(--color-muted-foreground)]/40 group-hover:text-[var(--color-primary)]/60 transition-colors" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary)] mb-0.5">
              {competition?.category ?? 'Competition'}
            </p>
            <div className="relative inline-flex flex-col max-w-full">
              <h3 className="text-sm font-bold text-[var(--color-foreground)] truncate group-hover:text-[var(--color-primary)] transition-colors duration-300">
                {competition?.title ?? 'Unknown Competition'}
              </h3>
              <div className="h-[1.5px] w-0 bg-[var(--color-primary)] group-hover:w-full transition-all duration-300 ease-out mt-[1px] rounded-full"></div>
            </div>
            <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">
              {formatDate(created_at, i18n.language)}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${cfg.classes}`}>
            {statusLabel}
          </span>
          <p className="text-base font-bold text-[var(--color-foreground)]">
            {formatCurrency(total_amount, currency ?? 'GBP', i18n.language)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px bg-[var(--color-border)]/30">
        {[
          { label: t('profile.ordersPage.tickets'), value: total_ticket ?? 0, icon: Ticket },
          { label: t('profile.ordersPage.freeUsed'), value: free_used ?? 0, icon: Ticket },
          { label: t('profile.ordersPage.bonusGot'), value: free_ticket ?? 0, icon: Gift },
          { label: t('profile.ordersPage.pack'), value: pack_type ?? '—', icon: CreditCard },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--color-card)] flex flex-col items-center py-3 px-2 gap-1">
            <p className="text-[9px] uppercase tracking-[0.15em] font-bold text-[var(--color-muted-foreground)]">{label}</p>
            <p className="text-sm font-bold text-[var(--color-foreground)]">{value}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer border-t border-[var(--color-border)]/30"
      >
        {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> {t('profile.ordersPage.hideDetails')}</> : <><ChevronDown className="w-3.5 h-3.5" /> {t('profile.ordersPage.viewDetails')}</>}
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)]/30 px-5 pb-5 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: t('profile.ordersPage.orderId'), value: order.id?.slice(0, 12) + '...' },
              { label: t('profile.ordersPage.subtotal'), value: formatCurrency(subtotal, currency, i18n.language) },
              { label: t('profile.ordersPage.discount'), value: discount_percent ? `-${discount_percent}%` : '—' },
              { label: t('profile.ordersPage.discountAmount'), value: discount_amount ? formatCurrency(discount_amount, currency, i18n.language) : '—' },
              { label: t('profile.ordersPage.paidAt'), value: formatDate(paid_at, i18n.language) },
              { label: t('profile.ordersPage.statusHeader'), value: t(`profile.ordersPage.status.${status}`) || status },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 p-3">
                <p className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-muted-foreground)] mb-1">{label}</p>
                <p className="text-xs font-medium text-[var(--color-foreground)] truncate">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-muted-foreground)]">{t('profile.ordersPage.orderTickets')}</p>
              <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-md">
                {t('profile.ordersPage.totalTicketsCount', { count: (total_ticket || 0) + (free_ticket || 0) + (free_used || 0) })}
              </span>
            </div>

            {loadingTickets ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner fullScreen={false} size="w-4 h-4" message="" />
              </div>
            ) : tickets.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {tickets.map(t => (
                  <div key={t.id} className="flex flex-col p-2 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)]/40">
                    <div className="flex items-center gap-1 mb-1">
                      <Hash className="w-2.5 h-2.5 text-[var(--color-primary)]" />
                      <span className="text-[10px] font-mono font-bold text-[var(--color-foreground)]">{t.ticket_sequence}</span>
                    </div>
                    <span className="text-[9px] text-[var(--color-muted-foreground)]">#{t.ticket_number}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)] text-center py-2">{t('profile.ordersPage.noTicketsFound')}</p>
            )}
          </div>

          {question_answer?.question_text && (
            <div className="rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 p-4">
              <p className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-primary)] mb-2">{t('profile.ordersPage.skillAnswer')}</p>
              <p className="text-xs text-[var(--color-foreground)] font-medium">{question_answer.question_text}</p>
              <p className="text-xs text-[var(--color-primary)] mt-1 font-semibold">
                {t('profile.ordersPage.yourAnswer', { answer: question_answer.selected_option ?? question_answer.answer_given ?? '—' })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)] animate-pulse">
      <div className="flex items-center gap-4 p-5">
        <div className="w-14 h-14 rounded-xl shrink-0 bg-[var(--color-muted)]/30" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-2 bg-[var(--color-muted)]/50 rounded w-1/4" />
          <div className="h-4 bg-[var(--color-muted)]/60 rounded w-2/3" />
          <div className="h-2 bg-[var(--color-muted)]/40 rounded w-1/3" />
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="h-5 w-20 bg-[var(--color-muted)]/30 rounded-full" />
          <div className="h-5 w-16 bg-[var(--color-muted)]/40 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-px bg-[var(--color-border)]/30">
        {Array.from({ length: 4 }).map((_, j) => (
          <div key={j} className="bg-[var(--color-card)] flex flex-col items-center py-3 px-2 gap-2">
            <div className="h-2 w-10 bg-[var(--color-muted)]/30 rounded" />
            <div className="h-4 w-6 bg-[var(--color-muted)]/40 rounded" />
          </div>
        ))}
      </div>
      <div className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-[var(--color-border)]/30">
        <div className="h-3 w-24 bg-[var(--color-muted)]/30 rounded" />
      </div>
    </div>
  );
}

export default function OrderHistoryPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [currentPage, setCurrentPage]       = useState(1);
  const [pages, setPages]                   = useState({});
  const [cursors, setCursors]               = useState({});
  const [totalCount, setTotalCount]         = useState(0);
  const [loading, setLoading]               = useState(true);
  const [pageLoading, setPageLoading]       = useState(false);
  const unsubscribeRef                      = useRef(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  useEffect(() => {
    if (!currentUser?.uid) {
      setPages({});
      setCursors({});
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setPages({});
    setCursors({});
    setCurrentPage(1);

    const unsub = subscribeOrdersFirstPage(
      currentUser.uid,
      ({ orders, lastDoc, totalCount: count }) => {
        setPages(prev => ({ ...prev, 1: orders }));
        setCursors(prev => ({ ...prev, 1: lastDoc }));
        setTotalCount(count);
        setLoading(false);
      },
      (err) => {
        console.error('[OrderHistory] Subscription error:', err);
        setLoading(false);
      }
    );

    unsubscribeRef.current = unsub;
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [currentUser?.uid]);

  const goToPage = useCallback(async (targetPage) => {
    if (targetPage === currentPage) return;

    const scrollTarget = document.getElementById('orders-list-top');
    if (scrollTarget) {
      const top = scrollTarget.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (pages[targetPage]) {
      setCurrentPage(targetPage);
      return;
    }

    const cursorDoc = cursors[targetPage - 1];
    if (!cursorDoc) return;

    setPageLoading(true);
    try {
      const { orders, lastDoc } = await fetchOrdersNextPage(currentUser.uid, cursorDoc);
      setPages(prev => ({ ...prev, [targetPage]: orders }));
      setCursors(prev => ({ ...prev, [targetPage]: lastDoc }));
      setCurrentPage(targetPage);
    } catch (err) {
      console.error('[OrderHistory] Error fetching page:', err);
    } finally {
      setPageLoading(false);
    }
  }, [currentPage, pages, cursors, currentUser?.uid]);

  const currentOrders = pages[currentPage] || [];
  const totalSpent = Object.values(pages).flat().reduce((sum, o) => sum + (o.total_amount ?? 0), 0);

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/profile', { replace: true })}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {t('profile.backToProfile')}
        </button>

        <div className="mb-8" id="orders-list-top">
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--color-primary)] mb-1">
            {t('profile.ordersPage.purchaseHistory')}
          </p>
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">{t('profile.orderHistory')}</h1>
          {!loading && totalCount > 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              {t('profile.ordersPage.ordersCount', {
                count: totalCount,
                amount: formatCurrency(totalSpent, 'GBP', i18n.language)
              })}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => <OrderSkeleton key={i} />)}
          </div>
        ) : currentOrders.length > 0 ? (
          <div className="space-y-6">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className={`space-y-4 transition-opacity duration-300 ${pageLoading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
            >
              {currentOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              {pageLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 text-[var(--color-primary)] animate-spin" />
                </div>
              )}
            </motion.div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1 || pageLoading}
                  className="w-10 h-10 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-card)] flex items-center justify-center text-[var(--color-foreground)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-muted)]/10 hover:border-[var(--color-primary)]/40 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (totalPages <= 7) return true;
                      if (page === 1 || page === totalPages) return true;
                      if (Math.abs(page - currentPage) <= 1) return true;
                      return false;
                    })
                    .reduce((acc, page, idx, arr) => {
                      if (idx > 0 && page - arr[idx - 1] > 1) acc.push('...');
                      acc.push(page);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === '...' ? (
                        <span key={`ellipsis-${idx}`} className="w-10 h-10 flex items-center justify-center text-[var(--color-muted-foreground)] text-sm">…</span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => goToPage(item)}
                          disabled={pageLoading}
                          className={`w-10 h-10 rounded-xl border font-bold text-sm transition-all ${
                            currentPage === item
                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-lg shadow-primary/20'
                                : 'border-[var(--color-border)]/60 bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40 disabled:opacity-50'
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )
                  }
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages || pageLoading}
                  className="w-10 h-10 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-card)] flex items-center justify-center text-[var(--color-foreground)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-muted)]/10 hover:border-[var(--color-primary)]/40 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {totalPages > 1 && (
              <p className="text-center text-xs text-[var(--color-muted-foreground)] mt-2">
                Page {currentPage} of {totalPages}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--color-border)]/50 rounded-2xl">
            <Inbox className="w-12 h-12 text-[var(--color-muted-foreground)]/30 mb-4" />
            <p className="text-[var(--color-foreground)] font-semibold">{t('profile.ordersPage.noOrders')}</p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              {t('profile.ordersPage.noOrdersDesc')}
            </p>
            <button
              onClick={() => navigate('/competitions')}
              className="mt-5 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold hover:opacity-90 transition-all cursor-pointer"
            >
              {t('profile.ticketsPage.browseCompetitions')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
