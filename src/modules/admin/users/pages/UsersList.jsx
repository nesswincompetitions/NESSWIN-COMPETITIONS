import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import SearchInput from '@/shared/components/ui/SearchInput';
import {
  Calendar, Download, Eye,
  ChevronDown, Users as UsersIcon, Loader2, CheckCircle2,
  Ban
} from 'lucide-react';
import { fetchUsersList, updateUserStatus } from '@/modules/admin/users/services/usersService';
import { useAdminQuery } from '@/modules/admin/shared/hooks/useAdminQuery';
import { exportToCSV } from '@/shared/utils/csvExport';
import { toast } from 'react-hot-toast';
import Modal from '@/shared/components/ui/Modal';

const UsersList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  
  // -- State --
  const [activeStatus, setActiveStatus] = useState('All');
  const [sortBy, setSortBy] = useState('Newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const { data: usersData, setData: setUsers, loading, invalidate } = useAdminQuery('users_list', fetchUsersList);
  const users = usersData || [];

  // -- Suspend Modal State --
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [userToToggle, setUserToToggle] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const itemsPerPage = 20;

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleExportCSV = () => {
    if (!users.length) return;
    
    const headers = [
      { label: 'Name', key: 'display_name' },
      { label: 'Email', key: 'email' },
      { label: 'Registered At', key: 'created_time' },
      { label: 'Total Spend (£)', key: 'total_spent' },
      { label: 'Tickets Bought', key: 'total_tickets_bought' },
      { label: 'Active', key: 'is_active' }
    ];

    const exportData = users.map(u => ({
      ...u,
      display_name: u.display_name || u.name || 'N/A',
      created_time: u.created_time?.toMillis ? new Date(u.created_time.toMillis()).toISOString() : 'N/A',
      is_active: u.is_active !== false ? 'Yes' : 'No'
    }));

    exportToCSV(exportData, headers, `users_export_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Users list exported to CSV');
  };

  const handleSuspendClick = (user) => {
    setUserToToggle(user);
    setSuspendModalOpen(true);
  };

  const confirmStatusToggle = async () => {
    if (!userToToggle) return;
    setIsUpdating(true);
    const newStatus = userToToggle.is_active === false;
    try {
      await updateUserStatus(userToToggle.id, newStatus);
      toast.success(`User ${newStatus ? 'unsuspended' : 'suspended'} successfully`);
      
      // Optimistically update UI
      setUsers(prev => prev.map(u => u.id === userToToggle.id ? { ...u, is_active: newStatus } : u));
      
      invalidate();
      setSuspendModalOpen(false);
    } catch (error) {
      console.error('Error updating user status:', error);
      toast.error('Failed to update user status');
    } finally {
      setIsUpdating(false);
      setUserToToggle(null);
    }
  };

  const renderStatusBadge = (isActive) => {
    return isActive !== false
      ? <Badge variant="success">{t('common.active')}</Badge>
      : <Badge variant="danger">{t('common.inactive')}</Badge>;
  };

  // -- Computed Data --
  const { currentUsers, totalPages, totalFiltered } = useMemo(() => {
    // 1. Filter
    const filtered = users.filter(u => {
      const isActiveUser = u.is_active !== false;
      const matchesStatus = activeStatus === 'All' 
        || (activeStatus === 'ACTIVE' && isActiveUser)
        || (activeStatus === 'INACTIVE' && !isActiveUser);
      
      const search = searchTerm.toLowerCase();
      const nameMatch = (u.display_name || u.name || '').toLowerCase().includes(search);
      const emailMatch = (u.email || '').toLowerCase().includes(search);
      
      return matchesStatus && (nameMatch || emailMatch);
    });

    // 2. Sort
    filtered.sort((a, b) => {
      if (sortBy === 'Newest') {
        const tA = (a.created_time || a.created_at)?.toMillis ? (a.created_time || a.created_at).toMillis() : 0;
        const tB = (b.created_time || b.created_at)?.toMillis ? (b.created_time || b.created_at).toMillis() : 0;
        return tB - tA;
      }
      if (sortBy === 'Spend') return (b.total_spent || 0) - (a.total_spent || 0);
      if (sortBy === 'Tickets') return (b.total_tickets_bought || 0) - (a.total_tickets_bought || 0);
      return 0;
    });

    // 3. Paginate
    const start = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);
    const pages = Math.ceil(filtered.length / itemsPerPage) || 1;

    return { 
      currentUsers: paginated, 
      totalPages: pages, 
      totalFiltered: filtered.length 
    };
  }, [users, activeStatus, sortBy, searchTerm, currentPage]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('users.title')}</h1>
          <p className="text-gray-400 mt-1">{t('users.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={handleExportCSV}
            disabled={!users.length}
          >
            <Download size={16} />
            {t('common.exportCsv')}
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex bg-white/5 p-1 rounded-lg overflow-x-auto hide-scrollbar">
              {['All', 'ACTIVE', 'INACTIVE'].map((key) => (
                <button
                  key={key}
                  onClick={() => { setActiveStatus(key); setCurrentPage(1); }}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex-1 ${
                    activeStatus === key ? 'bg-white/10 text-white font-medium' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {key === 'All' ? t('common.all') : t(`common.${key.toLowerCase()}`)}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <SearchInput
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder={t('users.searchPlaceholder')}
                className="flex-1 sm:w-64"
              />

              <select
                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none h-10"
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
              >
                <option value="Newest" className="bg-[#121212]">{t('common.newest')}</option>
                <option value="Spend" className="bg-[#121212]">{t('common.highestSpend')}</option>
                <option value="Tickets" className="bg-[#121212]">{t('common.mostTickets')}</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            {loading ? (
              <div className="p-20 flex flex-col items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary mb-3 opacity-80" />
                <p className="text-gray-400 text-sm font-medium">{t('common.loading')}...</p>
              </div>
            ) : currentUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{t('users.table.userDetails')}</TableHead>
                    <TableHead>{t('users.table.regDate')}</TableHead>
                    <TableHead className="text-center">{t('users.table.comps')}</TableHead>
                    <TableHead>{t('users.table.totalSpend')}</TableHead>
                    <TableHead className="text-center">{t('users.table.referrals')}</TableHead>
                    <TableHead className="text-center">{t('users.table.bonus')}</TableHead>
                    <TableHead>{t('users.table.status')}</TableHead>
                    <TableHead className="text-right">{t('users.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentUsers.map((user, idx) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-gray-500 text-xs">{(currentPage - 1) * itemsPerPage + idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {(user.display_name || user.name || '?').charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-white text-sm">{user.display_name || user.name}</p>
                            <p className="text-[10px] text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">{formatDate(user.created_time || user.created_at)}</TableCell>
                      <TableCell className="text-center text-white">{user.compsEntered || 0}</TableCell>
                      <TableCell className="font-bold text-emerald-400">£{(user.total_spent || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center text-gray-400">{user.referral_count || 0}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="hot" className="px-2 py-0.5 min-w-[2rem]">{user.free_tickets || 0}</Badge>
                      </TableCell>
                      <TableCell>{renderStatusBadge(user.is_active)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => navigate(`/admin/users/${user.id}`)} className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white" title="View Profile">
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => handleSuspendClick(user)} 
                            className={`p-2 rounded-md transition-colors ${user.is_active === false ? 'hover:bg-emerald-500/10 text-emerald-500' : 'hover:bg-red-500/10 text-gray-400 hover:text-red-500'}`} 
                            title={user.is_active === false ? "Unsuspend User" : "Suspend User"}
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center text-gray-500 italic">No users found</div>
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

      {/* Suspend Confirmation Modal */}
      <Modal
        isOpen={suspendModalOpen}
        onClose={() => !isUpdating && setSuspendModalOpen(false)}
        title={userToToggle?.is_active === false ? "Unsuspend User?" : "Suspend User?"}
        description={`Are you sure you want to ${userToToggle?.is_active === false ? 'unsuspend' : 'suspend'} ${userToToggle?.display_name || userToToggle?.name || 'this user'}?`}
        actions={
          <>
            <button 
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              onClick={() => setSuspendModalOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </button>
            <Button 
              className={`${userToToggle?.is_active === false ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} text-white border-none`}
              onClick={confirmStatusToggle}
              loading={isUpdating}
            >
              Confirm {userToToggle?.is_active === false ? 'Unsuspend' : 'Suspend'}
            </Button>
          </>
        }
      />
    </div>
  );
};

export default UsersList;
