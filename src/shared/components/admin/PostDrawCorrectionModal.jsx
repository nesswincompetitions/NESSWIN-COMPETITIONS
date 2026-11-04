import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { isActiveTicket } from '@/shared/utils/ticketStatus';
import { correctCompetitionTicketsAfterDraw } from '@/modules/admin/competitions/services/ticketInvalidationService';

const MAX_CORRECTION_TICKETS = 400;

const makeRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `post-draw-correction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const PostDrawCorrectionModal = ({
  isOpen,
  onClose,
  participant,
  competitionId,
  competitionTitle,
  onSuccess,
}) => {
  const { t } = useTranslation('admin');
  const [selectedIds, setSelectedIds] = useState([]);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState('');

  const eligibleTickets = useMemo(() => {
    const ticketDetails = Array.isArray(participant?.ticketDetails)
      ? participant.ticketDetails
      : [];
    return ticketDetails.filter(
      (ticket) => isActiveTicket(ticket) && ticket.isWinner !== true
    );
  }, [participant]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
    setReason('');
    setConfirmed(false);
    setIsSubmitting(false);
    setErrorMessage('');
    setRequestId(makeRequestId());
  }, [isOpen, participant?.id, competitionId]);

  const selectedCount = selectedIds.length;
  const canSubmit =
    !isSubmitting &&
    selectedCount > 0 &&
    selectedCount <= MAX_CORRECTION_TICKETS &&
    reason.trim().length > 0 &&
    confirmed;

  const toggleTicket = (ticketId) => {
    setSelectedIds((current) => {
      if (current.includes(ticketId)) {
        return current.filter((id) => id !== ticketId);
      }
      if (current.length >= MAX_CORRECTION_TICKETS) return current;
      return [...current, ticketId];
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit || !participant?.id) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await correctCompetitionTicketsAfterDraw({
        userId: participant.id,
        competitionId,
        ticketIds: selectedIds,
        reason: reason.trim(),
        requestId,
      });

      toast.success(
        t('competitions.detail.participants.postDraw.success', {
          count: result.invalidatedCount ?? selectedCount,
        })
      );
      onSuccess?.(result);
      onClose();
    } catch (error) {
      const message =
        error?.message || t('competitions.detail.participants.postDraw.error');
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={t('competitions.detail.participants.postDraw.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">{participant?.name}</span>
          <span className="text-gray-500 mx-2">·</span>
          {competitionTitle}
        </div>

        <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('competitions.detail.participants.postDraw.warning')}</span>
        </div>

        {eligibleTickets.length === 0 ? (
          <div className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400">
            {t('competitions.detail.participants.postDraw.noEligible')}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-300">
                  {t('competitions.detail.participants.postDraw.selectTickets')}
                </p>
                <span className="text-xs text-gray-500">
                  {t('competitions.detail.participants.postDraw.selectedCount', {
                    count: selectedCount,
                  })}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {t('competitions.detail.participants.postDraw.selectHint')}
              </p>
              <div className="max-h-56 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {eligibleTickets.map((ticket) => {
                  const checked = selectedIds.includes(ticket.id);
                  const atLimit =
                    !checked && selectedIds.length >= MAX_CORRECTION_TICKETS;
                  return (
                    <label
                      key={ticket.id}
                      className={`flex items-center gap-3 px-3 py-2 border rounded-lg text-sm ${
                        checked
                          ? 'border-red-400/40 bg-red-400/5 text-white'
                          : 'border-white/10 bg-white/5 text-gray-300'
                      } ${atLimit ? 'opacity-50' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTicket(ticket.id)}
                        disabled={isSubmitting || atLimit}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 accent-red-500"
                      />
                      <span className="font-mono font-medium">
                        #{ticket.sequence || ticket.ticketNumber || ticket.id}
                      </span>
                      {ticket.orderId && (
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-500">
                          {String(ticket.orderId).slice(0, 8)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">
                {t('competitions.detail.participants.postDraw.maxWarning', {
                  max: MAX_CORRECTION_TICKETS,
                })}
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="post-draw-correction-reason"
                className="text-sm font-medium text-gray-300"
              >
                {t('competitions.detail.participants.postDraw.reasonLabel')}
              </label>
              <textarea
                id="post-draw-correction-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t(
                  'competitions.detail.participants.postDraw.reasonPlaceholder'
                )}
                disabled={isSubmitting}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-none h-24 disabled:opacity-50"
              />
            </div>

            {errorMessage && (
              <div className="px-3 py-2.5 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300">
                {errorMessage}
              </div>
            )}

            <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={isSubmitting}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-red-500"
              />
              <span>
                {t('competitions.detail.participants.postDraw.confirmCheckbox')}
              </span>
            </label>
          </>
        )}
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
              {t('competitions.detail.participants.postDraw.submitting')}
            </>
          ) : (
            <>
              <ShieldAlert size={14} />
              {t('competitions.detail.participants.postDraw.confirm')}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default PostDrawCorrectionModal;
