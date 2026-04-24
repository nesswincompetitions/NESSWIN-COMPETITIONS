import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { 
  ArrowLeft, Edit3, AlertTriangle, Ban, Key, LayoutDashboard, 
  ShoppingCart, Trophy, Users as UsersIcon, Ticket, FileText, Plus, Send, Mail
} from 'lucide-react';

const UserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [noteText, setNoteText] = useState('');

  // Dummy User Data
  const user = {
    id: id || '1',
    name: "John Doe",
    email: "john@example.com",
    phone: "+44 7700 900123",
    status: "Active",
    joinDate: "10 Jan 2026",
    totalSpend: 450.00,
    compsEntered: 12,
    ticketsPurchased: 45,
    referrals: 3,
    bonusBalance: 5
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'competitions', label: 'Competitions', icon: Trophy },
    { id: 'referrals', label: 'Referrals', icon: UsersIcon },
    { id: 'bonus', label: 'Bonus Tickets', icon: Ticket },
    { id: 'notes', label: 'Admin Notes', icon: FileText },
  ];

  const renderStatusBadge = (status) => {
    switch(status) {
      case 'Active': return <Badge variant="success">Active</Badge>;
      case 'Suspended': return <Badge variant="warning">Suspended</Badge>;
      case 'Banned': return <Badge variant="danger" className="bg-red-500/20 text-red-500 border-red-500/30">Banned</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderOverview = () => (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 fade-in">
      {[
        { label: "Total Spend", value: `£${user.totalSpend.toFixed(2)}`, color: "text-emerald-400" },
        { label: "Comps Entered", value: user.compsEntered, color: "text-white" },
        { label: "Tickets Bought", value: user.ticketsPurchased, color: "text-white" },
        { label: "Referrals", value: user.referrals, color: "text-white" },
        { label: "Bonus Balance", value: user.bonusBalance, color: "text-primary" },
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

  const renderOrders = () => {
    const orders = [
      { id: "ORD-1001", comp: "iPhone 15 Giveaway", tickets: 5, amount: 14.95, date: "12 Mar 2026", status: "Paid" },
      { id: "ORD-1002", comp: "2024 Range Rover Sport", tickets: 1, amount: 10.00, date: "05 Apr 2026", status: "Paid" },
    ];
    return (
      <Card className="fade-in">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Competition</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-gray-400">{order.id}</TableCell>
                  <TableCell className="font-medium text-white">{order.comp}</TableCell>
                  <TableCell>{order.tickets}</TableCell>
                  <TableCell className="font-bold text-emerald-400">£{order.amount.toFixed(2)}</TableCell>
                  <TableCell>{order.date}</TableCell>
                  <TableCell>
                    <Badge variant={order.status === 'Paid' ? 'success' : 'warning'}>{order.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  const renderCompetitions = () => {
    const comps = [
      { name: "iPhone 15 Giveaway", tickets: 5, drawDate: "12 May 2026", status: "Active" },
      { name: "2024 Range Rover Sport", tickets: 1, drawDate: "01 Jun 2026", status: "Active" },
      { name: "Rolex Submariner", tickets: 10, drawDate: "15 Apr 2026", status: "Ended" },
    ];
    return (
      <Card className="fade-in">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competition</TableHead>
                <TableHead>Tickets Held</TableHead>
                <TableHead>Draw Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comps.map((comp, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-white">{comp.name}</TableCell>
                  <TableCell>
                    <Badge variant="neutral" className="bg-white/5 border-white/10">{comp.tickets} Tickets</Badge>
                  </TableCell>
                  <TableCell>{comp.drawDate}</TableCell>
                  <TableCell>
                    <Badge variant={comp.status === 'Active' ? 'success' : 'neutral'}>{comp.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  const renderReferrals = () => (
    <Card className="fade-in">
      <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
          <UsersIcon className="text-gray-500" size={32} />
        </div>
        <div>
          <p className="text-white font-medium text-lg">Referrals Data</p>
          <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
            This user has successfully referred {user.referrals} friends. Detailed referral tracking will appear here.
          </p>
        </div>
      </div>
    </Card>
  );

  const renderBonusTickets = () => {
    const history = [
      { date: "05 Apr 2026", reason: "Referral Bonus", amount: "+2", balance: 5 },
      { date: "10 Mar 2026", reason: "Used on iPhone Giveaway", amount: "-1", balance: 3 },
      { date: "01 Feb 2026", reason: "Welcome Bonus", amount: "+4", balance: 4 },
    ];
    return (
      <div className="space-y-6 fade-in">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Ticket size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Current Balance</p>
              <p className="text-2xl font-bold text-white">{user.bonusBalance} Tickets</p>
            </div>
          </div>
          <Button variant="primary" className="flex items-center gap-2">
            <Plus size={16} />
            Assign Bonus Tickets
          </Button>
        </div>

        <Card>
          <div className="p-6 border-b border-white/10">
            <h3 className="text-lg font-semibold text-white">Bonus History</h3>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((log, i) => (
                  <TableRow key={i}>
                    <TableCell>{log.date}</TableCell>
                    <TableCell className="text-white">{log.reason}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${log.amount.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                        {log.amount}
                      </span>
                    </TableCell>
                    <TableCell>{log.balance}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderNotes = () => {
    const notes = [
      { id: 1, author: "Admin", date: "12 Apr 2026, 14:30", text: "User requested email change. Verified identity via phone call." },
      { id: 2, author: "System", date: "10 Jan 2026, 09:00", text: "Account created." }
    ];
    return (
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
                  placeholder="Add an internal note about this user..." 
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 min-h-[100px] resize-none"
                />
                <div className="flex justify-end">
                  <Button variant="primary" className="flex items-center gap-2 px-6">
                    <Send size={16} /> Save Note
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white px-2">Note Timeline</h3>
          {notes.map(note => (
            <Card key={note.id} className="bg-white/[0.02]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{note.author}</span>
                    <span className="text-xs text-gray-500">{note.date}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-300">{note.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      
      {/* 1. Header & Navigation */}
      <div>
        <button 
          onClick={() => navigate('/admin/users')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-4 w-fit"
        >
          <ArrowLeft size={16} />
          Back to Users
        </button>
        <h1 className="text-3xl font-serif font-bold text-white mb-2">User Profile</h1>
      </div>

      {/* 2. Profile Card (Top) */}
      <Card className="overflow-hidden relative bg-[#121212]">
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-[#121212] border-4 border-[#1a1a1a] shadow-xl flex items-center justify-center text-4xl font-bold text-white relative">
                {user.name.charAt(0)}
                <div className="absolute -bottom-1 -right-1">
                  {renderStatusBadge(user.status)}
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-white">{user.name}</h2>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-gray-400 text-sm">
                  <span className="flex items-center gap-1"><Mail size={14} /> {user.email}</span>
                </div>
                <p className="text-xs text-gray-500 pt-1">Registered: {user.joinDate}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="flex items-center gap-2">
                <Edit3 size={16} /> Edit Profile
              </Button>
              <Button variant="outline" className="flex items-center gap-2 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/10">
                <AlertTriangle size={16} /> Suspend
              </Button>
              <Button variant="outline" className="flex items-center gap-2 text-red-500 border-red-500/20 hover:bg-red-500/10">
                <Ban size={16} /> Ban
              </Button>
              <Button variant="outline" className="flex items-center gap-2 text-gray-400 hover:text-white border-white/10">
                <Key size={16} /> Reset Pwd
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Tabs Section */}
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

      {/* 4. Tab Content Rendering */}
      <div className="pt-4 min-h-[400px]">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'competitions' && renderCompetitions()}
        {activeTab === 'referrals' && renderReferrals()}
        {activeTab === 'bonus' && renderBonusTickets()}
        {activeTab === 'notes' && renderNotes()}
      </div>

    </div>
  );
};

export default UserDetail;
