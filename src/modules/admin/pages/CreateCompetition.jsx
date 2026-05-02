import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../utils/firebase';
import CompetitionForm from '../components/CompetitionForm';
import { uploadImages, createCompetition } from '../../../services/competitionService';

const CreateCompetition = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(false);

  const draftId = searchParams.get('id');

  useEffect(() => {
    const fetchDraft = async () => {
      setLoading(true);
      try {
        const compDoc = await getDoc(doc(db, 'competition', draftId));
        if (compDoc.exists()) {
          const compData = compDoc.data();

          // Fetch questions
          const qQuery = query(collection(db, 'questions'), where('competition_id', '==', doc(db, 'competition', draftId)));
          const qSnapshot = await getDocs(qQuery);
          const qList = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

          // Map to form data structure
          const formData = {
            title: compData.title || '',
            subTitle: compData.sub_title || '',
            description: compData.description || '',
            prizeName: compData.prize_name || '',
            prizeValue: compData.prize_value || '',
            category: compData.category || 'Tech',
            isFeatured: compData.is_featured || false,
            images: compData.image || [],
            imagePreviews: compData.image || [],
            ticketPrice: compData.ticket_price || '',
            maxTickets: compData.total_tickets || '',
            sellOutBehavior: compData.sellOutBehavior || 'auto_end',
            status: compData.status || 'draft',
            drawEndDate: compData.draw_date ? new Date(compData.draw_date.toMillis()).toISOString().split('T')[0] : '',
            drawEndTime: compData.draw_date ? new Date(compData.draw_date.toMillis()).toISOString().split('T')[1].slice(0, 5) : '',
            countdownEndDate: compData.countdown_end ? new Date(compData.countdown_end.toMillis()).toISOString().split('T')[0] : '',
            countdownEndTime: compData.countdown_end ? new Date(compData.countdown_end.toMillis()).toISOString().split('T')[1].slice(0, 5) : '',
            autoEndDraw: compData.autoEndDraw !== undefined ? compData.autoEndDraw : true,
            instagramLiveLink: compData.instagram_live_url || '',
            includedThings: compData.included_things || [],
            prizeVideoUrl: compData.prize_video_url || '',
            questions: qList.map(q => ({
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
    const loadingToast = toast.loading(isDraft ? 'Saving draft...' : 'Creating competition...');

    try {
      // 1. Upload competition images
      const imageUrls = await uploadImages(formData.images, 'competitions');

      // 2. Prepare competition data payload matching the schema
      const drawDateTimeStr = formData.drawEndDate && formData.drawEndTime
        ? `${formData.drawEndDate}T${formData.drawEndTime}`
        : (formData.drawEndDate ? `${formData.drawEndDate}T00:00` : null);
      const drawDateTimestamp = drawDateTimeStr ? new Date(drawDateTimeStr).getTime() : Date.now();

      const countdownDateTimeStr = formData.countdownEndDate && formData.countdownEndTime
        ? `${formData.countdownEndDate}T${formData.countdownEndTime}`
        : (formData.countdownEndDate ? `${formData.countdownEndDate}T00:00` : null);
      const countdownEndTimestamp = countdownDateTimeStr ? new Date(countdownDateTimeStr).getTime() : drawDateTimestamp;

      const competitionData = {
        title: formData.title,
        sub_title: formData.subTitle,
        description: formData.description,
        category: formData.category,
        ticket_price: parseFloat(formData.ticketPrice) || 0,
        total_tickets: parseInt(formData.maxTickets) || 0,
        prize_value: parseFloat(formData.prizeValue) || 0,
        prize_name: formData.prizeName || '',
        image: imageUrls,
        status: isDraft ? 'draft' : (formData.status === 'draft' ? 'active' : (formData.status || 'active')),
        draw_date: drawDateTimestamp,
        countdown_end: countdownEndTimestamp,
        instagram_live_url: formData.instagramLiveLink || '',
        prize_video_url: formData.prizeVideoUrl || '',
        included_things: formData.includedThings.filter(thing => thing.trim() !== ''),
        is_featured: formData.isFeatured || false,
      };

      // 3. Process questions and upload question images
      const questionsList = [];
      for (const q of formData.questions) {
        const qImageUrls = await uploadImages(q.questionImages, 'questions');
        const options = q.answers.map((ans, idx) => ({
          option_id: `opt_${Date.now()}_${idx}`,
          option: ans.text
        }));
        const correctAnswerIndex = q.answers.findIndex(ans => ans.isCorrect);
        const correctAnswer = correctAnswerIndex >= 0 ? options[correctAnswerIndex] : options[0];

        questionsList.push({
          question: q.questionText,
          images: qImageUrls,
          option: options,
          answer: correctAnswer
        });
      }

      // 4. Call Cloud Function
      await createCompetition({
        id: draftId, // Pass the existing ID if it's a resume/update
        competitionData,
        questionsList,
        is_draft: isDraft
      });

      toast.success(isDraft ? 'Draft saved successfully!' : 'Competition created successfully!', { id: loadingToast });
      navigate('/admin/competitions');

    } catch (error) {
      console.error('Error creating competition:', error);
      toast.error(error.message || 'Failed to create competition', { id: loadingToast });
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
