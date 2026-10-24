export function isTicketBlockedFromWinnerSelection(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized === 'invalid' || normalized === 'cancelled';
}
