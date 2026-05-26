import React, { useState, useMemo } from 'react';
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
  Ban, UserCheck, UserX, RefreshCcw
} from 'lucide-react';
import { updateUserStatus } from '@/modules/admin/users/services/usersService';
import { useAdminUsersFeedPaginated } from '@/shared/hooks/useAdminData';
import { exportToCSV } from '@/shared/utils/csvExport';
import { toast } from 'react-hot-toast';
import ConfirmationModal from '@/shared/components/ui/ConfirmationModal';

const UsersList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  
  const [activeStatus, setActiveStatus] = useState('All');
  const [sortBy, setSortBy] = useState('Newest');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { 
    data: usersData, 
    loading,
    currentPage,
    totalPages,
    nextPage,
    prevPage,
    totalCount,
    goToPage,
    refresh,
    setItems
  } = useAdminUsersFeedPaginated(sortBy, 20);
  const users = useMemo(() => usersData || [], [usersData]);

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

    // Optimistic UI Update: update the local state immediately
    setItems(prevItems => prevItems.map(user => 
      user.id === userToToggle.id ? { ...user, is_active: newStatus } : user
    ));

    try {
      await updateUserStatus(userToToggle.id, newStatus);
      toast.success(`User ${newStatus ? 'activated' : 'suspended'} successfully`);
      setSuspendModalOpen(false);
    } catch (error) {
      console.error('Error updating user status:', error);
      toast.error('Failed to update user status');
      // Revert optimistic update on failure
      setItems(prevItems => prevItems.map(user => 
        user.id === userToToggle.id ? { ...user, is_active: !newStatus } : user
      ));
    } finally {
      setIsUpdating(false);
      setUserToToggle(null);
    }
  };

  const renderStatusBadge = (user) => {
    if (user.is_active === false) {
      return <Badge variant="danger">{t('common.suspended')}</Badge>;
    }
    return <Badge variant="success">{t('common.active')}</Badge>;
  };

  const {
    currentUsers,
    totalFiltered,
  } = useMemo(() => {
    const filtered = users.filter((u) => {
      if (u.is_deleted === true) return false;
      if (u.role === 'admin') return false;

      const isActiveUser = u.is_active !== false;
      const matchesStatus = activeStatus === 'All'
        || (activeStatus === 'ACTIVE' && isActiveUser)
        || (activeStatus === 'SUSPENDED' && !isActiveUser);

      const search = searchTerm.toLowerCase();
      const nameMatch = (u.display_name || u.name || '').toLowerCase().includes(search);
      const emailMatch = (u.email || '').toLowerCase().includes(search);
      const phoneMatch = (u.phone_number || '').toLowerCase().replace(/\s/g, '').includes(search.replace(/\s/g, ''));

      return matchesStatus && (nameMatch || emailMatch || phoneMatch);
    });

    return {
      currentUsers: filtered,
      totalFiltered: filtered.length,
    };
  }, [users, activeStatus, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('users.title')}</h1>
          <p className="text-gray-400 mt-1">{t('users.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="flex items-center gap-2 h-11 px-4" onClick={handleExportCSV} disabled={!users.length}>
            <Download size={16} />
            <span className="text-sm hidden sm:inline">{t('common.exportCsv')}</span>
          </Button>
          <button
            onClick={refresh}
            title="Refresh Data"
            className="w-11 h-11 flex items-center justify-center rounded-md border border-white/10 bg-transparent hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-all duration-300 shrink-0 group"
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
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex bg-white/5 p-1 rounded-lg overflow-x-auto hide-scrollbar">
              {['All', 'ACTIVE', 'SUSPENDED'].map((key) => (
                <button
                  key={key}
                  onClick={() => { setActiveStatus(key); goToPage(1); }}
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
                onChange={(e) => { setSearchTerm(e.target.value); goToPage(1); }}
                placeholder={t('users.searchPlaceholder')}
                className="flex-1 sm:w-64"
              />

              <div className="relative w-48">
                <button
                  type="button"
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  className="w-full flex items-center justify-between bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all rounded-lg px-4 py-2 text-sm text-white h-10 cursor-pointer focus:outline-none"
                >
                  <span>
                    {sortBy === 'Newest' ? t('common.newest') : t('common.highestSpend')}
                  </span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
                </button>

                {isSortOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsSortOpen(false)}
                    />
                    <div className="absolute right-0 mt-1.5 w-full bg-[#161616]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-1.5 z-20 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                      {[
                        { value: 'Newest', label: t('common.newest') },
                        { value: 'Spend', label: t('common.highestSpend') }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSortBy(option.value);
                            goToPage(1);
                            setIsSortOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between ${
                            sortBy === option.value ? 'text-primary font-medium bg-primary/5' : 'text-gray-300 hover:text-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                        <div 
                          className="flex items-center gap-3 cursor-pointer group"
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                          title="View user profile"
                        >
                          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold overflow-hidden group-hover:ring-2 group-hover:ring-primary/50 transition-all">
                            {user.photo_url || user.profile_image ? (
                              <img src={user.photo_url || user.profile_image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              (user.display_name || user.name || '?').charAt(0)
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <p className="font-medium text-white group-hover:text-primary transition-colors text-sm truncate max-w-[180px]" title={user.display_name || user.name}>
                              {user.display_name || user.name}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate max-w-[180px]" title={user.email}>
                              {user.email}
                            </p>
                            {user.phone_number && (
                              <p className="text-[10px] text-gray-500 truncate max-w-[180px]" title={user.phone_number}>
                                {user.phone_number}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">{formatDate(user.created_time || user.created_at)}</TableCell>
                      <TableCell className="text-center text-white">{user.compsEntered || 0}</TableCell>
                      <TableCell className="font-bold text-emerald-400">£{(user.total_spent || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center text-gray-400">{user.referral_count || 0}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="hot" className="px-2 py-0.5 min-w-8">{user.free_tickets || 0}</Badge>
                      </TableCell>
                      <TableCell>{renderStatusBadge(user)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => navigate(`/admin/users/${user.id}`)} className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white" title="View Profile">
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => handleSuspendClick(user)} 
                            className={`p-2 rounded-md transition-colors ${user.is_active === false ? 'hover:bg-emerald-500/10 text-emerald-500' : 'hover:bg-red-500/10 text-gray-400 hover:text-red-500'}`} 
                            title={user.is_active === false ? "Make Active" : "Suspend User"}
                          >
                            {user.is_active === false ? <UserCheck size={16} /> : <UserX size={16} />}
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

          {!loading && currentUsers.length > 0 && (
            <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-gray-400">
                {t('common.showing')} <span className="font-medium text-white">{currentUsers.length}</span> {t('common.of')} <span className="font-medium text-white">{totalCount || currentUsers.length}</span> {t('sidebar.users').toLowerCase()}
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs bg-white/5" 
                  disabled={currentPage <= 1 || loading} 
                  onClick={prevPage}
                >
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
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={suspendModalOpen}
        onClose={() => !isUpdating && setSuspendModalOpen(false)}
        onConfirm={confirmStatusToggle}
        title={userToToggle?.is_active === false ? t('modals.users.activateTitle') : t('modals.users.suspendTitle')}
        description={userToToggle?.is_active === false 
          ? t('modals.users.activateDesc', { name: userToToggle?.display_name || userToToggle?.name || 'User' }) 
          : t('modals.users.suspendDesc', { name: userToToggle?.display_name || userToToggle?.name || 'User' })
        }
        confirmLabel={userToToggle?.is_active === false ? t('modals.users.activateBtn') : t('modals.users.suspendBtn')}
        variant={userToToggle?.is_active === false ? 'primary' : 'danger'}
        loading={isUpdating}
        icon={userToToggle?.is_active === false ? UserCheck : UserX}
      />
    </div>
  );
};

export default UsersList;
