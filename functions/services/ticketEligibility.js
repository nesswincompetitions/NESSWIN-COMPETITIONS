export function normalizeTicketStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized || 'active';
}

export function isTicketBlockedFromWinnerSelection(status) {
  const normalized = normalizeTicketStatus(status);
  return normalized === 'invalid' || normalized === 'cancelled';
}
