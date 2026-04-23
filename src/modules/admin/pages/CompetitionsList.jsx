import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import { 
  Plus, Search, Calendar, Download, 
  Eye, Edit, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react';

const CompetitionsList = () => {
  const [activeTab, setActiveTab] = useState('All');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [competitionToDelete, setCompetitionToDelete] = useState(null);
  const navigate = useNavigate();

  const tabs = ['All', 'Active', 'Ended', 'Archived'];

  const competitions = [
    { id: 1, name: "iPhone 15 Giveaway", status: "Active", price: "£2.99", sold: 340, total: 500, revenue: "£1,016", drawDate: "12 May 2026" },
    { id: 2, name: "2024 Range Rover Sport", status: "Active", price: "£10.00", sold: 1450, total: 5000, revenue: "£14,500", drawDate: "01 Jun 2026" },
    { id: 3, name: "Rolex Submariner", status: "Ended", price: "£5.00", sold: 2000, total: 2000, revenue: "£10,000", drawDate: "15 Apr 2026" },
    { id: 4, name: "Gaming PC Setup", status: "Active", price: "£1.50", sold: 85, total: 200, revenue: "£127.50", drawDate: "20 May 2026" },
    { id: 5, name: "Trip to Maldives", status: "Archived", price: "£20.00", sold: 950, total: 1000, revenue: "£19,000", drawDate: "01 Jan 2026" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold">Competitions</h1>
          <p className="text-gray-400 mt-1">Manage and track all your raffles and giveaways.</p>
        </div>
        <Button variant="primary" className="flex items-center gap-2" onClick={() => navigate('/admin/competitions/create')}>
          <Plus size={18} />
          Create New Competition
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-fit">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === tab 
                      ? 'bg-white/10 text-white font-medium' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search by name or ID..." 
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 flex-1 sm:flex-none justify-center">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-sm">Filter Dates</span>
                </Button>
                
                <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 flex-1 sm:flex-none justify-center">
                  <Download size={16} className="text-gray-400" />
                  <span className="text-sm">Export</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competition Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ticket Price</TableHead>
                <TableHead>Tickets Sold</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Draw Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitions.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 border border-white/5">
                        <span className="text-xs text-gray-500 font-medium">IMG</span>
                      </div>
                      <div>
                        <p className="font-medium text-white">{comp.name}</p>
                        <p className="text-xs text-gray-500">ID: #{comp.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      comp.status === 'Active' ? 'success' : 
                      comp.status === 'Ended' ? 'neutral' : 'warning'
                    }>
                      {comp.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{comp.price}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 w-24">
                      <span className="text-xs text-gray-400">{comp.sold} / {comp.total}</span>
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full ${comp.sold === comp.total ? 'bg-emerald-400' : 'bg-primary'}`} 
                          style={{ width: `${(comp.sold / comp.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-white">{comp.revenue}</TableCell>
                  <TableCell>{comp.drawDate}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => navigate(`/admin/competitions/${comp.id}`)}
                        className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors group relative" title="View"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => navigate(`/admin/competitions/${comp.id}?tab=edit`)}
                        className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-blue-400 transition-colors" title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => { setCompetitionToDelete(comp); setDeleteModalOpen(true); }}
                        className="p-2 hover:bg-red-500/10 rounded-md text-gray-400 hover:text-red-400 transition-colors" title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="p-4 border-t border-white/10 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Showing <span className="font-medium text-white">1</span> to <span className="font-medium text-white">5</span> of <span className="font-medium text-white">12</span> results
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10" disabled>
                <ChevronLeft size={14} className="mr-1" />
                Previous
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs bg-white/5 border-white/10">
                Next
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Competition"
        description="Are you sure you want to delete this competition? This action cannot be undone."
        actions={
          <>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="primary" className="bg-red-500 border-red-500 hover:bg-red-600 text-white" onClick={() => {
              // Handle delete logic here
              setDeleteModalOpen(false);
            }}>
              Delete
            </Button>
          </>
        }
      >
        {competitionToDelete && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <span className="text-xs text-gray-500 font-medium">IMG</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{competitionToDelete.name}</p>
              <p className="text-xs text-gray-500">ID: #{competitionToDelete.id}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CompetitionsList;
