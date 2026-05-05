import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import {
  Search, Calendar, Download, Eye,
  ChevronDown, RefreshCcw, ShoppingBag, Loader2
} from 'lucide-react';
import { fetchOrdersStats } from '@/modules/admin/orders/services/ordersService';
import { usePaginatedData } from '@/modules/admin/shared/hooks/usePaginatedData';
import { toast } from 'react-hot-toast';

const OrdersList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  
  // -- State --
  const [activeStatus, setActiveStatus] = useState('all');
  const [selectedComp, setSelectedComp] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCompDropdownOpen, setIsCompDropdownOpen] = useState(false);
  const compDropdownRef = useRef(null);

  const itemsPerPage = 20;
  const { 
    data: orders, 
    loading, 
    currentPage,
    nextPage,
    prevPage,
    goToPage,
    hasPageCursor,
    setFilters,
    resolveRelation
  } = usePaginatedData({
    collectionName: 'order',
    pageSize: itemsPerPage,
    initialFilters: { status: 'all' },
    relations: [
      { collection: 'user', key: 'user_ref' },
      { collection: 'competition', key: 'competition_id' }
    ]
  });

  const [totalOrders, setTotalOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    loadStats();
    // No need to manually trigger loadMore, fetchPage('first') is handled internally on mount or refresh if we wanted, 
    // actually we need to trigger it if the hook doesn't auto-fetch.
    // Wait, the hook doesn't auto-fetch on mount. Let's trigger goToPage(1).
    goToPage(1);
  }, []);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await fetchOrdersStats();
      setTotalOrders(data.totalOrders || 0);
      setTotalRevenue(data.totalRevenue || 0);
    } catch (error) {
      console.error('Error loading order stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (compDropdownRef.current && !compDropdownRef.current.contains(e.target)) {
        setIsCompDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'paid': return <Badge variant="success">{t('common.paid')}</Badge>;
      case 'pending': return <Badge variant="warning">{t('common.pending')}</Badge>;
      case 'failed': return <Badge variant="danger">{t('common.failed')}</Badge>;
      case 'refunded': return <Badge variant="neutral" className="bg-gray-500/20 text-gray-400 border-gray-500/30">{t('common.refunded')}</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // Extract unique competitions for the dropdown
  const uniqueCompetitions = useMemo(() => {
    const comps = new Set();
    orders.forEach(o => {
      const comp = resolveRelation('competition', o.competition_id);
      if (comp && comp.title) comps.add(comp.title);
    });
    return Array.from(comps);
  }, [orders, resolveRelation]);

  // -- Computed Data --
  const { currentOrders, totalFiltered, totalPages } = useMemo(() => {
    // 1. Filter
    const filtered = orders.filter(o => {
      const comp = resolveRelation('competition', o.competition_id);
      const user = resolveRelation('user', o.user_ref);
      
      const compTitle = comp?.title || '';
      const matchesComp = selectedComp === 'all' || compTitle === selectedComp;

      const search = searchTerm.toLowerCase();
      const orderId = (o.id || '').toLowerCase();
      const userName = (user?.display_name || user?.name || '').toLowerCase();
      const userEmail = (user?.email || '').toLowerCase();
      
      const matchesSearch = orderId.includes(search) || userName.includes(search) || userEmail.includes(search);
      
      return matchesComp && matchesSearch;
    });

    return { 
      currentOrders: filtered, 
      totalFiltered: filtered.length,
      totalPages: Math.ceil(totalOrders / itemsPerPage) || 1
    };
  }, [orders, selectedComp, searchTerm, resolveRelation, totalOrders, itemsPerPage]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('orders.title')}</h1>
          <p className="text-gray-400 mt-1">{t('orders.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Card className="bg-white/[0.02] border-white/5 py-2 px-4 flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-500">No. of orders</p>
              <p className="text-lg font-bold text-white">{totalOrders.toLocaleString()}</p>
            </div>
          </Card>
          <Card className="bg-white/[0.02] border-white/5 py-2 px-4 flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-500">{t('dashboard.kpi.totalRevenue')}</p>
              <p className="text-lg font-bold text-emerald-400">£{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </Card>
          <Button variant="outline" className="flex items-center gap-2 h-[52px]">
            <Download size={16} />
            <span className="text-sm">{t('common.export')}</span>
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">

            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-full lg:w-fit overflow-x-auto hide-scrollbar shrink-0">
              {[
                { key: 'all', label: t('common.all') },
                { key: 'paid', label: t('common.paid') },
                { key: 'pending', label: t('common.pending') },
                { key: 'failed', label: t('common.failed') },
                { key: 'refunded', label: t('common.refunded') }
              ].map((status) => (
                <button
                  key={status.key}
                  onClick={() => { 
                    setActiveStatus(status.key); 
                    setFilters({ status: status.key });
                  }}
                  className={`cursor-pointer px-4 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex-1 lg:flex-none ${activeStatus === status.key
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {status.label}
                </button>
              ))}
            </div>

            {/* Search & Selects */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('orders.searchPlaceholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); }}
                />
              </div>

              <div className="relative flex-1 sm:flex-none sm:w-48" ref={compDropdownRef}>
                <select
                  className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 h-10 pr-8"
                  value={selectedComp}
                  onChange={(e) => { setSelectedComp(e.target.value); }}
                >
                  <option value="all" className="bg-[#121212]">{t('orders.filters.allCompetitions') || 'All Competitions'}</option>
                  {uniqueCompetitions.map((comp, idx) => (
                    <option key={idx} value={comp} className="bg-[#121212]">{comp}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Table Area */}
          <div className="overflow-x-auto min-h-[400px]">
            {loading ? (
              <div className="p-20 flex flex-col items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary mb-3 opacity-80" />
                <p className="text-gray-400 text-sm font-medium">{t('common.loading')}...</p>
              </div>
            ) : currentOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('orders.table.orderId')}</TableHead>
                    <TableHead>{t('orders.table.user')}</TableHead>
                    <TableHead>{t('orders.table.competition')}</TableHead>
                    <TableHead className="text-center">{t('orders.table.tickets')}</TableHead>
                    <TableHead>{t('orders.table.amount')}</TableHead>
                    <TableHead>{t('orders.table.date')}</TableHead>
                    <TableHead>{t('orders.table.status')}</TableHead>
                    <TableHead className="text-right">{t('orders.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-gray-400 text-sm">
                        {`#${order.id.slice(-8).toUpperCase()}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-white">
                            {resolveRelation('user', order.user_ref)?.display_name || resolveRelation('user', order.user_ref)?.name || 'Unknown User'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {resolveRelation('user', order.user_ref)?.email || 'No email'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-white font-medium">
                        {resolveRelation('competition', order.competition_id)?.title || 'Unknown Competition'}
                      </TableCell>
                      <TableCell className="text-center text-gray-300">{order.total_ticket || 0}</TableCell>
                      <TableCell className="font-bold text-emerald-400">£{(order.total_amount || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-gray-400 whitespace-nowrap">{formatDate(order.created_at)}</TableCell>
                      <TableCell>{renderStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/orders/${order.id}`)}
                            className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title={t('orders.tooltips.viewOrder')}
                          >
                            <Eye size={16} />
                          </button>
                          {(order.status || '').toLowerCase() === 'paid' && (
                            <button className="cursor-pointer p-2 hover:bg-gray-500/10 rounded-md text-gray-400 hover:text-white transition-colors" title={t('orders.tooltips.refundOrder')}>
                              <RefreshCcw size={16} />
                            </button>
                          )}
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
                  <ShoppingBag className="text-gray-500" size={32} />
                </div>
                <div>
                  <p className="text-white font-medium text-lg">{t('orders.empty.title')}</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                    {t('orders.empty.desc')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && currentOrders.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {t('common.showing')} Page {currentPage}
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs bg-white/5" 
                  disabled={currentPage === 1} 
                  onClick={prevPage}
                >
                  {t('common.previous')}
                </Button>
                
                <div className="flex gap-1 overflow-x-auto max-w-[200px] hide-scrollbar">
                  {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => goToPage(i + 1)}
                      disabled={i + 1 > currentPage && !hasPageCursor(i + 1)}
                      className={`w-8 h-8 rounded-md text-xs shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                        currentPage === i + 1 ? 'bg-primary text-white' : 'text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  {totalPages > 10 && <span className="text-gray-500 self-center">...</span>}
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs bg-white/5" 
                  disabled={orders.length < itemsPerPage} 
                  onClick={nextPage}
                >
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

export default OrdersList;
