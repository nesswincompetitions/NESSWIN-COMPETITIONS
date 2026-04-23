import React, { useState } from 'react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import {
  Search, Plus, Upload, Settings, Ticket, HelpCircle
} from 'lucide-react';

const BonusTickets = () => {
  const [activeStatus, setActiveStatus] = useState('All');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Modal Form State
  const [assignUser, setAssignUser] = useState('');
  const [assignAmount, setAssignAmount] = useState(1);
  const [assignReason, setAssignReason] = useState('');
  const [assignExpiry, setAssignExpiry] = useState('');

  // Dummy Ledger Data
  const tickets = [
    {
      id: 1, userName: "John Doe", amount: "+5", reason: "Referral reward",
      assignedBy: "Admin", dateAssigned: "12 May 2026", expiryDate: "30 May 2026", status: "Active"
    },
    {
      id: 2, userName: "Sarah Smith", amount: "-1", reason: "Used on iPhone Giveaway",
      assignedBy: "System", dateAssigned: "10 May 2026", expiryDate: "-", status: "Used"
    },
    {
      id: 3, userName: "Mike Johnson", amount: "+2", reason: "Customer service compensation",
      assignedBy: "Admin", dateAssigned: "05 May 2026", expiryDate: "No Expiry", status: "Active"
    },
    {
      id: 4, userName: "Emma Wilson", amount: "+10", reason: "Welcome Bonus",
      assignedBy: "System", dateAssigned: "01 Jan 2026", expiryDate: "01 Feb 2026", status: "Expired"
    },
  ];

  const filteredTickets = activeStatus === 'All'
    ? tickets
    : tickets.filter(t => t.status === activeStatus);

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Active': return <Badge variant="success">Active</Badge>;
      case 'Used': return <Badge variant="neutral" className="bg-gray-500/20 text-gray-400 border-gray-500/30">Used</Badge>;
      case 'Expired': return <Badge variant="danger">Expired</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    // Simulate API call
    console.log("Assigning tickets:", { assignUser, assignAmount, assignReason, assignExpiry });
    setIsAssignModalOpen(false);
    // Reset form
    setAssignUser('');
    setAssignAmount(1);
    setAssignReason('');
    setAssignExpiry('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">

      {/* 1. Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">Bonus Tickets</h1>
          <p className="text-gray-400 mt-1">Manage, assign, and track promotional tickets.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="bg-white/[0.02] border-white/5 py-2 px-4 flex items-center gap-3 h-[52px]">
            <Ticket className="text-primary opacity-70" size={20} />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Circulation</p>
              <p className="text-lg font-bold text-white leading-none mt-0.5">1,245</p>
            </div>
          </Card>
        </div>
      </header>

      {/* 2. Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsAssignModalOpen(true)}>
          <Plus size={16} /> Assign to User
        </Button>
        <Button variant="outline" className="flex items-center gap-2">
          <Upload size={16} /> Bulk Assign (CSV)
        </Button>
        <Button variant="outline" className="flex items-center gap-2">
          <Settings size={16} /> Set Expiry Rules
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* 4. Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">

            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-full lg:w-fit overflow-x-auto hide-scrollbar shrink-0">
              {['All', 'Active', 'Used', 'Expired'].map((status) => (
                <button
                  key={status}
                  onClick={() => setActiveStatus(status)}
                  className={`cursor-pointer px-4 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex-1 lg:flex-none ${activeStatus === status
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full lg:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search user name or email..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
              />
            </div>
          </div>

          {/* 5. Ledger Table */}
          <div className="overflow-x-auto">
            {filteredTickets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Name</TableHead>
                    <TableHead className="text-center">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Assigned By</TableHead>
                    <TableHead>Date Assigned</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium text-white">{ticket.userName}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold font-mono px-2 py-1 rounded-md ${ticket.amount.startsWith('+')
                            ? 'text-emerald-400 bg-emerald-400/10'
                            : 'text-red-400 bg-red-400/10'
                          }`}>
                          {ticket.amount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <span className="truncate max-w-[200px]">{ticket.reason}</span>
                          <HelpCircle size={14} className="text-gray-500 cursor-help" title={ticket.reason} />
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400">{ticket.assignedBy}</TableCell>
                      <TableCell className="text-gray-400 whitespace-nowrap">{ticket.dateAssigned}</TableCell>
                      <TableCell>
                        <span className={`text-sm ${ticket.expiryDate === 'No Expiry' ? 'text-gray-500 italic' : 'text-gray-300'}`}>
                          {ticket.expiryDate}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{renderStatusBadge(ticket.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              /* Empty State */
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <Ticket className="text-gray-500" size={32} />
                </div>
                <div>
                  <p className="text-white font-medium text-lg">No tickets found</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                    {activeStatus === 'All'
                      ? 'No bonus tickets have been assigned yet.'
                      : `No bonus tickets match the "${activeStatus}" filter.`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Assign Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Bonus Tickets"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Search User</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                required
                value={assignUser}
                onChange={(e) => setAssignUser(e.target.value)}
                placeholder="Type name or email (e.g. John Doe)..."
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Number of Tickets</label>
              <input
                type="number"
                required
                min="1"
                value={assignAmount}
                onChange={(e) => setAssignAmount(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Expiry Date <span className="text-gray-500 font-normal">(Optional)</span></label>
              <input
                type="date"
                value={assignExpiry}
                onChange={(e) => setAssignExpiry(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Reason / Note</label>
            <textarea
              required
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder="Why are you giving these tickets?"
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-none h-24"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
            <Button type="button" variant="outline" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Assign Tickets
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default BonusTickets;
