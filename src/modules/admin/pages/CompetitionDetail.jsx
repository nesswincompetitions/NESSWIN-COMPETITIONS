import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/Table';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import CompetitionForm from '../components/CompetitionForm';
import {
  ArrowLeft, CalendarPlus, Trophy,
  Users, Edit3, LayoutDashboard, Clock, Tag, Ticket, CheckCircle2, ArrowRight, Loader2, Trash2
} from 'lucide-react';
import Modal from '../../../components/ui/Modal';

import { toast } from 'react-hot-toast';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../../../utils/firebase';
import { uploadImages } from '../../../services/competitionService';

const CompetitionDetail = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  const [activeTab, setActiveTab] = useState('overview');
  const [isDrawConfirmed, setIsDrawConfirmed] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState(null);
  const [competition, setCompetition] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [participantsData, setParticipantsData] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [extendData, setExtendData] = useState({ date: '', time: '' });
  const [isExtending, setIsExtending] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'participants', 'edit', 'draw'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const compDoc = await getDoc(doc(db, 'competition', id));
        if (compDoc.exists()) {
          const data = compDoc.data();
          const sold = data.sold_tickets || 0;
          const total = data.total_tickets || 1000;
          const price = data.ticket_price || 0;

          setCompetition({
            id: compDoc.id,
            ...data,
            price,
            prizeValue: data.prize_value || 0,
            ticketsSold: sold,
            maxTickets: total,
            revenue: sold * price
          });

          // Fetch questions
          const qQuery = query(collection(db, 'questions'), where('competition_id', '==', doc(db, 'competition', id)));
          const qSnapshot = await getDocs(qQuery);
          const qList = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setQuestions(qList);
        } else {
          toast.error('Competition not found');
          navigate('/admin/competitions');
        }
      } catch (err) {
        console.error('Error fetching competition:', err);
        toast.error('Failed to load competition data');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
  }, [id, navigate]);

  const fetchParticipants = async () => {
    if (!competition?.participants || competition.participants.length === 0) {
      setParticipantsData([]);
      return;
    }
    setLoadingParticipants(true);
    try {
      const uids = competition.participants;
      const participantsList = [];

      for (const uid of uids) {
        const userDoc = await getDoc(doc(db, 'users', uid));
        const userData = userDoc.exists() ? userDoc.data() : { display_name: 'Unknown User', email: 'N/A', is_active: false };

        const ticketsQuery = query(
          collection(db, 'tickets'),
          where('uid', '==', uid),
          where('competition_id', '==', id)
        );
        const ticketsSnapshot = await getDocs(ticketsQuery);
        const ticketNumbers = ticketsSnapshot.docs.map(d => d.data().ticket_number);

        participantsList.push({
          id: uid,
          name: userData.display_name || 'Anonymous',
          email: userData.email,
          tickets: ticketNumbers,
          status: userData.is_active ? 'Active' : 'Inactive'
        });
      }
      setParticipantsData(participantsList);
    } catch (err) {
      console.error('Error fetching participants:', err);
      toast.error('Failed to load participants');
    } finally {
      setLoadingParticipants(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'participants') {
      fetchParticipants();
    }
  }, [activeTab, competition?.participants]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleSave = async (formData, isDraft = false) => {
    setIsSaving(true);
    const loadingToast = toast.loading(isDraft ? 'Saving draft...' : 'Saving changes...');
    try {
      const imageUrls = await uploadImages(formData.images, 'competitions');

      const drawDateTimeStr = formData.drawEndDate && formData.drawEndTime
        ? `${formData.drawEndDate}T${formData.drawEndTime}`
        : (formData.drawEndDate ? `${formData.drawEndDate}T00:00` : null);
      const drawDateTimestamp = drawDateTimeStr ? new Date(drawDateTimeStr).getTime() : (competition.draw_date?.toMillis() || Date.now());

      const countdownDateTimeStr = formData.countdownEndDate && formData.countdownEndTime
        ? `${formData.countdownEndDate}T${formData.countdownEndTime}`
        : (formData.countdownEndDate ? `${formData.countdownEndDate}T00:00` : null);
      const countdownEndTimestamp = countdownDateTimeStr ? new Date(countdownDateTimeStr).getTime() : drawDateTimestamp;

      const updateData = {
        title: formData.title,
        sub_title: formData.subTitle,
        description: formData.description,
        category: formData.category,
        ticket_price: parseFloat(formData.ticketPrice) || 0,
        total_tickets: parseInt(formData.maxTickets) || 0,
        prize_value: parseFloat(formData.prizeValue) || 0,
        prize_name: formData.prizeName || '',
        image: imageUrls,
        status: isDraft ? 'draft' : formData.status,
        draw_date: Timestamp.fromMillis(drawDateTimestamp),
        countdown_end: Timestamp.fromMillis(countdownEndTimestamp),
        instagram_live_url: formData.instagramLiveLink || '',
        prize_video_url: formData.prizeVideoUrl || '',
        included_things: formData.includedThings.filter(thing => thing.trim() !== ''),
        is_featured: formData.isFeatured || false,
        updated_at: serverTimestamp()
      };

      await updateDoc(doc(db, 'competition', id), updateData);

      if (formData.questions && formData.questions.length > 0) {
        for (let i = 0; i < formData.questions.length; i++) {
          const qData = formData.questions[i];
          const questionObj = {
            competition_id: doc(db, 'competition', id),
            question: qData.questionText,
            images: qData.questionImagePreviews || [],
            option: qData.answers.map((ans, idx) => ({
              option_id: idx + 1,
              option: ans.text
            })),
            answer: {
              option_id: qData.answers.findIndex(a => a.isCorrect) + 1
            },
            updated_at: serverTimestamp()
          };

          if (questions[i]?.id) {
            await updateDoc(doc(db, 'questions', questions[i].id), questionObj);
          } else {
            await addDoc(collection(db, 'questions'), {
              ...questionObj,
              created_at: serverTimestamp()
            });
          }
        }
      }

      setCompetition(prev => ({
        ...prev,
        ...updateData,
        draw_date: Timestamp.fromMillis(drawDateTimestamp),
        countdown_end: Timestamp.fromMillis(countdownEndTimestamp)
      }));

      toast.success(isDraft ? 'Draft updated!' : 'Changes saved!', { id: loadingToast });
      if (!isDraft) handleTabChange('overview');
    } catch (err) {
      console.error('Error saving:', err);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExtendDraw = async () => {
    if (!extendData.date || !extendData.time) {
      toast.error('Please select both date and time');
      return;
    }

    setIsExtending(true);
    const loadingToast = toast.loading('Extending competition...');
    try {
      const countdownTs = Timestamp.fromMillis(new Date(`${extendData.date}T${extendData.time}`).getTime());

      await updateDoc(doc(db, 'competition', id), {
        countdown_end: countdownTs,
        updated_at: serverTimestamp()
      });

      setCompetition(prev => ({ 
        ...prev, 
        countdown_end: countdownTs
      }));
      setIsExtendModalOpen(false);
      toast.success('Competition extended successfully!', { id: loadingToast });
    } catch (err) {
      console.error('Error extending:', err);
      toast.error('Failed to extend competition', { id: loadingToast });
    } finally {
      setIsExtending(false);
    }
  };

  const openExtendModal = () => {
    if (competition?.countdown_end) {
      const d = new Date(competition.countdown_end.toMillis());
      setExtendData({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      });
    }
    setIsExtendModalOpen(true);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const loadingToast = toast.loading('Deleting competition...');
    try {
      await deleteDoc(doc(db, 'competition', id));
      toast.success('Competition deleted successfully', { id: loadingToast });
      navigate('/admin/competitions');
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Failed to delete competition', { id: loadingToast });
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!competition) return null;

  const renderOverview = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 fade-in">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <div className="aspect-video bg-white/5 border-b border-white/10 flex items-center justify-center relative overflow-hidden">
            {competition.image && competition.image[0] ? (
              <img src={competition.image[0]} alt={competition.title} className="w-full h-full object-cover" />
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent"></div>
                <span className="text-gray-500 font-medium text-lg relative z-10">{t('competitions.detail.competitionImage')}</span>
              </>
            )}
            {competition.is_featured && (
              <div className="absolute top-4 left-4 z-10">
                <Badge variant="hot">{t('competitions.detail.featured')}</Badge>
              </div>
            )}
          </div>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{competition.title}</h2>
              <p className="text-gray-400 mt-2">{competition.description}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Tag size={12} /> {t('competitions.detail.category')}</p>
                <p className="font-medium text-white">{competition.category}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Ticket size={12} /> {t('competitions.detail.ticketPrice')}</p>
                <p className="font-medium text-primary">£{competition.price}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Trophy size={12} /> {t('competitions.detail.prizeValue')}</p>
                <p className="font-medium text-white">£{parseInt(competition.prizeValue).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock size={12} /> {t('competitions.detail.drawDate')}</p>
                <p className="font-medium text-white">{competition.draw_date ? competition.draw_date.toDate().toLocaleDateString() : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 space-y-6">
            <h3 className="font-semibold text-lg border-b border-white/10 pb-3">{t('competitions.detail.performance')}</h3>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t('competitions.detail.ticketsSold')}</span>
                <span className="font-medium text-white">{competition.ticketsSold} / {competition.maxTickets}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: `${(competition.ticketsSold / competition.maxTickets) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 text-right">{((competition.ticketsSold / competition.maxTickets) * 100).toFixed(1)}% {t('competitions.detail.soldLabel')}</p>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">{t('competitions.detail.totalRevenue')}</p>
                <p className="text-2xl font-bold text-white mt-1">£{competition.revenue.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-xl">💰</span>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 text-center">
              <p className="text-xs text-gray-500 mb-2">{t('competitions.detail.drawEndsIn')}</p>
              {(() => {
                if (!competition.countdown_end) return <p className="text-sm text-gray-500">No deadline set</p>;
                const diff = competition.countdown_end.toMillis() - Date.now();
                if (diff <= 0) return <p className="text-sm text-red-400 font-bold">COMPLETED</p>;

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                return (
                  <div className="flex justify-center gap-2">
                    <div className="bg-white/5 px-3 py-2 rounded-lg min-w-[50px]">
                      <span className="text-xl font-mono text-white">{String(days).padStart(2, '0')}</span>
                      <span className="text-[10px] text-gray-500 block">{t('competitions.detail.days')}</span>
                    </div>
                    <div className="bg-white/5 px-3 py-2 rounded-lg min-w-[50px]">
                      <span className="text-xl font-mono text-white">{String(hours).padStart(2, '0')}</span>
                      <span className="text-[10px] text-gray-500 block">{t('competitions.detail.hrs')}</span>
                    </div>
                    <div className="bg-white/5 px-3 py-2 rounded-lg min-w-[50px]">
                      <span className="text-xl font-mono text-white">{String(mins).padStart(2, '0')}</span>
                      <span className="text-[10px] text-gray-500 block">{t('competitions.detail.min')}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderParticipants = () => (
    <Card className="fade-in">
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('competitions.detail.participants.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('competitions.detail.participants.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm">{t('common.exportCsv')}</Button>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('competitions.detail.participants.tableUser')}</TableHead>
              <TableHead>{t('competitions.detail.participants.tableEmail')}</TableHead>
              <TableHead>{t('competitions.detail.participants.tableTickets')}</TableHead>
              <TableHead>{t('competitions.detail.participants.tableStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingParticipants ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <Loader2 size={32} className="animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Loading participant data...</p>
                </TableCell>
              </TableRow>
            ) : participantsData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="flex items-center justify-center w-full py-16 text-gray-500">
                    No participants found for this competition.
                  </div>
                </TableCell>
              </TableRow>
            ) : participantsData.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-white">{p.name}</TableCell>
                <TableCell className="text-gray-400">{p.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[300px]">
                    {p.tickets.length > 0 ? (
                      p.tickets.map(tk => (
                        <span key={tk} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-primary">#{tk}</span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-600 italic">No tickets found</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === 'Active' ? 'success' : 'neutral'}>
                    {p.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const mapToFormData = () => {
    const getLocalInfo = (ts) => {
      if (!ts) return { date: '', time: '' };
      const d = new Date(ts.toMillis());
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return { date, time };
    };

    const drawInfo = getLocalInfo(competition.draw_date);
    const countdownInfo = getLocalInfo(competition.countdown_end);

    return {
      title: competition.title || '',
      subTitle: competition.sub_title || '',
      description: competition.description || '',
      prizeName: competition.prize_name || '',
      prizeValue: competition.prize_value || '',
      category: competition.category || 'Tech',
      isFeatured: competition.is_featured || false,
      images: competition.image || [],
      imagePreviews: competition.image || [],
      ticketPrice: competition.ticket_price || '',
      maxTickets: competition.total_tickets || '',
      sellOutBehavior: competition.sellOutBehavior || 'auto_end',
      status: competition.status || 'active',
      drawEndDate: drawInfo.date,
      drawEndTime: drawInfo.time,
      countdownEndDate: countdownInfo.date,
      countdownEndTime: countdownInfo.time,
      autoEndDraw: competition.autoEndDraw !== undefined ? competition.autoEndDraw : true,
      instagramLiveLink: competition.instagram_live_url || '',
      includedThings: competition.included_things || [],
      prizeVideoUrl: competition.prize_video_url || '',
      questions: questions.map(q => ({
        questionText: q.question,
        questionImages: q.images || [],
        questionImagePreviews: q.images || [],
        answers: q.option.map(opt => ({
          text: opt.option,
          isCorrect: q.answer?.option_id === opt.option_id
        }))
      }))
    };
  };

  const renderEdit = () => (
    <div className={`fade-in ${isSaving ? 'pointer-events-none opacity-60' : ''}`}>
      <CompetitionForm
        isEditMode={true}
        initialData={mapToFormData()}
        onCancel={() => handleTabChange('overview')}
        onSaveDraft={(data) => handleSave(data, true)}
        onSubmit={(data) => handleSave(data, false)}
      />
    </div>
  );

  const handleSelectWinner = () => {
    setSelectedWinner({
      id: 1,
      name: "John Doe",
      ticket: "#0234",
      date: new Date().toISOString()
    });
  };

  const renderDraw = () => (
    <Card className="max-w-2xl mx-auto fade-in">
      <div className="p-8 text-center space-y-8">

        {selectedWinner ? (
          <div className="space-y-8 fade-in transform scale-in">
            <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border-4 border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
              <span className="text-4xl">🎉</span>
            </div>

            <div>
              <h2 className="text-3xl font-bold text-white mb-2">{t('competitions.detail.draw.winnerSelected')}</h2>
              <p className="text-emerald-400 font-medium">{t('competitions.detail.draw.drawCompleted')}</p>
            </div>

            <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 text-left relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Trophy size={100} />
              </div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
                    {selectedWinner.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">{t('competitions.detail.draw.winnerName')}</p>
                    <p className="text-xl font-bold text-white">{selectedWinner.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('competitions.detail.draw.winningTicket')}</p>
                    <Badge variant="hot" className="text-sm px-3 py-1 font-mono">{selectedWinner.ticket}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('competitions.detail.drawDate')}</p>
                    <p className="text-white font-medium">{new Date(selectedWinner.date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Button variant="outline" onClick={() => setSelectedWinner(null)}>
                {t('competitions.detail.draw.reDraw')}
              </Button>
              <Button variant="primary" className="flex items-center gap-2" onClick={() => navigate(`/admin/winners/${selectedWinner.id}`)}>
                {t('competitions.detail.draw.viewWinnerDetails')} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="text-primary" size={40} />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white">{t('competitions.detail.draw.title')}</h2>
              <p className="text-gray-400 mt-2 max-w-md mx-auto">
                {t('competitions.detail.draw.scheduledFor')} <span className="text-white font-medium">{competition.draw_date ? competition.draw_date.toDate().toLocaleDateString() : '—'}</span>.
              </p>
            </div>

            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl inline-block w-full">
              <p className="text-sm text-gray-500 mb-3 uppercase tracking-widest font-medium">{t('competitions.detail.draw.timeUntilDraw')}</p>
              <div className="flex justify-center gap-3 sm:gap-6">
                <div className="flex flex-col items-center">
                  <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">05</span>
                  <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.days')}</span>
                </div>
                <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">12</span>
                  <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.hours')}</span>
                </div>
                <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">45</span>
                  <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.mins')}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <label className="flex items-center justify-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isDrawConfirmed}
                    onChange={(e) => setIsDrawConfirmed(e.target.checked)}
                    className="w-5 h-5 appearance-none border-2 border-gray-500 rounded bg-[#121212] checked:border-primary checked:bg-primary transition-colors peer"
                  />
                  <CheckCircle2 size={14} className="absolute text-black opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" strokeWidth={3} />
                </div>
                <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                  {t('competitions.detail.draw.confirmLabel')}
                </span>
              </label>

              <Button
                variant="primary"
                disabled={!isDrawConfirmed}
                onClick={handleSelectWinner}
                className={`w-full sm:w-auto px-8 py-4 text-lg font-bold transition-all ${isDrawConfirmed
                  ? 'shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.5)]'
                  : 'opacity-50 cursor-not-allowed'
                  }`}
              >
                {t('competitions.detail.draw.selectWinnerBtn')}
              </Button>
              <p className="text-xs text-gray-500 mt-4">{t('competitions.detail.draw.selectWinnerNote')}</p>
            </div>
          </>
        )}
      </div>
    </Card>
  );

  const tabs = [
    { id: 'overview', label: t('competitions.detail.tabs.overview'), icon: LayoutDashboard },
    { id: 'participants', label: t('competitions.detail.tabs.participants'), icon: Users },
    { id: 'edit', label: t('competitions.detail.tabs.editDetails'), icon: Edit3 },
    { id: 'draw', label: t('competitions.detail.tabs.drawWinner'), icon: Trophy },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 fade-in">
      <button
        onClick={() => navigate('/admin/competitions')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm w-fit"
      >
        <ArrowLeft size={16} />
        {t('competitions.detail.backToCompetitions')}
      </button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-serif font-bold text-white">{competition.title}</h1>
            <Badge variant={competition.status === 'active' ? 'success' : competition.status === 'draft' ? 'warning' : 'neutral'}>
              {competition.status}
            </Badge>
          </div>
          <p className="text-gray-400 font-medium">{competition.sub_title}</p>
          <p className="text-xs text-gray-500 mt-1">ID: #{competition.id}</p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-2 mt-4 md:mt-0 w-full md:w-auto">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={openExtendModal}>
            <CalendarPlus size={14} />
            <span className="hidden sm:inline">{t('competitions.detail.extendDraw')}</span>
            <span className="sm:hidden">{t('common.extend')}</span>
          </Button>
          <Button variant="primary" size="sm" className="flex-1 sm:flex-none" onClick={() => handleTabChange('edit')}>
            <Edit3 size={14} />
            {t('common.edit')}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 sm:flex-none border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50" 
            onClick={() => setDeleteModalOpen(true)}
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">{t('common.delete')}</span>
          </Button>
        </div>
      </div>

      <div className="flex overflow-x-auto hide-scrollbar border-b border-white/10">
        <div className="flex gap-1 min-w-max pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`cursor-pointer flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'participants' && renderParticipants()}
        {activeTab === 'edit' && renderEdit()}
        {activeTab === 'draw' && renderDraw()}
      </div>

      {/* Extend Draw Modal */}
      <Modal
        isOpen={isExtendModalOpen}
        onClose={() => setIsExtendModalOpen(false)}
        title="Extend Competition"
        description="Quickly adjust the countdown deadline without going through full edit steps."
      >
        <div className="space-y-6 py-2">
          <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex gap-3 text-sm text-primary">
            <Clock size={18} className="shrink-0 mt-0.5" />
            <p>Adjust the <strong>Countdown End</strong>. This is when the competition will automatically close and entries will stop.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">New Deadline Date</label>
              <input 
                type="date" 
                value={extendData.date}
                onChange={(e) => setExtendData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">New Deadline Time</label>
              <input 
                type="time" 
                value={extendData.time}
                onChange={(e) => setExtendData(prev => ({ ...prev, time: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <Button 
              variant="outline" 
              size="sm"
              className="px-6" 
              onClick={() => setIsExtendModalOpen(false)}
              disabled={isExtending}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              size="sm"
              className="px-6"
              onClick={handleExtendDraw}
              loading={isExtending}
            >
              Update Deadline
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t('competitions.deleteModal.title')}
        description={t('competitions.deleteModal.description')}
      >
        <div className="space-y-6 py-2">
          <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl flex gap-3 text-sm text-red-400">
            <Trash2 size={18} className="shrink-0 mt-0.5" />
            <p>This action is permanent and will remove all associated data including participants and tickets links.</p>
          </div>

          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              size="sm"
              className="px-6" 
              onClick={() => setDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              {t('common.cancel')}
            </Button>
            <Button 
              variant="primary" 
              size="sm"
              className="px-6 bg-red-500 border-red-500 hover:bg-red-600 text-white"
              onClick={handleDelete}
              loading={isDeleting}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CompetitionDetail;
