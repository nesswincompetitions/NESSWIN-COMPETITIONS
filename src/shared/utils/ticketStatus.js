export const normalizeTicketStatus = (ticket) => {
  const normalized = String(ticket?.status || '').trim().toLowerCase();
  return normalized || 'active';
};

export const isInvalidatedTicket = (ticket) =>
  normalizeTicketStatus(ticket) === 'invalid';

export const isActiveTicket = (ticket) =>
  normalizeTicketStatus(ticket) === 'active';
