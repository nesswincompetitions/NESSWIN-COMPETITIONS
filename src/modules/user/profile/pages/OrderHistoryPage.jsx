import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import { subscribeUserOrders, subscribeOrderTickets } from '@/modules/user/profile/services/profileService';
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
} from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { useState as useLocalState } from 'react';

const formatDate = (ts) => {
  if (!ts) return 'N/A';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatCurrency = (value, currency = 'EUR') => {
  if (value == null) return 'N/A';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
};

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, label: 'Completed', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  paid:      { icon: CheckCircle, label: 'Paid',      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed:    { icon: XCircle,     label: 'Failed',    classes: 'bg-red-500/10     text-red-400     border-red-500/20'     },
  pending:   { icon: Clock,       label: 'Pending',   classes: 'bg-blue-500/10    text-blue-400    border-blue-500/20'    },
  default:   { icon: Clock,       label: 'Processing',classes: 'bg-white/5        text-white/40    border-white/10'       },
};

function OrderCard({ order }) {
  const [expanded, setExpanded] = React.useState(false);
  const [tickets, setTickets] = React.useState([]);
  const [loadingTickets, setLoadingTickets] = React.useState(false);
  const {
    id, competition, total_ticket, free_ticket, free_used, total_amount,
    subtotal, discount_amount, discount_percent, pack_type,
    currency, created_at, paid_at, status, stripe_status,
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

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG[status === 'succeeded' ? 'completed' : 'default'];
  const StatusIcon = cfg.icon;
  const image = competition?.image?.[0];

  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.22)] duration-300">
      {/* Header row */}
      <div className="flex items-center gap-4 p-5">
        {/* Thumb */}
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-[var(--color-border)]/40">
          {image ? (
            <img src={image} alt={competition?.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--color-muted)]/20">
              <ShoppingBag className="w-6 h-6 text-[var(--color-muted-foreground)]/40" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary)] mb-0.5">
            {competition?.category ?? 'Competition'}
          </p>
          <h3 className="text-sm font-bold text-[var(--color-foreground)] truncate">
            {competition?.title ?? 'Unknown Competition'}
          </h3>
          <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">
            {formatDate(created_at)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${cfg.classes}`}>
            {cfg.label}
          </span>
          <p className="text-base font-bold text-[var(--color-foreground)]">
            {formatCurrency(total_amount, currency ?? 'EUR')}
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-px bg-[var(--color-border)]/30">
        {[
          { label: 'Tickets', value: total_ticket ?? 0, icon: Ticket },
          { label: 'Free Used', value: free_used ?? 0, icon: Ticket },
          { label: 'Bonus Got', value: free_ticket ?? 0, icon: Gift },
          { label: 'Pack', value: pack_type ?? '—', icon: CreditCard },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-[var(--color-card)] flex flex-col items-center py-3 px-2 gap-1">
            <p className="text-[9px] uppercase tracking-[0.15em] font-bold text-[var(--color-muted-foreground)]">{label}</p>
            <p className="text-sm font-bold text-[var(--color-foreground)]">{value}</p>
          </div>
        ))}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer border-t border-[var(--color-border)]/30"
      >
        {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide Details</> : <><ChevronDown className="w-3.5 h-3.5" /> View Details</>}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[var(--color-border)]/30 px-5 pb-5 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Order ID', value: order.id?.slice(0, 12) + '...' },
              { label: 'Subtotal', value: formatCurrency(subtotal, currency) },
              { label: 'Discount', value: discount_percent ? `-${discount_percent}%` : '—' },
              { label: 'Discount Amount', value: discount_amount ? formatCurrency(discount_amount, currency) : '—' },
              { label: 'Paid At', value: formatDate(paid_at) },
              { label: 'Status', value: status },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 p-3">
                <p className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-muted-foreground)] mb-1">{label}</p>
                <p className="text-xs font-medium text-[var(--color-foreground)] truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Tickets List */}
          <div className="rounded-xl bg-[var(--color-muted)]/10 border border-[var(--color-border)]/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-muted-foreground)]">Order Tickets</p>
              <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-md">
                {total_ticket + (free_ticket || 0) + (free_used || 0)} Total
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
              <p className="text-xs text-[var(--color-muted-foreground)] text-center py-2">No tickets found for this order.</p>
            )}
          </div>

          {question_answer?.question_text && (
            <div className="rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 p-4">
              <p className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-primary)] mb-2">Skill Question Answered</p>
              <p className="text-xs text-[var(--color-foreground)] font-medium">{question_answer.question_text}</p>
              <p className="text-xs text-[var(--color-primary)] mt-1 font-semibold">
                Your answer: {question_answer.selected_option ?? question_answer.answer_given ?? '—'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrderHistoryPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) {
      setOrders([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = subscribeUserOrders(
      currentUser.uid,
      (nextOrders) => {
        setOrders(nextOrders);
        setLoading(false);
      },
      (e) => {
        console.error('Failed to subscribe orders', e);
        setOrders([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUser?.uid]);

  const totalSpent = orders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0);

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </button>

        <div className="mb-8">
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--color-primary)] mb-1">Purchase History</p>
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">Order History</h1>
          {!loading && orders.length > 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              {orders.length} orders · {formatCurrency(totalSpent)} total spent
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner fullScreen={false} size="w-8 h-8" message="" />
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--color-border)]/50 rounded-2xl">
            <Inbox className="w-12 h-12 text-[var(--color-muted-foreground)]/30 mb-4" />
            <p className="text-[var(--color-foreground)] font-semibold">No orders yet</p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              Your purchase history will appear here.
            </p>
            <button
              onClick={() => navigate('/competitions')}
              className="mt-5 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold hover:opacity-90 transition-all cursor-pointer"
            >
              Browse Competitions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
