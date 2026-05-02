import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import {
  Search, Plus, Upload, Settings, Ticket, HelpCircle, Loader2
} from 'lucide-react';
import { fetchBonusTicketsList } from '../../../services/adminService';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { toast } from 'react-hot-toast';

const BonusTickets = () => {
  const { t } = useTranslation('admin');
  const [activeStatus, setActiveStatus] = useState('all');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const { data: ticketsData, loading } = useAdminQuery('bonus_tickets_list', fetchBonusTicketsList);
  const tickets = ticketsData || [];
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Form State
  const [assignUser, setAssignUser] = useState('');
  const [assignAmount, setAssignAmount] = useState(1);
  const [assignReason, setAssignReason] = useState('');
  const [assignExpiry, setAssignExpiry] = useState('');

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

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    // In a real app, you'd call a Cloud Function here
    toast.error('Direct ticket assignment is coming soon');
    setIsAssignModalOpen(false);
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
          <Card className="bg-white/[0.02] border-white/5 py-2 px-4 flex items-center gap-3 h-[52px]">
            <Ticket className="text-primary opacity-70" size={20} />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Total Issued</p>
              <p className="text-lg font-bold text-white leading-none mt-0.5">
                {tickets.reduce((acc, curr) => acc + (curr.quantity || 0), 0).toLocaleString()}
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
        <Button variant="outline" className="flex items-center gap-2">
          <Upload size={16} /> {t('bonusTickets.bulkAssign')}
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
                          <span className="truncate max-w-[200px]">{ticket.reason}</span>
                          <HelpCircle size={14} className="text-gray-500 cursor-help" title={ticket.reason} />
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400">
                        <span className="truncate max-w-[150px] block" title={ticket.competitionTitle}>
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
        onClose={() => setIsAssignModalOpen(false)}
        title={t('bonusTickets.issueTickets')}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('bonusTickets.modal.searchUser')}</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                required
                value={assignUser}
                onChange={(e) => setAssignUser(e.target.value)}
                placeholder={t('bonusTickets.modal.searchUserPlaceholder')}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">{t('bonusTickets.modal.numberOfTickets')}</label>
              <input
                type="number"
                required
                min="1"
                value={assignAmount}
                onChange={(e) => setAssignAmount(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('bonusTickets.modal.reasonNote')}</label>
            <textarea
              required
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder={t('bonusTickets.modal.reasonPlaceholder')}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-none h-24"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
            <Button type="button" variant="outline" onClick={() => setIsAssignModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('bonusTickets.issueTickets')}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default BonusTickets;
