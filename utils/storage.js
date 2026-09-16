/**
 * storage.js — Chrome Storage helpers for Tab Pilot
 * Wraps chrome.storage.local with typed getters/setters and defaults.
 */

const DEFAULTS = {
  settings: {
    staleThresholdMinutes: 30,
    notificationFrequencyMinutes: 60,
    notificationEnabled: true,
    monitorIncognito: false,
    badgeEnabled: true,
    notificationStaleCount: 5,
  },
  groups: [],
  tabActivity: {},
  sessions: [],
  analytics: {
    dailyStats: {},
    domainFrequency: {},
  },
};

/**
 * Get a value from chrome.storage.local with a fallback default.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getStorage(key) {
  const result = await chrome.storage.local.get(key);
  if (result[key] !== undefined) return result[key];
  return DEFAULTS[key] !== undefined ? structuredClone(DEFAULTS[key]) : undefined;
}

/**
 * Set a value in chrome.storage.local.
 * @param {string} key
 * @param {any} value
 */
export async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Get settings, merged with defaults so new keys always exist.
 * @returns {Promise<object>}
 */
export async function getSettings() {
  const stored = await getStorage('settings');
  return { ...DEFAULTS.settings, ...stored };
}

/**
 * Save settings (partial update — merges with existing).
 * @param {object} partial
 */
export async function saveSettings(partial) {
  const current = await getSettings();
  await setStorage('settings', { ...current, ...partial });
}

/**
 * Get all quick-launch groups.
 * @returns {Promise<Array>}
 */
export async function getGroups() {
  return getStorage('groups');
}

/**
 * Save all quick-launch groups.
 * @param {Array} groups
 */
export async function saveGroups(groups) {
  await setStorage('groups', groups);
}

/**
 * Get tab activity map.
 * @returns {Promise<object>}
 */
export async function getTabActivity() {
  return getStorage('tabActivity');
}

/**
 * Save tab activity map.
 * @param {object} activity
 */
export async function saveTabActivity(activity) {
  await setStorage('tabActivity', activity);
}

/**
 * Generate a UUID v4.
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID();
}
