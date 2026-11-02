import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Loader2, PlusCircle } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { getReferenceId, ADMIN_TICKET_VIEW_LIMIT } from '@/shared/hooks/useAdminData';
import { isActiveTicket, normalizeTicketStatus } from '@/shared/utils/ticketStatus';
import { increaseUserCompetitionTickets } from '@/modules/admin/orders/services/ticketAdjustmentService';

const MAX_ADDITIONAL_TICKETS = 400;

const makeRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `increase-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const IncreaseTicketsModal = ({
  isOpen,
  onClose,
  order,
  userName,
  competitionTitle,
  tickets = [],
  onSuccess,
}) => {
  const { t } = useTranslation('admin');
  const [origin, setOrigin] = useState('paid');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState('');

  const ticketViewTruncated = tickets.length >= ADMIN_TICKET_VIEW_LIMIT;
  const displayCount = (value) => (ticketViewTruncated ? `${value}+` : value);
  const activeCount = tickets.filter(isActiveTicket).length;
  const invalidCount = tickets.filter(
    (ticket) => normalizeTicketStatus(ticket) === 'invalid'
  ).length;
  const cancelledCount = tickets.filter(
    (ticket) => normalizeTicketStatus(ticket) === 'cancelled'
  ).length;
  const winnerCount = tickets.filter(
    (ticket) => ticket.is_winner === true || normalizeTicketStatus(ticket) === 'winner'
  ).length;

  useEffect(() => {
    if (isOpen) {
      setOrigin('paid');
      setQuantity(1);
      setReason('');
      setConfirmed(false);
      setIsSubmitting(false);
      setErrorMessage('');
      setRequestId(makeRequestId());
    }
  }, [isOpen, order?.id]);

  const canSubmit =
    !isSubmitting &&
    confirmed &&
    reason.trim().length > 0 &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    quantity <= MAX_ADDITIONAL_TICKETS;

  const handleSubmit = async () => {
    if (!canSubmit || !order) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await increaseUserCompetitionTickets({
        userId: getReferenceId(order.user_ref),
        competitionId: getReferenceId(order.competition_id),
        orderId: order.id,
        origin,
        quantity,
        reason: reason.trim(),
        requestId,
      });

      toast.success(
        t('orders.detail.increase.success', { count: result.addedCount ?? quantity })
      );
      onSuccess?.(result);
      onClose();
    } catch (error) {
      const message = error?.message || t('orders.detail.increase.error');
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
      title={t('orders.detail.increase.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">{userName || t('orders.detail.increase.unknownUser')}</span>
          <span className="text-gray-500 mx-2">·</span>
          {competitionTitle || t('orders.detail.increase.unknownCompetition')}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            { label: t('orders.detail.increase.active'), value: displayCount(activeCount) },
            { label: t('orders.detail.increase.invalid'), value: displayCount(invalidCount) },
            { label: t('orders.detail.increase.cancelled'), value: displayCount(cancelledCount) },
            { label: t('orders.detail.increase.winner'), value: displayCount(winnerCount) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-2"
            >
              <p className="text-lg font-bold text-white">{item.value}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>

        {ticketViewTruncated && (
          <p className="text-xs text-yellow-400">
            {t('orders.detail.increase.ticketListTruncated', { max: ADMIN_TICKET_VIEW_LIMIT })}
          </p>
        )}

        <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>{t('orders.detail.increase.warning')}</p>
            <p>
              {t('orders.detail.increase.orderQuantity', {
                count: Number(order?.total_ticket || 0),
              })}
            </p>
            <p>
              {t('orders.detail.increase.composition', {
                paid: Number(order?.paid_ticket || 0),
                bonus: Number(order?.free_ticket || 0),
                credits: Number(order?.free_used || 0),
              })}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="increase-origin" className="text-sm font-medium text-gray-300">
            {t('orders.detail.increase.originLabel')}
          </label>
          <select
            id="increase-origin"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            disabled={isSubmitting}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
          >
            <option value="paid">{t('orders.detail.increase.originPaid')}</option>
            <option value="bonus">{t('orders.detail.increase.originBonus')}</option>
          </select>
          <p className="text-xs text-gray-500">
            {origin === 'paid'
              ? t('orders.detail.increase.paidHint')
              : t('orders.detail.increase.bonusHint')}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="increase-quantity" className="text-sm font-medium text-gray-300">
            {t('orders.detail.increase.quantityLabel')}
          </label>
          <input
            id="increase-quantity"
            type="number"
            min="1"
            max={MAX_ADDITIONAL_TICKETS}
            step="1"
            value={quantity}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              setQuantity(Number.isFinite(next) ? next : 0);
            }}
            disabled={isSubmitting}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
          />
          <p className="text-xs text-gray-500">
            {t('orders.detail.increase.quantityHint', { max: MAX_ADDITIONAL_TICKETS })}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="increase-reason" className="text-sm font-medium text-gray-300">
            {t('orders.detail.increase.reasonLabel')}
          </label>
          <textarea
            id="increase-reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('orders.detail.increase.reasonPlaceholder')}
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
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-primary"
          />
          <span>{t('orders.detail.increase.confirmCheckbox')}</span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t('orders.detail.increase.submitting')}
            </>
          ) : (
            <>
              <PlusCircle size={14} />
              {t('orders.detail.increase.confirm')}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default IncreaseTicketsModal;
