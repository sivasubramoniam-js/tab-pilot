/**
 * service-worker.js — Background service worker for Tab Pilot
 *
 * Responsibilities:
 * - Track tab activity (last visited timestamp per tab)
 * - Periodic staleness checks via chrome.alarms
 * - Desktop notifications for stale tabs
 * - Badge count on extension icon
 * - Handle keyboard shortcut commands
 */

// ── Storage helpers (inlined since service workers can't use ES modules in all contexts) ──

const SETTINGS_DEFAULTS = {
  staleThresholdMinutes: 30,
  notificationFrequencyMinutes: 60,
  notificationEnabled: true,
  monitorIncognito: false,
  badgeEnabled: true,
  notificationStaleCount: 5,
};

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return { ...SETTINGS_DEFAULTS, ...(result.settings || {}) };
}

async function getTabActivity() {
  const result = await chrome.storage.local.get('tabActivity');
  return result.tabActivity || {};
}

async function saveTabActivity(activity) {
  await chrome.storage.local.set({ tabActivity: activity });
}

// ── Initialization ──

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[TabPilot] Installed / Updated:', details.reason);

  // Initialize settings if first install
  if (details.reason === 'install') {
    await chrome.storage.local.set({ settings: SETTINGS_DEFAULTS, groups: [], tabActivity: {} });
  }

  // Seed activity for all currently open tabs
  await seedTabActivity();

  // Set up periodic alarm
  await setupAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[TabPilot] Browser started');
  await seedTabActivity();
  await setupAlarm();
});

// ── Tab Event Listeners ──

// Track when a tab becomes active
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
  if (!tab) return;

  const settings = await getSettings();
  if (tab.incognito && !settings.monitorIncognito) return;

  const activity = await getTabActivity();
  activity[String(activeInfo.tabId)] = {
    lastVisited: Date.now(),
    url: tab.url || '',
    title: tab.title || '',
    windowId: tab.windowId,
  };
  await saveTabActivity(activity);
});

// Track when a tab finishes loading (catches new tabs & navigations)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;

  const settings = await getSettings();
  if (tab.incognito && !settings.monitorIncognito) return;

  const activity = await getTabActivity();
  activity[String(tabId)] = {
    lastVisited: Date.now(),
    url: tab.url || '',
    title: tab.title || '',
    windowId: tab.windowId,
  };
  await saveTabActivity(activity);
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const activity = await getTabActivity();
  delete activity[String(tabId)];
  await saveTabActivity(activity);
});

// ── Alarm: Periodic Staleness Check ──

const ALARM_NAME = 'staleness-check';

async function setupAlarm() {
  // Clear existing alarm first
  await chrome.alarms.clear(ALARM_NAME);

  const settings = await getSettings();
  // Check every minute for badge updates, but notifications respect their own frequency
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  console.log('[TabPilot] Alarm set: check every 1 minute');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await performStalenessCheck();
});

// ── Staleness Check Logic ──

let lastNotificationTime = 0;

async function performStalenessCheck() {
  const settings = await getSettings();
  const activity = await getTabActivity();
  const now = Date.now();
  const thresholdMs = settings.staleThresholdMinutes * 60 * 1000;

  // Get all open tabs
  const tabs = await chrome.tabs.query({});
  const validTabs = settings.monitorIncognito ? tabs : tabs.filter((t) => !t.incognito);

  // Count stale tabs
  let staleCount = 0;
  for (const tab of validTabs) {
    const entry = activity[String(tab.id)];
    const lastVisited = entry?.lastVisited || 0;
    if (now - lastVisited > thresholdMs) {
      staleCount++;
    }
  }

  // Update badge
  if (settings.badgeEnabled) {
    if (staleCount > 0) {
      await chrome.action.setBadgeText({ text: String(staleCount) });
      await chrome.action.setBadgeBackgroundColor({ color: staleCount >= 10 ? '#ef4444' : '#f59e0b' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }

  // Send notification if threshold exceeded
  if (
    settings.notificationEnabled &&
    staleCount >= settings.notificationStaleCount
  ) {
    const notifCooldownMs = settings.notificationFrequencyMinutes * 60 * 1000;
    if (now - lastNotificationTime > notifCooldownMs) {
      lastNotificationTime = now;
      await sendStaleNotification(staleCount, settings.staleThresholdMinutes);
    }
  }
}

async function sendStaleNotification(count, thresholdMin) {
  const timeLabel = thresholdMin >= 60 ? `${Math.floor(thresholdMin / 60)}h` : `${thresholdMin}m`;
  
  chrome.notifications.create('stale-tabs-alert', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
    title: '🧹 Tab Pilot',
    message: `${count} tab${count > 1 ? 's' : ''} haven't been visited in over ${timeLabel}. Close them to save memory!`,
    buttons: [
      { title: '🗑️ Close stale tabs' },
      { title: '⏰ Snooze 30 min' },
    ],
    priority: 1,
    requireInteraction: false,
  });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIndex) => {
  if (notifId !== 'stale-tabs-alert') return;

  if (btnIndex === 0) {
    // Close stale tabs
    await closeAllStaleTabs();
  } else if (btnIndex === 1) {
    // Snooze — push lastNotificationTime forward by 30 min
    lastNotificationTime = Date.now() + 30 * 60 * 1000;
  }

  chrome.notifications.clear(notifId);
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === 'stale-tabs-alert') {
    // Open the extension popup by focusing the browser — user can then click the icon
    chrome.notifications.clear(notifId);
  }
});

// ── Close All Stale Tabs ──

async function closeAllStaleTabs() {
  const settings = await getSettings();
  const activity = await getTabActivity();
  const now = Date.now();
  const thresholdMs = settings.staleThresholdMinutes * 60 * 1000;

  const tabs = await chrome.tabs.query({});
  const validTabs = settings.monitorIncognito ? tabs : tabs.filter((t) => !t.incognito);

  const staleTabIds = [];
  for (const tab of validTabs) {
    // Never close the active tab in any window
    if (tab.active) continue;
    const entry = activity[String(tab.id)];
    const lastVisited = entry?.lastVisited || 0;
    if (now - lastVisited > thresholdMs) {
      staleTabIds.push(tab.id);
    }
  }

  if (staleTabIds.length > 0) {
    await chrome.tabs.remove(staleTabIds);
    // Clean up activity entries
    for (const id of staleTabIds) {
      delete activity[String(id)];
    }
    await saveTabActivity(activity);
  }

  console.log(`[TabPilot] Closed ${staleTabIds.length} stale tabs`);
}

// ── Keyboard Shortcut Commands ──

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'close-stale-tabs') {
    await closeAllStaleTabs();
  }
});

// ── Seed Tab Activity ──

async function seedTabActivity() {
  const tabs = await chrome.tabs.query({});
  const existing = await getTabActivity();
  const now = Date.now();

  for (const tab of tabs) {
    if (!existing[String(tab.id)]) {
      existing[String(tab.id)] = {
        lastVisited: now,
        url: tab.url || '',
        title: tab.title || '',
        windowId: tab.windowId,
      };
    }
  }

  // Clean up entries for tabs that no longer exist
  const activeTabIds = new Set(tabs.map((t) => String(t.id)));
  for (const key of Object.keys(existing)) {
    if (!activeTabIds.has(key)) {
      delete existing[key];
    }
  }

  await saveTabActivity(existing);
}

// ── Message handler for popup communication ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getTabActivity') {
    getTabActivity().then(sendResponse);
    return true; // async response
  }
  if (message.action === 'closeAllStale') {
    closeAllStaleTabs().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.action === 'refreshBadge') {
    performStalenessCheck().then(() => sendResponse({ success: true }));
    return true;
  }
});
