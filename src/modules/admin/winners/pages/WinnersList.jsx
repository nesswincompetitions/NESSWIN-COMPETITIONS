import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import SearchInput from '@/shared/components/ui/SearchInput';
import Modal from '@/shared/components/ui/Modal';
import { Calendar, Download, Eye, ExternalLink, Trophy, Loader2, X } from 'lucide-react';
import { exportToCSV } from '@/shared/utils/csvExport';
import { toast } from 'react-hot-toast';
import { useSearch } from '@/shared/hooks/useSearch';
import { useWinnerCompetitionsFeed } from '@/shared/hooks/useAdminData';

const WinnersList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const [activeStatus, setActiveStatus] = useState('all');
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const { data: winners, loading } = useWinnerCompetitionsFeed();

  const clearDateFilter = () => {
    setDateRange({ start: '', end: '' });
  };

  const handleExportCSV = () => {
    if (!winners.length) return;

    const headers = [
      { label: 'Winner', key: 'winnerName' },
      { label: 'Email', key: 'winnerEmail' },
      { label: 'Competition', key: 'competition' },
      { label: 'Ticket', key: 'ticket' },
      { label: 'Draw Date', key: 'drawDate' },
      { label: 'Status', key: 'status' }
    ];

    const exportData = winners.map((winner) => ({
      ...winner,
      drawDate: winner.drawDate?.toDate ? winner.drawDate.toDate().toISOString() : winner.drawDate ? new Date(winner.drawDate).toISOString() : 'N/A'
    }));

    exportToCSV(exportData, headers, `winners_export_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Winners list exported to CSV');
  };

  const { searchTerm, setSearchTerm, filteredItems: searchedWinners, clearSearch } = useSearch(
    winners,
    ['winnerName', 'winnerEmail', 'competition', 'ticket'],
    { debounceDelay: 300 }
  );

  const filteredWinners = useMemo(
    () => searchedWinners.filter((winner) => {
      // 1. Status Filter
      if (activeStatus !== 'all') {
        if ((winner.status || '').toLowerCase() !== activeStatus) return false;
      }
      
      // 2. Date Filter
      if (dateRange.start || dateRange.end) {
        const drawDateVal = winner.drawDate?.toDate ? winner.drawDate.toDate() : (winner.drawDate ? new Date(winner.drawDate) : null);
        if (!drawDateVal) return false;
        
        if (dateRange.start) {
          const start = new Date(dateRange.start);
          start.setHours(0, 0, 0, 0);
          if (drawDateVal < start) return false;
        }
        
        if (dateRange.end) {
          const end = new Date(dateRange.end);
          end.setHours(23, 59, 59, 999);
          if (drawDateVal > end) return false;
        }
      }
      
      return true;
    }),
    [searchedWinners, activeStatus, dateRange]
  );

  const renderStatusBadge = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'winner_announced':
        return <Badge variant="warning">Winner Announced</Badge>;
      case 'completed':
        return <Badge variant="success">{t('common.completed')}</Badge>;
      case 'closed':
        return <Badge variant="neutral">Closed</Badge>;
      case 'contacted':
        return <Badge variant="hot">{t('common.contacted')}</Badge>;
      case 'pending':
        return <Badge variant="warning">{t('common.pending')}</Badge>;
      default:
        return <Badge variant="neutral">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('winners.title')}</h1>
          <p className="text-gray-400 mt-1">{t('winners.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={handleExportCSV}
          disabled={!winners.length}
        >
          <Download size={16} />
          {t('common.exportCsv')}
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex bg-white/5 p-1 rounded-lg w-full lg:w-fit overflow-x-auto hide-scrollbar shrink-0">
              {[
                { key: 'all', label: t('common.all') },
                { key: 'winner_announced', label: 'Winner Announced' },
                { key: 'completed', label: t('common.completed') }
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

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <SearchInput
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={clearSearch}
                placeholder={t('winners.searchPlaceholder')}
              />

              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setDateModalOpen(true)}
                className={`flex items-center gap-2 h-10 px-3 bg-white/5 justify-center transition-colors cursor-pointer ${
                  (dateRange.start || dateRange.end) 
                    ? 'border-primary text-primary font-medium bg-primary/5 hover:bg-primary/10' 
                    : 'border-white/10 text-white hover:bg-white/10'
                }`}
              >
                <Calendar size={16} className={dateRange.start || dateRange.end ? 'text-primary' : 'text-gray-400'} />
                <span className="text-sm">
                  {dateRange.start || dateRange.end ? `${dateRange.start || '...'} to ${dateRange.end || '...'}` : t('common.filterDates')}
                </span>
                {(dateRange.start || dateRange.end) && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      clearDateFilter();
                    }}
                    className="p-0.5 hover:bg-primary/20 rounded text-primary transition-colors ml-1 cursor-pointer"
                  >
                    <X size={14} />
                  </span>
                )}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <Loader2 size={32} className="animate-spin text-primary mb-3 opacity-80" />
              <p className="text-gray-400 text-sm font-medium">{t('common.loading')}...</p>
            </div>
          ) : filteredWinners.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t('users.table.number')}</TableHead>
                  <TableHead>{t('winners.table.winner')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('winners.table.competition')}</TableHead>
                  <TableHead>{t('winners.table.ticketNo')}</TableHead>
                  <TableHead>{t('winners.table.drawDate')}</TableHead>
                  <TableHead>{t('winners.table.status')}</TableHead>
                  <TableHead className="text-right">{t('winners.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWinners.map((winner, index) => (
                  <TableRow key={winner.id}>
                    <TableCell className="text-gray-500 font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold overflow-hidden text-xs">
                          {winner.winnerPhoto ? (
                            <img src={winner.winnerPhoto} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (winner.winnerName || '?').charAt(0)
                          )}
                        </div>
                        <span className="font-medium text-white">{winner.winnerName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-400">{winner.winnerEmail}</TableCell>
                    <TableCell>{winner.competition}</TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="font-mono bg-white/5 border-white/10">{winner.ticket}</Badge>
                    </TableCell>
                    <TableCell>{winner.drawDate?.toDate ? winner.drawDate.toDate().toLocaleDateString() : winner.drawDate ? new Date(winner.drawDate).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>{renderStatusBadge(winner.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/admin/winners/${winner.id}`)}
                          className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors group relative"
                          title={t('winners.tooltips.viewWinner')}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/competitions/${winner.id}`)}
                          className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-primary transition-colors"
                          title={t('winners.tooltips.viewCompetition')}
                        >
                          <ExternalLink size={16} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Trophy className="text-gray-500" size={32} />
              </div>
              <div>
                <p className="text-white font-medium text-lg">{t('winners.empty.title')}</p>
                <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">{t('winners.empty.desc')}</p>
              </div>
              {activeStatus !== 'all' && (
                <Button variant="outline" size="sm" onClick={() => setActiveStatus('all')} className="mt-2">
                  {t('common.clearFilters')}
                </Button>
              )}
            </div>
          )}

          {filteredWinners.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {t('common.showing')} <span className="font-medium text-white">1</span>-<span className="font-medium text-white">{filteredWinners.length}</span> {t('common.of')} <span className="font-medium text-white">{filteredWinners.length}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10" disabled>
                  {t('common.previous')}
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10" disabled>
                  {t('common.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Date Filter Modal */}
      <Modal
        isOpen={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        title={t('modals.competitions.filterDateTitle')}
        description={t('modals.competitions.filterDateDesc')}
        actions={
          <>
            <Button variant="outline" onClick={clearDateFilter}>{t('modals.competitions.clearFilter')}</Button>
            <Button variant="primary" onClick={() => setDateModalOpen(false)}>{t('modals.competitions.applyFilter')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">{t('modals.competitions.startDate')}</label>
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors scheme-dark cursor-pointer"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">{t('modals.competitions.endDate')}</label>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors scheme-dark cursor-pointer"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WinnersList;