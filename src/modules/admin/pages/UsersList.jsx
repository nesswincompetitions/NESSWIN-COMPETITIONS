import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import {
  Search, Calendar, Download, Eye, AlertTriangle,
  Ban, ChevronDown, Users as UsersIcon
} from 'lucide-react';

const UsersList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const [activeStatus, setActiveStatus] = useState('All');
  const [sortBy, setSortBy] = useState('Newest');

  const users = [
    { id: 1, name: "John Doe", email: "john@example.com", phone: "+44 7700 900123", regDate: "10 Jan 2026", compsEntered: 12, totalSpend: 450.00, referrals: 3, bonusTickets: 5, status: "Active" },
    { id: 2, name: "Sarah Smith", email: "sarah@example.com", phone: "+44 7700 900456", regDate: "15 Feb 2026", compsEntered: 4, totalSpend: 120.50, referrals: 0, bonusTickets: 1, status: "Active" },
    { id: 3, name: "Mike Johnson", email: "mike@example.com", phone: "+44 7700 900789", regDate: "01 Mar 2026", compsEntered: 45, totalSpend: 2100.00, referrals: 12, bonusTickets: 20, status: "Active" },
    { id: 4, name: "Emma Wilson", email: "emma@example.com", phone: "+44 7700 900321", regDate: "20 Mar 2026", compsEntered: 2, totalSpend: 15.00, referrals: 0, bonusTickets: 0, status: "Suspended" },
    { id: 5, name: "Tom Brown", email: "tom@example.com", phone: "+44 7700 900654", regDate: "05 Apr 2026", compsEntered: 0, totalSpend: 0.00, referrals: 0, bonusTickets: 0, status: "Banned" },
  ];

  const statusTabs = [
    { key: 'All', label: t('common.all') },
    { key: 'Active', label: t('common.active') },
    { key: 'Suspended', label: t('common.suspended') },
    { key: 'Banned', label: t('common.banned') },
  ];

  const filteredUsers = activeStatus === 'All'
    ? users
    : users.filter(u => u.status === activeStatus);

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Active': return <Badge variant="success">{t('common.active')}</Badge>;
      case 'Suspended': return <Badge variant="warning">{t('common.suspended')}</Badge>;
      case 'Banned': return <Badge variant="danger" className="bg-red-500/20 text-red-500 border-red-500/30">{t('common.banned')}</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('users.title')}</h1>
          <p className="text-gray-400 mt-1">{t('users.subtitle')}</p>
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
              {statusTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveStatus(tab.key)}
                  className={`cursor-pointer px-4 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex-1 lg:flex-none ${activeStatus === tab.key
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
                  placeholder={t('users.searchPlaceholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
                />
              </div>

              <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 justify-center">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-sm hidden sm:inline">{t('common.date')}</span>
              </Button>

              <div className="relative flex-1 sm:flex-none sm:w-40">
                <select
                  className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 h-10 pr-8"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="Newest" className="bg-[#121212]">{t('common.newest')}</option>
                  <option value="Oldest" className="bg-[#121212]">{t('common.oldest')}</option>
                  <option value="Spend" className="bg-[#121212]">{t('common.highestSpend')}</option>
                  <option value="Tickets" className="bg-[#121212]">{t('common.mostTickets')}</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Table Area */}
          <div className="overflow-x-auto">
            {filteredUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t('users.table.number')}</TableHead>
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
                  {filteredUsers.map((user, index) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-gray-500 font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-white">{user.name}</p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-500 mt-0.5">
                              <span>{user.email}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400 whitespace-nowrap">{user.regDate}</TableCell>
                      <TableCell className="text-center font-medium text-white">{user.compsEntered}</TableCell>
                      <TableCell className="font-bold text-emerald-400 whitespace-nowrap">£{user.totalSpend.toFixed(2)}</TableCell>
                      <TableCell className="text-center">{user.referrals}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="hot" className="px-2 py-0.5 min-w-[2rem]">{user.bonusTickets}</Badge>
                      </TableCell>
                      <TableCell>{renderStatusBadge(user.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/users/${user.id}`)}
                            className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title={t('users.tooltips.viewProfile')}
                          >
                            <Eye size={16} />
                          </button>
                          <button className="cursor-pointer p-2 hover:bg-yellow-500/10 rounded-md text-gray-400 hover:text-yellow-500 transition-colors" title={t('users.tooltips.suspendUser')}>
                            <AlertTriangle size={16} />
                          </button>
                          <button className="cursor-pointer p-2 hover:bg-red-500/10 rounded-md text-gray-400 hover:text-red-500 transition-colors" title={t('users.tooltips.banUser')}>
                            <Ban size={16} />
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
                  <UsersIcon className="text-gray-500" size={32} />
                </div>
                <div>
                  <p className="text-white font-medium text-lg">{t('users.empty.title')}</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                    {activeStatus === 'All'
                      ? t('users.empty.allDesc')
                      : t('users.empty.filteredDesc', { status: activeStatus })}
                  </p>
                </div>
                {activeStatus !== 'All' && (
                  <Button variant="outline" size="sm" onClick={() => setActiveStatus('All')} className="mt-2">
                    {t('common.clearFilters')}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredUsers.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {t('common.showing')} <span className="font-medium text-white">1</span>-<span className="font-medium text-white">{filteredUsers.length}</span> {t('common.of')} <span className="font-medium text-white">{filteredUsers.length}</span>
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

export default UsersList;
