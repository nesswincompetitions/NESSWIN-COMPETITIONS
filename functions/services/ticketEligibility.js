const INELIGIBLE_USER_STATUSES = new Set(['deleting', 'deleted']);

export function normalizeTicketStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized || 'active';
}

export function isTicketBlockedFromWinnerSelection(status) {
  const normalized = normalizeTicketStatus(status);
  return normalized === 'invalid' || normalized === 'cancelled';
}

export function isUserBlockedFromWinnerSelection(userData) {
  if (!userData || typeof userData !== 'object') {
    return true;
  }

  if (userData.is_deleted === true || userData.is_active === false) {
    return true;
  }

  const status = String(userData.status ?? '').trim().toLowerCase();
  return INELIGIBLE_USER_STATUSES.has(status);
}
