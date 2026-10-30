import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Loader2, MinusCircle } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { getReferenceId, ADMIN_TICKET_VIEW_LIMIT } from '@/shared/hooks/useAdminData';
import { isActiveTicket, normalizeTicketStatus } from '@/shared/utils/ticketStatus';
import { decreaseUserCompetitionTickets } from '@/modules/admin/orders/services/ticketAdjustmentService';

const MAX_DECREASE_TICKETS = 400;
const SUPPORTED_ORIGINS = [
  'paid',
  'pack_bonus',
  'referral_credit',
  'referral_use_bonus',
  'admin_bonus',
  'admin_adjustment',
];
const BONUS_ORIGINS = new Set([
  'pack_bonus',
  'referral_credit',
  'referral_use_bonus',
  'admin_bonus',
]);

const makeRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `decrease-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getOrigin = (ticket) => ticket?.allocation_type || 'legacy_unknown';

const DecreaseTicketsModal = ({
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
  const activeTickets = useMemo(
    () => tickets.filter((ticket) => isActiveTicket(ticket) && !ticket.is_winner),
    [tickets]
  );
  const invalidCount = tickets.filter(
    (ticket) => normalizeTicketStatus(ticket) === 'invalid'
  ).length;
  const cancelledCount = tickets.filter(
    (ticket) => normalizeTicketStatus(ticket) === 'cancelled'
  ).length;
  const winnerCount = tickets.filter(
    (ticket) => ticket.is_winner === true || normalizeTicketStatus(ticket) === 'winner'
  ).length;

  const originCounts = useMemo(() => {
    const counts = Object.fromEntries(SUPPORTED_ORIGINS.map((value) => [value, 0]));
    let unsupported = 0;
    activeTickets.forEach((ticket) => {
      const ticketOrigin = getOrigin(ticket);
      if (Object.prototype.hasOwnProperty.call(counts, ticketOrigin)) {
        counts[ticketOrigin] += 1;
      } else {
        unsupported += 1;
      }
    });
    return { counts, unsupported };
  }, [activeTickets]);

  const activeTicketsRef = useRef(activeTickets);
  activeTicketsRef.current = activeTickets;

  const selectedEligibleCount = originCounts.counts[origin] || 0;
  const noKnownEligible = !ticketViewTruncated && selectedEligibleCount === 0;
  const exceedsKnownEligible =
    !ticketViewTruncated && quantity > selectedEligibleCount;

  useEffect(() => {
    if (!isOpen) return;

    const preferred = SUPPORTED_ORIGINS.find(
      (value) => activeTicketsRef.current.some((ticket) => getOrigin(ticket) === value)
    ) || 'paid';

    setOrigin(preferred);
    setQuantity(1);
    setReason('');
    setConfirmed(false);
    setIsSubmitting(false);
    setErrorMessage('');
    setRequestId(makeRequestId());
  }, [isOpen, order?.id]);

  const canSubmit =
    !isSubmitting &&
    confirmed &&
    reason.trim().length > 0 &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    quantity <= MAX_DECREASE_TICKETS &&
    !noKnownEligible &&
    !exceedsKnownEligible;

  const handleSubmit = async () => {
    if (!canSubmit || !order) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await decreaseUserCompetitionTickets({
        userId: getReferenceId(order.user_ref),
        competitionId: getReferenceId(order.competition_id),
        orderId: order.id,
        origin,
        quantity,
        reason: reason.trim(),
        requestId,
      });

      toast.success(
        t('orders.detail.decrease.success', {
          count: result.decreasedCount ?? quantity,
        })
      );
      onSuccess?.(result);
      onClose();
    } catch (error) {
      const message = error?.message || t('orders.detail.decrease.error');
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const originLabel = (value) => {
    const keys = {
      paid: 'originPaid',
      pack_bonus: 'originPackBonus',
      referral_credit: 'originReferralCredit',
      referral_use_bonus: 'originReferralUseBonus',
      admin_bonus: 'originAdminBonus',
      admin_adjustment: 'originAdminAdjustment',
    };
    return t(`orders.detail.decrease.${keys[value]}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={t('orders.detail.decrease.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">
            {userName || t('orders.detail.decrease.unknownUser')}
          </span>
          <span className="text-gray-500 mx-2">·</span>
          {competitionTitle || t('orders.detail.decrease.unknownCompetition')}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            { label: t('orders.detail.decrease.active'), value: displayCount(activeTickets.length) },
            { label: t('orders.detail.decrease.invalid'), value: displayCount(invalidCount) },
            { label: t('orders.detail.decrease.cancelled'), value: displayCount(cancelledCount) },
            { label: t('orders.detail.decrease.winner'), value: displayCount(winnerCount) },
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
            {t('orders.detail.decrease.ticketListTruncated', { max: ADMIN_TICKET_VIEW_LIMIT })}
          </p>
        )}

        {originCounts.unsupported > 0 && (
          <div className="px-3 py-2.5 bg-yellow-400/10 border border-yellow-400/30 rounded-lg text-sm text-yellow-300">
            {t('orders.detail.decrease.unsupportedActive', {
              count: displayCount(originCounts.unsupported),
            })}
          </div>
        )}

        <div className="flex items-start gap-3 px-3 py-2.5 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>{t('orders.detail.decrease.warning')}</p>
            <p>
              {t('orders.detail.decrease.orderQuantity', {
                count: Number(order?.total_ticket || 0),
              })}
            </p>
            <p>
              {t('orders.detail.decrease.composition', {
                paid: Number(order?.paid_ticket || 0),
                bonus: Number(order?.free_ticket || 0),
                credits: Number(order?.free_used || 0),
              })}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="decrease-origin" className="text-sm font-medium text-gray-300">
            {t('orders.detail.decrease.originLabel')}
          </label>
          <select
            id="decrease-origin"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            disabled={isSubmitting}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
          >
            {SUPPORTED_ORIGINS.map((value) => (
              <option key={value} value={value}>
                {t('orders.detail.decrease.originOption', {
                  origin: originLabel(value),
                  count: displayCount(originCounts.counts[value] || 0),
                  bonus: BONUS_ORIGINS.has(value) ? t('orders.detail.decrease.bonusTag') : '',
                })}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            {t('orders.detail.decrease.eligibleCount', {
              count: displayCount(selectedEligibleCount),
            })}
          </p>
          {noKnownEligible && (
            <p className="text-xs text-red-400">
              {t('orders.detail.decrease.noEligible')}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="decrease-quantity" className="text-sm font-medium text-gray-300">
            {t('orders.detail.decrease.quantityLabel')}
          </label>
          <input
            id="decrease-quantity"
            type="number"
            min="1"
            max={MAX_DECREASE_TICKETS}
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
            {t('orders.detail.decrease.quantityHint', { max: MAX_DECREASE_TICKETS })}
          </p>
          {exceedsKnownEligible && (
            <p className="text-xs text-red-400">
              {t('orders.detail.decrease.exceedsEligible', {
                count: selectedEligibleCount,
              })}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="decrease-reason" className="text-sm font-medium text-gray-300">
            {t('orders.detail.decrease.reasonLabel')}
          </label>
          <textarea
            id="decrease-reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('orders.detail.decrease.reasonPlaceholder')}
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
          <span>{t('orders.detail.decrease.confirmCheckbox')}</span>
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
              {t('orders.detail.decrease.submitting')}
            </>
          ) : (
            <>
              <MinusCircle size={14} />
              {t('orders.detail.decrease.confirm')}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default DecreaseTicketsModal;
