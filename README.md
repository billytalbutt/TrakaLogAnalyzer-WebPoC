# Traka Log Analyzer - Web PoC

A powerful log analysis tool for TrakaWEB and Traka Integration Engine log files. Part of the Traka Tools Suite.

![Traka Log Analyzer](img/trakaweb-logo.png)

## Features

### 📁 Multi-File Support
- Load multiple log files simultaneously
- Drag & drop file loading
- Support for .log and .txt files

### 🔍 Advanced Search
- Real-time search with match highlighting
- Regex pattern support (use `/pattern/` syntax)
- Navigate between matches with keyboard shortcuts

### 🔬 Filtering
- Filter by log level (Error, Warning, Info, Debug)
- Date/time range filtering
- Combine multiple filters

### 📊 Side-by-Side Comparison
- Compare multiple log files simultaneously
- Synchronized scrolling
- Highlight unique/different lines

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

## Getting Started

1. Open `index.html` in a modern web browser
2. Drag and drop log files or click to browse
3. Use the navigation menu to:
   - **Home**: Overview and quick stats
   - **Log Viewer**: Detailed log analysis
   - **Compare**: Side-by-side file comparison
   - **Issues**: View all detected problems
   - **Settings**: Configure detection patterns

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

## License

Internal Traka Tool - For authorized use only.
