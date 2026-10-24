import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { invalidateUserCompetitionTickets } from '@/modules/admin/competitions/services/ticketInvalidationService';

const InvalidateTicketsModal = ({
  isOpen,
  onClose,
  userId,
  userName,
  competitionId,
  competitionTitle,
  activeTicketCount = 0,
  alreadyInvalidCount = 0,
  cancelledCount = 0,
  hasWinnerTicket = false,
  finalityBlocked = false,
  onSuccess,
}) => {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setConfirmed(false);
      setIsSubmitting(false);
      setErrorMessage('');
    }
  }, [isOpen, userId, competitionId]);

  const blocked = finalityBlocked || hasWinnerTicket || activeTicketCount === 0;
  const canSubmit = !isSubmitting && !blocked && confirmed && reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await invalidateUserCompetitionTickets(userId, competitionId, reason.trim());
      if (result?.invalidatedCount > 0) {
        toast.success(
          t('competitions.detail.participants.invalidate.success', {
            count: result.invalidatedCount,
          })
        );
      } else {
        toast(t('competitions.detail.participants.invalidate.nothing'));
      }
      onSuccess?.(result);
      onClose();
    } catch (error) {
      setErrorMessage(error?.message || t('competitions.detail.participants.invalidate.error'));
      toast.error(error?.message || t('competitions.detail.participants.invalidate.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={t('competitions.detail.participants.invalidate.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">{userName}</span>
          <span className="text-gray-500 mx-2">·</span>
          {competitionTitle}
        </div>

        <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>{t('competitions.detail.participants.invalidate.warning')}</p>
            <p>
              {t('competitions.detail.participants.invalidate.affected', {
                count: activeTicketCount,
              })}
            </p>
            {alreadyInvalidCount > 0 && (
              <p>
                {t('competitions.detail.participants.invalidate.alreadyInvalid', {
                  count: alreadyInvalidCount,
                })}
              </p>
            )}
            {cancelledCount > 0 && (
              <p>
                {t('competitions.detail.participants.invalidate.cancelled', {
                  count: cancelledCount,
                })}
              </p>
            )}
          </div>
        </div>

        {finalityBlocked && (
          <div className="px-3 py-2.5 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300">
            {t('competitions.detail.participants.invalidate.finalityBlocked')}
          </div>
        )}

        {hasWinnerTicket && (
          <div className="px-3 py-2.5 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300">
            {t('competitions.detail.participants.invalidate.winnerBlocked')}
          </div>
        )}

        {!finalityBlocked && !hasWinnerTicket && activeTicketCount === 0 && (
          <div className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400">
            {t('competitions.detail.participants.invalidate.noActive')}
          </div>
        )}

        {errorMessage && (
          <div className="px-3 py-2.5 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300">
            {errorMessage}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            {t('competitions.detail.participants.invalidate.reasonLabel')}
          </label>
          <textarea
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('competitions.detail.participants.invalidate.reasonPlaceholder')}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-none h-24"
            disabled={isSubmitting || blocked}
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={isSubmitting || blocked}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-red-500"
          />
          <span>{t('competitions.detail.participants.invalidate.confirmCheckbox')}</span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t('competitions.detail.participants.invalidate.submitting')}
            </>
          ) : (
            <>
              <Ban size={14} />
              {t('competitions.detail.participants.invalidate.confirm')}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default InvalidateTicketsModal;
