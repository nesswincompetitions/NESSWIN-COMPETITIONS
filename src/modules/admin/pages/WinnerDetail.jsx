import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { 
  ArrowLeft, RefreshCw, ExternalLink, CheckCircle2, 
  Send, Mail, Upload, FileText, Image as ImageIcon, Video, Link as LinkIcon, Trash2
} from 'lucide-react';

const WinnerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Dummy State
  const [currentStage, setCurrentStage] = useState(1); // 0 to 4
  const [message, setMessage] = useState('');
  const [sendAsEmail, setSendAsEmail] = useState(true);

  const winner = {
    id: id || '1',
    name: "John Doe",
    email: "john@example.com",
    ticket: "#0234",
    competition: "iPhone 15 Giveaway",
    drawDate: "12 May 2026",
    status: "Contacted"
  };

  const stages = [
    "Winner Selected",
    "Contacted",
    "Confirmed",
    "Prize Sent",
    "Handover Complete"
  ];

  const messages = [
    { id: 1, sender: "Admin", text: "Congrats! You won 🎉 Please reply to confirm your address.", time: "2 hours ago", status: "Sent (Email)" },
    { id: 2, sender: "John Doe", text: "Wow! Thank you so much. My address is 123 Main St, London.", time: "1 hour ago", status: "Received" }
  ];

  const handleNextStage = () => {
    if (currentStage < stages.length - 1) {
      setCurrentStage(prev => prev + 1);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <button 
            onClick={() => navigate('/admin/winners')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-3"
          >
            <ArrowLeft size={16} />
            Back to Winners
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-serif font-bold text-white">Winner Details</h1>
            <Badge variant={currentStage === stages.length - 1 ? 'success' : 'warning'}>
              {stages[currentStage]}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex items-center gap-2 border-white/10 text-gray-300 hover:text-white">
            <RefreshCw size={16} />
            Re-draw Winner
          </Button>
          <Button variant="outline" className="flex items-center gap-2" onClick={() => navigate(`/admin/competitions/${winner.id}`)}>
            <ExternalLink size={16} />
            View Competition
          </Button>
        </div>
      </div>

      {/* 2. Winner Summary Card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Winner Name</p>
              <p className="text-lg font-bold text-white flex items-center gap-2">
                {winner.name} 
                <span className="text-xs font-normal px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400">{winner.email}</span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Winning Ticket</p>
              <p className="text-lg font-mono font-bold text-primary">{winner.ticket}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Competition</p>
              <p className="text-white font-medium">{winner.competition}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Draw Date</p>
              <p className="text-white font-medium">{winner.drawDate}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Status Timeline */}
      <Card>
        <CardContent className="p-8">
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-white/10 -z-10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500 ease-in-out"
                style={{ width: `${(currentStage / (stages.length - 1)) * 100}%` }}
              ></div>
            </div>

            {/* Timeline Steps */}
            <div className="flex items-center justify-between relative z-10">
              {stages.map((stage, index) => {
                const isCompleted = index <= currentStage;
                const isCurrent = index === currentStage;
                return (
                  <div key={stage} className="relative flex flex-col items-center gap-3">
                    <div className={`cursor-pointer relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-4 transition-colors duration-300 bg-[#121212] ${
                      isCompleted 
                        ? 'border-emerald-500 text-emerald-500' 
                        : 'border-white/10 text-gray-600'
                    }`}>
                      {isCompleted ? <CheckCircle2 size={20} /> : <span className="w-2.5 h-2.5 rounded-full bg-gray-600"></span>}
                    </div>
                    <span className={`text-xs sm:text-sm font-medium whitespace-nowrap absolute -bottom-8 ${
                      index === 0 ? 'left-0' : index === stages.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    } ${
                      isCurrent ? 'text-white' : isCompleted ? 'text-emerald-400' : 'text-gray-500'
                    }`}>
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-16 flex justify-center border-t border-white/5 pt-6">
             <Button 
                variant="primary" 
                onClick={handleNextStage}
                disabled={currentStage === stages.length - 1}
                className="px-8"
              >
                {currentStage === stages.length - 1 ? 'Handover Completed' : `Mark "${stages[currentStage + 1]}" as Complete`}
             </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4 & 5. Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        
        {/* LEFT: Communication */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail size={20} className="text-primary" />
            Communication
          </h2>
          
          <Card className="flex flex-col h-[500px]">
            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'Admin' ? 'items-end' : 'items-start'}`}>
                  <p className="text-xs text-gray-500 mb-1 px-1">{msg.sender} • {msg.time}</p>
                  <div className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                    msg.sender === 'Admin' 
                      ? 'bg-primary/20 text-white rounded-tr-none border border-primary/30' 
                      : 'bg-white/5 text-gray-200 rounded-tl-none border border-white/10'
                  }`}>
                    {msg.text}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1 px-1">{msg.status}</p>
                </div>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10 bg-[#121212]/50">
              <div className="mb-3 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={sendAsEmail}
                    onChange={(e) => setSendAsEmail(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 text-primary bg-white/5 focus:ring-primary focus:ring-offset-[#121212]"
                  />
                  <span className="text-xs text-gray-400">Send as Email</span>
                </label>
                <button className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1">
                  <RefreshCw size={12} /> Resend last email
                </button>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message to the winner..." 
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                />
                <Button variant="primary" className="px-4">
                  <Send size={18} />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT: Proof Uploads */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Upload size={20} className="text-primary" />
            Proof & Handover
          </h2>
          
          <Card className="h-[500px] overflow-y-auto">
            <CardContent className="p-6 space-y-5">
              
              {/* Winner Proof */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center justify-between">
                  <span>Winner Proof (ID/Document)</span>
                  <Badge variant="success">Uploaded</Badge>
                </label>
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">john_doe_id_scan.pdf</p>
                      <p className="text-xs text-gray-500">2.4 MB • Uploaded today</p>
                    </div>
                  </div>
                  <button className="cursor-pointer p-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Handover Photo */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Handover Photo</label>
                <label className="block border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                  <input type="file" accept="image/*" className="hidden" />
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ImageIcon className="text-gray-400" size={20} />
                  </div>
                  <p className="text-sm text-gray-400 mt-1">Click to upload photo</p>
                </label>
              </div>

              {/* Handover Video */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Handover Video</label>
                <label className="block border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                  <input type="file" accept="video/*" className="hidden" />
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Video className="text-gray-400" size={20} />
                  </div>
                  <p className="text-sm text-gray-400 mt-1">Click to upload video</p>
                </label>
              </div>

              {/* Instagram Link */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-sm font-medium text-gray-300">Instagram Post Link</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input 
                      type="url" 
                      placeholder="https://instagram.com/p/..." 
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <Button variant="outline">Save</Button>
                </div>
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default WinnerDetail;
