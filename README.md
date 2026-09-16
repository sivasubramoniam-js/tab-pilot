# 🧩 Tab Pilot — Chrome Extension

> **Your browser, but with a brain.** Intelligently monitor, organize, and manage your browser tabs.

## Features

### 📋 Tab Dashboard
- View all open tabs across all windows with favicons, titles, and URLs
- **Real-time search** — filter tabs by title or URL instantly
- **One-click close** any tab, or bulk-select and close multiple
- **Jump to tab** — click any tab to switch to it immediately
- Tabs grouped by window with counts

### 🕒 Inactivity Monitor
- Tracks **last visited timestamp** for every tab in the background
- Color-coded staleness badges:
  - 🟢 **Active** — visited in the last 5 minutes
  - 🟡 **Warming** — idle for 5–30 minutes
  - 🟠 **Stale** — idle for 30–60 minutes
  - 🔴 **Dormant** — idle for 1+ hours
- **"Close All Stale"** button — one click to clean up idle tabs
- Configurable threshold (5 min to 4 hours)

### 🔔 Smart Notifications
- Desktop notifications when stale tab count exceeds your threshold
- Example: *"🧹 17 tabs haven't been visited in over 1 hour. Close them to save memory!"*
- **Action buttons** on notifications: Close stale tabs / Snooze 30 min
- **Badge count** on the extension icon shows number of stale tabs
- Configurable frequency (15 min to 4 hours)

### 📂 Quick-Launch Groups
- Save groups of URLs as named routines (e.g., "Morning Work", "Research")
- **One-click open all** tabs in a group
- Choose to open in current window or new window
- Custom emoji icons per group
- Import/Export groups as JSON

### 🔗 Duplicate Detection
- Automatically detects tabs with the same URL
- **Merge All** — keep one of each, close the rest
- Close individual duplicates from the list

### 🕵️ Incognito Support
- Toggle to monitor incognito tabs
- Incognito data is **never persisted** — held in memory only
- Clear visual indicator on incognito tabs

### 📤 Export & Data
- Export open tabs as **Markdown, JSON, or CSV**
- Copy all tab URLs to clipboard
- Import/Export quick-launch groups

### ⌨️ Keyboard Shortcuts
- `Ctrl+Shift+T` / `Cmd+Shift+T` — Open extension
- `Ctrl+Shift+S` / `Cmd+Shift+S` — Close all stale tabs
- `Ctrl+F` / `Cmd+F` — Focus search (in popup)

---

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **"Load unpacked"**
5. Select the `tab-organizer` folder
6. The extension icon appears in your toolbar — pin it for easy access!

---

## Project Structure

```
tab-organizer/
├── manifest.json                 # MV3 manifest
├── background/
│   └── service-worker.js         # Tab tracking, alarms, notifications
├── popup/
│   ├── popup.html                # Extension popup UI
│   ├── popup.css                 # Dark-mode styles with animations
│   └── popup.js                  # Tab list, groups, duplicates logic
├── options/
│   ├── options.html              # Settings page
│   ├── options.css               # Settings styles
│   └── options.js                # Settings logic + export features
├── utils/
│   ├── storage.js                # Chrome storage helpers
│   └── tabs.js                   # Tab querying & management
├── assets/
│   └── icons/                    # Extension icons (16, 32, 48, 128)
└── README.md
```

---

## Tech Stack

- **Chrome Extension Manifest V3**
- **Vanilla HTML/CSS/JS** — no build step, no framework
- **Chrome APIs**: tabs, storage, history, notifications, alarms, commands
- **Inter** font (Google Fonts)

---

## Settings

Access via the ⚙️ gear icon in the popup, or right-click the extension → Options.

| Setting | Default | Options |
|---------|---------|---------|
| Stale threshold | 30 min | 5m, 10m, 15m, 30m, 1h, 2h, 4h |
| Badge on icon | ✅ On | On / Off |
| Notifications | ✅ On | On / Off |
| Notification frequency | 1 hour | 15m, 30m, 1h, 2h, 4h |
| Notify when stale > | 5 tabs | 3, 5, 10, 15, 20 |
| Monitor incognito | ❌ Off | On / Off |

---

## Roadmap

- [ ] Tab suspender (hibernate idle tabs to save memory)
- [ ] Session save & restore
- [ ] Auto-categorize tabs (Work, Social, Shopping, etc.)
- [ ] Focus mode with Pomodoro timer
- [ ] Analytics dashboard (daily stats, most visited domains)
- [ ] Memory usage per tab
- [ ] Browsing history integration with "suggested tabs"

---

## License

MIT
