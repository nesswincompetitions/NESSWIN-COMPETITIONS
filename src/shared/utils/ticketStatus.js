export const normalizeTicketStatus = (ticket) =>
  String(ticket?.status || '').trim().toLowerCase();

export const isInvalidatedTicket = (ticket) =>
  normalizeTicketStatus(ticket) === 'invalid';

export const isActiveTicket = (ticket) =>
  normalizeTicketStatus(ticket) === 'active';
