import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import {
  Trophy, Ticket, PoundSterling, Users,
  CheckCircle, Clock, Plus, Eye, User, ShoppingCart, Loader2
} from 'lucide-react';

import { fetchDashboardStats } from '../../../services/adminService';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('admin');
  const [stats, setStats] = React.useState({
    totalRevenue: 0,
    totalRegisteredUsers: 0,
    ticketsSoldToday: 0,
    activeCompetitions: 0,
    pendingWinners: 0,
    drawsEndingSoon: 0,
    activeCompetitionsList: [],
    upcomingDrawsList: [],
    recentOrdersList: []
  });
  const [loadingStats, setLoadingStats] = React.useState(true);

  React.useEffect(() => {
    const getStats = async () => {
      try {
        const data = await fetchDashboardStats();
        setStats(data);
      } catch (err) {
        console.error("Error fetching dashboard stats:", err);
      } finally {
        setLoadingStats(false);
      }
    };
    getStats();
  }, []);

  const kpiData = [
    { title: t('dashboard.kpi.activeCompetitions'), value: stats.activeCompetitions.toLocaleString(), icon: Trophy, color: 'text-primary' },
    { title: t('dashboard.kpi.ticketsSoldToday'), value: stats.ticketsSoldToday.toLocaleString(), icon: Ticket, color: 'text-emerald-400' },
    { title: t('dashboard.kpi.totalRevenue'), value: `€${stats.totalRevenue.toLocaleString()}`, icon: PoundSterling, color: 'text-yellow-400' },
    { title: t('dashboard.kpi.registeredUsers'), value: stats.totalRegisteredUsers.toLocaleString(), icon: Users, color: 'text-blue-400' },
    { title: t('dashboard.kpi.pendingWinners'), value: stats.pendingWinners.toLocaleString(), icon: CheckCircle, color: 'text-orange-400' },
    { title: t('dashboard.kpi.drawsEndingSoon'), value: stats.drawsEndingSoon.toLocaleString(), icon: Clock, color: 'text-red-400' },
  ];

  const activeCompetitions = stats.activeCompetitionsList || [];

  const recentOrders = stats.recentOrdersList || [];

  const formatRelativeTime = (date) => {
    if (!date) return '—';
    const time = date.toMillis ? date.toMillis() : new Date(date).getTime();
    const diff = new Date().getTime() - time;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} mins ago`;
    if (hrs < 24) return `${hrs} hours ago`;
    return `${days} days ago`;
  };

  const upcomingDraws = stats.upcomingDrawsList || [];

  const formatCountdown = (date) => {
    if (!date) return 'N/A';
    const drawTime = date.toMillis ? date.toMillis() : new Date(date).getTime();
    const now = new Date().getTime();
    const diff = drawTime - now;
    
    if (diff <= 0) return 'Live Soon';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h remaining`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 fade-in">
      <header className="flex flex-col gap-2 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold">{t('dashboard.title')}</h1>
          <p className="text-gray-400 mt-1">{t('dashboard.subtitle')}</p>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiData.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="relative group hover:border-primary/50 transition-colors">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-gray-400 text-sm font-medium leading-tight">{stat.title}</h3>
                  <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                    <Icon size={18} />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">
                    {loadingStats ? (
                      <span className="inline-block w-24 h-8 bg-white/10 rounded-md animate-pulse" />
                    ) : (
                      stat.value
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* LEFT SIDE (70%) */}
        <div className="xl:w-[70%] space-y-6">

          {/* Active Competitions Table */}
          <Card>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('dashboard.activeCompetitions')}</h2>
              <Button variant="outline" size="sm" onClick={() => navigate('/admin/competitions')}>{t('common.viewAll')}</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dashboard.table.name')}</TableHead>
                  <TableHead>{t('dashboard.table.status')}</TableHead>
                  <TableHead>{t('dashboard.table.ticketsSold')}</TableHead>
                  <TableHead>{t('dashboard.table.revenue')}</TableHead>
                  <TableHead>{t('dashboard.table.drawDate')}</TableHead>
                  <TableHead className="text-right">{t('dashboard.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingStats ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-20">
                      <div className="flex flex-col items-center justify-center text-center">
                        <Loader2 size={32} className="animate-spin text-primary mb-3 opacity-80" />
                        <p className="text-gray-400 text-sm font-medium">{t('common.loading')}...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : activeCompetitions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-20 text-center text-gray-500">
                      No active competitions.
                    </TableCell>
                  </TableRow>
                ) : activeCompetitions.map((comp, i) => {
                  const sold = Number(comp.sold_tickets) || 0;
                  const total = Number(comp.total_tickets) || 1;
                  const price = Number(comp.ticket_price) || 0;
                  const revenue = sold * price;

                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-white">{comp.title}</TableCell>
                      <TableCell>
                        <Badge variant="success">
                          {t('common.active')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-400">{sold} / {total}</span>
                          <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full"
                              style={{ width: `${Math.min((sold / total) * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>€{revenue.toLocaleString()}</TableCell>
                      <TableCell>
                        {comp.draw_date?.toMillis
                          ? new Date(comp.draw_date.toMillis()).toLocaleDateString()
                          : comp.draw_date ? new Date(comp.draw_date).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/competitions/${comp.id}`, { state: { fromDashboard: true } })}
                        >
                          <Eye size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Recent Orders Table */}
          <Card>
            <div className="p-6 border-b border-white/10">
              <h2 className="text-lg font-semibold">{t('dashboard.recentOrders')}</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dashboard.table.orderId')}</TableHead>
                  <TableHead>{t('dashboard.table.user')}</TableHead>
                  <TableHead>{t('dashboard.table.competition')}</TableHead>
                  <TableHead>{t('dashboard.table.tickets')}</TableHead>
                  <TableHead>{t('dashboard.table.amount')}</TableHead>
                  <TableHead>{t('dashboard.table.time')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingStats ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-20">
                      <div className="flex flex-col items-center justify-center text-center">
                        <Loader2 size={32} className="animate-spin text-primary mb-3 opacity-80" />
                        <p className="text-gray-400 text-sm font-medium">{t('common.loading')}...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-20 text-center text-gray-500">
                      No recent orders.
                    </TableCell>
                  </TableRow>
                ) : recentOrders.map((order, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-primary font-medium truncate max-w-[100px]">#{order.id.slice(-6).toUpperCase()}</TableCell>
                    <TableCell className="text-white">
                      <div className="flex flex-col">
                        <span>{order.userName}</span>
                        <span className="text-[10px] text-gray-500">{order.userEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{order.competitionName}</TableCell>
                    <TableCell>{order.total_ticket}</TableCell>
                    <TableCell className="text-white font-medium">€{order.total_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-gray-400 text-xs">{formatRelativeTime(order.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

        </div>

        {/* RIGHT SIDE (30%) */}
        <div className="xl:w-[30%] space-y-6">

          {/* Quick Actions */}
          <Card>
            <div className="p-6 border-b border-white/10">
              <h2 className="text-lg font-semibold">{t('dashboard.quickActions')}</h2>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="primary"
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto"
                  onClick={() => navigate('/admin/competitions/create')}
                >
                  <Plus size={20} />
                  <span>{t('dashboard.createCompetition')}</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto bg-white/5 border-white/10"
                  onClick={() => navigate('/admin/winners')}
                >
                  <Trophy size={20} className="text-yellow-400" />
                  <span>{t('dashboard.selectWinner')}</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto bg-white/5 border-white/10"
                  onClick={() => navigate('/admin/users')}
                >
                  <User size={20} className="text-blue-400" />
                  <span>{t('dashboard.viewUsers')}</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto bg-white/5 border-white/10"
                  onClick={() => navigate('/admin/orders')}
                >
                  <ShoppingCart size={20} className="text-emerald-400" />
                  <span>{t('dashboard.viewOrders')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Draws */}
          <Card>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('dashboard.upcomingDraws')}</h2>
              <Badge variant="hot">Live</Badge>
            </div>
            <div className="p-2">
              {loadingStats ? (
                <div className="p-8 text-center">
                  <Loader2 size={24} className="animate-spin text-primary mx-auto opacity-50" />
                </div>
              ) : upcomingDraws.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No upcoming draws.
                </div>
              ) : upcomingDraws.map((draw, i) => (
                <div key={i} className="p-4 hover:bg-white/5 rounded-xl transition-colors border-b border-white/5 last:border-0 flex flex-col gap-3">
                  <div>
                    <h4 className="font-medium text-white">{draw.title}</h4>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-gray-400">
                        {(Number(draw.total_tickets) || 0) - (Number(draw.sold_tickets) || 0)} {t('dashboard.ticketsLeft')}
                      </span>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {formatCountdown(draw.draw_date)}
                      </span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs py-1.5"
                    onClick={() => navigate(`/admin/competitions/${draw.id}`, { state: { fromDashboard: true } })}
                  >
                    {t('common.viewDetails')}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
