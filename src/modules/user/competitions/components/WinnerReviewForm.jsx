import React, { useState } from 'react';
import { Star, MessageSquare, Send, Trophy, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { submitWinnerReview } from '../services/competitionService';
import { m as motion, AnimatePresence } from 'framer-motion';

const WinnerReviewForm = ({ competitionId, userId, alreadyReviewed = false, onReviewSubmitted }) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(alreadyReviewed);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error('Please provide a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitWinnerReview(competitionId, userId, comment, rating);
      toast.success('Thank you for your review!');
      setIsSubmitted(true);
      if (onReviewSubmitted) onReviewSubmitted();
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('Unable to submit your review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 text-center space-y-4"
      >
        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="text-emerald-500" size={32} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{t('competitionDetails.reviewForm.submittedTitle')}</h3>
          <p className="text-emerald-400/80 text-sm mt-1">{t('competitionDetails.reviewForm.submittedDesc')}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="relative group">
      {/* Background Glow */}
      <div className="absolute -inset-0.5 bg-linear-to-r from-primary to-amber-500 rounded-3xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
      
      <div className="relative bg-[#121212] border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Trophy size={120} />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/5 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em]">
              <Trophy size={14} />
              {t('competitionDetails.reviewForm.winnerExclusive')}
            </div>
            <h2 className="text-3xl font-serif font-bold text-white">{t('competitionDetails.reviewForm.shareExperience')}</h2>
            <p className="text-gray-400 max-w-md">{t('competitionDetails.reviewForm.shareSubtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Rating Section */}
          <div className="space-y-4">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Star size={16} className="text-amber-500" />
              {t('competitionDetails.reviewForm.yourRating')}
            </label>
            <div className="flex gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="relative p-1 transition-transform active:scale-90"
                >
                  <Star
                    size={40}
                    className={`transition-colors duration-200 ${
                      star <= (hover || rating) 
                        ? 'fill-amber-500 text-amber-500' 
                        : 'text-gray-600'
                    }`}
                  />
                  {star <= (hover || rating) && (
                    <motion.div
                      layoutId="star-glow"
                      className="absolute inset-0 bg-amber-500/20 blur-lg rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {rating === 5 
                ? t('competitionDetails.reviewForm.ratingExcellent') 
                : rating === 4 
                  ? t('competitionDetails.reviewForm.ratingGreat') 
                  : rating === 3 
                    ? t('competitionDetails.reviewForm.ratingGood') 
                    : rating === 2 
                      ? t('competitionDetails.reviewForm.ratingFair') 
                      : t('competitionDetails.reviewForm.ratingPoor')}
            </p>
          </div>

          {/* Comment Section */}
          <div className="space-y-4">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <MessageSquare size={16} className="text-primary" />
              {t('competitionDetails.reviewForm.yourComment')}
            </label>
            <div className="relative">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('competitionDetails.reviewForm.textareaPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-colors min-h-[120px] resize-none"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || rating === 0}
            className="w-full bg-primary text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group/btn"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                {t('competitionDetails.reviewForm.submitting')}
              </>
            ) : (
              <>
                {t('competitionDetails.reviewForm.submitBtn')}
                <Send size={18} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default WinnerReviewForm;
