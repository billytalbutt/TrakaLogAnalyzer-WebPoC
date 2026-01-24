# Traka Log Analyzer - Desktop Edition v3.0

## Overview

The Traka Log Analyzer Desktop Edition is an Electron-based desktop application that provides advanced log analysis capabilities for TrakaWEB and Traka Integration Engine with **automatic log file discovery**.

### What's New in Desktop Edition

✨ **Automatic Log Discovery** - Scans Traka installation directories automatically  
🔍 **No Permission Dialogs** - Full file system access without browser restrictions  
📁 **Custom Directory Support** - Configure your own log file locations  
👁️ **Real-time Monitoring** - Watch directories for new log files  
🖥️ **Native Desktop App** - Runs as a standalone Windows application  
⚡ **All Web Features Preserved** - Everything from v2.1 still works perfectly

## Installation

### Option 1: Development Mode (Recommended for Testing)

1. Navigate to the application directory:
   ```bash
   cd "c:\DEV\Traka Tools Suite\TrakaLogAnalyzer-WebPoC"
   ```

2. Install dependencies (first time only):
   ```bash
   npm install
   ```

3. Run the application:
   ```bash
   npm start
   ```

### Option 2: Build Installer (For Distribution)

1. Build the Windows installer:
   ```bash
   npm run build:win
   ```

2. The installer will be created in the `dist` folder
3. Double-click the `.exe` installer to install
4. Launch from Start Menu or Desktop shortcut

## Quick Start Guide

### 1. Automatic Log Discovery

When you open the app, you'll see the new **Automatic Log Discovery** section on the home page:

```
┌─────────────────────────────────────────────┐
│ 🔍 Automatic Log Discovery                  │
│                                              │
│ Scan Traka installation directories for     │
│ log files automatically                      │
│                                              │
│ [Scan Traka Directories] [Custom Directory] │
│ [Browse Files]                               │
└─────────────────────────────────────────────┘
```

**Click "Scan Traka Directories"** to automatically search:
- `C:\ProgramData\Traka\Business Engine\Logs`
- `C:\ProgramData\Traka\Comms Engine\Logs`
- `C:\ProgramData\Traka\Integration Engine\Logs`
- `C:\Program Files\Traka\TrakaWEB\Logs`
- `C:\Program Files (x86)\Traka\TrakaWEB\Logs`
- `C:\Logs`

### 2. Select Files to Load

After scanning, a modal will appear showing all discovered log files:

```
Found 15 log files in 3 directories:

☑ TrakaBusinessEngine_2024-01-24.log (1.2 MB)
☑ TrakaCommsEngine_2024-01-24.log (845 KB)
☑ TrakaIntegrationEngine_2024-01-24.log (324 KB)
...

[Select All] [Deselect All]

[Cancel] [Load Selected Files]
```

- Check/uncheck files you want to load
- Click "Load Selected Files"
- Files are loaded and ready for analysis!

### 3. Custom Directories

If your logs are in a different location:

1. Click **"Custom Directory"**
2. Browse to your log directory
3. Select files from the results

Or use **"Browse Files"** to manually select specific files.

## Features

### All Previous Features Still Work!

✅ **Multi-File Support** - Load up to 6 files simultaneously  
✅ **Live Tail Mode** - Real-time log monitoring  
✅ **Advanced Search** - Regex support with match navigation  
✅ **Filtering** - By log level, engine type, date/time range  
✅ **Side-by-Side Comparison** - Compare multiple logs  
✅ **Log Stitching** - Merge logs chronologically  
✅ **Issue Detection** - Automatic problem identification  
✅ **Analytics Dashboard** - Visual insights and charts  
✅ **Time Synchronization** - Sync logs by timestamp  

### New Desktop-Exclusive Features

#### 1. Automatic Directory Scanning

- Scans default Traka directories without permission dialogs
- Shows file size, modification date, and full path
- Intelligently sorts files by engine type (Business → Comms → Integration)

#### 2. Custom Directory Configuration

Go to **Settings → Log Directory Configuration**:

```
Default Traka Directories:
✓ C:\ProgramData\Traka\Business Engine\Logs - Found
✓ C:\ProgramData\Traka\Comms Engine\Logs - Found
✗ C:\Logs - Not found

Custom Directories:
📁 D:\MyCustomLogs
📁 \\NetworkShare\TrakaLogs

[Add Custom Directory]

☑ Automatically scan for logs on startup
☐ Watch directories for new log files (real-time monitoring)
```

#### 3. Real-Time Directory Monitoring

Enable **"Watch directories for new log files"** in settings to:
- Get notifications when new log files appear
- Automatically load new logs (optional)
- Monitor multiple directories simultaneously

#### 4. Native File Dialogs

- Use Windows native file picker
- Multi-select files easily
- Browse network drives and external storage

## Configuration

### Settings → Log Directory Configuration

- **Default Traka Directories**: Shows which standard paths exist on your system
- **Custom Directories**: Add your own log locations
- **Auto-scan on Startup**: Automatically scan when app opens (recommended)
- **Watch Directories**: Enable real-time file monitoring

### Saving Configuration

All settings are saved automatically:
- Custom directory paths
- Auto-scan preferences
- Watch directory settings
- All previous settings (detection, display options, etc.)

## Usage Tips

### Best Practices

1. **First Time Setup**:
   - Run "Scan Traka Directories" to find your logs
   - Add any custom directories you use
   - Enable "Auto-scan on startup" for convenience

2. **Daily Use**:
   - Open the app - it auto-scans on startup
   - Select the files you need from the discovery modal
   - Use Live Tail for active monitoring

3. **Troubleshooting**:
   - If scan finds nothing, check Settings → Log Directory Configuration
   - Verify the default paths match your Traka installation
   - Add custom directories if logs are elsewhere

### Keyboard Shortcuts

Same as Web version:
- `Enter` - Next search match
- `Shift + Enter` - Previous search match
- `Escape` - Clear search

## Technical Details

### Architecture

```
┌─────────────────────────────────────────┐
│           Electron Main Process          │
│  - File system access (Node.js fs)      │
│  - Directory scanning & watching         │
│  - IPC handlers                          │
└─────────────────┬───────────────────────┘
                  │ IPC Communication
                  │ (Secure contextBridge)
┌─────────────────▼───────────────────────┐
│        Renderer Process (Web UI)        │
│  - All existing web functionality       │
│  - Electron API integration             │
│  - Same HTML/CSS/JavaScript             │
└─────────────────────────────────────────┘
```

### Security

- **Context Isolation**: Enabled for security
- **No Node Integration**: Renderer is sandboxed
- **contextBridge**: Secure IPC communication
- **Limited API Surface**: Only necessary functions exposed

### File Watching

Uses `chokidar` library for:
- Cross-platform file watching
- Stable event handling
- Atomic write support
- Minimal CPU usage

## Development

### Project Structure

```
TrakaLogAnalyzer-WebPoC/
├── main.js              # Electron main process
├── preload.js           # Secure IPC bridge
├── index.html           # Application UI
├── package.json         # Dependencies & build config
├── css/
│   └── styles.css       # Styling (with Electron additions)
├── js/
│   └── app.js           # Application logic (with Electron integration)
└── img/
    ├── trakaweb-logo.png
    └── TW Logo NEW.png
```

### Running in Development

```bash
npm start          # Run with Electron
npm run dev        # Run with DevTools open
```

### Building Installer

```bash
npm run build      # Build for all platforms
npm run build:win  # Build Windows installer only
```

Output: `dist/Traka Log Analyzer Setup 3.0.0.exe`

### Debugging

1. Run with `npm run dev` to open DevTools automatically
2. Main process logs: Console output
3. Renderer process: DevTools Console
4. IPC communication: Check both consoles

## Compatibility

- **Operating System**: Windows 10/11 (64-bit)
- **Electron**: v33.x
- **Node.js**: v20+ (bundled with Electron)
- **File Formats**: .log, .txt, .cfg

## Troubleshooting

### App Won't Start

1. Check Node.js is installed: `node --version`
2. Reinstall dependencies: `rm -rf node_modules && npm install`
3. Check for errors in terminal output

### Directory Scan Finds Nothing

1. Open Settings → Log Directory Configuration
2. Verify default paths match your Traka installation
3. Check paths exist in File Explorer
4. Add custom directories if needed

### Files Won't Load

1. Check file permissions (read access required)
2. Verify file size isn't too large (>100MB may be slow)
3. Check file encoding is UTF-8 or ASCII
4. Try "Browse Files" button to manually select

### Performance Issues

1. Close unused files
2. Disable "Watch directories" if not needed
3. Reduce Live Tail refresh rate in settings
4. Clear old logs from Traka directories

## Migration from Web Version

The Desktop Edition is **100% compatible** with the Web version:

✅ All features work exactly the same  
✅ Settings are preserved (stored separately)  
✅ Same keyboard shortcuts  
✅ Same UI and workflow  
✅ Can use both versions side-by-side  

**Key Differences**:
- Desktop version runs as installed app (not in browser)
- Desktop version has automatic log discovery
- Desktop version can access file system without prompts
- Web version still works for basic drag-and-drop usage

## Support

For issues or questions:
1. Check this documentation
2. Review Troubleshooting section
3. Check console logs for errors
4. Contact Traka support team

## Version History

### v3.0.0 - Desktop Edition (2024-01-24)
- ✨ NEW: Electron-based desktop application
- ✨ NEW: Automatic Traka log directory scanning
- ✨ NEW: Custom directory configuration
- ✨ NEW: Real-time directory monitoring
- ✨ NEW: Native file picker dialogs
- ✨ NEW: No permission dialogs for file access
- ✅ All v2.1 features preserved and working

### v2.1.0 - Web PoC (Previous)
- Live Tail monitoring
- Log stitching
- Time synchronization
- Compare mode enhancements
- Analytics dashboard

## License

Internal Traka Tool - For authorized use only

---

**Traka Log Analyzer Desktop Edition v3.0**  
*Advanced log analysis with automatic discovery*
