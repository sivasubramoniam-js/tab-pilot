/**
 * popup.js — Main popup logic for Tab Pilot
 *
 * Handles:
 * - Rendering all open tabs with staleness badges
 * - Search / filter
 * - Select & close tabs (single, bulk, stale)
 * - Quick-launch groups CRUD
 * - Duplicate detection & merge
 * - Navigation between views
 */

// ── Constants ──
const STALE_THRESHOLDS = {
  active: 1,     // < 1 min
  warming: 30,   // < 30 min
  stale: 60,     // < 60 min
  dormant: Infinity,
};

// ── State ──
let allTabs = [];
let tabActivity = {};
let settings = {};
let groups = [];
let selectedTabIds = new Set();
let editingGroupId = null;

// ── Default settings ──
const DEFAULT_SETTINGS = {
  staleThresholdMinutes: 30,
  notificationFrequencyMinutes: 60,
  notificationEnabled: true,
  monitorIncognito: false,
  badgeEnabled: true,
  notificationStaleCount: 5,
};

// ── DOM Elements ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const tabCountBadge = $('#tabCountBadge');
const searchInput = $('#searchInput');
const searchClear = $('#searchClear');
const selectAll = $('#selectAll');
const selectedCount = $('#selectedCount');
const closeSelectedBtn = $('#closeSelectedBtn');
const closeStaleBtn = $('#closeStaleBtn');
const tabList = $('#tabList');
const settingsBtn = $('#settingsBtn');

// Groups
const addGroupBtn = $('#addGroupBtn');
const groupForm = $('#groupForm');
const groupNameInput = $('#groupNameInput');
const groupUrlsInput = $('#groupUrlsInput');
const groupNewWindow = $('#groupNewWindow');
const saveGroupBtn = $('#saveGroupBtn');
const cancelGroupBtn = $('#cancelGroupBtn');
const groupList = $('#groupList');
const emojiOptions = $('#emojiOptions');

// Duplicates
const dupeList = $('#dupeList');
const mergeAllDupesBtn = $('#mergeAllDupesBtn');

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderTabs();
  renderGroups();
  renderDuplicates();
  setupEventListeners();
});

// ── Data Loading ──

async function loadData() {
  // Load settings
  const result = await chrome.storage.local.get(['settings', 'groups']);
  settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  groups = result.groups || [];

  // Load tab activity from service worker
  tabActivity = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getTabActivity' }, (response) => {
      resolve(response || {});
    });
  });

  // Get all tabs
  const queryResult = await chrome.tabs.query({});
  allTabs = settings.monitorIncognito ? queryResult : queryResult.filter((t) => !t.incognito);

  // If monitorIncognito is on, also include incognito tabs
  if (settings.monitorIncognito) {
    const incognitoTabs = queryResult.filter((t) => t.incognito);
    // They're already included
  }

  tabCountBadge.textContent = allTabs.length;
}

// ── Tab Rendering ──

function renderTabs(filter = '') {
  const filterLower = filter.toLowerCase().trim();

  let tabs = allTabs;
  if (filterLower) {
    tabs = tabs.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(filterLower) ||
        (t.url || '').toLowerCase().includes(filterLower)
    );
  }

  // Sort by staleness (most stale first), then by window
  tabs.sort((a, b) => {
    const aActivity = tabActivity[String(a.id)];
    const bActivity = tabActivity[String(b.id)];
    const aTime = aActivity?.lastVisited || 0;
    const bTime = bActivity?.lastVisited || 0;
    // Active tabs first, then sort by staleness
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return aTime - bTime; // oldest first = most stale first
  });

  if (tabs.length === 0) {
    tabList.innerHTML = `
      <div class="empty-state">
        <p>${filterLower ? '🔍 No tabs match your search.' : '✨ No tabs open!'}</p>
      </div>
    `;
    return;
  }

  // Group by window
  const windows = new Map();
  for (const tab of tabs) {
    if (!windows.has(tab.windowId)) windows.set(tab.windowId, []);
    windows.get(tab.windowId).push(tab);
  }

  let html = '';
  let windowIndex = 0;
  for (const [windowId, windowTabs] of windows) {
    if (windows.size > 1) {
      html += `<div class="window-separator">Window ${++windowIndex} · ${windowTabs.length} tab${windowTabs.length > 1 ? 's' : ''}</div>`;
    }
    for (let i = 0; i < windowTabs.length; i++) {
      html += renderTabItem(windowTabs[i], i);
    }
  }

  tabList.innerHTML = html;

  // Attach event listeners to rendered items
  tabList.querySelectorAll('.tab-item').forEach((el) => {
    const tabId = parseInt(el.dataset.tabId, 10);
    const windowId = parseInt(el.dataset.windowId, 10);

    // Click to switch to tab
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tab-item-close') || e.target.closest('.tab-item-checkbox')) return;
      switchToTab(tabId, windowId);
    });

    // Close button
    el.querySelector('.tab-item-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tabId);
    });

    // Checkbox
    el.querySelector('.tab-item-checkbox')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedTabIds.add(tabId);
        el.classList.add('selected');
      } else {
        selectedTabIds.delete(tabId);
        el.classList.remove('selected');
      }
      updateSelectedCount();
    });
  });
}

function renderTabItem(tab, index) {
  const activity = tabActivity[String(tab.id)];
  const staleness = getStaleness(activity?.lastVisited);
  const isSelected = selectedTabIds.has(tab.id);
  const isIncognito = tab.incognito;

  const faviconUrl = tab.favIconUrl;
  const faviconHtml = faviconUrl
    ? `<img class="tab-item-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.outerHTML='<div class=\\'tab-item-favicon-placeholder\\'>🌐</div>'">`
    : `<div class="tab-item-favicon-placeholder">🌐</div>`;

  const displayUrl = (tab.url || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 50);

  return `
    <div class="tab-item ${isSelected ? 'selected' : ''} ${tab.active ? 'is-active-tab' : ''}"
         data-tab-id="${tab.id}" data-window-id="${tab.windowId}"
         style="animation-delay: ${index * 0.03}s">
      <input type="checkbox" class="tab-item-checkbox" ${isSelected ? 'checked' : ''}>
      ${faviconHtml}
      <div class="tab-item-info">
        <div class="tab-item-title">${escapeHtml(tab.title || 'Untitled')}</div>
        <div class="tab-item-url">${escapeHtml(displayUrl)}</div>
      </div>
      ${isIncognito ? '<span class="incognito-badge" title="Incognito tab">🕵️</span>' : ''}
      <span class="stale-badge ${staleness.className}">${staleness.label}</span>
      <button class="tab-item-close" title="Close tab">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;
}

// ── Staleness Calculation ──

function getStaleness(lastVisited) {
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

// ── Tab Actions ──

async function switchToTab(tabId, windowId) {
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(windowId, { focused: true });
  window.close(); // Close popup after switching
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    allTabs = allTabs.filter((t) => t.id !== tabId);
    selectedTabIds.delete(tabId);
    delete tabActivity[String(tabId)];
    tabCountBadge.textContent = allTabs.length;
    renderTabs(searchInput.value);
    showToast('Tab closed');
    chrome.runtime.sendMessage({ action: 'refreshBadge' });
  } catch {
    // Tab may have already been closed
  }
}

async function closeSelectedTabs() {
  if (selectedTabIds.size === 0) return;
  const ids = [...selectedTabIds];
  try {
    await chrome.tabs.remove(ids);
    allTabs = allTabs.filter((t) => !selectedTabIds.has(t.id));
    for (const id of ids) delete tabActivity[String(id)];
    const count = selectedTabIds.size;
    selectedTabIds.clear();
    tabCountBadge.textContent = allTabs.length;
    renderTabs(searchInput.value);
    updateSelectedCount();
    showToast(`${count} tab${count > 1 ? 's' : ''} closed`);
    chrome.runtime.sendMessage({ action: 'refreshBadge' });
  } catch {
    // Some tabs may have been closed already
  }
}

async function closeStaleTabs() {
  const now = Date.now();
  const thresholdMs = settings.staleThresholdMinutes * 60 * 1000;
  const staleTabs = allTabs.filter((t) => {
    if (t.active) return false;
    const entry = tabActivity[String(t.id)];
    const lastVisited = entry?.lastVisited || 0;
    return now - lastVisited > thresholdMs;
  });

  if (staleTabs.length === 0) {
    showToast('No stale tabs to close!');
    return;
  }

  const ids = staleTabs.map((t) => t.id);
  try {
    await chrome.tabs.remove(ids);
    allTabs = allTabs.filter((t) => !ids.includes(t.id));
    for (const id of ids) delete tabActivity[String(id)];
    selectedTabIds = new Set([...selectedTabIds].filter((id) => !ids.includes(id)));
    tabCountBadge.textContent = allTabs.length;
    renderTabs(searchInput.value);
    updateSelectedCount();
    showToast(`🧹 ${ids.length} stale tab${ids.length > 1 ? 's' : ''} closed`);
    chrome.runtime.sendMessage({ action: 'refreshBadge' });
  } catch {
    // Some tabs may have been closed
  }
}

// ── Groups ──

function renderGroups() {
  if (groups.length === 0) {
    groupList.innerHTML = `
      <div class="empty-state">
        <p>No groups yet.<br>Create one to open your favorite sites in one click!</p>
      </div>
    `;
    return;
  }

  let html = '';
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const urlCount = (g.urls || []).length;
    html += `
      <div class="group-card" data-group-index="${i}" style="animation-delay: ${i * 0.05}s">
        <span class="group-card-icon">${g.icon || '🚀'}</span>
        <div class="group-card-info">
          <div class="group-card-name">${escapeHtml(g.name)}</div>
          <div class="group-card-meta">${urlCount} site${urlCount !== 1 ? 's' : ''} · ${g.openInNewWindow ? 'new window' : 'current window'}</div>
        </div>
        <div class="group-card-actions">
          <button class="group-action-btn launch" title="Open all tabs" data-action="launch" data-index="${i}">▶️</button>
          <button class="group-action-btn" title="Edit group" data-action="edit" data-index="${i}">✏️</button>
          <button class="group-action-btn delete" title="Delete group" data-action="delete" data-index="${i}">🗑️</button>
        </div>
      </div>
    `;
  }

  groupList.innerHTML = html;

  // Attach event listeners
  groupList.querySelectorAll('.group-action-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      const index = parseInt(btn.dataset.index, 10);
      if (action === 'launch') launchGroup(index);
      else if (action === 'edit') editGroup(index);
      else if (action === 'delete') deleteGroup(index);
    });
  });
}

async function launchGroup(index) {
  const group = groups[index];
  if (!group || !group.urls || group.urls.length === 0) return;

  if (group.openInNewWindow) {
    const win = await chrome.windows.create({ url: group.urls[0] });
    for (let i = 1; i < group.urls.length; i++) {
      await chrome.tabs.create({ url: group.urls[i], windowId: win.id });
    }
  } else {
    // Create all tabs simultaneously — sequential awaits would close the popup
    // after the first tab steals focus
    await Promise.all(group.urls.map((url) => chrome.tabs.create({ url, active: false })));
  }

  showToast(`🚀 Launched "${group.name}"`);
}

function editGroup(index) {
  const group = groups[index];
  editingGroupId = group.id;
  groupNameInput.value = group.name || '';
  groupUrlsInput.value = (group.urls || []).join('\n');
  groupNewWindow.checked = group.openInNewWindow || false;

  // Set emoji
  emojiOptions.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.emoji === group.icon);
  });

  groupForm.classList.remove('hidden');
  groupNameInput.focus();
}

async function deleteGroup(index) {
  groups.splice(index, 1);
  await chrome.storage.local.set({ groups });
  renderGroups();
  showToast('Group deleted');
}

async function saveGroup() {
  const name = groupNameInput.value.trim();
  const urlsRaw = groupUrlsInput.value.trim();
  const openInNewWindow = groupNewWindow.checked;
  const selectedEmoji = emojiOptions.querySelector('.emoji-btn.active')?.dataset.emoji || '🚀';

  if (!name) {
    groupNameInput.focus();
    return;
  }
  if (!urlsRaw) {
    groupUrlsInput.focus();
    return;
  }

  const urls = urlsRaw
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => u && (u.startsWith('http://') || u.startsWith('https://')));

  if (urls.length === 0) {
    groupUrlsInput.focus();
    showToast('Enter valid URLs (starting with http:// or https://)');
    return;
  }

  if (editingGroupId) {
    // Update existing
    const idx = groups.findIndex((g) => g.id === editingGroupId);
    if (idx !== -1) {
      groups[idx] = { ...groups[idx], name, urls, icon: selectedEmoji, openInNewWindow };
    }
  } else {
    // Create new
    groups.push({
      id: crypto.randomUUID(),
      name,
      urls,
      icon: selectedEmoji,
      openInNewWindow,
    });
  }

  await chrome.storage.local.set({ groups });
  editingGroupId = null;
  groupForm.classList.add('hidden');
  resetGroupForm();
  renderGroups();
  showToast(editingGroupId ? 'Group updated' : 'Group created!');
}

function resetGroupForm() {
  groupNameInput.value = '';
  groupUrlsInput.value = '';
  groupNewWindow.checked = false;
  editingGroupId = null;
  emojiOptions.querySelectorAll('.emoji-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === 0);
  });
}

// ── Duplicates ──

function renderDuplicates() {
  const urlMap = new Map();
  for (const tab of allTabs) {
    if (!tab.url) continue;
    const normalized = tab.url.replace(/#.*$/, '').replace(/\/$/, '');
    if (!urlMap.has(normalized)) urlMap.set(normalized, []);
    urlMap.get(normalized).push(tab);
  }

  // Filter to only duplicates
  const dupes = [...urlMap.entries()].filter(([, tabs]) => tabs.length > 1);

  // Update nav badge
  const dupeNavTab = document.querySelector('.nav-tab[data-view="duplicates"]');
  if (dupes.length > 0) {
    dupeNavTab.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="2" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Dupes <span style="background:var(--accent-amber-soft);color:var(--accent-amber);padding:1px 6px;border-radius:99px;font-size:10px;font-weight:700;margin-left:2px">${dupes.length}</span>
    `;
  }

  if (dupes.length === 0) {
    dupeList.innerHTML = `
      <div class="empty-state">
        <p>✨ No duplicates found — your tabs are clean!</p>
      </div>
    `;
    mergeAllDupesBtn.classList.add('hidden');
    return;
  }

  mergeAllDupesBtn.classList.remove('hidden');

  let html = '';
  for (const [url, tabs] of dupes) {
    const displayUrl = url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60);
    html += `
      <div class="dupe-group" style="animation-delay: ${dupes.indexOf([url, tabs]) * 0.05}s">
        <div class="dupe-group-header">
          <span class="dupe-group-url">${escapeHtml(displayUrl)}</span>
          <span class="dupe-group-count">${tabs.length} copies</span>
        </div>
    `;
    for (const tab of tabs) {
      html += `
        <div class="dupe-tab-row" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(tab.title || 'Untitled')}</span>
          ${tab.active ? '<span style="font-size:10px;color:var(--accent-indigo)">active</span>' : ''}
          <button class="tab-item-close dupe-close-btn" data-tab-id="${tab.id}" title="Close this copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `;
    }
    html += `</div>`;
  }

  dupeList.innerHTML = html;

  // Close individual duplicate
  dupeList.querySelectorAll('.dupe-close-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.tabId, 10);
      await closeTab(tabId);
      renderDuplicates();
    });
  });

  // Click row to switch to tab
  dupeList.querySelectorAll('.dupe-tab-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.dupe-close-btn')) return;
      const tabId = parseInt(row.dataset.tabId, 10);
      const windowId = parseInt(row.dataset.windowId, 10);
      switchToTab(tabId, windowId);
    });
  });
}

async function mergeAllDuplicates() {
  const urlMap = new Map();
  for (const tab of allTabs) {
    if (!tab.url) continue;
    const normalized = tab.url.replace(/#.*$/, '').replace(/\/$/, '');
    if (!urlMap.has(normalized)) urlMap.set(normalized, []);
    urlMap.get(normalized).push(tab);
  }

  const toClose = [];
  for (const [, tabs] of urlMap) {
    if (tabs.length < 2) continue;
    // Keep the first (or active) one, close the rest
    const keepIndex = tabs.findIndex((t) => t.active);
    const keep = keepIndex >= 0 ? keepIndex : 0;
    for (let i = 0; i < tabs.length; i++) {
      if (i !== keep) toClose.push(tabs[i].id);
    }
  }

  if (toClose.length === 0) {
    showToast('No duplicates to merge');
    return;
  }

  try {
    await chrome.tabs.remove(toClose);
    allTabs = allTabs.filter((t) => !toClose.includes(t.id));
    for (const id of toClose) delete tabActivity[String(id)];
    tabCountBadge.textContent = allTabs.length;
    renderTabs(searchInput.value);
    renderDuplicates();
    showToast(`🔗 Merged ${toClose.length} duplicate${toClose.length > 1 ? 's' : ''}`);
    chrome.runtime.sendMessage({ action: 'refreshBadge' });
  } catch {
    // Some tabs may have been closed
  }
}

// ── Event Listeners ──

function setupEventListeners() {
  // Navigation
  $$('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.nav-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.view').forEach((v) => v.classList.remove('active'));
      $(`#${tab.dataset.view}View`).classList.add('active');
    });
  });

  // Search
  searchInput.addEventListener('input', () => {
    const val = searchInput.value;
    searchClear.classList.toggle('hidden', !val);
    renderTabs(val);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    renderTabs();
    searchInput.focus();
  });

  // Select All
  selectAll.addEventListener('change', () => {
    if (selectAll.checked) {
      allTabs.forEach((t) => selectedTabIds.add(t.id));
    } else {
      selectedTabIds.clear();
    }
    renderTabs(searchInput.value);
    updateSelectedCount();
  });

  // Bulk close
  closeSelectedBtn.addEventListener('click', closeSelectedTabs);
  closeStaleBtn.addEventListener('click', closeStaleTabs);

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Groups
  addGroupBtn.addEventListener('click', () => {
    editingGroupId = null;
    resetGroupForm();
    groupForm.classList.remove('hidden');
    groupNameInput.focus();
  });

  cancelGroupBtn.addEventListener('click', () => {
    groupForm.classList.add('hidden');
    resetGroupForm();
  });

  saveGroupBtn.addEventListener('click', saveGroup);

  // Emoji picker
  emojiOptions.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      emojiOptions.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Duplicates merge all
  mergeAllDupesBtn.addEventListener('click', mergeAllDuplicates);

  // Keyboard shortcut in popup
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      // Switch to tabs view
      $$('.nav-tab').forEach((t) => t.classList.remove('active'));
      $$('.nav-tab')[0].classList.add('active');
      $$('.view').forEach((v) => v.classList.remove('active'));
      $('#tabsView').classList.add('active');
    }
  });
}

// ── Helpers ──

function updateSelectedCount() {
  selectedCount.textContent = `${selectedTabIds.size} selected`;
  selectAll.checked = selectedTabIds.size > 0 && selectedTabIds.size === allTabs.length;
  selectAll.indeterminate = selectedTabIds.size > 0 && selectedTabIds.size < allTabs.length;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
