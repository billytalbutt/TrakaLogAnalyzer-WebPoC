# 🚀 Quick Start - Traka Log Analyzer Desktop Edition

## Installation & First Run

### Step 1: Install Dependencies (First Time Only)

Open PowerShell in the application folder and run:

```powershell
npm install
```

Wait for installation to complete (~30 seconds).

### Step 2: Start the Application

```powershell
npm start
```

The Traka Log Analyzer window will open.

---

## Using the Application

### 🔍 Method 1: Automatic Discovery (Recommended)

**This is the new feature that makes Desktop Edition special!**

1. On the home screen, click **"Scan Traka Directories"**

2. Wait a few seconds while it scans:
   - `C:\ProgramData\Traka\Business Engine\Logs`
   - `C:\ProgramData\Traka\Comms Engine\Logs`
   - `C:\ProgramData\Traka\Integration Engine\Logs`
   - And more...

3. A modal appears showing all found log files:
   ```
   Found 12 log files in 3 directories
   
   ☑ TrakaBusinessEngine_2024-01-24.log
   ☑ TrakaCommsEngine_2024-01-24.log
   ☑ TrakaIntegrationEngine_2024-01-24.log
   ...
   ```

4. Check the files you want to analyze

5. Click **"Load Selected Files"**

6. Done! Your logs are now loaded and ready to analyze.

---

### 📁 Method 2: Custom Directory

If your logs are somewhere else:

1. Click **"Custom Directory"**
2. Browse to your log folder
3. Select files from the results

---

### 📄 Method 3: Browse Files

Just like the old way:

1. Click **"Browse Files"**
2. Select .log or .txt files
3. Click Open

---

### 🎯 Method 4: Drag & Drop

Still works! Just drag log files onto the drop zone.

---

## Features You Can Use Immediately

### 📊 Log Viewer
- Navigate to **"Log Viewer"** from sidebar
- View log contents with syntax highlighting
- Use search bar to find specific text
- Filter by log level (Error, Warning, Info, Debug)

### 🔬 Compare Mode
- Navigate to **"Compare"**
- Load 2-6 files to see side-by-side
- Sync scroll between files
- Time-sync to align by timestamp

### ⚠️ Issues Dashboard
- Navigate to **"Issues"**
- See all automatically detected problems
- Filter by severity (Critical, Error, Warning, Performance)
- Click any issue to see details and context

### 📈 Analytics
- Navigate to **"Analytics"**
- See charts and statistics
- Identify trends and patterns
- Export reports

---

## Tips for Daily Use

### ⚙️ One-Time Setup

1. Go to **Settings** (bottom of sidebar)
2. Scroll to **"Log Directory Configuration"**
3. Check the default paths are correct
4. ✅ Enable **"Automatically scan for logs on startup"**
5. Click **"Save Settings"**

Now every time you open the app, it will auto-scan for new logs!

### 🔄 Monitoring Active Logs

1. Load your log files
2. Go to **Log Viewer**
3. Click the **"Live Tail"** button (refresh icon)
4. Watch logs update in real-time!

Perfect for monitoring live Traka systems.

---

## Common Tasks

### Task: Find all errors in Business Engine logs today

1. Click "Scan Traka Directories"
2. Select only BusinessEngine logs from today
3. Load them
4. Go to "Issues" → Filter by "Error"
5. Review the list!

### Task: Compare Business Engine and Comms Engine

1. Load both log files
2. Go to "Compare"
3. Enable "Time Sync"
4. Click any line to sync both files to that timestamp
5. See what both engines were doing at the same moment!

### Task: Export issue report

1. Go to "Issues"
2. Click "Export Report" button
3. Save as .txt file
4. Attach to support ticket

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Next search result |
| `Shift+Enter` | Previous search result |
| `Escape` | Clear search |

---

## Need Help?

### Not finding logs?

1. Check Settings → Log Directory Configuration
2. Verify paths exist on your system
3. Click "Custom Directory" to add your location

### App won't start?

```powershell
# Reinstall dependencies
npm install

# Try again
npm start
```

### Want to build an installer?

```powershell
npm run build:win
```

Installer will be in the `dist` folder.

---

## That's It!

You're ready to use the Traka Log Analyzer Desktop Edition. The automatic scanning feature means you'll spend less time finding logs and more time analyzing them.

**Remember**: Enable "Auto-scan on startup" in Settings for the best experience!

---

**Version 3.0 - Desktop Edition**  
*All the power of the web version + automatic log discovery*
