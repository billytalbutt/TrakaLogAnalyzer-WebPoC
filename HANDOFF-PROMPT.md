# Traka Log Analyzer - Continuation Prompt

## Project Location
```
c:\DEV\Traka Tools Suite\TrakaLogAnalyzer-WebPoC\
```

## What This Is
An **Electron desktop app** (v33) that monitors and analyzes Traka system log files in real-time. Think of it as a Notepad++ live tail viewer, but purpose-built for Traka — showing multiple log files side-by-side simultaneously with live streaming.

## Key Files
| File | Size | Purpose |
|------|------|---------|
| `main.js` | ~23KB | Electron main process — file I/O, IPC handlers, chokidar watchers |
| `preload.js` | ~2KB | IPC bridge exposing `electronAPI` to renderer |
| `js/app.js` | ~209KB | All renderer logic — UI, live tail, compare panels, file loading |
| `css/styles.css` | ~68KB | All styling |
| `index.html` | ~1160 lines | App shell with sidebar nav, pages (Home, Log Viewer, Compare, Issues, Analytics, Settings) |
| `package.json` | Uses `electron`, `electron-builder`, `chokidar` |

## How It Works
1. User clicks **Scan Traka Directories** on the Home page — the main process scans default Traka log paths (`C:\Program Files\Traka\...`, `C:\ProgramData\Traka\Logs`, etc.)
2. Discovered log files are loaded via IPC `read-log-file` handler → stored in `state.files[]` with `.path`, `.name`, `.content`, `.lines`
3. The **Compare** page shows all loaded files side-by-side in panels using flexbox
4. **Live Tail** button starts monitoring — polls every 1s via `pollElectronFiles()` which calls `tail-file` IPC (reads only new bytes from byte offset)

## Architecture of Live Tail (Current)

### Main Process (`main.js`)
- `tail-file` IPC handler: Takes `(filePath, fromByte)`, stats the file, reads only new bytes from offset using `fd.read()`, returns delta content
- `start-tail-watch` IPC handler: Creates chokidar per-file watcher as bonus accelerator, pushes `file-tail-update` events
- `stop-all-tail-watches`: Cleanup

### Renderer (`js/app.js`)
- `pollElectronFiles()`: Called every 1000ms via `setInterval`, loops through `state.files`, calls `tailFile(path, offset)` for each, appends new lines via `appendNewContentLive()`
- `appendNewContentLive()`: Updates `fileData.lines`, calls `appendLinesToComparePanel()` for efficient DOM append (no full re-render), auto-scrolls to bottom
- `appendLinesToComparePanel()`: Creates DOM elements for new lines, appends to the panel's `.compare-panel-content` div using DocumentFragment
- Push listener `onFileTailUpdate`: Also calls `appendNewContentLive()` when chokidar fires

### Preload (`preload.js`)
- Exposes: `tailFile`, `startTailWatch`, `stopTailWatch`, `stopAllTailWatches`, `onFileTailUpdate`, `onFileTailReset`

## Two Critical Bugs To Fix

### Bug 1: UI Freezes / Becomes Unresponsive
When you load log files and switch to the Compare tab, the entire UI freezes — you can't click navigation, buttons, or anything. The page becomes completely unresponsive.

**Root Cause (likely):** The `pollElectronFiles()` function runs every 1 second and calls `await window.electronAPI.tailFile()` **sequentially** for every loaded file. Each IPC call is an async round-trip. If there are 4 files and each takes time, the polling loop blocks. Worse, `appendNewContentLive()` calls `parseLogFile()` and `detectIssues()` on every update — these are expensive full-file operations that block the main thread. The `updateCompareView()` function rebuilds the entire DOM innerHTML of all panels when certain conditions are met (like trimming), which is extremely expensive for files with 10,000+ lines.

**How to fix:**
- Make `pollElectronFiles()` non-blocking: fire all `tailFile` calls in parallel with `Promise.all()`, not sequential `await` in a loop
- **Do NOT** call `parseLogFile()` and `detectIssues()` on every live tail update — these should only run on initial load. Live tail should just append lines to `fileData.lines` and update the DOM
- Never call `updateCompareView()` (full re-render) during live tail. Only ever use `appendLinesToComparePanel()` (incremental append)
- Consider using `requestIdleCallback` or `requestAnimationFrame` to batch DOM updates
- If the file hasn't changed (no new bytes), skip all processing entirely — currently it still does work even when `newContent` is empty

### Bug 2: Loading Animation Needed
When log files are loading (scanning directories, reading files), there's a delay but no visual feedback. The user tries to click around and nothing responds.

**What to do:**
- The app already has `showGlobalLoader()` / `hideGlobalLoader()` functions that create a beautiful overlay with spinner and timer
- Show this loader when: scanning Traka directories, loading files from paths, switching to a page that needs to render heavy content
- The loader is already used in some places (file drag-drop loading, stitch operations) — extend it to cover the Electron auto-discovery and file loading flow
- Key functions to wrap: `scanTrakaLogs()`, `loadFileFromPath()` batch operations, `showFileSelectionModal()` → load selected files

## Other Important Context

### Compare Panel Layout
- Panels are ALWAYS side-by-side using flexbox (`display: flex; flex-direction: row`)
- Each panel: `flex: 1 1 0; min-width: 0` — never stacks vertically
- Each panel header has a maximize button that makes it fill the whole area (hides siblings with `.panel-hidden`)
- ESC restores maximized panel, then exits fullscreen

### The Live Tail UX Goal
This must work **exactly like Notepad++ tail mode** (the eye icon):
- Newest content at the bottom, scrolling upward as new lines arrive
- All 4 log panels stream simultaneously and independently
- Auto-scroll keeps the view pinned to the bottom
- Turning tail off freezes the view at the last update
- Turning tail back on jumps to the bottom and resumes streaming
- It must be smooth and responsive — no freezing, no jank, no blocking

### Loading Overlay Already Exists
```javascript
showGlobalLoader('Loading...', 'subtext');  // Shows overlay with spinner
hideGlobalLoader();                          // Fades out
updateGlobalLoaderText('New message', 'new subtext');  // Updates text
```
CSS classes: `.global-loader-overlay`, `.global-loader-content`, `.global-loader-spinner`

## What to Do (Priority Order)
1. **Fix the UI freeze** — Make live tail non-blocking. Parallel IPC calls, remove expensive re-processing on every update, minimal DOM work
2. **Add loading overlay** during file loading operations so the user knows something is happening
3. **Verify live tail actually streams** — restart a Traka service and confirm new log lines appear in all 4 compare panels simultaneously

## How to Run
```bash
cd "c:\DEV\Traka Tools Suite\TrakaLogAnalyzer-WebPoC"
npm start        # Launch the app
npm run dev      # Launch with DevTools open
```
