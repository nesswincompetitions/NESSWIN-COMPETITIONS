import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import { fetchUserTickets } from '@/modules/user/profile/services/profileService';
import {
  ArrowLeft,
  Ticket,
  Trophy,
  Clock,
  CheckCircle,
  Loader2,
  Inbox,
  Search,
  X,
} from 'lucide-react';

const formatDate = (ts) => {
  if (!ts) return 'N/A';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const STATUS_MAP = {
  active:  { label: 'Active',   classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  won:     { label: 'Winner!',  classes: 'bg-yellow-400/10  text-yellow-400  border-yellow-400/20'  },
  lost:    { label: 'Ended',    classes: 'bg-white/5        text-white/40     border-white/10'       },
  default: { label: 'Pending',  classes: 'bg-blue-500/10   text-blue-400    border-blue-500/20'    },
};

function TicketCard({ ticket }) {
  const { competition, ticket_sequence, ticket_number, created_at, is_winner, status } = ticket;
  const s = is_winner ? STATUS_MAP.won : STATUS_MAP[status] ?? STATUS_MAP.default;
  const image = competition?.image?.[0];

  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden flex flex-col sm:flex-row shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-shadow duration-300">
      {/* Competition image */}
      <div className="sm:w-36 sm:shrink-0 h-36 sm:h-auto relative overflow-hidden">
        {image ? (
          <img src={image} alt={competition?.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[var(--color-muted)]/20">
            <Ticket className="w-10 h-10 text-[var(--color-muted-foreground)]/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[var(--color-card)] hidden sm:block" />
      </div>

      {/* Info */}
      <div className="flex-1 p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--color-primary)] mb-0.5">
              {competition?.category ?? 'Competition'}
            </p>
            <h3 className="text-base font-bold text-[var(--color-foreground)] line-clamp-1">
              {competition?.title ?? 'Unknown Competition'}
            </h3>
          </div>
          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${s.classes}`}>
            {s.label}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-[var(--color-muted)]/10 p-3 border border-[var(--color-border)]/40">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">Ticket #</p>
            <p className="text-sm font-mono font-bold text-[var(--color-foreground)]">
              {ticket_sequence ?? `#${ticket_number}`}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--color-muted)]/10 p-3 border border-[var(--color-border)]/40">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">Prize</p>
            <p className="text-sm font-semibold text-[var(--color-foreground)]">
              {competition?.prize_value ? `€${competition.prize_value.toLocaleString()}` : 'N/A'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--color-muted)]/10 p-3 border border-[var(--color-border)]/40 col-span-2 sm:col-span-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">Draw Date</p>
            <p className="text-sm text-[var(--color-foreground)]">
              {competition?.draw_date ? formatDate(competition.draw_date) : 'TBC'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
          <Clock className="w-3.5 h-3.5" />
          Purchased {formatDate(created_at)}
          {is_winner && (
            <span className="ml-auto flex items-center gap-1 text-yellow-400 font-bold">
              <Trophy className="w-3.5 h-3.5" /> Winner!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyTicketsPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!currentUser?.uid) return;
    fetchUserTickets(currentUser.uid)
      .then(setTickets)
      .catch((e) => console.error('Failed to load tickets', e))
      .finally(() => setLoading(false));
  }, [currentUser?.uid]);

  const filteredTickets = tickets.filter((t) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    return (
      t.competition?.title?.toLowerCase().includes(query) ||
      t.ticket_sequence?.toLowerCase().includes(query) ||
      t.ticket_number?.toString().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </button>

        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--color-primary)] mb-1">Your Entry</p>
            <h1 className="text-3xl font-bold text-[var(--color-foreground)]">My Tickets</h1>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              All your competition entries in one place.
            </p>
          </div>

          <div className="relative group w-full sm:w-64">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-[var(--color-muted-foreground)] group-focus-within:text-[var(--color-primary)] transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--color-card)] border border-[var(--color-border)]/60 rounded-xl py-2.5 pl-10 pr-10 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/5 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-3 flex items-center text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--color-primary)]">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : filteredTickets.length > 0 ? (
          <div className="space-y-4">
            {filteredTickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
          </div>
        ) : tickets.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--color-border)]/50 rounded-2xl">
            <Inbox className="w-12 h-12 text-[var(--color-muted-foreground)]/30 mb-4" />
            <p className="text-[var(--color-foreground)] font-semibold">No matches found</p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              Try adjusting your search query.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--color-border)]/50 rounded-2xl">
            <Inbox className="w-12 h-12 text-[var(--color-muted-foreground)]/30 mb-4" />
            <p className="text-[var(--color-foreground)] font-semibold">No tickets yet</p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              Enter a competition to see your tickets here.
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
