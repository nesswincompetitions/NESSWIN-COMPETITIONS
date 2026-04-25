import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import {
  Search, Calendar, Download, Eye,
  ChevronDown, RefreshCcw, ShoppingBag
} from 'lucide-react';

const OrdersList = () => {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState('All');
  const [selectedComp, setSelectedComp] = useState('All');
  const [isCompDropdownOpen, setIsCompDropdownOpen] = useState(false);
  const compDropdownRef = React.useRef(null);

  const competitions = [
    { value: 'All', label: 'All Competitions' },
    { value: 'iPhone 15 Giveaway', label: 'iPhone 15 Giveaway' },
    { value: 'Rolex Submariner', label: 'Rolex Submariner' },
    { value: '2024 Range Rover Sport', label: '2024 Range Rover Sport' },
  ];

  const selectedCompLabel = competitions.find(c => c.value === selectedComp)?.label || 'All Competitions';

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (compDropdownRef.current && !compDropdownRef.current.contains(e.target)) {
        setIsCompDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dummy Orders Data
  const orders = [
    {
      id: "ORD-1023", userName: "John Doe", userEmail: "john@example.com",
      competition: "iPhone 15 Giveaway", tickets: 5, amount: 14.95,
      date: "12 May 2026", status: "Paid"
    },
    {
      id: "ORD-1024", userName: "Sarah Smith", userEmail: "sarah@example.com",
      competition: "Rolex Submariner", tickets: 2, amount: 30.00,
      date: "12 May 2026", status: "Paid"
    },
    {
      id: "ORD-1025", userName: "Mike Johnson", userEmail: "mike@example.com",
      competition: "2024 Range Rover Sport", tickets: 1, amount: 10.00,
      date: "11 May 2026", status: "Pending"
    },
    {
      id: "ORD-1026", userName: "Emma Wilson", userEmail: "emma@example.com",
      competition: "iPhone 15 Giveaway", tickets: 10, amount: 29.90,
      date: "10 May 2026", status: "Failed"
    },
    {
      id: "ORD-1027", userName: "Tom Brown", userEmail: "tom@example.com",
      competition: "Rolex Submariner", tickets: 1, amount: 15.00,
      date: "09 May 2026", status: "Refunded"
    },
  ];

  const filteredOrders = orders.filter(o =>
    (activeStatus === 'All' || o.status === activeStatus) &&
    (selectedComp === 'All' || o.competition === selectedComp)
  );

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Paid': return <Badge variant="success">Paid</Badge>;
      case 'Pending': return <Badge variant="warning">Pending</Badge>;
      case 'Failed': return <Badge variant="danger">Failed</Badge>;
      case 'Refunded': return <Badge variant="neutral" className="bg-gray-500/20 text-gray-400 border-gray-500/30">Refunded</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">Orders</h1>
          <p className="text-gray-400 mt-1">Monitor transactions, refunds, and payment statuses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Card className="bg-white/[0.02] border-white/5 py-2 px-4 flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-500">Total Orders</p>
              <p className="text-lg font-bold text-white">1,420</p>
            </div>
          </Card>
          <Card className="bg-white/[0.02] border-white/5 py-2 px-4 flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-500">Total Revenue</p>
              <p className="text-lg font-bold text-emerald-400">£12,450.00</p>
            </div>
          </Card>
          <Button variant="outline" className="flex items-center gap-2 h-[52px]">
            <Download size={16} />
            Export
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">

            {/* Status Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg w-full lg:w-fit overflow-x-auto hide-scrollbar shrink-0">
              {['All', 'Paid', 'Pending', 'Failed', 'Refunded'].map((status) => (
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

            {/* Search & Selects */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search order ID, user, email..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors h-10"
                />
              </div>

              <div className="relative flex-1 sm:flex-none sm:w-48">
                <select
                  className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 h-10 pr-8"
                  value={selectedComp}
                  onChange={(e) => setSelectedComp(e.target.value)}
                >
                  <option value="All" className="bg-[#121212]">All Competitions</option>
                  <option value="iPhone 15 Giveaway" className="bg-[#121212]">iPhone 15 Giveaway</option>
                  <option value="Rolex Submariner" className="bg-[#121212]">Rolex Submariner</option>
                  <option value="2024 Range Rover Sport" className="bg-[#121212]">2024 Range Rover Sport</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              <Button variant="outline" size="sm" className="flex items-center gap-2 h-10 px-3 bg-white/5 border-white/10 justify-center">
                <Calendar size={16} className="text-gray-400" />
              </Button>
            </div>
          </div>

          {/* Table Area */}
          <div className="overflow-x-auto">
            {filteredOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Competition</TableHead>
                    <TableHead className="text-center">Tickets</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-gray-400">{order.id}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{order.userName}</span>
                          <span className="text-xs text-gray-500">{order.userEmail}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-white font-medium">{order.competition}</TableCell>
                      <TableCell className="text-center text-gray-300">{order.tickets}</TableCell>
                      <TableCell className="font-bold text-emerald-400">£{order.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-gray-400 whitespace-nowrap">{order.date}</TableCell>
                      <TableCell>{renderStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/orders/${order.id}`)}
                            className="p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title="View Order"
                          >
                            <Eye size={16} />
                          </button>
                          {order.status === 'Paid' && (
                            <button className="cursor-pointer p-2 hover:bg-gray-500/10 rounded-md text-gray-400 hover:text-white transition-colors" title="Refund Order">
                              <RefreshCcw size={16} />
                            </button>
                          )}
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
                  <ShoppingBag className="text-gray-500" size={32} />
                </div>
                <div>
                  <p className="text-white font-medium text-lg">No orders found</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                    Try adjusting your filters or search terms.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredOrders.length > 0 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Showing <span className="font-medium text-white">1</span>-<span className="font-medium text-white">{filteredOrders.length}</span> of <span className="font-medium text-white">{filteredOrders.length}</span> results
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

export default OrdersList;
