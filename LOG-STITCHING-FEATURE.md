# Log File Stitching Feature - User Guide

## 🎯 What Is It?

The **Log Stitching Feature** allows you to combine multiple log files from the same engine (e.g., Business Engine logs from different days) into a single, chronologically-ordered view. This is perfect for tracking issues that span multiple days or analyzing trends across log file rotations.

## 🚀 How to Use

### Step 1: Load Your Log Files

First, load all the log files you want to stitch together. You can do this by:
- Dragging and dropping files onto the home page
- Using the "Load File" button in the Log Viewer
- Clicking "Add Files" in the Compare page

**Example:** Load these files:
- `TrakaBusinessEngine_2024-01-18.log`
- `TrakaBusinessEngine_2024-01-19.log`
- `TrakaBusinessEngine_2024-01-20.log`

### Step 2: Open the Stitch Panel

In the **Log Viewer** page, click the **"Stitch Files"** button in the toolbar (it has a 3D box icon 📦).

The button will turn orange and a panel will appear below showing all your loaded files grouped by engine type.

### Step 3: Select Files to Stitch

In the stitch panel, you'll see your files organized by category:
- **Business Engine**
- **Comms Engine**
- **Integration Engine**
- **Plugins**
- **Other Logs**

✅ **Check the boxes** next to the files you want to stitch together (minimum 2 files).

💡 **Tip:** It's best to stitch files from the same engine type (e.g., all Business Engine logs) for meaningful chronological ordering.

### Step 4: Perform the Stitch

Click the **"Stitch X Files"** button (where X is the number of files you selected).

The tool will:
1. Extract all log entries from the selected files
2. Sort them by timestamp (oldest to newest)
3. Create a new virtual log file with all entries combined
4. Display the stitched log in the viewer

### Step 5: View the Stitched Log

The stitched log will automatically appear in the viewer with:

- **Color-coded indicators** on the left side of each line showing which original file it came from
- **A legend** at the bottom of the toolbar showing the color mapping
- **Statistics** showing total lines and how many source files were combined

**You can now:**
- Search across all stitched log entries
- Filter by log level (Error, Warning, Info, Debug)
- Apply engine filters
- View detected issues across all timeframes
- Use all other analyzer features

### Step 6: Export (Optional)

Click the **"Export Stitched Log"** button to save the combined log file to your computer. The exported file will contain all log entries in chronological order.

## 📋 Example Use Cases

### Case 1: Tracking an Intermittent Issue

**Problem:** A Business Engine error occurs sporadically over 3 days.

**Solution:**
1. Load Business Engine logs from all 3 days
2. Stitch them together
3. Search for the error message
4. See all occurrences in chronological order
5. Identify the pattern!

### Case 2: Viewing Complete Transaction Flow

**Problem:** A transaction started on Monday evening and completed Tuesday morning, spanning two log files.

**Solution:**
1. Load both days' logs
2. Stitch them together
3. Search for the transaction ID
4. View the complete flow as if it were one continuous log

### Case 3: Analyzing Integration Engine Over a Week

**Problem:** Need to understand Integration Engine behavior over multiple days.

**Solution:**
1. Load Integration Engine logs from the entire week
2. Stitch them together
3. Apply the "Integration" engine filter
4. View the complete week's activity
5. Export for sharing with the team

## ⚙️ Technical Details

### How Timestamp Sorting Works

The stitcher recognizes multiple timestamp formats:
- `2024-01-20 14:30:15` (ISO format)
- `20/01/2024 14:30:15` (UK format)
- `01-20-2024 14:30:15` (US format)
- Timestamps with milliseconds: `2024-01-20 14:30:15.123`

**Log entries without timestamps** or with unparseable timestamps are placed at the end of the stitched log.

### Performance

- Stitching is done **in-memory** and is very fast (typically < 1 second even for large files)
- The stitched log behaves like any other loaded log file
- All analysis features work normally (issue detection, filtering, search, etc.)
- File size limits: Can handle millions of log lines (limited only by browser memory)

### Color Coding

Each source file is assigned a unique color:
- Orange (Traka primary)
- Teal
- Blue
- Green
- Yellow
- Purple
- Pink
- Light Blue
- Mint
- Coral

Colors are consistently assigned using a hash of the filename, so the same file will always get the same color.

## 💡 Pro Tips

### Best Practices

1. **Same Engine Type:** Stitch files from the same engine for best results
2. **Sequential Dates:** Stitch files in date order for meaningful timeline analysis
3. **Check Timestamps:** Ensure your log files have timestamps for proper sorting
4. **Limited Selection:** Avoid stitching too many files at once (5-10 is usually optimal)
5. **Export Results:** Save stitched logs for future reference or sharing

### Limitations

- **Config files cannot be stitched** (they don't have timestamps)
- **Already stitched files cannot be re-stitched** (prevent infinite nesting)
- **Minimum 2 files required** (nothing to stitch with 1 file)
- **Timestamp required for sorting** (entries without timestamps go to the end)

### Performance Tips

- Stitching many large files may take a few seconds
- Browser memory limits apply (typically 2-4GB)
- For extremely large datasets (>100MB total), consider stitching in batches

## 🎨 Visual Guide

### The Stitch Button
```
┌──────────────────┐
│ 📦 Stitch Files  │  ← Click this in the toolbar
└──────────────────┘
```

### File Selection
```
┌─────────────────────────────────────────────┐
│ Business Engine                             │
├─────────────────────────────────────────────┤
│ ☑ TrakaBusinessEngine_2024-01-18.log       │
│ ☑ TrakaBusinessEngine_2024-01-19.log       │
│ ☐ TrakaBusinessEngine_2024-01-20.log       │
└─────────────────────────────────────────────┘
```

### Stitched Log Display
```
┌────────────────────────────────────────────────┐
│ | [2024-01-18 23:55:10] Last entry day 1     │ ← Orange bar
│ | [2024-01-19 00:00:05] First entry day 2    │ ← Teal bar
│ | [2024-01-19 00:05:30] Error occurred       │ ← Teal bar
└────────────────────────────────────────────────┘

📎 Source Files:  ● file1.log  ● file2.log
```

## 🔧 Troubleshooting

### "No files loaded"
**Solution:** Load some log files first using the home page or Load File button.

### "Select at least 2 files"
**Solution:** You need minimum 2 files to stitch. Check more boxes in the file list.

### "Entries without timestamps at end"
**Info:** This is normal. Log entries without timestamps or unparseable timestamps are placed at the end. They're still included, just not sorted chronologically.

### Stitch button is disabled
**Possible causes:**
- Less than 2 files selected
- No log files loaded
- Only config files loaded

### Can't find my stitched log
**Solution:** Look in the file dropdown - it will be named `Stitched_Xfiles_YYYYMMDD_HHMM.log` where X is the number of files stitched.

## 📚 Related Features

The stitched log works with all other analyzer features:

- **Search:** Find text across all stitched files
- **Filters:** Apply log level and engine filters
- **Issues Detection:** Issues are detected across all stitched content
- **Analytics:** Charts and stats include stitched log data
- **Compare:** You can compare a stitched log with other files
- **Export:** Save the stitched log for later use

## 🎉 Summary

The Log Stitching feature makes it easy to analyze log data that spans multiple files. Simply load your files, select which ones to combine, click stitch, and you'll have a unified chronological view ready for analysis!

**Key Benefits:**
- ✅ View logs across multiple days seamlessly
- ✅ Track issues from start to finish regardless of file boundaries
- ✅ Analyze trends over extended time periods
- ✅ Color-coded source file indicators
- ✅ Export combined logs for sharing
- ✅ All analyzer features work normally

---

**Need Help?** Check the main README or contact your system administrator.
