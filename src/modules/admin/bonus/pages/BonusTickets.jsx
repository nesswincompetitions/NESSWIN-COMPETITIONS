import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import Modal from '@/shared/components/ui/Modal';
import { limit, orderBy, where } from 'firebase/firestore';
import {
  Search, Plus, Upload, Settings, Ticket, HelpCircle, Loader2, Download
} from 'lucide-react';
import { grantAdminBonus } from '@/modules/admin/bonus/services/bonusService';
import { useRecentUsers } from '@/shared/hooks/useAdminData';
import useRealtimeCollection from '@/shared/hooks/useRealtimeCollection';
import { exportToCSV } from '@/shared/utils/csvExport';
import { toast } from 'react-hot-toast';

const BonusTickets = () => {
  const { t } = useTranslation('admin');
  const [activeStatus, setActiveStatus] = useState('all');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const { data: ticketsRaw, loading: ticketsLoading } = useRealtimeCollection('free_ticket_log', [orderBy('created_at', 'desc')]);
  const { data: rewardLogs, loading: rewardsLoading } = useRealtimeCollection('referrals', [where('reward_type', '==', 'admin_bonus')]);
  const { data: users, loading: usersLoading } = useRecentUsers(100);
  const { data: competitions, loading: competitionsLoading } = useRealtimeCollection('competition', []);
  const loading = ticketsLoading || rewardsLoading || usersLoading || competitionsLoading;
  const totalIssued = rewardLogs.length;
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Form State
  const [assignUser, setAssignUser] = useState('');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignAmount, setAssignAmount] = useState(1);
  const [assignReason, setAssignReason] = useState('');
  const [assignExpiry, setAssignExpiry] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userMap = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users]);
  const competitionMap = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);

  const tickets = useMemo(() => ticketsRaw.map((ticket) => {
    const userId = ticket.user_id?.id || (typeof ticket.user_id === 'string' ? ticket.user_id : null);
    const competitionId = ticket.competition_id?.id || (typeof ticket.competition_id === 'string' ? ticket.competition_id : null);
    const user = userMap[userId];
    const competition = competitionMap[competitionId];

    return {
      ...ticket,
      userName: user?.display_name || user?.name || 'Unknown User',
      competitionTitle: competition?.title || 'N/A',
    };
  }), [ticketsRaw, userMap, competitionMap]);

  const filteredTickets = tickets.filter(ticket => {
    // 1. Search Filter (User Name or Reason)
    const matchesSearch = 
      ticket.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ticket.reason || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ticket.competitionTitle || '').toLowerCase().includes(searchTerm.toLowerCase());

    // 2. Status Filter (Since we don't have a status field in log, we might assume 'Active' or handle based on reason)
    // For now, if activeStatus is 'all', show everything.
    if (activeStatus === 'all') return matchesSearch;
    
    // Logic for used/active/expired could be added here if fields were available
    return matchesSearch;
  });

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleExportCSV = () => {
    if (!tickets.length) return;
    
    const headers = [
      { label: 'User', key: 'userName' },
      { label: 'Quantity', key: 'quantity' },
      { label: 'Reason', key: 'reason' },
      { label: 'Competition', key: 'competitionTitle' },
      { label: 'Date', key: 'created_at' }
    ];

    const exportData = tickets.map(t => ({
      ...t,
      created_at: t.created_at?.toMillis ? new Date(t.created_at.toMillis()).toISOString() : 'N/A'
    }));

    exportToCSV(exportData, headers, `bonus_tickets_export_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Bonus tickets list exported to CSV');
  };

  // Handle user search
  const handleUserSearch = async (e) => {
    const value = e.target.value;
    setAssignUser(value);
    setAssignUserId(''); // Clear user ID when search term changes
    
    if (value.length < 2) {
      setUserSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const term = value.toLowerCase();
      const results = users.filter((user) => {
        const email = (user.email || '').toLowerCase();
        const name = (user.display_name || user.name || '').toLowerCase();
        return email.includes(term) || name.includes(term);
      }).slice(0, 10);

      setUserSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Failed to search users');
      setUserSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle user selection from dropdown
  const handleSelectUser = (user) => {
    setAssignUser(user.display_name || user.name || user.email);
    setAssignUserId(user.id);
    setUserSearchResults([]);
  };

  // Handle quantity input - validate no negative numbers
  const handleAmountChange = (e) => {
    let value = e.target.value;
    
    // Allow empty input while user is typing
    if (value === '') {
      setAssignAmount('');
      return;
    }
    
    // Convert to number and validate
    let num = parseInt(value, 10);
    
    // If not a valid number, keep current value
    if (isNaN(num)) {
      return;
    }
    
    // Clamp to valid range (1-1000)
    if (num < 1) num = 1;
    if (num > 1000) num = 1000;
    
    setAssignAmount(num);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!assignUserId) {
      toast.error('Please select a user');
      return;
    }

    const qty = Number(assignAmount);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity (1 or more)');
      return;
    }

    if (qty > 1000) {
      toast.error('Maximum 1000 tickets per grant');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await grantAdminBonus(assignUserId, qty, assignReason);
      
      if (result.success) {
        toast.success(result.message);
        
        // Reset form
        setAssignUser('');
        setAssignUserId('');
        setAssignAmount(1);
        setAssignReason('');
        setAssignExpiry('');
        setIsAssignModalOpen(false);

        // Realtime listeners update the list automatically.
      }
    } catch (error) {
      console.error('Error granting bonus:', error);
      toast.error(error.message || 'Failed to grant bonus tickets');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    if (!isSubmitting) {
      setIsAssignModalOpen(false);
      // Reset form
      setAssignUser('');
      setAssignUserId('');
      setAssignAmount(1);
      setAssignReason('');
      setAssignExpiry('');
      setUserSearchResults([]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">

      {/* 1. Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('bonusTickets.title')}</h1>
          <p className="text-gray-400 mt-1">{t('bonusTickets.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="bg-white/2 border-white/5 py-2 px-4 flex items-center gap-3 h-13">
            <Ticket className="text-primary opacity-70" size={20} />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Total Issued</p>
              <p className="text-lg font-bold text-white leading-none mt-0.5">
                {totalIssued.toLocaleString()}
              </p>
            </div>
          </Card>
        </div>
      </header>

      {/* 2. Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsAssignModalOpen(true)}>
          <Plus size={16} /> {t('bonusTickets.issueTickets')}
        </Button>
        <Button variant="outline" className="flex items-center gap-2" onClick={handleExportCSV} disabled={!tickets.length}>
          <Download size={16} /> {t('common.exportCsv')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* 4. Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">

            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-full lg:w-fit overflow-x-auto hide-scrollbar shrink-0">
              {[
                { key: 'all', label: t('common.all') },
                { key: 'active', label: t('common.active') },
                { key: 'used', label: t('common.used') },
                { key: 'expired', label: t('common.expired') }
              ].map((status) => (
                <button
                  key={status.key}
                  onClick={() => setActiveStatus(status.key)}
                  className={`cursor-pointer px-4 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex-1 lg:flex-none ${activeStatus === status.key
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {status.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full lg:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('bonusTickets.searchPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
              />
            </div>
          </div>

          {/* 5. Ledger Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-20 text-center">
                <Loader2 size={32} className="animate-spin text-primary mx-auto mb-4" />
                <p className="text-gray-400">Loading bonus ticket logs...</p>
              </div>
            ) : filteredTickets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('bonusTickets.table.user')}</TableHead>
                    <TableHead className="text-center">{t('bonusTickets.table.tickets')}</TableHead>
                    <TableHead>{t('bonusTickets.table.reason')}</TableHead>
                    <TableHead>Competition</TableHead>
                    <TableHead>{t('bonusTickets.table.date')}</TableHead>
                    <TableHead className="text-right">{t('common.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium text-white">{ticket.userName}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold font-mono px-2 py-1 rounded-md text-emerald-400 bg-emerald-400/10`}>
                          +{ticket.quantity}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <span className="truncate max-w-50">{ticket.reason}</span>
                          <HelpCircle size={14} className="text-gray-500 cursor-help" title={ticket.reason} />
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400">
                        <span className="truncate max-w-37.5 block" title={ticket.competitionTitle}>
                          {ticket.competitionTitle}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-400 whitespace-nowrap">{formatDate(ticket.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="success">Granted</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              /* Empty State */
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <Ticket className="text-gray-500" size={32} />
                </div>
                <div>
                  <p className="text-white font-medium text-lg">{t('bonusTickets.empty.title')}</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                    {t('bonusTickets.empty.desc')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Assign Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={handleCloseModal}
        title={t('bonusTickets.issueTickets')}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          {/* User Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('bonusTickets.modal.searchUser')}</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="text"
                required={!assignUserId}
                value={assignUser}
                onChange={handleUserSearch}
                placeholder={t('bonusTickets.modal.searchUserPlaceholder')}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                disabled={isSubmitting}
                autoComplete="off"
              />
              
              {/* Search Results Dropdown */}
              {assignUser && (userSearchResults.length > 0 || isSearching) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg z-50 max-h-48 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-3 text-center text-gray-400">
                      <Loader2 size={16} className="inline animate-spin mr-2" />
                      Searching...
                    </div>
                  ) : userSearchResults.length > 0 ? (
                    userSearchResults.map(user => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0 text-sm"
                      >
                        <div className="font-medium text-white">{user.display_name || user.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">{user.email}</div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-400 text-sm">No users found</div>
                  )}
                </div>
              )}
            </div>

            {assignUserId && (
              <div className="mt-2 px-3 py-2 bg-green-400/10 border border-green-400/30 rounded-lg text-sm text-green-300">
                ✓ User selected
              </div>
            )}
          </div>

          {/* Quantity Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('bonusTickets.modal.numberOfTickets')}</label>
            <input
              type="number"
              required
              min="1"
              max="1000"
              value={assignAmount}
              onChange={handleAmountChange}
              placeholder="Enter number of tickets (1-1000)"
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-400">
              Note: {assignAmount > 1 ? `${assignAmount} separate referral documents` : 'Creates 1 referral document'} will be created
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('bonusTickets.modal.reasonNote')} <span className="text-gray-500">(optional)</span></label>
            <textarea
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder={t('bonusTickets.modal.reasonPlaceholder')}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-none h-24"
              disabled={isSubmitting}
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleCloseModal}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              disabled={isSubmitting || !assignUserId || !assignAmount}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Granting...
                </>
              ) : (
                `${t('bonusTickets.issueTickets')}`
              )}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default BonusTickets;
