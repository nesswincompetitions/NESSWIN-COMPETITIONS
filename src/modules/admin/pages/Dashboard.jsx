import React from 'react';

const Dashboard = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in">
      <header className="flex flex-col gap-2 md:flex-row md:items-center justify-between pb-6 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-serif font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-1">Welcome back to your admin dashboard.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stats Cards Placeholders */}
        {[
          { title: 'Total Users', value: '1,234' },
          { title: 'Active Competitions', value: '12' },
          { title: 'Total Revenue', value: '$45,678' },
          { title: 'Pending Orders', value: '89' },
        ].map((stat, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-primary/50 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <h3 className="text-gray-400 text-sm font-medium">{stat.title}</h3>
            <p className="text-3xl font-bold mt-2 tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>
      
      <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 h-96 flex items-center justify-center">
        <p className="text-gray-500 italic">Dashboard functionality coming soon...</p>
      </div>
    </div>
  );
};

export default Dashboard;
