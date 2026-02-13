/* ============================================
   Traka Log Analyzer - Desktop Edition
   Electron Main Process
   ============================================ */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const chokidar = require('chokidar');

// Keep a global reference of the window object
let mainWindow;
let fileWatchers = new Map();
let fileTailWatchers = new Map(); // Per-file watchers for live tail

// Default Traka log file locations (exact paths that never change)
const DEFAULT_LOG_PATHS = [
    'C:\\Program Files\\Traka\\Traka Business Engine Service\\Support\\Logs',
    'C:\\Program Files\\Traka\\Traka Comms Engine Service\\Support\\Logs',
    'C:\\inetpub\\wwwroot\\TrakaWeb\\App_Data\\Support\\Logs',
    'C:\\ProgramData\\Traka\\Logs' // Integration Engine + all integration packages
];

// ============================================
// Window Management
// ============================================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        icon: path.join(__dirname, 'img/trakaweb-logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        show: false, // Don't show until ready
        backgroundColor: '#0a0e1a'
    });

    // Load the index.html
    mainWindow.loadFile('index.html');

    // Show window when ready to prevent flashing
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development mode
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Clean up watchers
        fileWatchers.forEach(watcher => watcher.close());
        fileWatchers.clear();
        fileTailWatchers.forEach(watcher => watcher.close());
        fileTailWatchers.clear();
    });
}

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ============================================
// File System Operations
// ============================================

/**
 * Check if a directory exists and is accessible
 */
async function directoryExists(dirPath) {
    try {
        const stats = await fs.stat(dirPath);
        return stats.isDirectory();
    } catch (error) {
        return false;
    }
}

/**
 * Scan directory for log files.
 * @param {string} dirPath - Directory path to scan
 * @param {string[]} extensions - File extensions to include
 * @param {boolean} recursive - Whether to scan subdirectories (default: false)
 *   Set to false for default Traka paths — the active log is always directly
 *   in the Logs folder; subdirectories contain old archives that should be skipped.
 */
async function scanDirectory(dirPath, extensions = ['.log', '.txt', '.cfg'], recursive = false) {
    const results = [];
    
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory() && recursive) {
                // Only recurse if explicitly requested
                const subResults = await scanDirectory(fullPath, extensions, true);
                results.push(...subResults);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (extensions.includes(ext)) {
                    const stats = await fs.stat(fullPath);
                    results.push({
                        name: entry.name,
                        path: fullPath,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        directory: dirPath
                    });
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
    }
    
    return results;
}

/**
 * Categorize Integration Engine logs by type
 * Returns the newest log of each type found in the Integration folder
 */
function categorizeAndFilterLogs(files, directory) {
    // Determine directory type
    const dirLower = directory.toLowerCase();
    
    // For Integration Engine directory (C:\ProgramData\Traka\Logs)
    // Contains multiple log types - categorize and get newest of each
    if (dirLower.includes('programdata') && dirLower.includes('traka') && dirLower.includes('logs')) {
        const categories = {
            integrationEngine: [],
            integrationMonitor: [],
            activeDirectory: [],
            sipass: [],
            postbox: [],
            symmetry: [],
            onguard: [],
            lenel: [],
            ccure: [],
            other: []
        };
        
        files.forEach(file => {
            const lowerName = file.name.toLowerCase();
            
            // Integration Monitor (monitoring service)
            if (lowerName.includes('monitor')) {
                categories.integrationMonitor.push(file);
            }
            // Active Directory integration
            else if (lowerName.includes('activedirectory') || lowerName.includes('active_directory') || 
                     (lowerName.includes('ad') && !lowerName.includes('read'))) {
                categories.activeDirectory.push(file);
            }
            // SiPass integration
            else if (lowerName.includes('sipass')) {
                categories.sipass.push(file);
            }
            // PostBox integration
            else if (lowerName.includes('postbox')) {
                categories.postbox.push(file);
            }
            // Symmetry integration
            else if (lowerName.includes('symmetry')) {
                categories.symmetry.push(file);
            }
            // OnGuard integration
            else if (lowerName.includes('onguard')) {
                categories.onguard.push(file);
            }
            // Lenel integration
            else if (lowerName.includes('lenel')) {
                categories.lenel.push(file);
            }
            // CCure integration
            else if (lowerName.includes('ccure')) {
                categories.ccure.push(file);
            }
            // Integration Engine service (main logs)
            else if (lowerName.includes('integration') || lowerName.includes('engine')) {
                categories.integrationEngine.push(file);
            }
            // Unknown/other logs
            else {
                categories.other.push(file);
            }
        });
        
        // Sort each category by modification date (newest first) and take only the newest
        console.log(`[LogDiscovery] Integration directory: ${directory}`);
        const newestLogs = [];
        Object.keys(categories).forEach(key => {
            if (categories[key].length > 0) {
                // Sort by modification date descending (newest first)
                categories[key].sort((a, b) => 
                    new Date(b.modified) - new Date(a.modified)
                );
                
                // Take the newest (first) from this category
                const newest = categories[key][0];
                newest.category = key; // Tag with category for UI display
                newestLogs.push(newest);
                
                console.log(`[LogDiscovery]   ${key}: ${categories[key].length} file(s), selected: ${newest.name} (modified: ${newest.modified})`);
            }
        });
        
        return newestLogs;
    }
    
    // For Business Engine, Comms Engine, TrakaWEB - just get the newest log
    else {
        if (files.length === 0) return [];
        
        // Sort by modification date descending (newest first)
        files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
        
        // Log all candidates and which one was selected
        console.log(`[LogDiscovery] Directory: ${directory}`);
        console.log(`[LogDiscovery]   Found ${files.length} file(s):`);
        files.forEach((f, i) => {
            const marker = i === 0 ? ' ★ SELECTED (newest)' : '';
            console.log(`[LogDiscovery]   ${i + 1}. ${f.name}  (modified: ${f.modified}, size: ${f.size} bytes)${marker}`);
        });
        
        // Return only the newest log
        return [files[0]];
    }
}

/**
 * Scan all default Traka log locations
 */
async function scanTrakaLogDirectories() {
    const categorizedFiles = [];
    const accessiblePaths = [];
    
    for (const dirPath of DEFAULT_LOG_PATHS) {
        const exists = await directoryExists(dirPath);
        console.log(`[LogDiscovery] Checking: ${dirPath} → ${exists ? 'EXISTS' : 'NOT FOUND'}`);
        if (exists) {
            accessiblePaths.push(dirPath);
            const files = await scanDirectory(dirPath);
            console.log(`[LogDiscovery]   Raw file count: ${files.length}`);
            
            // Categorize and filter to newest logs only
            const filteredFiles = categorizeAndFilterLogs(files, dirPath);
            
            // Add directory label for UI display
            filteredFiles.forEach(file => {
                if (dirPath.includes('Business Engine')) {
                    file.engineType = 'Business Engine';
                } else if (dirPath.includes('Comms Engine')) {
                    file.engineType = 'Comms Engine';
                } else if (dirPath.includes('TrakaWeb')) {
                    file.engineType = 'TrakaWEB';
                } else if (dirPath.includes('ProgramData')) {
                    // Integration Engine logs - already have category tag
                    if (file.category === 'integrationEngine') {
                        file.engineType = 'Integration Engine Service';
                    } else if (file.category === 'integrationMonitor') {
                        file.engineType = 'Integration Monitor';
                    } else if (file.category === 'activeDirectory') {
                        file.engineType = 'Active Directory Integration';
                    } else if (file.category === 'sipass') {
                        file.engineType = 'SiPass Integration';
                    } else if (file.category === 'postbox') {
                        file.engineType = 'PostBox Integration';
                    } else if (file.category === 'symmetry') {
                        file.engineType = 'Symmetry Integration';
                    } else if (file.category === 'onguard') {
                        file.engineType = 'OnGuard Integration';
                    } else if (file.category === 'lenel') {
                        file.engineType = 'Lenel Integration';
                    } else if (file.category === 'ccure') {
                        file.engineType = 'CCure Integration';
                    } else {
                        file.engineType = 'Integration Log';
                    }
                }
            });
            
            categorizedFiles.push(...filteredFiles);
        }
    }
    
    return {
        files: categorizedFiles,
        scannedPaths: accessiblePaths,
        totalFiles: categorizedFiles.length
    };
}

/**
 * Read a file's contents.
 * Tries UTF-8 first; if the result looks garbled or too short compared to
 * file size on disk, falls back to UTF-16LE (common for .NET apps on Windows).
 */
async function readLogFile(filePath) {
    try {
        const stats = await fs.stat(filePath);
        
        // Try UTF-8 first (most common)
        let content = await fs.readFile(filePath, 'utf-8');
        
        // Strip BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }
        
        // Detect if file might be UTF-16: if content length is suspiciously small
        // compared to byte size, or if content has lots of null characters
        const nullCount = (content.match(/\0/g) || []).length;
        const contentRatio = content.length / stats.size;
        
        if (nullCount > content.length * 0.1 || (stats.size > 1000 && contentRatio < 0.3)) {
            console.log(`[ReadFile] ${path.basename(filePath)}: UTF-8 looks wrong (nulls: ${nullCount}, ratio: ${contentRatio.toFixed(2)}), trying UTF-16LE...`);
            content = await fs.readFile(filePath, 'utf16le');
            // Strip BOM if present
            if (content.charCodeAt(0) === 0xFEFF) {
                content = content.slice(1);
            }
        }
        
        // Log diagnostic info
        const firstLine = content.split('\n')[0].substring(0, 100);
        const lineCount = content.split('\n').length;
        console.log(`[ReadFile] ${path.basename(filePath)}: ${stats.size} bytes on disk, ${content.length} chars read, ${lineCount} lines, modified: ${stats.mtime.toISOString()}`);
        console.log(`[ReadFile]   First line: ${firstLine}`);
        
        return {
            success: true,
            content: content,
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
        };
    } catch (error) {
        console.error(`[ReadFile] ERROR reading ${filePath}: ${error.message}`);
        return {
            success: false,
            error: error.message,
            path: filePath
        };
    }
}

/**
 * Read multiple log files in batch
 */
async function readMultipleLogFiles(filePaths) {
    const results = await Promise.all(
        filePaths.map(filePath => readLogFile(filePath))
    );
    
    return results;
}

// ============================================
// File Watching
// ============================================

/**
 * Start watching a directory for changes
 */
function startWatchingDirectory(dirPath, watcherId) {
    // Stop existing watcher if present
    if (fileWatchers.has(watcherId)) {
        fileWatchers.get(watcherId).close();
    }
    
    const watcher = chokidar.watch(dirPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    });
    
    watcher
        .on('add', filePath => {
            const ext = path.extname(filePath).toLowerCase();
            if (['.log', '.txt', '.cfg'].includes(ext)) {
                mainWindow?.webContents.send('file-added', {
                    path: filePath,
                    name: path.basename(filePath),
                    directory: dirPath
                });
            }
        })
        .on('change', filePath => {
            const ext = path.extname(filePath).toLowerCase();
            if (['.log', '.txt', '.cfg'].includes(ext)) {
                mainWindow?.webContents.send('file-changed', {
                    path: filePath,
                    name: path.basename(filePath),
                    directory: dirPath
                });
            }
        })
        .on('unlink', filePath => {
            mainWindow?.webContents.send('file-removed', {
                path: filePath,
                name: path.basename(filePath)
            });
        })
        .on('error', error => {
            console.error(`Watcher error for ${dirPath}:`, error);
        });
    
    fileWatchers.set(watcherId, watcher);
    
    return {
        success: true,
        watcherId: watcherId,
        path: dirPath
    };
}

/**
 * Stop watching a directory
 */
function stopWatchingDirectory(watcherId) {
    if (fileWatchers.has(watcherId)) {
        fileWatchers.get(watcherId).close();
        fileWatchers.delete(watcherId);
        return { success: true, watcherId };
    }
    return { success: false, error: 'Watcher not found' };
}

// ============================================
// IPC Handlers
// ============================================

// Scan for Traka log files
ipcMain.handle('scan-traka-logs', async () => {
    try {
        const result = await scanTrakaLogDirectories();
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Scan a custom directory (recursive, since the user explicitly chose it)
ipcMain.handle('scan-directory', async (event, dirPath) => {
    try {
        if (await directoryExists(dirPath)) {
            const files = await scanDirectory(dirPath, ['.log', '.txt', '.cfg'], true);
            return { success: true, files, path: dirPath };
        }
        return { success: false, error: 'Directory not found or not accessible' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Read a single log file
ipcMain.handle('read-log-file', async (event, filePath) => {
    return await readLogFile(filePath);
});

// Read multiple log files
ipcMain.handle('read-multiple-files', async (event, filePaths) => {
    return await readMultipleLogFiles(filePaths);
});

// Show directory picker dialog
ipcMain.handle('show-directory-picker', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Log Directory'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
    }
    return { success: false, canceled: true };
});

// Show file picker dialog
ipcMain.handle('show-file-picker', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Log Files', extensions: ['log', 'txt', 'cfg'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        title: 'Select Log Files'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, paths: result.filePaths };
    }
    return { success: false, canceled: true };
});

// Start watching a directory
ipcMain.handle('start-watching', async (event, dirPath) => {
    try {
        if (await directoryExists(dirPath)) {
            const watcherId = `watcher_${Date.now()}`;
            return startWatchingDirectory(dirPath, watcherId);
        }
        return { success: false, error: 'Directory not found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Stop watching a directory
ipcMain.handle('stop-watching', async (event, watcherId) => {
    return stopWatchingDirectory(watcherId);
});

// Get default log paths
ipcMain.handle('get-default-paths', async () => {
    const paths = [];
    for (const dirPath of DEFAULT_LOG_PATHS) {
        const exists = await directoryExists(dirPath);
        paths.push({
            path: dirPath,
            exists: exists,
            accessible: exists
        });
    }
    return { success: true, paths };
});

// Check if path exists
ipcMain.handle('check-path-exists', async (event, dirPath) => {
    const exists = await directoryExists(dirPath);
    return { success: true, exists };
});

// ============================================
// Live Tail - Read file from byte offset
// ============================================

/**
 * Read new content from a file starting at a byte offset.
 * Returns the new content and the new byte offset.
 */
ipcMain.handle('tail-file', async (event, filePath, fromByte) => {
    try {
        const stats = await fs.stat(filePath);
        const fileSize = stats.size;
        
        if (fileSize <= fromByte) {
            // No new content (file may have been truncated or unchanged)
            if (fileSize < fromByte) {
                // File was truncated/rotated - reset and read from start
                const content = await fs.readFile(filePath, 'utf-8');
                return {
                    success: true,
                    newContent: content,
                    newOffset: fileSize,
                    wasReset: true
                };
            }
            return { success: true, newContent: '', newOffset: fromByte, wasReset: false };
        }
        
        // Read only the new bytes from the offset
        const fd = await fs.open(filePath, 'r');
        try {
            const bytesToRead = fileSize - fromByte;
            const buffer = Buffer.alloc(bytesToRead);
            await fd.read(buffer, 0, bytesToRead, fromByte);
            const newContent = buffer.toString('utf-8');
            
            console.log(`[tail-file] ${path.basename(filePath)}: +${bytesToRead} bytes (${fromByte} -> ${fileSize})`);
            
            return {
                success: true,
                newContent: newContent,
                newOffset: fileSize,
                wasReset: false
            };
        } finally {
            await fd.close();
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ============================================
// Live Tail - Per-file watching
// ============================================

/**
 * Start watching a specific file for changes and push updates via IPC.
 * Uses chokidar to detect writes and sends 'file-tail-update' events.
 */
ipcMain.handle('start-tail-watch', async (event, filePath) => {
    try {
        // Check file exists
        const stats = await fs.stat(filePath);
        
        // Stop existing watcher for this file if present
        if (fileTailWatchers.has(filePath)) {
            fileTailWatchers.get(filePath).close();
        }
        
        let lastSize = stats.size;
        
        const watcher = chokidar.watch(filePath, {
            persistent: true,
            ignoreInitial: true,
            usePolling: true,        // Use polling for reliable detection on Windows
            interval: 500,           // Poll every 500ms for responsive tail
            awaitWriteFinish: false   // Don't wait for writes to finish - we want real-time
        });
        
        watcher.on('change', async (changedPath) => {
            try {
                const currentStats = await fs.stat(changedPath);
                const currentSize = currentStats.size;
                
                if (currentSize > lastSize) {
                    // Read only the new bytes
                    const fd = await fs.open(changedPath, 'r');
                    try {
                        const bytesToRead = currentSize - lastSize;
                        const buffer = Buffer.alloc(bytesToRead);
                        await fd.read(buffer, 0, bytesToRead, lastSize);
                        const newContent = buffer.toString('utf-8');
                        
                        lastSize = currentSize;
                        
                        // Push update to renderer
                        mainWindow?.webContents.send('file-tail-update', {
                            path: changedPath,
                            name: path.basename(changedPath),
                            newContent: newContent,
                            newOffset: currentSize
                        });
                    } finally {
                        await fd.close();
                    }
                } else if (currentSize < lastSize) {
                    // File was truncated/rotated - read entire file
                    const content = await fs.readFile(changedPath, 'utf-8');
                    lastSize = currentSize;
                    
                    mainWindow?.webContents.send('file-tail-reset', {
                        path: changedPath,
                        name: path.basename(changedPath),
                        content: content,
                        newOffset: currentSize
                    });
                }
            } catch (err) {
                console.error(`Tail watch error for ${changedPath}:`, err);
            }
        });
        
        watcher.on('error', (error) => {
            console.error(`Tail watcher error for ${filePath}:`, error);
        });
        
        fileTailWatchers.set(filePath, watcher);
        
        return {
            success: true,
            path: filePath,
            currentSize: stats.size
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

/**
 * Stop watching a specific file for tail updates
 */
ipcMain.handle('stop-tail-watch', async (event, filePath) => {
    if (fileTailWatchers.has(filePath)) {
        fileTailWatchers.get(filePath).close();
        fileTailWatchers.delete(filePath);
        return { success: true };
    }
    return { success: false, error: 'No watcher found for this file' };
});

/**
 * Stop all file tail watchers
 */
ipcMain.handle('stop-all-tail-watches', async () => {
    fileTailWatchers.forEach(watcher => watcher.close());
    fileTailWatchers.clear();
    return { success: true };
});

console.log('Traka Log Analyzer - Desktop Edition loaded');
console.log('Main process ready');
