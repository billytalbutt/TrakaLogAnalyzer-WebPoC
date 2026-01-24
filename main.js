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
 * Recursively scan directory for log files
 */
async function scanDirectory(dirPath, extensions = ['.log', '.txt', '.cfg']) {
    const results = [];
    
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subResults = await scanDirectory(fullPath, extensions);
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
            }
        });
        
        return newestLogs;
    }
    
    // For Business Engine, Comms Engine, TrakaWEB - just get the newest log
    else {
        if (files.length === 0) return [];
        
        // Sort by modification date descending (newest first)
        files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
        
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
        if (await directoryExists(dirPath)) {
            accessiblePaths.push(dirPath);
            const files = await scanDirectory(dirPath);
            
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
 * Read a file's contents
 */
async function readLogFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);
        
        return {
            success: true,
            content: content,
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
        };
    } catch (error) {
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

// Scan a custom directory
ipcMain.handle('scan-directory', async (event, dirPath) => {
    try {
        if (await directoryExists(dirPath)) {
            const files = await scanDirectory(dirPath);
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

console.log('Traka Log Analyzer - Desktop Edition loaded');
console.log('Main process ready');
