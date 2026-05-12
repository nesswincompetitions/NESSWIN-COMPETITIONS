import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import { 
  ArrowLeft, Edit3, AlertTriangle, Ban, Key, LayoutDashboard, 
  ShoppingCart, Trophy, Users as UsersIcon, Ticket, FileText, Plus, Send, Mail, Loader2, CheckCircle2
} from 'lucide-react';
import { fetchUserDetail, updateUserStatus } from '@/modules/admin/users/services/usersService';
import { toast } from 'react-hot-toast';
import { formatStatus } from '@/shared/utils/formatters';

const UserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const [activeTab, setActiveTab] = useState('overview');
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    loadUser();
  }, [id]);

  const loadUser = async () => {
    setLoading(true);
    try {
      const result = await fetchUserDetail(id);
      setData(result);
    } catch (error) {
      console.error('Error loading user detail:', error);
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    try {
      await updateUserStatus(id, newStatus);
      toast.success(`User state updated to ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
      loadUser(); // Refresh data
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading || !data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <Loader2 size={48} className="animate-spin text-primary mb-4 opacity-50" />
        <p className="text-gray-400 font-medium">Loading user profile...</p>
      </div>
    );
  }

  const { 
    profile = {}, 
    orders = [], 
    tickets = [], 
    competitions = [], 
    referralsList = [], 
    bonusLogs = [] 
  } = data || {};

  const tabs = [
    { id: 'overview', label: t('users.detail.tabs.overview'), icon: LayoutDashboard },
    { id: 'orders', label: t('users.detail.tabs.orders'), icon: ShoppingCart },
    { id: 'competitions', label: t('users.detail.tabs.competitions'), icon: Trophy },
    { id: 'referrals', label: t('users.detail.tabs.referrals'), icon: UsersIcon },
    { id: 'wins', label: 'Wins', icon: Trophy },
    { id: 'bonus', label: t('users.detail.tabs.bonus'), icon: Ticket },
    // { id: 'notes', label: t('users.detail.tabs.notes'), icon: FileText },
  ];

  const renderStatusBadge = (user) => {
    if (user.is_deleted === true) {
      return <Badge variant="neutral" className="bg-gray-500/20 text-gray-500 border-gray-500/50">Deleted</Badge>;
    }
    if (user.is_active === false) {
      return <Badge variant="danger">{t('common.suspended')}</Badge>;
    }
    return <Badge variant="success">{t('common.active')}</Badge>;
  };

  const renderOverview = () => (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 fade-in">
      {[
        { label: t('users.detail.stats.totalSpend'), value: `£${(profile.total_spent || 0).toFixed(2)}`, color: "text-emerald-400" },
        { label: t('users.detail.stats.compsEntered'), value: competitions.length, color: "text-white" },
        { label: t('users.detail.stats.ticketsBought'), value: tickets.length, color: "text-white" },
        { label: t('users.detail.stats.referrals'), value: profile.referral_count || 0, color: "text-white" },
        { label: t('users.detail.stats.bonusBalance'), value: profile.free_tickets || 0, color: "text-primary" },
      ].map((stat, i) => (
        <Card key={i} className="bg-white/[0.02]">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderOrders = () => (
    <Card className="fade-in">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.detail.ordersTab.orderId')}</TableHead>
              <TableHead>{t('users.detail.ordersTab.competition')}</TableHead>
              <TableHead>{t('users.detail.ordersTab.tickets')}</TableHead>
              <TableHead>{t('users.detail.ordersTab.amount')}</TableHead>
              <TableHead>{t('users.detail.ordersTab.date')}</TableHead>
              <TableHead>{t('users.detail.ordersTab.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-gray-500 italic">No orders found</TableCell>
              </TableRow>
            ) : orders.map(order => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-gray-400 text-xs">#{order.id.slice(-8).toUpperCase()}</TableCell>
                <TableCell className="font-medium text-white">{order.competitionName}</TableCell>
                <TableCell>{order.total_ticket || 0}</TableCell>
                <TableCell className="font-bold text-emerald-400">£{(order.total_amount || 0).toFixed(2)}</TableCell>
                <TableCell>{formatDate(order.created_at)}</TableCell>
                <TableCell>
                  <Badge variant={order.status === 'paid' ? 'success' : 'warning'}>{order.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderCompetitions = () => (
    <Card className="fade-in">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.detail.compsTab.competition')}</TableHead>
              <TableHead>{t('users.detail.compsTab.ticketsHeld')}</TableHead>
              <TableHead>{t('users.detail.compsTab.drawDate')}</TableHead>
              <TableHead>{t('users.detail.compsTab.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-gray-500 italic">No competitions entered</TableCell>
              </TableRow>
            ) : competitions.map((comp, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-white">{comp.title}</TableCell>
                <TableCell>
                  <Badge variant="neutral" className="bg-white/5 border-white/10">{comp.tickets.length} {t('common.tickets')}</Badge>
                </TableCell>
                <TableCell>{formatDate(comp.drawDate)}</TableCell>
                <TableCell>
                  <Badge variant={comp.status === 'active' ? 'success' : 'neutral'}>{formatStatus(comp.status)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderReferrals = () => (
    <Card className="fade-in">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referred User</TableHead>
              <TableHead>Reward</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referralsList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-gray-500 italic">No users referred yet</TableCell>
              </TableRow>
            ) : referralsList.map(ref => (
              <TableRow key={ref.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-white">{ref.referredName}</span>
                    <span className="text-xs text-gray-500">{ref.referredEmail}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="success" className="bg-emerald-500/10 text-emerald-400">+{ref.reward_value || 0} Ticket</Badge>
                </TableCell>
                <TableCell>
                  {ref.reward_issued ? (
                    <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 flex items-center gap-1 w-fit">
                      <CheckCircle2 size={10} /> Issued
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="w-fit">Pending</Badge>
                  )}
                </TableCell>
                <TableCell className="text-gray-400">
                  {formatDate(ref.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderBonusTickets = () => {
    return (
      <div className="space-y-6 fade-in">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Ticket size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-sm text-gray-400">{t('users.detail.bonusTab.currentBalance')}</p>
              <p className="text-2xl font-bold text-white">{profile.free_tickets || 0} {t('users.detail.bonusTab.tickets')}</p>
            </div>
          </div>
          <Button variant="primary" className="flex items-center gap-2">
            <Plus size={16} />
            {t('users.detail.bonusTab.assignBonus')}
          </Button>
        </div>
        
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Competition</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bonusLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-gray-500 italic">No bonus history found</TableCell>
                  </TableRow>
                ) : bonusLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <span className="font-medium text-white capitalize">{log.reason || 'Bonus'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-emerald-400 font-bold">+{log.quantity}</span>
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {log.competitionTitle}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {formatDate(log.created_at || log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };
  
  const renderWins = () => (
    <Card className="fade-in">
      <CardContent className="py-20 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
          <Trophy size={32} className="text-amber-500" />
        </div>
        <div>
          <p className="text-lg font-semibold text-white">No wins yet</p>
          <p className="text-sm text-gray-400 mt-1">When this user wins a competition, the details will appear here.</p>
        </div>
      </CardContent>
    </Card>
  );

  const renderNotes = () => (
    <div className="space-y-6 fade-in">
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <span className="text-gray-400 font-medium">AD</span>
            </div>
            <div className="flex-1 space-y-3">
              <textarea 
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t('users.detail.notesTab.placeholder')} 
                className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 min-h-[100px] resize-none"
              />
              <div className="flex justify-end">
                <Button variant="primary" className="flex items-center gap-2 px-6">
                  <Send size={16} /> {t('users.detail.notesTab.saveNote')}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="p-8 text-center text-gray-500 italic">No notes found for this user.</Card>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      <div>
        <button 
          onClick={() => navigate('/admin/users')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-4 w-fit"
        >
          <ArrowLeft size={16} />
          {t('users.detail.backToUsers')}
        </button>
        <h1 className="text-3xl font-serif font-bold text-white mb-2">{t('users.detail.userProfile')}</h1>
      </div>

      {/* Profile Card */}
      <Card className="overflow-hidden relative bg-[#121212]">
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-[#121212] border-4 border-[#1a1a1a] shadow-xl flex items-center justify-center text-4xl font-bold text-white relative">
                {(profile.display_name || profile.name || '?').charAt(0)}
                <div className="absolute -bottom-1 -right-1">
                  {renderStatusBadge(profile)}
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  {profile.display_name || profile.name}
                  {profile.is_deleted === true && (
                    <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded uppercase tracking-wider font-bold">Deleted Account</span>
                  )}
                </h2>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-gray-400 text-sm">
                  <span className="flex items-center gap-1"><Mail size={14} /> {profile.email}</span>
                </div>
                <p className="text-xs text-gray-500 pt-1">
                  {t('users.detail.registered')}: {formatDate(profile.created_time || profile.created_at)}
                  {profile.deleted_at && (
                    <span className="ml-3 text-red-400/60">
                      • Deleted on: {formatDate(profile.deleted_at)}
                    </span>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Actions removed as per request */}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-20 pt-2">
        <div className="flex gap-1 min-w-max pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
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

      <div className="pt-4 min-h-[400px]">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'competitions' && renderCompetitions()}
        {activeTab === 'referrals' && renderReferrals()}
        {activeTab === 'bonus' && renderBonusTickets()}
        {activeTab === 'wins' && renderWins()}
        {/* {activeTab === 'notes' && renderNotes()} */}
      </div>
    </div>
  );
};

export default UserDetail;
