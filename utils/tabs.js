/**
 * tabs.js — Tab querying & management helpers for Tab Pilot
 */

/**
 * Get all tabs across all windows.
 * @param {boolean} includeIncognito
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
export async function getAllTabs(includeIncognito = false) {
  const tabs = await chrome.tabs.query({});
  if (includeIncognito) return tabs;
  return tabs.filter((t) => !t.incognito);
}

/**
 * Close a single tab by ID.
 * @param {number} tabId
 */
export async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // Tab may have already been closed
  }
}

/**
 * Close multiple tabs by ID.
 * @param {number[]} tabIds
 */
export async function closeTabs(tabIds) {
  try {
    await chrome.tabs.remove(tabIds);
  } catch {
    // Some tabs may have already been closed
  }
}

/**
 * Switch to (activate) a specific tab.
 * @param {number} tabId
 * @param {number} windowId
 */
export async function switchToTab(tabId, windowId) {
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(windowId, { focused: true });
}

/**
 * Open a list of URLs in a new or current window.
 * @param {string[]} urls
 * @param {boolean} newWindow
 */
export async function openUrls(urls, newWindow = false) {
  if (newWindow) {
    const win = await chrome.windows.create({ url: urls[0] });
    for (let i = 1; i < urls.length; i++) {
      await chrome.tabs.create({ url: urls[i], windowId: win.id });
    }
  } else {
    for (const url of urls) {
      await chrome.tabs.create({ url });
    }
  }
}

/**
 * Find duplicate tabs (same URL open in multiple tabs).
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {Map<string, chrome.tabs.Tab[]>} URL → tabs with that URL (only entries with >1 tab)
 */
export function findDuplicates(tabs) {
  const urlMap = new Map();
  for (const tab of tabs) {
    if (!tab.url) continue;
    const normalized = tab.url.replace(/#.*$/, '').replace(/\/$/, '');
    if (!urlMap.has(normalized)) urlMap.set(normalized, []);
    urlMap.get(normalized).push(tab);
  }
  // Only keep entries with duplicates
  for (const [url, tabList] of urlMap) {
    if (tabList.length < 2) urlMap.delete(url);
  }
  return urlMap;
}

/**
 * Compute staleness label and class from a timestamp.
 * @param {number|null} lastVisited — epoch ms
 * @param {number} staleThresholdMinutes
 * @returns {{ label: string, className: string, minutes: number }}
 */
export function getStaleness(lastVisited, staleThresholdMinutes = 30) {
  if (!lastVisited) return { label: 'Unknown', className: 'stale-unknown', minutes: Infinity };

  const minutes = Math.floor((Date.now() - lastVisited) / 60000);

  if (minutes < 1) return { label: 'Active', className: 'stale-active', minutes };
  if (minutes < 5) return { label: `${minutes}m ago`, className: 'stale-active', minutes };
  if (minutes < 30) return { label: `${minutes}m idle`, className: 'stale-warming', minutes };
  if (minutes < 60) return { label: `${minutes}m idle`, className: 'stale-stale', minutes };
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h+ idle`, className: 'stale-dormant', minutes };
  
  const days = Math.floor(hours / 24);
  return { label: `${days}d+ idle`, className: 'stale-dormant', minutes };
}
