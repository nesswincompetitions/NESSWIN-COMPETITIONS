import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import { 
  ArrowLeft, RefreshCw, ExternalLink, CheckCircle2, 
  Send, Mail, Upload, FileText, Image as ImageIcon, Video, Link as LinkIcon, Trash2,
  Loader2, User, Ticket as TicketIcon, Calendar, Trophy, MessageSquare, Paperclip, X
} from 'lucide-react';
import { doc, onSnapshot, collection, query, orderBy, limit, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/shared/state/AuthContext';
import { updateCompetitionHandover } from '@/modules/admin/competitions/services/winnerWorkflowService';
import { sendMessage, markMessagesAsRead } from '@/shared/services/supportChatService';
import { uploadImages } from '@/shared/services/storageService';
import { toast } from 'react-hot-toast';

const WinnerDetail = () => {
  const { id: competitionId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const { currentUser } = useAuth();

  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(null); // 'id_proof', 'photo', 'video'
  const [handoverLoading, setHandoverLoading] = useState(null);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const fileInputRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Listen to Competition Data
  useEffect(() => {
    if (!competitionId) return;

    const unsub = onSnapshot(doc(db, 'competition', competitionId), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        // Resolve winner and ticket refs into usable objects so the UI shows full details
        let winnerDetails = null;
        try {
          const winnerRef = data.winner_ref;
          const winnerTicketRef = data.winner_ticket_ref;

          if (winnerRef || winnerTicketRef) {
            const [winnerSnap, ticketSnap] = await Promise.all([
              winnerRef ? getDoc(winnerRef) : Promise.resolve(null),
              winnerTicketRef ? getDoc(winnerTicketRef) : Promise.resolve(null),
            ]);

            winnerDetails = {
              user: winnerSnap && winnerSnap.exists() ? { id: winnerSnap.id, ...winnerSnap.data() } : null,
              ticket: ticketSnap && ticketSnap.exists() ? { id: ticketSnap.id, ...ticketSnap.data() } : null,
            };
          }
        } catch (err) {
          console.error('Error resolving winner refs:', err);
        }

        setCompetition({ id: docSnap.id, ...data, winnerDetails });
      } else {
        toast.error('Competition not found');
        navigate('/admin/winners');
      }
      setLoading(false);
    });

    return () => unsub();
  }, [competitionId]);

  // 2. Listen to Chat Messages
  useEffect(() => {
    if (!competitionId) return;

    const chatId = `winner-chat-${competitionId}`;
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('created_at', 'asc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      scrollToBottom();
      
      // Mark as read if there are unread messages for admin
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (!lastMsg.is_seen && lastMsg.receiver_id?.id === currentUser?.uid) {
          markMessagesAsRead(chatId, currentUser.uid, true);
        }
      }
    });

    return () => unsub();
  }, [competitionId, currentUser]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachmentFile) || isSending) return;

    setIsSending(true);
    try {
      const chatId = `winner-chat-${competitionId}`;
      const winnerRef = competition.winner_ref;
      
      let imageUrl = '';
      if (attachmentFile) {
        const [uploadedUrl] = await uploadImages([attachmentFile], `winner-chats/${competitionId}`);
        imageUrl = uploadedUrl || '';
      }

      await sendMessage(
        chatId,
        currentUser.uid,
        winnerRef,
        newMessage,
        imageUrl,
        true // isSenderAdmin
      );
      setNewMessage('');
      setAttachmentFile(null);
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachmentChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setAttachmentFile(file);
    } else if (file) {
      toast.error('Please select an image file');
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(type);
    try {
      const [url] = await uploadImages([file], `handover/${competitionId}/${type}`);
      
      const payload = {};
      if (type === 'id_proof') payload.idProofUrl = url;
      if (type === 'photo') payload.handoverPhotoUrl = url;
      if (type === 'video') payload.handoverVideoUrl = url;

      await updateCompetitionHandover(competitionId, null, payload);
      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(null);
    }
  };

  const handleHandoverAction = async (stage) => {
    setHandoverLoading(stage);
    try {
      await updateCompetitionHandover(competitionId, stage);
      toast.success(`Handover marked as ${stage}`);
    } catch (error) {
      console.error('Action error:', error);
      toast.error(`Failed to update handover status: ${error.message}`);
    } finally {
      setHandoverLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const handover = competition.handover_details || {};
  const winnerUser = competition.winnerDetails?.user || {};
  const winnerTicket = competition.winnerDetails?.ticket || {};

  const stages = [
    { key: 'selected', label: 'Selected', completed: true },
    { key: 'contacted', label: 'Contacted', completed: handover.is_contacted },
    { key: 'prize_sent', label: 'Prize Sent', completed: handover.prize_sent },
    { key: 'completed', label: 'Handover Complete', completed: handover.handover_completed },
  ];

  const currentStageIndex = stages.findIndex(s => !s.completed);
  const displayStageIndex = currentStageIndex === -1 ? stages.length - 1 : currentStageIndex - 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      
      {/* Header */}
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
            <h1 className="text-3xl font-serif font-bold text-white">Winner Management</h1>
            <Badge variant={handover.handover_completed ? 'success' : 'warning'}>
              {stages[displayStageIndex]?.label || 'In Progress'}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="primary" 
            className="flex items-center gap-2" 
            onClick={() => document.getElementById('communication-hub')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <Mail size={16} />
            Chat with Winner
          </Button>
          <Button variant="outline" className="flex items-center gap-2" onClick={() => navigate(`/admin/competitions/${competitionId}`)}>
            <ExternalLink size={16} />
            View Competition
          </Button>
        </div>
      </div>

      {/* Winner Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <User size={12} /> Winner
                </p>
                <p className="text-lg font-bold text-white flex items-center gap-2">
                  {winnerUser.display_name || winnerUser.name || 'Unknown User'} 
                  <span className="text-xs font-normal px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400">{winnerUser.email}</span>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <TicketIcon size={12} /> Winning Ticket
                </p>
                <p className="text-lg font-mono font-bold text-primary">#{winnerTicket.ticket_sequence || winnerTicket.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <Trophy size={12} /> Competition
                </p>
                <p className="text-white font-medium">{competition.title}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <Calendar size={12} /> Draw Date
                </p>
                <p className="text-white font-medium">
                  {competition.draw_date?.toDate() ? competition.draw_date.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Handover Quick Status */}
        <Card>
          <CardContent className="p-6 space-y-4">
             <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-2">Handover Status</h3>
             <div className="space-y-3">
               <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Contacted</span>
                 <Badge variant={handover.is_contacted ? 'success' : 'neutral'}>{handover.is_contacted ? 'Yes' : 'No'}</Badge>
               </div>
               <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Prize Sent</span>
                 <Badge variant={handover.prize_sent ? 'success' : 'neutral'}>{handover.prize_sent ? 'Yes' : 'No'}</Badge>
               </div>
               <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Completed</span>
                 <Badge variant={handover.handover_completed ? 'success' : 'neutral'}>{handover.handover_completed ? 'Completed' : 'Pending'}</Badge>
               </div>
             </div>
             
             {!handover.handover_completed && (
               <div className="pt-4 space-y-2">
                 {!handover.is_contacted && (
                   <Button variant="outline" className="w-full text-xs h-9" onClick={() => handleHandoverAction('contacted')} loading={handoverLoading === 'contacted'}>
                     Mark as Contacted
                   </Button>
                 )}
                 {handover.is_contacted && !handover.prize_sent && (
                   <Button variant="outline" className="w-full text-xs h-9" onClick={() => handleHandoverAction('prize_sent')} loading={handoverLoading === 'prize_sent'}>
                     Mark as Prize Sent
                   </Button>
                 )}
                 {handover.prize_sent && !handover.handover_completed && (
                   <Button variant="primary" className="w-full text-xs h-9" onClick={() => handleHandoverAction('completed')} loading={handoverLoading === 'completed'}>
                     Complete Handover
                   </Button>
                 )}
               </div>
             )}
          </CardContent>
        </Card>
      </div>

      {/* Status Timeline */}
      <Card>
        <CardContent className="p-8">
          <div className="relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-white/10 -z-10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500 ease-in-out"
                style={{ width: `${(displayStageIndex / (stages.length - 1)) * 100}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between relative z-10">
              {stages.map((stage, index) => {
                const isCompleted = index <= displayStageIndex;
                const isCurrent = index === displayStageIndex + 1;
                return (
                  <div key={index} className="relative flex flex-col items-center gap-3">
                    <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-4 transition-colors duration-300 bg-[#121212] ${
                      isCompleted 
                        ? 'border-emerald-500 text-emerald-500' 
                        : isCurrent ? 'border-primary text-primary' : 'border-white/10 text-gray-600'
                    }`}>
                      {isCompleted ? <CheckCircle2 size={20} /> : <span className="w-2.5 h-2.5 rounded-full bg-gray-600"></span>}
                    </div>
                    <span className={`text-xs font-medium whitespace-nowrap absolute -bottom-8 ${
                      index === 0 ? 'left-0' : index === stages.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    } ${
                      isCompleted ? 'text-emerald-400' : isCurrent ? 'text-white' : 'text-gray-500'
                    }`}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-8">
        
        {/* LEFT: Communication */}
        <div className="space-y-6" id="communication-hub">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail size={20} className="text-primary" />
            Communication Hub
          </h2>
          
          <Card className="flex flex-col h-[600px] border-white/5 bg-[#0a0a0a]">
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-12">
                   <Mail className="text-gray-700 mb-4" size={48} />
                   <p className="text-gray-500 text-sm">No messages yet. Start the conversation with the winner!</p>
                </div>
              ) : messages.map((msg) => {
                const isMe = msg.sender_id?.id === currentUser?.uid || msg.is_sender_admin;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <p className="text-[10px] text-gray-500 mb-1 px-1">{isMe ? 'You' : (winnerUser.name || 'Winner')} • {msg.created_at?.toDate()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className={`px-4 py-3 rounded-2xl max-w-[85%] break-words ${
                      isMe 
                        ? 'bg-primary/20 text-white rounded-tr-none border border-primary/30' 
                        : 'bg-white/5 text-gray-200 rounded-tl-none border border-white/10'
                    }`}>
                      {msg.message && <p className="mb-0">{msg.message}</p>}
                      {msg.image && (
                        <div className={`${msg.message ? 'mt-2 pt-2 border-t border-white/5' : ''}`}>
                          <a href={msg.image} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-white/10 hover:border-primary/50 transition-colors">
                            <img src={msg.image} alt="Attached" className="max-h-64 w-full object-contain bg-black/20" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-[#121212]/50 space-y-3">
              {attachmentFile && (
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2 animate-in slide-in-from-bottom-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <ImageIcon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">{attachmentFile.name}</p>
                    <p className="text-[10px] text-gray-500">{(attachmentFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => { setAttachmentFile(null); if (chatFileInputRef.current) chatFileInputRef.current.value = ''; }}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => chatFileInputRef.current?.click()}
                  className="w-12 h-12 rounded-xl border border-white/10 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/50 transition-all bg-white/5"
                  disabled={isSending || handover.handover_completed}
                >
                  <Paperclip size={20} />
                </button>
                <input 
                  type="file" 
                  ref={chatFileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleAttachmentChange} 
                />
                
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message to the winner..." 
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-all"
                  disabled={isSending || handover.handover_completed}
                />
                <button 
                  type="submit" 
                  disabled={(!newMessage.trim() && !attachmentFile) || isSending || handover.handover_completed}
                  className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_20px_oklch(0.78_0.14_78/0.3)]"
                >
                  {isSending ? (
                    <Loader2 size={20} className="animate-spin text-black" />
                  ) : (
                    <Send size={20} className="text-black fill-current" />
                  )}
                </button>
              </div>
            </form>
          </Card>
        </div>

        {/* RIGHT: Proof Uploads */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Upload size={20} className="text-primary" />
            Handover Assets & Proof
          </h2>
          
          <Card className="h-[600px] overflow-y-auto bg-[#0a0a0a] border-white/5">
            <CardContent className="p-6 space-y-6">
              
              {/* ID Proof */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-2"><FileText size={16} className="text-primary" /> Winner ID Proof</span>
                  {handover.id_proof_url ? <Badge variant="success">Verified</Badge> : <Badge variant="neutral">Missing</Badge>}
                </label>
                {handover.id_proof_url ? (
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <FileText size={20} />
                      </div>
                      <div className="overflow-hidden max-w-[200px]">
                        <p className="text-sm text-white font-medium truncate">Winner ID Document</p>
                        <a href={handover.id_proof_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">View Document</a>
                      </div>
                    </div>
                    <label className="cursor-pointer p-2 text-gray-500 hover:text-white transition-colors">
                      <RefreshCw size={16} />
                      <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'id_proof')} disabled={isUploading === 'id_proof'} />
                    </label>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'id_proof')} disabled={!!isUploading} />
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      {isUploading === 'id_proof' ? <Loader2 size={24} className="animate-spin text-primary" /> : <FileText className="text-gray-500" size={24} />}
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-white font-medium">Upload Winner ID Proof</p>
                      <p className="text-xs text-gray-500 mt-1">PDF or Image required</p>
                    </div>
                  </label>
                )}
              </div>

              {/* Handover Photo */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-2"><ImageIcon size={16} className="text-primary" /> Handover Photo</span>
                  {handover.handover_photo_url ? <Badge variant="success">Uploaded</Badge> : <Badge variant="neutral">Required</Badge>}
                </label>
                {handover.handover_photo_url ? (
                  <div className="relative group rounded-xl overflow-hidden aspect-video border border-white/10 bg-black">
                     <img src={handover.handover_photo_url} alt="Handover" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <a href={handover.handover_photo_url} target="_blank" rel="noreferrer" className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20"><ExternalLink size={20} /></a>
                        <label className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 cursor-pointer">
                          <RefreshCw size={20} />
                          <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'photo')} disabled={!!isUploading} />
                        </label>
                     </div>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'photo')} disabled={!!isUploading} />
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      {isUploading === 'photo' ? <Loader2 size={24} className="animate-spin text-primary" /> : <ImageIcon className="text-gray-500" size={24} />}
                    </div>
                    <p className="text-sm text-white font-medium">Click to upload handover photo</p>
                  </label>
                )}
              </div>

              {/* Handover Video */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Video size={16} className="text-primary" /> Handover Video</span>
                  {handover.handover_video_url ? <Badge variant="success">Uploaded</Badge> : <Badge variant="neutral">Optional</Badge>}
                </label>
                {handover.handover_video_url ? (
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Video size={20} />
                      </div>
                      <div className="overflow-hidden max-w-[200px]">
                        <p className="text-sm text-white font-medium truncate">Handover Ceremony Video</p>
                        <a href={handover.handover_video_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Watch Video</a>
                      </div>
                    </div>
                    <label className="cursor-pointer p-2 text-gray-500 hover:text-white transition-colors">
                      <RefreshCw size={16} />
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, 'video')} disabled={!!isUploading} />
                    </label>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, 'video')} disabled={!!isUploading} />
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      {isUploading === 'video' ? <Loader2 size={24} className="animate-spin text-primary" /> : <Video className="text-gray-500" size={24} />}
                    </div>
                    <p className="text-sm text-white font-medium">Click to upload handover video</p>
                  </label>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default WinnerDetail;
