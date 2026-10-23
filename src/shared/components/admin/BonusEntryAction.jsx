import { useTranslation } from 'react-i18next';
import { Ban } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import Badge from '@/shared/components/ui/Badge';
import { getBonusEntryActionState } from '@/modules/admin/bonus/utils/bonusEntrySelectors';

const BonusEntryAction = ({ entry, onRevoke }) => {
  const { t } = useTranslation('admin');
  const actionState = getBonusEntryActionState(entry);

  if (actionState === 'revocable') {
    return (
      <Button
        variant="danger"
        aria-label={t('bonusTickets.revoke.open')}
        className="flex items-center gap-1.5 h-9"
        onClick={() => onRevoke(entry)}
      >
        <Ban size={14} /> {t('bonusTickets.revoke.open')}
      </Button>
    );
  }

  if (actionState === 'revoked') {
    return (
      <Badge variant="neutral">{t('bonusTickets.revoke.revokedBadge')}</Badge>
    );
  }

  return <span className="text-sm text-gray-600">—</span>;
};

export default BonusEntryAction;
