# Log Stitching - Quick Reference

## 🚀 Quick Start (30 Seconds)

1. **Load files** → Drag & drop multiple log files (e.g., Business Engine logs from different days)
2. **Click "Stitch Files"** → Button in Log Viewer toolbar (📦 icon)
3. **Select files** → Check 2+ boxes in the panel
4. **Click "Stitch X Files"** → Done! View chronologically merged log

## 📋 Common Scenarios

### Scenario 1: Track Error Across 3 Days
```
✓ Load: business_2024-01-18.log, business_2024-01-19.log, business_2024-01-20.log
✓ Stitch: Select all 3 files
✓ Result: See all errors in perfect chronological order
```

### Scenario 2: Transaction Flow Split Across Files
```
✓ Load: logs from Monday & Tuesday
✓ Stitch: Both files
✓ Search: Transaction ID
✓ Result: Complete transaction timeline
```

### Scenario 3: Week-Long Integration Analysis
```
✓ Load: 7 days of Integration Engine logs
✓ Stitch: All 7 files
✓ Filter: Integration engine
✓ Result: Entire week's activity in one view
```

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| **Color Coding** | Each source file gets a unique color bar on the left |
| **Legend** | Shows which color = which file |
| **Timestamps** | Automatically sorted chronologically |
| **Export** | Save stitched log as new .log file |
| **All Features Work** | Search, filters, issues detection, analytics |

## ⚡ Tips

- ✅ **Best:** Stitch files from same engine type (e.g., all Business Engine)
- ✅ **Works:** Can stitch any mix of log files
- ❌ **Can't:** Stitch config files (.cfg) or already-stitched files
- 💡 **Minimum:** Need at least 2 files to stitch

## 🎨 Visual Quick Guide

### Button Location
```
Log Viewer Toolbar:
[Live Tail] [Auto Scroll] [Load File] [Clear All] [📦 Stitch Files] ← HERE
```

### File Selection
```
Business Engine (3 files)
☑ file1.log - 1,234 lines | 45 KB
☑ file2.log - 2,567 lines | 89 KB
☐ file3.log - 3,890 lines | 102 KB
```

### Result Display
```
Each log line shows:
| [timestamp] Log entry content here
↑
Color bar (shows source file)

Bottom Legend:
📎 Source Files: ● file1.log ● file2.log
```

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Button disabled | Load at least 2 log files first |
| "Select at least 2 files" | Check more boxes in the file list |
| Some lines at end unsorted | Normal - those lines have no timestamp |
| Can't find stitched log | Look for "Stitched_Xfiles_..." in file dropdown |

## 📊 What Happens

1. **Selected files** → Extracts all log entries
2. **Parse timestamps** → Identifies date/time in each line
3. **Sort** → Oldest to newest (entries without timestamps at end)
4. **Combine** → Creates new virtual log file
5. **Display** → Shows in viewer with color coding
6. **Analyze** → All features work normally (search, filter, etc.)

## 💾 Export

After stitching, click **"Export Stitched Log"** to save:
- File format: Plain text `.log`
- Name: `Stitched_Xfiles_YYYYMMDD_HHMM.log`
- Content: All entries in chronological order
- Use: Share with team, archive, or load later

## 📱 Supported Formats

### Timestamp Formats Recognized
- `2024-01-20 14:30:15` ✅
- `20/01/2024 14:30:15` ✅
- `01-20-2024 14:30:15` ✅
- `2024-01-20T14:30:15.123` ✅ (with milliseconds)

### File Types
- `.log` files ✅
- `.txt` files ✅
- `.cfg` files ❌ (no timestamps)

## 🎓 Learn More

For detailed documentation, see: **LOG-STITCHING-FEATURE.md**

---

**Quick Help:** Load 2+ log files → Click "Stitch Files" → Select files → Click "Stitch X Files" → Done!
