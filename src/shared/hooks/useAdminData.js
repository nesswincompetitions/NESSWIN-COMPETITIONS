import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, limit, onSnapshot, orderBy, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import useRealtimeCollection from '@/shared/hooks/useRealtimeCollection';

const ACTIVE_COMPETITION_STATUSES = [
  'active',
  'ready_to_draw',
  'drawing',
];

const WINNER_COMPETITION_STATUSES = [
  'winner_announced',
  'completed',
  'closed',
];

const normalizeLimitCount = (limitCount) => {
  const parsed = Number(limitCount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(100, Math.floor(parsed));
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getReferenceId = (referenceLike) => {
  if (!referenceLike) return null;
  if (typeof referenceLike === 'string') {
    if (referenceLike.includes('/')) {
      const parts = referenceLike.split('/');
      return parts[parts.length - 1];
    }
    return referenceLike;
  }
  return referenceLike.id || null;
};

const mapCompetitionSummary = (competition) => {
  const sold = Number(competition?.sold_tickets) || 0;
  const total = Number(competition?.total_tickets) || 0;
  const price = Number(competition?.ticket_price) || 0;

  return {
    ...competition,
    name: competition?.title || 'Untitled',
    subTitle: competition?.sub_title || competition?.tag || '',
    status: competition?.status || 'draft',
    price: `£${price}`,
    sold,
    total,
    revenue: `£${(sold * price).toLocaleString()}`,
    drawDate: competition?.draw_date || null,
    image: competition?.image?.[0] || null,
    createdAt: competition?.created_at?.toDate?.() || new Date(),
    last_ticket_sequence: Number(competition?.last_ticket_sequence) || 0,
  };
};

// Global client-side memory cache with TTL (5 minutes)
const globalUserCache = {};
const globalCompCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getFromCache = (cache, id) => {
  const entry = cache[id];
  if (!entry) return null;
  const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
  if (isExpired) {
    delete cache[id];
    return null;
  }
  return entry.data;
};

const setInCache = (cache, id, data) => {
  cache[id] = {
    data,
    timestamp: Date.now()
  };
};

const getActiveCacheMap = (cache) => {
  const activeMap = {};
  const now = Date.now();
  Object.keys(cache).forEach(id => {
    const entry = cache[id];
    if (entry && now - entry.timestamp <= CACHE_TTL_MS) {
      activeMap[id] = entry.data;
    } else {
      delete cache[id];
    }
  });
  return activeMap;
};

/**
 * Internal hook to resolve multiple references from a list of items.
 */
const useEnrichment = (items, userRefKey, compRefKey) => {
  const [userMap, setUserMap] = useState(() => getActiveCacheMap(globalUserCache));
  const [compMap, setCompMap] = useState(() => getActiveCacheMap(globalCompCache));
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!items || items.length === 0) return;

    // Synchronize any items present in the global cache but missing from local state
    let localStateNeedsUpdate = false;
    const nextUserMap = { ...userMap };
    const nextCompMap = { ...compMap };

    items.forEach((item) => {
      if (userRefKey) {
        const uId = getReferenceId(item[userRefKey]);
        const cachedUser = getFromCache(globalUserCache, uId);
        if (uId && cachedUser && !userMap[uId]) {
          nextUserMap[uId] = cachedUser;
          localStateNeedsUpdate = true;
        }
      }
      if (compRefKey) {
        const cId = getReferenceId(item[compRefKey]);
        const cachedComp = getFromCache(globalCompCache, cId);
        if (cId && cachedComp && !compMap[cId]) {
          nextCompMap[cId] = cachedComp;
          localStateNeedsUpdate = true;
        }
      }
    });

    if (localStateNeedsUpdate) {
      setUserMap(nextUserMap);
      setCompMap(nextCompMap);
      return;
    }

    const resolveRefs = async () => {
      const missingUserIds = new Set();
      const missingCompIds = new Set();

      items.forEach((item) => {
        if (userRefKey) {
          const uId = getReferenceId(item[userRefKey]);
          if (uId && !userMap[uId] && !getFromCache(globalUserCache, uId)) missingUserIds.add(uId);
        }
        if (compRefKey) {
          const cId = getReferenceId(item[compRefKey]);
          if (cId && !compMap[cId] && !getFromCache(globalCompCache, cId)) missingCompIds.add(cId);
        }
      });

      if (missingUserIds.size === 0 && missingCompIds.size === 0) return;

      setResolving(true);
      try {
        const userSnaps = await Promise.all(
          Array.from(missingUserIds).map((id) => getDoc(doc(db, 'user', id)))
        );
        const compSnaps = await Promise.all(
          Array.from(missingCompIds).map((id) => getDoc(doc(db, 'competition', id)))
        );

        if (userSnaps.length > 0) {
          userSnaps.forEach((snap) => {
            if (snap.exists()) {
              const data = { id: snap.id, ...snap.data() };
              setInCache(globalUserCache, snap.id, data);
            }
          });
          setUserMap((prev) => ({ ...prev, ...getActiveCacheMap(globalUserCache) }));
        }

        if (compSnaps.length > 0) {
          compSnaps.forEach((snap) => {
            if (snap.exists()) {
              const data = { id: snap.id, ...snap.data() };
              setInCache(globalCompCache, snap.id, data);
            }
          });
          setCompMap((prev) => ({ ...prev, ...getActiveCacheMap(globalCompCache) }));
        }
      } catch (err) {
        console.error('[useEnrichment] Error resolving references:', err);
      } finally {
        setResolving(false);
      }
    };

    void resolveRefs();
  }, [items, userRefKey, compRefKey, userMap, compMap]);

  const needsResolution = useMemo(() => {
    if (!items || items.length === 0) return false;
    return items.some(item => {
      const uId = getReferenceId(item[userRefKey]);
      const cId = getReferenceId(item[compRefKey]);
      return (uId && !userMap[uId] && !getFromCache(globalUserCache, uId)) || 
             (cId && !compMap[cId] && !getFromCache(globalCompCache, cId));
    });
  }, [items, userMap, compMap, userRefKey, compRefKey]);

  return { userMap, compMap, resolving: resolving || needsResolution };
};

const useRealtimeDocument = (pathSegments) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const pathKey = useMemo(() => JSON.stringify(Array.isArray(pathSegments) ? pathSegments : []), [pathSegments]);

  useEffect(() => {
    const segments = Array.isArray(pathSegments) ? pathSegments.filter(Boolean) : [];

    if (segments.length < 2 || segments.length % 2 !== 0) {
      setData(null);
      setLoading(false);
      setError(new Error('A valid Firestore document path is required.'));
      return undefined;
    }

    setLoading(true);
    setError(null);

    let unsubscribe = () => {};

    try {
      const documentRef = doc(db, ...segments);
      unsubscribe = onSnapshot(
        documentRef,
        (snapshot) => {
          setData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
          setLoading(false);
        },
        (snapshotError) => {
          setError(snapshotError);
          setLoading(false);
          console.error(`[useAdminData] Firestore document listener error for ${pathKey}:`, snapshotError);
        }
      );
    } catch (setupError) {
      setError(setupError);
      setLoading(false);
      console.error(`[useAdminData] Failed to setup document listener for ${pathKey}:`, setupError);
    }

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [pathKey]);

  return { data, loading, error };
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
    () => [orderBy('created_time', 'desc'), limit(safeLimit)],
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

export const useCompetitionDrafts = () => {
  const queryConstraints = useMemo(
    () => [where('status', '==', 'draft'), orderBy('created_at', 'desc')],
    []
  );

  return useRealtimeCollection('competition', queryConstraints);
};

export const useAdminCompetitionsFeed = () => {
  const queryConstraints = useMemo(
    () => [where('status', '!=', 'deleted'), orderBy('status'), orderBy('created_at', 'desc')],
    []
  );

  const { data, loading, error } = useRealtimeCollection('competition', queryConstraints);
  const competitions = useMemo(() => data.map(mapCompetitionSummary), [data]);

  return { data: competitions, loading, error };
};

export const useAdminOrdersFeed = (limitCount = 50) => {
  const safeLimit = normalizeLimitCount(limitCount);
  const { data: orders, loading: ordersLoading, error: ordersError } = useRecentOrders(safeLimit);
  const { userMap, compMap, resolving } = useEnrichment(orders, 'user_ref', 'competition_id');

  const enrichedOrders = useMemo(() => orders.map((order) => {
    const userId = getReferenceId(order.user_ref);
    const competitionId = getReferenceId(order.competition_id);
    const user = userMap[userId];
    const competition = compMap[competitionId];

    return {
      ...order,
      userId,
      userName: user?.display_name || user?.name || 'Unknown User',
      userEmail: user?.email || 'N/A',
      competitionName: competition?.title || competition?.name || 'Unknown Competition',
      userPhoto: user?.photo_url || user?.profile_image || '',
    };
  }), [orders, userMap, compMap]);

  return {
    data: enrichedOrders,
    loading: ordersLoading || resolving,
    error: ordersError,
  };
};

export const useAdminReferralsFeed = () => {
  const queryConstraints = useMemo(() => [], []);
  const { data: referrals, loading: referralsLoading, error: referralsError } = useRealtimeCollection('referrals', queryConstraints);
  const { userMap, resolving } = useEnrichment(referrals, 'referrer_id', null);

  const aggregatedData = useMemo(() => {
    const referrerMap = {};

    // Filter out admin_bonus client-side to ensure docs with missing reward_type are included
    const organicReferrals = referrals.filter(ref => ref.reward_type !== 'admin_bonus');

    organicReferrals.forEach((ref) => {
      const rId = getReferenceId(ref.referrer_id);
      if (!rId) return;

      if (!referrerMap[rId]) {
        const user = userMap[rId];
        referrerMap[rId] = {
          id: rId,
          display_name: user?.display_name || user?.name || 'Unknown User',
          name: user?.display_name || user?.name || 'Unknown User',
          email: user?.email || 'N/A',
          referral_code: user?.referral_code || '—',
          referral_count: 0,
          total_free_tickets: 0,
          created_time: user?.created_time || user?.created_at || null,
          photo_url: user?.photo_url || user?.profile_image || '',
        };
      }

      referrerMap[rId].referral_count += 1;
      referrerMap[rId].total_free_tickets += Number(ref.reward_value || 0);
    });

    return Object.values(referrerMap).sort((a, b) => b.referral_count - a.referral_count);
  }, [referrals, userMap]);

  return {
    data: aggregatedData,
    loading: referralsLoading || resolving,
    error: referralsError,
  };
};

export const useAdminUsersFeed = (limitCount = 50) => {
  const safeLimit = normalizeLimitCount(limitCount);
  const { data: users, loading: usersLoading, error: usersError } = useRecentUsers(safeLimit);
  const { data: competitions, loading: competitionsLoading, error: competitionsError } = useRealtimeCollection('competition', []);

  const usersWithCounts = useMemo(() => {
    const countsByUserId = {};

    competitions.forEach((competition) => {
      const participantIds = Array.isArray(competition.participants)
        ? competition.participants.map(getReferenceId).filter(Boolean)
        : [];

      participantIds.forEach((userId) => {
        countsByUserId[userId] = (countsByUserId[userId] || 0) + 1;
      });
    });

    return users.map((user) => ({
      ...user,
      compsEntered: countsByUserId[user.id] || 0,
    }));
  }, [users, competitions]);

  return {
    data: usersWithCounts,
    loading: usersLoading || competitionsLoading,
    error: usersError || competitionsError,
  };
};

export const useAdminDashboardData = () => {
  const dashboardStats = useRealtimeDocument(['system_metrics', 'dashboard']);
  const { data: competitions, loading: competitionsLoading, error: competitionsError } = useRealtimeCollection('competition', []);
  const { data: recentOrders, loading: ordersLoading, error: ordersError } = useRecentOrders(5);
  const { data: allOrders, loading: allOrdersLoading, error: allOrdersError } = useRealtimeCollection('order', []);
  
  const { userMap, compMap, resolving } = useEnrichment(recentOrders, 'user_ref', 'competition_id');

  const activeCompetitionsList = useMemo(
    () => competitions.filter((c) => ACTIVE_COMPETITION_STATUSES.includes(c.status)).map(mapCompetitionSummary),
    [competitions]
  );

  const upcomingDrawsList = useMemo(() => {
    const statusOrder = {
      'active': 1,
      'ready_to_draw': 2,
      'drawing': 3
    };

    return [...activeCompetitionsList]
      .sort((a, b) => {
        const orderA = statusOrder[a.status] || 99;
        const orderB = statusOrder[b.status] || 99;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return toMillis(a.draw_date) - toMillis(b.draw_date);
      })
      .slice(0, 3);
  }, [activeCompetitionsList]);

  const recentOrdersList = useMemo(
    () => recentOrders.map((order) => {
      const userId = getReferenceId(order.user_ref);
      const competitionId = getReferenceId(order.competition_id);
      const user = userMap[userId];
      const competition = compMap[competitionId];

      return {
        ...order,
        userId,
        userName: user?.display_name || user?.name || 'Unknown User',
        userEmail: user?.email || 'N/A',
        competitionName: competition?.title || competition?.name || 'Unknown Competition',
      };
    }),
    [recentOrders, userMap, compMap]
  );

  const totalWinners = useMemo(
    () => competitions.filter((competition) => {
      const status = String(competition.status || '').toLowerCase();
      return Boolean(competition.winner_ref) || WINNER_COMPETITION_STATUSES.includes(status);
    }).length,
    [competitions]
  );

  const drawsEndingSoon = useMemo(() => {
    const now = Date.now();
    const sevenDaysMs = now + (7 * 24 * 60 * 60 * 1000);

    return activeCompetitionsList.filter((competition) => {
      // Use draw_date from mapped competition summary, fallback to countdown_end.
      const endTimestamp = toMillis(competition.drawDate || competition.draw_date || competition.countdown_end);
      return endTimestamp > now && endTimestamp <= sevenDaysMs;
    }).length;
  }, [activeCompetitionsList]);

  return {
    data: {
      totalOrders: allOrders.length,
      totalRevenue: dashboardStats.data?.total_revenue || 0,
      totalRegisteredUsers: dashboardStats.data?.total_registered_users || dashboardStats.data?.registered_users || 0,
      ticketsSoldToday: dashboardStats.data?.tickets_sold_today || 0,
      revenueToday: (dashboardStats.data?.tickets_sold_today || 0) * 5, // fallback calculation based on tickets sold today
      activeCompetitions: dashboardStats.data?.total_active_competitions || activeCompetitionsList.length,
      totalWinners: dashboardStats.data?.total_winners || dashboardStats.data?.pending_winners || totalWinners,
      drawsEndingSoon: dashboardStats.data?.draws_ending_soon || drawsEndingSoon,
      activeCompetitionsList,
      upcomingDrawsList,
      recentOrdersList,
    },
    loading: dashboardStats.loading || competitionsLoading || ordersLoading || allOrdersLoading || resolving,
    error: dashboardStats.error || competitionsError || ordersError || allOrdersError,
  };
};

export const useWinnerCompetitionsFeed = () => {
  const queryConstraints = useMemo(
    () => [where('status', 'in', WINNER_COMPETITION_STATUSES), orderBy('created_at', 'desc')],
    []
  );

  const { data: competitions, loading, error } = useRealtimeCollection('competition', queryConstraints);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const resolveRows = async () => {
      const resolved = await Promise.all(competitions.map(async (competition) => {
        const winnerUserRef = competition.winner_ref;
        const winnerTicketRef = competition.winner_ticket_ref;

        const [winnerUserSnap, winnerTicketSnap] = await Promise.all([
          winnerUserRef ? getDoc(winnerUserRef) : Promise.resolve(null),
          winnerTicketRef ? getDoc(winnerTicketRef) : Promise.resolve(null),
        ]);

        const winnerUser = winnerUserSnap?.exists() ? { id: winnerUserSnap.id, ...winnerUserSnap.data() } : null;
        const winnerTicket = winnerTicketSnap?.exists() ? { id: winnerTicketSnap.id, ...winnerTicketSnap.data() } : null;

        return {
          ...competition,
          competition: competition.title || 'Untitled',
          drawDate: competition.draw_date || null,
          winnerName: winnerUser?.display_name || winnerUser?.name || 'Unknown User',
          winnerEmail: winnerUser?.email || 'N/A',
          winnerPhoto: winnerUser?.photo_url || winnerUser?.profile_image || '',
          ticket: winnerTicket?.ticket_sequence || (winnerTicket?.ticket_number ? `#${String(winnerTicket.ticket_number).padStart(4, '0')}` : 'N/A'),
          status: competition.status || 'winner_announced',
        };
      }));

      if (isMounted) {
        setRows(resolved);
      }
    };

    if (!loading) {
      void resolveRows().catch((resolveError) => {
        console.error('[useAdminData] Failed to resolve winner rows:', resolveError);
        if (isMounted) setRows([]);
      });
    } else {
      setRows([]);
    }

    return () => { isMounted = false; };
  }, [competitions, loading]);

  return { data: rows, loading, error };
};

export const useCompetitionDraftsFeed = () => {
  const { data, loading, error } = useCompetitionDrafts();
  const drafts = useMemo(() => data.map((draft) => ({
    ...draft,
    image: draft.image || [],
  })), [data]);
  return { data: drafts, loading, error };
};

export const useOrderRealtime = (orderId) => {
  const { data: order, loading: orderLoading, error: orderError } = useRealtimeDocument(
    orderId ? ['order', orderId] : []
  );

  const [resolvedData, setResolvedData] = useState({
    user: null,
    competition: null,
    loading: false,
  });

  useEffect(() => {
    if (!order) return;

    const resolveDetails = async () => {
      setResolvedData((prev) => ({ ...prev, loading: true }));
      try {
        const uId = getReferenceId(order.user_ref);
        const cId = getReferenceId(order.competition_id);

        const [uSnap, cSnap] = await Promise.all([
          uId ? getDoc(doc(db, 'user', uId)) : Promise.resolve(null),
          cId ? getDoc(doc(db, 'competition', cId)) : Promise.resolve(null),
        ]);

        setResolvedData({
          user: uSnap?.exists() ? { id: uSnap.id, ...uSnap.data() } : null,
          competition: cSnap?.exists() ? { id: cSnap.id, ...cSnap.data() } : null,
          loading: false,
        });
      } catch (err) {
        console.error('[useOrderRealtime] Error resolving order details:', err);
        setResolvedData((prev) => ({ ...prev, loading: false }));
      }
    };

    void resolveDetails();
  }, [order]);

  return {
    data: order ? {
      ...order,
      user_name: resolvedData.user?.display_name || resolvedData.user?.name || 'Unknown User',
      user_email: resolvedData.user?.email || 'N/A',
      competition_title: resolvedData.competition?.title || 'Unknown Competition',
    } : null,
    loading: orderLoading || resolvedData.loading,
    error: orderError,
  };
};

export const useOrderTicketsRealtime = (orderId) => {
  const orderRef = useMemo(() => (orderId ? doc(db, 'order', orderId) : null), [orderId]);
  const queryConstraints = useMemo(
    () => [where('order_id', 'in', [orderId, orderRef].filter(Boolean))],
    [orderId, orderRef]
  );
  return useRealtimeCollection('ticket', queryConstraints);
};

export const useUserRealtime = (userId) => useRealtimeDocument(
  userId ? ['user', userId] : []
);

export const useUserOrdersRealtime = (userId) => {
  const userRef = useMemo(() => (userId ? doc(db, 'user', userId) : null), [userId]);
  const queryConstraints = useMemo(
    () => [where('user_ref', 'in', [userId, userRef, `/user/${userId}`].filter(Boolean))],
    [userId, userRef]
  );
  const { data: orders, loading: ordersLoading, error: ordersError } = useRealtimeCollection('order', queryConstraints);
  const { compMap, resolving } = useEnrichment(orders, null, 'competition_id');

  const enrichedOrders = useMemo(() => orders.map((order) => {
    const competitionId = getReferenceId(order.competition_id);
    const competition = compMap[competitionId];
    return {
      ...order,
      competitionName: competition?.title || competition?.name || 'Unknown Competition',
    };
  }), [orders, compMap]);

  return { data: enrichedOrders, loading: ordersLoading || resolving, error: ordersError };
};

export const useUserTicketsRealtime = (userId) => {
  const userRef = useMemo(() => (userId ? doc(db, 'user', userId) : null), [userId]);
  const queryConstraints = useMemo(
    () => [where('user_id', 'in', [userId, userRef, `/user/${userId}`].filter(Boolean))],
    [userId, userRef]
  );
  return useRealtimeCollection('ticket', queryConstraints);
};

export const useUserWinsRealtime = (userId) => {
  const userRef = useMemo(() => (userId ? doc(db, 'user', userId) : null), [userId]);
  const queryConstraints = useMemo(
    () => [
      where('winner_ref', 'in', [userId, userRef, `/user/${userId}`].filter(Boolean)),
    ],
    [userId, userRef]
  );
  
  const { data: competitions, loading, error } = useRealtimeCollection('competition', queryConstraints);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const resolveRows = async () => {
      const resolved = await Promise.all(competitions.map(async (comp) => {
        const winnerTicketRef = comp.winner_ticket_ref;
        const winnerTicketSnap = winnerTicketRef ? await getDoc(winnerTicketRef).catch(() => null) : null;
        const winnerTicket = winnerTicketSnap?.exists() ? winnerTicketSnap.data() : null;

        return {
          ...comp,
          ticket: winnerTicket?.ticket_sequence || (winnerTicket?.ticket_number ? `#${String(winnerTicket.ticket_number).padStart(4, '0')}` : 'N/A'),
        };
      }));

      if (isMounted) setRows(resolved);
    };

    if (!loading) {
      void resolveRows();
    } else {
      setRows([]);
    }

    return () => { isMounted = false; };
  }, [competitions, loading]);

  return { data: rows, loading, error };
};

export const useUserReferralsRealtime = (userId) => {
  const userRef = useMemo(() => (userId ? doc(db, 'user', userId) : null), [userId]);
  const queryConstraints = useMemo(
    () => [where('referrer_id', 'in', [userId, userRef, `/user/${userId}`].filter(Boolean))],
    [userId, userRef]
  );
  const { data: referrals, loading: referralsLoading, error: referralsError } = useRealtimeCollection('referrals', queryConstraints);
  const { userMap, resolving } = useEnrichment(referrals, 'referred_user_id', null);

  const enrichedReferrals = useMemo(() => referrals
    .filter(ref => ref.reward_type !== 'admin_bonus')
    .map((ref) => {
      const uId = getReferenceId(ref.referred_user_id);
      const user = userMap[uId];
      return {
        ...ref,
        referredName: user?.display_name || user?.name || 'Unknown User',
        referredEmail: user?.email || 'N/A',
      };
    }), [referrals, userMap]);

  return { data: enrichedReferrals, loading: referralsLoading || resolving, error: referralsError };
};

export const useUserBonusLogsRealtime = (userId) => {
  const userRef = useMemo(() => (userId ? doc(db, 'user', userId) : null), [userId]);
  const queryConstraints = useMemo(
    () => [
      where('referrer_id', 'in', [userId, userRef, `/user/${userId}`].filter(Boolean)),
      where('reward_type', '==', 'admin_bonus'),
      orderBy('created_at', 'desc')
    ],
    [userId, userRef]
  );
  const { data: logs, loading: logsLoading, error: logsError } = useRealtimeCollection('referrals', queryConstraints);

  const enrichedLogs = useMemo(() => {
    const groups = {};
    logs.forEach(log => {
      const reason = log.admin_note || log.reason || 'Admin Bonus';
      const time = log.created_at?.toMillis ? Math.floor(log.created_at.toMillis() / 2000) : 0;
      const key = `${reason}_${time}`;

      if (!groups[key]) {
        groups[key] = {
          ...log,
          quantity: 0,
          used_quantity: 0,
          ids: []
        };
      }
      const val = Number(log.reward_value || log.quantity || 1);
      groups[key].quantity += val;
      if (log.reward_issued) groups[key].used_quantity += val;
      groups[key].ids.push(log.id);
    });

    return Object.values(groups)
      .map(g => ({
        ...g,
        reward_issued: g.used_quantity >= g.quantity,
        competitionTitle: 'N/A',
      }));
  }, [logs]);

  return { data: enrichedLogs, loading: logsLoading, error: logsError };
};

export const useCompetitionRealtime = (competitionId) => useRealtimeDocument(
  competitionId ? ['competition', competitionId] : []
);