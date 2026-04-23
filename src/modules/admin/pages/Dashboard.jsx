import React from 'react';
import { useNavigate } from 'react-router-dom';
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

  const kpiData = [
    { title: 'Total Active Competitions', value: '12', icon: Trophy, color: 'text-primary' },
    { title: 'Tickets Sold Today', value: '320', icon: Ticket, color: 'text-emerald-400' },
    { title: 'Total Revenue', value: '£12,400', icon: PoundSterling, color: 'text-yellow-400' },
    { title: 'Registered Users', value: '5,400', icon: Users, color: 'text-blue-400' },
    { title: 'Pending Winners', value: '3', icon: CheckCircle, color: 'text-orange-400' },
    { title: 'Draws Ending Soon (7d)', value: '5', icon: Clock, color: 'text-red-400' },
  ];

  const activeCompetitions = [
    { id: '1', name: '2024 Range Rover Sport', status: 'Active', sold: 340, total: 500, revenue: '£3,400', drawDate: '2024-05-01' },
    { id: '2', name: 'Rolex Submariner', status: 'Active', sold: 450, total: 1000, revenue: '£9,000', drawDate: '2024-05-05' },
    { id: '3', name: '£5,000 Cash Prize', status: 'Ending Soon', sold: 1800, total: 2000, revenue: '£9,000', drawDate: '2024-04-25' },
    { id: '4', name: 'Gaming PC Setup', status: 'Active', sold: 85, total: 200, revenue: '£425', drawDate: '2024-05-10' },
    { id: '5', name: 'Trip to Maldives', status: 'Active', sold: 600, total: 1000, revenue: '£12,000', drawDate: '2024-06-01' },
  ];

  const recentOrders = [
    { id: '#ORD-001', user: 'John Doe', competition: '2024 Range Rover', tickets: 5, amount: '£50', time: '10 mins ago' },
    { id: '#ORD-002', user: 'Jane Smith', competition: 'Rolex Submariner', tickets: 2, amount: '£40', time: '25 mins ago' },
    { id: '#ORD-003', user: 'Mike Johnson', competition: '£5,000 Cash Prize', tickets: 10, amount: '£50', time: '1 hour ago' },
    { id: '#ORD-004', user: 'Sarah Wilson', competition: 'Gaming PC Setup', tickets: 1, amount: '£5', time: '2 hours ago' },
    { id: '#ORD-005', user: 'Tom Brown', competition: '2024 Range Rover', tickets: 3, amount: '£30', time: '3 hours ago' },
  ];

  const upcomingDraws = [
    { id: '3', name: '£5,000 Cash Prize', countdown: '2d 4h 30m', remaining: 200 },
    { id: '2', name: 'Rolex Submariner', countdown: '5d 12h 15m', remaining: 550 },
    { id: '1', name: '2024 Range Rover Sport', countdown: '8d 6h 45m', remaining: 160 },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 fade-in">
      <header className="flex flex-col gap-2 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-1">Overview of your platform's performance.</p>
        </div>
      </header>

      {/* KPI Cards (Top Row) */}
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
              <h2 className="text-lg font-semibold">Active Competitions</h2>
              <Button variant="outline" size="sm" onClick={() => navigate('/admin/competitions')}>View All</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tickets Sold</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Draw Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCompetitions.map((comp, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-white">{comp.name}</TableCell>
                    <TableCell>
                      <Badge variant={comp.status === 'Active' ? 'success' : 'warning'}>
                        {comp.status}
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
              <h2 className="text-lg font-semibold">Recent Orders</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Competition</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Time</TableHead>
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
              <h2 className="text-lg font-semibold">Quick Actions</h2>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="primary" 
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto"
                  onClick={() => navigate('/admin/competitions/create')}
                >
                  <Plus size={20} />
                  <span>Create Competition</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto bg-white/5 border-white/10"
                  onClick={() => navigate('/admin/winners')}
                >
                  <Trophy size={20} className="text-yellow-400" />
                  <span>Select Winner</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto bg-white/5 border-white/10"
                  onClick={() => navigate('/admin/users')}
                >
                  <User size={20} className="text-blue-400" />
                  <span>View Users</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full text-sm py-3 px-2 flex flex-col gap-2 h-auto bg-white/5 border-white/10"
                  onClick={() => navigate('/admin/orders')}
                >
                  <ShoppingCart size={20} className="text-emerald-400" />
                  <span>View Orders</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Draws */}
          <Card>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Upcoming Draws</h2>
              <Badge variant="hot">Live</Badge>
            </div>
            <div className="p-2">
              {upcomingDraws.map((draw, i) => (
                <div key={i} className="p-4 hover:bg-white/5 rounded-xl transition-colors border-b border-white/5 last:border-0 flex flex-col gap-3">
                  <div>
                    <h4 className="font-medium text-white">{draw.name}</h4>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-gray-400">{draw.remaining} tickets left</span>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{draw.countdown}</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs py-1.5"
                    onClick={() => navigate(`/admin/competitions/${draw.id}`)}
                  >
                    View Details
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
