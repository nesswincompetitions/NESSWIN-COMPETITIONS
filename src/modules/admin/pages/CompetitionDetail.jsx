import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import CompetitionForm from '../components/CompetitionForm';
import { 
  ArrowLeft, ExternalLink, CalendarPlus, Trophy, 
  Users, Edit3, LayoutDashboard, Clock, Tag, Ticket, CheckCircle2, ArrowRight
} from 'lucide-react';

const CompetitionDetail = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  const [activeTab, setActiveTab] = useState('overview');
  const [isDrawConfirmed, setIsDrawConfirmed] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState(null);

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

  const competition = {
    id: id || '1',
    title: t('competitionNames.rangeRover'),
    status: t('common.active'),
    price: "10.00",
    ticketsSold: 1450,
    maxTickets: 5000,
    revenue: 14500,
    drawDate: "2026-06-01",
    drawTime: "20:00",
    category: t('competitions.form.step1.categories.cars'),
    description: t('competitionNames.rangeRoverDesc'),
    prizeValue: "95000"
  };

  const participants = [
    { id: 1, name: "John Doe", email: "john@example.com", tickets: ["#0234", "#0235", "#0236", "#0237", "#0238"], status: "Paid" },
    { id: 2, name: "Sarah Smith", email: "sarah@example.com", tickets: ["#0112", "#0113"], status: "Paid" },
    { id: 3, name: "Mike Johnson", email: "mike@example.com", tickets: ["#0899", "#0900", "#0901", "#0902", "#0903", "#0904", "#0905", "#0906", "#0907", "#0908"], status: "Paid" },
    { id: 4, name: "Emma Wilson", email: "emma@example.com", tickets: ["#1005"], status: "Failed" },
    { id: 5, name: "Tom Brown", email: "tom@example.com", tickets: ["#1420", "#1421", "#1422"], status: "Pending" },
  ];

  const renderOverview = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 fade-in">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <div className="aspect-video bg-white/5 border-b border-white/10 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent"></div>
            <span className="text-gray-500 font-medium text-lg relative z-10">{t('competitions.detail.competitionImage')}</span>
            <div className="absolute top-4 left-4 z-10">
              <Badge variant="hot">{t('competitions.detail.featured')}</Badge>
            </div>
          </div>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{competition.title}</h2>
              <p className="text-gray-400 mt-2">{competition.description}</p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Tag size={12} /> {t('competitions.detail.category')}</p>
                <p className="font-medium text-white">{competition.category}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Ticket size={12} /> {t('competitions.detail.ticketPrice')}</p>
                <p className="font-medium text-primary">£{competition.price}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Trophy size={12} /> {t('competitions.detail.prizeValue')}</p>
                <p className="font-medium text-white">£{parseInt(competition.prizeValue).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock size={12} /> {t('competitions.detail.drawDate')}</p>
                <p className="font-medium text-white">{new Date(competition.drawDate).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 space-y-6">
            <h3 className="font-semibold text-lg border-b border-white/10 pb-3">{t('competitions.detail.performance')}</h3>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t('competitions.detail.ticketsSold')}</span>
                <span className="font-medium text-white">{competition.ticketsSold} / {competition.maxTickets}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full" 
                  style={{ width: `${(competition.ticketsSold / competition.maxTickets) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 text-right">{((competition.ticketsSold / competition.maxTickets) * 100).toFixed(1)}% {t('competitions.detail.soldLabel')}</p>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">{t('competitions.detail.totalRevenue')}</p>
                <p className="text-2xl font-bold text-white mt-1">£{competition.revenue.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-xl">💰</span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/10 text-center">
              <p className="text-xs text-gray-500 mb-2">{t('competitions.detail.drawEndsIn')}</p>
              <div className="flex justify-center gap-2">
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">05</span><span className="text-[10px] text-gray-500 block">{t('competitions.detail.days')}</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">12</span><span className="text-[10px] text-gray-500 block">{t('competitions.detail.hrs')}</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">45</span><span className="text-[10px] text-gray-500 block">{t('competitions.detail.min')}</span></div>
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
          <h2 className="text-lg font-semibold">{t('competitions.detail.participants.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('competitions.detail.participants.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm">{t('common.exportCsv')}</Button>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('competitions.detail.participants.tableUser')}</TableHead>
              <TableHead>{t('competitions.detail.participants.tableEmail')}</TableHead>
              <TableHead>{t('competitions.detail.participants.tableTickets')}</TableHead>
              <TableHead>{t('competitions.detail.participants.tableStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-white">{p.name}</TableCell>
                <TableCell className="text-gray-400">{p.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {p.tickets.slice(0, 3).map(tk => (
                      <span key={tk} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-xs text-gray-300">{tk}</span>
                    ))}
                    {p.tickets.length > 3 && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-xs text-gray-400">+{p.tickets.length - 3}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.status.toLowerCase() === 'paid' ? 'success' : p.status.toLowerCase() === 'pending' ? 'warning' : 'neutral'}>
                    {p.status.toLowerCase() === 'paid' ? t('common.paid') : p.status.toLowerCase() === 'pending' ? t('common.pending') : p.status}
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

  const handleSelectWinner = () => {
    setSelectedWinner({
      id: 1,
      name: "John Doe",
      ticket: "#0234",
      date: new Date().toISOString()
    });
  };

  const renderDraw = () => (
    <Card className="max-w-2xl mx-auto fade-in">
      <div className="p-8 text-center space-y-8">
        
        {selectedWinner ? (
          <div className="space-y-8 fade-in transform scale-in">
            <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border-4 border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
              <span className="text-4xl">🎉</span>
            </div>
            
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">{t('competitions.detail.draw.winnerSelected')}</h2>
              <p className="text-emerald-400 font-medium">{t('competitions.detail.draw.drawCompleted')}</p>
            </div>

            <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 text-left relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Trophy size={100} />
              </div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
                    {selectedWinner.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">{t('competitions.detail.draw.winnerName')}</p>
                    <p className="text-xl font-bold text-white">{selectedWinner.name}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('competitions.detail.draw.winningTicket')}</p>
                    <Badge variant="hot" className="text-sm px-3 py-1 font-mono">{selectedWinner.ticket}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('competitions.detail.drawDate')}</p>
                    <p className="text-white font-medium">{new Date(selectedWinner.date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Button variant="outline" onClick={() => setSelectedWinner(null)}>
                {t('competitions.detail.draw.reDraw')}
              </Button>
              <Button variant="primary" className="flex items-center gap-2" onClick={() => navigate(`/admin/winners/${selectedWinner.id}`)}>
                {t('competitions.detail.draw.viewWinnerDetails')} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="text-primary" size={40} />
            </div>
            
            <div>
              <h2 className="text-2xl font-bold text-white">{t('competitions.detail.draw.title')}</h2>
              <p className="text-gray-400 mt-2 max-w-md mx-auto">
                {t('competitions.detail.draw.scheduledFor')} <span className="text-white font-medium">{new Date(competition.drawDate).toLocaleDateString()} {t('competitions.detail.draw.at')} {competition.drawTime}</span>.
              </p>
            </div>

            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl inline-block w-full">
              <p className="text-sm text-gray-500 mb-3 uppercase tracking-widest font-medium">{t('competitions.detail.draw.timeUntilDraw')}</p>
              <div className="flex justify-center gap-3 sm:gap-6">
                <div className="flex flex-col items-center">
                  <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">05</span>
                  <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.days')}</span>
                </div>
                <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">12</span>
                  <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.hours')}</span>
                </div>
                <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">45</span>
                  <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.mins')}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <label className="flex items-center justify-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input 
                    type="checkbox" 
                    checked={isDrawConfirmed}
                    onChange={(e) => setIsDrawConfirmed(e.target.checked)}
                    className="w-5 h-5 appearance-none border-2 border-gray-500 rounded bg-[#121212] checked:border-primary checked:bg-primary transition-colors peer"
                  />
                  <CheckCircle2 size={14} className="absolute text-black opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" strokeWidth={3} />
                </div>
                <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                  {t('competitions.detail.draw.confirmLabel')}
                </span>
              </label>

              <Button 
                variant="primary" 
                disabled={!isDrawConfirmed}
                onClick={handleSelectWinner}
                className={`w-full sm:w-auto px-8 py-4 text-lg font-bold transition-all ${
                  isDrawConfirmed 
                    ? 'shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.5)]' 
                    : 'opacity-50 cursor-not-allowed'
                }`}
              >
                {t('competitions.detail.draw.selectWinnerBtn')}
              </Button>
              <p className="text-xs text-gray-500 mt-4">{t('competitions.detail.draw.selectWinnerNote')}</p>
            </div>
          </>
        )}
      </div>
    </Card>
  );

  const tabs = [
    { id: 'overview', label: t('competitions.detail.tabs.overview'), icon: LayoutDashboard },
    { id: 'participants', label: t('competitions.detail.tabs.participants'), icon: Users },
    { id: 'edit', label: t('competitions.detail.tabs.editDetails'), icon: Edit3 },
    { id: 'draw', label: t('competitions.detail.tabs.drawWinner'), icon: Trophy },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 fade-in">
      <button 
        onClick={() => navigate('/admin/competitions')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm w-fit"
      >
        <ArrowLeft size={16} />
        {t('competitions.detail.backToCompetitions')}
      </button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-serif font-bold text-white">{competition.title}</h1>
            <Badge variant="success">{competition.status}</Badge>
          </div>
          <p className="text-gray-400">ID: #{competition.id}</p>
        </div>
        
        <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-2 mt-4 md:mt-0 w-full md:w-auto">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => window.open('/', '_blank')}>
            <ExternalLink size={14} />
            <span className="hidden sm:inline">{t('competitions.detail.viewOnWebsite')}</span>
            <span className="sm:hidden">{t('common.view')}</span>
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
            <CalendarPlus size={14} />
            <span className="hidden sm:inline">{t('competitions.detail.extendDraw')}</span>
            <span className="sm:hidden">{t('common.extend')}</span>
          </Button>
          <Button variant="primary" size="sm" className="flex-1 sm:flex-none" onClick={() => handleTabChange('edit')}>
            <Edit3 size={14} />
            {t('common.edit')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar border-b border-white/10">
        <div className="flex gap-1 min-w-max pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`cursor-pointer flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
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
