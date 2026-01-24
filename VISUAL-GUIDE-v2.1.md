# Visual Feature Guide - Traka Log Analyzer v2.1

This guide shows you exactly where to find each new feature in the UI.

---

## 🖼️ Feature Locations

### 1. Clear All Logs Button

**Location:** Log Viewer Page → Toolbar (Top Right)

```
┌─────────────────────────────────────────────────────────────┐
│  LOG VIEWER                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Select Log File: [business-engine.log ▼]                   │
│                                                               │
│  [🔄 Live Tail]  [⬇ Auto Scroll]  [📄 Load File]  [🗑️ Clear All] │
│                                      ↑                        │
│                           NEW FEATURE HERE!                  │
│                         Red button with trash icon           │
└─────────────────────────────────────────────────────────────┘
```

**Visual Cues:**
- Red/danger styled button
- Trash can icon
- Located at far right of toolbar
- Text: "Clear All"

---

### 2. Config File Support

**Location A:** Home Page → Drop Zone

```
┌─────────────────────────────────────────────────────────────┐
│                    TRAKA LOG ANALYZER                         │
│           Advanced log analysis for TrakaWEB                  │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         📤                                           │   │
│  │   Drag & drop log files here                        │   │
│  │   or click to browse                                │   │
│  │   (.log, .txt, .cfg files supported) ← NEW!        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Location B:** File List → Config Badge

```
┌─────────────────────────────────────────────────────────────┐
│  LOADED FILES                                                 │
├─────────────────────────────────────────────────────────────┤
│  📄 business-engine.log [LOG]                                │
│     1,245 lines · 156 KB                                     │
│                                                               │
│  📄 trakaweb.cfg [CONFIG] ← NEW! Purple badge                │
│     89 lines · 12 KB                                         │
└─────────────────────────────────────────────────────────────┘
```

**Location C:** Log Viewer → Syntax Highlighting

```
┌─────────────────────────────────────────────────────────────┐
│  CONFIG FILE VIEW                                             │
├─────────────────────────────────────────────────────────────┤
│  1  # Traka Configuration File                               │
│  2  # Last modified: 2024-01-19                              │
│  3                                                            │
│  4  [General] ← Orange/bold section header                   │
│  5  ApplicationName=TrakaWEB ← Blue key, white value         │
│  6  Version=8.5.0                                            │
│  7                                                            │
│  8  ; Database settings ← Gray/italic comment                │
│  9  [Database]                                               │
│ 10  Server=localhost                                         │
└─────────────────────────────────────────────────────────────┘
```

**Visual Cues:**
- Purple "CONFIG" badge next to filename
- Syntax highlighting with colors:
  - Orange: Section headers `[Section]`
  - Blue: Configuration keys
  - White: Configuration values
  - Gray/Italic: Comments `#` or `;`

---

### 3. Time Synchronization

**Location A:** Compare Page → Toolbar

```
┌─────────────────────────────────────────────────────────────┐
│  COMPARE LOGS                                                 │
├─────────────────────────────────────────────────────────────┤
│  [📄 Add Files]  [🔄 Live Tail]  [🔄 Sync Scroll]            │
│  [🕐 Time Sync] ← NEW! Clock icon                            │
│  [⬆️ Highlight Differences]                                  │
│                                                               │
│  🔍 [Search across all logs...]                              │
└─────────────────────────────────────────────────────────────┘
```

**Location B:** Time Sync Info Panel (appears when enabled)

```
┌─────────────────────────────────────────────────────────────┐
│  🕐  Time Sync Active                                    [×] │
├─────────────────────────────────────────────────────────────┤
│  Click on any line with a timestamp to sync all files to    │
│  that exact time frame. Lines within ±5 seconds will be     │
│  highlighted across all logs.                                │
│                                                               │
│  📊 Status: Synced to: 2024-01-19 12:25:30                   │
│       12 matching lines found within ±5 seconds              │
└─────────────────────────────────────────────────────────────┘
```

**Location C:** Synchronized Logs Display

```
┌──────────────────────────┬──────────────────────────┬──────────────────────────┐
│  business-engine.log     │  comms-engine.log        │  integration-engine.log  │
├──────────────────────────┼──────────────────────────┼──────────────────────────┤
│ 12:25:27 Started         │ 12:25:27 Initialized     │ 12:25:26 Started         │
│ 12:25:28 Connected       │ 12:25:29 Listening       │ 12:25:28 Connected       │
│ 🟠 12:25:30 ERROR Failed │ 🟠 12:25:30 WARN Timeout │ 🟠 12:25:30 ERROR Denied │
│ 🟠 12:25:31 ERROR Comms  │ 🟠 12:25:31 ERROR Lost   │ 🟠 12:25:31 WARN Invalid │
│ 🟠 12:25:32 INFO Retry   │ 🟠 12:25:32 INFO Recon   │ 🟠 12:25:32 INFO Retry   │
│ 12:25:35 Completed       │ 12:25:33 Connected       │ 12:25:36 Completed       │
└──────────────────────────┴──────────────────────────┴──────────────────────────┘
          ↑                          ↑                          ↑
    Orange glow highlight on all lines within ±5 seconds of clicked timestamp
```

**Visual Cues:**
- Clock icon button turns orange when active
- Clickable lines have pointer cursor
- Highlighted lines have orange glow effect
- Beautiful animation when syncing
- Status panel shows sync info
- All panels scroll to show matches

---

## 🎨 Color Coding Reference

### Buttons
- **Secondary (Gray):** Default state - `[Time Sync]`
- **Active (Orange):** Enabled state - `[Time Sync]` ⚡
- **Danger (Red):** Destructive action - `[Clear All]`

### Badges
- **Blue LOG:** Regular log file
- **Purple CONFIG:** Configuration file

### Highlights
- **Orange Glow:** Time-synced lines
- **Red:** Error level logs
- **Yellow:** Warning level logs
- **Blue:** Info level logs

---

## 🖱️ Interaction Guide

### Clear All Logs
1. **Action:** Click red "Clear All" button
2. **Feedback:** Modal appears
3. **Confirmation:** Click "Yes, Clear All Logs"
4. **Result:** Files cleared, toast notification

### Config Files
1. **Action:** Drag .cfg file to drop zone
2. **Feedback:** "Loaded as config file" toast
3. **Visual:** Purple CONFIG badge appears
4. **View:** Syntax highlighting applied

### Time Sync
1. **Action:** Click "Time Sync" button
2. **Feedback:** Button turns orange, info panel appears
3. **Action:** Click any timestamped line
4. **Result:** Orange highlights across all files
5. **Visual:** Smooth glow animation
6. **Info:** Status shows sync details

---

## 📱 Responsive Design

### Desktop (1920x1080)
- All features visible
- Full toolbar layout
- 3-column compare view optimal

### Tablet (768x1024)
- Toolbar wraps gracefully
- 2-column compare view
- All features accessible

### Mobile (375x667)
- Stacked toolbar buttons
- Single column compare
- Swipe between files
- Features maintained

---

## 🎯 Quick Access Guide

| Feature | Page | Location | Hotkey |
|---------|------|----------|--------|
| Clear All | Log Viewer | Top right toolbar | - |
| Load Config | Home | Drop zone | - |
| Time Sync | Compare | Middle toolbar | - |
| Config Badge | File List | Next to filename | - |

---

## 💡 Tips

**Clear All:**
- Use between customer sessions
- Clears everything including searches
- Can't be undone - be sure!

**Config Files:**
- Automatic syntax highlighting
- No issue detection (cleaner view)
- Mix with log files in compare

**Time Sync:**
- Best with 2-4 files
- ±5 seconds is perfect for most cases
- Click different timestamps to re-sync
- Disable when done to improve performance

---

## 🎬 Usage Flow Examples

### Scenario 1: New Customer Logs
```
1. Click "Clear All" to remove previous customer
2. Drag new customer's logs to drop zone
3. Navigate to Compare view
4. Enable Time Sync
5. Click on error to find correlations
```

### Scenario 2: Config Analysis
```
1. Load config file (.cfg)
2. Verify purple CONFIG badge
3. View with syntax highlighting
4. Compare with other configs if needed
```

### Scenario 3: Multi-Engine Issue
```
1. Load Business, Comms, Integration logs
2. Go to Compare view
3. Enable Time Sync
4. Click error in Business Engine
5. See what happened in all engines at same time
```

---

## 🎨 Visual Hierarchy

**Most Important (Bright Colors):**
- Time-synced highlights (Orange glow)
- Error logs (Red)
- Active buttons (Orange/Green)

**Secondary (Medium Colors):**
- Config syntax (Blue, Purple)
- Warning logs (Yellow)
- Badges (Blue, Purple)

**Tertiary (Subtle Colors):**
- Comments (Gray)
- Default buttons (Gray)
- Borders (Dark gray)

---

**This visual guide helps you quickly locate and use all new features!** 🚀
