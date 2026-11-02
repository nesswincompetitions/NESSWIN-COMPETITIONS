import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Loader2, MinusCircle } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { db } from '@/config/firebase';
import { isActiveTicket } from '@/shared/utils/ticketStatus';
import { decreaseUserCompetitionTickets } from '@/modules/admin/orders/services/ticketAdjustmentService';

const MAX_DECREASE_TICKETS = 400;
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

const matchesOrigin = (ticket, origin) => {
  if (origin === 'paid') return ticket.allocationType === 'paid';
  return BONUS_ORIGINS.has(ticket.allocationType);
};

const ParticipantTicketAdjustmentModal = ({
  isOpen,
  onClose,
  participant,
  competitionId,
  competitionTitle,
  onSuccess,
}) => {
  const { t } = useTranslation('admin');
  const [ordersById, setOrdersById] = useState({});
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [origin, setOrigin] = useState('paid');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState('');

  const ticketDetails = useMemo(
    () => (Array.isArray(participant?.ticketDetails) ? participant.ticketDetails : []),
    [participant]
  );

  const activeTickets = useMemo(
    () => ticketDetails.filter((ticket) => isActiveTicket(ticket) && !ticket.isWinner),
    [ticketDetails]
  );

  const orderIds = useMemo(
    () => [...new Set(activeTickets.map((ticket) => ticket.orderId).filter(Boolean))],
    [activeTickets]
  );

  useEffect(() => {
    if (!isOpen) return;
    setOrderId('');
    setOrigin('paid');
    setQuantity(1);
    setReason('');
    setConfirmed(false);
    setIsSubmitting(false);
    setErrorMessage('');
    setRequestId(makeRequestId());
  }, [isOpen, participant?.id]);

  useEffect(() => {
    if (!isOpen || orderIds.length === 0) {
      setOrdersById({});
      return;
    }

    let cancelled = false;
    setLoadingOrders(true);
    Promise.all(
      orderIds.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'order', id));
          return [id, snap.exists() ? { id: snap.id, ...snap.data() } : null];
        } catch (error) {
          console.error(`[ParticipantTicketAdjustmentModal] Failed to load order ${id}:`, error);
          return [id, null];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setOrdersById(Object.fromEntries(entries));
      setLoadingOrders(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, orderIds]);

  const adjustableOrders = useMemo(
    () =>
      orderIds.filter((id) => {
        const order = ordersById[id];
        return (
          order &&
          String(order.status || '').toLowerCase() === 'paid' &&
          order.is_winner !== true
        );
      }),
    [orderIds, ordersById]
  );

  useEffect(() => {
    if (!isOpen || adjustableOrders.length === 0) {
      if (!isOpen) setOrderId('');
      return;
    }
    setOrderId((current) => (adjustableOrders.includes(current) ? current : adjustableOrders[0]));
  }, [isOpen, adjustableOrders]);

  const selectedOrder = orderId ? ordersById[orderId] : null;
  const orderTickets = useMemo(
    () => activeTickets.filter((ticket) => ticket.orderId === orderId),
    [activeTickets, orderId]
  );
  const paidEligibleCount = orderTickets.filter((ticket) => ticket.allocationType === 'paid').length;
  const bonusEligibleCount = orderTickets.filter((ticket) => BONUS_ORIGINS.has(ticket.allocationType)).length;
  const eligibleCount = orderTickets.filter((ticket) => matchesOrigin(ticket, origin)).length;
  const projectedRemaining = Math.max(0, eligibleCount - quantity);

  const canSubmit =
    !isSubmitting &&
    !loadingOrders &&
    Boolean(selectedOrder) &&
    confirmed &&
    reason.trim().length > 0 &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    quantity <= MAX_DECREASE_TICKETS &&
    quantity <= eligibleCount;

  const resetRequest = (next) => {
    setRequestId(makeRequestId());
    next();
  };

  const handleSubmit = async () => {
    if (!canSubmit || !participant?.id || !selectedOrder) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await decreaseUserCompetitionTickets({
        userId: participant.id,
        competitionId,
        orderId: selectedOrder.id,
        origin,
        quantity,
        reason: reason.trim(),
        requestId,
      });

      toast.success(
        t('competitions.detail.participants.adjust.success', {
          count: result.decreasedCount ?? quantity,
        })
      );
      onSuccess?.(result);
      onClose();
    } catch (error) {
      const message = error?.message || t('competitions.detail.participants.adjust.error');
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const orderLabel = (id) => {
    const order = ordersById[id];
    const shortId = String(id || '').slice(0, 8).toUpperCase();
    const total = Number(order?.total_ticket || 0);
    return t('competitions.detail.participants.adjust.orderOption', {
      id: shortId,
      count: total,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={t('competitions.detail.participants.adjust.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">{participant?.name}</span>
          <span className="text-gray-500 mx-2">·</span>
          {competitionTitle}
        </div>

        <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('competitions.detail.participants.adjust.warning')}</span>
        </div>

        {loadingOrders ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            {t('competitions.detail.participants.adjust.loadingOrders')}
          </div>
        ) : adjustableOrders.length === 0 ? (
          <div className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400">
            {t('competitions.detail.participants.adjust.noEligibleOrder')}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="participant-adjust-order" className="text-sm font-medium text-gray-300">
                {t('competitions.detail.participants.adjust.orderLabel')}
              </label>
              <select
                id="participant-adjust-order"
                value={orderId}
                onChange={(event) => resetRequest(() => {
                  setOrderId(event.target.value);
                  setQuantity(1);
                })}
                disabled={isSubmitting}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
              >
                {adjustableOrders.map((id) => (
                  <option key={id} value={id}>
                    {orderLabel(id)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                {t('competitions.detail.participants.adjust.orderHint')}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="participant-adjust-origin" className="text-sm font-medium text-gray-300">
                {t('competitions.detail.participants.adjust.originLabel')}
              </label>
              <select
                id="participant-adjust-origin"
                value={origin}
                onChange={(event) => resetRequest(() => {
                  setOrigin(event.target.value);
                  setQuantity(1);
                })}
                disabled={isSubmitting}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
              >
                <option value="paid">
                  {t('competitions.detail.participants.adjust.originPaid', {
                    count: paidEligibleCount,
                  })}
                </option>
                <option value="bonus">
                  {t('competitions.detail.participants.adjust.originBonus', {
                    count: bonusEligibleCount,
                  })}
                </option>
              </select>
              <p className="text-xs text-gray-500">
                {t('competitions.detail.participants.adjust.eligibleCount', {
                  count: eligibleCount,
                })}
              </p>
              {eligibleCount === 0 && (
                <p className="text-xs text-red-400">
                  {t('competitions.detail.participants.adjust.noEligible')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="participant-adjust-quantity" className="text-sm font-medium text-gray-300">
                {t('competitions.detail.participants.adjust.quantityLabel')}
              </label>
              <input
                id="participant-adjust-quantity"
                type="number"
                min="1"
                max={Math.min(MAX_DECREASE_TICKETS, Math.max(eligibleCount, 1))}
                step="1"
                value={quantity}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  setQuantity(Number.isFinite(next) ? next : 0);
                }}
                disabled={isSubmitting || eligibleCount === 0}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
              />
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <p className="text-lg font-bold text-white">{eligibleCount}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">
                    {t('competitions.detail.participants.adjust.currentEligible')}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <p className="text-lg font-bold text-white">{projectedRemaining}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">
                    {t('competitions.detail.participants.adjust.projectedRemaining')}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {t('competitions.detail.participants.adjust.quantityHint', { max: MAX_DECREASE_TICKETS })}
              </p>
              {quantity > eligibleCount && (
                <p className="text-xs text-red-400">
                  {t('competitions.detail.participants.adjust.exceedsEligible', {
                    count: eligibleCount,
                  })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="participant-adjust-reason" className="text-sm font-medium text-gray-300">
                {t('competitions.detail.participants.adjust.reasonLabel')}
              </label>
              <textarea
                id="participant-adjust-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('competitions.detail.participants.adjust.reasonPlaceholder')}
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
              <span>{t('competitions.detail.participants.adjust.confirmCheckbox')}</span>
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
              {t('competitions.detail.participants.adjust.submitting')}
            </>
          ) : (
            <>
              <MinusCircle size={14} />
              {t('competitions.detail.participants.adjust.confirm')}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default ParticipantTicketAdjustmentModal;
