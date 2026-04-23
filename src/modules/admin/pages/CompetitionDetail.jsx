import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import CompetitionForm from '../components/CompetitionForm';
import { 
  ArrowLeft, ExternalLink, CalendarPlus, Trophy, 
  Users, Edit3, LayoutDashboard, Clock, Tag, Ticket
} from 'lucide-react';

const CompetitionDetail = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'participants', 'edit', 'draw'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Dummy data
  const competition = {
    id: id || '1',
    title: "2024 Range Rover Sport",
    status: "Active",
    price: "10.00",
    ticketsSold: 1450,
    maxTickets: 5000,
    revenue: 14500,
    drawDate: "2026-06-01",
    drawTime: "20:00",
    category: "Cars",
    description: "Win a brand new 2024 Range Rover Sport in our biggest giveaway yet!",
    prizeValue: "95000"
  };

  const participants = [
    { id: 1, name: "John Doe", email: "john@example.com", tickets: 5, status: "Confirmed" },
    { id: 2, name: "Sarah Smith", email: "sarah@example.com", tickets: 2, status: "Confirmed" },
    { id: 3, name: "Mike Johnson", email: "mike@example.com", tickets: 10, status: "Confirmed" },
    { id: 4, name: "Emma Wilson", email: "emma@example.com", tickets: 1, status: "Confirmed" },
    { id: 5, name: "Tom Brown", email: "tom@example.com", tickets: 3, status: "Pending" },
  ];

  const renderOverview = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 fade-in">
      {/* Left Col - Image & Details */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <div className="aspect-video bg-white/5 border-b border-white/10 flex items-center justify-center relative overflow-hidden">
            {/* Placeholder Image */}
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent"></div>
            <span className="text-gray-500 font-medium text-lg relative z-10">Competition Image</span>
            <div className="absolute top-4 left-4 z-10">
              <Badge variant="hot">Featured</Badge>
            </div>
          </div>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{competition.title}</h2>
              <p className="text-gray-400 mt-2">{competition.description}</p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Tag size={12} /> Category</p>
                <p className="font-medium text-white">{competition.category}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Ticket size={12} /> Ticket Price</p>
                <p className="font-medium text-primary">£{competition.price}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Trophy size={12} /> Prize Value</p>
                <p className="font-medium text-white">£{parseInt(competition.prizeValue).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock size={12} /> Draw Date</p>
                <p className="font-medium text-white">{new Date(competition.drawDate).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Col - Stats */}
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 space-y-6">
            <h3 className="font-semibold text-lg border-b border-white/10 pb-3">Performance</h3>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tickets Sold</span>
                <span className="font-medium text-white">{competition.ticketsSold} / {competition.maxTickets}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full" 
                  style={{ width: `${(competition.ticketsSold / competition.maxTickets) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 text-right">{((competition.ticketsSold / competition.maxTickets) * 100).toFixed(1)}% sold</p>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Revenue</p>
                <p className="text-2xl font-bold text-white mt-1">£{competition.revenue.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-xl">💰</span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/10 text-center">
              <p className="text-xs text-gray-500 mb-2">Draw Ends In</p>
              <div className="flex justify-center gap-2">
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">05</span><span className="text-[10px] text-gray-500 block">DAYS</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">12</span><span className="text-[10px] text-gray-500 block">HRS</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">45</span><span className="text-[10px] text-gray-500 block">MIN</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderParticipants = () => (
    <Card className="fade-in">
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Participants</h2>
          <p className="text-sm text-gray-400 mt-1">Users who have entered this competition.</p>
        </div>
        <Button variant="outline" size="sm">Export CSV</Button>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tickets</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-white">{p.name}</TableCell>
                <TableCell className="text-gray-400">{p.email}</TableCell>
                <TableCell>{p.tickets}</TableCell>
                <TableCell>
                  <Badge variant={p.status === 'Confirmed' ? 'success' : 'warning'}>
                    {p.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderEdit = () => (
    <div className="fade-in">
      <CompetitionForm 
        isEditMode={true}
        initialData={{
          title: competition.title,
          shortDescription: competition.description,
          fullDescription: "Full description goes here...",
          prizeName: competition.title,
          prizeValue: competition.prizeValue,
          category: competition.category,
          isFeatured: true,
          ticketPrice: competition.price,
          maxTickets: competition.maxTickets.toString(),
          sellOutBehavior: 'auto_end',
          drawEndDate: competition.drawDate,
          drawEndTime: competition.drawTime,
          autoEndDraw: true,
          answers: [{text:'A', isCorrect:true}, {text:'B', isCorrect:false}]
        }}
        onCancel={() => handleTabChange('overview')}
        onSubmit={(data) => {
          console.log('Saved:', data);
          handleTabChange('overview');
        }}
      />
    </div>
  );

  const renderDraw = () => (
    <Card className="max-w-2xl mx-auto fade-in">
      <div className="p-8 text-center space-y-8">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Trophy className="text-primary" size={40} />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold text-white">Draw & Winner Selection</h2>
          <p className="text-gray-400 mt-2 max-w-md mx-auto">
            The draw is scheduled for <span className="text-white font-medium">{new Date(competition.drawDate).toLocaleDateString()} at {competition.drawTime}</span>.
          </p>
        </div>

        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl inline-block w-full">
          <p className="text-sm text-gray-500 mb-3 uppercase tracking-widest font-medium">Time Until Draw</p>
          <div className="flex justify-center gap-3 sm:gap-6">
            <div className="flex flex-col items-center">
              <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">05</span>
              <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">Days</span>
            </div>
            <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
            <div className="flex flex-col items-center">
              <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">12</span>
              <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">Hours</span>
            </div>
            <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
            <div className="flex flex-col items-center">
              <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">45</span>
              <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">Mins</span>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <Button variant="primary" className="w-full sm:w-auto px-8 py-4 text-lg font-bold shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.5)] transition-all">
            Select Winner Now
          </Button>
          <p className="text-xs text-gray-500 mt-4">Selecting a winner will automatically close the competition and choose randomly from confirmed entries.</p>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 fade-in">
      {/* Top Navigation */}
      <button 
        onClick={() => navigate('/admin/competitions')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm w-fit"
      >
        <ArrowLeft size={16} />
        Back to Competitions
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-serif font-bold text-white">{competition.title}</h1>
            <Badge variant="success">{competition.status}</Badge>
          </div>
          <p className="text-gray-400">ID: #{competition.id}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="hidden sm:flex items-center gap-2" onClick={() => window.open('/', '_blank')}>
            <ExternalLink size={16} />
            View on Website
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <CalendarPlus size={16} />
            Extend Draw
          </Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleTabChange('edit')}>
            <Edit3 size={16} />
            Edit
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar border-b border-white/10">
        <div className="flex gap-1 min-w-max pb-px">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'participants', label: 'Participants', icon: Users },
            { id: 'edit', label: 'Edit Details', icon: Edit3 },
            { id: 'draw', label: 'Draw & Winner', icon: Trophy },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  isActive 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="pt-2">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'participants' && renderParticipants()}
        {activeTab === 'edit' && renderEdit()}
        {activeTab === 'draw' && renderDraw()}
      </div>
    </div>
  );
};

export default CompetitionDetail;
