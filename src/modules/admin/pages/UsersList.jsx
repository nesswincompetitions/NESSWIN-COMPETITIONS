import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { 
  Search, Calendar, Download, Eye, AlertTriangle, 
  Ban, ChevronDown, Filter, MoreVertical, Users as UsersIcon
} from 'lucide-react';

const UsersList = () => {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState('All');
  const [sortBy, setSortBy] = useState('Newest');

  // Dummy Users Data
  const users = [
    { 
      id: 1, name: "John Doe", email: "john@example.com", phone: "+44 7700 900123", 
      regDate: "10 Jan 2026", compsEntered: 12, totalSpend: 450.00, 
      referrals: 3, bonusTickets: 5, status: "Active" 
    },
    { 
      id: 2, name: "Sarah Smith", email: "sarah@example.com", phone: "+44 7700 900456", 
      regDate: "15 Feb 2026", compsEntered: 4, totalSpend: 120.50, 
      referrals: 0, bonusTickets: 1, status: "Active" 
    },
    { 
      id: 3, name: "Mike Johnson", email: "mike@example.com", phone: "+44 7700 900789", 
      regDate: "01 Mar 2026", compsEntered: 45, totalSpend: 2100.00, 
      referrals: 12, bonusTickets: 20, status: "Active" 
    },
    { 
      id: 4, name: "Emma Wilson", email: "emma@example.com", phone: "+44 7700 900321", 
      regDate: "20 Mar 2026", compsEntered: 2, totalSpend: 15.00, 
      referrals: 0, bonusTickets: 0, status: "Suspended" 
    },
    { 
      id: 5, name: "Tom Brown", email: "tom@example.com", phone: "+44 7700 900654", 
      regDate: "05 Apr 2026", compsEntered: 0, totalSpend: 0.00, 
      referrals: 0, bonusTickets: 0, status: "Banned" 
    },
  ];

  const filteredUsers = activeStatus === 'All' 
    ? users 
    : users.filter(u => u.status === activeStatus);

  const renderStatusBadge = (status) => {
    switch(status) {
      case 'Active': return <Badge variant="success">Active</Badge>;
      case 'Suspended': return <Badge variant="warning">Suspended</Badge>;
      case 'Banned': return <Badge variant="danger" className="bg-red-500/20 text-red-500 border-red-500/30">Banned</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">Users</h1>
          <p className="text-gray-400 mt-1">Manage user accounts, view histories, and moderate activity.</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Download size={16} />
          Export CSV
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-fit overflow-x-auto hide-scrollbar">
              {['All', 'Active', 'Suspended', 'Banned'].map((status) => (
                <button
                  key={status}
                  onClick={() => setActiveStatus(status)}
                  className={`cursor-pointer px-4 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                    activeStatus === status 
                      ? 'bg-white/10 text-white font-medium' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search name, email, phone..." 
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              
              <Button variant="outline" size="sm" className="w-full sm:w-auto flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 justify-center">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-sm hidden sm:inline">Date</span>
              </Button>

              <div className="relative w-full sm:w-auto">
                <select 
                  className="w-full sm:w-40 appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 h-10"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="Newest" className="bg-[#121212]">Newest First</option>
                  <option value="Oldest" className="bg-[#121212]">Oldest First</option>
                  <option value="Spend" className="bg-[#121212]">Highest Spend</option>
                  <option value="Tickets" className="bg-[#121212]">Most Tickets</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Table Area */}
          <div className="overflow-x-auto">
            {filteredUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>User Details</TableHead>
                    <TableHead>Reg. Date</TableHead>
                    <TableHead className="text-center">Comps</TableHead>
                    <TableHead>Total Spend</TableHead>
                    <TableHead className="text-center">Referrals</TableHead>
                    <TableHead className="text-center">Bonus</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user, index) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-gray-500 font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-white">{user.name}</p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-500 mt-0.5">
                              <span>{user.email}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400 whitespace-nowrap">{user.regDate}</TableCell>
                      <TableCell className="text-center font-medium text-white">{user.compsEntered}</TableCell>
                      <TableCell className="font-bold text-emerald-400 whitespace-nowrap">£{user.totalSpend.toFixed(2)}</TableCell>
                      <TableCell className="text-center">{user.referrals}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="hot" className="px-2 py-0.5 min-w-[2rem]">{user.bonusTickets}</Badge>
                      </TableCell>
                      <TableCell>{renderStatusBadge(user.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => navigate(`/admin/users/${user.id}`)}
                            className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title="View Profile"
                          >
                            <Eye size={16} />
                          </button>
                          <button className="cursor-pointer p-2 hover:bg-yellow-500/10 rounded-md text-gray-400 hover:text-yellow-500 transition-colors" title="Suspend User">
                            <AlertTriangle size={16} />
                          </button>
                          <button className="cursor-pointer p-2 hover:bg-red-500/10 rounded-md text-gray-400 hover:text-red-500 transition-colors" title="Ban User">
                            <Ban size={16} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              /* Empty State */
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <UsersIcon className="text-gray-500" size={32} />
                </div>
                <div>
                  <p className="text-white font-medium text-lg">No users found</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                    {activeStatus === 'All' 
                      ? 'No users have registered yet.'
                      : `No users currently match the "${activeStatus}" status filter.`}
                  </p>
                </div>
                {activeStatus !== 'All' && (
                  <Button variant="outline" size="sm" onClick={() => setActiveStatus('All')} className="mt-2">
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredUsers.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Showing <span className="font-medium text-white">1</span>-<span className="font-medium text-white">{filteredUsers.length}</span> of <span className="font-medium text-white">{filteredUsers.length}</span> results
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10" disabled>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10" disabled>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersList;
