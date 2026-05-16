/**
 * Global Enrichment Cache for User Panel
 *
 * A plain JavaScript singleton that lives outside of React's lifecycle.
 * This means data persists across page navigations without needing a
 * Context Provider or Redux.
 *
 * Strategy:
 *  - Real-time listeners (onSnapshot) remain completely untouched.
 *  - This cache ONLY stores the "enrichment" data — user profiles
 *    and competition metadata that rarely change and are expensive
 *    to re-fetch on every snapshot update.
 *
 * How it prevents lost real-time updates:
 *  - Dynamic fields (sold_tickets, status, etc.) come from the live snapshot.
 *  - Static fields (winner name, user photo, competition title) come from cache.
 *  - If a user changes their name, we simply invalidate the cache for that user.
 */

// ─── Cache Stores ──────────────────────────────────────────────────────────────

/** @type {Map<string, {name: string, photo: string, initials: string, email: string, cachedAt: number}>} */
const _userCache = new Map();

/** @type {Map<string, {title: string, image: string, ticket_price: number, cachedAt: number}>} */
const _competitionCache = new Map();

/** @type {Map<string, {competitions: any[], cachedAt: number}>} */
const _listCache = new Map();

// Cached data is considered fresh for 10 minutes
const USER_TTL_MS = 10 * 60 * 1000;
// Competition list snapshots are considered fresh for 5 minutes (for back-navigation)
const LIST_TTL_MS = 5 * 60 * 1000;

// ─── User Cache ────────────────────────────────────────────────────────────────

/**
 * Store a resolved user profile in the cache.
 * @param {string} userId
 * @param {{display_name?: string, name?: string, photo_url?: string, profile_image?: string, email?: string}} data
 */
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

/**
 * Retrieve a cached user profile. Returns null if not cached or expired.
 * @param {string} userId
 * @returns {{name: string, initials: string, photo: string, email: string} | null}
 */
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

/**
 * Remove a specific user from the cache (e.g., after a profile update).
 * @param {string} userId
 */
export function invalidateUser(userId) {
  _userCache.delete(userId);
}

// ─── Competition List Cache ────────────────────────────────────────────────────
// Used for "instant restore" when navigating back to the competitions list.
// The real-time listener will still update data in the background.

/**
 * Store the latest competitions list snapshot.
 * @param {string} key - A unique key, e.g. 'all_competitions' or 'featured_competitions'
 * @param {any[]} competitions
 */
export function cacheCompetitionList(key, competitions) {
  if (!key || !Array.isArray(competitions)) return;
  _listCache.set(key, {
    competitions,
    cachedAt: Date.now(),
  });
}

/**
 * Retrieve a cached competitions list. Returns null if not cached or expired.
 * @param {string} key
 * @returns {any[] | null}
 */
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

// ─── Utility ───────────────────────────────────────────────────────────────────

/**
 * Clears all caches. Can be called on user logout.
 */
export function clearAllCaches() {
  _userCache.clear();
  _competitionCache.clear();
  _listCache.clear();
}
