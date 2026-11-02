import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { ExternalLink, Loader2, RefreshCcw } from 'lucide-react';
import { Card, CardContent } from '@/shared/components/ui/Card';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import ConfirmationModal from '@/shared/components/ui/ConfirmationModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/Table';
import {
  createAdditionalPaymentRequest,
  getAdditionalPaymentCheckoutUrl,
  listAdditionalPaymentRequests,
  recoverAdditionalPaymentFulfillment,
} from '@/modules/admin/payments/services/additionalPaymentService';

const statusVariant = (status) => {
  switch (status) {
    case 'paid':
      return 'success';
    case 'processing':
      return 'warning';
    case 'expired':
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
};

const AdditionalPaymentRequestsPanel = ({
  competitionId,
  participants = [],
  refreshKey = 0,
  onOpenRequest,
}) => {
  const { t } = useTranslation('admin');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [recoveryTarget, setRecoveryTarget] = useState(null);
  const [recoveryError, setRecoveryError] = useState('');

  const participantNames = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.name])),
    [participants]
  );

  const loadRequests = useCallback(async () => {
    if (!competitionId) return;
    setLoading(true);
    try {
      const result = await listAdditionalPaymentRequests({ competitionId });
      setRequests(result.requests || []);
    } catch (error) {
      toast.error(error?.message || t('additionalPayments.list.loadError'));
    } finally {
      setLoading(false);
    }
  }, [competitionId, t]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests, refreshKey, localRefreshKey]);

  const handleCopyLink = async (request) => {
    setBusyId(request.request_id);
    try {
      const result = await getAdditionalPaymentCheckoutUrl(request.request_id);
      if (result?.url) {
        await navigator.clipboard.writeText(result.url);
        toast.success(t('additionalPayments.copySuccess'));
      } else {
        toast.error(t('additionalPayments.copyUnavailable'));
      }
    } catch (error) {
      toast.error(error?.message || t('additionalPayments.copyError'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryLink = async (request) => {
    setBusyId(request.request_id);
    try {
      const result = await createAdditionalPaymentRequest({
        userId: request.user_id,
        competitionId: request.competition_id,
        ticketQuantity: request.requested_ticket_quantity,
        reason: request.reason,
        requestId: request.request_id,
        origin: window.location.origin,
      });
      if (result?.sessionUrl) {
        await navigator.clipboard.writeText(result.sessionUrl);
        toast.success(t('additionalPayments.copySuccess'));
      } else {
        toast.success(t('additionalPayments.retrySuccess'));
      }
      setLocalRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error(error?.message || t('additionalPayments.retryError'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRecover = async () => {
    if (!recoveryTarget) return;
    setBusyId(recoveryTarget.request_id);
    setRecoveryError('');
    try {
      const result = await recoverAdditionalPaymentFulfillment(
        recoveryTarget.request_id
      );
      if (result?.outcome === 'already_fulfilled') {
        toast.success(t('additionalPayments.recovery.already'));
      } else {
        toast.success(t('additionalPayments.recovery.success'));
      }
      setRecoveryTarget(null);
      setLocalRefreshKey((key) => key + 1);
    } catch (error) {
      const message =
        error?.message || t('additionalPayments.recovery.error');
      setRecoveryError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const canCopyLink = (request) =>
    request.can_pay && request.has_checkout_session && request.payment_status === 'pending';

  const canRecover = (request) =>
    request.recovery_available === true ||
    (request.payment_status === 'paid' &&
      request.fulfillment_status === 'failed' &&
      request.has_checkout_session === true);

  return (
    <Card className="fade-in">
      <div className="p-6 border-b border-white/10 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('additionalPayments.list.title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('additionalPayments.list.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocalRefreshKey((key) => key + 1)}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
          {t('additionalPayments.list.refresh')}
        </Button>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('additionalPayments.fields.participant')}</TableHead>
              <TableHead>{t('additionalPayments.fields.quantity')}</TableHead>
              <TableHead>{t('additionalPayments.fields.amount')}</TableHead>
              <TableHead>{t('additionalPayments.fields.paymentStatus')}</TableHead>
              <TableHead>{t('additionalPayments.fields.fulfillmentStatus')}</TableHead>
              <TableHead>{t('additionalPayments.recovery.column')}</TableHead>
              <TableHead>{t('additionalPayments.fields.expires')}</TableHead>
              <TableHead className="text-right">{t('additionalPayments.fields.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <Loader2 size={24} className="animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-sm text-gray-500">
                  {t('additionalPayments.list.empty')}
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.request_id}>
                  <TableCell className="text-white">
                    <p className="font-medium">
                      {participantNames.get(request.user_id) || request.user_id}
                    </p>
                    <p className="text-[10px] font-mono text-gray-500">{request.request_id}</p>
                  </TableCell>
                  <TableCell className="text-gray-300">{request.requested_ticket_quantity}</TableCell>
                  <TableCell className="text-gray-300">
                    {request.currency} {Number(request.total_amount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(request.payment_status)}>
                      {t(`additionalPayments.status.${request.payment_status}`, request.payment_status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        request.fulfillment_status === 'fulfilled'
                          ? 'success'
                          : request.fulfillment_status === 'failed'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {t(
                        `additionalPayments.fulfillment.${request.fulfillment_status}`,
                        request.fulfillment_status
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canRecover(request) ? (
                      <Badge variant="warning">
                        {t('additionalPayments.recovery.available')}
                      </Badge>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-400 text-xs">
                    {request.expires_at_millis
                      ? new Date(request.expires_at_millis).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canCopyLink(request) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === request.request_id}
                          onClick={() => handleCopyLink(request)}
                        >
                          {t('additionalPayments.copyLink')}
                        </Button>
                      )}
                      {request.payment_status === 'pending' && !request.has_checkout_session && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === request.request_id}
                          onClick={() => handleRetryLink(request)}
                        >
                          {t('additionalPayments.retryLink')}
                        </Button>
                      )}
                      {canRecover(request) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === request.request_id}
                          onClick={() => {
                            setRecoveryError('');
                            setRecoveryTarget(request);
                          }}
                        >
                          {t('additionalPayments.recovery.action')}
                        </Button>
                      )}
                      {request.order_id && (
                        <a
                          href={`/admin/orders/${request.order_id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                        >
                          <ExternalLink size={12} />
                          {t('additionalPayments.viewOrder')}
                        </a>
                      )}
                      {!request.order_id && request.payment_status === 'pending' && onOpenRequest && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenRequest(request)}
                        >
                          {t('additionalPayments.view')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
      <ConfirmationModal
        isOpen={!!recoveryTarget}
        onClose={() => !busyId && setRecoveryTarget(null)}
        onConfirm={handleRecover}
        title={t('additionalPayments.recovery.title')}
        description={
          recoveryError ||
          (recoveryTarget
            ? t('additionalPayments.recovery.description', {
                requestId: recoveryTarget.request_id,
                tickets: recoveryTarget.requested_ticket_quantity,
                amount: Number(recoveryTarget.total_amount || 0).toFixed(2),
                currency: recoveryTarget.currency,
              })
            : '')
        }
        confirmLabel={t('additionalPayments.recovery.confirm')}
        cancelLabel={t('common.cancel')}
        variant="primary"
        loading={busyId === recoveryTarget?.request_id}
      />
    </Card>
  );
};

export default AdditionalPaymentRequestsPanel;
