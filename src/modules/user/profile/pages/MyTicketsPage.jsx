import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import { subscribeUserOrders, subscribeUserTickets } from '@/modules/user/profile/services/profileService';
import {
  ArrowLeft,
  Ticket,
  Gift,
  CheckCircle,
  Clock,
  Inbox,
  ChevronRight
} from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import Modal from '@/shared/components/ui/Modal';
import WinnerReviewForm from '@/modules/user/competitions/components/WinnerReviewForm';
import { Sparkles, Star } from 'lucide-react';

const formatDate = (ts) => {
  if (!ts) return 'N/A';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const STATUS_MAP = {
  active:           { label: 'Active',           classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ready_to_draw:    { label: 'Draw Soon',    classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  sold_out:         { label: 'Sold Out',         classes: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  winner_announced: { label: 'Draw Ended',       classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  completed:        { label: 'Completed',        classes: 'bg-white/5 text-white/40 border-white/10' },
  won:              { label: 'Winner',           classes: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  lost:             { label: 'Ended',            classes: 'bg-white/5 text-white/40 border-white/10' },
  default:          { label: 'Pending',          classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

function CompetitionGroupCard({ compData, onViewAll, onAddReview, activeTab }) {
  const navigate = useNavigate();
  const { competition, tickets: allTickets, orders } = compData;
  
  const isWonTab = activeTab === 'won';
  const tickets = isWonTab ? allTickets.filter(t => t.is_winner) : allTickets;
  
  const image = competition?.image?.[0];
  
  // Check if user won
  const isWinner = tickets.some(t => t.is_winner) || orders.some(o => o.is_winner);
  const rawStatus = competition?.status || 'active';
  
  let compStatusKey = 'default';
  if (rawStatus === 'active') compStatusKey = 'active';
  else if (rawStatus === 'ready_to_draw') compStatusKey = 'ready_to_draw';
  else if (['sold_out', 'sold out'].includes(rawStatus)) compStatusKey = 'sold_out';
  else if (rawStatus === 'winner_announced') compStatusKey = 'winner_announced';
  else if (['completed', 'closed', 'end'].includes(rawStatus)) compStatusKey = 'completed';
  
  const displayStatus = isWinner ? STATUS_MAP.won : (STATUS_MAP[compStatusKey] ?? STATUS_MAP.default);

  // Stats
  const totalPaid = orders.reduce((sum, o) => sum + (o.total_ticket || 0), 0);
  const totalBonus = orders.reduce((sum, o) => sum + (o.free_ticket || 0), 0);
  const hasOrderStats = totalPaid > 0 || totalBonus > 0;
  
  // Use actual tickets length if available, otherwise fallback to order totals (just in case)
  const totalTickets = tickets.length > 0 ? tickets.length : totalPaid + totalBonus;
  
  const displayTickets = tickets.slice(0, 5);

  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-shadow duration-300">
      {/* Header / Comp Info */}
      <div 
        className="flex flex-col sm:flex-row cursor-pointer"
        onClick={() => navigate(`/competitions/${competition?.id}`)}
      >
        <div className="sm:w-40 sm:shrink-0 h-36 sm:h-auto relative overflow-hidden">
          {image ? (
            <img src={image} alt={competition?.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--color-muted)]/20">
              <Ticket className="w-10 h-10 text-[var(--color-muted-foreground)]/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[var(--color-card)] hidden sm:block" />
        </div>

        <div className="flex-1 p-5 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--color-primary)] mb-0.5">
                {competition?.category ?? 'Competition'}
              </p>
              <h3 className="text-base font-bold text-[var(--color-foreground)] line-clamp-1 group-hover:text-[var(--color-primary)] transition-colors">
                {competition?.title ?? 'Unknown Competition'}
              </h3>
            </div>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${displayStatus.classes}`}>
              {displayStatus.label}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-auto">
            <div className="flex items-center gap-4 text-sm text-[var(--color-muted-foreground)] bg-[var(--color-muted)]/10 py-2 px-3 rounded-lg border border-[var(--color-border)]/30">
              <span className="flex items-center gap-1.5 text-[var(--color-foreground)] font-medium">
                <Ticket className="w-4 h-4 text-[var(--color-primary)]" />
                {totalTickets} Tickets
              </span>
              <div className="w-[1px] h-4 bg-[var(--color-border)]/50"></div>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Draw: {competition?.draw_date ? formatDate(competition.draw_date) : 'TBC'}
              </span>
            </div>

            {isWinner && rawStatus === 'completed' && !competition?.winner_comment && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onAddReview(competition.id);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-primary to-amber-500 rounded-xl text-black font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all cursor-pointer whitespace-nowrap"
              >
                <Sparkles size={14} className="animate-pulse" />
                Share Your Victory
              </button>
            )}

            {isWinner && competition?.winner_comment && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold text-[10px] uppercase tracking-widest">
                <Star size={12} className="fill-emerald-400" />
                Experience Shared
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="border-t border-[var(--color-border)]/40 p-5 bg-[var(--color-muted)]/5 flex flex-col gap-3">
        {tickets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {displayTickets.map(t => (
              <span 
                key={t.id} 
                className={`px-2.5 py-1 text-xs font-mono rounded border ${
                  t.is_winner 
                    ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-500 font-bold shadow-[0_0_10px_rgba(250,204,21,0.2)]' 
                    : 'bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-foreground)]'
                }`}
              >
                {t.ticket_sequence ?? `#${t.ticket_number}`}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted-foreground)] italic">
            Tickets are being processed...
          </div>
        )}

        {tickets.length > 5 && (
          <button 
            onClick={onViewAll} 
            className="text-[var(--color-primary)] text-xs font-bold hover:opacity-80 transition-opacity cursor-pointer text-left w-fit"
          >
            + {tickets.length - 5} more (View All)
          </button>
        )}

        <div className="mt-1 text-xs text-[var(--color-muted-foreground)] flex items-center gap-2">
          <span className="font-semibold text-[var(--color-foreground)]">{totalTickets} Total Tickets</span>
          {hasOrderStats && (
            <>
              <span className="text-[var(--color-border)]/50">|</span>
              <span>{totalPaid} Paid</span>
              {totalBonus > 0 && (
                <>
                  <span className="text-[var(--color-border)]/50">|</span>
                  <span className="text-[var(--color-primary)] font-semibold">+{totalBonus} Bonus</span>
                </>
              )}
            </>
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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedCompData, setSelectedCompData] = useState(null);
  const [reviewCompId, setReviewCompId] = useState(null);

  useEffect(() => {
    if (!currentUser?.uid) {
      setTickets([]);
      setOrders([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    let ticketsReady = false;
    let ordersReady = false;
    const markReady = () => {
      if (ticketsReady && ordersReady) {
        setLoading(false);
      }
    };

    const unsubscribeTickets = subscribeUserTickets(
      currentUser.uid,
      (ticketsRes) => {
        setTickets(ticketsRes);
        ticketsReady = true;
        markReady();
      },
      (error) => {
        console.error('Failed to subscribe tickets:', error);
        setTickets([]);
        ticketsReady = true;
        markReady();
      }
    );

    const unsubscribeOrders = subscribeUserOrders(
      currentUser.uid,
      (ordersRes) => {
        setOrders(ordersRes);
        ordersReady = true;
        markReady();
      },
      (error) => {
        console.error('Failed to subscribe orders:', error);
        setOrders([]);
        ordersReady = true;
        markReady();
      }
    );

    return () => {
      unsubscribeTickets();
      unsubscribeOrders();
    };
  }, [currentUser?.uid]);

  // Calculate top stats
  const totalTickets = tickets.length > 0 ? tickets.length : orders.reduce((sum, o) => sum + (o.total_ticket || 0) + (o.free_ticket || 0), 0);
  const freeBonus = orders.reduce((sum, o) => sum + (o.free_ticket || 0), 0);
  const wonCount = tickets.filter(t => t.is_winner).length || orders.filter(o => o.is_winner).length;

  // Group by competition
  const groupedComps = {};
  
  tickets.forEach(ticket => {
    const compId = ticket.competition_id || ticket.competition?.id;
    if (!compId) return;
    if (!groupedComps[compId]) {
      groupedComps[compId] = { competition: ticket.competition, tickets: [], orders: [] };
    }
    groupedComps[compId].tickets.push(ticket);
  });

  orders.forEach(order => {
    const compId = order.competition_id || order.competition?.id;
    if (!compId) return;
    if (!groupedComps[compId]) {
      groupedComps[compId] = { competition: order.competition, tickets: [], orders: [] };
    }
    groupedComps[compId].orders.push(order);
  });

  // Filter groups by tab
  const filteredGroups = Object.values(groupedComps).filter(group => {
    const compStatus = group.competition?.status;
    const isWinner = group.tickets.some(t => t.is_winner) || group.orders.some(o => o.is_winner);
    
    if (activeTab === 'won') return isWinner;
    if (activeTab === 'past') return ['completed', 'closed', 'winner_announced', 'end'].includes(compStatus);
    return !['completed', 'closed', 'winner_announced', 'end'].includes(compStatus); // everything else is 'active'
  });

  // Pagination Logic
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const currentGroups = filteredGroups.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/profile', { replace: true })}
            className="w-10 h-10 rounded-full border border-[var(--color-border)]/60 flex items-center justify-center text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/10 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-serif font-bold text-[var(--color-foreground)]">My Tickets</h1>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-4 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <Ticket className="w-6 h-6 text-[var(--color-primary)] mb-2" />
            <span className="text-2xl font-bold text-[var(--color-foreground)]">{totalTickets}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted-foreground)] mt-1">Total Tickets</span>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-4 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <Gift className="w-6 h-6 text-[var(--color-primary)] mb-2" />
            <span className="text-2xl font-bold text-[var(--color-foreground)]">{freeBonus}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted-foreground)] mt-1">Free Bonus</span>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-4 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <CheckCircle className="w-6 h-6 text-[var(--color-primary)] mb-2" />
            <span className="text-2xl font-bold text-[var(--color-foreground)]">{wonCount}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted-foreground)] mt-1">Won</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-[var(--color-card)] border border-[var(--color-border)]/60 rounded-xl p-1.5 mb-8 shadow-sm">
          {['active', 'past', 'won'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all capitalize cursor-pointer ${
                activeTab === tab 
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-md' 
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/10'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner fullScreen={false} size="w-8 h-8" message="" />
          </div>
        ) : currentGroups.length > 0 ? (
          <div className="space-y-8">
            <div className="space-y-6">
              {currentGroups.map(compData => (
                <CompetitionGroupCard 
                  key={compData.competition.id} 
                  compData={compData} 
                  activeTab={activeTab}
                  onAddReview={(id) => setReviewCompId(id)}
                  onViewAll={() => {
                    if (activeTab === 'won') {
                      setSelectedCompData({
                        ...compData,
                        tickets: compData.tickets.filter(t => t.is_winner)
                      });
                    } else {
                      setSelectedCompData(compData);
                    }
                  }}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                <button
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-card)] text-sm font-bold text-[var(--color-foreground)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-muted)]/10 transition-colors"
                >
                  Prev
                </button>
                <div className="flex items-center gap-1 overflow-x-auto max-w-full px-2 hide-scrollbar">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`w-10 h-10 rounded-xl border font-bold text-sm transition-all shrink-0 ${
                        currentPage === page
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-lg shadow-primary/20'
                          : 'border-[var(--color-border)]/60 bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-card)] text-sm font-bold text-[var(--color-foreground)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-muted)]/10 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[var(--color-border)]/50 rounded-2xl bg-[var(--color-card)]/50">
            <Inbox className="w-12 h-12 text-[var(--color-muted-foreground)]/30 mb-4" />
            <p className="text-[var(--color-foreground)] font-semibold text-lg">No {activeTab} tickets found</p>
            {activeTab === 'active' && (
              <button
                onClick={() => navigate('/competitions')}
                className="mt-5 px-6 py-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-bold hover:opacity-90 transition-all cursor-pointer shadow-[0_0_15px_oklch(0.78_0.14_78/0.3)]"
              >
                Browse Competitions
              </button>
            )}
          </div>
        )}

        {/* View All Tickets Modal */}
        <Modal
          isOpen={!!selectedCompData}
          onClose={() => setSelectedCompData(null)}
          title="Your Tickets"
          description={`You have ${selectedCompData?.tickets?.length || 0} tickets for ${selectedCompData?.competition?.title || 'this competition'}.`}
        >
          <div className="max-w-md mx-auto w-full max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid grid-cols-2 gap-3 pb-4">
              {selectedCompData?.tickets?.map((tk) => (
                <div
                  key={tk.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)]/60 hover:border-[var(--color-primary)]/30 transition-all group"
                >
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-[var(--color-muted-foreground)] uppercase tracking-widest mb-1 group-hover:text-[var(--color-primary)]/70 transition-colors">Ticket ID</span>
                    <span className="text-sm font-mono font-bold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">{tk.ticket_sequence ?? `#${tk.ticket_number}`}</span>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
                    <Ticket className="w-4 h-4 text-[var(--color-primary)]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-[var(--color-border)]/40 text-center">
            <button
              onClick={() => setSelectedCompData(null)}
              className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-black uppercase tracking-widest text-xs hover:opacity-90 transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </Modal>

        {/* Winner Review Modal */}
        <Modal
          isOpen={!!reviewCompId}
          onClose={() => setReviewCompId(null)}
          title="Share Your Experience"
          description="Congratulations on your win! We'd love to hear about your experience."
        >
          <div className="py-2">
            <WinnerReviewForm 
              competitionId={reviewCompId}
              userId={currentUser.uid}
              onReviewSubmitted={() => setReviewCompId(null)}
            />
          </div>
        </Modal>
      </div>
    </div>
  );
}
