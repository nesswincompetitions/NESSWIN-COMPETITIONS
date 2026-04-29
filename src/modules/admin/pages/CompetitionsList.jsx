import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import {
  Plus, Search, Calendar, Download,
  Eye, Edit, Trash2, ChevronLeft, ChevronRight, FileEdit, Loader2
} from 'lucide-react';
import { collection, query, getDocs, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../utils/firebase';
import { toast } from 'react-hot-toast';

const CompetitionsList = () => {
  const [activeTab, setActiveTab] = useState('All');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [competitionToDelete, setCompetitionToDelete] = useState(null);
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  const tabs = [
    { key: 'All', label: t('common.all') },
    { key: 'Active', label: t('common.active') },
    { key: 'Ended', label: t('common.ended') },
    { key: 'Archived', label: t('common.archived') },
  ];

  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCompetitions = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'competition'), orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        const sold = data.sold_tickets || 0;
        const total = data.total_tickets || 1000;
        const price = data.ticket_price || 0;
        const revenue = sold * price;
        const drawDate = data.draw_date ? data.draw_date.toDate().toLocaleDateString() : '—';
        
        return {
          id: doc.id,
          name: data.title || 'Untitled',
          subTitle: data.sub_title || '',
          status: data.status || 'draft',
          price: `£${price}`,
          sold,
          total,
          revenue: `£${revenue.toLocaleString()}`,
          drawDate,
          image: data.image?.[0] || null
        };
      });
      setCompetitions(list);
    } catch (err) {
      console.error('Error fetching competitions:', err);
      toast.error('Failed to load competitions');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchCompetitions();
  }, []);

  const handleDelete = async () => {
    if (!competitionToDelete) return;
    try {
      await deleteDoc(doc(db, 'competition', competitionToDelete.id));
      toast.success('Competition deleted successfully');
      setCompetitions(prev => prev.filter(c => c.id !== competitionToDelete.id));
      setDeleteModalOpen(false);
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Failed to delete competition');
    }
  };

  const filteredCompetitions = activeTab === 'All'
    ? competitions
    : competitions.filter(c => {
        if (activeTab === 'Active') return c.status === 'active';
        if (activeTab === 'Ended') return c.status === 'end';
        if (activeTab === 'Archived') return c.status === 'cancelled' || c.status === 'paused';
        return true;
      });

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
                  onClick={() => setActiveTab(tab.key)}
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
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('competitions.searchPlaceholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 flex-1 sm:flex-none justify-center">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-sm">{t('common.filterDates')}</span>
                </Button>

                <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 flex-1 sm:flex-none justify-center">
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
                    No competitions found.
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
                    <Badge variant={
                      comp.status === 'active' ? 'success' :
                        comp.status === 'end' ? 'neutral' : 'warning'
                    }>
                      {comp.status === 'active' ? t('common.active') :
                        comp.status === 'end' ? t('common.ended') :
                          comp.status === 'draft' ? 'Draft' : comp.status}
                    </Badge>
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
                  <TableCell>{comp.drawDate}</TableCell>
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
          <div className="p-4 border-t border-white/10 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {t('common.showing')} <span className="font-medium text-white">1</span>-<span className="font-medium text-white">5</span> {t('common.of')} <span className="font-medium text-white">12</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10" disabled>
                <ChevronLeft size={14} className="mr-1" />
                {t('common.previous')}
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10">
                {t('common.next')}
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t('competitions.deleteModal.title')}
        description={t('competitions.deleteModal.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" className="bg-red-500 border-red-500 hover:bg-red-600 text-white" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {competitionToDelete && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
              {competitionToDelete.image ? (
                <img src={competitionToDelete.image} alt={competitionToDelete.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-gray-500 font-medium">IMG</span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{competitionToDelete.name}</p>
              <p className="text-xs text-gray-500">{competitionToDelete.subTitle}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CompetitionsList;
