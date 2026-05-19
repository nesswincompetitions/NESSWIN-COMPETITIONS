import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import {
  Trophy, Ticket, PoundSterling, Users,
  CheckCircle, Clock, Plus, Eye, User, ShoppingCart, Loader2
} from 'lucide-react';

import { useAdminDashboardData } from '@/shared/hooks/useAdminData';
import { formatStatus } from '@/shared/utils/formatters';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('admin');
  const { data: stats, loading: loadingStats } = useAdminDashboardData();

  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const kpiData = [
    { title: t('dashboard.kpi.activeCompetitions'), value: stats.activeCompetitions.toLocaleString(), icon: Trophy, color: 'text-primary' },
    { title: t('dashboard.kpi.ticketsSoldToday'), value: stats.ticketsSoldToday.toLocaleString(), icon: Ticket, color: 'text-emerald-400' },
    { title: t('dashboard.kpi.totalRevenue'), value: `€${stats.totalRevenue.toLocaleString()}`, icon: PoundSterling, color: 'text-yellow-400' },
    { title: t('dashboard.kpi.registeredUsers'), value: stats.totalRegisteredUsers.toLocaleString(), icon: Users, color: 'text-blue-400' },
    { title: t('dashboard.kpi.totalWinners'), value: stats.totalWinners.toLocaleString(), icon: CheckCircle, color: 'text-orange-400' },
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

    if (diff <= 0) return 'Draw Soon';

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
        <div className="xl:w-[70%] space-y-6">
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
                        {(() => {
                          const now = new Date();
                          const drawTime = comp.draw_date?.toMillis ? comp.draw_date.toMillis() : (comp.draw_date ? new Date(comp.draw_date).getTime() : null);
                          const isTimeUp = comp.status === 'active' && drawTime && drawTime <= now.getTime();
                          
                          if (isTimeUp) {
                            return <Badge variant="warning" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">Ready to Draw</Badge>;
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
                          ? new Date(comp.draw_date.toMillis()).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : comp.draw_date ? new Date(comp.draw_date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
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
                    <TableCell className="text-primary font-medium truncate max-w-25">#{order.id.slice(-6).toUpperCase()}</TableCell>
                    <TableCell className="text-white">
                      <div 
                        className="flex flex-col cursor-pointer group"
                        onClick={() => order.userId && navigate(`/admin/users/${order.userId}`)}
                        title={t('dashboard.tooltips.viewUser', 'View user profile')}
                      >
                        <span className="group-hover:text-primary transition-colors">{order.userName}</span>
                        <span className="text-[10px] text-gray-500">{order.userEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-37.5 truncate">{order.competitionName}</TableCell>
                    <TableCell>{order.total_ticket}</TableCell>
                    <TableCell className="text-white font-medium">€{order.total_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-gray-400 text-xs">{formatRelativeTime(order.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="xl:w-[30%] space-y-6">
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
                        {(() => {
                          if (draw.status === 'active') {
                            return formatCountdown(draw.draw_date);
                          }
                          if (draw.status === 'ready_to_draw') {
                            return 'Draw Soon';
                          }
                          if (draw.status === 'drawing') {
                            return 'Drawing';
                          }
                          if (draw.status === 'completed' || draw.status === 'end') {
                            return 'Completed';
                          }
                          return draw.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        })()}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                      <Clock size={10} /> 
                      {draw.draw_date?.toDate ? draw.draw_date.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
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
