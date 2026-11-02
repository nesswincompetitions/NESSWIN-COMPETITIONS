import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import {
  getOrderRefundEligibility,
  refundOrder,
} from '@/modules/admin/orders/services/ordersService';

const makeRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `refund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatMinor = (minor, currency = 'GBP') => {
  const amount = Number(minor) || 0;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(currency || 'GBP').toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
};

const parseAmountMinor = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
};

const RefundOrderModal = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const { t } = useTranslation('admin');
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [localPending, setLocalPending] = useState(null);

  const orderId = order?.id;

  useEffect(() => {
    if (!isOpen || !orderId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setEligibility(null);
    setAmount('');
    setReason('');
    setConfirmed(false);
    setIsSubmitting(false);
    setErrorMessage('');
    setRequestId(makeRequestId());
    setLocalPending(null);

    getOrderRefundEligibility(orderId)
      .then((data) => {
        if (cancelled) return;
        setEligibility(data);
        const pending = data?.refunds?.find((refund) =>
          ['pending', 'requires_action', 'uncertain'].includes(
            String(refund.status || '').toLowerCase()
          )
        );
        if (pending) {
          setLocalPending(pending);
          setRequestId(pending.request_id);
          setAmount(((Number(pending.amount_minor) || 0) / 100).toFixed(2));
          setReason(pending.reason || '');
          return;
        }
        const remaining = Number(data?.remainingRefundableMinor) || 0;
        setAmount(remaining > 0 ? (remaining / 100).toFixed(2) : '');
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error?.message || t('orders.detail.refund.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, orderId, t]);

  const pendingRefund = useMemo(
    () =>
      localPending ||
      eligibility?.refunds?.find((refund) =>
        ['pending', 'requires_action', 'uncertain'].includes(
          String(refund.status || '').toLowerCase()
        )
      ) ||
      null,
    [eligibility, localPending]
  );
  const isPending = Boolean(pendingRefund);
  const parsedAmountMinor = useMemo(() => parseAmountMinor(amount), [amount]);
  const amountMinor = isPending
    ? Number(pendingRefund?.amount_minor) || null
    : parsedAmountMinor;
  const remainingMinor = Number(eligibility?.remainingRefundableMinor) || 0;
  const exceedsRemaining =
    !isPending && parsedAmountMinor !== null && parsedAmountMinor > remainingMinor;
  const projectedRemaining = isPending
    ? 0
    : Math.max(0, remainingMinor - (parsedAmountMinor || 0));

  const canSubmit =
    !loading &&
    !loadError &&
    !isSubmitting &&
    Boolean(eligibility) &&
    confirmed &&
    (isPending
      ? Boolean(pendingRefund?.request_id) && Boolean(amountMinor)
      : reason.trim().length > 0 &&
        parsedAmountMinor !== null &&
        parsedAmountMinor <= remainingMinor &&
        remainingMinor > 0);

  const handleSubmit = async () => {
    if (!canSubmit || !orderId || !amountMinor) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const submittedRequestId = pendingRefund?.request_id || requestId;
      const submittedReason = pendingRefund?.reason || reason.trim();
      const result = await refundOrder({
        orderId,
        amountMinor,
        reason: submittedReason,
        requestId: submittedRequestId,
      });

      if (result?.status === 'succeeded') {
        toast.success(t('orders.detail.refund.success', {
          amount: formatMinor(result.amountMinor, result.currency),
        }));
        onSuccess?.(result);
        onClose();
      } else if (
        result?.status === 'pending' ||
        result?.status === 'requires_action' ||
        result?.status === 'uncertain'
      ) {
        const nextPending = {
          request_id: result.requestId || submittedRequestId,
          amount_minor: result.amountMinor ?? amountMinor,
          currency: result.currency || eligibility?.currency || 'GBP',
          status: result.status === 'uncertain' ? 'pending' : result.status,
          reason: result.reason || submittedReason,
        };
        setLocalPending(nextPending);
        setRequestId(nextPending.request_id);
        setAmount(((Number(nextPending.amount_minor) || 0) / 100).toFixed(2));
        setReason(nextPending.reason);
        toast(
          result.status === 'uncertain'
            ? t('orders.detail.refund.uncertain')
            : t('orders.detail.refund.pending'),
          { duration: 8000 }
        );
        onSuccess?.(result);
      } else {
        toast.error(result?.message || t('orders.detail.refund.failed'));
        setErrorMessage(result?.message || t('orders.detail.refund.failed'));
        onSuccess?.(result);
      }
    } catch (error) {
      const message = error?.message || t('orders.detail.refund.failed');
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
      title={t('orders.detail.refund.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">
            {t('orders.detail.refund.orderLabel', {
              id: String(orderId || '').slice(0, 8).toUpperCase(),
            })}
          </span>
          <span className="text-gray-500 mx-2">·</span>
          {order?.user_name || t('orders.detail.refund.unknownUser')}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            {t('orders.detail.refund.loading')}
          </div>
        ) : loadError ? (
          <div className="px-3 py-2.5 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300">
            {loadError}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                <p className="text-lg font-bold text-white">
                  {formatMinor(eligibility?.originalAmountMinor, eligibility?.currency)}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  {t('orders.detail.refund.originalAmount')}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                <p className="text-lg font-bold text-white">
                  {formatMinor(eligibility?.previouslyRefundedMinor, eligibility?.currency)}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  {t('orders.detail.refund.previouslyRefunded')}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                <p className="text-lg font-bold text-primary">
                  {formatMinor(remainingMinor, eligibility?.currency)}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  {t('orders.detail.refund.remaining')}
                </p>
              </div>
            </div>

            {Number(eligibility?.pendingRefundedMinor) > 0 && (
              <p className="text-xs text-yellow-300">
                {t('orders.detail.refund.pendingWithStripe', {
                  amount: formatMinor(
                    eligibility.pendingRefundedMinor,
                    eligibility?.currency
                  ),
                })}
              </p>
            )}

            <p className="text-xs text-gray-500">
              {t('orders.detail.refund.calculationBasis')}
            </p>

            <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{t('orders.detail.refund.warning')}</span>
            </div>

            {isPending && (
              <div className="px-3 py-2.5 bg-yellow-400/10 border border-yellow-400/30 rounded-lg text-sm text-yellow-300">
                {t('orders.detail.refund.pendingBanner', {
                  amount: formatMinor(amountMinor || 0, pendingRefund?.currency),
                  status: t(
                    `orders.detail.refund.status.${pendingRefund?.status || 'pending'}`,
                    pendingRefund?.status || 'pending'
                  ),
                })}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="refund-amount" className="text-sm font-medium text-gray-300">
                {t('orders.detail.refund.amountLabel', { currency: eligibility?.currency })}
              </label>
              <input
                id="refund-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={remainingMinor > 0 ? (remainingMinor / 100).toFixed(2) : undefined}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={isSubmitting || isPending || remainingMinor <= 0}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {t('orders.detail.refund.projectedRemaining', {
                    amount: formatMinor(projectedRemaining, eligibility?.currency),
                  })}
                </span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setAmount(remainingMinor > 0 ? (remainingMinor / 100).toFixed(2) : '')}
                  disabled={isSubmitting || isPending || remainingMinor <= 0}
                >
                  {t('orders.detail.refund.refundAll')}
                </button>
              </div>
              {exceedsRemaining && (
                <p className="text-xs text-red-400">
                  {t('orders.detail.refund.exceedsRemaining', {
                    amount: formatMinor(remainingMinor, eligibility?.currency),
                  })}
                </p>
              )}
              {amountMinor === null && amount !== '' && (
                <p className="text-xs text-red-400">
                  {t('orders.detail.refund.invalidAmount')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="refund-reason" className="text-sm font-medium text-gray-300">
                {t('orders.detail.refund.reasonLabel')}
              </label>
              <textarea
                id="refund-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('orders.detail.refund.reasonPlaceholder')}
                disabled={isSubmitting || isPending}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-none h-24 disabled:opacity-50"
              />
            </div>

            {eligibility?.refunds?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('orders.detail.refund.history')}
                </p>
                <div className="space-y-1">
                  {eligibility.refunds.map((refund) => (
                    <div
                      key={refund.request_id || refund.refund_id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                    >
                      <span className="font-mono text-gray-400">
                        {refund.refund_id || t('orders.detail.refund.pendingId')}
                      </span>
                      <span className="text-white">
                        {formatMinor(refund.amount_minor, refund.currency)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${
                          refund.status === 'succeeded'
                            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                            : refund.status === 'failed' || refund.status === 'canceled'
                              ? 'border-red-400/30 bg-red-400/10 text-red-300'
                              : 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300'
                        }`}
                      >
                        {t(
                          `orders.detail.refund.status.${refund.status || 'pending'}`,
                          refund.status || 'pending'
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                {t('orders.detail.refund.confirmCheckbox', {
                  amount: formatMinor(amountMinor || 0, eligibility?.currency),
                })}
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
              {t('orders.detail.refund.submitting')}
            </>
          ) : (
            <>
              <RefreshCcw size={14} />
              {isPending
                ? t('orders.detail.refund.reconcile')
                : t('orders.detail.refund.confirm')}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default RefundOrderModal;
