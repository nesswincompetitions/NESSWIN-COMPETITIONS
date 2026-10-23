import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { AlertTriangle, Loader2, ShieldAlert, Undo2 } from 'lucide-react';
import { revokeAdminBonus } from '@/modules/admin/bonus/services/bonusService';

const BLOCKING_ERROR_CODES = new Set([
  'failed-precondition',
  'invalid-argument',
  'permission-denied',
  'unauthenticated',
  'not-found',
]);

const RevokeBonusModal = ({
  isOpen,
  onClose,
  userId,
  userName,
  entryReason,
  totalQuantity = 0,
  usedQuantity = 0,
  revokedQuantity = 0,
  unusedQuantity = 0,
  creditIds = [],
}) => {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partial, setPartial] = useState(null);
  const [retryIds, setRetryIds] = useState(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setPartial(null);
      setIsSubmitting(false);
      setRetryIds(null);
      setExcludedCount(0);
      setBlocked(false);
    }
  }, [isOpen, creditIds]);

  const activeIds = retryIds ?? creditIds;
  const selectedCount = activeIds.length;
  const displayedEligible = partial ? (partial.remainingCount ?? 0) : unusedQuantity;
  const partialSummary = partial
    ? (partial.revokedCount > 0
        ? t('bonusTickets.revoke.partialSummary', {
            revoked: partial.revokedCount,
            eligible: partial.eligibleCount ?? (partial.revokedCount + (partial.remainingCount ?? 0)),
          })
        : t('bonusTickets.revoke.nothingRevoked'))
    : '';
  const canSubmit =
    isOpen &&
    !isSubmitting &&
    !partial &&
    !blocked &&
    unusedQuantity > 0 &&
    selectedCount > 0 &&
    reason.trim();

  const retryable =
    !isSubmitting &&
    (partial?.retryable ??
      (!partial?.drift &&
        !partial?.balanceInvalid &&
        (partial?.remainingCount ?? 0) > 0 &&
        selectedCount > 0));

  const handleSubmit = async () => {
    const submittedIds = retryIds ?? creditIds;
    if (submittedIds.length === 0) {
      toast.error(t('bonusTickets.revoke.errorToast'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await revokeAdminBonus(userId, submittedIds, reason.trim());
      if (result?.complete) {
        toast.success(
          result.revokedCount > 0
            ? t('bonusTickets.revoke.successMessage', { count: result.revokedCount })
            : t('bonusTickets.revoke.nothingToRevoke')
        );
        onClose();
        return;
      }

      const nextIds = Array.isArray(result?.retryableCreditIds)
        ? result.retryableCreditIds
        : submittedIds;
      setRetryIds(nextIds);
      setExcludedCount(result?.stateChangeCount ?? 0);

      const resultSummary = result.revokedCount > 0
        ? t('bonusTickets.revoke.partialSummary', {
            revoked: result.revokedCount,
            eligible: result.eligibleCount ?? (result.revokedCount + (result.remainingCount ?? 0)),
          })
        : t('bonusTickets.revoke.nothingRevoked');

      setPartial(result);
      if (result?.outcome === 'blocked' || (result?.outcome === undefined && result?.success === false)) {
        toast.error(resultSummary);
      } else {
        toast(resultSummary, { duration: 6000 });
      }
    } catch (error) {
      const errorCode = String(error?.code || '').replace(/^functions\//, '');
      if (BLOCKING_ERROR_CODES.has(errorCode)) {
        setBlocked(true);
      }
      toast.error(error?.message || t('bonusTickets.revoke.errorToast'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('bonusTickets.revoke.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">{userName}</span>
          <span className="text-gray-500 mx-2">·</span>
          {entryReason}
        </div>

        <div className="flex items-start gap-3 px-3 py-2.5 bg-yellow-400/10 border border-yellow-400/30 rounded-lg text-sm text-yellow-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('bonusTickets.revoke.legacyWarning')}</span>
        </div>

        <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            {t('bonusTickets.revoke.eligibility', {
              eligible: displayedEligible,
              selected: selectedCount,
              total: totalQuantity,
              used: usedQuantity,
              revoked: revokedQuantity,
            })}
          </span>
        </div>

        {blocked && (
          <div className="px-3 py-2.5 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300">
            {t('bonusTickets.revoke.blockedNotice')}
          </div>
        )}

        {partial && (
          <div className="px-3 py-2.5 bg-white/5 border border-orange-400/30 rounded-lg text-sm space-y-2">
            <p className="text-orange-300 font-medium">{partialSummary}</p>
            {partial.drift && (
              <p className="text-orange-300">{t('bonusTickets.revoke.driftNotice')}</p>
            )}
            {partial.balanceInvalid && (
              <p className="text-red-300">{t('bonusTickets.revoke.balanceInvalidNotice')}</p>
            )}
            {excludedCount > 0 && (
              <p className="text-yellow-300">
                {t('bonusTickets.revoke.excludedNotice', { count: excludedCount })}
              </p>
            )}
            {partial.retryable === false && !partial.drift && !partial.balanceInvalid && partial.stateChangeCount === 0 && (
              <p className="text-yellow-300">{t('bonusTickets.revoke.stateChangeNotice')}</p>
            )}
            {partial.skippedRedeemed > 0 && (
              <p className="text-gray-400">
                {t('bonusTickets.revoke.skippedRedeemed', { count: partial.skippedRedeemed })}
              </p>
            )}
            {partial.skippedRevoked > 0 && (
              <p className="text-gray-400">
                {t('bonusTickets.revoke.skippedRevoked', { count: partial.skippedRevoked })}
              </p>
            )}
            {partial.retryable && !partial.drift && !partial.balanceInvalid && partial.remainingCount > 0 && (
              <p className="text-gray-400">
                {t('bonusTickets.revoke.remainingNotice', { count: partial.remainingCount })}
              </p>
            )}
            {partial.retryable && !partial.drift && !partial.balanceInvalid && partial.remainingCount > 0 && (
              <p className="text-gray-400">{t('bonusTickets.revoke.partialNotice')}</p>
            )}
            {(partial.drift || partial.balanceInvalid) && (
              <p className="text-gray-400">{t('bonusTickets.revoke.reconcileNotice')}</p>
            )}
            <Button
              variant="outline"
              onClick={handleSubmit}
              disabled={!retryable}
              className="flex items-center gap-2"
            >
              <Undo2 size={14} />
              {t('bonusTickets.revoke.retry')}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            {t('bonusTickets.revoke.reasonLabel')}
          </label>
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('bonusTickets.revoke.reasonPlaceholder')}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 resize-none h-24"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={isSubmitting}
        >
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
              {t('bonusTickets.revoke.submitting')}
            </>
          ) : (
            t('bonusTickets.revoke.confirm')
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default RevokeBonusModal;
