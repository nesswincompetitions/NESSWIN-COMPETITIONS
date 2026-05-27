import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/state/AuthContext';
import {
  subscribeUserOrdersForTickets,
  fetchTicketsForCompetition,
} from '@/modules/user/profile/services/profileService';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Ticket,
  Gift,
  CheckCircle,
  Clock,
  Inbox,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import WinnerReviewForm from '@/modules/user/competitions/components/WinnerReviewForm';
import { Sparkles, Star } from 'lucide-react';

const GROUPS_PER_PAGE = 10;
const PAST_STATUSES = ['completed', 'closed', 'winner_announced', 'end'];

const formatDate = (ts, langCode) => {
  if (!ts) return 'N/A';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const currentLang = langCode === 'fr' ? 'fr-FR' : (langCode === 'es' ? 'es-ES' : 'en-GB');
  return d.toLocaleDateString(currentLang, { day: 'numeric', month: 'short', year: 'numeric' });
};

const STATUS_MAP = {
  active:           { label: 'Active',           classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ready_to_draw:    { label: 'Draw Soon',        classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  drawing:          { label: 'Drawing',          classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  sold_out:         { label: 'Sold Out',         classes: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  winner_announced: { label: 'Winner Announced', classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  completed:        { label: 'Draw Completed',   classes: 'bg-white/5 text-white/40 border-white/10' },
  won:              { label: 'Winner',           classes: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  default:          { label: 'Pending',          classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

function CompetitionGroupCard({ compData, uid, onViewAll, onAddReview, activeTab }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { competition, orders } = compData;

  const [tickets, setTickets] = useState([]);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);

  useEffect(() => {
    if (!uid || !competition?.id) return;
    fetchTicketsForCompetition(uid, competition.id)
      .then(t => {
        setTickets(t);
        setTicketsLoaded(true);
      })
      .catch(() => setTicketsLoaded(true));
  }, [uid, competition?.id]);

  const isWonTab = activeTab === 'won';
  const displayTickets = isWonTab ? tickets.filter(tk => tk.is_winner) : tickets;

  const image = competition?.image?.[0];
  const isWinner = tickets.some(tk => tk.is_winner) || orders.some(o => o.is_winner);
  const rawStatus = competition?.status || 'active';

  let compStatusKey = 'default';
  if (rawStatus === 'active') compStatusKey = 'active';
  else if (rawStatus === 'ready_to_draw') compStatusKey = 'ready_to_draw';
  else if (rawStatus === 'drawing') compStatusKey = 'drawing';
  else if (['sold_out', 'sold out'].includes(rawStatus)) compStatusKey = 'sold_out';
  else if (rawStatus === 'winner_announced') compStatusKey = 'winner_announced';
  else if (PAST_STATUSES.includes(rawStatus)) compStatusKey = 'completed';

  const displayStatus = isWinner
    ? { ...STATUS_MAP.won, label: t('profile.ticketsPage.status.won') }
    : { ...(STATUS_MAP[compStatusKey] || STATUS_MAP.default), label: t(`profile.ticketsPage.status.${compStatusKey}`, STATUS_MAP[compStatusKey]?.label || 'Pending') };

  const calcTotalTickets = orders.reduce((sum, o) => sum + (Number(o.total_ticket) || 0), 0);
  const calcPaidTickets  = orders.reduce((sum, o) => sum + (o.paid_ticket !== undefined ? Number(o.paid_ticket) : Math.max(0, (Number(o.total_ticket) || 0) - (Number(o.free_used) || 0))), 0);
  const calcFreeUsed     = orders.reduce((sum, o) => sum + (Number(o.free_used) || 0), 0);
  const calcFreeEarned   = orders.reduce((sum, o) => sum + (Number(o.free_ticket) || 0), 0);
  const totalTicketsDisplay = calcTotalTickets > 0 ? calcTotalTickets : tickets.length;
  const winningTicket = tickets.find(tk => tk.is_winner);
  const shownTickets  = displayTickets.slice(0, 5);

  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-shadow duration-300">
      <div
        className="flex flex-col sm:flex-row cursor-pointer group hover:bg-[var(--color-muted)]/5 transition-colors duration-200"
        onClick={() => navigate(`/competitions/${competition?.id}`)}
      >
        <div className="sm:w-40 sm:shrink-0 h-36 sm:h-36 relative overflow-hidden">
          {image ? (
            <img src={image} alt={competition?.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--color-muted)]/20">
              <Ticket className="w-10 h-10 text-[var(--color-muted-foreground)]/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[var(--color-card)] hidden sm:block opacity-70 group-hover:opacity-40 transition-opacity duration-300" />
        </div>

        <div className="flex-1 p-5 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--color-primary)] mb-1">
                {competition?.category ?? 'Competition'}
              </p>
              <h3 className="text-base font-bold text-[var(--color-foreground)] line-clamp-1 group-hover:text-[var(--color-primary)] transition-colors duration-200">
                {competition?.title ?? 'Unknown Competition'}
              </h3>
            </div>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${displayStatus.classes}`}>
              {displayStatus.label}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-auto">
            <div className="flex items-center gap-4 text-sm text-[var(--color-muted-foreground)] bg-[var(--color-muted)]/10 py-2 px-3 rounded-lg border border-[var(--color-border)]/30">
              <span className="flex items-center gap-1.5 text-[var(--color-foreground)] font-medium">
                <Ticket className="w-4 h-4 text-[var(--color-primary)]" />
                {t('profile.ticketsPage.ticketsCount', { count: totalTicketsDisplay })}
              </span>
              <div className="w-[1px] h-4 bg-[var(--color-border)]/50" />
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {t('profile.ticketsPage.draw', { date: competition?.draw_date ? formatDate(competition.draw_date, i18n.language) : 'TBC' })}
              </span>
            </div>

            {isWinner && rawStatus === 'completed' && !competition?.winner_comment && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddReview(competition.id); }}
                className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-primary to-amber-500 rounded-xl text-black font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all cursor-pointer whitespace-nowrap"
              >
                <Sparkles size={14} className="animate-pulse" />
                {t('profile.ticketsPage.shareVictory')}
              </button>
            )}

            {isWinner && competition?.winner_comment && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold text-[10px] uppercase tracking-widest">
                <Star size={12} className="fill-emerald-400" />
                {t('profile.ticketsPage.experienceShared')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)]/40 p-5 bg-[var(--color-muted)]/5 flex flex-col gap-3">
        {!ticketsLoaded ? (
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-7 w-16 bg-[var(--color-muted)]/30 rounded animate-pulse" />
            ))}
          </div>
        ) : displayTickets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {shownTickets.map(tk => (
              <span
                key={tk.id}
                className={`px-2.5 py-1 text-xs font-mono rounded border ${
                  tk.is_winner
                    ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-500 font-bold shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                    : 'bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-foreground)]'
                }`}
              >
                {tk.ticket_sequence ?? `#${tk.ticket_number}`}
              </span>
            ))}
            {displayTickets.length > 5 && (
              <button
                onClick={onViewAll}
                className="px-2.5 py-1 text-xs font-bold rounded border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors cursor-pointer"
              >
                +{displayTickets.length - 5} more
              </button>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-[var(--color-muted)]/20 px-2.5 py-1 rounded-md border border-[var(--color-border)]/40">
            <span className="text-[var(--color-muted-foreground)]">{t('profile.ticketsPage.total', 'Total')}:</span>
            <span className="font-bold text-[var(--color-foreground)]">{totalTicketsDisplay}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            <span className="text-emerald-400/80">{t('profile.ticketsPage.paid', 'Paid')}:</span>
            <span className="font-bold text-emerald-400">{calcPaidTickets}</span>
          </div>
          {calcFreeUsed > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/20">
              <span className="text-blue-400/80">{t('profile.ticketsPage.freeUsed', 'Free Used')}:</span>
              <span className="font-bold text-blue-400">{calcFreeUsed}</span>
            </div>
          )}
          {calcFreeEarned > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
              <span className="text-amber-400/80">{t('profile.ticketsPage.bonusGot', 'Bonus Got')}:</span>
              <span className="font-bold text-amber-400">+{calcFreeEarned}</span>
            </div>
          )}
          {isWinner && winningTicket && (
            <div className="flex items-center gap-1.5 bg-yellow-400/20 px-2.5 py-1 rounded-md border border-yellow-400/40">
              <span className="text-yellow-500/80">{t('profile.ticketsPage.winningTicketLabel', 'Winning Ticket')}:</span>
              <span className="font-black text-yellow-500 uppercase">{winningTicket.ticket_sequence}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] overflow-hidden flex flex-col animate-pulse">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-40 sm:shrink-0 h-36 bg-[var(--color-muted)]/30" />
        <div className="flex-1 p-5 flex flex-col justify-center gap-3">
          <div className="flex justify-between items-start">
            <div className="space-y-2 w-3/5">
              <div className="h-2 w-1/3 bg-[var(--color-muted)]/50 rounded" />
              <div className="h-4 w-4/5 bg-[var(--color-muted)]/60 rounded" />
            </div>
            <div className="h-6 w-24 bg-[var(--color-muted)]/40 rounded-full" />
          </div>
          <div className="h-9 w-2/3 bg-[var(--color-muted)]/20 rounded-lg" />
        </div>
      </div>
      <div className="border-t border-[var(--color-border)]/40 p-5 bg-[var(--color-muted)]/5 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-16 bg-[var(--color-muted)]/30 rounded" />
        ))}
      </div>
    </div>
  );
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => {
      if (totalPages <= 7) return true;
      if (p === 1 || p === totalPages) return true;
      if (Math.abs(p - currentPage) <= 1) return true;
      return false;
    })
    .reduce((acc, p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex items-center justify-center gap-2 mt-10">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="w-10 h-10 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-card)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-muted)]/10 hover:border-[var(--color-primary)]/40 transition-all"
      >
        <ChevronLeft className="w-4 h-4 text-[var(--color-foreground)]" />
      </button>

      <div className="flex items-center gap-1">
        {pages.map((item, idx) =>
          item === '…' ? (
            <span key={`e-${idx}`} className="w-10 h-10 flex items-center justify-center text-[var(--color-muted-foreground)] text-sm select-none">…</span>
          ) : (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={`w-10 h-10 rounded-xl border font-bold text-sm transition-all ${
                currentPage === item
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-lg shadow-primary/20'
                  : 'border-[var(--color-border)]/60 bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40'
              }`}
            >
              {item}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="w-10 h-10 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-card)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-muted)]/10 hover:border-[var(--color-primary)]/40 transition-all"
      >
        <ChevronRight className="w-4 h-4 text-[var(--color-foreground)]" />
      </button>
    </div>
  );
}

export default function MyTicketsPage() {
  const { currentUser } = useAuth();
  const navigate        = useNavigate();
  const location        = useLocation();
  const { t }           = useTranslation();

  const [activeTab, setActiveTab]               = useState(location.state?.tab || 'active');
  const [allOrders, setAllOrders]               = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [currentPage, setCurrentPage]           = useState(1);
  const [selectedCompData, setSelectedCompData] = useState(null);
  const [reviewCompId, setReviewCompId]         = useState(null);

  const handleBack = () => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) { navigate(-1); return; }
    navigate('/profile', { replace: true, state: { scrollToTop: true } });
  };

  useEffect(() => {
    if (!currentUser?.uid) { setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeUserOrdersForTickets(
      currentUser.uid,
      (orders) => { setAllOrders(orders); setLoading(false); },
      (err) => { console.error('[MyTickets]', err); setLoading(false); }
    );
    return unsub;
  }, [currentUser?.uid]);

  useEffect(() => { setCurrentPage(1); }, [activeTab]);

  const groupedComps = React.useMemo(() => {
    const groups = {};
    allOrders.forEach(order => {
      const compId = order.competition_id;
      if (!compId) return;
      if (!groups[compId]) {
        groups[compId] = { competition: order.competition, orders: [] };
      }
      if (order.competition && !groups[compId].competition) {
        groups[compId].competition = order.competition;
      }
      groups[compId].orders.push(order);
    });
    return groups;
  }, [allOrders]);

  const filteredGroups = React.useMemo(() => {
    return Object.values(groupedComps).filter(group => {
      const compStatus = group.competition?.status;
      const isWinner   = group.orders.some(o => o.is_winner);
      if (activeTab === 'won')  return isWinner;
      if (activeTab === 'past') return PAST_STATUSES.includes(compStatus);
      return !PAST_STATUSES.includes(compStatus);
    });
  }, [groupedComps, activeTab]);

  const totalPages    = Math.max(1, Math.ceil(filteredGroups.length / GROUPS_PER_PAGE));
  const currentGroups = filteredGroups.slice(
    (currentPage - 1) * GROUPS_PER_PAGE,
    currentPage * GROUPS_PER_PAGE
  );

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);

    const scrollTarget = document.getElementById('tickets-list-top');
    if (scrollTarget) {
      const top = scrollTarget.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const totalTickets = allOrders.reduce((s, o) => s + (o.total_ticket || 0), 0);
  const freeBonus    = allOrders.reduce((s, o) => s + (o.free_ticket  || 0), 0);
  const wonCount     = Object.values(groupedComps).filter(g => g.orders.some(o => o.is_winner)).length;

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">

        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-full border border-[var(--color-border)]/60 flex items-center justify-center hover:bg-[var(--color-muted)]/10 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-2xl font-serif font-bold text-[var(--color-foreground)]">{t('profile.myTickets')}</h1>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: Ticket,      value: totalTickets, label: t('profile.ticketsPage.totalTickets', { count: totalTickets }).replace(String(totalTickets), '').trim() },
            { icon: Gift,        value: freeBonus,    label: t('profile.freeBonus') },
            { icon: CheckCircle, value: wonCount,     label: t('profile.ticketsPage.won') },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-card)] p-4 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
              <Icon className="w-6 h-6 text-[var(--color-primary)] mb-2" />
              <span className="text-2xl font-bold text-[var(--color-foreground)]">{value}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted-foreground)] mt-1">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex bg-[var(--color-card)] border border-[var(--color-border)]/60 rounded-xl p-1.5 mb-8 shadow-sm" id="tickets-list-top">
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
              {tab === 'active' ? t('profile.ticketsPage.active') : tab === 'past' ? t('profile.ticketsPage.past') : t('profile.ticketsPage.won')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => <GroupSkeleton key={i} />)}
          </div>
        ) : currentGroups.length > 0 ? (
          <motion.div
            key={currentPage + activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="space-y-6"
          >
            {currentGroups.map(compData => (
              <CompetitionGroupCard
                key={compData.competition?.id || Math.random()}
                compData={compData}
                uid={currentUser?.uid}
                activeTab={activeTab}
                onAddReview={id => setReviewCompId(id)}
                onViewAll={() => setSelectedCompData(compData)}
              />
            ))}

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />

            {totalPages > 1 && (
              <p className="text-center text-xs text-[var(--color-muted-foreground)]">
                Showing {(currentPage - 1) * GROUPS_PER_PAGE + 1}–{Math.min(currentPage * GROUPS_PER_PAGE, filteredGroups.length)} of {filteredGroups.length} competitions
              </p>
            )}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[var(--color-border)]/50 rounded-2xl bg-[var(--color-card)]/50">
            <Inbox className="w-12 h-12 text-[var(--color-muted-foreground)]/30 mb-4" />
            <p className="text-[var(--color-foreground)] font-semibold text-lg">
              {t('profile.ticketsPage.noTicketsFound', {
                tab: activeTab === 'active' ? t('profile.ticketsPage.active').toLowerCase()
                   : activeTab === 'past'   ? t('profile.ticketsPage.past').toLowerCase()
                   :                         t('profile.ticketsPage.won').toLowerCase()
              })}
            </p>
            {activeTab === 'active' && (
              <button
                onClick={() => navigate('/competitions')}
                className="mt-5 px-6 py-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-bold hover:opacity-90 transition-all cursor-pointer"
              >
                {t('profile.ticketsPage.browseCompetitions')}
              </button>
            )}
          </div>
        )}

        <Modal
          isOpen={!!selectedCompData}
          onClose={() => setSelectedCompData(null)}
          title={t('profile.ticketsPage.yourTicketsModal')}
          description={t('profile.ticketsPage.modalDescription', {
            count: selectedCompData?.tickets?.length || 0,
            title: selectedCompData?.competition?.title || 'this competition',
          })}
        >
          <TicketModal compData={selectedCompData} uid={currentUser?.uid} activeTab={activeTab} onClose={() => setSelectedCompData(null)} />
        </Modal>

        <Modal
          isOpen={!!reviewCompId}
          onClose={() => setReviewCompId(null)}
          title={t('profile.ticketsPage.shareExperience')}
          description={t('profile.ticketsPage.shareExperienceDesc')}
        >
          <div className="py-2">
            <WinnerReviewForm
              competitionId={reviewCompId}
              userId={currentUser?.uid}
              onReviewSubmitted={() => setReviewCompId(null)}
            />
          </div>
        </Modal>
      </div>
    </div>
  );
}

function TicketModal({ compData, uid, activeTab, onClose }) {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!compData?.competition?.id || !uid) { setLoading(false); return; }
    fetchTicketsForCompetition(uid, compData.competition.id)
      .then(tks => {
        const display = activeTab === 'won' ? tks.filter(tk => tk.is_winner) : tks;
        setTickets(display);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [compData?.competition?.id, uid, activeTab]);

  return (
    <div>
      <div className="max-w-md mx-auto w-full max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 pb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-[var(--color-muted)]/20 animate-pulse" />
            ))}
          </div>
        ) : tickets.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 pb-4">
            {tickets.map(tk => (
              <div
                key={tk.id}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all group ${
                  tk.is_winner
                    ? 'bg-yellow-400/10 border-yellow-400/30'
                    : 'bg-[var(--color-card)] border-[var(--color-border)]/60 hover:border-[var(--color-primary)]/30'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[var(--color-muted-foreground)] uppercase tracking-widest mb-1">
                    {t('profile.ticketsPage.ticketId')}
                  </span>
                  <span className={`text-sm font-mono font-bold ${tk.is_winner ? 'text-yellow-400' : 'text-[var(--color-foreground)]'}`}>
                    {tk.ticket_sequence ?? `#${tk.ticket_number}`}
                  </span>
                </div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tk.is_winner ? 'bg-yellow-400/20' : 'bg-[var(--color-primary)]/10'}`}>
                  <Ticket className={`w-4 h-4 ${tk.is_winner ? 'text-yellow-400' : 'text-[var(--color-primary)]'}`} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-6 pt-6 border-t border-[var(--color-border)]/40">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-black uppercase tracking-widest text-xs hover:opacity-90 transition-all cursor-pointer"
        >
          {t('profile.ticketsPage.close')}
        </button>
      </div>
    </div>
  );
}
