import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { fetchAdminCompetitionDetail } from '@/modules/admin/competitions/services/adminCompetitionService';
import { createCompetition } from '@/modules/admin/competitions/services/competitionService';
import CompetitionForm from '@/modules/admin/competitions/components/CompetitionForm';

const CreateCompetition = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(false);

  const draftId = searchParams.get('id');

  const getLocalDateTime = (timestamp) => {
    if (!timestamp) return { date: '', time: '' };
    const dateObject = new Date(timestamp.toMillis());
    return {
      date: `${dateObject.getFullYear()}-${String(dateObject.getMonth() + 1).padStart(2, '0')}-${String(dateObject.getDate()).padStart(2, '0')}`,
      time: `${String(dateObject.getHours()).padStart(2, '0')}:${String(dateObject.getMinutes()).padStart(2, '0')}`,
    };
  };

  useEffect(() => {
    const fetchDraft = async () => {
      setLoading(true);
      try {
        const compDoc = await fetchAdminCompetitionDetail(draftId);
        if (compDoc) {
          const compData = compDoc;

          // Map to form data structure
          const formData = {
            title: compData.title || '',
            description: compData.description || '',
            tag: compData.tag || '',
            prizeName: compData.prize_name || '',
            prizeValue: compData.prize_value || '',
            category: compData.category || 'Tech',
            isFeatured: compData.is_featured || false,
            images: compData.image || [],
            imagePreviews: compData.image || [],
            ticketPrice: compData.ticket_price || '',
            maxTickets: compData.total_tickets || '',
            ...getLocalDateTime(compData.draw_date),
            instagramLiveLink: compData.instagram_live_url || '',
            includedThings: compData.included_things || [],
            prizeVideoUrl: compData.prize_video_url || '',
            questions: (compData.questions || []).map(q => ({
              questionText: q.question,
              questionImages: q.images || [],
              questionImagePreviews: q.images || [],
              answers: q.option.map(opt => ({
                text: opt.option,
                isCorrect: q.answer?.option_id === opt.option_id
              }))
            }))
          };
          setInitialData(formData);
        }
      } catch (err) {
        console.error('Error fetching draft:', err);
        toast.error('Failed to load draft data');
      } finally {
        setLoading(false);
      }
    };

    if (draftId) fetchDraft();
  }, [draftId]);

  const handleSubmit = async (formData, isDraft = false) => {
    setIsSubmitting(true);

    try {
      await createCompetition({
        id: draftId,
        formData,
        isDraft,
      });

      navigate('/admin/competitions');

    } catch (error) {
      console.error('Error creating competition:', error);
      toast.error(error.message || 'Failed to create competition');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-20">
      <div className="mb-8 fade-in">
        <button
          onClick={() => navigate('/admin/competitions')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-4 w-fit"
        >
          <ArrowLeft size={16} />
          {t('competitions.detail.backToCompetitions')}
        </button>
        <h1 className="text-3xl font-serif font-bold mb-6">
          {draftId ? 'Resume Draft' : t('competitions.createTitle')}
        </h1>
      </div>

      <div className={isSubmitting ? 'pointer-events-none opacity-60 transition-opacity' : ''}>
        <CompetitionForm
          isEditMode={!!draftId}
          initialData={initialData}
          onCancel={() => navigate('/admin/competitions')}
          onSubmit={(data) => handleSubmit(data, false)}
          onSaveDraft={(data) => handleSubmit(data, true)}
        />
      </div>
    </div>
  );
};

export default CreateCompetition;
