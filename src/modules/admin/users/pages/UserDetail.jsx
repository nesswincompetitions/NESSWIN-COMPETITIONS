import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import { 
  ArrowLeft, Edit3, AlertTriangle, Ban, Key, LayoutDashboard, 
  ShoppingCart, Trophy, Users as UsersIcon, Ticket, FileText, Plus, Send, Mail, Loader2, CheckCircle2,
  Phone, User, Share2
} from 'lucide-react';
import { db } from '@/config/firebase';
import { doc, getDoc, where } from 'firebase/firestore';
import { 
  useUserRealtime, 
  useUserOrdersRealtime, 
  useUserTicketsRealtime, 
  useUserReferralsRealtime, 
  useUserBonusLogsRealtime 
} from '@/shared/hooks/useAdminData';
import { updateUserStatus } from '@/modules/admin/users/services/usersService';
import { toast } from 'react-hot-toast';
import { formatStatus } from '@/shared/utils/formatters';
import Modal from '@/shared/components/ui/Modal';
import { grantAdminBonus } from '@/modules/admin/bonus/services/bonusService';
import useRealtimeCollection from '@/shared/hooks/useRealtimeCollection';
import { Clock } from 'lucide-react';

const UserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const [activeTab, setActiveTab] = useState('overview');
  const [noteText, setNoteText] = useState('');
  
  const { data: profile, loading: profileLoading } = useUserRealtime(id);
  const { data: orders, loading: ordersLoading } = useUserOrdersRealtime(id);
  const { data: tickets, loading: ticketsLoading } = useUserTicketsRealtime(id);
  const { data: referralsList, loading: referralsLoading } = useUserReferralsRealtime(id);
  const { data: bonusLogs, loading: bonusLoading } = useUserBonusLogsRealtime(id);

  const [compDetails, setCompDetails] = useState({});
  const [resolvingComps, setResolvingComps] = useState(false);
  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  const [bonusQuantity, setBonusQuantity] = useState(1);
  const [bonusReason, setBonusReason] = useState('');
  const [isSubmittingBonus, setIsSubmittingBonus] = useState(false);


  useEffect(() => {
    if (!tickets || tickets.length === 0) return;
    
    const missingIds = new Set();
    tickets.forEach(tk => {
      const cId = tk.competition_id?.id || (typeof tk.competition_id === 'string' ? tk.competition_id : null);
      if (cId && !compDetails[cId]) missingIds.add(cId);
    });

    if (missingIds.size === 0) return;

    const fetchComps = async () => {
      setResolvingComps(true);
      try {
        const snaps = await Promise.all(
          Array.from(missingIds).map(cid => getDoc(doc(db, 'competition', cid)))
        );
        setCompDetails(prev => {
          const next = { ...prev };
          snaps.forEach(snap => {
            if (snap.exists()) next[snap.id] = snap.data();
          });
          return next;
        });
      } catch (err) {
        console.error('Error fetching competition details:', err);
      } finally {
        setResolvingComps(false);
      }
    };
    fetchComps();
  }, [tickets, compDetails]);

  const competitions = useMemo(() => {
    if (!tickets) return [];
    const map = {};
    tickets.forEach(tk => {
      const cId = tk.competition_id?.id || (typeof tk.competition_id === 'string' ? tk.competition_id : null);
      if (!cId) return;
      if (!map[cId]) {
        const details = compDetails[cId] || {};
        map[cId] = { 
          id: cId, 
          tickets: [], 
          title: details.title || 'Unknown Competition',
          status: details.status || 'active',
          drawDate: details.draw_date || null
        };
      }
      map[cId].tickets.push(tk);
    });
    return Object.values(map);
  }, [tickets, compDetails]);

  const loading = profileLoading || ordersLoading || ticketsLoading || referralsLoading || bonusLoading || resolvingComps;

  const handleStatusUpdate = async (newStatus) => {
    try {
      await updateUserStatus(id, newStatus);
      toast.success(`User state updated to ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleAssignBonus = async (e) => {
    e.preventDefault();
    setIsSubmittingBonus(true);
    try {
      const result = await grantAdminBonus(id, bonusQuantity, bonusReason);
      if (result.success) {
        toast.success(result.message);
        setIsBonusModalOpen(false);
        setBonusQuantity(1);
        setBonusReason('');
      } else {
        toast.error(result.message || "Failed to grant bonus");
      }
    } catch (error) {
      console.error("Error granting bonus:", error);
      toast.error("An error occurred while granting bonus");
    } finally {
      setIsSubmittingBonus(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading || !profile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <Loader2 size={48} className="animate-spin text-primary mb-4 opacity-50" />
        <p className="text-gray-400 font-medium">Loading user profile...</p>
      </div>
    );
  }

  // Group tickets by competition logic is now inside useMemo above

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
        { label: t('users.detail.stats.referrals'), value: referralsList?.length || 0, color: "text-white" },
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
          <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsBonusModalOpen(true)}>
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
                  <TableHead>Status</TableHead>
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
                      <span className="font-medium text-white">
                        {(log.reason || 'Bonus').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-emerald-400 font-bold">+{log.quantity}</span>
                    </TableCell>
                    <TableCell>
                      {log.reason === 'Referral_auto_reward' ? (
                        log.reward_issued ? (
                          <Badge variant="success" className="bg-emerald-500/10 text-emerald-400">Used</Badge>
                        ) : (
                          <Badge variant="warning">Pending</Badge>
                        )
                      ) : (
                        <Badge variant="success" className="bg-emerald-500/10 text-emerald-400">Used</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm whitespace-nowrap">
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
              <div className="relative group">
                <div className="w-24 h-24 rounded-full bg-[#121212] border-4 border-[#1a1a1a] shadow-xl flex items-center justify-center text-4xl font-bold text-white overflow-hidden relative">
                  {profile.photo_url || profile.profile_image ? (
                    <img src={profile.photo_url || profile.profile_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (profile.display_name || profile.name || '?').charAt(0)
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 z-10 scale-90 origin-bottom-right shadow-lg">
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
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4 text-gray-400 text-sm">
                  <span className="flex items-center gap-1"><Mail size={14} /> {profile.email}</span>
                  {profile.phone_number && <span className="flex items-center gap-1"><Phone size={14} /> {profile.phone_number}</span>}
                  {profile.user_name && <span className="flex items-center gap-1"><User size={14} /> @{profile.user_name}</span>}
                  {profile.referral_code && <span className="flex items-center gap-1 text-primary"><Share2 size={14} /> {profile.referral_code}</span>}
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

      {/* Assign Bonus Modal */}
      <Modal
        isOpen={isBonusModalOpen}
        onClose={() => !isSubmittingBonus && setIsBonusModalOpen(false)}
        title={t('users.detail.bonusTab.assignBonus')}
      >
        <form onSubmit={handleAssignBonus} className="space-y-4">

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Number of Tickets</label>
            <input
              type="number"
              required
              min="1"
              max="100"
              value={bonusQuantity}
              onChange={(e) => setBonusQuantity(parseInt(e.target.value))}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
              disabled={isSubmittingBonus}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Reason (Optional)</label>
            <textarea
              value={bonusReason}
              onChange={(e) => setBonusReason(e.target.value)}
              placeholder="e.g. Compensation, VIP gift..."
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 resize-none h-20"
              disabled={isSubmittingBonus}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsBonusModalOpen(false)}
              disabled={isSubmittingBonus}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              disabled={isSubmittingBonus}
              className="flex items-center gap-2"
            >
              {isSubmittingBonus ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Issuing...
                </>
              ) : 'Issue Tickets'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserDetail;
