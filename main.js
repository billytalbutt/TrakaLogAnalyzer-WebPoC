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

// Detect installer mode (--setup flag)
const IS_SETUP_MODE = process.argv.includes('--setup');

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
    if (IS_SETUP_MODE) {
        createInstallerWindow();
        return;
    }
    
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

/**
 * Create the installer/setup wizard window.
 * Shown when the app is launched with --setup flag.
 * Provides a gorgeous dark-themed installation wizard.
 */
function createInstallerWindow() {
    mainWindow = new BrowserWindow({
        width: 820,
        height: 560,
        resizable: false,
        frame: false,
        icon: path.join(__dirname, 'img/trakaweb-logo.png'),
        backgroundColor: '#0d0f12',
        webPreferences: {
            preload: path.join(__dirname, 'installer-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'installer.html'));
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(() => {
    createWindow();
    
    // Register installer IPC handlers when in setup mode
    if (IS_SETUP_MODE) {
        registerInstallerHandlers();
    }

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
// Installer IPC Handlers (setup mode only)
// ============================================

function registerInstallerHandlers() {
    const { execSync, exec: execCb } = require('child_process');
    const APP_NAME = 'Traka Log Analyzer';
    const APP_VERSION = '3.0.0';
    const APP_EXE_NAME = 'Traka Log Analyzer.exe';
    const PUBLISHER = 'Traka - ASSA ABLOY';
    const UNINSTALL_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\TrakaLogAnalyzer';
    const sourceDir = path.dirname(process.execPath); // Where we're running from
    
    ipcMain.handle('minimize-window', () => { mainWindow.minimize(); });
    ipcMain.handle('close-window', () => { app.quit(); });
    
    ipcMain.handle('browse-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Installation Directory',
            defaultPath: 'C:\\Program Files'
        });
        return (!result.canceled && result.filePaths.length > 0) ? result.filePaths[0] : null;
    });
    
    ipcMain.handle('get-disk-space', async (event, drive) => {
        try {
            const output = execSync(
                `wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`,
                { encoding: 'utf-8', windowsHide: true }
            );
            const match = output.match(/FreeSpace=(\d+)/);
            return match ? parseInt(match[1]) : null;
        } catch { return null; }
    });
    
    ipcMain.handle('install', async (event, options) => {
        const { installPath, desktopShortcut, startMenuShortcut } = options;
        
        try {
            // Step 1: Create install directory
            sendInstallerProgress(5, 'Creating installation directory...', 'Creating: ' + installPath);
            await fs.mkdir(installPath, { recursive: true });
            sendInstallerProgress(10, 'Directory created');
            
            // Step 2: Copy application files using robocopy (handles large dirs efficiently)
            sendInstallerProgress(15, 'Copying application files...', 'Copying files from source...');
            
            await new Promise((resolve, reject) => {
                const robocopy = `robocopy "${sourceDir}" "${installPath}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`;
                execCb(robocopy, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                    // robocopy exit codes: 0-7 are success, 8+ are errors
                    const exitCode = error ? error.code || 0 : 0;
                    if (exitCode >= 8) {
                        reject(new Error(`File copy failed (robocopy exit code ${exitCode})`));
                    } else {
                        resolve();
                    }
                });
            });
            
            sendInstallerProgress(65, 'Files copied successfully', 'Application files installed', 'success');
            
            // Step 3: Clean up installer-specific files from install dir
            sendInstallerProgress(68, 'Cleaning up...');
            const cleanupFiles = ['installer.html', 'installer-preload.js'];
            for (const file of cleanupFiles) {
                try { await fs.unlink(path.join(installPath, file)); } catch {}
            }
            
            // Step 4: Create shortcuts
            if (desktopShortcut) {
                sendInstallerProgress(72, 'Creating Desktop shortcut...', 'Creating Desktop shortcut...');
                const desktopPath = path.join(process.env.USERPROFILE, 'Desktop');
                await createShortcutPS(
                    path.join(installPath, APP_EXE_NAME),
                    path.join(desktopPath, `${APP_NAME}.lnk`),
                    installPath
                );
                sendInstallerProgress(78, 'Desktop shortcut created', 'Desktop shortcut created', 'success');
            }
            
            if (startMenuShortcut) {
                sendInstallerProgress(80, 'Creating Start Menu entry...', 'Creating Start Menu entry...');
                const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Traka');
                await fs.mkdir(startMenuDir, { recursive: true });
                await createShortcutPS(
                    path.join(installPath, APP_EXE_NAME),
                    path.join(startMenuDir, `${APP_NAME}.lnk`),
                    installPath
                );
                sendInstallerProgress(85, 'Start Menu entry created', 'Start Menu entry created', 'success');
            }
            
            // Step 5: Register in Windows Add/Remove Programs
            sendInstallerProgress(88, 'Registering application...', 'Adding to Windows Programs...');
            const uninstallScript = path.join(installPath, 'uninstall.cmd');
            const regCmds = [
                `reg add "${UNINSTALL_REG_KEY}" /v "DisplayName" /t REG_SZ /d "${APP_NAME}" /f`,
                `reg add "${UNINSTALL_REG_KEY}" /v "DisplayVersion" /t REG_SZ /d "${APP_VERSION}" /f`,
                `reg add "${UNINSTALL_REG_KEY}" /v "Publisher" /t REG_SZ /d "${PUBLISHER}" /f`,
                `reg add "${UNINSTALL_REG_KEY}" /v "InstallLocation" /t REG_SZ /d "${installPath}" /f`,
                `reg add "${UNINSTALL_REG_KEY}" /v "UninstallString" /t REG_SZ /d "\\"${uninstallScript}\\"" /f`,
                `reg add "${UNINSTALL_REG_KEY}" /v "NoModify" /t REG_DWORD /d 1 /f`,
                `reg add "${UNINSTALL_REG_KEY}" /v "NoRepair" /t REG_DWORD /d 1 /f`,
            ];
            for (const cmd of regCmds) {
                try { execSync(cmd, { windowsHide: true }); } catch {}
            }
            sendInstallerProgress(92, 'Application registered', 'Added to Programs & Features', 'success');
            
            // Step 6: Create uninstall script
            sendInstallerProgress(95, 'Creating uninstaller...', 'Creating uninstaller...');
            const uninstallLines = [
                '@echo off',
                `echo Uninstalling ${APP_NAME}...`,
                desktopShortcut ? `del /f /q "%USERPROFILE%\\Desktop\\${APP_NAME}.lnk" 2>nul` : '',
                startMenuShortcut ? `rmdir /s /q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Traka" 2>nul` : '',
                `reg delete "${UNINSTALL_REG_KEY}" /f 2>nul`,
                `cd /d "%TEMP%"`,
                `rmdir /s /q "${installPath}" 2>nul`,
                'echo Uninstall complete.',
                'pause'
            ].filter(Boolean);
            await fs.writeFile(uninstallScript, uninstallLines.join('\r\n'), 'utf-8');
            sendInstallerProgress(98, 'Uninstaller created', 'Uninstaller created', 'success');
            
            sendInstallerProgress(100, 'Installation complete!', 'Installation completed successfully!', 'success');
            return { success: true, installPath };
        } catch (error) {
            sendInstallerProgress(0, 'Installation failed', 'ERROR: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    });
    
    ipcMain.handle('finish', async (event, options) => {
        if (options.launch) {
            const installPath = options.installPath;
            if (installPath) {
                const exePath = path.join(installPath, APP_EXE_NAME);
                if (fsSync.existsSync(exePath)) {
                    execCb(`start "" "${exePath}"`, { cwd: installPath, windowsHide: true });
                }
            }
        }
        setTimeout(() => app.quit(), 800);
    });
    
    function sendInstallerProgress(percent, status, log, logType) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('install-progress', { percent, status, log, logType });
        }
    }
    
    function createShortcutPS(targetPath, shortcutPath, workingDir) {
        return new Promise((resolve, reject) => {
            const ps = [
                `$ws = New-Object -ComObject WScript.Shell`,
                `$sc = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')`,
                `$sc.TargetPath = '${targetPath.replace(/'/g, "''")}' `,
                `$sc.WorkingDirectory = '${workingDir.replace(/'/g, "''")}' `,
                `$sc.Description = '${APP_NAME}'`,
                `$sc.Save()`
            ].join('; ');
            execCb(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true }, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}

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
    
    // Check all directories in parallel for faster discovery
    const existChecks = await Promise.all(
        DEFAULT_LOG_PATHS.map(async (dirPath) => ({
            dirPath,
            exists: await directoryExists(dirPath)
        }))
    );
    
    // Scan all accessible directories in parallel
    const scanPromises = existChecks
        .filter(({ exists }) => exists)
        .map(async ({ dirPath }) => {
            console.log(`[LogDiscovery] Scanning: ${dirPath}`);
            const files = await scanDirectory(dirPath);
            console.log(`[LogDiscovery]   Raw file count: ${files.length}`);
            return { dirPath, files };
        });
    
    const scanResults = await Promise.all(scanPromises);
    
    for (const { dirPath, files } of scanResults) {
        accessiblePaths.push(dirPath);
        
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
/**
 * Maximum file size to read in full (10 MB).
 * Files larger than this are tail-read: we keep the first 500 lines
 * (header/startup context) plus the last MAX_READ_BYTES worth of content.
 * This prevents multi-minute blocking reads on VMs with slow I/O.
 */
const MAX_READ_BYTES = 10 * 1024 * 1024; // 10 MB
const HEADER_LINES_TO_KEEP = 500;
const READ_TIMEOUT_MS = 30000; // 30 second timeout per file

async function readLogFile(filePath) {
    try {
        const stats = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        const startTime = Date.now();
        
        let content;
        let wasTruncated = false;
        
        if (stats.size > MAX_READ_BYTES) {
            // Large file — read with smart truncation
            console.log(`[ReadFile] ${fileName}: Large file (${(stats.size / 1024 / 1024).toFixed(1)} MB), using smart read...`);
            content = await readLargeFile(filePath, stats.size);
            wasTruncated = true;
        } else {
            // Normal file — read in full with timeout
            content = await Promise.race([
                fs.readFile(filePath, 'utf-8'),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Read timed out after ${READ_TIMEOUT_MS / 1000}s`)), READ_TIMEOUT_MS)
                )
            ]);
        }
        
        // Strip BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }
        
        // Detect if file might be UTF-16: if content length is suspiciously small
        // compared to byte size, or if content has lots of null characters
        const nullCount = (content.match(/\0/g) || []).length;
        const contentRatio = content.length / stats.size;
        
        if (nullCount > content.length * 0.1 || (stats.size > 1000 && contentRatio < 0.3)) {
            console.log(`[ReadFile] ${fileName}: UTF-8 looks wrong (nulls: ${nullCount}, ratio: ${contentRatio.toFixed(2)}), trying UTF-16LE...`);
            if (stats.size > MAX_READ_BYTES) {
                content = await readLargeFile(filePath, stats.size, 'utf16le');
            } else {
                content = await fs.readFile(filePath, 'utf16le');
            }
            // Strip BOM if present
            if (content.charCodeAt(0) === 0xFEFF) {
                content = content.slice(1);
            }
        }
        
        // Log diagnostic info
        const elapsed = Date.now() - startTime;
        const firstLine = content.split('\n')[0].substring(0, 100);
        const lineCount = content.split('\n').length;
        console.log(`[ReadFile] ${fileName}: ${stats.size} bytes on disk, ${content.length} chars read, ${lineCount} lines, ${elapsed}ms${wasTruncated ? ' (truncated)' : ''}`);
        console.log(`[ReadFile]   First line: ${firstLine}`);
        
        return {
            success: true,
            content: content,
            name: fileName,
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            truncated: wasTruncated
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
 * Smart read for large log files.
 * Reads the first HEADER_LINES_TO_KEEP lines (for startup context) and
 * the last MAX_READ_BYTES of the file (the most recent/relevant entries).
 * Uses streaming to avoid loading the entire file into memory.
 */
async function readLargeFile(filePath, fileSize, encoding = 'utf-8') {
    const { open } = require('fs').promises;
    const nodeFs = require('fs');

    // Read the tail of the file (most recent entries — what engineers care about)
    const tailStart = Math.max(0, fileSize - MAX_READ_BYTES);
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Large file read timed out after ${READ_TIMEOUT_MS / 1000}s`));
        }, READ_TIMEOUT_MS);
        
        const chunks = [];
        const stream = nodeFs.createReadStream(filePath, {
            encoding: encoding,
            start: tailStart,
            highWaterMark: 256 * 1024 // 256 KB chunks for efficient I/O
        });
        
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
            clearTimeout(timeout);
            let tailContent = chunks.join('');
            
            // If we started mid-file, skip the first partial line
            if (tailStart > 0) {
                const firstNewline = tailContent.indexOf('\n');
                if (firstNewline > -1) {
                    tailContent = tailContent.substring(firstNewline + 1);
                }
                // Add a marker so the user knows content was truncated
                tailContent = `[... File truncated: showing last ${(MAX_READ_BYTES / 1024 / 1024).toFixed(0)} MB of ${(fileSize / 1024 / 1024).toFixed(1)} MB — use Live Tail for full real-time view ...]\n` + tailContent;
            }
            
            resolve(tailContent);
        });
        stream.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Read multiple log files in parallel batches.
 * Reads up to 3 files concurrently for faster loading on slow I/O.
 */
async function readMultipleLogFiles(filePaths) {
    const BATCH_SIZE = 3;
    const results = [];
    
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
        const batch = filePaths.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(filePath => readLogFile(filePath))
        );
        results.push(...batchResults);
    }
    
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
