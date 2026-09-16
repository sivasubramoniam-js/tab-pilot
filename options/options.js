/**
 * options.js — Settings page logic for Tab Pilot
 */

const DEFAULT_SETTINGS = {
  staleThresholdMinutes: 30,
  notificationFrequencyMinutes: 60,
  notificationEnabled: true,
  monitorIncognito: false,
  badgeEnabled: true,
  notificationStaleCount: 5,
};

// ── DOM Elements ──
const staleThreshold = document.getElementById('staleThreshold');
const badgeToggle = document.getElementById('badgeToggle');
const notifToggle = document.getElementById('notifToggle');
const notifFrequency = document.getElementById('notifFrequency');
const notifStaleCount = document.getElementById('notifStaleCount');
const notifFrequencyRow = document.getElementById('notifFrequencyRow');
const notifCountRow = document.getElementById('notifCountRow');
const incognitoToggle = document.getElementById('incognitoToggle');
const exportMarkdown = document.getElementById('exportMarkdown');
const exportJson = document.getElementById('exportJson');
const exportCsv = document.getElementById('exportCsv');
const exportGroups = document.getElementById('exportGroups');
const importGroups = document.getElementById('importGroups');
const importGroupsFile = document.getElementById('importGroupsFile');
const copyAllUrls = document.getElementById('copyAllUrls');
const toast = document.getElementById('toast');

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupListeners();
});

async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };

  staleThreshold.value = String(settings.staleThresholdMinutes);
  badgeToggle.checked = settings.badgeEnabled;
  notifToggle.checked = settings.notificationEnabled;
  notifFrequency.value = String(settings.notificationFrequencyMinutes);
  notifStaleCount.value = String(settings.notificationStaleCount);
  incognitoToggle.checked = settings.monitorIncognito;

  toggleNotifRows(settings.notificationEnabled);
}

async function saveSetting(key, value) {
  const result = await chrome.storage.local.get('settings');
  const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  settings[key] = value;
  await chrome.storage.local.set({ settings });
  showToast('Setting saved');
  // Notify service worker to refresh
  chrome.runtime.sendMessage({ action: 'refreshBadge' });
}

function toggleNotifRows(enabled) {
  notifFrequencyRow.style.opacity = enabled ? '1' : '0.4';
  notifFrequencyRow.style.pointerEvents = enabled ? 'auto' : 'none';
  notifCountRow.style.opacity = enabled ? '1' : '0.4';
  notifCountRow.style.pointerEvents = enabled ? 'auto' : 'none';
}

function setupListeners() {
  staleThreshold.addEventListener('change', () => {
    saveSetting('staleThresholdMinutes', parseInt(staleThreshold.value, 10));
  });

  badgeToggle.addEventListener('change', () => {
    saveSetting('badgeEnabled', badgeToggle.checked);
  });

  notifToggle.addEventListener('change', () => {
    saveSetting('notificationEnabled', notifToggle.checked);
    toggleNotifRows(notifToggle.checked);
  });

  notifFrequency.addEventListener('change', () => {
    saveSetting('notificationFrequencyMinutes', parseInt(notifFrequency.value, 10));
  });

  notifStaleCount.addEventListener('change', () => {
    saveSetting('notificationStaleCount', parseInt(notifStaleCount.value, 10));
  });

  incognitoToggle.addEventListener('change', () => {
    saveSetting('monitorIncognito', incognitoToggle.checked);
  });

  // ── Export Tabs ──
  exportMarkdown.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({});
    const lines = ['# Open Tabs\n'];
    for (const tab of tabs) {
      lines.push(`- [${tab.title || 'Untitled'}](${tab.url})`);
    }
    downloadFile('tabs.md', lines.join('\n'), 'text/markdown');
    showToast('Exported as Markdown');
  });

  exportJson.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({});
    const data = tabs.map((t) => ({
      title: t.title,
      url: t.url,
      windowId: t.windowId,
      active: t.active,
      incognito: t.incognito,
    }));
    downloadFile('tabs.json', JSON.stringify(data, null, 2), 'application/json');
    showToast('Exported as JSON');
  });

  exportCsv.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({});
    const lines = ['Title,URL,Window,Active,Incognito'];
    for (const tab of tabs) {
      const title = (tab.title || '').replace(/"/g, '""');
      lines.push(`"${title}","${tab.url}",${tab.windowId},${tab.active},${tab.incognito}`);
    }
    downloadFile('tabs.csv', lines.join('\n'), 'text/csv');
    showToast('Exported as CSV');
  });

  // ── Groups Import/Export ──
  exportGroups.addEventListener('click', async () => {
    const result = await chrome.storage.local.get('groups');
    const groups = result.groups || [];
    downloadFile('tab-pilot-groups.json', JSON.stringify(groups, null, 2), 'application/json');
    showToast(`Exported ${groups.length} group(s)`);
  });

  importGroups.addEventListener('click', () => {
    importGroupsFile.click();
  });

  importGroupsFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      // Merge with existing
      const result = await chrome.storage.local.get('groups');
      const existing = result.groups || [];
      const merged = [...existing, ...imported];
      await chrome.storage.local.set({ groups: merged });
      showToast(`Imported ${imported.length} group(s)`);
    } catch (err) {
      showToast('Error: invalid JSON file');
    }
    importGroupsFile.value = '';
  });

  // ── Copy All URLs ──
  copyAllUrls.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({});
    const urls = tabs.map((t) => t.url).filter(Boolean).join('\n');
    await navigator.clipboard.writeText(urls);
    showToast(`Copied ${tabs.length} URLs to clipboard`);
  });
}

// ── Helpers ──

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2000);
}
