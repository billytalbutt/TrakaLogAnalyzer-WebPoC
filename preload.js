/* ============================================
   Traka Log Analyzer - Desktop Edition
   Preload Script (Secure IPC Bridge)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // File System Operations
    scanTrakaLogs: () => ipcRenderer.invoke('scan-traka-logs'),
    scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
    readLogFile: (filePath) => ipcRenderer.invoke('read-log-file', filePath),
    readMultipleFiles: (filePaths) => ipcRenderer.invoke('read-multiple-files', filePaths),
    
    // Dialog Operations
    showDirectoryPicker: () => ipcRenderer.invoke('show-directory-picker'),
    showFilePicker: () => ipcRenderer.invoke('show-file-picker'),
    
    // File Watching
    startWatching: (dirPath) => ipcRenderer.invoke('start-watching', dirPath),
    stopWatching: (watcherId) => ipcRenderer.invoke('stop-watching', watcherId),
    
    // Live Tail Operations
    tailFile: (filePath, fromByte) => ipcRenderer.invoke('tail-file', filePath, fromByte),
    startTailWatch: (filePath) => ipcRenderer.invoke('start-tail-watch', filePath),
    stopTailWatch: (filePath) => ipcRenderer.invoke('stop-tail-watch', filePath),
    stopAllTailWatches: () => ipcRenderer.invoke('stop-all-tail-watches'),
    
    // File System Events (listeners)
    onFileAdded: (callback) => {
        ipcRenderer.on('file-added', (event, data) => callback(data));
    },
    onFileChanged: (callback) => {
        ipcRenderer.on('file-changed', (event, data) => callback(data));
    },
    onFileRemoved: (callback) => {
        ipcRenderer.on('file-removed', (event, data) => callback(data));
    },
    onFileTailUpdate: (callback) => {
        ipcRenderer.on('file-tail-update', (event, data) => callback(data));
    },
    onFileTailReset: (callback) => {
        ipcRenderer.on('file-tail-reset', (event, data) => callback(data));
    },
    
    // Utility Operations
    getDefaultPaths: () => ipcRenderer.invoke('get-default-paths'),
    checkPathExists: (dirPath) => ipcRenderer.invoke('check-path-exists', dirPath),
    
    // Environment Info
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron
});

console.log('Preload script loaded - Electron API exposed');
