import { useEffect, useMemo, useRef, useState } from 'react';
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
  ticketDetails,
  onSuccess,
}) => {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [requestId, setRequestId] = useState('');
  const wasOpenRef = useRef(false);
  const lastTargetKeyRef = useRef(null);

  const ticketDetailList = useMemo(
    () => (Array.isArray(ticketDetails) ? ticketDetails : []),
    [ticketDetails]
  );
  const targetKey = `${userId ?? ''}:${competitionId ?? ''}`;
  const selectableTickets = ticketDetailList.filter(
    (ticket) => String(ticket.status || '').toLowerCase() === 'active' && !ticket.isWinner
  );
  const hasExplicitSelection = selectableTickets.length > 0;
  const selectedCount = hasExplicitSelection ? selectedTicketIds.length : activeTicketCount;
  const remainingCount = hasExplicitSelection
    ? Math.max(0, selectableTickets.length - selectedCount)
    : 0;

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      lastTargetKeyRef.current = null;
      return;
    }

    const opening = !wasOpenRef.current;
    const targetChanged = lastTargetKeyRef.current !== targetKey;
    if (!opening && !targetChanged) {
      return;
    }

    wasOpenRef.current = true;
    lastTargetKeyRef.current = targetKey;
    setReason('');
    setConfirmed(false);
    setIsSubmitting(false);
    setErrorMessage('');
    setSelectedTicketIds(
      ticketDetailList
        .filter((ticket) => String(ticket.status || '').toLowerCase() === 'active' && !ticket.isWinner)
        .map((ticket) => ticket.id)
    );
    setRequestId(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `invalidate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    );
  // ticketDetails may refresh while the modal stays open. Only opening the
  // modal or changing the target should reset the administrator's input.
  }, [isOpen, targetKey, ticketDetailList]);

  const blocked = finalityBlocked || hasWinnerTicket || activeTicketCount === 0;
  const canSubmit =
    !isSubmitting &&
    !blocked &&
    confirmed &&
    reason.trim().length > 0 &&
    selectedCount > 0;

  const toggleTicket = (ticketId) => {
    if (isSubmitting) return;
    setSelectedTicketIds((current) =>
      current.includes(ticketId)
        ? current.filter((id) => id !== ticketId)
        : [...current, ticketId]
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await invalidateUserCompetitionTickets(
        userId,
        competitionId,
        reason.trim(),
        hasExplicitSelection ? { ticketIds: selectedTicketIds, requestId } : {}
      );
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
                count: selectedCount,
              })}
            </p>
            {hasExplicitSelection && (
              <p>
                {t('competitions.detail.participants.invalidate.remainingSelected', {
                  count: remainingCount,
                })}
              </p>
            )}
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

        {hasExplicitSelection && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-300">
                {t('competitions.detail.participants.invalidate.selectTickets')}
              </p>
              <button
                type="button"
                onClick={() => setSelectedTicketIds(selectableTickets.map((ticket) => ticket.id))}
                disabled={isSubmitting || selectedCount === selectableTickets.length}
                className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40"
              >
                {t('competitions.detail.participants.invalidate.selectAll')}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {selectableTickets.map((ticket) => (
                <label
                  key={ticket.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTicketIds.includes(ticket.id)}
                      onChange={() => toggleTicket(ticket.id)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 accent-red-500"
                    />
                    <span className="font-mono">{ticket.sequence}</span>
                  </span>
                  <span className="text-xs text-gray-500">{ticket.ticketNumber || ''}</span>
                </label>
              ))}
            </div>
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
