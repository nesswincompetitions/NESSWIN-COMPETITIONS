import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import { 
  ArrowLeft, Users as UsersIcon, Gift, Copy
} from 'lucide-react';

const ReferralDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Dummy Referrer Data
  const referrer = {
    id: id || "1",
    name: "John Doe",
    email: "john@example.com",
    code: "JOHN123",
    totalEarned: 24
  };

  // Dummy Referred Users
  const referredUsers = [
    { id: "101", name: "Alice Brown", email: "alice@example.com", joinedDate: "12 May 2026", bonusGiven: "+2 Tickets" },
    { id: "102", name: "Bob Smith", email: "bob@example.com", joinedDate: "11 May 2026", bonusGiven: "+2 Tickets" },
    { id: "103", name: "Charlie Davis", email: "charlie@example.com", joinedDate: "10 May 2026", bonusGiven: "+2 Tickets" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      
      {/* 1. Header Navigation */}
      <div>
        <button 
          onClick={() => navigate('/admin/referrals')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-4 w-fit"
        >
          <ArrowLeft size={16} />
          Back to Referrals
        </button>
        <h1 className="text-3xl font-serif font-bold text-white mb-2">Referral Details</h1>
      </div>

      {/* 2. Top Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Referrer Info (Left 2/3) */}
        <Card className="lg:col-span-2 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <CardContent className="p-8 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-[#121212] border-2 border-white/10 flex items-center justify-center text-3xl font-bold text-white shrink-0 shadow-lg">
                {referrer.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{referrer.name}</h2>
                <p className="text-gray-400 text-sm mt-1 mb-3">{referrer.email}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Referral Code:</span>
                  <div className="flex items-center bg-[#121212] border border-white/10 rounded-md shadow-sm overflow-hidden">
                    <span className="px-3 py-1 font-mono text-white text-sm bg-white/5">{referrer.code}</span>
                    <button className="cursor-pointer px-3 py-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors border-l border-white/10" title="Copy Code">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <Button variant="outline" onClick={() => navigate(`/admin/users/${referrer.id}`)}>
              View Full Profile
            </Button>
          </CardContent>
        </Card>

        {/* Reward Logic (Right 1/3) */}
        <Card className="bg-gradient-to-br from-yellow-500/10 to-transparent border-yellow-500/20">
          <CardContent className="p-8 flex flex-col h-full justify-center space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <Gift className="text-yellow-500" size={20} />
              </div>
              <h3 className="text-lg font-bold text-white">Rewards</h3>
            </div>
            
            <div className="bg-[#121212]/50 rounded-lg p-3 border border-white/5">
              <p className="text-sm text-gray-400 text-center">Reward Policy</p>
              <p className="text-white text-center font-medium mt-1">+2 bonus tickets per referral</p>
            </div>
            
            <div className="text-center pt-2">
              <p className="text-xs text-yellow-500/70 uppercase tracking-wider font-bold mb-1">Total Earned</p>
              <p className="text-4xl font-bold text-yellow-500 shadow-yellow-500 drop-shadow-sm">{referrer.totalEarned}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Referred Users List */}
      <Card>
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <UsersIcon className="text-gray-400" size={20} />
          <h2 className="text-lg font-bold text-white">Referred Users</h2>
        </div>
        <CardContent className="p-0">
          {referredUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Name</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Date Joined</TableHead>
                  <TableHead className="text-right">Bonus Given (To Referrer)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-white">{user.name}</TableCell>
                    <TableCell className="text-gray-400">{user.email}</TableCell>
                    <TableCell className="text-gray-400">{user.joinedDate}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-block px-3 py-1 rounded bg-yellow-500/10 text-yellow-500 font-medium text-sm border border-yellow-500/20">
                        {user.bonusGiven}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <p className="text-gray-500">No referred users found.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReferralDetail;
