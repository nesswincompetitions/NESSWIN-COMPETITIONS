import { queryClient } from '@/config/queryClient';

const USER_TTL_MS = 10 * 60 * 1000;
const LIST_TTL_MS = 5 * 60 * 1000;

export function cacheUser(userId, data) {
  if (!userId) return;
  const name = data.display_name || data.name || 'Anonymous';
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  queryClient.setQueryData(['user', userId], {
    name,
    initials,
    photo: data.photo_url || data.profile_image || '',
    email: data.email || '',
    cachedAt: Date.now(),
  });
}

export function getCachedUser(userId) {
  if (!userId) return null;
  const cached = queryClient.getQueryData(['user', userId]);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > USER_TTL_MS) {
    queryClient.removeQueries({ queryKey: ['user', userId] });
    return null;
  }
  return cached;
}

export function invalidateUser(userId) {
  queryClient.removeQueries({ queryKey: ['user', userId] });
}

export function cacheCompetitionList(key, competitions) {
  if (!key || !Array.isArray(competitions)) return;
  queryClient.setQueryData(['competitionList', key], {
    competitions,
    cachedAt: Date.now(),
  });
}

export function getCachedCompetitionList(key) {
  if (!key) return null;
  const cached = queryClient.getQueryData(['competitionList', key]);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > LIST_TTL_MS) {
    queryClient.removeQueries({ queryKey: ['competitionList', key] });
    return null;
  }
  return cached.competitions;
}

export function clearAllCaches() {
  queryClient.clear();
}
