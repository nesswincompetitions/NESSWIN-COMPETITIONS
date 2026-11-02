import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { createAdditionalPaymentRequest } from '@/modules/admin/payments/services/additionalPaymentService';

const MAX_ADDITIONAL_TICKETS = 100;

const makeRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `additional-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const AdditionalPaymentModal = ({
  isOpen,
  onClose,
  competition,
  participant,
  onSuccess,
}) => {
  const { t } = useTranslation('admin');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setReason('');
      setConfirmed(false);
      setIsSubmitting(false);
      setErrorMessage('');
      setRequestId(makeRequestId());
      setResult(null);
    }
  }, [isOpen, competition?.id, participant?.id]);

  const canSubmit =
    !isSubmitting &&
    confirmed &&
    reason.trim().length > 0 &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    quantity <= MAX_ADDITIONAL_TICKETS &&
    Boolean(competition?.id) &&
    Boolean(participant?.id);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await createAdditionalPaymentRequest({
        userId: participant.id,
        competitionId: competition.id,
        ticketQuantity: quantity,
        reason: reason.trim(),
        requestId,
        origin: window.location.origin,
      });
      setResult(response);
      toast.success(t('additionalPayments.create.success'));
      onSuccess?.(response);
    } catch (error) {
      const message = error?.message || t('additionalPayments.create.error');
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!result?.sessionUrl) return;
    try {
      await navigator.clipboard.writeText(result.sessionUrl);
      toast.success(t('additionalPayments.copySuccess'));
    } catch {
      toast.error(t('additionalPayments.copyError'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={t('additionalPayments.create.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">
            {participant?.name || t('additionalPayments.unknownParticipant')}
          </span>
          <span className="text-gray-500 mx-2">·</span>
          {competition?.title || t('additionalPayments.unknownCompetition')}
        </div>

        <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>{t('additionalPayments.create.warning')}</p>
            <p>
              {t('additionalPayments.create.ticketPrice', {
                price: Number(competition?.ticket_price || 0).toFixed(2),
              })}
            </p>
            <p>{t('additionalPayments.create.serverAmountNote')}</p>
          </div>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  {t('additionalPayments.fields.amount')}
                </p>
                <p className="font-semibold text-white">
                  {result.request?.currency || 'GBP'} {Number(result.request?.total_amount || 0).toFixed(2)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  {t('additionalPayments.fields.quantity')}
                </p>
                <p className="font-semibold text-white">
                  {result.request?.requested_ticket_quantity || quantity}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  {t('additionalPayments.fields.paymentStatus')}
                </p>
                <p className="font-semibold text-white">
                  {t(`additionalPayments.status.${result.request?.payment_status}`, result.request?.payment_status)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  {t('additionalPayments.fields.requestId')}
                </p>
                <p className="text-xs font-mono text-gray-300 break-all">
                  {result.request?.request_id || requestId}
                </p>
              </div>
            </div>

            {result.sessionUrl ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-400">{t('additionalPayments.create.linkReady')}</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={result.sessionUrl}
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300"
                  />
                  <Button type="button" variant="outline" onClick={handleCopyLink}>
                    {t('additionalPayments.copyLink')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                {t('additionalPayments.create.noActiveLink')}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="additional-payment-quantity" className="text-sm font-medium text-gray-300">
                {t('additionalPayments.create.quantityLabel')}
              </label>
              <input
                id="additional-payment-quantity"
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
                {t('additionalPayments.create.quantityHint', { max: MAX_ADDITIONAL_TICKETS })}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="additional-payment-reason" className="text-sm font-medium text-gray-300">
                {t('additionalPayments.create.reasonLabel')}
              </label>
              <textarea
                id="additional-payment-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('additionalPayments.create.reasonPlaceholder')}
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
              <span>{t('additionalPayments.create.confirmCheckbox')}</span>
            </label>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          {result ? t('common.close') : t('common.cancel')}
        </Button>
        {!result && (
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
                {t('additionalPayments.create.submitting')}
              </>
            ) : (
              <>
                <CreditCard size={14} />
                {t('additionalPayments.create.confirm')}
              </>
            )}
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default AdditionalPaymentModal;
