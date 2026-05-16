/** @type {Map<string, {name: string, photo: string, initials: string, email: string, cachedAt: number}>} */
const _userCache = new Map();

/** @type {Map<string, {competitions: any[], cachedAt: number}>} */
const _listCache = new Map();

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

  _userCache.set(userId, {
    name,
    initials,
    photo: data.photo_url || data.profile_image || '',
    email: data.email || '',
    cachedAt: Date.now(),
  });
}

export function getCachedUser(userId) {
  if (!userId) return null;
  const cached = _userCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > USER_TTL_MS) {
    _userCache.delete(userId);
    return null;
  }
  return cached;
}

export function invalidateUser(userId) {
  _userCache.delete(userId);
}

export function cacheCompetitionList(key, competitions) {
  if (!key || !Array.isArray(competitions)) return;
  _listCache.set(key, { competitions, cachedAt: Date.now() });
}

export function getCachedCompetitionList(key) {
  if (!key) return null;
  const cached = _listCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > LIST_TTL_MS) {
    _listCache.delete(key);
    return null;
  }
  return cached.competitions;
}

export function clearAllCaches() {
  _userCache.clear();
  _listCache.clear();
}
