import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/Table';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import CompetitionForm from '@/modules/admin/competitions/components/CompetitionForm';
import {
  ArrowLeft, Trophy, ExternalLink,
  Users, Edit3, LayoutDashboard, Clock, Tag, Ticket, CheckCircle2, Loader2, Trash2
} from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';

import { toast } from 'react-hot-toast';
import { Timestamp, deleteField, doc, getDoc, onSnapshot, query, collection, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { 
  updateCompetition, 
  syncCompetitionQuestions, 
  deleteCompetition,
  fetchCompetitionParticipants 
} from '@/modules/admin/competitions/services/adminCompetitionService';
import {
  selectCompetitionWinner,
  startCompetitionLiveDraw,
  updateCompetitionHandover,
} from '@/modules/admin/competitions/services/winnerWorkflowService';
import { uploadImages } from '@/shared/services/storageService';
import { formatStatus } from '@/shared/utils/formatters';

const CompetitionDetail = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('admin');

  const [activeTab, setActiveTab] = useState('overview');
  const [isDrawConfirmed, setIsDrawConfirmed] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState(null);
  const [winnerTicketSequence, setWinnerTicketSequence] = useState('');
  const [winnerModalOpen, setWinnerModalOpen] = useState(false);
  const [competition, setCompetition] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingDraw, setIsStartingDraw] = useState(false);
  const [isSelectingWinner, setIsSelectingWinner] = useState(false);
  const [handoverActionLoading, setHandoverActionLoading] = useState('');
  const [participantsData, setParticipantsData] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [participantTicketsModalOpen, setParticipantTicketsModalOpen] = useState(false);
  const [selectedParticipantForTickets, setSelectedParticipantForTickets] = useState(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'participants', 'edit', 'draw'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const hydrateWinnerSummary = (compDoc) => {
    const winnerUser = compDoc?.winnerDetails?.user;
    const winnerTicket = compDoc?.winnerDetails?.ticket;

    if (!winnerUser || !winnerTicket) {
      return null;
    }

    return {
      id: winnerUser.id,
      name: winnerUser.display_name || winnerUser.name || winnerUser.full_name || 'Winner',
      ticket: String(winnerTicket.ticket_sequence || winnerTicket.ticket_number || winnerTicket.id),
      date: (compDoc.updated_at?.toDate?.() || compDoc.created_at?.toDate?.() || new Date()).toISOString(),
    };
  };

  useEffect(() => {
    if (!id) return undefined;

    setLoading(true);

    const competitionRef = doc(db, 'competition', id);

    const unsub = onSnapshot(competitionRef, async (docSnap) => {
      if (!docSnap.exists()) {
        toast.error('Competition not found');
        navigate('/admin/competitions');
        setLoading(false);
        return;
      }

      const compDoc = { id: docSnap.id, ...docSnap.data() };
      const winnerRef = compDoc.winner_ref;
      const winnerTicketRef = compDoc.winner_ticket_ref;

      let winnerDetails = null;
      try {
        if (winnerRef || winnerTicketRef) {
          const [winnerSnap, ticketSnap] = await Promise.all([
            winnerRef ? getDoc(winnerRef) : Promise.resolve(null),
            winnerTicketRef ? getDoc(winnerTicketRef) : Promise.resolve(null),
          ]);

          winnerDetails = {
            user: winnerSnap?.exists() ? { id: winnerSnap.id, ...winnerSnap.data() } : null,
            ticket: ticketSnap?.exists() ? { id: ticketSnap.id, ...ticketSnap.data() } : null,
          };
        }
      } catch (err) {
        console.error('Error resolving winner refs:', err);
      }

      const sold = compDoc.sold_tickets || 0;
      const total = compDoc.total_tickets || 1000;
      const price = compDoc.ticket_price || 0;
      const hydratedWinner = hydrateWinnerSummary({ ...compDoc, winnerDetails });

      setCompetition({
        ...compDoc,
        winnerDetails,
        price,
        prizeValue: compDoc.prize_value || 0,
        ticketsSold: sold,
        maxTickets: total,
        revenue: sold * price,
      });
      setSelectedWinner(hydratedWinner);
      setWinnerTicketSequence(hydratedWinner?.ticket || '');
    });
    return () => unsub();
  }, [id, navigate]);

  // Separate listener for questions
  useEffect(() => {
    if (!id) return undefined;

    const questionsQuery = query(
      collection(db, 'questions'), 
      where('competition_id', '==', doc(db, 'competition', id))
    );

    const unsub = onSnapshot(questionsQuery, (snapshot) => {
      const qs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`[CompetitionDetail] Loaded ${qs.length} questions for ${id}`);
      setQuestions(qs);
      setLoadingQuestions(false);
      setLoading(false); // Both competition and questions are now ready
    }, (err) => {
      console.error('Error listening to questions:', err);
      setLoadingQuestions(false);
      setLoading(false);
    });

    return () => unsub();
  }, [id]);

  const fetchParticipants = async () => {
    if (!competition?.participants || competition.participants.length === 0) {
      setParticipantsData([]);
      return;
    }
    setLoadingParticipants(true);
    try {
      const participantsList = await fetchCompetitionParticipants(id, competition.participants);
      setParticipantsData(participantsList);
    } catch (error) {
      console.error('Error fetching participants:', error);
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
      // 1. Upload competition images
      const imageUrls = await uploadImages(formData.images, 'competitions');

      const drawDateTimeStr = formData.drawEndDate && formData.drawEndTime
        ? `${formData.drawEndDate}T${formData.drawEndTime}`
        : (formData.drawEndDate ? `${formData.drawEndDate}T00:00` : null);
      const drawDateTimestamp = drawDateTimeStr ? new Date(drawDateTimeStr).getTime() : (competition.draw_date?.toMillis() || Date.now());

      const updateData = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        ticket_price: parseFloat(formData.ticketPrice) || 0,
        total_tickets: parseInt(formData.maxTickets) || 0,
        prize_value: parseFloat(formData.prizeValue) || 0,
        prize_name: formData.prizeName || '',
        image: imageUrls,
        status: isDraft ? 'draft' : (() => {
          const totalTickets = parseInt(formData.maxTickets) || 0;
          const soldTickets = competition.sold_tickets || 0;
          
          // If admin makes max tickets <= sold tickets, it's sold out
          if (totalTickets > 0 && totalTickets <= soldTickets) return 'sold_out';
          if (totalTickets === 0) return 'sold_out';
          
          // Otherwise keep existing status or move to active if it was draft
          return competition.status === 'draft' ? 'active' : competition.status;
        })(),
        draw_date: Timestamp.fromMillis(drawDateTimestamp),
        tag: formData.tag || '',
        instagram_live_url: formData.instagramLiveLink || '',
        included_things: formData.includedThings.filter(thing => thing.trim() !== ''),
        is_featured: formData.isFeatured || false,
      };

      // 2. Sync questions with image uploads
      if (formData.questions && formData.questions.length > 0) {
        const qsToSync = await Promise.all(formData.questions.map(async (qData, idx) => {
          const timestamp = Date.now();
          
          // CRITICAL: Upload question images (handles both File objects and existing URLs)
          const uploadedQuestionImages = await uploadImages(qData.questionImages || [], 'questions');

          const answers = qData.answers.map((ans, i) => {
            const option_id = ans.option_id || `opt_${timestamp}_${i}`;
            return {
              option_id,
              option: ans.text
            };
          });
          
          const correctAnswerIndex = qData.answers.findIndex(a => a.isCorrect);
          const existingQuestion = questions.find((_, qIdx) => qIdx === idx);

          return {
            id: existingQuestion?.id,
            question: qData.questionText,
            images: uploadedQuestionImages,
            option: answers,
            answer: {
              option_id: answers[correctAnswerIndex]?.option_id || answers[0]?.option_id || `opt_${timestamp}_0`
            }
          };
        }));

        await syncCompetitionQuestions(id, qsToSync);
      }

      // 3. Update main competition doc
      await updateCompetition(id, {
        ...updateData,
        sub_title: deleteField(),
      });

      setCompetition(prev => ({
        ...prev,
        ...updateData,
        draw_date: Timestamp.fromMillis(drawDateTimestamp),
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



  const handleDelete = async () => {
    // Edge Case: Prevent deletion if users have already bought tickets
    if ((competition.last_ticket_sequence || 0) > 0 || (competition.sold_tickets || 0) > 0) {
      toast.error('This competition already has participants and cannot be deleted.');
      setDeleteModalOpen(false);
      return;
    }

    setIsDeleting(true);
    const loadingToast = toast.loading('Deleting competition...');
    try {
      await deleteCompetition(id);
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

  const refreshCompetition = async () => {
    return undefined;
  };

  const handleStartLiveDraw = async () => {
    if (!competition?.id) return;
    if (competition.status !== 'ready_to_draw') {
      toast.error('Only competitions with status Draw Soon can start live draw.');
      return;
    }

    setIsStartingDraw(true);
    const loadingToast = toast.loading('Starting live draw...');
    try {
      await startCompetitionLiveDraw(competition.id);
      toast.success('Live draw started', { id: loadingToast });
      await refreshCompetition();
    } catch (err) {
      console.error('Error starting live draw:', err);
      toast.error(err.message || 'Failed to start the live draw', { id: loadingToast });
    } finally {
      setIsStartingDraw(false);
    }
  };

  const handleConfirmWinner = async () => {
    if (!competition?.id || !winnerTicketSequence.trim()) {
      toast.error('Enter a winning ticket sequence first');
      return;
    }

    setIsSelectingWinner(true);
    const loadingToast = toast.loading('Selecting winner...');
    try {
      const result = await selectCompetitionWinner(competition.id, winnerTicketSequence);
      toast.success('Winner selected successfully', { id: loadingToast });
      setWinnerModalOpen(false);
      setIsDrawConfirmed(false);
      setWinnerTicketSequence('');
      setSelectedWinner({
        id: result.winnerUserId,
        name: selectedWinner?.name || 'Winner',
        ticket: result.winnerTicketSequence,
        date: new Date().toISOString(),
      });
      await refreshCompetition();
    } catch (err) {
      console.error('Error selecting winner:', err);
      toast.error(err.message || 'Failed to select winner', { id: loadingToast });
    } finally {
      setIsSelectingWinner(false);
    }
  };

  const handleHandoverAction = async (stage) => {
    if (!competition?.id) return;

    setHandoverActionLoading(stage);
    const loadingToast = toast.loading('Updating handover...');
    try {
      await updateCompetitionHandover(competition.id, stage);
      toast.success('Handover updated', { id: loadingToast });
      await refreshCompetition();
    } catch (err) {
      console.error('Error updating handover:', err);
      toast.error(err.message || 'Failed to update handover', { id: loadingToast });
    } finally {
      setHandoverActionLoading('');
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
                <div className="absolute inset-0 bg-linear-to-tr from-primary/20 to-transparent"></div>
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
                <p className="font-medium text-white">
                  {competition.draw_date ? competition.draw_date.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </p>
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
                if (!competition.draw_date) return <p className="text-sm text-gray-500">No deadline set</p>;
                const diff = competition.draw_date.toMillis() - Date.now();
                const isStatusEnded = competition.status === 'end' || competition.status === 'completed';

                if (diff <= 0) {
                  return isStatusEnded ? (
                    <p className="text-sm text-emerald-400 font-bold uppercase tracking-wider">COMPLETED</p>
                  ) : (
                    <p className="text-sm text-yellow-500 font-bold uppercase tracking-wider">Draw Soon</p>
                  );
                }

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                return (
                  <div className="flex justify-center gap-2">
                    <div className="bg-white/5 px-3 py-2 rounded-lg min-w-12.5">
                      <span className="text-xl font-mono text-white">{String(days).padStart(2, '0')}</span>
                      <span className="text-[10px] text-gray-500 block">{t('competitions.detail.days')}</span>
                    </div>
                    <div className="bg-white/5 px-3 py-2 rounded-lg min-w-12.5">
                      <span className="text-xl font-mono text-white">{String(hours).padStart(2, '0')}</span>
                      <span className="text-[10px] text-gray-500 block">{t('competitions.detail.hrs')}</span>
                    </div>
                    <div className="bg-white/5 px-3 py-2 rounded-lg min-w-12.5">
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
                  <div className="flex flex-wrap gap-1 max-w-50">
                    {p.tickets.slice(0, 3).map((ticket, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-primary font-mono">
                        #{ticket}
                      </span>
                    ))}
                    {p.tickets.length > 3 && (
                      <button 
                        onClick={() => {
                          setSelectedParticipantForTickets(p);
                          setParticipantTicketsModalOpen(true);
                        }}
                        className="px-2 py-0.5 text-[10px] text-primary hover:text-primary/80 font-bold underline cursor-pointer transition-colors"
                      >
                        +{p.tickets.length - 3} more
                      </button>
                    )}
                    {p.tickets.length === 0 && (
                      <span className="text-gray-600 text-[10px]">No tickets</span>
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

    const drawInfo = competition.drawEndDate || competition.drawEndTime
      ? { date: competition.drawEndDate || '', time: competition.drawEndTime || '' }
      : getLocalInfo(competition.draw_date);

    return {
      title: competition.title || '',
      description: competition.description || '',
      prizeName: competition.prize_name || '',
      prizeValue: competition.prize_value || '',
      category: competition.category || 'Tech',
      isFeatured: competition.is_featured || false,
      images: competition.image || [],
      imagePreviews: competition.image || [],
      ticketPrice: competition.ticket_price || '',
      maxTickets: competition.total_tickets || '',
      drawEndDate: drawInfo.date,
      drawEndTime: drawInfo.time,
      tag: competition.tag || '',
      instagramLiveLink: competition.instagram_live_url || '',
      includedThings: competition.included_things || [],
      questions: questions.map(q => ({
        questionText: q.question,
        questionImages: q.images || [],
        questionImagePreviews: q.images || [],
        answers: q.option.map(opt => ({
          text: opt.option,
          option_id: opt.option_id || undefined,
          isCorrect: q.answer?.option_id === opt.option_id
        }))
      }))
    };
  };

  const renderEdit = () => (
    <div className={`fade-in ${isSaving ? 'pointer-events-none opacity-60' : ''}`}>
      <CompetitionForm
        isEditMode={true}
        competitionStatus={competition.status}
        initialData={mapToFormData()}
        onCancel={() => handleTabChange('overview')}
        onSaveDraft={(data) => handleSave(data, true)}
        onSubmit={(data) => handleSave(data, false)}
      />
    </div>
  );

  const renderWinnerDetails = () => {
    const winner = selectedWinner;

    if (!winner) return null;

    const handover = competition?.handover_details || {};

    return (
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
                {(winner.name || 'W').charAt(0)}
              </div>
              <div>
                <p className="text-sm text-gray-400">{t('competitions.detail.draw.winnerName')}</p>
                <p className="text-xl font-bold text-white">{winner.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-sm text-gray-400 mb-1">{t('competitions.detail.draw.winningTicket')}</p>
                <Badge variant="hot" className="text-sm px-3 py-1 font-mono">{winner.ticket}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">{t('competitions.detail.drawDate')}</p>
                <p className="text-white font-medium">
                  {new Date(winner.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <div className="p-4 rounded-xl border border-white/10 bg-white/5">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Contacted</p>
            <p className="text-white font-semibold">{handover.is_contacted ? 'Yes' : 'No'}</p>
          </div>
          <div className="p-4 rounded-xl border border-white/10 bg-white/5">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Prize Sent</p>
            <p className="text-white font-semibold">{handover.prize_sent ? 'Yes' : 'No'}</p>
          </div>
          <div className="p-4 rounded-xl border border-white/10 bg-white/5">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Handover</p>
            <p className="text-white font-semibold">{handover.handover_completed ? 'Completed' : 'Pending'}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-6 border-t border-white/5 mt-4">
          <Button 
            variant="primary" 
            className="w-full sm:w-auto px-8 h-12 text-base font-bold shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.2)] hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.4)] transition-all"
            onClick={() => navigate(`/admin/winners/${competition.id}`)}
          >
            <ExternalLink size={18} className="mr-2" />
            Manage Winner & Handover
          </Button>
        </div>
      </div>
    );
  };

  const renderDraw = () => (
    <Card className="max-w-2xl mx-auto fade-in">
      <div className="p-8 text-center space-y-8">
        {(() => {
          const drawStatus = competition.status;
          const canManageDraw = ['ready_to_draw', 'drawing'].includes(drawStatus);

          if (selectedWinner) {
            return renderWinnerDetails();
          }

          if (!canManageDraw) {
            const isTimerVisible = ['active', 'sold_out'].includes(drawStatus);
            return (
              <div className="space-y-6">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Trophy className="text-primary" size={40} />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-white">{t('competitions.detail.draw.title')}</h2>
                  <p className="text-gray-400 mt-2 max-w-md mx-auto">
                    {`This competition is currently ${formatStatus(drawStatus).toLowerCase()}. Draw controls are only available when the status is Draw Soon.`}
                  </p>
                </div>

                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl inline-block w-full">
                  <p className="text-sm text-gray-500 mb-3 uppercase tracking-widest font-medium">Current Status</p>
                  <p className="text-xl font-bold text-white">{formatStatus(drawStatus) || 'Unknown'}</p>
                </div>

                {isTimerVisible && competition.draw_date && (
                  <div className="p-6 bg-white/5 border border-white/10 rounded-2xl inline-block w-full">
                    <p className="text-sm text-gray-500 mb-3 uppercase tracking-widest font-medium">{t('competitions.detail.draw.timeUntilDraw')}</p>
                    {(() => {
                      const diff = Math.max(0, competition.draw_date.toMillis() - Date.now());
                      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                      return (
                        <div className="flex justify-center gap-3 sm:gap-6">
                          <div className="flex flex-col items-center">
                            <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">{String(days).padStart(2, '0')}</span>
                            <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.days')}</span>
                          </div>
                          <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                          <div className="flex flex-col items-center">
                            <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">{String(hours).padStart(2, '0')}</span>
                            <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.hours')}</span>
                          </div>
                          <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                          <div className="flex flex-col items-center">
                            <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">{String(mins).padStart(2, '0')}</span>
                            <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.mins')}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

              </div>
            );
          }

          return (
            <>
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Trophy className="text-primary" size={40} />
              </div>

            <div>
              <h2 className="text-2xl font-bold text-white">{t('competitions.detail.draw.title')}</h2>
              <p className="text-gray-400 mt-2 max-w-md mx-auto">
                {t('competitions.detail.draw.scheduledFor')} <span className="text-white font-medium">{competition.draw_date ? competition.draw_date.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>.
              </p>
            </div>

            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl inline-block w-full">
              <p className="text-sm text-gray-500 mb-3 uppercase tracking-widest font-medium">{t('competitions.detail.draw.timeUntilDraw')}</p>
              {(() => {
                const diff = (competition.draw_date?.toMillis() || 0) - Date.now();
                const isStatusEnded = competition.status === 'end' || competition.status === 'completed';

                if (diff <= 0) {
                  return isStatusEnded ? (
                    <div className="py-4">
                      <p className="text-3xl font-bold text-emerald-400 uppercase tracking-widest">COMPLETED</p>
                    </div>
                  ) : (
                    <div className="py-4">
                      <p className="text-3xl font-bold text-yellow-500 uppercase tracking-widest">READY TO DRAW</p>
                    </div>
                  );
                }

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                return (
                  <div className="flex justify-center gap-3 sm:gap-6">
                    <div className="flex flex-col items-center">
                      <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">{String(days).padStart(2, '0')}</span>
                      <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.days')}</span>
                    </div>
                    <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">{String(hours).padStart(2, '0')}</span>
                      <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.hours')}</span>
                    </div>
                    <span className="text-3xl sm:text-4xl font-mono text-white/20 font-bold self-start mt-2">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-3xl sm:text-4xl font-mono text-white font-bold bg-[#0a0a0a] px-4 py-3 rounded-xl border border-white/10 shadow-inner">{String(mins).padStart(2, '0')}</span>
                      <span className="text-xs text-gray-500 mt-2 uppercase font-medium tracking-wider">{t('competitions.detail.draw.mins')}</span>
                    </div>
                  </div>
                );
              })()}
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

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  variant="outline"
                  disabled={isStartingDraw || competition.status !== 'ready_to_draw'}
                  onClick={handleStartLiveDraw}
                  loading={isStartingDraw}
                >
                  Start Live Draw
                </Button>

                <Button
                  variant="primary"
                  disabled={!isDrawConfirmed || competition.status !== 'drawing'}
                  onClick={() => setWinnerModalOpen(true)}
                  className={`w-full sm:w-auto px-8 py-4 text-lg font-bold transition-all ${isDrawConfirmed && competition.status === 'drawing'
                    ? 'shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.5)]'
                    : 'opacity-50 cursor-not-allowed'
                    }`}
                >
                  Enter Winning Ticket
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-4">Start the draw first, then confirm the winning ticket sequence.</p>
            </div>
          </>
          );
        })()}
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
        onClick={() => {
          if (location.state?.fromDashboard) {
            navigate(-1);
          } else {
            navigate('/admin/competitions');
          }
        }}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm w-fit"
      >
        <ArrowLeft size={16} />
        {location.state?.fromDashboard ? t('common.back') : t('competitions.detail.backToCompetitions')}
      </button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-serif font-bold text-white">{competition.title}</h1>
            {(() => {
              const now = new Date();
              const isTimeUp = competition.status === 'active' && competition.draw_date && competition.draw_date.toMillis() <= now.getTime();
              
              if (isTimeUp) {
                return <Badge variant="warning" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">Draw Soon</Badge>;
              }

              if (competition.status === 'drawing') {
                return <Badge variant="warning" className="bg-orange-500/20 text-orange-300 border-orange-500/50">LIVE DRAWING</Badge>;
              }

              if (competition.status === 'winner_announced') {
                return <Badge variant="success" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50">WINNER ANNOUNCED</Badge>;
              }

              if (competition.status === 'completed') {
                return <Badge variant="neutral" className="bg-white/10 text-white border-white/20">COMPLETED</Badge>;
              }
              
              return (
                <Badge variant={competition.status === 'active' ? 'success' : competition.status === 'draft' ? 'warning' : 'neutral'}>
                  {formatStatus(competition.status)}
                </Badge>
              );
            })()}
          </div>
          <p className="text-xs text-gray-500 mt-1">ID: #{competition.id}</p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-2 mt-4 md:mt-0 w-full md:w-auto">

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

      {/* Participant Tickets Modal */}
      <Modal
        isOpen={participantTicketsModalOpen}
        onClose={() => {
          setParticipantTicketsModalOpen(false);
          setSelectedParticipantForTickets(null);
        }}
        title="Participant Tickets"
        description={selectedParticipantForTickets ? `Viewing all ${selectedParticipantForTickets.tickets.length} tickets for ${selectedParticipantForTickets.name}` : ''}
      >
        <div className="space-y-6 py-2">
          <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {selectedParticipantForTickets?.tickets.map((ticket, idx) => (
                <div 
                  key={idx}
                  className="flex flex-col p-3 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-all group"
                >
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 group-hover:text-primary/70 transition-colors">Ticket</span>
                  <span className="text-sm font-mono font-bold text-white group-hover:text-primary transition-colors">#{ticket}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-white/10">
            <Button 
              variant="outline" 
              size="sm"
              className="px-6" 
              onClick={() => setParticipantTicketsModalOpen(false)}
            >
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Winner Ticket Modal */}
      <Modal
        isOpen={winnerModalOpen}
        onClose={() => setWinnerModalOpen(false)}
        title="Enter Winning Ticket"
        description="Make sure the live draw is already active before confirming the winning sequence."
      >
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Ticket sequence</label>
            <input
              type="text"
              value={winnerTicketSequence}
              onChange={(e) => setWinnerTicketSequence(e.target.value.toUpperCase())}
              placeholder="Enter ticket number (eg. DT007)"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-primary"
              autoComplete="off"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" className="px-6" onClick={() => setWinnerModalOpen(false)} disabled={isSelectingWinner}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="px-6"
              onClick={handleConfirmWinner}
              loading={isSelectingWinner}
              disabled={!winnerTicketSequence.trim()}
            >
              Confirm Winner
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CompetitionDetail;
