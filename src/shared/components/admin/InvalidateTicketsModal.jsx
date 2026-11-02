import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { invalidateUserCompetitionTickets } from '@/modules/admin/competitions/services/ticketInvalidationService';

const MAX_CONTINUATIONS = 50;
const REMOVAL_MODE_INVALIDATE = 'invalidate_only';
const REMOVAL_MODE_BLOCK = 'remove_and_block';

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
  const [mode, setMode] = useState(REMOVAL_MODE_INVALIDATE);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [partialState, setPartialState] = useState(null);
  const [requestId, setRequestId] = useState('');
  const [progress, setProgress] = useState({
    processed: 0,
    remaining: activeTicketCount,
    total: activeTicketCount,
  });
  const wasOpenRef = useRef(false);
  const lastTargetKeyRef = useRef(null);
  const activeTicketCountRef = useRef(activeTicketCount);
  activeTicketCountRef.current = activeTicketCount;

  const targetKey = `${userId ?? ''}:${competitionId ?? ''}`;

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

    const initialCount = activeTicketCountRef.current;
    wasOpenRef.current = true;
    lastTargetKeyRef.current = targetKey;
    setReason('');
    setMode(REMOVAL_MODE_INVALIDATE);
    setConfirmed(false);
    setIsSubmitting(false);
    setErrorMessage('');
    setPartialState(null);
    setProgress({
      processed: 0,
      remaining: initialCount,
      total: initialCount,
    });
    setRequestId(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `invalidate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    );
  }, [isOpen, targetKey]);

  const isBlockMode = mode === REMOVAL_MODE_BLOCK;
  const noActiveTickets = activeTicketCount === 0;
  const blocked =
    finalityBlocked || hasWinnerTicket || (!isBlockMode && noActiveTickets);
  const canSubmit =
    !isSubmitting &&
    !blocked &&
    !partialState?.blocked &&
    confirmed &&
    reason.trim().length > 0 &&
    (isBlockMode || activeTicketCount > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage('');
    const previousPartial = partialState;
    setPartialState(null);

    let processed = 0;
    let lastResult = null;

    try {
      for (let attempt = 0; attempt < MAX_CONTINUATIONS; attempt += 1) {
        const result = await invalidateUserCompetitionTickets(
          userId,
          competitionId,
          reason.trim(),
          { requestId, mode }
        );
        lastResult = result;

        processed = Number(
          result?.processedCount ?? processed + Number(result?.invalidatedCount || 0)
        );
        const remaining = Number(result?.remainingCount ?? 0);
        const total = Number(
          result?.totalEligibleCount ?? processed + remaining
        );
        setProgress({ processed, remaining, total });

        if (result?.success === false) {
          const retryable = result?.retryable === true;
          const partial = {
            operationId: result?.operationId || requestId,
            processed: Number(result?.processedCount ?? processed),
            remaining: Number(result?.remainingCount ?? 0),
            retryable,
            blocked: result?.blocked === true || !retryable,
          };
          setPartialState(partial);
          toast.error(
            retryable
              ? t('competitions.detail.participants.invalidate.partialRetry', {
                  processed: partial.processed,
                  remaining: partial.remaining,
                })
              : t('competitions.detail.participants.invalidate.partialBlocked', {
                  processed: partial.processed,
                  remaining: partial.remaining,
                })
          );
          return;
        }

        if (result?.complete === true || result?.hasMore === false) {
          break;
        }
        if (result?.retryable === false) {
          break;
        }
      }

      if (lastResult?.complete !== true && lastResult?.hasMore !== false) {
        const retryable = lastResult?.retryable === true;
        const partial = {
          operationId: lastResult?.operationId || requestId,
          processed: Number(lastResult?.processedCount ?? processed),
          remaining: Number(lastResult?.remainingCount ?? 0),
          retryable,
          blocked: lastResult?.blocked === true || !retryable,
        };
        setPartialState(partial);
        setProgress({
          processed: partial.processed,
          remaining: partial.remaining,
          total: Number(
            lastResult?.totalEligibleCount ??
              partial.processed + partial.remaining
          ),
        });
        toast.error(
          retryable
            ? t('competitions.detail.participants.invalidate.partialRetry', {
                processed: partial.processed,
                remaining: partial.remaining,
              })
            : t('competitions.detail.participants.invalidate.partialBlocked', {
                processed: partial.processed,
                remaining: partial.remaining,
              })
        );
        return;
      }

      const totalInvalidated = Number(
        lastResult?.processedCount ?? lastResult?.invalidatedCount ?? processed
      );
      if (isBlockMode) {
        if (totalInvalidated > 0) {
          toast.success(
            t('competitions.detail.participants.invalidate.successBlock', {
              count: totalInvalidated,
            })
          );
        } else {
          toast.success(
            t('competitions.detail.participants.invalidate.nothingBlock')
          );
        }
      } else if (totalInvalidated > 0) {
        toast.success(
          t('competitions.detail.participants.invalidate.success', {
            count: totalInvalidated,
          })
        );
      } else {
        toast(t('competitions.detail.participants.invalidate.nothing'));
      }
      onSuccess?.(lastResult);
      onClose();
    } catch (error) {
      const message =
        error?.message || t('competitions.detail.participants.invalidate.error');
      const knownProcessed = Number(lastResult?.processedCount ?? processed);
      const knownRemaining = Number(
        lastResult?.remainingCount ?? progress.remaining ?? 0
      );

      if (lastResult || knownProcessed > 0) {
        const partial = {
          operationId: lastResult?.operationId || requestId,
          processed: knownProcessed,
          remaining: knownRemaining,
          retryable: true,
          blocked: false,
        };
        setPartialState(partial);
        setProgress({
          processed: partial.processed,
          remaining: partial.remaining,
          total: Number(
            lastResult?.totalEligibleCount ??
              partial.processed + partial.remaining
          ),
        });
      } else if (previousPartial) {
        setPartialState(previousPartial);
        setProgress({
          processed: previousPartial.processed,
          remaining: previousPartial.remaining,
          total: previousPartial.processed + previousPartial.remaining,
        });
      }

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
      title={t('competitions.detail.participants.invalidate.title')}
    >
      <div className="space-y-4">
        <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
          <span className="font-medium text-white">{userName}</span>
          <span className="text-gray-500 mx-2">·</span>
          {competitionTitle}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">
            {t('competitions.detail.participants.invalidate.modeLabel')}
          </p>
          <label
            className={`flex items-start gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${
              mode === REMOVAL_MODE_INVALIDATE
                ? 'border-primary/40 bg-primary/5'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="participant-removal-mode"
              value={REMOVAL_MODE_INVALIDATE}
              checked={mode === REMOVAL_MODE_INVALIDATE}
              onChange={() => setMode(REMOVAL_MODE_INVALIDATE)}
              disabled={isSubmitting || Boolean(partialState)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-white">
                {t('competitions.detail.participants.invalidate.modeInvalidate')}
              </span>
              <span className="block text-xs text-gray-400 mt-0.5">
                {t('competitions.detail.participants.invalidate.modeInvalidateHint')}
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${
              mode === REMOVAL_MODE_BLOCK
                ? 'border-red-400/40 bg-red-400/5'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="participant-removal-mode"
              value={REMOVAL_MODE_BLOCK}
              checked={mode === REMOVAL_MODE_BLOCK}
              onChange={() => setMode(REMOVAL_MODE_BLOCK)}
              disabled={isSubmitting || Boolean(partialState)}
              className="mt-0.5 h-4 w-4 accent-red-500"
            />
            <span>
              <span className="block text-sm font-medium text-white">
                {t('competitions.detail.participants.invalidate.modeBlock')}
              </span>
              <span className="block text-xs text-gray-400 mt-0.5">
                {t('competitions.detail.participants.invalidate.modeBlockHint')}
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-start gap-3 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30 rounded-lg text-sm text-orange-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>
              {t(
                isBlockMode
                  ? 'competitions.detail.participants.invalidate.warningBlock'
                  : 'competitions.detail.participants.invalidate.warning'
              )}
            </p>
            {noActiveTickets && isBlockMode ? (
              <p>
                {t('competitions.detail.participants.invalidate.blockNoActive')}
              </p>
            ) : (
              <p>
                {t('competitions.detail.participants.invalidate.affected', {
                  count: activeTicketCount,
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
            {activeTicketCount > 400 && (
              <p>
                {t('competitions.detail.participants.invalidate.largeOperation', {
                  count: activeTicketCount,
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

        {!finalityBlocked && !hasWinnerTicket && activeTicketCount === 0 && !isBlockMode && (
          <div className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400">
            {t('competitions.detail.participants.invalidate.noActive')}
          </div>
        )}

        {(isSubmitting || progress.processed > 0) && (
          <div className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300">
            {t('competitions.detail.participants.invalidate.progress', {
              processed: progress.processed,
              total: progress.total,
              remaining: progress.remaining,
            })}
          </div>
        )}

        {partialState && (
          <div
            className={`px-3 py-2.5 border rounded-lg text-sm space-y-1 ${
              partialState.blocked
                ? 'bg-red-400/10 border-red-400/30 text-red-300'
                : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300'
            }`}
          >
            <p>
              {partialState.retryable
                ? t('competitions.detail.participants.invalidate.partialRetry', {
                    processed: partialState.processed,
                    remaining: partialState.remaining,
                  })
                : t('competitions.detail.participants.invalidate.partialBlocked', {
                    processed: partialState.processed,
                    remaining: partialState.remaining,
                  })}
            </p>
            <p className="font-mono text-xs opacity-80">
              {t('competitions.detail.participants.invalidate.partialDetails', {
                operationId: partialState.operationId,
                processed: partialState.processed,
                remaining: partialState.remaining,
              })}
            </p>
            {partialState.blocked && (
              <p>
                {t('competitions.detail.participants.invalidate.manualReview')}
              </p>
            )}
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
            disabled={isSubmitting || blocked || partialState?.blocked}
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={isSubmitting || blocked || partialState?.blocked}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-red-500"
          />
          <span>
            {t(
              isBlockMode
                ? 'competitions.detail.participants.invalidate.confirmCheckboxBlock'
                : 'competitions.detail.participants.invalidate.confirmCheckbox'
            )}
          </span>
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
              {t(
                isBlockMode
                  ? 'competitions.detail.participants.invalidate.submittingBlock'
                  : 'competitions.detail.participants.invalidate.submitting'
              )}
            </>
          ) : (
            <>
              <Ban size={14} />
              {t(
                isBlockMode
                  ? 'competitions.detail.participants.invalidate.confirmBlock'
                  : 'competitions.detail.participants.invalidate.confirm'
              )}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default InvalidateTicketsModal;
