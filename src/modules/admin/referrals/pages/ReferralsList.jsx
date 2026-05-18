import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import SearchInput from '@/shared/components/ui/SearchInput';
import {
  Calendar, Download, Eye, ChevronDown, Users as UsersIcon, Loader2, Award, UserCheck
} from 'lucide-react';
import { useAdminReferralsFeed } from '@/shared/hooks/useAdminData';
import { exportToCSV } from '@/shared/utils/csvExport';
import { toast } from 'react-hot-toast';

const ReferralsList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  
  const [sortBy, setSortBy] = useState('mostReferrals');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const { data: referrals, loading } = useAdminReferralsFeed();
  const data = useMemo(() => {
    return {
      referrals: referrals || [],
      stats: {
        totalReferrals: (referrals || []).reduce((sum, r) => sum + Number(r.referral_count || 0), 0),
        totalRewards: (referrals || []).reduce((sum, r) => sum + Number(r.total_free_tickets || 0), 0),
      },
    };
  }, [referrals]);

  const itemsPerPage = 20;

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const { currentReferrals, totalPages, totalFiltered } = useMemo(() => {
    const filtered = data.referrals.filter(u => {
      const search = searchTerm.toLowerCase();
      const nameMatch = (u.display_name || u.name || '').toLowerCase().includes(search);
      const emailMatch = (u.email || '').toLowerCase().includes(search);
      const codeMatch = (u.referral_code || '').toLowerCase().includes(search);
      
      return nameMatch || emailMatch || codeMatch;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'mostReferrals') return (b.referral_count || 0) - (a.referral_count || 0);
      if (sortBy === 'newest') {
        const tA = (a.created_time || a.created_at)?.toMillis ? (a.created_time || a.created_at).toMillis() : 0;
        const tB = (b.created_time || b.created_at)?.toMillis ? (b.created_time || b.created_at).toMillis() : 0;
        return tB - tA;
      }
      return 0;
    });

    const start = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);
    const pages = Math.ceil(filtered.length / itemsPerPage) || 1;

    return { 
      currentReferrals: paginated, 
      totalPages: pages, 
      totalFiltered: filtered.length 
    };
  }, [data.referrals, sortBy, searchTerm, currentPage]);

  const handleExportCSV = () => {
    if (!data.referrals.length) return;
    
    const headers = [
      { label: 'Name', key: 'display_name' },
      { label: 'Email', key: 'email' },
      { label: 'Referral Code', key: 'referral_code' },
      { label: 'Referral Count', key: 'referral_count' },
      { label: 'Total Rewards', key: 'total_free_tickets' },
      { label: 'Joined At', key: 'created_time' }
    ];

    const exportData = data.referrals.map(r => ({
      ...r,
      display_name: r.display_name || r.name || 'N/A',
      created_time: (r.created_time || r.created_at)?.toMillis ? new Date((r.created_time || r.created_at).toMillis()).toISOString() : 'N/A'
    }));

    exportToCSV(exportData, headers, `referrals_export_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Referrals list exported to CSV');
  };

  const { stats } = data;

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      <header className="flex flex-col gap-6 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('referrals.title')}</h1>
          <p className="text-gray-400 mt-1">{t('referrals.subtitle')}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Card className="bg-white/2 border-white/5 py-2 px-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <UserCheck size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Total Referrals</p>
              <p className="text-lg font-bold text-white">{stats.totalReferrals || 0}</p>
            </div>
          </Card>
          <Card className="bg-white/2 border-white/5 py-2 px-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Award size={16} className="text-yellow-500" />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Rewards Issued</p>
              <p className="text-lg font-bold text-yellow-500">{stats.totalRewards || 0}</p>
            </div>
          </Card>
          <Button 
            variant="outline" 
            className="flex items-center gap-2 h-13"
            onClick={handleExportCSV}
            disabled={!data.referrals.length}
          >
            <Download size={16} />
            {t('common.exportCsv')}
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <SearchInput
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder={t('referrals.searchPlaceholder')}
              className="w-full lg:w-80"
            />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 sm:flex-none sm:w-48">
                <select
                  className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 h-10 pr-8"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                >
                  <option value="mostReferrals" className="bg-[#121212]">{t('referrals.sort.mostReferrals')}</option>
                  <option value="newest" className="bg-[#121212]">{t('referrals.sort.newest')}</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-20 flex flex-col items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary mb-3 opacity-80" />
                <p className="text-gray-400 text-sm font-medium">{t('common.loading')}...</p>
              </div>
            ) : currentReferrals.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{t('referrals.table.referrer')}</TableHead>
                    <TableHead>{t('referrals.table.referralCode')}</TableHead>
                    <TableHead className="text-center">{t('referrals.table.referredUsers')}</TableHead>
                    <TableHead className="text-center">{t('referrals.table.rewardsEarned')}</TableHead>
                    <TableHead>{t('referrals.table.date')}</TableHead>
                    <TableHead className="text-right">{t('referrals.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentReferrals.map((user, index) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-gray-500 font-medium">{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold overflow-hidden text-xs">
                            {user.photo_url ? (
                              <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (user.display_name || user.name || '?').charAt(0)
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-white truncate max-w-[180px]" title={user.display_name || user.name}>
                              {user.display_name || user.name}
                            </span>
                            <span className="text-xs text-gray-500 truncate max-w-[180px]" title={user.email}>
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 text-white font-mono text-sm rounded-md shadow-sm">
                          {user.referral_code || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-gray-300 font-medium">
                        {user.referral_count || 0} <span className="text-[10px] text-gray-500 uppercase ml-1">Users</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full text-sm border border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                          {user.total_free_tickets || 0} <span className="text-[10px] opacity-70 ml-1">Tickets</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">{formatDate(user.created_time || user.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                          className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors inline-flex items-center"
                          title={t('common.viewDetails')}
                        >
                          <Eye size={16} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <UsersIcon className="text-gray-500" size={32} />
                </div>
                <div>
                  <p className="text-white font-medium text-lg">{t('referrals.empty.title')}</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                    {t('referrals.empty.desc')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!loading && totalFiltered > itemsPerPage && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1}-
                {Math.min(currentPage * itemsPerPage, totalFiltered)} {t('common.of')} {totalFiltered}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs bg-white/5" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  {t('common.previous')}
                </Button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`w-8 h-8 rounded-md text-xs transition-colors ${currentPage === i + 1 ? 'bg-primary text-white' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs bg-white/5" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
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

export default ReferralsList;
