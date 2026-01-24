# Traka Log Analyzer - Desktop Edition v3.0

> **🎉 Now a Desktop Application with Automatic Log Discovery!**

A powerful desktop application for analyzing TrakaWEB and Traka Integration Engine log files. Automatically scans Traka installation directories, monitors logs in real-time, and provides comprehensive analysis tools.

![Traka Log Analyzer](img/trakaweb-logo.png)

## 🆕 What's New in Desktop Edition (v3.0)

### Automatic Log Discovery
- **No more browsing for files!** Click "Scan Traka Directories" to find all logs automatically
- Scans standard Traka installation paths on your system
- Shows file size, modification date, and full path
- Intelligently sorts by engine type (Business → Comms → Integration)

### Desktop Application Benefits
- **No permission dialogs** - Full file system access
- **Custom directory support** - Configure your own log locations  
- **Real-time monitoring** - Watch directories for new files
- **Native file picker** - Windows file dialogs
- **Runs as installed app** - Launch from Start Menu

### All Web Features Preserved
✅ Everything from v2.1 still works perfectly!  
✅ Same UI and workflow  
✅ All existing features intact  

## Features

### 📁 Multi-File Support
- Load multiple log files simultaneously (supports up to 6 files)
- Drag & drop file loading
- Support for .log and .txt files
- Intelligent grid layout for 2-6 files

### 🔴 Live Tail Mode (NEW!)
- **Real-time log monitoring** - Watch log files update live as new entries are written
- **Auto-scroll functionality** - Automatically scrolls to show newest log entries
- **Multi-file tailing** - Monitor multiple log files simultaneously in compare view
- **Configurable refresh rate** - Adjustable polling interval (default: 1 second)
- Works like Notepad++ tail feature or BareTail

### 🔍 Advanced Search
- Real-time search with match highlighting
- Regex pattern support (use `/pattern/` syntax)
- Navigate between matches with keyboard shortcuts

### 🔬 Filtering
- Filter by log level (Error, Warning, Info, Debug)
- Filter by engine type (Business, Comms, Integration)
- Date/time range filtering
- Combine multiple filters

### 📊 Side-by-Side Comparison
- Compare multiple log files simultaneously (2-6 files)
- **Grid layout support** - Automatic 2x2 or 3x2 grid for 4-6 files
- Synchronized scrolling across all panels
- Highlight unique/different lines
- Unified search across all loaded files

### ⚠️ Automatic Issue Detection
Detects common issues including:
- **Critical**: Fatal errors, memory issues, stack overflows
- **Errors**: Exceptions, connection failures, authentication issues
- **Warnings**: Retry attempts, deprecated usage
- **Performance**: Timeouts, slow operations

### 🔧 Traka-Specific Detection
- License issues
- Cabinet communication problems
- Integration engine failures
- Database connectivity issues
- API errors
- Booking conflicts

### ⚙️ Customizable
- Custom regex patterns for issue detection
- Adjustable font size
- Word wrap toggle
- Line numbers toggle
- Configurable tail refresh rate
- Custom log directory paths
- Real-time directory monitoring

## Installation

### Quick Start (Development Mode)

1. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

2. **Run the application**:
   ```bash
   npm start
   ```

The Traka Log Analyzer window will open as a desktop application.

### Build Installer (For Distribution)

To create a Windows installer:

```bash
npm run build:win
```

The installer will be created in the `dist/` folder. Double-click to install, then launch from the Start Menu.

## Getting Started

### Option 1: Automatic Discovery (Recommended)

1. Click **"Scan Traka Directories"** on the home screen
2. Wait while it scans standard Traka installation paths:
   - `C:\ProgramData\Traka\Business Engine\Logs`
   - `C:\ProgramData\Traka\Comms Engine\Logs`  
   - `C:\ProgramData\Traka\Integration Engine\Logs`
   - And more...
3. Select the log files you want to analyze
4. Click **"Load Selected Files"**
5. Start analyzing!

### Option 2: Custom Directory

1. Click **"Custom Directory"**
2. Browse to your log folder
3. Select files from the results

### Option 3: Browse Files or Drag & Drop

- Click **"Browse Files"** to manually select log files
- Or drag and drop .log/.txt files onto the drop zone

## Using the Application

Navigate using the sidebar menu:
   - **Home**: Overview and quick stats
   - **Log Viewer**: Detailed log analysis with live tail
   - **Compare**: Side-by-side file comparison (2-6 files)
   - **Issues**: View all detected problems
   - **Settings**: Configure detection patterns

## Live Tail Usage

### Single File Tail (Log Viewer)
1. Load a log file in the Log Viewer
2. Click the **"Live Tail"** button (refresh icon) in the toolbar
3. The file will be monitored for new content automatically
4. New lines appear at the bottom and auto-scroll is enabled
5. Click **"Stop Tail"** to pause monitoring

### Multi-File Tail (Compare View)
1. Load 2-6 log files
2. Navigate to the **Compare** page
3. Files are displayed in an intelligent grid layout:
   - 2 files: Side-by-side (1x2)
   - 3 files: Three columns (1x3)
   - 4 files: 2x2 grid
   - 5-6 files: 2x3 or 3x2 grid
4. Click **"Live Tail"** to monitor all files simultaneously
5. Enable **"Sync Scroll"** to scroll all panels together

### Tips for Live Tail
- Use the auto-scroll button (down arrow) to toggle automatic scrolling
- Disable auto-scroll if you want to review historical entries
- The tool maintains a buffer of the last 10,000 lines per file
- Live tail works best with actively written log files on your local system

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Next search match |
| `Shift + Enter` | Previous search match |
| `Escape` | Clear search |

## Supported Log Formats

The tool automatically detects common log formats including:
- TrakaWEB application logs
- Traka Integration Engine logs
- Standard .NET log formats
- Custom formats with configurable patterns

## Configuration

### Log Directory Settings

Go to **Settings → Log Directory Configuration** to:

1. **View default Traka paths** - See which standard directories exist on your system
2. **Add custom directories** - Configure your own log locations
3. **Enable auto-scan** - Automatically scan for logs when app starts
4. **Enable directory watching** - Get notified when new log files appear

### Recommended Setup

For the best experience:
1. ✅ Enable **"Automatically scan for logs on startup"**
2. ✅ Add any custom log directories you use
3. ✅ Save your settings

Now every time you open the app, it will automatically find your latest logs!

## Desktop Edition vs Web Version

| Feature | Desktop Edition (v3.0) | Web Version (v2.1) |
|---------|----------------------|-------------------|
| Automatic log discovery | ✅ Yes | ❌ No |
| No permission dialogs | ✅ Yes | ❌ Browser restrictions |
| Custom directory config | ✅ Yes | ❌ No |
| Real-time monitoring | ✅ Yes | ⚠️ Limited |
| Installation required | ✅ Yes | ❌ No |
| All core features | ✅ Yes | ✅ Yes |

**Both versions work great!** Desktop Edition adds convenience features while preserving all functionality.

## System Requirements

- **Operating System**: Windows 10/11 (64-bit)
- **RAM**: 4GB minimum, 8GB recommended
- **Disk Space**: 200MB for application
- **Node.js**: Not required for installed version (bundled with Electron)

## Browser Compatibility (Web Version)

If you prefer to run as a web app (open index.html in browser):
- Chrome 80+
- Firefox 75+
- Edge 80+
- Safari 14+

**Note**: Web version won't have automatic log discovery features.

## Part of Traka Tools Suite

This tool is part of the Traka Tools Suite, which includes:
- Traka SMTP Test Tool
- Traka CSV User Import Tool
- Traka Data Tool
- Traka Key Set Diagnostic Tool
- And more...

## Technical Notes

### Live Tail Implementation
The live tail feature uses browser FileReader API with polling to detect changes. Since browsers don't have direct file system watching capabilities like desktop applications, the tool:
1. Re-reads the file at regular intervals (default: 1 second)
2. Compares file size and content to detect new lines
3. Appends only new content to minimize resource usage
4. Limits memory usage by maintaining a rolling buffer

### Performance Considerations
- Recommended maximum: 6 files in compare view for optimal performance
- Each file in tail mode uses a separate polling interval
- Large files (>50MB) may experience slower refresh rates
- Auto-scroll can be disabled for better performance when reviewing logs

## License

Internal Traka Tool - For authorized use only.
