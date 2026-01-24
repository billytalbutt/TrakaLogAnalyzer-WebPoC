# Quick Reference - TrakaLogAnalyzer Web PoC v2.0

## 🚀 What's New in v2.0?

Five major improvements to make your log analysis faster and more powerful!

---

## 1. 🔴 Live Tail Monitoring (NEW!)

**Location:** Log Viewer page & Compare page → "Live Tail" button

**What it does:**
- Monitors log files in real-time as they're being written
- Auto-scrolls to show newest entries
- Works like Notepad++ Tail or BareTail
- Perfect for live debugging and system monitoring

**How to use:**
```
1. Load a log file (viewer) or multiple files (compare)
2. Click "Live Tail" button (refresh icon)
3. Button turns green with pulsing animation
4. Watch as new log entries appear automatically
5. Click "Stop Tail" to pause monitoring
```

**Pro Tips:**
- ⚡ Toggle auto-scroll with the down arrow button
- 🎯 Monitor up to 6 files simultaneously in compare view
- 💪 Search and filter work while tailing
- 🔥 Perfect for debugging live systems

---

## 2. 📊 Multi-File Grid Layout (NEW!)

**Location:** Compare page (automatic based on file count)

**What's new:**
- Support for 2-6 files in intelligent grid layouts
- Automatic layout selection
- File count badges on each panel

**Grid Layouts:**
- 📄 **2 Files** → Side-by-side (1×2)
- 📄 **3 Files** → Three columns (1×3)  
- 📄 **4 Files** → 2×2 grid
- 📄 **5-6 Files** → 2×3 grid

**How to use:**
```
1. Load 2-6 log files
2. Navigate to Compare page
3. Files automatically arrange in optimal grid
4. Each panel shows line count badge
```

---

## 3. 🔄 Sync Scroll (FIXED!)

**Location:** Compare page → "Sync Scroll" button

**What it does:**
- Makes all comparison panels scroll together
- Button lights up orange when active
- Perfect for comparing logs line-by-line

**How to use:**
```
1. Load 2+ log files for comparison
2. Click "Sync Scroll" button (it lights up)
3. Scroll any panel → all panels scroll together
4. Click again to turn off
```

---

## 4. 🎨 Highlight Differences (IMPROVED!)

**Location:** Compare page → "Highlight Differences" button

**What's new:**
- Beautiful modal explains what colors mean
- Shows statistics for each file
- Clear, professional presentation

**Color Legend:**
- 🔴 **Red** = Unique lines (only in this file)
- 🔵 **Blue** = Common lines (in multiple files)

**How to use:**
```
1. Load 2+ log files for comparison
2. Click "Highlight Differences"
3. Read the modal (explains everything)
4. Click "Got It" to close
5. Scroll through to see highlighted lines
6. Use "Clear Highlights" to remove
```

---

## 5. 🏢 Engine Filters

**Location:** Log Viewer page → Below filter chips

**What it does:**
- Filter logs by Traka engine type
- Works just like the desktop app
- Instant filtering

**Filters Available:**
- 🏢 **Business** - Business Engine logs
- 📡 **Comms** - Comms Engine logs
- 🔌 **Integration** - Integration Engine logs

**How to use:**
```
1. Open any log file in viewer
2. Find "Engines:" section
3. Click any engine filter
4. Button lights up orange when active
5. Logs filter instantly
6. Click again to turn off
7. Use multiple at once for combined filtering
```

**Pattern Matching:**
- Business: Finds "Business Engine", "TBE", etc.
- Comms: Finds "Comms Engine", "TCE", "Communication"
- Integration: Finds "Integration Engine", "TIE"
- Case-insensitive (finds "BUSINESS ENGINE" too)

**Pro Tips:**
- ✅ Combine with Error/Warning filters for precision
- ✅ Use multiple engine filters together
- ✅ Works on all log files automatically

---

## 📍 Where to Find Everything

### Live Tail
```
Navigate to: Log Viewer OR Compare
Look for: Button with circular arrows icon (🔄)
Location: Top toolbar, leftmost action button
```

### Multi-File Grid
```
Navigate to: Compare
Action: Load 2-6 files automatically arranges in grid
Location: Main content area
```

### Sync Scroll
```
Navigate to: Compare
Look for: Button with sync icon (↻)
Location: Top toolbar, middle button
```

### Highlight Differences
```
Navigate to: Compare
Look for: Button with highlight icon
Location: Top toolbar, right of Sync Scroll
```

### Engine Filters
```
Navigate to: Log Viewer
Look for: "Engines:" label with filter buttons
Location: Below Error/Warning/Info/Debug chips
```

---

## 🎯 Common Use Cases

### Live Debugging Session
```
1. Go to Compare page
2. Load Business, Comms, and Integration logs (3 files)
3. Click "Live Tail" → button turns green
4. Enable "Sync Scroll"
5. Reproduce the issue in the system
6. Watch all three logs update in real-time
Result: See transaction flow across all engines live!
```

### Monitor API Performance
```
1. Go to Log Viewer
2. Load Integration Engine log
3. Click 🔌 Integration filter
4. Click "Live Tail"
5. Search for: /took.*ms/
Result: See API performance metrics in real-time
```

### Debug Integration Issues
```
1. Go to Log Viewer
2. Load Business Engine log
3. Click 🔌 Integration filter
4. Set filter to "Error"
Result: See only Integration Engine errors in Business log
```

### Compare Two Logs
```
1. Go to Compare
2. Load file1.log and file2.log
3. Click "Sync Scroll" (lights up)
4. Click "Highlight Differences"
5. Read modal stats
6. Scroll through to see red/blue highlights
Result: Instantly see what's different
```

### Find Comms Problems
```
1. Go to Log Viewer
2. Load any log file
3. Click 📡 Comms filter
4. Set filter to "Warning"
Result: All Comms Engine warnings displayed
```

---

## 💡 Quick Tips

### Live Tail
- 🔥 Works on 1-6 files simultaneously
- ⚡ 1-second refresh rate (optimal for most cases)
- 🎯 Toggle auto-scroll with down arrow button
- 💪 Search/filter while tailing for precision
- 🧹 Automatically trims to last 10,000 lines per file

### Multi-File Grid
- 📊 Optimal viewing for 2-4 files
- 🎨 Automatic layout selection
- 💡 Line count badges on each panel
- ✨ Responsive to window size

### Sync Scroll
- ⚡ Toggle on/off with one click
- 🎯 Works with 2+ comparison panels
- 💪 Smooth, synchronized scrolling

### Highlight Differences
- 📊 See stats before scrolling
- 🎨 Clear color coding (red/blue)
- 🧹 Easy to clear when done

### Engine Filters
- 🔥 Instant filtering (no delay)
- 🎯 Combine with log level filters
- ✨ Multiple engines at once

---

## 🆘 Troubleshooting

**Q: Live Tail not updating?**
- Verify file is being written to (check timestamp)
- Stop and restart Live Tail
- Check browser console (F12) for errors
- Ensure file hasn't been moved/renamed

**Q: Performance issues with Live Tail?**
- Reduce number of files (3 or fewer recommended)
- Stop monitoring files you don't need
- Clear filters to reduce processing
- Close other browser tabs

**Q: Auto-scroll not working?**
- Check down arrow button is green (active)
- Try toggling off and back on
- Make sure you haven't manually scrolled up

**Q: Sync Scroll not working?**
- Make sure button is orange (active)
- Need at least 2 files loaded
- Refresh page if stuck

**Q: No highlights showing?**
- Need at least 2 files to compare
- Files must have some differences
- Use "Clear Highlights" then try again

**Q: Engine filters not working?**
- Make sure filter button is orange (active)
- Log must contain engine references
- Check log level filter isn't hiding results

**Q: Nothing showing with filters?**
- Current log doesn't match filters
- Try clicking "All" in log level
- Turn off all engine filters to see everything

---

## 🎨 Visual Guide

### Active vs Inactive States

**Inactive Button:**
```
┌─────────────┐
│ 🏢 Business  │  ← Gray background
└─────────────┘
```

**Active Button:**
```
┌─────────────┐
│ 🏢 Business  │  ← Orange background + glow
└─────────────┘
```

**Live Tail Active:**
```
┌─────────────┐
│ 🔄 Stop Tail │  ← Green background + pulsing
└─────────────┘
```

### Highlighted Lines

**Red (Unique):**
```
┃ [ERROR] Integration Engine failed to start  ← Red border + background
```

**Blue (Common):**
```
┃ [INFO] Application started successfully     ← Blue border + background
```

---

## 📚 See Also

- **LIVE-TAIL-GUIDE.md** - Complete Live Tail documentation
- **RELEASE-NOTES-v2.0.md** - Full v2.0 release notes
- **UPDATE-SUMMARY.md** - Detailed technical documentation
- **README.md** - General tool documentation

---

## ⭐ Key Benefits

| Feature | v1.0 | v2.0 |
|---------|------|------|
| **Live Tail** | ❌ | ✅ Real-time monitoring! |
| **Multi-File Compare** | 2 files | 2-6 files in grid |
| **Sync Scroll** | Broken | Works perfectly! |
| **Diff Colors** | Confusing | Crystal clear |
| **Engine Filters** | ✅ | ✅ Enhanced |
| **User Experience** | Good | Excellent! |

---

**Enjoy your upgraded log analyzer!** 🎉

Got questions? Check **LIVE-TAIL-GUIDE.md** for detailed Live Tail info!

Need technical details? See **RELEASE-NOTES-v2.0.md**!
