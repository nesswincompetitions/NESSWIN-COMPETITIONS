import { useMemo } from 'react';
import { limit, orderBy, where } from 'firebase/firestore';
import useRealtimeCollection from '@/shared/hooks/useRealtimeCollection';

const ACTIVE_COMPETITION_STATUSES = [
  'active',
  'ready_to_draw',
  'winner_announced',
  'sold out',
  'sod out',
  'drawing',
];

const normalizeLimitCount = (limitCount) => {
  const parsed = Number(limitCount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(100, Math.floor(parsed));
};

export const useAllActiveCompetitions = () => {
  const queryConstraints = useMemo(
    () => [where('status', 'in', ACTIVE_COMPETITION_STATUSES), orderBy('created_at', 'desc')],
    []
  );

  return useRealtimeCollection('competition', queryConstraints);
};

export const useRecentOrders = (limitCount = 50) => {
  const safeLimit = normalizeLimitCount(limitCount);

  const queryConstraints = useMemo(
    () => [orderBy('created_at', 'desc'), limit(safeLimit)],
    [safeLimit]
  );

  return useRealtimeCollection('order', queryConstraints);
};

export const useRecentUsers = (limitCount = 50) => {
  const safeLimit = normalizeLimitCount(limitCount);

  const queryConstraints = useMemo(
    () => [orderBy('created_at', 'desc'), limit(safeLimit)],
    [safeLimit]
  );

  return useRealtimeCollection('user', queryConstraints);
};

export const useActiveWinnerChats = () => {
  const queryConstraints = useMemo(
    () => [
      where('status', '==', 'active'),
      where('chat_type', '==', 'winner_chat'),
      orderBy('last_message_time', 'desc'),
    ],
    []
  );

  return useRealtimeCollection('chats', queryConstraints);
};

export default {
  useAllActiveCompetitions,
  useRecentOrders,
  useRecentUsers,
  useActiveWinnerChats,
};