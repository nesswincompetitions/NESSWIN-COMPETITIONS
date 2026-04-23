import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { Search, Calendar, Download, Eye, ExternalLink, Trophy } from 'lucide-react';

const WinnersList = () => {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState('All');

  // Dummy Winners Data
  const winners = [
    { 
      id: 1, 
      name: "John Doe", 
      email: "john@example.com", 
      competition: "iPhone 15 Giveaway", 
      ticket: "#0234", 
      drawDate: "12 May 2026", 
      status: "Completed" 
    },
    { 
      id: 2, 
      name: "Sarah Smith", 
      email: "sarah@example.com", 
      competition: "2024 Range Rover Sport", 
      ticket: "#1450", 
      drawDate: "01 Jun 2026", 
      status: "Contacted" 
    },
    { 
      id: 3, 
      name: "Mike Johnson", 
      email: "mike@example.com", 
      competition: "Rolex Submariner", 
      ticket: "#0899", 
      drawDate: "15 Apr 2026", 
      status: "Pending" 
    },
  ];

  const filteredWinners = activeStatus === 'All' 
    ? winners 
    : winners.filter(w => w.status === activeStatus);

  const renderStatusBadge = (status) => {
    switch(status) {
      case 'Completed': return <Badge variant="success">Completed</Badge>;
      case 'Contacted': return <Badge variant="hot">Contacted</Badge>;
      case 'Pending': return <Badge variant="warning">Pending</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">Winners</h1>
          <p className="text-gray-400 mt-1">View and manage all competition winners across the platform.</p>
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
              {['All', 'Pending', 'Contacted', 'Completed'].map((status) => (
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
                  placeholder="Search by name, email..." 
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              
              <Button variant="outline" size="sm" className="w-full sm:w-auto flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 justify-center">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-sm">Filter Dates</span>
              </Button>
            </div>
          </div>

          {/* Table Area */}
          {filteredWinners.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Winner Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Competition</TableHead>
                  <TableHead>Ticket No</TableHead>
                  <TableHead>Draw Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWinners.map((winner, index) => (
                  <TableRow key={winner.id}>
                    <TableCell className="text-gray-500 font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium text-white">{winner.name}</TableCell>
                    <TableCell className="text-gray-400">{winner.email}</TableCell>
                    <TableCell>{winner.competition}</TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="font-mono bg-white/5 border-white/10">{winner.ticket}</Badge>
                    </TableCell>
                    <TableCell>{winner.drawDate}</TableCell>
                    <TableCell>{renderStatusBadge(winner.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => navigate(`/admin/winners/${winner.id}`)}
                          className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors group relative" title="View Winner"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/competitions/${winner.id}`)}
                          className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-primary transition-colors" title="View Competition"
                        >
                          <ExternalLink size={16} />
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
                <Trophy className="text-gray-500" size={32} />
              </div>
              <div>
                <p className="text-white font-medium text-lg">No winners found</p>
                <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                  {activeStatus === 'All' 
                    ? 'Winners will appear here after competitions end and draws are executed.'
                    : `No winners currently match the "${activeStatus}" status filter.`}
                </p>
              </div>
              {activeStatus !== 'All' && (
                <Button variant="outline" size="sm" onClick={() => setActiveStatus('All')} className="mt-2">
                  Clear Filters
                </Button>
              )}
            </div>
          )}

          {/* Pagination (Only show if there are items) */}
          {filteredWinners.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Showing <span className="font-medium text-white">1</span>-<span className="font-medium text-white">{filteredWinners.length}</span> of <span className="font-medium text-white">{filteredWinners.length}</span> results
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

export default WinnersList;
