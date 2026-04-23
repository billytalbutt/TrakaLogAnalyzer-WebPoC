/**
 * Traka Log Analyzer — Custom Installer (Main Process)
 * 
 * This is a standalone Electron app that acts as the installation wizard.
 * It extracts the main application from a bundled archive, creates shortcuts,
 * and registers the app in Windows Add/Remove Programs.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { execSync, exec } = require('child_process');

let mainWindow;

// Paths
const RESOURCES_PATH = process.resourcesPath || path.join(__dirname, '..');
const APP_ARCHIVE = path.join(RESOURCES_PATH, 'app-payload.zip');
const APP_VERSION = '3.0.0';
const APP_NAME = 'Traka Log Analyzer';
const APP_EXE_NAME = 'Traka Log Analyzer.exe';
const PUBLISHER = 'Traka - ASSA ABLOY';
const UNINSTALL_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\TrakaLogAnalyzer';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 820,
        height: 560,
        minWidth: 820,
        minHeight: 560,
        resizable: false,
        frame: false,  // Custom title bar
        icon: path.join(__dirname, '..', 'build', 'icon.ico'),
        backgroundColor: '#0d0f12',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'installer.html'));
    
    // Don't show until ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

// ============================================
// IPC Handlers
// ============================================

ipcMain.handle('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
    app.quit();
});

ipcMain.handle('browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Installation Directory',
        defaultPath: 'C:\\Program Files'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('get-disk-space', async (event, drive) => {
    try {
        const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`, 
            { encoding: 'utf-8' });
        const match = output.match(/FreeSpace=(\d+)/);
        return match ? parseInt(match[1]) : null;
    } catch {
        return null;
    }
});

ipcMain.handle('install', async (event, options) => {
    const { installPath, desktopShortcut, startMenuShortcut } = options;
    
    try {
        // Step 1: Create install directory
        sendProgress(5, 'Creating installation directory...', 'Creating directory: ' + installPath);
        await fsPromises.mkdir(installPath, { recursive: true });
        sendProgress(10, 'Directory created', null);
        
        // Step 2: Extract application files
        sendProgress(15, 'Extracting application files...', 'Extracting application archive...');
        
        // Check if we have the bundled payload
        if (fs.existsSync(APP_ARCHIVE)) {
            await extractZip(APP_ARCHIVE, installPath);
        } else {
            // Dev/fallback: copy from win-unpacked
            const devSource = path.join(__dirname, '..', '..', 'dist', 'win-unpacked');
            if (fs.existsSync(devSource)) {
                sendProgress(20, 'Copying application files...', 'Copying from build output...');
                await copyDirectory(devSource, installPath);
            } else {
                throw new Error('Application payload not found. Ensure the installer was built correctly.');
            }
        }
        
        sendProgress(70, 'Files extracted successfully', 'Application files installed', 'success');
        
        // Step 3: Create shortcuts
        if (desktopShortcut) {
            sendProgress(75, 'Creating Desktop shortcut...', 'Creating Desktop shortcut...');
            await createShortcut(
                path.join(installPath, APP_EXE_NAME),
                path.join(getDesktopPath(), `${APP_NAME}.lnk`),
                installPath
            );
            sendProgress(80, 'Desktop shortcut created', 'Desktop shortcut created', 'success');
        }
        
        if (startMenuShortcut) {
            sendProgress(82, 'Creating Start Menu entry...', 'Creating Start Menu entry...');
            const startMenuDir = path.join(getStartMenuPath(), 'Traka');
            await fsPromises.mkdir(startMenuDir, { recursive: true });
            await createShortcut(
                path.join(installPath, APP_EXE_NAME),
                path.join(startMenuDir, `${APP_NAME}.lnk`),
                installPath
            );
            sendProgress(85, 'Start Menu entry created', 'Start Menu entry created', 'success');
        }
        
        // Step 4: Create uninstaller registry entry
        sendProgress(88, 'Registering application...', 'Adding to Windows Programs...');
        await registerUninstaller(installPath);
        sendProgress(92, 'Application registered', 'Added to Programs & Features', 'success');
        
        // Step 5: Write uninstall script
        sendProgress(94, 'Creating uninstaller...', 'Creating uninstaller...');
        await createUninstallScript(installPath, desktopShortcut, startMenuShortcut);
        sendProgress(98, 'Uninstaller created', 'Uninstaller created', 'success');
        
        sendProgress(100, 'Installation complete!', 'Installation completed successfully!', 'success');
        
        return { success: true };
    } catch (error) {
        sendProgress(0, 'Installation failed', 'ERROR: ' + error.message, 'error');
        return { success: false, error: error.message };
    }
});

ipcMain.handle('finish', async (event, options) => {
    if (options.launch) {
        const installPath = getLastInstallPath();
        if (installPath) {
            const exePath = path.join(installPath, APP_EXE_NAME);
            if (fs.existsSync(exePath)) {
                exec(`start "" "${exePath}"`, { cwd: installPath });
            }
        }
    }
    setTimeout(() => app.quit(), 500);
});

// ============================================
// Helper Functions
// ============================================

function sendProgress(percent, status, log, logType) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-progress', {
            percent,
            status,
            log: log || undefined,
            logType: logType || undefined
        });
    }
}

let lastInstallPath = '';
function getLastInstallPath() { return lastInstallPath; }

async function extractZip(zipPath, destPath) {
    // Use PowerShell's Expand-Archive for reliable extraction
    return new Promise((resolve, reject) => {
        const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`;
        exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) reject(new Error('Failed to extract: ' + error.message));
            else resolve();
        });
    });
}

async function copyDirectory(src, dest) {
    const entries = await fsPromises.readdir(src, { withFileTypes: true });
    let copied = 0;
    const total = entries.length;
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            await fsPromises.mkdir(destPath, { recursive: true });
            await copyDirectory(srcPath, destPath);
        } else {
            await fsPromises.copyFile(srcPath, destPath);
        }
        
        copied++;
        const pct = 20 + (copied / total) * 45; // 20-65% range for file copy
        if (copied % 20 === 0 || copied === total) {
            sendProgress(pct, `Copying files... (${copied}/${total})`, `Copied: ${entry.name}`);
        }
    }
}

function getDesktopPath() {
    return path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop');
}

function getStartMenuPath() {
    return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
}

async function createShortcut(targetPath, shortcutPath, workingDir) {
    // Use PowerShell to create a .lnk shortcut
    const ps = `
        $ws = New-Object -ComObject WScript.Shell;
        $sc = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
        $sc.TargetPath = '${targetPath.replace(/'/g, "''")}';
        $sc.WorkingDirectory = '${workingDir.replace(/'/g, "''")}';
        $sc.Description = '${APP_NAME}';
        $sc.Save()
    `.trim();
    
    return new Promise((resolve, reject) => {
        exec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, (error) => {
            if (error) reject(new Error('Shortcut creation failed: ' + error.message));
            else resolve();
        });
    });
}

async function registerUninstaller(installPath) {
    lastInstallPath = installPath;
    const uninstallExe = path.join(installPath, 'uninstall.cmd');
    
    const regCmds = [
        `reg add "${UNINSTALL_REG_KEY}" /v "DisplayName" /t REG_SZ /d "${APP_NAME}" /f`,
        `reg add "${UNINSTALL_REG_KEY}" /v "DisplayVersion" /t REG_SZ /d "${APP_VERSION}" /f`,
        `reg add "${UNINSTALL_REG_KEY}" /v "Publisher" /t REG_SZ /d "${PUBLISHER}" /f`,
        `reg add "${UNINSTALL_REG_KEY}" /v "InstallLocation" /t REG_SZ /d "${installPath}" /f`,
        `reg add "${UNINSTALL_REG_KEY}" /v "UninstallString" /t REG_SZ /d "${uninstallExe}" /f`,
        `reg add "${UNINSTALL_REG_KEY}" /v "NoModify" /t REG_DWORD /d 1 /f`,
        `reg add "${UNINSTALL_REG_KEY}" /v "NoRepair" /t REG_DWORD /d 1 /f`,
    ];
    
    for (const cmd of regCmds) {
        try { execSync(cmd, { windowsHide: true }); } catch { /* non-critical */ }
    }
}

async function createUninstallScript(installPath, hadDesktop, hadStartMenu) {
    const lines = [
        '@echo off',
        `echo Uninstalling ${APP_NAME}...`,
        '',
        ':: Remove shortcuts',
    ];
    
    if (hadDesktop) {
        lines.push(`del /f /q "%USERPROFILE%\\Desktop\\${APP_NAME}.lnk" 2>nul`);
    }
    if (hadStartMenu) {
        lines.push(`rmdir /s /q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Traka" 2>nul`);
    }
    
    lines.push(
        '',
        ':: Remove registry entry',
        `reg delete "${UNINSTALL_REG_KEY}" /f 2>nul`,
        '',
        ':: Remove application files',
        `cd /d "%TEMP%"`,
        `rmdir /s /q "${installPath}" 2>nul`,
        '',
        'echo Uninstall complete.',
        'pause'
    );
    
    await fsPromises.writeFile(
        path.join(installPath, 'uninstall.cmd'),
        lines.join('\r\n'),
        'utf-8'
    );
}
