import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import SearchInput from '@/shared/components/ui/SearchInput';
import Modal from '@/shared/components/ui/Modal';
import ConfirmationModal from '@/shared/components/ui/ConfirmationModal';
import {
  Plus, Calendar, Download,
  Eye, Edit, Trash2, ChevronLeft, ChevronRight, FileEdit, Loader2, X, RefreshCcw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { deleteCompetition } from '@/modules/admin/competitions/services/adminCompetitionService';
import { useAdminCompetitionsFeedPaginated } from '@/shared/hooks/useAdminData';
import { exportToCSV } from '@/shared/utils/csvExport';
import { formatStatus } from '@/shared/utils/formatters';

const CompetitionsList = () => {
  const [activeTab, setActiveTab] = useState('All');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [competitionToDelete, setCompetitionToDelete] = useState(null);
  
  // Date filter state
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [tempDateRange, setTempDateRange] = useState({ start: '', end: '' });
  const [dateError, setDateError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  const tabs = [
    { key: 'All', label: t('common.all') },
    { key: 'Active', label: t('common.active') },
    { key: 'Ready', label: t('common.readyToDraw') },
    { key: 'Drawing', label: t('common.drawing') },
    { key: 'SoldOut', label: t('common.soldOut') },
    { key: 'Completed', label: t('common.completed') },
    { key: 'Drafts', label: t('common.drafts') },
  ];

  const { 
    data: competitions, 
    loading,
    currentPage,
    totalPages,
    nextPage,
    prevPage,
    totalCount,
    goToPage,
    refresh,
    setItems
  } = useAdminCompetitionsFeedPaginated(20);

  // Force re-render every minute to update countdown-based statuses
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (dateModalOpen) {
      setTempDateRange(dateRange);
    }
    setDateError('');
  }, [dateModalOpen, dateRange]);

  const handleDelete = async () => {
    if (!competitionToDelete) return;

    // Edge Case: Prevent deletion if users have already bought tickets
    if (competitionToDelete.last_ticket_sequence > 0 || (competitionToDelete.sold || 0) > 0) {
      toast.error('This competition already has participants and cannot be deleted.');
      setDeleteModalOpen(false);
      setCompetitionToDelete(null);
      return;
    }

    const compId = competitionToDelete.id;
    
    // Optimistic UI Update: remove the competition from local state immediately
    setItems(prevItems => prevItems.filter(c => c.id !== compId));
    setDeleteModalOpen(false);
    setCompetitionToDelete(null);

    const loadingToast = toast.loading('Deleting competition...');
    try {
      await deleteCompetition(compId);
      toast.success('Competition deleted successfully', { id: loadingToast });
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Failed to delete competition', { id: loadingToast });
      // Revert optimistic update if the API call fails
      refresh();
    }
  };

  const handleExportCSV = () => {
    if (!filteredCompetitions.length) return;
    
    const headers = [
      { label: 'Competition Name', key: 'name' },
      { label: 'Status', key: 'status' },
      { label: 'Ticket Price', key: 'price' },
      { label: 'Sold', key: 'sold' },
      { label: 'Total Tickets', key: 'total' },
      { label: 'Revenue', key: 'revenue' },
      { label: 'Draw Date', key: 'drawDate' },
      { label: 'Created At', key: 'createdAt' }
    ];

    const exportData = filteredCompetitions.map(c => {
      let drawDateStr = 'N/A';
      if (c.drawDate) {
        const dateObj = c.drawDate.toDate ? c.drawDate.toDate() : new Date(c.drawDate);
        if (!isNaN(dateObj.getTime())) {
          drawDateStr = dateObj.toISOString();
        }
      }

      return {
        ...c,
        drawDate: drawDateStr,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : 'N/A'
      };
    });

    exportToCSV(exportData, headers, `competitions_export_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Competitions list exported to CSV');
  };

  const filteredCompetitions = competitions.filter(c => {
    const now = new Date();
    const isTimeUp = c.status === 'active' && c.drawDate && c.drawDate.toMillis() <= now.getTime();

    // 1. Status Filter
    let statusMatch = true;
    if (activeTab === 'Active') statusMatch = c.status === 'active' && !isTimeUp;
    else if (activeTab === 'Ready') statusMatch = isTimeUp || c.status === 'ready_to_draw';
    else if (activeTab === 'Drawing') statusMatch = c.status === 'drawing';
    else if (activeTab === 'SoldOut') statusMatch = c.status === 'sold_out';
    else if (activeTab === 'Completed') statusMatch = c.status === 'completed' || c.status === 'end';
    else if (activeTab === 'Drafts') statusMatch = c.status === 'draft';

    // 2. Search Filter
    const searchMatch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        c.subTitle.toLowerCase().includes(searchTerm.toLowerCase());

    // 3. Date Filter
    let dateMatch = true;
    if (dateRange.start) {
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      dateMatch = dateMatch && c.createdAt >= start;
    }
    if (dateRange.end) {
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      dateMatch = dateMatch && c.createdAt <= end;
    }

    return statusMatch && searchMatch && dateMatch;
  }).sort((a, b) => {
    const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return dateB - dateA; // Newest first
  });

  const clearDateFilter = () => {
    setDateRange({ start: '', end: '' });
    setTempDateRange({ start: '', end: '' });
    setDateError('');
    setDateModalOpen(false);
    goToPage(1);
  };

  const handleApplyDateFilter = () => {
    if (tempDateRange.start && tempDateRange.end && new Date(tempDateRange.end) < new Date(tempDateRange.start)) {
      const errMsg = t('modals.competitions.invalidDateRange', 'End date cannot be earlier than start date');
      setDateError(errMsg);
      toast.error(errMsg);
      return;
    }
    setDateRange(tempDateRange);
    setDateModalOpen(false);
    goToPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold">{t('competitions.title')}</h1>
          <p className="text-gray-400 mt-1">{t('competitions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex items-center gap-2" onClick={() => navigate('/admin/competitions/drafts')}>
            <FileEdit size={16} />
            View Drafts
          </Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => navigate('/admin/competitions/create')}>
            <Plus size={18} />
            {t('competitions.createNew')}
          </Button>
          <button
            onClick={refresh}
            title="Refresh Data"
            className="w-10 h-10 flex items-center justify-center rounded-md border border-white/10 bg-transparent hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-all duration-300 shrink-0 group"
          >
            <RefreshCcw
              size={16}
              className={`transition-all duration-500 ${loading ? 'animate-spin text-yellow-400' : 'text-yellow-400/70 group-hover:text-yellow-400 group-hover:rotate-180'}`}
            />
          </button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">

            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-full lg:w-fit overflow-x-auto hide-scrollbar shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); goToPage(1); }}
                  className={`cursor-pointer px-4 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex-1 lg:flex-none ${activeTab === tab.key
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <SearchInput
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); goToPage(1); }}
                placeholder={t('competitions.searchPlaceholder')}
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setDateModalOpen(true)}
                  className={`flex items-center gap-2 h-10 px-3 border-white/10 flex-1 sm:flex-none justify-center transition-colors ${
                    dateRange.start || dateRange.end ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-white/5 text-white'
                  }`}
                >
                  <Calendar size={16} className={dateRange.start || dateRange.end ? 'text-primary' : 'text-gray-400'} />
                  <span className="text-sm">
                    {dateRange.start || dateRange.end ? 'Filtered' : t('common.filterDates')}
                  </span>
                </Button>

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 flex-1 sm:flex-none justify-center"
                  onClick={handleExportCSV}
                  disabled={!filteredCompetitions.length}
                >
                  <Download size={16} className="text-gray-400" />
                  <span className="text-sm">{t('common.export')}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('competitions.table.competitionName')}</TableHead>
                <TableHead>{t('competitions.table.status')}</TableHead>
                <TableHead>{t('competitions.table.ticketPrice')}</TableHead>
                <TableHead>{t('competitions.table.ticketsSold')}</TableHead>
                <TableHead>{t('competitions.table.revenue')}</TableHead>
                <TableHead>{t('competitions.table.drawDate')}</TableHead>
                <TableHead className="text-right">{t('competitions.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20">
                    <Loader2 size={32} className="animate-spin text-primary mx-auto mb-4" />
                    <p className="text-gray-400">Loading competitions...</p>
                  </TableCell>
                </TableRow>
              ) : filteredCompetitions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-gray-500">
                    No competitions found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : filteredCompetitions.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 border border-white/5 overflow-hidden">
                        {comp.image ? (
                          <img src={comp.image} alt={comp.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-gray-500 font-medium uppercase tracking-tighter">No IMG</span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-white">{comp.name}</p>
                        <p className="text-xs text-gray-500 line-clamp-1">{comp.subTitle}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const now = new Date();
                      const isTimeUp = comp.status === 'active' && comp.drawDate && comp.drawDate.toMillis() <= now.getTime();
                      
                      if (isTimeUp) {
                        return <Badge variant="warning" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">{t('common.readyToDraw')}</Badge>;
                      }
                      
                      if (comp.status === 'drawing') {
                        return (
                          <Badge variant="warning" className="bg-amber-500/20 text-amber-500 border-amber-500/50 animate-pulse">
                            {t('common.drawing')}
                          </Badge>
                        );
                      }
                      
                      return (
                        <Badge variant={
                          comp.status === 'active' ? 'success' :
                            comp.status === 'completed' || comp.status === 'end' ? 'success' :
                              comp.status === 'sold_out' ? 'danger' : 'warning'
                        }>
                          {comp.status === 'active' ? t('common.active') :
                            comp.status === 'completed' || comp.status === 'end' ? 'Completed' :
                              comp.status === 'sold_out' ? 'Sold Out' :
                                formatStatus(comp.status)}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{comp.price}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 w-24">
                      <span className="text-xs text-gray-400">{comp.sold} / {comp.total}</span>
                      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${comp.sold >= comp.total ? 'bg-emerald-400' : 'bg-primary'}`}
                          style={{ width: `${Math.min(100, (comp.sold / comp.total) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-white">{comp.revenue}</TableCell>
                  <TableCell className="text-sm">
                    {comp.drawDate?.toDate ? comp.drawDate.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 
                     comp.drawDate ? new Date(comp.drawDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/admin/competitions/${comp.id}`)}
                        className="cursor-pointer p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title={t('common.view')}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => navigate(`/admin/competitions/${comp.id}?tab=edit`)}
                        className="cursor-pointer p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-blue-400 transition-colors" title={t('common.edit')}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => { setCompetitionToDelete(comp); setDeleteModalOpen(true); }}
                        className="cursor-pointer p-2 hover:bg-red-500/10 rounded-md text-gray-400 hover:text-red-400 transition-colors" title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {!loading && filteredCompetitions.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {t('common.showing')} <span className="font-medium text-white">{filteredCompetitions.length}</span> {t('common.of')} <span className="font-medium text-white">{totalCount || filteredCompetitions.length}</span> {t('sidebar.competitions').toLowerCase()}
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs bg-white/5" 
                  disabled={currentPage <= 1 || loading} 
                  onClick={prevPage}
                >
                  <ChevronLeft size={14} className="mr-1" />
                  {t('common.previous')}
                </Button>
                <div className="px-3 py-1 bg-white/5 rounded-md text-sm font-medium text-white border border-white/10">
                  {currentPage} / {Math.max(1, totalPages)}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs bg-white/5" 
                  disabled={currentPage >= totalPages || loading} 
                  onClick={nextPage}
                >
                  {t('common.next')}
                  <ChevronRight size={14} className="ml-1" />
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
            <Button variant="primary" onClick={handleApplyDateFilter}>{t('modals.competitions.applyFilter')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">{t('modals.competitions.startDate')}</label>
            <input 
              type="date" 
              value={tempDateRange.start}
              onChange={(e) => {
                const startVal = e.target.value;
                setTempDateRange(prev => {
                  const updated = { ...prev, start: startVal };
                  if (updated.end && startVal && new Date(updated.end) < new Date(startVal)) {
                    setDateError(t('modals.competitions.invalidDateRange', 'End date cannot be earlier than start date'));
                  } else {
                    setDateError('');
                  }
                  return updated;
                });
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors scheme-dark cursor-pointer"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">{t('modals.competitions.endDate')}</label>
            <input 
              type="date" 
              value={tempDateRange.end}
              onChange={(e) => {
                const endVal = e.target.value;
                setTempDateRange(prev => {
                  const updated = { ...prev, end: endVal };
                  if (updated.start && endVal && new Date(endVal) < new Date(updated.start)) {
                    setDateError(t('modals.competitions.invalidDateRange', 'End date cannot be earlier than start date'));
                  } else {
                    setDateError('');
                  }
                  return updated;
                });
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors scheme-dark cursor-pointer"
            />
          </div>
        </div>
        {dateError && (
          <p className="text-red-400 text-xs mt-2 font-medium bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
            {dateError}
          </p>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title={t('competitions.deleteModal.title')}
        description={t('competitions.deleteModal.description')}
        confirmLabel={t('common.delete')}
        loading={loading}
        variant="danger"
      >
        {competitionToDelete && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3 mt-4">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
              {competitionToDelete.image ? (
                <img src={competitionToDelete.image} alt={competitionToDelete.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-gray-500 font-medium">IMG</span>
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">{competitionToDelete.name}</p>
              <p className="text-xs text-gray-500">{competitionToDelete.subTitle}</p>
            </div>
          </div>
        )}
      </ConfirmationModal>
    </div>
  );
};

export default CompetitionsList;
