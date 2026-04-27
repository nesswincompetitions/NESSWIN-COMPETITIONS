import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import {
  Search, Calendar, Download, Eye, ChevronDown, Users as UsersIcon
} from 'lucide-react';

const ReferralsList = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const [sortBy, setSortBy] = useState('mostReferrals');

  // Dummy Referrals Data
  const referrals = [
    {
      id: 1, name: "John Doe", email: "john@example.com",
      code: "JOHN123", referredCount: 12, rewardsEarned: 24,
      dateJoined: "10 May 2026"
    },
    {
      id: 2, name: "Sarah Smith", email: "sarah@example.com",
      code: "SARAH456", referredCount: 8, rewardsEarned: 16,
      dateJoined: "12 May 2026"
    },
    {
      id: 3, name: "Mike Johnson", email: "mike@example.com",
      code: "MIKE789", referredCount: 3, rewardsEarned: 6,
      dateJoined: "15 May 2026"
    },
    {
      id: 4, name: "Emma Wilson", email: "emma@example.com",
      code: "EMMA321", referredCount: 1, rewardsEarned: 2,
      dateJoined: "20 May 2026"
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">{t('referrals.title')}</h1>
          <p className="text-gray-400 mt-1">{t('referrals.subtitle')}</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Download size={16} />
          {t('common.exportCsv')}
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">

            <div className="relative w-full lg:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('referrals.searchPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 justify-center">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-sm hidden sm:inline">{t('common.date')}</span>
              </Button>

              <div className="relative flex-1 sm:flex-none sm:w-48">
                <select
                  className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 h-10 pr-8"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="mostReferrals" className="bg-[#121212]">{t('referrals.sort.mostReferrals')}</option>
                  <option value="newest" className="bg-[#121212]">{t('referrals.sort.newest')}</option>
                  <option value="mostRewards" className="bg-[#121212]">{t('referrals.sort.mostRewards')}</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Table Area */}
          <div className="overflow-x-auto">
            {referrals.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t('users.table.number')}</TableHead>
                    <TableHead>{t('referrals.table.referrer')}</TableHead>
                    <TableHead>{t('referrals.table.referralCode')}</TableHead>
                    <TableHead className="text-center">{t('referrals.table.referredUsers')}</TableHead>
                    <TableHead className="text-center">{t('referrals.table.rewardsEarned')}</TableHead>
                    <TableHead>{t('referrals.table.date')}</TableHead>
                    <TableHead className="text-right">{t('referrals.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((user, index) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-gray-500 font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{user.name}</span>
                          <span className="text-xs text-gray-500">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 text-white font-mono text-sm rounded-md shadow-sm">
                          {user.code}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-gray-300">
                        {user.referredCount} {t('referrals.table.users')}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full text-sm border border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                          {user.rewardsEarned} {t('referrals.table.tickets')}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-400">{user.dateJoined}</TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => navigate(`/admin/referrals/${user.id}`)}
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
              /* Empty State */
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

          {/* Pagination */}
          {referrals.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {t('common.showing')} <span className="font-medium text-white">1</span>-<span className="font-medium text-white">{referrals.length}</span> {t('common.of')} <span className="font-medium text-white">{referrals.length}</span>
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

export default ReferralsList;
