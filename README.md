# Traka Log Analyzer - Web PoC

A powerful log analysis tool for TrakaWEB and Traka Integration Engine log files. Part of the Traka Tools Suite.

![Traka Log Analyzer](img/trakaweb-logo.png)

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

## Getting Started

1. Open `index.html` in a modern web browser
2. Drag and drop log files or click to browse
3. Use the navigation menu to:
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

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Edge 80+
- Safari 14+

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
