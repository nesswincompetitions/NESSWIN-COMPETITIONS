import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { Search, Calendar, Download, Eye, ExternalLink, Trophy } from 'lucide-react';

const WinnersList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const [activeStatus, setActiveStatus] = useState('all');

  // Dummy Winners Data
  const winners = [
    {
      id: 1,
      name: "John Doe",
      email: "john@example.com",
      competition: t('competitionNames.iphone'),
      ticket: "#0234",
      drawDate: "12 May 2026",
      status: "Completed"
    },
    {
      id: 2,
      name: "Sarah Smith",
      email: "sarah@example.com",
      competition: t('competitionNames.rangeRover'),
      ticket: "#1450",
      drawDate: "01 Jun 2026",
      status: "Contacted"
    },
    {
      id: 3,
      name: "Mike Johnson",
      email: "mike@example.com",
      competition: t('competitionNames.rolex'),
      ticket: "#0899",
      drawDate: "15 Apr 2026",
      status: "pending"
    },
  ];

  const filteredWinners = activeStatus === 'all'
    ? winners
    : winners.filter(w => w.status.toLowerCase() === activeStatus);

  const renderStatusBadge = (status) => {
    switch (status.toLowerCase()) {
      case 'completed': return <Badge variant="success">{t('common.completed')}</Badge>;
      case 'contacted': return <Badge variant="hot">{t('common.contacted')}</Badge>;
      case 'pending': return <Badge variant="warning">{t('common.pending')}</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('winners.title')}</h1>
          <p className="text-gray-400 mt-1">{t('winners.subtitle')}</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Download size={16} />
          {t('common.exportCsv')}
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">

            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-full lg:w-fit overflow-x-auto hide-scrollbar shrink-0">
              {[
                { key: 'all', label: t('common.all') },
                { key: 'pending', label: t('common.pending') },
                { key: 'contacted', label: t('common.contacted') },
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

            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('winners.searchPlaceholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
                />
              </div>

              <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 justify-center">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-sm">{t('common.filterDates')}</span>
              </Button>
            </div>
          </div>

          {/* Table Area */}
          {filteredWinners.length > 0 ? (
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
                    <TableCell className="font-medium text-white">{winner.name}</TableCell>
                    <TableCell className="text-gray-400">{winner.email}</TableCell>
                    <TableCell>{winner.competition}</TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="font-mono bg-white/5 border-white/10">{winner.ticket}</Badge>
                    </TableCell>
                    <TableCell>{winner.drawDate}</TableCell>
                    <TableCell>{renderStatusBadge(winner.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/admin/winners/${winner.id}`)}
                          className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors group relative" title={t('winners.tooltips.viewWinner')}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/competitions/${winner.id}`)}
                          className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-primary transition-colors" title={t('winners.tooltips.viewCompetition')}
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
            /* Empty State */
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Trophy className="text-gray-500" size={32} />
              </div>
              <div>
                <p className="text-white font-medium text-lg">{t('winners.empty.title')}</p>
                <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                  {t('winners.empty.desc')}
                </p>
              </div>
              {activeStatus !== 'all' && (
                <Button variant="outline" size="sm" onClick={() => setActiveStatus('all')} className="mt-2">
                  {t('common.clearFilters')}
                </Button>
              )}
            </div>
          )}

          {/* Pagination (Only show if there are items) */}
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
    </div>
  );
};

export default WinnersList;
