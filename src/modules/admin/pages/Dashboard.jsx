import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { 
  Trophy, Ticket, PoundSterling, Users, 
  CheckCircle, Clock, Plus, Eye, User, ShoppingCart 
} from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  const kpiData = [
    { title: t('dashboard.kpi.activeCompetitions'), value: '12', icon: Trophy, color: 'text-primary' },
    { title: t('dashboard.kpi.ticketsSoldToday'), value: '320', icon: Ticket, color: 'text-emerald-400' },
    { title: t('dashboard.kpi.totalRevenue'), value: '£12,400', icon: PoundSterling, color: 'text-yellow-400' },
    { title: t('dashboard.kpi.registeredUsers'), value: '5,400', icon: Users, color: 'text-blue-400' },
    { title: t('dashboard.kpi.pendingWinners'), value: '3', icon: CheckCircle, color: 'text-orange-400' },
    { title: t('dashboard.kpi.drawsEndingSoon'), value: '5', icon: Clock, color: 'text-red-400' },
  ];

  const activeCompetitions = [
    { id: '1', name: t('competitionNames.rangeRover'), status: 'Active', sold: 340, total: 500, revenue: '£3,400', drawDate: '2024-05-01' },
    { id: '2', name: t('competitionNames.rolex'), status: 'Active', sold: 450, total: 1000, revenue: '£9,000', drawDate: '2024-05-05' },
    { id: '3', name: t('competitionNames.cashPrize'), status: 'Ending Soon', sold: 1800, total: 2000, revenue: '£9,000', drawDate: '2024-04-25' },
    { id: '4', name: t('competitionNames.gamingPC'), status: 'Active', sold: 85, total: 200, revenue: '£425', drawDate: '2024-05-10' },
    { id: '5', name: t('competitionNames.maldives'), status: 'Active', sold: 600, total: 1000, revenue: '£12,000', drawDate: '2024-06-01' },
  ];

  const recentOrders = [
    { id: '#ORD-001', user: 'John Doe', competition: t('competitionNames.rangeRover'), tickets: 5, amount: '£50', time: '10 mins ago' },
    { id: '#ORD-002', user: 'Jane Smith', competition: t('competitionNames.rolex'), tickets: 2, amount: '£40', time: '25 mins ago' },
    { id: '#ORD-003', user: 'Mike Johnson', competition: t('competitionNames.cashPrize'), tickets: 10, amount: '£50', time: '1 hour ago' },
    { id: '#ORD-004', user: 'Sarah Wilson', competition: t('competitionNames.gamingPC'), tickets: 1, amount: '£5', time: '2 hours ago' },
    { id: '#ORD-005', user: 'Tom Brown', competition: t('competitionNames.rangeRover'), tickets: 3, amount: '£30', time: '3 hours ago' },
  ];

  const upcomingDraws = [
    { id: '3', name: t('competitionNames.cashPrize'), countdown: '2d 4h 30m', remaining: 200 },
    { id: '2', name: t('competitionNames.rolex'), countdown: '5d 12h 15m', remaining: 550 },
    { id: '1', name: t('competitionNames.rangeRover'), countdown: '8d 6h 45m', remaining: 160 },
  ];

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
                  <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
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
                {activeCompetitions.map((comp, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-white">{comp.name}</TableCell>
                    <TableCell>
                      <Badge variant={comp.status === 'Active' ? 'success' : 'warning'}>
                        {comp.status === 'Active' ? t('common.active') : 
                         comp.status === 'Ending Soon' ? t('common.endingSoon') : t('common.pending')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-400">{comp.sold} / {comp.total}</span>
                        <div className="w-full bg-white/10 rounded-full h-1.5">
                          <div 
                            className="bg-primary h-1.5 rounded-full" 
                            style={{ width: `${(comp.sold / comp.total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{comp.revenue}</TableCell>
                    <TableCell>{new Date(comp.drawDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          className="cursor-pointer p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                          onClick={() => navigate(`/admin/competitions/${comp.id}`)}
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
                {recentOrders.map((order, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-primary font-medium">{order.id}</TableCell>
                    <TableCell className="text-white">{order.user}</TableCell>
                    <TableCell>{order.competition}</TableCell>
                    <TableCell>{order.tickets}</TableCell>
                    <TableCell className="text-white font-medium">{order.amount}</TableCell>
                    <TableCell className="text-gray-400">{order.time}</TableCell>
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
              {upcomingDraws.map((draw, i) => (
                <div key={i} className="p-4 hover:bg-white/5 rounded-xl transition-colors border-b border-white/5 last:border-0 flex flex-col gap-3">
                  <div>
                    <h4 className="font-medium text-white">{draw.name}</h4>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-gray-400">{draw.remaining} {t('dashboard.ticketsLeft')}</span>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{draw.countdown}</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs py-1.5"
                    onClick={() => navigate(`/admin/competitions/${draw.id}`)}
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
