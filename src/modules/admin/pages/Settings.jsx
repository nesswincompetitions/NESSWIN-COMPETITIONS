import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import { 
  UserPlus, Edit3, ShieldOff, Trash2, Mail, Shield, CheckCircle2
} from 'lucide-react';

const Settings = () => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Admin');
  const [showToast, setShowToast] = useState(false);

  // Dummy Admin Users Data
  const adminUsers = [
    { 
      id: 1, name: "John Admin", email: "admin@nesswin.com",
      role: "Super Admin", lastLogin: "2 mins ago", status: "Active" 
    },
    { 
      id: 2, name: "Sarah Manager", email: "sarah@nesswin.com",
      role: "Admin", lastLogin: "1 day ago", status: "Active" 
    },
    { 
      id: 3, name: "Mike Support", email: "mike@nesswin.com",
      role: "Support", lastLogin: "Never", status: "Invited" 
    },
    { 
      id: 4, name: "Emma Old", email: "emma@nesswin.com",
      role: "Admin", lastLogin: "2 months ago", status: "Disabled" 
    },
  ];

  const renderStatusBadge = (status) => {
    switch(status) {
      case 'Active': return <Badge variant="success">Active</Badge>;
      case 'Invited': return <Badge variant="warning">Invited</Badge>;
      case 'Disabled': return <Badge variant="danger" className="bg-red-500/20 text-red-500 border-red-500/30">Disabled</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderRoleBadge = (role) => {
    switch(role) {
      case 'Super Admin': return <span className="px-2.5 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-semibold tracking-wide">SUPER ADMIN</span>;
      case 'Admin': return <span className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold tracking-wide">ADMIN</span>;
      case 'Support': return <span className="px-2.5 py-1 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20 text-xs font-semibold tracking-wide">SUPPORT</span>;
      default: return <span>{role}</span>;
    }
  };

  const handleInviteSubmit = (e) => {
    e.preventDefault();
    setIsInviteModalOpen(false);
    setInviteEmail('');
    
    // Show Toast
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20 relative">
      
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-24 right-8 z-50 animate-slide-in-right">
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 backdrop-blur-md">
            <CheckCircle2 size={18} />
            <span className="font-medium">Invite sent successfully!</span>
          </div>
        </div>
      )}

      {/* 1. Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center justify-between pb-2">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white">Admin Users</h1>
          <p className="text-gray-400 mt-1">Manage staff access and platform permissions.</p>
        </div>
        <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsInviteModalOpen(true)}>
          <UserPlus size={16} />
          Invite Admin
        </Button>
      </header>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column (Main Table) */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Details</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white font-bold shrink-0">
                              {user.name.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-white">{user.name}</span>
                              <span className="text-xs text-gray-500">{user.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{renderRoleBadge(user.role)}</TableCell>
                        <TableCell className="text-gray-400 whitespace-nowrap">{user.lastLogin}</TableCell>
                        <TableCell>{renderStatusBadge(user.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button className="cursor-pointer p-2 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title="Edit Role">
                              <Edit3 size={16} />
                            </button>
                            {user.status !== 'Disabled' && (
                              <button className="cursor-pointer p-2 hover:bg-yellow-500/10 rounded-md text-gray-400 hover:text-yellow-500 transition-colors" title="Disable User">
                                <ShieldOff size={16} />
                              </button>
                            )}
                            <button className="cursor-pointer p-2 hover:bg-red-500/10 rounded-md text-gray-400 hover:text-red-500 transition-colors" title="Remove User">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (Roles Reference) */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-[#121212] border-white/5 sticky top-24">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                <Shield size={18} className="text-primary" />
                Roles Reference
              </h3>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  {renderRoleBadge('Super Admin')}
                  <p className="text-sm text-gray-400 mt-1">Full system access. Can modify settings, manage all admins, and access financial ledgers.</p>
                </div>
                
                <div className="space-y-2">
                  {renderRoleBadge('Admin')}
                  <p className="text-sm text-gray-400 mt-1">Can manage competitions, users, and process basic refunds. Cannot manage settings.</p>
                </div>
                
                <div className="space-y-2">
                  {renderRoleBadge('Support')}
                  <p className="text-sm text-gray-400 mt-1">Read-only access to users and orders for answering customer service inquiries.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Invite Admin Modal */}
      <Modal 
        isOpen={isInviteModalOpen} 
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite New Admin"
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="email" 
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@nesswin.com" 
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Assign Role</label>
            <select 
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
            >
              <option value="Super Admin">Super Admin</option>
              <option value="Admin">Admin</option>
              <option value="Support">Support</option>
            </select>
          </div>

          <div className="pt-2">
            <p className="text-xs text-gray-500">
              An invitation email will be sent to this address with a secure link to set up their password.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
            <Button type="button" variant="outline" onClick={() => setIsInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Send Invite
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Settings;
