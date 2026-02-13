/**
 * Traka Log Analyzer — Installer Preload Script
 * Bridges the installer UI (renderer) to the main process.
 * Only loaded when running in --setup mode.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerAPI', {
    // Window controls
    minimize: () => ipcRenderer.invoke('minimize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    
    // Installation
    browseFolder: () => ipcRenderer.invoke('browse-folder'),
    getDiskSpace: (drive) => ipcRenderer.invoke('get-disk-space', drive),
    install: (options) => ipcRenderer.invoke('install', options),
    finish: (options) => ipcRenderer.invoke('finish', options),
    
    // Progress updates from main process
    onProgress: (callback) => {
        ipcRenderer.on('install-progress', (event, data) => callback(data));
    }
});
