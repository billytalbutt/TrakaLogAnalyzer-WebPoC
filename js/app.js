/* ============================================
   Traka Log Analyzer - Web PoC
   JavaScript Application
   ============================================ */

// ============================================
// Electron Integration (Desktop Edition)
// ============================================

// Check if running in Electron environment
const isElectron = window.electronAPI && window.electronAPI.isElectron;

// Electron-specific state
const electronState = {
    watchedDirectories: new Map(),
    customLogPaths: [],
    autoScanOnStartup: true,
    watchDirectories: false,
    scannedFiles: []
};

// Initialize Electron-specific features
if (isElectron) {
    console.log('Running in Electron mode - Desktop Edition');
    console.log('Electron version:', window.electronAPI.version);
    
    // Set up file system event listeners
    window.electronAPI.onFileAdded((data) => {
        console.log('New file detected:', data.name);
        showToast(`New log file detected: ${data.name}`, 'info');
        // Optionally auto-load the file
        if (electronState.watchDirectories) {
            loadFileFromPath(data.path);
        }
    });
    
    window.electronAPI.onFileChanged((data) => {
        console.log('File changed:', data.name);
        // Optionally refresh the file if it's currently loaded
        const existingFile = state.files.find(f => f.name === data.name);
        if (existingFile && state.liveTailActive) {
            // File will be updated by live tail mechanism
        }
    });
    
    // Live tail push-based updates from main process file watchers (bonus accelerator)
    window.electronAPI.onFileTailUpdate((data) => {
        if (!state.liveTailActive) return;
        console.log(`[LiveTail PUSH] ${data.name}: +${data.newContent.length} bytes`);
        const fileData = state.files.find(f => f.path === data.path || f.name === data.name);
        if (fileData && data.newContent) {
            const newLines = data.newContent.split(/\r?\n/).filter(line => line.trim());
            if (newLines.length > 0) {
                // Update byte offset so polling doesn't re-read the same content
                state.lastReadPositions.set(fileData.name, data.newOffset);
                // Append new content efficiently
                appendNewContentLive(fileData, data.newContent, newLines);
            }
        }
    });
    
    window.electronAPI.onFileTailReset((data) => {
        if (!state.liveTailActive) return;
        const fileData = state.files.find(f => f.path === data.path || f.name === data.name);
        if (fileData) {
            // File was rotated/truncated - reload entire content
            fileData.content = data.content;
            fileData.lines = data.content.split(/\r?\n/);
            fileData.size = data.content.length;
            state.lastReadPositions.set(fileData.name, data.newOffset);
            parseLogFile(fileData);
            if (!fileData.skipIssueAnalysis) {
                detectIssues(fileData);
            }
            
            // Full re-render needed for reset
            const currentFile = state.files[state.currentFileIndex];
            if (currentFile && currentFile.name === fileData.name) {
                displayLog(fileData);
            }
            const comparePage = document.getElementById('page-compare');
            if (comparePage && comparePage.classList.contains('active')) {
                updateCompareView();
            }
            updateUI();
            showToast(`${fileData.name} was rotated - reloaded`, 'warning');
        }
    });
    
    window.electronAPI.onFileRemoved((data) => {
        console.log('File removed:', data.name);
        showToast(`Log file removed: ${data.name}`, 'warning');
    });
    
    // Listen for popout window closed
    window.electronAPI.onPopoutClosed && window.electronAPI.onPopoutClosed((panelIndex) => {
        restorePoppedOutPanel(panelIndex);
    });
    
    // Listen for cross-window sync events
    window.electronAPI.onSyncEvent && window.electronAPI.onSyncEvent((type, data) => {
        handleSyncEvent(type, data);
    });
}

/**
 * Handle sync events received from other windows
 */
function handleSyncEvent(type, data) {
    if (type === 'time-sync') {
        const { timestampStr, targetTime, sourceFileIndex, sourceLine, bounds, nearestLines, offsets } = data;
        
        state.timeSyncActive = true;
        state.timeSyncLastTarget = { timestampStr, targetTime, minTime: targetTime - state.timeSyncRange, maxTime: targetTime + state.timeSyncRange, sourceFileIndex, sourceLine };
        state.timeSyncBounds = bounds || {};
        state.timeSyncNearestLines = nearestLines || {};
        state.timeSyncOffsets = offsets || {};
        
        // Update UI
        const btn = document.getElementById('timeSyncBtn');
        if (btn) btn.classList.add('active');
        
        // Apply sync
        if (state.compareVirtualScroll) {
            state.timeSyncScrolling = true;
            state.compareVirtualScroll.forEach((vs, idx) => {
                if (vs) {
                    if (state.timeSyncOffsets[idx] !== undefined) {
                        vs.panelContent.scrollTop = state.timeSyncOffsets[idx];
                    }
                    vs.lastRenderedStart = -1;
                    updateComparePanelViewport(idx, true);
                }
            });
            setTimeout(() => { state.timeSyncScrolling = false; }, 100);
        }
    } else if (type === 'time-sync-clear') {
        clearTimeSyncHighlights();
    } else if (type === 'scroll-sync') {
        if (state.timeSyncActive && state.timeSyncOffsets) {
            const { sourceIndex, delta } = data;
            if (state.compareVirtualScroll) {
                state.timeSyncScrolling = true;
                if (typeof isSyncingScroll !== 'undefined') isSyncingScroll = true;
                
                state.compareVirtualScroll.forEach((vs, index) => {
                    if (index !== sourceIndex && state.timeSyncOffsets[index] !== undefined && vs) {
                        vs.panelContent.scrollTop = state.timeSyncOffsets[index] + delta;
                    }
                });
                
                setTimeout(() => { 
                    state.timeSyncScrolling = false; 
                    if (typeof isSyncingScroll !== 'undefined') isSyncingScroll = false;
                }, 50);
            }
        }
    }
}

/**
 * Opens the auto-discover modal options
 */
function scanTrakaLogs() {
    if (!isElectron) {
        showToast('Directory scanning is only available in Desktop Edition', 'warning');
        return;
    }
    // Reset modal to step 1
    hideAutoDiscoverLimitStep();
    document.getElementById('autoDiscoverModal').classList.add('active');
}

function closeAutoDiscoverModal() {
    document.getElementById('autoDiscoverModal').classList.remove('active');
}

function showAutoDiscoverLimitStep(mode, engineName) {
    window.currentAutoDiscoverMode = mode;
    const el = document.getElementById('autoDiscoverEngineName');
    if (el) el.textContent = engineName;
    document.getElementById('autoDiscoverStep1').style.display = 'none';
    document.getElementById('autoDiscoverStep2').style.display = 'block';
}

function hideAutoDiscoverLimitStep() {
    const step1 = document.getElementById('autoDiscoverStep1');
    const step2 = document.getElementById('autoDiscoverStep2');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
}

/**
 * Execute specific Traka log discovery mode
 */
async function executeAutoDiscover(mode, limit = 'all') {
    closeAutoDiscoverModal();
    
    if (!isElectron) {
        showToast('Directory scanning is only available in Desktop Edition', 'warning');
        return;
    }
    
    const btn = document.getElementById('scanTrakaLogsBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg> Scanning...';
    }
    
    // Show loading overlay so user gets visual feedback during scan
    showGlobalLoader('Scanning Traka Directories...', 'Searching for log files in default Traka paths');
    
    // Clear previously loaded files so we always get a fresh set of logs.
    if (state.liveTailActive) {
        await stopLiveTail();
    }
    state.files = [];
    state.currentFileIndex = -1;
    state.parsedLogs.clear();
    state.issues = [];
    state.lastReadPositions.clear();
    
    try {
        const result = await window.electronAPI.scanTrakaLogs(mode, limit);
        
        if (result.success) {
            electronState.scannedFiles = result.files;
            
            if (result.files.length === 0) {
                hideGlobalLoader();
                showToast('No log files found in Traka directories', 'warning');
                updateDiscoveryStatus(`Scanned ${result.scannedPaths.length} directories - No log files found`);
            } else {
                updateGlobalLoaderText('Loading Log Files...', `Found ${result.totalFiles} files — loading them now`);
                updateDiscoveryStatus(`Found ${result.totalFiles} log files`);
                
                // Automatically load all discovered files in correct order
                await autoLoadDiscoveredFilesForCompare(result.files);
                hideGlobalLoader();
                showToast(`Found ${result.totalFiles} log files - loaded successfully`, 'success');
            }
        } else {
            hideGlobalLoader();
            showToast(`Scan failed: ${result.error}`, 'error');
            updateDiscoveryStatus('Scan failed');
        }
    } catch (error) {
        hideGlobalLoader();
        console.error('Scan error:', error);
        showToast('Error scanning directories', 'error');
        updateDiscoveryStatus('Error occurred');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> Scan Traka Directories';
        }
    }
}

/**
 * Select a custom directory for scanning
 */
async function selectCustomDirectory() {
    if (!isElectron) {
        showToast('Directory selection is only available in Desktop Edition', 'warning');
        return;
    }
    
    try {
        const result = await window.electronAPI.showDirectoryPicker();
        
        if (result.success && result.path) {
            showGlobalLoader('Scanning Directory...', result.path);
            
            const scanResult = await window.electronAPI.scanDirectory(result.path);
            
            hideGlobalLoader();
            
            if (scanResult.success) {
                electronState.scannedFiles = scanResult.files;
                
                if (scanResult.files.length === 0) {
                    showToast('No log files found in selected directory', 'warning');
                } else {
                    showToast(`Found ${scanResult.files.length} log files`, 'success');
                    showFileSelectionModal(scanResult.files, [result.path]);
                }
            } else {
                showToast(`Error scanning directory: ${scanResult.error}`, 'error');
            }
        }
    } catch (error) {
        hideGlobalLoader();
        console.error('Directory selection error:', error);
        showToast('Error selecting directory', 'error');
    }
}

/**
 * Open Electron file picker dialog
 */
async function openElectronFilePicker() {
    if (!isElectron) {
        showToast('File picker is only available in Desktop Edition', 'warning');
        return;
    }
    
    try {
        const result = await window.electronAPI.showFilePicker();
        
        if (result.success && result.paths && result.paths.length > 0) {
            showGlobalLoader('Loading Files...', `Loading ${result.paths.length} file(s)`);
            
            let loadedCount = 0;
            for (const filePath of result.paths) {
                const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || filePath;
                updateGlobalLoaderText('Loading Files...', `Loading ${fileName} (${loadedCount + 1}/${result.paths.length})`);
                await loadFileFromPath(filePath);
                loadedCount++;
            }
            
            hideGlobalLoader();
            showToast(`Successfully loaded ${result.paths.length} file(s)`, 'success');
        }
    } catch (error) {
        hideGlobalLoader();
        console.error('File picker error:', error);
        showToast('Error loading files', 'error');
    }
}

/**
 * Load a file from file system path (Electron only).
 * @param {string} filePath - Full path to the log file
 * @param {string|null} engineType - Optional engine type label (e.g. 'Business Engine')
 *   Used to create a unique display name when multiple directories contain
 *   identically-named files like Debugging_Log.txt.
 */
async function loadFileFromPath(filePath, engineType = null, skipUIUpdate = false) {
    if (!isElectron) return;
    
    try {
        const result = await window.electronAPI.readLogFile(filePath);
        
        if (result.success) {
            const isConfig = isConfigFilename(result.name);
            const lines = result.content.split(/\r?\n/);
            
            // Create a unique name for the file. Generic filenames like
            // "Debugging_Log.txt" appear in every Traka engine directory,
            // so we prefix with the engine type to prevent collisions in
            // state.files, lastReadPositions, parsedLogs, and issues.
            let uniqueName = result.name;
            if (engineType) {
                // If it's a generic name or an archived generic name (e.g. Debugging_Log.txt.20240319)
                const lowerName = result.name.toLowerCase();
                if (lowerName.includes('debugging_log')) {
                    uniqueName = `${engineType} - ${result.name}`;
                } else if (!lowerName.includes(engineType.toLowerCase())) {
                    // Prefix engine type if not already in the name
                    uniqueName = `${engineType} - ${result.name}`;
                }
            }
            
            const fileData = {
                name: uniqueName,
                originalName: result.name,  // Keep original for path operations
                size: result.size,
                lastModified: new Date(result.modified),
                content: result.content,
                lines: lines,
                isConfig: isConfig,
                path: result.path,
                engineType: engineType || null
            };
            
            // Diagnostic logging
            const firstLine = lines[0] ? lines[0].substring(0, 80) : '(empty)';
            const lastLine = lines.length > 1 ? lines[lines.length - 2].substring(0, 80) : '(empty)';
            console.log(`[LoadFile] ${uniqueName}: ${result.size} bytes, ${lines.length} lines, modified: ${result.modified}`);
            console.log(`[LoadFile]   Path: ${result.path}`);
            console.log(`[LoadFile]   First: ${firstLine}`);
            console.log(`[LoadFile]   Last:  ${lastLine}`);
            
            // Initialize last read position for live tail (byte offset)
            // Use the unique name so different engine logs don't collide
            state.lastReadPositions.set(uniqueName, result.size);
            
            // Deduplicate by path (most reliable) or by unique name
            const existingIndex = state.files.findIndex(f => f.path === result.path);
            if (existingIndex >= 0) {
                state.files[existingIndex] = fileData;
            } else {
                state.files.push(fileData);
            }
            
            applyLoadOptionsToLogFile(fileData);
            // Parse and analyze (skip issue detection for config files — applyLoadOptions clears issues when skipped)
            parseLogFile(fileData);
            if (!isConfig) {
                detectIssues(fileData);
                if (fileData.skipIssueAnalysis) {
                    updateIssuesUI();
                }
            }
            
            // Update UI components if not skipping
            if (!skipUIUpdate) {
                updateUI();
                updateFileDropdown();
                updateConfigFileDropdown();
                updateFilesList();
                
                const comparePage = document.getElementById('page-compare');
                if (comparePage && comparePage.classList.contains('active')) {
                    updateCompareView();
                }
                const configPage = document.getElementById('page-config');
                if (isConfig && configPage && configPage.classList.contains('active')) {
                    state.currentConfigFileIndex = state.files.findIndex(f => f.name === fileData.name);
                    displayConfigFile(fileData);
                }
            }
            
            return fileData;
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error loading file from path:', error);
        showToast(`Error loading ${filePath}: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Show modal for selecting which discovered files to load
 */
function showFileSelectionModal(files, directories) {
    // Group files by engineType for better organization
    const grouped = {};
    files.forEach((file, idx) => {
        const type = file.engineType || 'Other Logs';
        if (!grouped[type]) {
            grouped[type] = [];
        }
        grouped[type].push({ file, idx });
    });
    
    // Create modal HTML with grouped files
    let filesHTML = '';
    Object.keys(grouped).sort().forEach(engineType => {
        const items = grouped[engineType];
        filesHTML += `
            <div style="margin-bottom: 1rem;">
                <div style="font-weight: 600; color: var(--accent-primary); margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 4px;">
                    ${engineType} ${items.length > 1 ? '(' + items.length + ' files)' : ''}
                </div>
                ${items.map(({ file, idx }) => `
                    <label style="display: flex; align-items: center; padding: 0.5rem; padding-left: 1.5rem; background: rgba(255, 255, 255, 0.03); border-radius: 4px; cursor: pointer; margin-bottom: 0.25rem;">
                        <input type="checkbox" class="discovered-file-checkbox" value="${idx}" checked style="margin-right: 0.5rem;">
                        <div style="flex: 1;">
                            <div style="font-weight: 500;">${file.name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); font-family: monospace;">${file.path}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">
                                Size: ${(file.size / 1024).toFixed(1)} KB | Modified: ${new Date(file.modified).toLocaleString()}
                            </div>
                        </div>
                    </label>
                `).join('')}
            </div>
        `;
    });
    
    const modalHTML = `
        <div class="modal-overlay" id="fileSelectionModal" style="display: flex;">
            <div class="modal" style="max-width: 900px; max-height: 85vh;">
                <div class="modal-header">
                    <h3>Select Log Files to Load</h3>
                    <button class="btn-icon" onclick="closeFileSelectionModal()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-content" style="max-height: 55vh; overflow-y: auto;">
                    <p style="margin-bottom: 1rem;">
                        Found <strong>${files.length}</strong> newest log files from <strong>${directories.length}</strong> directories. 
                        All files are pre-selected (newest of each type):
                    </p>
                    <div style="margin-bottom: 1rem;">
                        <button class="btn btn-small btn-secondary" onclick="selectAllDiscoveredFiles()">Select All</button>
                        <button class="btn btn-small btn-secondary" onclick="deselectAllDiscoveredFiles()">Deselect All</button>
                    </div>
                    <div id="discoveredFilesList" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${filesHTML}
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeFileSelectionModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="loadSelectedDiscoveredFiles()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        Load Selected Files
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if present
    const existing = document.getElementById('fileSelectionModal');
    if (existing) existing.remove();
    
    // Add to document
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeFileSelectionModal() {
    const modal = document.getElementById('fileSelectionModal');
    if (modal) modal.remove();
}

function selectAllDiscoveredFiles() {
    document.querySelectorAll('.discovered-file-checkbox').forEach(cb => cb.checked = true);
}

function deselectAllDiscoveredFiles() {
    document.querySelectorAll('.discovered-file-checkbox').forEach(cb => cb.checked = false);
}

/**
 * Sort files by engine type priority for consistent loading order
 * Priority: Business Engine → Comms Engine → Integration Engine → Plugins
 */
function sortFilesForCompare(files) {
    const order = {
        'Business Engine': 1,
        'Comms Engine': 2,
        'TrakaWEB': 3,
        'Integration Engine Service': 4,
        'Integration Engine': 4.5,
        'Integration Monitor': 5,
        'SiPass Integration': 6,
        'OnGuard Integration': 7,
        'CCure Integration': 8,
        'PostBox Integration': 9,
        'Active Directory Integration': 10,
        'Symmetry Integration': 11,
        'Lenel Integration': 12,
        'Integration Log': 13
    };
    
    return files.sort((a, b) => {
        const orderA = order[a.engineType] || 999;
        const orderB = order[b.engineType] || 999;
        
        // Primary sort: Engine type
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        
        // Secondary sort: Is it the "current" log? (has no numbers/dates in the filename suffix)
        // e.g. "Debugging_Log.txt" is current, "Debugging_Log_20260110.txt" is historical.
        const originalA = (a.originalName || a.name || '').toLowerCase();
        const originalB = (b.originalName || b.name || '').toLowerCase();
        
        const hasDateA = /\.(?:txt|log)\.([^.]+)$/i.test(originalA) || /[_-](\d+)\.(?:txt|log|cfg)$/i.test(originalA);
        const hasDateB = /\.(?:txt|log)\.([^.]+)$/i.test(originalB) || /[_-](\d+)\.(?:txt|log|cfg)$/i.test(originalB);
        
        if (!hasDateA && hasDateB) return -1; // A is current, so it goes first
        if (hasDateA && !hasDateB) return 1;  // B is current, so it goes first
        
        // Tertiary sort: Modification date descending (newest historical first, oldest at the bottom)
        // Extract date from filename robustly to ignore OS modified time differences
        const extractDate = (filename) => {
            let match = filename.match(/(\d{8})/);
            if (match) {
                const year = parseInt(match[1].substring(0, 4), 10);
                const month = parseInt(match[1].substring(4, 6), 10);
                const day = parseInt(match[1].substring(6, 8), 10);
                return new Date(year, month - 1, day).getTime();
            }
            match = filename.match(/(\d{4}-\d{2}-\d{2})/);
            if (match) {
                return new Date(match[1]).getTime();
            }
            // If it's just a backup index (e.g. .txt.1, .txt.2), use the index as a small offset
            match = filename.match(/\.(?:txt|log)\.(\d+)$/i);
            if (match && parseInt(match[1]) < 1000) {
                return -parseInt(match[1]); // Lower index (1) is newer than (2), so make it negative to sort higher
            }
            return 0;
        };
        
        const filenameDateA = extractDate(originalA);
        const filenameDateB = extractDate(originalB);
        
        if (filenameDateA !== filenameDateB) {
            return filenameDateB - filenameDateA; // Descending
        }
        
        const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return dateB - dateA;
    });
}

async function loadSelectedDiscoveredFiles() {
    const checkboxes = document.querySelectorAll('.discovered-file-checkbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (selectedIndices.length === 0) {
        showToast('No files selected', 'warning');
        return;
    }
    
    closeFileSelectionModal();
    
    // Show loading overlay during file loading
    showGlobalLoader('Loading Log Files...', `Loading ${selectedIndices.length} file(s)`);
    
    // Sort files by engine type priority (Business → Comms → Integration → Plugins)
    const selectedFiles = selectedIndices.map(idx => electronState.scannedFiles[idx]);
    const sortedFiles = sortFilesForCompare(selectedFiles);
    
    let loadedCount = 0;
    for (const file of sortedFiles) {
        if (file) {
            updateGlobalLoaderText('Loading Log Files...', `Loading ${file.name} (${loadedCount + 1}/${sortedFiles.length})`);
            const result = await loadFileFromPath(file.path, file.engineType || null, true);
            if (result) loadedCount++;
        }
    }
    
    hideGlobalLoader();
    
    if (loadedCount > 0) {
        // Ensure files are sorted correctly after parallel batch loading
        state.files = sortFilesForCompare(state.files);
        
        updateUI();
        updateFileDropdown();
        updateFilesList();
        
        // Ensure the first file is selected for the viewer
        if (state.currentFileIndex === -1 && state.files.length > 0) {
            state.currentFileIndex = 0;
        }
        
        // Navigate to compare view if coming from there, or viewer
        const comparePage = document.getElementById('page-compare');
        if (comparePage && comparePage.classList.contains('active')) {
            updateCompareView();
        }
        
        showToast(`Successfully loaded ${loadedCount} file(s) - ready for viewing and comparison`, 'success');
        navigateTo('viewer');
    }
}

/**
 * Automatically load discovered files for compare view
 * Loads all files in the correct order: Business Engine → Comms Engine → Integration Engine → Integration Modules
 */
async function autoLoadDiscoveredFilesForCompare(files) {
    if (!files || files.length === 0) {
        showToast('No files to load', 'warning');
        return;
    }
    
    // Sort files by engine type priority (Business → Comms → Integration → Plugins)
    const sortedFiles = sortFilesForCompare(files).filter(Boolean);
    const totalFiles = sortedFiles.length;
    
    // Load files in parallel batches of 3 for much faster loading on slow I/O (VMs, network drives)
    const BATCH_SIZE = 3;
    let loadedCount = 0;
    
    for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
        const batch = sortedFiles.slice(i, i + BATCH_SIZE);
        const batchNames = batch.map(f => f.name).join(', ');
        updateGlobalLoaderText('Loading Log Files...', `Loading ${batchNames} (${Math.min(i + BATCH_SIZE, totalFiles)}/${totalFiles})`);
        
        // Load batch in parallel, skip UI updates during batch load to drastically improve performance
        const results = await Promise.all(
            batch.map(file => loadFileFromPath(file.path, file.engineType || null, true))
        );
        loadedCount += results.filter(Boolean).length;
    }
    
    if (loadedCount > 0) {
        // Now that all files are loaded and parsed, do a single bulk UI update
        updateUI();
        updateFileDropdown();
        updateFilesList();
        
        // Ensure the first file is selected for the viewer when the user visits it
        if (state.currentFileIndex === -1 && state.files.length > 0) {
            state.currentFileIndex = 0;
        }
        // Navigate to compare view to see files side-by-side
        navigateTo('compare');
        
        // Force the compare view to update once
        updateCompareView();
    } else {
        showToast('Failed to load any files', 'error');
    }
}

function updateDiscoveryStatus(message) {
    const statusEl = document.getElementById('discoveryStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.display = message ? 'block' : 'none';
    }
}

/**
 * Add custom log path
 */
async function addCustomLogPath() {
    if (!isElectron) return;
    
    const result = await window.electronAPI.showDirectoryPicker();
    if (result.success && result.path) {
        if (!electronState.customLogPaths.includes(result.path)) {
            electronState.customLogPaths.push(result.path);
            saveElectronSettings();
            updateCustomPathsList();
            showToast(`Added custom path: ${result.path}`, 'success');
        } else {
            showToast('Path already added', 'warning');
        }
    }
}

/**
 * Update custom paths list in settings
 */
function updateCustomPathsList() {
    const listEl = document.getElementById('customPathsList');
    if (!listEl) return;
    
    if (electronState.customLogPaths.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.875rem;">No custom paths configured</div>';
        return;
    }
    
    listEl.innerHTML = electronState.customLogPaths.map((path, idx) => `
        <div class="path-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 4px; margin-bottom: 0.5rem;">
            <span style="font-family: monospace; font-size: 0.875rem;">${path}</span>
            <button class="btn-icon btn-remove" onclick="removeCustomPath(${idx})" title="Remove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
}

function removeCustomPath(index) {
    electronState.customLogPaths.splice(index, 1);
    saveElectronSettings();
    updateCustomPathsList();
    showToast('Custom path removed', 'success');
}

/**
 * Save Electron-specific settings
 */
function saveElectronSettings() {
    const settings = {
        customLogPaths: electronState.customLogPaths,
        autoScanOnStartup: electronState.autoScanOnStartup,
        watchDirectories: electronState.watchDirectories
    };
    localStorage.setItem('trakaLogAnalyzerElectronSettings', JSON.stringify(settings));
}

/**
 * Load Electron-specific settings
 */
function loadElectronSettings() {
    const saved = localStorage.getItem('trakaLogAnalyzerElectronSettings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            electronState.customLogPaths = settings.customLogPaths || [];
            electronState.autoScanOnStartup = settings.autoScanOnStartup !== false;
            electronState.watchDirectories = settings.watchDirectories || false;
            
            // Update UI
            const autoScanCheckbox = document.getElementById('autoScanOnStartup');
            if (autoScanCheckbox) autoScanCheckbox.checked = electronState.autoScanOnStartup;
            
            const watchCheckbox = document.getElementById('watchDirectories');
            if (watchCheckbox) watchCheckbox.checked = electronState.watchDirectories;
            
            updateCustomPathsList();
        } catch (error) {
            console.error('Error loading Electron settings:', error);
        }
    }
}

/**
 * Initialize Electron-specific UI elements on page load
 */
function initElectronUI() {
    if (!isElectron) return;
    
    // Show Electron-specific UI elements
    const autoDiscoverySection = document.getElementById('autoDiscoverySection');
    if (autoDiscoverySection) {
        autoDiscoverySection.style.display = 'block';
    }
    
    const electronLogDirsCard = document.getElementById('electronLogDirsCard');
    if (electronLogDirsCard) {
        electronLogDirsCard.style.display = 'block';
    }
    
    // Update subtitle to show Desktop Edition
    const subtitle = document.getElementById('heroSubtitle');
    if (subtitle && subtitle.textContent.includes('Advanced log analysis')) {
        subtitle.textContent += ' Desktop Edition with automatic log discovery.';
    }
    
    // Load Electron settings
    loadElectronSettings();
    
    // Load default paths
    loadDefaultPaths();
    
    // Auto-scan on startup if enabled
    if (electronState.autoScanOnStartup) {
        setTimeout(() => {
            console.log('Auto-scanning Traka log directories...');
            // Don't auto-load, just scan and show the option
        }, 1000);
    }
}

/**
 * Load and display default Traka paths
 */
async function loadDefaultPaths() {
    if (!isElectron) return;
    
    try {
        const result = await window.electronAPI.getDefaultPaths();
        if (result.success) {
            const listEl = document.getElementById('defaultPathsList');
            if (listEl) {
                listEl.innerHTML = result.paths.map(p => `
                    <div class="path-item" style="display: flex; align-items: center; padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 4px; margin-bottom: 0.5rem;">
                        <span style="flex: 1; font-family: monospace; font-size: 0.875rem;">${p.path}</span>
                        <span style="font-size: 0.75rem; color: ${p.exists ? 'var(--accent-success)' : 'var(--text-secondary)'};">
                            ${p.exists ? '✓ Found' : '✗ Not found'}
                        </span>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading default paths:', error);
    }
}

// ============================================
// State Management
// ============================================
const state = {
    files: [],
    currentFileIndex: -1,
    parsedLogs: new Map(),
    issues: [],
    searchMatches: [],
    currentMatchIndex: -1,
    activeFilter: 'all',
    activeCategory: 'all',
    syncScroll: false,
    liveTailActive: false,
    liveTailInterval: null,
    liveTailFileHandles: new Map(), // Store file handles for live monitoring
    lastReadPositions: new Map(), // Track last read position per file
    autoScrollEnabled: true,
    timeSyncActive: false,
    timeSyncRange: 5000, // 5 seconds in milliseconds (adjustable)
    timeSyncProcessing: false, // Track if toggle is processing
    timeSyncScrolling: false, // Suppress sync-scroll during programmatic time-sync scrolling
    timeSyncLastTarget: null, // { timestampStr, targetTime, sourceFileIndex, sourceLine } for live re-sync
    timeSyncThresholdTimer: null, // Debounce timer for threshold slider changes
    stitchMode: false,
    stitchedFiles: [], // Files selected for stitching
    stitchedData: null, // Merged log data
    dateSortOrder: 'none', // Date sorting: 'none', 'asc', 'desc'
    highlightRules: [], // Custom text highlighting rules (BareTail-style) — log viewer & compare
    /** Separate rules for the Config file page only (not shared with logs) */
    configHighlightRules: [],
    /** 'logs' | 'config' — which rule set the highlight modal is editing */
    highlightRulesModalScope: 'logs',
    minimizedPanels: new Set(), // Track minimized compare panels by file index
    poppedOutPanels: new Set(), // Track popped out panels by file index
    compareSearchFilterMode: false, // false = highlight mode, true = filter (show matches only)
    /** Compare page panel layout: 'sideBySide' (columns) or 'stacked' (rows, top to bottom) */
    compareLayout: 'sideBySide',
    dateFromPicker: null, // Flatpickr instance for start date
    dateToPicker: null, // Flatpickr instance for end date
    engineFilters: {
        business: false,
        comms: false,
        integration: false
    },
    filterDebounceTimer: null, // Debounce timer for filter changes
    virtualScroll: null,
    compareVirtualScroll: null,
    /** Index into state.files for the selected config on the Config viewer page */
    currentConfigFileIndex: -1,
    /** Config page: one file at a time vs all configs in compare-style panels */
    configViewMode: 'single',
    /** Config multi-view layout (separate from compareLayout / localStorage) */
    configMultiLayout: 'sideBySide',
    configMultiVirtualScroll: null,
    /** Config multi-view only: trim-line sets for Highlight Differences (parallel to config panels) */
    configMultiDiffSets: null,
    configMultiDiffHighlightActive: false,
    settings: {
        detectErrors: true,
        detectExceptions: true,
        detectTimeouts: true,
        detectConnections: true,
        detectAuth: true,
        detectPerformance: true,
        detectLicensing: true,
        detectDatabase: true,
        detectIntegration: true,
        detectCabinet: true,
        detectAPI: true,
        fontSize: 13,
        wordWrap: true,
        showLineNumbers: true,
        highlightSearch: true,
        customPatterns: [],
        tailRefreshInterval: 1000, // 1 second refresh for live tail
        maxTailLines: 10000, // Maximum lines to keep in tail mode
        /** When false, new loads skip issue detection and log line error/warn CSS (faster for huge logs). */
        processIssuesOnLoad: true
    }
};

/**
 * Sync "Process issues on load" checkboxes (home, viewer, compare).
 */
function syncProcessIssuesOnLoadCheckboxes(checked) {
    const el = document.getElementById('processIssuesOnLoad');
    if (el) el.checked = checked;
}

function isProcessIssuesOnLoadEnabled() {
    const el = document.getElementById('processIssuesOnLoad');
    if (el) return el.checked;
    return state.settings.processIssuesOnLoad !== false;
}

function persistProcessIssuesOnLoadPreference() {
    const checked = isProcessIssuesOnLoadEnabled();
    state.settings.processIssuesOnLoad = checked;
    syncProcessIssuesOnLoadCheckboxes(checked);
    try {
        localStorage.setItem('trakaLogAnalyzerSettings', JSON.stringify(state.settings));
    } catch (e) {
        /* ignore */
    }
}

/**
 * Apply per-file flags for issue scanning and viewer error-level CSS based on load-time option.
 */
function isConfigFilename(name) {
    const n = name.toLowerCase();
    return n.endsWith('.cfg') || n.endsWith('.ini') || n.endsWith('.config');
}

function applyLoadOptionsToLogFile(fileData) {
    if (fileData.isConfig) {
        fileData.skipIssueAnalysis = false;
        fileData.skipErrorRendering = false;
        return;
    }
    const process = isProcessIssuesOnLoadEnabled();
    fileData.skipIssueAnalysis = !process;
    fileData.skipErrorRendering = !process;
    if (!process) {
        state.issues = state.issues.filter(i => i.file !== fileData.name);
    }
}

// ============================================
// Issue Detection Patterns (Traka-specific)
// ============================================
const issuePatterns = [
    // Critical Issues
    { pattern: /fatal|critical|crash|unhandled\s*exception/i, severity: 'critical', category: 'critical', title: 'Critical Error', description: 'A fatal or critical error occurred' },
    { pattern: /out\s*of\s*memory|memory\s*allocation\s*failed/i, severity: 'critical', category: 'critical', title: 'Memory Error', description: 'Out of memory or allocation failure' },
    { pattern: /stack\s*overflow/i, severity: 'critical', category: 'critical', title: 'Stack Overflow', description: 'Stack overflow exception detected' },
    
    // Errors
    { pattern: /\berror\b/i, severity: 'error', category: 'error', title: 'Error', description: 'An error occurred' },
    { pattern: /\bexception\b.*:/i, severity: 'error', category: 'error', title: 'Exception', description: 'An exception was thrown' },
    { pattern: /\bfailed\b/i, severity: 'error', category: 'error', title: 'Operation Failed', description: 'An operation failed to complete' },
    { pattern: /NullReferenceException/i, severity: 'error', category: 'error', title: 'Null Reference', description: 'Null reference exception detected' },
    { pattern: /System\.Exception|System\.ApplicationException/i, severity: 'error', category: 'error', title: 'System Exception', description: 'A system exception occurred' },
    
    // Warnings
    { pattern: /\bwarning\b/i, severity: 'warning', category: 'warning', title: 'Warning', description: 'A warning was logged' },
    { pattern: /deprecated/i, severity: 'warning', category: 'warning', title: 'Deprecated', description: 'Deprecated functionality used' },
    { pattern: /\bretry\b|\bretrying\b/i, severity: 'warning', category: 'warning', title: 'Retry Attempt', description: 'Operation is being retried' },
    
    // Performance Issues
    { pattern: /timeout|timed?\s*out/i, severity: 'warning', category: 'performance', title: 'Timeout', description: 'Operation timed out' },
    { pattern: /slow|performance|latency/i, severity: 'warning', category: 'performance', title: 'Performance Issue', description: 'Possible performance issue detected' },
    { pattern: /took\s+\d{4,}\s*ms/i, severity: 'warning', category: 'performance', title: 'Slow Operation', description: 'Operation took over 1 second' },
    { pattern: /deadlock/i, severity: 'error', category: 'performance', title: 'Deadlock', description: 'Deadlock detected' },
    
    // Connection Issues
    { pattern: /connection\s*(refused|reset|closed|failed|lost)/i, severity: 'error', category: 'error', title: 'Connection Error', description: 'Network connection issue' },
    { pattern: /unable\s*to\s*connect/i, severity: 'error', category: 'error', title: 'Connection Failed', description: 'Unable to establish connection' },
    { pattern: /socket\s*exception/i, severity: 'error', category: 'error', title: 'Socket Error', description: 'Socket exception occurred' },
    
    // Authentication Issues
    { pattern: /authentication\s*(failed|failure|error)/i, severity: 'error', category: 'error', title: 'Auth Failed', description: 'Authentication failure' },
    { pattern: /unauthorized|forbidden|access\s*denied/i, severity: 'error', category: 'error', title: 'Access Denied', description: 'Access was denied' },
    { pattern: /invalid\s*(credentials|token|password)/i, severity: 'error', category: 'error', title: 'Invalid Credentials', description: 'Invalid authentication credentials' },
    { pattern: /login\s*(failed|failure)/i, severity: 'error', category: 'error', title: 'Login Failed', description: 'Login attempt failed' },
    
    // Traka-Specific Patterns
    { pattern: /license\s*(expired|invalid|error|not\s*found)/i, severity: 'critical', category: 'critical', title: 'License Issue', description: 'Traka license problem detected' },
    { pattern: /cabinet\s*(offline|not\s*responding|communication\s*error)/i, severity: 'error', category: 'error', title: 'Cabinet Issue', description: 'Cabinet communication problem' },
    { pattern: /key\s*(not\s*found|missing|stuck)/i, severity: 'warning', category: 'warning', title: 'Key Issue', description: 'Key-related issue detected' },
    { pattern: /slot\s*(error|fault|jam)/i, severity: 'error', category: 'error', title: 'Slot Error', description: 'Cabinet slot error' },
    { pattern: /integration\s*(engine|service)\s*(error|failed|stopped)/i, severity: 'error', category: 'error', title: 'Integration Error', description: 'Integration engine problem' },
    { pattern: /database\s*(connection|error|timeout)/i, severity: 'error', category: 'error', title: 'Database Error', description: 'Database connectivity issue' },
    { pattern: /sql\s*(error|exception|timeout)/i, severity: 'error', category: 'error', title: 'SQL Error', description: 'SQL query error' },
    { pattern: /api\s*(error|failed|exception)/i, severity: 'error', category: 'error', title: 'API Error', description: 'API communication error' },
    { pattern: /web\s*service\s*(error|unavailable)/i, severity: 'error', category: 'error', title: 'Web Service Error', description: 'Web service unavailable' },
    { pattern: /booking\s*(failed|error|conflict)/i, severity: 'warning', category: 'warning', title: 'Booking Issue', description: 'Booking-related problem' },
    { pattern: /user\s*(not\s*found|invalid|locked)/i, severity: 'warning', category: 'warning', title: 'User Issue', description: 'User account problem' },
    { pattern: /session\s*(expired|timeout|invalid)/i, severity: 'warning', category: 'warning', title: 'Session Issue', description: 'User session problem' }
];

// ============================================
// DOM Ready
// ============================================
function initializeApp() {
    console.log('🚀 Starting app initialization...');
    
    try {
        console.log('  ✓ Initializing navigation...');
        initNavigation();
        
        console.log('  ✓ Initializing file drop zone...');
        initFileDropZone();
        
        console.log('  ✓ Initializing file inputs...');
        initFileInputs();
        
        console.log('  ✓ Initializing search...');
        initSearch();
        
        console.log('  ✓ Initializing filters...');
        initFilters();
        
        console.log('  ✓ Initializing settings...');
        initSettings();
        
        console.log('  ✓ Loading settings...');
        loadSettings();
        
        console.log('  ✓ Loading highlight rules...');
        loadHighlightRules(); // Load saved highlight rules
        loadConfigHighlightRules();
        loadCompareLayout();
        loadConfigViewMode();
        loadConfigMultiLayout();
        
        console.log('  ✓ Updating UI...');
        updateUI();
        
        console.log('  ✓ Initializing scroll sync...');
        initScrollSync(); // Initialize scroll synchronization for line numbers
        initConfigLogScrollSync();
        
        // Initialize solution cards system
        if (typeof initializeSolutionsPanel === 'function') {
            console.log('  ✓ Initializing solutions panel...');
            initializeSolutionsPanel();
        }
        
        // Initialize Electron-specific features
        if (isElectron) {
            console.log('  ✓ Initializing Electron features...');
            initElectronUI();
        }

        applyCompareLayoutToDom();
        
        console.log('✅ App initialization complete!');
    } catch (error) {
        console.error('❌ Error during initialization:', error);
        console.error('Stack trace:', error.stack);
        // Still try to make the app somewhat functional
        alert('App initialization error: ' + error.message + '\nCheck console for details.');
    }
}

// ============================================
// UI Toggle Functions
// ============================================
function toggleViewerSearchFilters() {
    const filtersContainer = document.getElementById('viewerSearchFilters');
    const toggleBtn = document.querySelector('.search-filter-toggle-btn');
    
    if (filtersContainer && toggleBtn) {
        filtersContainer.classList.toggle('collapsed');
        toggleBtn.classList.toggle('collapsed');
        
        // Save preference
        try {
            localStorage.setItem('traka-viewer-filters-collapsed', filtersContainer.classList.contains('collapsed').toString());
        } catch (e) {
            console.error('Failed to save viewer filters state:', e);
        }
    }
}

// Check if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    console.log('📋 DOM still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    console.log('📋 DOM already loaded, initializing immediately...');
    // DOM is already loaded, initialize immediately
    initializeApp();
}

// ============================================
// Navigation
// ============================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
    
    // Restore sidebar collapsed state
    restoreSidebarState();
    
    // Restore collapsible filters state
    try {
        if (localStorage.getItem('traka-viewer-filters-collapsed') === 'true') {
            const filtersContainer = document.getElementById('viewerSearchFilters');
            const toggleBtn = document.querySelector('.search-filter-toggle-btn');
            if (filtersContainer && toggleBtn) {
                filtersContainer.classList.add('collapsed');
                toggleBtn.classList.add('collapsed');
            }
        }
    } catch (e) {
        // Ignore
    }
}

// ============================================
// Sidebar Collapse / Expand
// ============================================

/**
 * Toggle the sidebar between expanded and collapsed states.
 * Collapsed state shows only icons with tooltips on hover.
 * The main content smoothly expands to fill the freed space.
 */
function toggleSidebarCollapse() {
    const sidebar = document.querySelector('.nav-sidebar');
    if (!sidebar) return;
    
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
        sidebar.classList.remove('collapsed');
    } else {
        sidebar.classList.add('collapsed');
    }
    
    // Save preference
    try {
        localStorage.setItem('traka-sidebar-collapsed', !isCollapsed ? 'true' : 'false');
    } catch (e) {
        // localStorage not available
    }
}

/**
 * Restore the sidebar collapsed state from localStorage on init.
 */
function restoreSidebarState() {
    try {
        const collapsed = localStorage.getItem('traka-sidebar-collapsed');
        if (collapsed === 'true') {
            const sidebar = document.querySelector('.nav-sidebar');
            if (sidebar) {
                // Apply instantly without transition on initial load
                sidebar.style.transition = 'none';
                sidebar.classList.add('collapsed');
                // Also suppress main-content transition briefly
                const mainContent = document.querySelector('.main-content');
                if (mainContent) mainContent.style.transition = 'none';
                // Re-enable transitions after a frame
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        sidebar.style.transition = '';
                        if (mainContent) mainContent.style.transition = '';
                    });
                });
            }
        }
    } catch (e) {
        // localStorage not available
    }
}

function navigateTo(page) {
    const totalLines = state.files.reduce((sum, f) => sum + f.lines.length, 0);
    const needsLoader = (page === 'compare' || page === 'viewer' || page === 'config') && totalLines > 5000;
    
    if (needsLoader) {
        showGlobalLoader(
            'Loading view...',
            page === 'compare' ? 'Rendering compare panels' : page === 'config' ? 'Loading config viewer' : 'Rendering log viewer'
        );
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });
    
    const doPageInit = () => {
        try {
            if (page === 'compare' && state.files.length > 0) {
                updateCompareView();
            }
            
            if (page === 'viewer' && state.files.length > 0) {
                resolveViewerFileIndex();
                updateFileDropdown();
                if (state.currentFileIndex >= 0) {
                    displayLog(state.files[state.currentFileIndex]);
                } else {
                    displayLog(null);
                }
            }
            
            if (page === 'config') {
                updateConfigFileDropdown();
                const configs = state.files.filter(f => f.isConfig);
                if (configs.length > 0) {
                    const cfg = state.files[state.currentConfigFileIndex]?.isConfig
                        ? state.files[state.currentConfigFileIndex]
                        : configs[0];
                    state.currentConfigFileIndex = state.files.indexOf(cfg);
                    displayConfigFile(cfg);
                } else {
                    displayConfigFile(null);
                }
            }
            
            if (page === 'analytics') {
                if (state.issues && state.issues.length > 0) {
                    updateAnalytics();
                }
            }
            
            if (page === 'faqs') {
                renderFAQs();
            }
        } catch (err) {
            console.error('Error during page init:', err);
            showToast('Error loading page content', 'error');
        } finally {
            if (needsLoader) {
                hideGlobalLoader();
            }
        }
    };
    
    if (needsLoader) {
        // Use double-rAF to ensure the loader paints before heavy work begins
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                doPageInit();
            });
        });
    } else {
        doPageInit();
    }
}

// ============================================
// File Handling
// ============================================
function initFileDropZone() {
    const dropZone = document.getElementById('homeDropZone');
    const fileInput = document.getElementById('homeFileInput');
    
    if (!dropZone) return;
    
    const dropZoneFooter = dropZone.querySelector('.drop-zone-footer');
    if (dropZoneFooter) {
        dropZoneFooter.addEventListener('click', (e) => e.stopPropagation());
    }
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
    
    // Initialize compare page drop zone
    initCompareDropZone();
}

function initFileInputs() {
    const viewerInput = document.getElementById('viewerFileInput');
    const compareInput = document.getElementById('compareFileInput');
    
    if (viewerInput) {
        viewerInput.addEventListener('change', (e) => handleFiles(e.target.files, false, false));
    }
    
    if (compareInput) {
        // Compare page file input - stay on compare, sort intelligently
        compareInput.addEventListener('change', (e) => handleFiles(e.target.files, true, true));
    }
    
    const configInput = document.getElementById('configFileInput');
    if (configInput) {
        configInput.addEventListener('change', (e) => handleConfigPageFiles(e.target.files));
    }
}

/**
 * Load config-style files from the Config viewer page (stays on config when active).
 */
function handleConfigPageFiles(files) {
    const validFiles = Array.from(files).filter(file => {
        if (isConfigFilename(file.name)) return true;
        showToast(`Skipped ${file.name} — use .cfg, .ini, or .config here`, 'warning');
        return false;
    });
    if (validFiles.length === 0) return;
    
    const configPageActive = document.getElementById('page-config')?.classList.contains('active');
    const suppressToast = validFiles.length > 1;
    const configInput = document.getElementById('configFileInput');
    showGlobalLoader(`Loading ${validFiles.length} file(s)...`, 'Please wait');
    let pending = validFiles.length;
    const onConfigFileReaderDone = () => {
        pending--;
        if (pending > 0) return;
        updateConfigFileDropdown();
        if (configPageActive && validFiles.length > 0) {
            let pickIdx = -1;
            for (let i = validFiles.length - 1; i >= 0; i--) {
                const idx = state.files.findIndex(f => f.name === validFiles[i].name);
                if (idx >= 0) {
                    pickIdx = idx;
                    break;
                }
            }
            if (pickIdx >= 0) {
                state.currentConfigFileIndex = pickIdx;
                displayConfigFile(state.files[pickIdx]);
            }
        }
        hideGlobalLoader();
        showToast(`Loaded ${validFiles.length} config file${validFiles.length !== 1 ? 's' : ''}`, 'success');
        if (configInput) configInput.value = '';
    };
    setTimeout(() => {
        validFiles.forEach(file => loadFile(file, true, suppressToast, onConfigFileReaderDone));
    }, 50);
}

function handleFiles(files, sortIntelligently = false, skipNavigation = false) {
    const validFiles = Array.from(files).filter(file => {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.log') || lower.endsWith('.txt') || lower.endsWith('.cfg')
            || lower.endsWith('.ini') || lower.endsWith('.config')) {
            return true;
        } else {
            showToast(`Skipped ${file.name} - only .log, .txt, .cfg, .ini, and .config files supported`, 'warning');
            return false;
        }
    });
    
    if (validFiles.length === 0) return;
    
    if (sortIntelligently && validFiles.length > 1) {
        // Sort files intelligently: Business → Comms → Integration → Plugins
        validFiles.sort((a, b) => {
            const orderA = getFileOrder(a.name);
            const orderB = getFileOrder(b.name);
            return orderA - orderB;
        });
    }
    
    // Show global loader for file loading
    const loadMessage = validFiles.length > 1 
        ? `Loading ${validFiles.length} files...` 
        : `Loading ${validFiles[0].name}...`;
    showGlobalLoader(loadMessage, 'Please wait while files are processed');
    
    // Use setTimeout to allow the loader to render before blocking file operations
    setTimeout(() => {
        // Load all files (pass skipNavigation to each, suppress individual toasts)
        const suppressToast = validFiles.length > 1;
        validFiles.forEach(file => loadFile(file, skipNavigation, suppressToast));
        
        // Hide loader and show completion message
        setTimeout(() => {
            hideGlobalLoader();
            
            if (validFiles.length > 1) {
                if (sortIntelligently) {
                    const fileTypes = validFiles.map(f => detectEngineType(f.name));
                    showToast(`✓ Loaded ${validFiles.length} files: ${fileTypes.join(' → ')}`, 'success');
                } else {
                    showToast(`✓ Successfully loaded ${validFiles.length} files`, 'success');
                }
            }
        }, 100);
    }, 50);
}

function getFileOrder(filename) {
    const lower = filename.toLowerCase();
    
    // Business Engine - highest priority (1)
    if (lower.includes('business') || lower.includes('businessengine') || 
        lower.includes('business-engine') || lower.includes('business_engine')) {
        return 1;
    }
    
    // Comms Engine - second priority (2)
    if (lower.includes('comms') || lower.includes('commsengine') || 
        lower.includes('comms-engine') || lower.includes('comms_engine') ||
        lower.includes('communication')) {
        return 2;
    }
    
    // Integration Engine - third priority (3)
    if (lower.includes('integration') || lower.includes('integrationengine') || 
        lower.includes('integration-engine') || lower.includes('integration_engine')) {
        return 3;
    }
    
    // Plugin/Integration logs - lowest priority (4+)
    // CCure, Lenel, OnGuard, etc.
    if (lower.includes('ccure') || lower.includes('lenel') || lower.includes('onguard') ||
        lower.includes('plugin') || lower.includes('symmetry') || lower.includes('secure')) {
        return 4;
    }
    
    // Config files - after plugins (5)
    if (lower.endsWith('.cfg')) {
        return 5;
    }
    
    // Unknown files - last (6)
    return 6;
}

function detectEngineType(filename) {
    const lower = filename.toLowerCase();
    
    if (lower.includes('business')) return 'Business Engine';
    if (lower.includes('comms')) return 'Comms Engine';
    if (lower.includes('trakaweb') || lower.includes('mvcapp')) return 'TrakaWEB';
    
    // Integrations
    if (lower.includes('ccure')) return 'CCure Integration';
    if (lower.includes('lenel')) return 'Lenel Integration';
    if (lower.includes('onguard')) return 'OnGuard Integration';
    if (lower.includes('symmetry')) return 'Symmetry Integration';
    if (lower.includes('sipass')) return 'SiPass Integration';
    if (lower.includes('postbox')) return 'PostBox Integration';
    if (lower.includes('activedirectory') || lower.includes('active_directory')) return 'Active Directory Integration';
    
    // Generic integration engine components
    if (lower.includes('integration') && lower.includes('monitor')) return 'Integration Monitor';
    if (lower.includes('integration') && lower.includes('service')) return 'Integration Engine Service';
    if (lower.includes('integration')) return 'Integration Engine';
    
    if (lower.includes('secure')) return 'Secure Plugin';
    if (lower.endsWith('.cfg')) return 'Config';
    
    return 'Log File';
}

/**
 * Get display-friendly name for a file
 * Adds engine type prefix (e.g. "Business Engine - " or "Comms Engine - ") 
 * so the user can immediately tell which engine a log belongs to.
 * Works for all log files, not just generic debugging_log.txt.
 */
/**
 * Helper to format raw date strings from log filenames into clearly formatted local dates
 */
function formatArchiveDate(dateStr) {
    if (!dateStr) return '';
    
    // Check for 8-digit date: YYYYMMDD (e.g. 20260110)
    if (/^\d{8}$/.test(dateStr)) {
        const year = parseInt(dateStr.substring(0, 4), 10);
        const month = parseInt(dateStr.substring(4, 6), 10); // 1-12
        const day = parseInt(dateStr.substring(6, 8), 10);
        const d = new Date(year, month - 1, day);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '');
        }
    }
    
    // Check for YYYY-MM-DD (e.g. 2024-03-19)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const parts = dateStr.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month - 1, day);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '');
        }
    }
    
    // Fallback: return as-is (could be just an index like "1" or "2")
    return dateStr;
}

/**
 * Get a clean, short human-readable label for a log file.
 * Always visible in the panel header — no need to hover.
 * Examples: "Business Engine Log", "Comms Engine Log", "CCure Integration Log"
 */
function getShortLabel(file) {
    let baseLabel = '';
    
    if (file.engineType) {
        // Map engineType to clean short labels
        const labelMap = {
            'Business Engine':                'Business Engine Log',
            'Comms Engine':                   'Comms Engine Log',
            'TrakaWEB':                       'TrakaWEB Log',
            'Integration Engine Service':     'Integration Service Log',
            'Integration Monitor':            'Integration Monitor Log',
            'Active Directory Integration':   'Active Directory Integration Log',
            'SiPass Integration':             'SiPass Integration Log',
            'PostBox Integration':            'PostBox Integration Log',
            'Symmetry Integration':           'Symmetry Integration Log',
            'OnGuard Integration':            'OnGuard Integration Log',
            'Lenel Integration':              'OnGuard / Lenel Integration Log',
            'CCure Integration':              'CCure Integration Log',
            'Integration Log':                'Integration Log'
        };
        baseLabel = labelMap[file.engineType] || `${file.engineType} Log`;
    } else {
        // Fallback: try to detect from filename or content
        const lower = (file.originalName || file.name).toLowerCase();
        if (lower.includes('business')) baseLabel = 'Business Engine Log';
        else if (lower.includes('comms')) baseLabel = 'Comms Engine Log';
        else if (lower.includes('integration') && lower.includes('monitor')) baseLabel = 'Integration Monitor Log';
        else if (lower.includes('integration') && lower.includes('service')) baseLabel = 'Integration Service Log';
        else if (lower.includes('ccure')) baseLabel = 'CCure Integration Log';
        else if (lower.includes('sipass')) baseLabel = 'SiPass Integration Log';
        else if (lower.includes('symmetry')) baseLabel = 'Symmetry Integration Log';
        else if (lower.includes('onguard') || lower.includes('lenel')) baseLabel = 'OnGuard Integration Log';
        else if (lower.includes('postbox')) baseLabel = 'PostBox Integration Log';
        else if (lower.includes('activedirectory') || lower.includes('active_directory')) baseLabel = 'Active Directory Integration Log';
        else if (lower.includes('trakaweb') || lower.includes('mvcapp')) baseLabel = 'TrakaWEB Log';
        else baseLabel = file.originalName || file.name;
    }
    
    // Append archive suffixes (e.g. .txt.1, .log.20240319) or inline dates (e.g. Debugging_Log_20260110.txt)
    const original = file.originalName || file.name || '';
    
    // Check for suffix like .txt.1 or .log.20240319
    const suffixMatch = original.match(/\.(?:txt|log)\.([^.]+)$/i);
    if (suffixMatch && baseLabel !== original) {
        baseLabel += ` (${formatArchiveDate(suffixMatch[1])})`;
    } else {
        // Check for inline date/number like Debugging_Log_20260110.txt
        const inlineMatch = original.match(/[_-]([0-9-]+)\.(?:txt|log|cfg)$/i);
        if (inlineMatch && baseLabel !== original) {
            baseLabel += ` (${formatArchiveDate(inlineMatch[1])})`;
        }
    }
    
    return baseLabel;
}

function getDisplayFileName(file) {
    const filename = file.name;
    const lower = filename.toLowerCase();
    
    // Skip config files - they don't need an engine prefix
    if (lower.endsWith('.cfg')) {
        return filename;
    }
    
    // If the file has an engineType, use the short label
    if (file.engineType) {
        return getShortLabel(file);
    }
    
    // First, try to detect engine type from the filename itself
    const filenameEngineType = detectEngineType(filename);
    
    // If the filename already clearly identifies the engine, prefix it
    if (filenameEngineType === 'Business Engine') {
        if (!lower.startsWith('business engine')) {
            return `Business Engine - ${filename}`;
        }
        return filename;
    }
    if (filenameEngineType === 'Comms Engine') {
        if (!lower.startsWith('comms engine')) {
            return `Comms Engine - ${filename}`;
        }
        return filename;
    }
    if (filenameEngineType === 'Integration Engine') {
        if (!lower.startsWith('integration engine')) {
            return `Integration Engine - ${filename}`;
        }
        return filename;
    }
    
    // For generic filenames like "debugging_log.txt", detect from content
    if (lower === 'debugging_log.txt' || lower === 'debugging_log.log') {
        const engineType = detectEngineTypeFromContent(file);
        if (engineType && engineType !== 'Log File') {
            return `${engineType} - ${filename}`;
        }
    }
    
    return filename;
}

/**
 * Detect engine type from file content when filename is generic
 */
function detectEngineTypeFromContent(file) {
    if (!file.content && (!file.lines || file.lines.length === 0)) {
        return 'Business Engine'; // Default assumption for BE logs
    }
    
    // Check first few hundred lines for engine indicators
    const linesToCheck = file.lines ? file.lines.slice(0, 200).join('\n').toLowerCase() : '';
    
    if (linesToCheck.includes('business engine') || linesToCheck.includes('businessengine')) {
        return 'Business Engine';
    }
    if (linesToCheck.includes('comms engine') || linesToCheck.includes('commsengine')) {
        return 'Comms Engine';
    }
    if (linesToCheck.includes('integration engine') || linesToCheck.includes('integrationengine')) {
        return 'Integration Engine';
    }
    
    // Default to Business Engine for Debugging_log.txt as it's typically the BE log
    return 'Business Engine';
}

function loadFile(file, skipNavigation = false, suppressToast = false, onLoaded = null) {
    const reader = new FileReader();
    const finishLoad = () => {
        if (typeof onLoaded === 'function') onLoaded();
    };
    
    reader.onload = (e) => {
        const content = e.target.result;
        const isConfig = isConfigFilename(file.name);
        const fileData = {
            name: file.name,
            originalName: file.name,
            path: file.path, // Desktop Edition provides absolute path here
            size: file.size,
            lastModified: new Date(file.lastModified),
            content: content,
            lines: content.split(/\r?\n/),
            fileHandle: file, // Store original File object for live monitoring
            isConfig: isConfig, // Flag to identify config files
            engineType: null
        };
        
        // Detect engine type
        const lowerName = file.name.toLowerCase();
        if (lowerName === 'debugging_log.txt' || lowerName === 'debugging_log.log') {
            fileData.engineType = detectEngineTypeFromContent(fileData);
        } else {
            const detected = detectEngineType(file.name);
            if (detected !== 'Log File') {
                fileData.engineType = detected;
            }
        }
        
        // Check if file already loaded
        const existingIndex = state.files.findIndex(f => f.name === file.name);
        if (existingIndex >= 0) {
            state.files[existingIndex] = fileData;
        } else {
            state.files.push(fileData);
        }
        
        // Save current viewer file to maintain selection after sorting
        const currentViewerFile = state.currentFileIndex >= 0 && state.files[state.currentFileIndex] 
            ? state.files[state.currentFileIndex].name 
            : null;
            
        // Always sort files so they appear in correct priority order automatically
        state.files = sortFilesForCompare(state.files);
        
        // Restore currentFileIndex to point to the correct file after sort
        if (currentViewerFile) {
            state.currentFileIndex = state.files.findIndex(f => f.name === currentViewerFile);
        }
        
        // Initialize last read position for live tail
        state.lastReadPositions.set(file.name, content.length);
        
        applyLoadOptionsToLogFile(fileData);
        // Parse and analyze (config files never skip parsing; issues skipped in detectIssues for .cfg)
        parseLogFile(fileData);
        if (!isConfig) {
            detectIssues(fileData);
            if (fileData.skipIssueAnalysis) {
                updateIssuesUI();
            }
        }
        
        // Update UI
        updateUI();
        updateFileDropdown();
        updateConfigFileDropdown();
        updateFilesList();
        
        // Only rebuild compare view if currently on the compare page
        const comparePage = document.getElementById('page-compare');
        if (comparePage && comparePage.classList.contains('active')) {
            updateCompareView();
        }
        
        // Auto-select first log only if single non-config load
        if (!skipNavigation && state.files.length === 1 && !isConfig) {
            resolveViewerFileIndex();
            if (state.currentFileIndex >= 0) {
                displayLog(state.files[state.currentFileIndex]);
            }
        }
        
        // Navigate on single-file loads (batch sets suppressToast so we stay put)
        if (!skipNavigation && !suppressToast) {
            if (isConfig) {
                state.currentConfigFileIndex = state.files.findIndex(f => f.name === fileData.name);
                navigateTo('config');
            } else {
                navigateTo('viewer');
            }
        }
        
        // Show individual toast only if not suppressed (for batch loading)
        if (!suppressToast) {
            const fileType = isConfig ? 'config file' : 'log file';
            showToast(`Loaded ${file.name} as ${fileType} (${formatFileSize(file.size)})`, 'success');
        }
        finishLoad();
    };
    
    reader.onerror = () => {
        showToast(`Failed to load ${file.name}`, 'error');
        finishLoad();
    };
    
    reader.readAsText(file);
}

function parseLogFile(fileData) {
    const parsed = fileData.lines.map((line, index) => {
        const entry = {
            lineNumber: index + 1,
            raw: line,
            level: detectLogLevel(line),
            timestamp: extractTimestamp(line),
            message: line
        };
        return entry;
    });
    
    state.parsedLogs.set(fileData.name, parsed);
}

// Pre-compile regular expressions for performance
const logLevelErrorRegex = /\berror\b|\bfail|\bexception\b|\bcritical\b|\bfatal\b/;
const logLevelWarnRegex = /\bwarn\b|\bwarning\b/;
const logLevelInfoRegex = /\binfo\b|\binformation\b/;
const logLevelDebugRegex = /\bdebug\b|\btrace\b|\bverbose\b/;

function detectLogLevel(line) {
    const lowerLine = line.toLowerCase();
    if (logLevelErrorRegex.test(lowerLine)) return 'error';
    if (logLevelWarnRegex.test(lowerLine)) return 'warning';
    if (logLevelInfoRegex.test(lowerLine)) return 'info';
    if (logLevelDebugRegex.test(lowerLine)) return 'debug';
    return 'default';
}

// Common timestamp patterns - pre-compiled for performance
const timestampPatterns = [
    // ISO format with optional milliseconds: 2024-01-19 14:25:30.123 or 2024-01-19T14:25:30.123
    /(\d{4}-\d{2}-\d{2}[T\s]+\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
    // UK/European format with optional milliseconds: 19/01/2024 14:25:30.123
    /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
    // US format with optional milliseconds: 01-19-2024 14:25:30.123
    /(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
    // Time only with optional milliseconds in brackets: [14:25:30.123]
    /\[(\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)\]/,
    // Time only with optional milliseconds: 14:25:30.123
    /\b(\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)\b/
];

function extractTimestamp(line) {
    // Fast path: if line has no numbers, it can't have a timestamp
    if (!/\d/.test(line)) return null;
    
    for (const pattern of timestampPatterns) {
        const match = line.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// ============================================
// Issue Detection
// ============================================
function detectIssues(fileData) {
    if (!fileData || fileData.isConfig || fileData.isStitched || fileData.skipIssueAnalysis) {
        return;
    }
    const fileIssues = [];
    
    // Pre-compile custom regexes for this file to avoid recreating them for every line
    const compiledCustomPatterns = state.settings.customPatterns.map(custom => {
        try {
            return {
                ...custom,
                regex: new RegExp(custom.pattern, 'i')
            };
        } catch (e) {
            return null;
        }
    }).filter(Boolean);
    
    // Check if file is small enough for synchronous processing to avoid UI flash,
    // otherwise use chunked async processing
    if (fileData.lines.length < 50000) {
        detectIssuesSync(fileData, fileIssues, compiledCustomPatterns);
    } else {
        detectIssuesAsync(fileData, fileIssues, compiledCustomPatterns);
    }
}

function detectIssuesSync(fileData, fileIssues, compiledCustomPatterns) {
    processIssueChunk(fileData, fileIssues, compiledCustomPatterns, 0, fileData.lines.length);
    finalizeIssueDetection(fileData, fileIssues);
}

function detectIssuesAsync(fileData, fileIssues, compiledCustomPatterns, startIndex = 0) {
    const CHUNK_SIZE = 25000;
    const endIndex = Math.min(startIndex + CHUNK_SIZE, fileData.lines.length);
    
    processIssueChunk(fileData, fileIssues, compiledCustomPatterns, startIndex, endIndex);
    
    if (endIndex < fileData.lines.length) {
        // Yield to main thread
        setTimeout(() => {
            detectIssuesAsync(fileData, fileIssues, compiledCustomPatterns, endIndex);
        }, 0);
    } else {
        finalizeIssueDetection(fileData, fileIssues);
    }
}

function processIssueChunk(fileData, fileIssues, compiledCustomPatterns, startIndex, endIndex) {
    for (let index = startIndex; index < endIndex; index++) {
        const line = fileData.lines[index];
        
        // First, check solution database for known issues with solutions
        const solution = matchSolution(line);
        if (solution) {
            fileIssues.push({
                id: `${fileData.name}-${index}-${Date.now()}`,
                file: fileData.name,
                line: index + 1,
                content: line,
                severity: solution.severity.toLowerCase(),
                category: solution.category.toLowerCase(),
                title: solution.title,
                description: `${solution.category} issue detected`,
                pattern: solution.pattern.toString(),
                hasSolution: true,
                solution: solution
            });
            continue; // Skip other pattern checks if we found a solution
        }
        
        // Then check regular issue patterns
        for (const pattern of issuePatterns) {
            if (pattern.pattern.test(line)) {
                // Check if issue detection is enabled for this type
                if (!shouldDetectIssue(pattern)) continue;
                
                fileIssues.push({
                    id: `${fileData.name}-${index}-${Date.now()}`,
                    file: fileData.name,
                    line: index + 1,
                    content: line,
                    severity: pattern.severity,
                    category: pattern.category,
                    title: pattern.title,
                    description: pattern.description,
                    pattern: pattern.pattern.toString(),
                    hasSolution: false
                });
                break; // Only first matching pattern per line
            }
        }
        
        // Check custom patterns
        for (const custom of compiledCustomPatterns) {
            if (custom.regex.test(line)) {
                fileIssues.push({
                    id: `${fileData.name}-${index}-custom-${Date.now()}`,
                    file: fileData.name,
                    line: index + 1,
                    content: line,
                    severity: custom.severity,
                    category: custom.severity,
                    title: 'Custom Pattern Match',
                    description: custom.description || 'Custom pattern detected',
                    pattern: custom.pattern,
                    hasSolution: false
                });
            }
        }
    }
}

function finalizeIssueDetection(fileData, fileIssues) {
    // Remove old issues for this file and add new ones
    state.issues = state.issues.filter(i => i.file !== fileData.name);
    state.issues = [...state.issues, ...fileIssues];
    
    // Sort by severity
    const severityOrder = { critical: 0, error: 1, warning: 2, performance: 3, info: 4 };
    state.issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    updateIssuesUI();
    updateAnalytics(); // Update analytics dashboard
    
    // Initialize/refresh solutions panel
    if (typeof initializeSolutionsPanel === 'function') {
        initializeSolutionsPanel();
    }
}

function shouldDetectIssue(pattern) {
    const s = state.settings;
    if (pattern.title.toLowerCase().includes('error') && !s.detectErrors) return false;
    if (pattern.title.toLowerCase().includes('exception') && !s.detectExceptions) return false;
    if (pattern.title.toLowerCase().includes('timeout') && !s.detectTimeouts) return false;
    if (pattern.title.toLowerCase().includes('connection') && !s.detectConnections) return false;
    if (pattern.title.toLowerCase().includes('auth') && !s.detectAuth) return false;
    if (pattern.category === 'performance' && !s.detectPerformance) return false;
    if (pattern.title.toLowerCase().includes('license') && !s.detectLicensing) return false;
    if (pattern.title.toLowerCase().includes('database') && !s.detectDatabase) return false;
    if (pattern.title.toLowerCase().includes('integration') && !s.detectIntegration) return false;
    if (pattern.title.toLowerCase().includes('cabinet') && !s.detectCabinet) return false;
    if (pattern.title.toLowerCase().includes('api') && !s.detectAPI) return false;
    return true;
}

// ============================================
// Log Display
// ============================================

function updateDateFilterLimits(entries) {
    const dateFromInput = document.getElementById('dateFrom');
    const dateToInput = document.getElementById('dateTo');
    
    if (!dateFromInput || !dateToInput) return;
    
    if (!entries || entries.length === 0) {
        dateFromInput.removeAttribute('min');
        dateFromInput.removeAttribute('max');
        dateToInput.removeAttribute('min');
        dateToInput.removeAttribute('max');
        return;
    }
    
    let minTime = Infinity;
    let maxTime = -Infinity;
    let lastKnownTime = 0;
    
    for (const entry of entries) {
        let time = null;
        if (entry.cachedTime) {
            time = entry.cachedTime;
        } else if (entry.sortableTimestamp) {
            time = entry.sortableTimestamp;
            entry.cachedTime = time;
        } else if (entry.timestamp) {
            time = typeof parseTimestampForStitch === 'function' ? parseTimestampForStitch(entry.timestamp) : new Date(entry.timestamp).getTime();
            entry.cachedTime = time; // Cache it for future calls
        }
        
        if (time !== null && !isNaN(time) && time > 0) {
            lastKnownTime = time;
            if (time < minTime) minTime = time;
            if (time > maxTime) maxTime = time;
        } else if (lastKnownTime > 0) {
            // If it has no timestamp (stack trace, stitch break), inherit the last known time
            // so it stays grouped with its parent entry during date filtering!
            entry.cachedTime = lastKnownTime;
        }
    }
    
    // Quick backward pass to ensure files that start with no timestamp don't get completely dropped
    let firstValidTime = 0;
    for (const entry of entries) {
        if (entry.cachedTime > 0) {
            firstValidTime = entry.cachedTime;
            break;
        }
    }
    if (firstValidTime > 0) {
        for (const entry of entries) {
            if (!entry.cachedTime || entry.cachedTime === 0) {
                entry.cachedTime = firstValidTime;
            }
        }
    }
    
    if (minTime !== Infinity && maxTime !== -Infinity) {
        const toLocalISOString = (timestamp) => {
            const date = new Date(timestamp);
            const pad = (n) => (n < 10 ? '0' + n : n);
            return date.getFullYear() + '-' +
                   pad(date.getMonth() + 1) + '-' +
                   pad(date.getDate()) + 'T' +
                   pad(date.getHours()) + ':' +
                   pad(date.getMinutes());
        };
        
        const minStr = toLocalISOString(minTime);
        const maxStr = toLocalISOString(maxTime);
        
        dateFromInput.min = minStr;
        dateFromInput.max = maxStr;
        dateToInput.min = minStr;
        dateToInput.max = maxStr;
        
        if (state.dateFromPicker) {
            state.dateFromPicker.set('minDate', minTime);
            state.dateFromPicker.set('maxDate', maxTime);
        }
        if (state.dateToPicker) {
            state.dateToPicker.set('minDate', minTime);
            state.dateToPicker.set('maxDate', maxTime);
        }
    } else {
        dateFromInput.removeAttribute('min');
        dateFromInput.removeAttribute('max');
        dateToInput.removeAttribute('min');
        dateToInput.removeAttribute('max');
        
        if (state.dateFromPicker) {
            state.dateFromPicker.set('minDate', null);
            state.dateFromPicker.set('maxDate', null);
        }
        if (state.dateToPicker) {
            state.dateToPicker.set('minDate', null);
            state.dateToPicker.set('maxDate', null);
        }
    }
}

function displayLog(fileData) {
    const gutter = document.getElementById('logGutter');
    const content = document.getElementById('logContent');
    const toggleContainer = document.getElementById('stitchBreakToggleContainer');
    
    if (fileData && fileData.isStitched) {
        displayStitchedLog(fileData);
        updateIssuesUI();
        return;
    }
    
    hideStitchLegend();
    
    if (toggleContainer) {
        toggleContainer.style.display = 'none';
    }
    
    if (!fileData) {
        content.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p>No log file loaded</p>
                <span>Load a log file to start analyzing</span>
            </div>
        `;
        gutter.innerHTML = '';
        return;
    }
    
    const parsed = state.parsedLogs.get(fileData.name) || [];
    
    // Update date filter limits based on the loaded log
    updateDateFilterLimits(parsed);
    
    let filteredLines = filterLines(parsed);
    
    // Apply date sorting if enabled
    filteredLines = sortLogLinesByDate(filteredLines);
    
    // Performance optimization: Show loading for large files
    if (filteredLines.length > 5000) {
        content.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="spin-animation">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                <p>Rendering large log file...</p>
                <span>${filteredLines.length.toLocaleString()} lines</span>
            </div>
        `;
        
        // Defer rendering to prevent UI blocking (reduced to 50ms for faster response)
        setTimeout(() => renderLogOptimized(fileData, filteredLines, gutter, content), 50);
    } else {
        renderLogOptimized(fileData, filteredLines, gutter, content);
    }
    
    updateIssuesUI();
}

/**
 * Build inner HTML for one config file line: optional custom highlights, then syntax styling.
 * Uses state.configHighlightRules only (independent from log highlight rules).
 */
function formatConfigLineInnerHtml(entry, fileName) {
    const raw = entry.raw;
    const rules = state.configHighlightRules;
    const hasCfgRules = rules && rules.length > 0;

    if (hasCfgRules) {
        const core = applyHighlightRulesWithRules(raw, fileName, rules);
        if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
            return `<span style="color: var(--accent-primary); font-weight: 600;">${core}</span>`;
        }
        if (raw.trim().startsWith('#') || raw.trim().startsWith(';')) {
            return `<span style="color: var(--text-tertiary); font-style: italic;">${core}</span>`;
        }
        return core;
    }

    let highlightedLine = escapeHtml(raw);
    if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
        highlightedLine = `<span style="color: var(--accent-primary); font-weight: 600;">${highlightedLine}</span>`;
    } else if (raw.trim().startsWith('#') || raw.trim().startsWith(';')) {
        highlightedLine = `<span style="color: var(--text-tertiary); font-style: italic;">${highlightedLine}</span>`;
    } else if (raw.includes('=')) {
        const parts = raw.split('=');
        if (parts.length >= 2) {
            const key = escapeHtml(parts[0]);
            const value = escapeHtml(parts.slice(1).join('='));
            highlightedLine = `<span style="color: var(--accent-secondary);">${key}</span>=<span style="color: var(--text-primary);">${value}</span>`;
        }
    }
    return highlightedLine;
}

/**
 * Render a loaded .cfg / .ini / .config in the Config viewer (separate DOM from Log Viewer).
 */
function displayConfigFile(fileData) {
    syncConfigPageViewModeControls();
    if (state.configViewMode === 'multi') {
        cleanupViewerVirtualScroll();
        renderConfigMultiView();
        return;
    }

    const gutter = document.getElementById('configLogGutter');
    const content = document.getElementById('configLogContent');
    if (!gutter || !content) return;

    cleanupViewerVirtualScroll();

    if (!fileData || !fileData.isConfig) {
        content.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p>No config file loaded</p>
                <span>Load a config from Home, Log Viewer, or use Load config on this page.</span>
            </div>
        `;
        gutter.innerHTML = '';
        const st = document.getElementById('configViewerStats');
        if (st) st.textContent = 'No file loaded';
        updateConfigHighlightResults();
        return;
    }

    if (!state.parsedLogs.has(fileData.name)) {
        parseLogFile(fileData);
    }
    const parsed = state.parsedLogs.get(fileData.name) || [];
    let filteredLines = [...parsed];
    filteredLines = sortLogLinesByDate(filteredLines);

    if (filteredLines.length > 5000) {
        content.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="spin-animation">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                <p>Rendering config file...</p>
                <span>${filteredLines.length.toLocaleString()} lines</span>
            </div>
        `;
        setTimeout(() => renderLogOptimized(fileData, filteredLines, gutter, content, 'configViewerStats'), 50);
    } else {
        renderLogOptimized(fileData, filteredLines, gutter, content, 'configViewerStats');
    }

    updateConfigHighlightResults();
}

// ============================================
// Config page: single file vs multi-view (compare-style panels)
// ============================================

function loadConfigViewMode() {
    try {
        const v = localStorage.getItem('traka-config-view-mode');
        if (v === 'single' || v === 'multi') {
            state.configViewMode = v;
        }
    } catch (e) {
        /* ignore */
    }
}

function loadConfigMultiLayout() {
    try {
        const v = localStorage.getItem('traka-config-multi-layout');
        if (v === 'stacked' || v === 'sideBySide') {
            state.configMultiLayout = v;
        }
    } catch (e) {
        /* ignore */
    }
}

function saveConfigMultiLayout() {
    try {
        localStorage.setItem('traka-config-multi-layout', state.configMultiLayout);
    } catch (e) {
        /* ignore */
    }
}

function syncConfigPageViewModeControls() {
    const page = document.getElementById('page-config');
    if (page) {
        page.classList.toggle('config-view-multi', state.configViewMode === 'multi');
    }
    const modeSel = document.getElementById('configViewModeSelect');
    if (modeSel) {
        modeSel.value = state.configViewMode;
    }
    const layoutSel = document.getElementById('configMultiLayoutSelect');
    if (layoutSel) {
        layoutSel.value = state.configMultiLayout;
        layoutSel.style.display = state.configViewMode === 'multi' ? '' : 'none';
    }
    const multiHost = document.getElementById('configMultiViewHost');
    const singleHost = document.getElementById('configSingleViewHost');
    if (multiHost) {
        multiHost.setAttribute('aria-hidden', state.configViewMode === 'single' ? 'true' : 'false');
    }
    if (singleHost) {
        singleHost.setAttribute('aria-hidden', state.configViewMode === 'multi' ? 'true' : 'false');
    }
    const diffBtn = document.getElementById('configHighlightDiffBtn');
    if (diffBtn) {
        const cfgCount = state.files.filter(f => f.isConfig).length;
        const showDiff = state.configViewMode === 'multi' && cfgCount >= 2;
        diffBtn.style.display = showDiff ? '' : 'none';
        if (!showDiff) {
            diffBtn.classList.remove('active');
        }
    }
}

function setConfigViewMode(mode) {
    if (mode !== 'single' && mode !== 'multi') {
        return;
    }
    state.configViewMode = mode;
    try {
        localStorage.setItem('traka-config-view-mode', mode);
    } catch (e) {
        /* ignore */
    }
    syncConfigPageViewModeControls();
    if (mode === 'multi') {
        cleanupViewerVirtualScroll();
        renderConfigMultiView();
    } else {
        resetConfigMultiDiffHighlightsForReload();
        cleanupConfigMultiVirtualScroll();
        const cc = document.getElementById('configMultiContainer');
        if (cc) {
            cc.innerHTML = '';
        }
        const cfg = state.files[state.currentConfigFileIndex]?.isConfig
            ? state.files[state.currentConfigFileIndex]
            : state.files.find(f => f.isConfig);
        displayConfigFile(cfg || null);
    }
}

function applyConfigMultiLayoutToDom() {
    const container = document.getElementById('configMultiContainer');
    const sel = document.getElementById('configMultiLayoutSelect');
    if (sel) {
        sel.value = state.configMultiLayout;
    }
    const stacked = state.configMultiLayout === 'stacked';
    if (container) {
        container.classList.toggle('compare-layout-stacked', stacked);
    }
}

function setConfigMultiLayout(layout) {
    if (layout !== 'stacked' && layout !== 'sideBySide') {
        return;
    }
    state.configMultiLayout = layout;
    saveConfigMultiLayout();
    applyConfigMultiLayoutToDom();
    requestAnimationFrame(() => {
        refreshConfigMultiVirtualScrollLayout();
    });
    showToast(
        layout === 'stacked' ? 'Config layout: stacked (top to bottom)' : 'Config layout: side by side',
        'info'
    );
}

function cleanupConfigMultiVirtualScroll() {
    state.configMultiVirtualScroll = null;
}

function refreshConfigMultiVirtualScrollLayout() {
    if (!state.configMultiVirtualScroll) {
        return;
    }
    state.configMultiVirtualScroll.forEach((vs, idx) => {
        if (vs) {
            vs.lastRenderedStart = -1;
            vs.lastRenderedEnd = -1;
            updateConfigMultiPanelViewport(idx, true);
        }
    });
}

function renderConfigMultiView() {
    syncConfigPageViewModeControls();
    resetConfigMultiDiffHighlightsForReload();
    cleanupViewerVirtualScroll();
    const container = document.getElementById('configMultiContainer');
    if (!container) {
        return;
    }

    const configFiles = state.files.filter(f => f.isConfig);

    if (configFiles.length === 0) {
        cleanupConfigMultiVirtualScroll();
        container.removeAttribute('data-file-count');
        container.innerHTML = `
            <div class="compare-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p class="drop-title">No config files loaded</p>
                <span class="drop-instruction">Load .cfg, .ini, or .config files from Home, Log Viewer, or use <strong>Load config</strong> above.</span>
            </div>
        `;
        applyConfigMultiLayoutToDom();
        const st = document.getElementById('configViewerStats');
        if (st) {
            st.textContent = 'No file loaded';
        }
        updateConfigHighlightResults();
        return;
    }

    container.setAttribute('data-file-count', String(configFiles.length));
    container.style.setProperty('--file-count', String(configFiles.length));

    const panelsHtml = configFiles.map((file, panelIndex) => {
        const index = state.files.indexOf(file);
        if (!state.parsedLogs.has(file.name)) {
            parseLogFile(file);
        }
        let filteredLines = [...(state.parsedLogs.get(file.name) || [])];
        filteredLines = sortLogLinesByDate(filteredLines);
        const lineCount = filteredLines.length;
        const shortLabel = getShortLabel(file);
        const originalFile = file.originalName || file.name;
        return `
        <div class="compare-panel" data-index="${index}">
            <div class="compare-panel-header">
                <div class="compare-panel-title-group">
                    <h4 title="${escapeHtml(file.path || originalFile)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span class="panel-title-text">${escapeHtml(shortLabel)}</span>
                    </h4>
                    <div class="file-badge">${lineCount.toLocaleString()} lines &middot; ${formatFileSize(file.size)}</div>
                </div>
                <div class="compare-panel-actions">
                    <button class="btn-icon panel-maximize-btn" onclick="toggleConfigMultiMaximize(${index})" title="Maximize this panel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="removeFile(${index})" title="Remove file">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="compare-panel-content virtual-scroll-mode" data-panel-index="${panelIndex}">
                <div class="virtual-scroll-spacer" style="height: ${lineCount * 20}px; position: relative;">
                    <div class="virtual-scroll-viewport" style="position: absolute; left: 0; right: 0; will-change: transform;"></div>
                </div>
            </div>
        </div>
    `;
    }).join('');

    container.innerHTML = panelsHtml;
    initConfigMultiVirtualScroll(container, configFiles);
    applyConfigMultiLayoutToDom();
    requestAnimationFrame(() => {
        refreshConfigMultiVirtualScrollLayout();
    });

    const totalLines = configFiles.reduce((s, f) => s + f.lines.length, 0);
    const st = document.getElementById('configViewerStats');
    if (st) {
        st.textContent =
            configFiles.length === 1
                ? `1 file · ${totalLines.toLocaleString()} lines`
                : `${configFiles.length} files · ${totalLines.toLocaleString()} lines`;
    }
    updateConfigHighlightResults();
}

function initConfigMultiVirtualScroll(container, configFiles) {
    cleanupConfigMultiVirtualScroll();

    const lineHeight = 20;
    const OVERSCAN = 150;
    state.configMultiVirtualScroll = configFiles.map((file, panelIndex) => {
        if (!state.parsedLogs.has(file.name)) {
            parseLogFile(file);
        }
        let filteredLines = [...(state.parsedLogs.get(file.name) || [])];
        filteredLines = sortLogLinesByDate(filteredLines);

        const panelContent = container.querySelector(`[data-panel-index="${panelIndex}"]`);
        if (!panelContent) {
            return null;
        }
        const viewport = panelContent.querySelector('.virtual-scroll-viewport');
        const globalIndex = state.files.indexOf(file);

        const vsState = {
            file,
            filteredLines,
            panelContent,
            viewport,
            lineHeight,
            overscan: OVERSCAN,
            lastRenderedStart: -1,
            lastRenderedEnd: -1,
            fileIndex: globalIndex
        };

        panelContent.addEventListener(
            'scroll',
            () => {
                updateConfigMultiPanelViewport(panelIndex);
            },
            { passive: true }
        );

        updateConfigMultiPanelViewport(panelIndex, true);
        return vsState;
    });

    requestAnimationFrame(() => {
        if (!state.configMultiVirtualScroll) {
            return;
        }
        state.configMultiVirtualScroll.forEach((vs, idx) => {
            if (vs) {
                vs.lastRenderedStart = -1;
                vs.lastRenderedEnd = -1;
                updateConfigMultiPanelViewport(idx, true);
            }
        });
    });
}

function updateConfigMultiPanelViewport(index, force) {
    const cms = state.configMultiVirtualScroll;
    if (!cms || !cms[index]) {
        return;
    }

    const vs = cms[index];
    const scrollTop = vs.panelContent.scrollTop;
    const clientHeight = vs.panelContent.clientHeight || 600;

    const visibleStart = Math.floor(scrollTop / vs.lineHeight);
    const visibleEnd = Math.ceil((scrollTop + clientHeight) / vs.lineHeight);

    if (!force && vs.lastRenderedStart >= 0) {
        const safeTop = vs.lastRenderedStart + vs.overscan * 0.4;
        const safeBot = vs.lastRenderedEnd - vs.overscan * 0.4;
        if (visibleStart >= safeTop && visibleEnd <= safeBot) {
            return;
        }
    }

    const fl = vs.filteredLines;
    const startIdx = Math.max(0, visibleStart - vs.overscan);
    const endIdx = Math.min(fl.length, visibleEnd + vs.overscan);

    vs.lastRenderedStart = startIdx;
    vs.lastRenderedEnd = endIdx;

    const html = [];
    const fileName = vs.file.name;
    const panelIdx = index;
    const diffActive =
        state.configMultiDiffHighlightActive &&
        state.configMultiDiffSets &&
        state.configMultiDiffSets.length > panelIdx;

    for (let i = startIdx; i < endIdx; i++) {
        const entry = fl[i];
        const inner = formatConfigLineInnerHtml(entry, fileName);
        let diffClass = '';
        if (diffActive) {
            const rawTrim = String(entry.raw || '').trim();
            if (rawTrim) {
                const others = state.configMultiDiffSets.filter((_, j) => j !== panelIdx);
                const isUnique = !others.some(s => s.has(rawTrim));
                diffClass = isUnique ? ' highlight-unique' : ' highlight-common';
            }
        }
        html.push(
            `<div class="log-line config-line${diffClass}" data-line="${entry.lineNumber}">${inner || '&nbsp;'}</div>`
        );
    }

    vs.viewport.innerHTML = html.join('');
    vs.viewport.style.transform = `translateY(${startIdx * vs.lineHeight}px)`;
}

function toggleConfigMultiMaximize(fileIndex) {
    const container = document.getElementById('configMultiContainer');
    if (!container) {
        return;
    }
    const panels = container.querySelectorAll('.compare-panel');
    const targetPanel = container.querySelector(`.compare-panel[data-index="${fileIndex}"]`);
    if (!targetPanel) {
        return;
    }

    const isMaximized = targetPanel.classList.contains('panel-maximized');

    if (isMaximized) {
        restoreConfigMultiMaximized();
    } else {
        container.classList.add('has-maximized-panel');

        panels.forEach(panel => {
            const idx = parseInt(panel.getAttribute('data-index'), 10);
            if (idx === fileIndex) {
                panel.classList.add('panel-maximized');
                const btn = panel.querySelector('.panel-maximize-btn');
                if (btn) {
                    btn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                        </svg>
                    `;
                    btn.title = 'Restore panel (ESC)';
                }
            } else {
                panel.classList.add('panel-hidden');
            }
        });
        requestAnimationFrame(() => {
            refreshConfigMultiVirtualScrollLayout();
        });
    }
}

function restoreConfigMultiMaximized() {
    const container = document.getElementById('configMultiContainer');
    if (!container) {
        return;
    }
    container.classList.remove('has-maximized-panel');
    container.querySelectorAll('.compare-panel').forEach(panel => {
        panel.classList.remove('panel-maximized', 'panel-hidden');
        const btn = panel.querySelector('.panel-maximize-btn');
        if (btn) {
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
            `;
            btn.title = 'Maximize this panel';
        }
    });
    requestAnimationFrame(() => {
        refreshConfigMultiVirtualScrollLayout();
    });
}

function resetConfigMultiDiffHighlightsForReload() {
    closeConfigDiffSummary();
    const infoOv = document.querySelector('.config-diff-info-overlay');
    if (infoOv) {
        infoOv.remove();
    }
    state.configMultiDiffHighlightActive = false;
    state.configMultiDiffSets = null;
    const diffBtn = document.getElementById('configHighlightDiffBtn');
    if (diffBtn) {
        diffBtn.classList.remove('active');
    }
}

/**
 * Highlight Differences for loaded config files only (Config Viewer → Multi-view).
 * Independent from Compare / log files and from the shared diff-info skip for logs.
 */
function highlightDifferencesConfigMulti() {
    if (state.configViewMode !== 'multi') {
        showToast('Switch to multi-view to compare configs', 'info');
        return;
    }
    const configFiles = state.files.filter(f => f.isConfig);
    if (configFiles.length < 2) {
        showToast('Need at least 2 config files to compare', 'warning');
        return;
    }
    showConfigDiffInfoDialog(configFiles.length);
}

function showConfigDiffInfoDialog(configFileCount) {
    const existing = document.querySelector('.config-diff-info-overlay');
    if (existing) {
        existing.remove();
    }

    const dialogHTML = `
        <div class="config-diff-info-overlay" onclick="closeConfigDiffInfoDialog()">
            <div class="diff-info-dialog" onclick="event.stopPropagation()">
                <div class="diff-info-header">
                    <div class="diff-info-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 16v-4"></path>
                            <path d="M12 8h.01"></path>
                        </svg>
                    </div>
                    <h3>Compare config files</h3>
                    <button class="btn-icon" onclick="closeConfigDiffInfoDialog()" title="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="diff-info-body">
                    <p class="diff-info-lead">
                        This runs only on <strong>loaded config files</strong> in multi-view here. It does not use log files or the Compare page — you can keep logs loaded for analysis elsewhere without affecting this result.
                    </p>
                    <div class="diff-info-examples">
                        <div class="diff-info-good">
                            <div class="diff-info-example-header">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <strong>Great for</strong>
                            </div>
                            <ul>
                                <li>Two customer <code>.cfg</code> copies — see what changed</li>
                                <li>Before/after conflict exports that should be nearly identical</li>
                            </ul>
                        </div>
                        <div class="diff-info-bad">
                            <div class="diff-info-example-header">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                <strong>Remember</strong>
                            </div>
                            <ul>
                                <li>Very different configs will show many &quot;unique&quot; lines — same idea as on Compare</li>
                            </ul>
                        </div>
                    </div>
                    <div class="diff-info-note">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                        <span>You have <strong>${configFileCount} config file${configFileCount !== 1 ? 's' : ''}</strong> in this view. ${configFileCount > 2 ? 'With more than 2 files, expect more highlighted differences.' : 'Lines are matched as trimmed text across all of them.'}</span>
                    </div>
                </div>
                <div class="diff-info-footer">
                    <label class="diff-info-remember">
                        <input type="checkbox" id="configDiffInfoDontShow" />
                        <span>Don't show this again (config viewer only)</span>
                    </label>
                    <div class="diff-info-actions">
                        <button class="btn btn-secondary" onclick="closeConfigDiffInfoDialog()">Cancel</button>
                        <button class="btn btn-primary" onclick="proceedConfigHighlightDifferences()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 3v18"></path>
                                <path d="M5 10l7-7 7 7"></path>
                            </svg>
                            Proceed with Comparison
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    try {
        if (localStorage.getItem('traka-config-diff-info-skip') === 'true') {
            closeConfigDiffInfoDialog();
            executeConfigMultiHighlightDifferences();
        }
    } catch (e) {
        /* ignore */
    }
}

function closeConfigDiffInfoDialog() {
    const overlay = document.querySelector('.config-diff-info-overlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        const dlg = overlay.querySelector('.diff-info-dialog');
        if (dlg) {
            dlg.style.animation = 'diffDialogOut 0.2s ease-out';
        }
        setTimeout(() => overlay.remove(), 200);
    }
}

function proceedConfigHighlightDifferences() {
    const dontShow = document.getElementById('configDiffInfoDontShow');
    if (dontShow && dontShow.checked) {
        try {
            localStorage.setItem('traka-config-diff-info-skip', 'true');
        } catch (e) {
            /* ignore */
        }
    }
    closeConfigDiffInfoDialog();
    showGlobalLoader('Analysing differences...', 'Comparing config lines');
    setTimeout(() => {
        executeConfigMultiHighlightDifferences();
        hideGlobalLoader();
    }, 50);
}

function computeConfigMultiDiffStats(configFiles) {
    const sets = configFiles.map(f => new Set(f.lines.map(l => String(l).trim())));
    const uniqueCounts = configFiles.map((file, idx) => {
        let u = 0;
        for (const line of file.lines) {
            const t = String(line).trim();
            if (!t) {
                continue;
            }
            const inOther = sets.some((set, j) => j !== idx && set.has(t));
            if (!inOther) {
                u++;
            }
        }
        return u;
    });
    let commonCount = 0;
    configFiles.forEach((file, idx) => {
        for (const line of file.lines) {
            const t = String(line).trim();
            if (!t) {
                continue;
            }
            const inOther = sets.some((set, j) => j !== idx && set.has(t));
            if (inOther) {
                commonCount++;
            }
        }
    });
    return { uniqueCounts, commonCount, sets };
}

function executeConfigMultiHighlightDifferences() {
    const configFiles = state.files.filter(f => f.isConfig);
    if (configFiles.length < 2) {
        return;
    }

    const { uniqueCounts, commonCount, sets } = computeConfigMultiDiffStats(configFiles);
    state.configMultiDiffSets = sets;
    state.configMultiDiffHighlightActive = true;

    const diffBtn = document.getElementById('configHighlightDiffBtn');
    if (diffBtn) {
        diffBtn.classList.add('active');
    }

    refreshConfigMultiVirtualScrollLayout();
    showConfigDiffSummary(uniqueCounts, commonCount, configFiles);
}

function showConfigDiffSummary(uniqueCounts, commonCount, configFiles) {
    const summaryHTML = `
        <div class="config-diff-summary-overlay" onclick="closeConfigDiffSummary()">
            <div class="diff-summary-panel" onclick="event.stopPropagation()">
                <div class="diff-summary-header">
                    <h3>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 16v-4"></path>
                            <path d="M12 8h.01"></path>
                        </svg>
                        Config difference analysis
                    </h3>
                    <button class="btn-icon" onclick="closeConfigDiffSummary()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="diff-summary-content">
                    <div class="diff-legend">
                        <div class="diff-legend-item">
                            <div class="diff-legend-box unique"></div>
                            <div class="diff-legend-text">
                                <strong>Red (Unique Lines)</strong>
                                <p>Trimmed line text appears only in this config</p>
                            </div>
                        </div>
                        <div class="diff-legend-item">
                            <div class="diff-legend-box common"></div>
                            <div class="diff-legend-text">
                                <strong>Blue (Common Lines)</strong>
                                <p>Same trimmed line appears in at least one other config</p>
                            </div>
                        </div>
                    </div>
                    <div class="diff-stats">
                        <h4>Statistics (config files only)</h4>
                        ${configFiles.map((file, idx) => `
                            <div class="diff-stat-file">
                                <div class="diff-stat-filename">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                    </svg>
                                    ${escapeHtml(file.name)}
                                </div>
                                <div class="diff-stat-numbers">
                                    <span class="diff-stat-unique">
                                        <strong>${uniqueCounts[idx]}</strong> unique lines
                                    </span>
                                    <span class="diff-stat-common">
                                        <strong>${file.lines.length - uniqueCounts[idx]}</strong> non-unique lines
                                    </span>
                                    <span class="diff-stat-total">
                                        Total: <strong>${file.lines.length}</strong> lines
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="diff-summary-tip">
                        Scroll panels to inspect highlights. Clearing removes styling from config multi-view only.
                    </div>
                </div>
                <div class="diff-summary-footer">
                    <button class="btn btn-secondary" onclick="clearConfigMultiDiffHighlights()">Clear Highlights</button>
                    <button class="btn btn-primary" onclick="closeConfigDiffSummary()">Got It</button>
                </div>
            </div>
        </div>
    `;

    const existing = document.querySelector('.config-diff-summary-overlay');
    if (existing) {
        existing.remove();
    }
    document.body.insertAdjacentHTML('beforeend', summaryHTML);
}

function closeConfigDiffSummary() {
    const overlay = document.querySelector('.config-diff-summary-overlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => overlay.remove(), 200);
    }
}

function clearConfigMultiDiffHighlights() {
    state.configMultiDiffHighlightActive = false;
    state.configMultiDiffSets = null;
    const diffBtn = document.getElementById('configHighlightDiffBtn');
    if (diffBtn) {
        diffBtn.classList.remove('active');
    }
    closeConfigDiffSummary();
    refreshConfigMultiVirtualScrollLayout();
    showToast('Config difference highlights cleared', 'info');
}

function renderLogOptimized(fileData, filteredLines, gutter, content, statsElementId = 'viewerStats') {
    const VIRTUAL_THRESHOLD = 15000;

    cleanupViewerVirtualScroll();

    if (filteredLines.length < VIRTUAL_THRESHOLD) {
        content.classList.remove('virtual-scroll-mode');
        gutter.classList.remove('virtual-scroll-mode');
        renderLogDirect(fileData, filteredLines, gutter, content, statsElementId);
        return;
    }

    setupViewerVirtualScroll(fileData, filteredLines, gutter, content, statsElementId);
}

function renderLogBatched(fileData, filteredLines, gutter, content, startIdx, batchSize, callback) {
    const endIdx = Math.min(startIdx + batchSize, filteredLines.length);
    
    // Build HTML for this batch
    const batchHTML = [];
    const gutterHTML = [];
    
    for (let i = startIdx; i < endIdx; i++) {
        const entry = filteredLines[i];
        
        // Gutter
        if (state.settings.showLineNumbers) {
            if (entry.isSeparator) {
                gutterHTML.push(`<div class="line-number" data-line="-1">-</div>`);
            } else {
                gutterHTML.push(`<div class="line-number" data-line="${entry.lineNumber}">${entry.lineNumber}</div>`);
            }
        }
        
        // Content
        if (fileData.isConfig) {
            const highlightedLine = formatConfigLineInnerHtml(entry, fileData.name);
            batchHTML.push(`<div class="log-line config-line" data-line="${entry.lineNumber}">${highlightedLine || '&nbsp;'}</div>`);
        } else {
            const levelClass = (!fileData.skipErrorRendering && entry.level !== 'default') ? entry.level : '';
            let highlightedLine = state.settings.highlightSearch && state.searchMatches && state.searchMatches.length > 0 
                ? highlightSearchTerms(escapeHtml(entry.raw))
                : escapeHtml(entry.raw);
            
            if (state.highlightRules && state.highlightRules.length > 0) {
                highlightedLine = applyHighlightRules(entry.raw, fileData.name);
            }
            
            if (entry.isSeparator) {
                batchHTML.push(`<div class="log-line stitched-separator" data-line="-1" data-vindex="${i}">${highlightedLine}</div>`);
            } else {
                let sourceHtml = '';
                let extraClass = '';
                if (entry.sourceFile && fileData.isStitched) {
                    const fileColor = getFileColor(entry.sourceFile);
                    sourceHtml = `<span class="source-indicator" style="background: ${fileColor};" title="${escapeHtml(entry.sourceFile)}"></span>`;
                    extraClass = ' stitched-line';
                }
                
                batchHTML.push(`<div class="log-line ${levelClass}${extraClass}" data-line="${entry.lineNumber}" data-vindex="${i}"${entry.sourceFile && fileData.isStitched ? ` data-source="${escapeHtml(entry.sourceFile)}"` : ''}>${sourceHtml}${highlightedLine || '&nbsp;'}</div>`);
            }
        }
    }
    
    // Use insertAdjacentHTML which is massively faster than appending elements one by one or using innerHTML on empty divs
    if (state.settings.showLineNumbers) {
        gutter.insertAdjacentHTML('beforeend', gutterHTML.join(''));
    }
    content.insertAdjacentHTML('beforeend', batchHTML.join(''));
    
    // Yield to browser minimally to allow paint but keep speed high
    if (endIdx < filteredLines.length) {
        if (startIdx % 4000 === 0) {
             setTimeout(() => renderLogBatched(fileData, filteredLines, gutter, content, endIdx, batchSize, callback), 1);
        } else {
             renderLogBatched(fileData, filteredLines, gutter, content, endIdx, batchSize, callback);
        }
    } else {
        if (callback) callback();
    }
}

function cleanupViewerVirtualScroll() {
    if (state.virtualScroll && state.virtualScroll.scrollHandler) {
        state.virtualScroll.contentEl.removeEventListener('scroll', state.virtualScroll.scrollHandler);
    }
    state.virtualScroll = null;
}

function setupViewerVirtualScroll(fileData, filteredLines, gutter, content, statsElementId = 'viewerStats') {
    const lineHeight = 20;
    const totalHeight = filteredLines.length * lineHeight;
    const OVERSCAN = 200;

    state.virtualScroll = {
        active: true,
        filteredLines: filteredLines,
        fileData: fileData,
        lineHeight: lineHeight,
        overscan: OVERSCAN,
        totalHeight: totalHeight,
        lastRenderedStart: -1,
        lastRenderedEnd: -1,
        searchMatchIndices: new Set(),
        currentSearchFilteredIndex: -1,
        scrollHandler: null,
        contentEl: content,
        gutterEl: gutter,
        viewport: null,
        gutterViewport: null,
        statsElementId: statsElementId
    };

    content.innerHTML = '';
    content.classList.add('virtual-scroll-mode');

    const spacer = document.createElement('div');
    spacer.className = 'virtual-scroll-spacer';
    spacer.style.height = totalHeight + 'px';
    spacer.style.position = 'relative';
    content.appendChild(spacer);

    const viewport = document.createElement('div');
    viewport.className = 'virtual-scroll-viewport';
    spacer.appendChild(viewport);
    state.virtualScroll.viewport = viewport;

    if (state.settings.showLineNumbers) {
        gutter.innerHTML = '';
        gutter.classList.add('virtual-scroll-mode');

        const gutterSpacer = document.createElement('div');
        gutterSpacer.style.height = totalHeight + 'px';
        gutterSpacer.style.position = 'relative';
        gutter.appendChild(gutterSpacer);

        const gutterViewport = document.createElement('div');
        gutterViewport.className = 'virtual-scroll-viewport';
        gutterSpacer.appendChild(gutterViewport);
        state.virtualScroll.gutterViewport = gutterViewport;
        gutter.style.display = 'block';
    } else {
        gutter.style.display = 'none';
    }

    const scrollHandler = () => updateViewerViewport();
    content.addEventListener('scroll', scrollHandler, { passive: true });
    state.virtualScroll.scrollHandler = scrollHandler;

    updateViewerViewport(true);

    updateViewerStats(fileData, filteredLines.length, statsElementId);
    content.style.fontSize = `${state.settings.fontSize}px`;
    gutter.style.fontSize = `${state.settings.fontSize}px`;

    if (statsElementId === 'viewerStats' && state.liveTailActive && state.autoScrollEnabled) {
        requestAnimationFrame(() => {
            content.scrollTop = content.scrollHeight;
        });
    }
}

function updateViewerViewport(force) {
    const vs = state.virtualScroll;
    if (!vs || !vs.active) return;

    const scrollTop = vs.contentEl.scrollTop;
    const clientHeight = vs.contentEl.clientHeight || 800;

    const visibleStart = Math.floor(scrollTop / vs.lineHeight);
    const visibleEnd = Math.ceil((scrollTop + clientHeight) / vs.lineHeight);

    if (!force && vs.lastRenderedStart >= 0) {
        const safeTop = vs.lastRenderedStart + vs.overscan * 0.4;
        const safeBot = vs.lastRenderedEnd - vs.overscan * 0.4;
        if (visibleStart >= safeTop && visibleEnd <= safeBot) {
            return;
        }
    }

    const startIdx = Math.max(0, visibleStart - vs.overscan);
    const endIdx = Math.min(vs.filteredLines.length, visibleEnd + vs.overscan);

    vs.lastRenderedStart = startIdx;
    vs.lastRenderedEnd = endIdx;

    const lines = vs.filteredLines;
    const fileData = vs.fileData;
    const html = [];

    for (let i = startIdx; i < endIdx; i++) {
        const entry = lines[i];
        const levelClass = (!fileData.skipErrorRendering && entry.level !== 'default') ? entry.level : '';
        let displayLine;

        if (fileData.isConfig) {
            displayLine = formatConfigLineInnerHtml(entry, fileData.name);
        } else {
            displayLine = state.settings.highlightSearch && vs.searchMatchIndices.has(i)
                ? highlightSearchTerms(escapeHtml(entry.raw))
                : escapeHtml(entry.raw);

            if (state.highlightRules.length > 0) {
                displayLine = applyHighlightRules(entry.raw, fileData.name);
            }
        }

        const searchClass = vs.searchMatchIndices.has(i) ? ' search-match' : '';
        const currentMatchClass = vs.currentSearchFilteredIndex === i ? ' current-match' : '';
        const cssClass = fileData.isConfig ? 'config-line' : levelClass;

        if (entry.isSeparator) {
            html.push(`<div class="log-line stitched-separator" data-line="-1" data-vindex="${i}">${displayLine}</div>`);
        } else {
            let sourceHtml = '';
            let extraClass = '';
            if (entry.sourceFile && fileData.isStitched) {
                const fileColor = getFileColor(entry.sourceFile);
                sourceHtml = `<span class="source-indicator" style="background: ${fileColor};" title="${escapeHtml(entry.sourceFile)}"></span>`;
                extraClass = ' stitched-line';
            }
            html.push(`<div class="log-line ${cssClass}${searchClass}${currentMatchClass}${extraClass}" data-line="${entry.lineNumber}" data-vindex="${i}"${entry.sourceFile && fileData.isStitched ? ` data-source="${escapeHtml(entry.sourceFile)}"` : ''}>${sourceHtml}${displayLine || '&nbsp;'}</div>`);
        }
    }

    vs.viewport.innerHTML = html.join('');
    vs.viewport.style.transform = `translateY(${startIdx * vs.lineHeight}px)`;

    if (vs.gutterViewport) {
        const gutterHtml = [];
        for (let i = startIdx; i < endIdx; i++) {
            if (lines[i].isSeparator) {
                gutterHtml.push(`<div class="line-number" data-line="-1">-</div>`);
            } else {
                gutterHtml.push(`<div class="line-number" data-line="${lines[i].lineNumber}">${lines[i].lineNumber}</div>`);
            }
        }
        vs.gutterViewport.innerHTML = gutterHtml.join('');
        vs.gutterViewport.style.transform = `translateY(${startIdx * vs.lineHeight}px)`;
    }
}

function renderLogDirect(fileData, filteredLines, gutter, content, statsElementId = 'viewerStats') {
    // Build gutter using DocumentFragment
    if (state.settings.showLineNumbers) {
        const gutterFragment = document.createDocumentFragment();
        const gutterDiv = document.createElement('div');
        gutterDiv.innerHTML = filteredLines.map(entry => 
            entry.isSeparator ? `<div class="line-number" data-line="-1">-</div>` : `<div class="line-number" data-line="${entry.lineNumber}">${entry.lineNumber}</div>`
        ).join('');
        
        while (gutterDiv.firstChild) {
            gutterFragment.appendChild(gutterDiv.firstChild);
        }
        
        gutter.innerHTML = '';
        gutter.appendChild(gutterFragment);
        gutter.style.display = 'block';
    } else {
        gutter.style.display = 'none';
    }
    
    // Build content
    const contentFragment = document.createDocumentFragment();
    const contentDiv = document.createElement('div');
    
    if (fileData.isConfig) {
        contentDiv.innerHTML = filteredLines.map(entry => {
            const highlightedLine = formatConfigLineInnerHtml(entry, fileData.name);
            return `<div class="log-line config-line" data-line="${entry.lineNumber}">${highlightedLine || '&nbsp;'}</div>`;
        }).join('');
    } else {
        // Regular log file display
        contentDiv.innerHTML = filteredLines.map(entry => {
            const levelClass = (!fileData.skipErrorRendering && entry.level !== 'default') ? entry.level : '';
            let highlightedLine = state.settings.highlightSearch && state.searchMatches.length > 0 
                ? highlightSearchTerms(escapeHtml(entry.raw))
                : escapeHtml(entry.raw);
            
            // Apply custom highlight rules
            if (state.highlightRules.length > 0) {
                highlightedLine = applyHighlightRules(entry.raw, fileData.name);
            }
            
            // Apply stitched log separator logic
            if (entry.isSeparator) {
                return `<div class="log-line stitched-separator" data-line="-1">${highlightedLine}</div>`;
            }
            
            let sourceHtml = '';
            let extraClass = '';
            if (entry.sourceFile && fileData.isStitched) {
                const fileColor = getFileColor(entry.sourceFile);
                sourceHtml = `<span class="source-indicator" style="background: ${fileColor};" title="${escapeHtml(entry.sourceFile)}"></span>`;
                extraClass = ' stitched-line';
            }
            
            return `<div class="log-line ${levelClass}${extraClass}" data-line="${entry.lineNumber}"${entry.sourceFile && fileData.isStitched ? ` data-source="${escapeHtml(entry.sourceFile)}"` : ''}>${sourceHtml}${highlightedLine || '&nbsp;'}</div>`;
        }).join('');
    }
    
    while (contentDiv.firstChild) {
        contentFragment.appendChild(contentDiv.firstChild);
    }
    
    content.innerHTML = '';
    content.appendChild(contentFragment);
    
    // Update stats
    updateViewerStats(fileData, filteredLines.length, statsElementId);
    
    // Apply font size
    content.style.fontSize = `${state.settings.fontSize}px`;
    gutter.style.fontSize = `${state.settings.fontSize}px`;
    
    // Apply word wrap
    content.style.whiteSpace = state.settings.wordWrap ? 'pre-wrap' : 'pre';
    
    // If live tail is active, scroll to bottom so newest content is visible
    if (statsElementId === 'viewerStats' && state.liveTailActive && state.autoScrollEnabled) {
        requestAnimationFrame(() => {
            content.scrollTop = content.scrollHeight;
        });
    }
}

function filterLines(parsed) {
    // Pre-calculate filter conditions once
    const hasLevelFilter = state.activeFilter !== 'all';
    const hasActiveEngineFilter = Object.values(state.engineFilters).some(v => v);
    
    // Check if we are currently using a custom search query as a filter in the viewer
    const query = document.getElementById('searchInput')?.value.trim();
    const isSearchFiltered = document.getElementById('viewerSearchFilters')?.classList.contains('active') && 
                             document.getElementById('filterBySearch')?.checked && query;
                             
    let searchRegex = null;
    if (isSearchFiltered) {
        if (query.startsWith('/') && query.endsWith('/')) {
            try {
                searchRegex = new RegExp(query.slice(1, -1), 'i');
            } catch (e) {
                // Ignore invalid regex
            }
        } else {
            searchRegex = new RegExp(escapeRegex(query), 'i');
        }
    }
    
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    const hasDateFilter = dateFrom || dateTo;
    
    const dateFromObj = dateFrom ? new Date(dateFrom) : null;
    let dateToObj = dateTo ? new Date(dateTo) : null;
    
    // Since the date picker only allows selecting down to the minute, 
    // we should extend the "To" date to cover the entire minute (add 59.999 seconds)
    if (dateToObj) {
        dateToObj = new Date(dateToObj.getTime() + 59999);
    }
    
    // Pre-compile regex patterns for engine filters if needed
    let commsPattern = null;
    let integrationPattern = null;
    let businessPattern = null;
    
    if (hasActiveEngineFilter) {
        if (state.engineFilters.comms) {
            commsPattern = /\bcenmgr:|comms engine on\b|ce-comms engine|ce ['"]comms engine|cem comms channel/i;
        }
        if (state.engineFilters.integration) {
            integrationPattern = /\bienmgr:|integration engine on\b|ie-integration engine|creating ie manager/i;
        }
        if (state.engineFilters.business) {
            businessPattern = /\bbesvch:|enghlp:|dbintg:|dbhlp:|jobpro:|svcmgr:|accpro:|traka business engine (started|stopped|v\d)|business engine database/i;
        }
    }
    
        // Single-pass filter - check all conditions at once
    const filtered = parsed.filter(entry => {
        // Always preserve stitch breaks so the user knows where file boundaries are
        if (entry.isSeparator) {
            return true;
        }
        
        // Level filter
        if (hasLevelFilter && entry.level !== state.activeFilter) {
            return false;
        }
        
        // Engine filter
        if (hasActiveEngineFilter) {
            const line = entry.raw;
            let matchesEngine = false;
            
            if (commsPattern && commsPattern.test(line)) {
                matchesEngine = true;
            } else if (integrationPattern && integrationPattern.test(line)) {
                matchesEngine = true;
            } else if (businessPattern && businessPattern.test(line)) {
                matchesEngine = true;
            }
            
            if (!matchesEngine) {
                return false;
            }
        }
        
        // Date filter
        if (hasDateFilter) {
            let time = entry.cachedTime;
            if (!time && entry.timestamp) {
                time = new Date(entry.timestamp).getTime();
            }
            
            if (time) {
                if (dateFromObj && time < dateFromObj.getTime()) return false;
                if (dateToObj && time > dateToObj.getTime()) return false;
            } else {
                // If the line has NO time and NO inherited time (e.g. very start of log),
                // we technically can't date filter it accurately. But to prevent it from vanishing,
                // we just let it pass through.
            }
        }
        
        // Search string filter
        if (searchRegex && !searchRegex.test(entry.raw)) {
            return false;
        }
        
        return true;
    });
    
    return filtered;
}

function updateViewerStats(fileData, displayedLines, statsElementId = 'viewerStats') {
    const stats = document.getElementById(statsElementId);
    if (stats) {
        stats.textContent = `${fileData.name} | ${displayedLines.toLocaleString()} of ${fileData.lines.length.toLocaleString()} lines displayed`;
    }
    if (statsElementId === 'viewerStats') {
        updateViewerHighlightCounts();
    }
}

// ============================================
// Search
// ============================================
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const compareSearch = document.getElementById('compareSearchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(performSearch, 300));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    navigateSearch(-1);
                } else {
                    navigateSearch(1);
                }
            }
            if (e.key === 'Escape') {
                searchInput.value = '';
                clearSearch();
            }
        });
    }
    
    if (compareSearch) {
        compareSearch.addEventListener('input', debounce(performCompareSearch, 150));
    }
}

function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const searchNav = document.getElementById('searchNav');
    
    if (!query) {
        clearSearch();
        return;
    }
    
    let regex;
    if (query.startsWith('/') && query.endsWith('/')) {
        try {
            regex = new RegExp(query.slice(1, -1), 'gi');
        } catch (e) {
            showToast('Invalid regex pattern', 'error');
            return;
        }
    } else {
        regex = new RegExp(escapeRegex(query), 'gi');
    }
    
    if (state.virtualScroll && state.virtualScroll.active) {
        const vs = state.virtualScroll;
        vs.searchMatchIndices = new Set();
        state.searchMatches = [];
        
        vs.filteredLines.forEach((entry, idx) => {
            regex.lastIndex = 0;
            if (regex.test(entry.raw)) {
                vs.searchMatchIndices.add(idx);
                state.searchMatches.push({
                    filteredIndex: idx,
                    lineNumber: entry.lineNumber
                });
            }
        });
        
        if (state.searchMatches.length > 0) {
            state.currentMatchIndex = 0;
            vs.currentSearchFilteredIndex = state.searchMatches[0].filteredIndex;
            updateSearchNavigation();
            scrollToMatch(0);
            searchNav.style.display = 'flex';
        } else {
            searchNav.style.display = 'none';
            showToast('No matches found', 'info');
        }
        
        vs.lastRenderedStart = -1;
        updateViewerViewport();
        return;
    }
    
    state.searchMatches = [];
    const logLines = document.querySelectorAll('.log-line');
    
    logLines.forEach((line, index) => {
        const text = line.textContent;
        if (regex.test(text)) {
            state.searchMatches.push({
                element: line,
                index: index,
                lineNumber: parseInt(line.dataset.line)
            });
            line.classList.add('search-match');
        } else {
            line.classList.remove('search-match', 'current-match');
        }
    });
    
    if (state.searchMatches.length > 0) {
        state.currentMatchIndex = 0;
        updateSearchNavigation();
        scrollToMatch(0);
        searchNav.style.display = 'flex';
    } else {
        searchNav.style.display = 'none';
        showToast('No matches found', 'info');
    }
    
    if (state.currentFileIndex >= 0) {
        displayLog(state.files[state.currentFileIndex]);
    }
}

function navigateSearch(direction) {
    if (state.searchMatches.length === 0) return;
    
    state.currentMatchIndex += direction;
    
    if (state.currentMatchIndex >= state.searchMatches.length) {
        state.currentMatchIndex = 0;
    } else if (state.currentMatchIndex < 0) {
        state.currentMatchIndex = state.searchMatches.length - 1;
    }
    
    updateSearchNavigation();
    scrollToMatch(state.currentMatchIndex);
}

function updateSearchNavigation() {
    const countEl = document.getElementById('searchCount');
    if (countEl) {
        countEl.textContent = `${state.currentMatchIndex + 1}/${state.searchMatches.length}`;
    }
    
    if (state.virtualScroll && state.virtualScroll.active) {
        return;
    }
    
    state.searchMatches.forEach((match, idx) => {
        if (match.element) {
            match.element.classList.toggle('current-match', idx === state.currentMatchIndex);
        }
    });
}

function scrollToMatch(index) {
    if (state.virtualScroll && state.virtualScroll.active) {
        const match = state.searchMatches[index];
        if (match) {
            const vs = state.virtualScroll;
            vs.currentSearchFilteredIndex = match.filteredIndex;
            const scrollPos = match.filteredIndex * vs.lineHeight - vs.contentEl.clientHeight / 2;
            vs.contentEl.scrollTop = Math.max(0, scrollPos);
            vs.lastRenderedStart = -1;
            updateViewerViewport();
        }
        return;
    }
    
    const match = state.searchMatches[index];
    if (match && match.element) {
        match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearSearch() {
    state.searchMatches = [];
    state.currentMatchIndex = -1;
    
    if (state.virtualScroll && state.virtualScroll.active) {
        state.virtualScroll.searchMatchIndices = new Set();
        state.virtualScroll.currentSearchFilteredIndex = -1;
        state.virtualScroll.lastRenderedStart = -1;
        updateViewerViewport();
    } else {
        document.querySelectorAll('.log-line').forEach(line => {
            line.classList.remove('search-match', 'current-match');
        });
    }
    
    document.getElementById('searchNav').style.display = 'none';
    
    if (state.currentFileIndex >= 0) {
        displayLog(state.files[state.currentFileIndex]);
    }
}

function highlightSearchTerms(text) {
    const query = document.getElementById('searchInput')?.value.trim();
    if (!query) return text;
    
    try {
        let regex;
        if (query.startsWith('/') && query.endsWith('/')) {
            regex = new RegExp(`(${query.slice(1, -1)})`, 'gi');
        } else {
            regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        }
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    } catch (e) {
        return text;
    }
}

function performCompareSearch() {
    const query = document.getElementById('compareSearchInput').value.trim();

    if (state.compareVirtualScroll) {
        let totalMatches = 0;

        state.compareVirtualScroll.forEach((vs, idx) => {
            if (!vs) return;
            vs.searchMatchIndices = vs.searchMatchIndices || new Set();
            vs.searchMatchIndices.clear();
            vs.searchQuery = '';
        });

        if (!query) {
            state.compareVirtualScroll.forEach((vs, idx) => {
                if (!vs) return;
                vs.lastRenderedStart = -1;
                updateComparePanelViewport(idx);
            });
            updateCompareSearchCounts(0, 0);
            return;
        }

        const regex = new RegExp(escapeRegex(query), 'gi');

        state.compareVirtualScroll.forEach((vs, idx) => {
            if (!vs) return;
            vs.searchQuery = query;
            vs.searchMatchIndices = new Set();

            vs.file.lines.forEach((line, lineIdx) => {
                regex.lastIndex = 0;
                if (regex.test(line)) {
                    vs.searchMatchIndices.add(lineIdx);
                    totalMatches++;
                }
            });

            vs.lastRenderedStart = -1;
            updateComparePanelViewport(idx);
        });

        updateCompareSearchCounts(totalMatches, state.compareVirtualScroll.filter(Boolean).length);
        return;
    }

    const compareRoot = document.getElementById('compareContainer');
    if (!compareRoot) {
        return;
    }
    const panels = compareRoot.querySelectorAll('.compare-panel-content');
    const isFilterMode = state.compareSearchFilterMode;
    
    panels.forEach(panel => {
        panel.querySelectorAll('.log-line.search-match').forEach(line => {
            line.classList.remove('search-match');
        });
        panel.querySelectorAll('.log-line.search-hidden').forEach(line => {
            line.classList.remove('search-hidden');
        });
        panel.querySelectorAll('.compare-search-hl').forEach(hl => {
            hl.replaceWith(hl.textContent);
        });
    });
    
    updateCompareSearchCounts(0, 0);
    
    if (!query) return;
    
    const regex = new RegExp(escapeRegex(query), 'gi');
    let totalMatches = 0;
    let totalLines = 0;
    
    panels.forEach(panel => {
        const lines = panel.querySelectorAll('.log-line');
        let panelMatches = 0;
        
        lines.forEach(line => {
            const isMatch = regex.test(line.textContent);
            regex.lastIndex = 0;
            
            if (isMatch) {
                line.classList.add('search-match');
                panelMatches++;
                
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null, false);
                const textNodes = [];
                while (walker.nextNode()) textNodes.push(walker.currentNode);
                
                textNodes.forEach(node => {
                    const text = node.nodeValue;
                    if (!regex.test(text)) return;
                    regex.lastIndex = 0;
                    
                    const frag = document.createDocumentFragment();
                    let lastIdx = 0;
                    let match;
                    
                    while ((match = regex.exec(text)) !== null) {
                        if (match.index > lastIdx) {
                            frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
                        }
                        const mark = document.createElement('mark');
                        mark.className = 'compare-search-hl';
                        mark.textContent = match[0];
                        frag.appendChild(mark);
                        lastIdx = regex.lastIndex;
                    }
                    if (lastIdx < text.length) {
                        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
                    }
                    
                    node.parentNode.replaceChild(frag, node);
                });
            } else if (isFilterMode) {
                line.classList.add('search-hidden');
            }
        });
        
        totalMatches += panelMatches;
        totalLines += lines.length;
    });
    
    updateCompareSearchCounts(totalMatches, panels.length);
}

function toggleCompareSearchMode() {
    state.compareSearchFilterMode = !state.compareSearchFilterMode;
    
    const btn = document.getElementById('compareSearchModeBtn');
    if (btn) {
        btn.classList.toggle('filter-active', state.compareSearchFilterMode);
        btn.title = state.compareSearchFilterMode
            ? 'Filter mode: showing matches only — click to switch to highlight mode'
            : 'Highlight mode: all lines shown — click to switch to filter mode';
    }
    
    // Re-run the search with the new mode
    performCompareSearch();
}

function updateCompareSearchCounts(matchCount, panelCount) {
    const badge = document.getElementById('compareSearchBadge');
    if (!badge) return;
    
    const query = document.getElementById('compareSearchInput').value.trim();
    if (!query || matchCount === 0) {
        badge.style.display = 'none';
        return;
    }
    
    badge.style.display = 'inline-flex';
    badge.textContent = `${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
}

// ============================================
// Filters
// ============================================
function initFilters() {
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeFilter = chip.dataset.level;
            
            if (state.currentFileIndex >= 0) {
                displayLog(state.files[state.currentFileIndex]);
            }
        });
    });
    
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeCategory = btn.dataset.category;
            renderIssues();
        });
    });
    
    // Date filter changes
    const handleDateChange = () => {
        if (state.filterDebounceTimer) clearTimeout(state.filterDebounceTimer);
        state.filterDebounceTimer = setTimeout(() => {
            if (state.currentFileIndex >= 0) {
                displayLog(state.files[state.currentFileIndex]);
            }
        }, 200);
    };

    if (typeof flatpickr !== 'undefined') {
        const fpConfig = {
            enableTime: true,
            time_24hr: true,
            dateFormat: "Y-m-d\\TH:i",
            altInput: true,
            altFormat: "d/m/Y H:i",
            altInputClass: "date-input",
            theme: "dark",
            onChange: handleDateChange
        };
        
        const fromEl = document.getElementById('dateFrom');
        const toEl = document.getElementById('dateTo');
        
        if (fromEl) state.dateFromPicker = flatpickr(fromEl, fpConfig);
        if (toEl) state.dateToPicker = flatpickr(toEl, fpConfig);
    } else {
        document.getElementById('dateFrom')?.addEventListener('change', handleDateChange);
        document.getElementById('dateTo')?.addEventListener('change', handleDateChange);
    }
}

function toggleEngineFilter(engine) {
    state.engineFilters[engine] = !state.engineFilters[engine];
    
    // Update button visual state
    const btn = document.querySelector(`[data-engine="${engine}"]`);
    if (btn) {
        btn.classList.toggle('active', state.engineFilters[engine]);
    }
    
    // Debounced refresh display - wait for user to finish clicking
    if (state.filterDebounceTimer) {
        clearTimeout(state.filterDebounceTimer);
    }
    
    state.filterDebounceTimer = setTimeout(() => {
        if (state.currentFileIndex >= 0) {
            displayLog(state.files[state.currentFileIndex]);
        }
    }, 150); // Wait 150ms after last filter change
    
    // Show feedback
    const activeEngines = Object.entries(state.engineFilters)
        .filter(([_, active]) => active)
        .map(([name, _]) => name.charAt(0).toUpperCase() + name.slice(1));
    
    if (activeEngines.length > 0) {
        showToast(`Filtering by: ${activeEngines.join(', ')} Engine${activeEngines.length > 1 ? 's' : ''}`, 'info');
    } else {
        showToast('Engine filters cleared', 'info');
    }
}

function clearDateFilter() {
    if (state.dateFromPicker) {
        state.dateFromPicker.clear();
    } else {
        document.getElementById('dateFrom').value = '';
    }
    
    if (state.dateToPicker) {
        state.dateToPicker.clear();
    } else {
        document.getElementById('dateTo').value = '';
    }
    
    if (state.currentFileIndex >= 0) {
        displayLog(state.files[state.currentFileIndex]);
    }
}

// ============================================
// Compare View
// ============================================

function loadCompareLayout() {
    try {
        const v = localStorage.getItem('traka-compare-layout');
        if (v === 'stacked' || v === 'sideBySide') {
            state.compareLayout = v;
        }
    } catch (e) {
        /* ignore */
    }
}

function saveCompareLayout() {
    try {
        localStorage.setItem('traka-compare-layout', state.compareLayout);
    } catch (e) {
        /* ignore */
    }
}

function applyCompareLayoutToDom() {
    const container = document.getElementById('compareContainer');
    const sel = document.getElementById('compareLayoutSelect');
    if (sel) sel.value = state.compareLayout;
    const stacked = state.compareLayout === 'stacked';
    if (container) {
        container.classList.toggle('compare-layout-stacked', stacked);
    }
}

/** Re-measure compare panels after layout or fullscreen size change */
function refreshCompareVirtualScrollLayout() {
    if (!state.compareVirtualScroll) return;
    state.compareVirtualScroll.forEach((vs, idx) => {
        if (vs) {
            vs.lastRenderedStart = -1;
            vs.lastRenderedEnd = -1;
            updateComparePanelViewport(idx, true);
        }
    });
}

function setCompareLayout(layout) {
    if (layout !== 'stacked' && layout !== 'sideBySide') return;
    state.compareLayout = layout;
    saveCompareLayout();
    applyCompareLayoutToDom();
    requestAnimationFrame(() => {
        refreshCompareVirtualScrollLayout();
    });
    showToast(
        layout === 'stacked' ? 'Compare layout: stacked (top to bottom)' : 'Compare layout: side by side',
        'info'
    );
}

function initCompareDropZone() {
    const dropZone = document.getElementById('compareDropZone');
    
    if (!dropZone) return;
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        // Only remove if leaving the drop zone entirely
        if (e.target === dropZone) {
            dropZone.classList.remove('dragover');
        }
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        // Handle files with intelligent sorting and STAY ON COMPARE PAGE
        handleFiles(e.dataTransfer.files, true, true);
        
        // No navigation - we're already on compare and want to stay here!
    });
}

function updateCompareView() {
    const container = document.getElementById('compareContainer');
    const compareFiles = state.files.filter(f => !f.isConfig);
    
    if (compareFiles.length < 1) {
        container.innerHTML = `
            <div class="compare-empty" id="compareDropZone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p class="drop-title">Drag & Drop Multiple Logs Here</p>
                <span class="drop-instruction">Compare log files side by side (open .cfg files on the Config page).</span>
                <span class="drop-hint">Files will be automatically sorted: Business → Comms → Integration → Plugins</span>
                <button class="btn btn-secondary" onclick="document.getElementById('compareFileInput').click()" style="margin-top: 1rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    Or Browse Files
                </button>
            </div>
        `;
        
        // Re-initialize drop zone after updating HTML
        initCompareDropZone();
        applyCompareLayoutToDom();
        return;
    }
    
    // Set data attribute for grid layout
    container.setAttribute('data-file-count', compareFiles.length);
    
    // Set CSS variable for file count
    container.style.setProperty('--file-count', compareFiles.length);
    
    // Clean up minimized indices that no longer exist (e.g. after file removal)
    state.minimizedPanels.forEach(idx => {
        if (idx >= state.files.length) state.minimizedPanels.delete(idx);
    });
    
    // Build panel HTML — minimized and popped-out panels are hidden via CSS class
    const panelsHtml = compareFiles.map((file, panelIndex) => {
        const index = state.files.indexOf(file);
        const fileTypeBadge = '';
        
        const liveTailClass = state.liveTailActive ? ' live-tail-active' : '';
        const isMinimized = state.minimizedPanels.has(index);
        const isPoppedOut = state.poppedOutPanels && state.poppedOutPanels.has(index);
        
        let extraClasses = '';
        if (isMinimized) extraClasses += ' panel-minimized';
        if (isPoppedOut) extraClasses += ' panel-popped-out';
        
        const shortLabel = getShortLabel(file);
        const originalFile = file.originalName || file.name;
        return `
        <div class="compare-panel${liveTailClass}${extraClasses}" data-index="${index}" ${isPoppedOut ? 'style="display: none;"' : ''}>
            <div class="compare-panel-header">
                <div class="compare-panel-title-group">
                    <h4 title="${escapeHtml(file.path || originalFile)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span class="panel-title-text">${escapeHtml(shortLabel)}${fileTypeBadge}</span>
                    </h4>
                    <div class="file-badge">${file.lines.length.toLocaleString()} lines &middot; ${formatFileSize(file.size)}</div>
                </div>
                ${generateComparePanelMatchPills(file)}
                <div class="compare-panel-actions">
                    <button class="btn-icon panel-popout-btn" onclick="popOutPanel(${index})" title="Pop out to new window">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>
                    <button class="btn-icon panel-minimize-btn" onclick="toggleMinimizePanel(${index})" title="Minimize this panel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <button class="btn-icon panel-maximize-btn" onclick="toggleMaximizePanel(${index})" title="Maximize this panel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="removeFile(${index})" title="Remove file">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="compare-panel-content virtual-scroll-mode" data-panel-index="${panelIndex}" onscroll="handleCompareScroll(event, ${panelIndex})">
                <div class="virtual-scroll-spacer" style="height: ${file.lines.length * 20}px; position: relative;">
                    <div class="virtual-scroll-viewport" style="position: absolute; left: 0; right: 0; will-change: transform;"></div>
                </div>
            </div>
        </div>
    `;
    }).join('');
    
    container.innerHTML = panelsHtml;

    initCompareVirtualScroll(container, compareFiles);

    applyCompareLayoutToDom();
    requestAnimationFrame(() => refreshCompareVirtualScrollLayout());

    // Build/update the floating minimized dock (lives outside the container)
    updateMinimizedDock();
    
    // Update highlight results panel below compare tiles
    updateCompareHighlightResults();
    
    // After full re-render, scroll to bottom if live tail is active
    if (state.liveTailActive && state.autoScrollEnabled) {
        requestAnimationFrame(() => {
            scrollComparePanelsToBottom();
        });
    }
}

function cleanupCompareVirtualScroll() {
    state.compareVirtualScroll = null;
}

function initCompareVirtualScroll(container, compareFiles) {
    cleanupCompareVirtualScroll();

    const compareLineHeight = 20;
    const OVERSCAN = 150;
    state.compareVirtualScroll = compareFiles.map((file, panelIndex) => {
        const globalIndex = state.files.indexOf(file);
        const panelContent = container.querySelector(`[data-panel-index="${panelIndex}"]`);
        if (!panelContent) return null;

        const viewport = panelContent.querySelector('.virtual-scroll-viewport');

        const vsState = {
            file: file,
            panelContent: panelContent,
            viewport: viewport,
            lineHeight: compareLineHeight,
            overscan: OVERSCAN,
            lastRenderedStart: -1,
            lastRenderedEnd: -1,
            fileIndex: globalIndex,
            searchMatchIndices: null,
            searchQuery: ''
        };

        panelContent.addEventListener('scroll', () => updateComparePanelViewport(panelIndex), { passive: true });

        updateComparePanelViewport(panelIndex, true);

        return vsState;
    });

    requestAnimationFrame(() => {
        if (!state.compareVirtualScroll) return;
        state.compareVirtualScroll.forEach((vs, idx) => {
            if (vs) {
                vs.lastRenderedStart = -1;
                vs.lastRenderedEnd = -1;
                updateComparePanelViewport(idx, true);
            }
        });
    });
}

function updateComparePanelViewport(index, force) {
    const cvs = state.compareVirtualScroll;
    if (!cvs || !cvs[index]) return;

    const vs = cvs[index];
    const scrollTop = vs.panelContent.scrollTop;
    const clientHeight = vs.panelContent.clientHeight || 600;

    const visibleStart = Math.floor(scrollTop / vs.lineHeight);
    const visibleEnd = Math.ceil((scrollTop + clientHeight) / vs.lineHeight);

    if (!force && vs.lastRenderedStart >= 0) {
        const safeTop = vs.lastRenderedStart + vs.overscan * 0.4;
        const safeBot = vs.lastRenderedEnd - vs.overscan * 0.4;
        if (visibleStart >= safeTop && visibleEnd <= safeBot) {
            return;
        }
    }

    const startIdx = Math.max(0, visibleStart - vs.overscan);
    const endIdx = Math.min(vs.file.lines.length, visibleEnd + vs.overscan);

    vs.lastRenderedStart = startIdx;
    vs.lastRenderedEnd = endIdx;

    const html = [];
    const fileIndex = vs.fileIndex;
    const file = vs.file;
    const timeSyncActive = state.timeSyncActive;
    const tsTarget = state.timeSyncActive ? state.timeSyncLastTarget : null;

    const hasSearchMatches = vs.searchMatchIndices && vs.searchMatchIndices.size > 0;
    const searchQuery = vs.searchQuery || '';

    for (let i = startIdx; i < endIdx; i++) {
        const line = file.lines[i];
        const level = detectLogLevel(line);
        let levelClass = (!file.skipErrorRendering && level !== 'default') ? level : '';
        const timestamp = extractTimestamp(line);
        const timestampAttr = timestamp ? ` data-timestamp="${timestamp}"` : '';
        const clickHandler = timeSyncActive && timestamp ? ` onclick="syncToTimestamp('${timestamp}', ${fileIndex}, ${i + 1})"` : '';
        const cursorStyle = timeSyncActive && timestamp ? ' cursor: pointer;' : '';
        let searchClass = hasSearchMatches && vs.searchMatchIndices.has(i) ? ' search-match' : '';

        // Determine Time Sync classes
        let tsClass = '';
        if (timeSyncActive && tsTarget) {
            let isDimmed = false;
            let isHighlight = false;
            let isNearest = false;
            let isSource = false;

            const bounds = state.timeSyncBounds ? state.timeSyncBounds[fileIndex] : null;
            if (bounds && bounds.start !== -1) {
                if (i < bounds.start || i > bounds.end) {
                    isDimmed = true;
                }
            } else if (bounds && bounds.start === -1) {
                isDimmed = true;
            }
            
            if (timestamp) {
                const lineTime = parseTimestamp(timestamp);
                if (lineTime) {
                    // Check if this line is the exact match/target for this file
                    const isTargetMatch = (!isSource && state.timeSyncNearestLines && state.timeSyncNearestLines[fileIndex] === i);
                    
                    if (fileIndex === tsTarget.sourceFileIndex && i + 1 === tsTarget.sourceLine) {
                        isSource = true;
                        isDimmed = false;
                    } else if (isTargetMatch) {
                        isNearest = true;
                        isDimmed = false;
                    } else if (lineTime >= tsTarget.minTime && lineTime <= tsTarget.maxTime) {
                        isHighlight = true;
                        isDimmed = false;
                    }
                }
            }

            if (isDimmed) tsClass += ' time-sync-dimmed';
            if (isSource) tsClass += ' time-sync-source';
            if (isHighlight) tsClass += ' time-sync-highlight';
            if (isNearest) tsClass += ' time-sync-nearest';
        }

        let displayLine = state.highlightRules.length > 0
            ? applyHighlightRules(line, file.name)
            : escapeHtml(line);

        if (hasSearchMatches && vs.searchMatchIndices.has(i) && searchQuery) {
            const searchRegex = new RegExp(escapeRegex(searchQuery), 'gi');
            displayLine = displayLine.replace(searchRegex, m => `<mark class="compare-search-hl">${m}</mark>`);
        }

        html.push(`<div class="log-line ${levelClass}${searchClass}${tsClass}" data-line="${i + 1}" data-file-index="${fileIndex}"${timestampAttr}${clickHandler} style="${cursorStyle}">${displayLine || '&nbsp;'}</div>`);
    }

    vs.viewport.innerHTML = html.join('');
    vs.viewport.style.transform = `translateY(${startIdx * vs.lineHeight}px)`;
}

let isSyncingScroll = false;

function handleCompareScroll(event, sourceIndex) {
    if (state.timeSyncScrolling || isSyncingScroll) return; // Ignore programmatic scrolls during sync
    
    const sourcePanel = event.target;
    const compareRoot = sourcePanel.closest('#compareContainer');
    if (!compareRoot) {
        return;
    }
    
    // If Time Sync is active and we have an anchor lock, sync scroll by EXACT PIXELS (slot machine mode)
    if (state.timeSyncActive && state.timeSyncOffsets && state.timeSyncOffsets[sourceIndex] !== undefined) {
        isSyncingScroll = true;
        
        const currentScroll = sourcePanel.scrollTop;
        const delta = currentScroll - state.timeSyncOffsets[sourceIndex];
        
        compareRoot.querySelectorAll('.compare-panel-content').forEach((panel) => {
            const index = parseInt(panel.getAttribute('data-panel-index'), 10);
            if (!isNaN(index) && index !== sourceIndex && state.timeSyncOffsets[index] !== undefined) {
                panel.scrollTop = state.timeSyncOffsets[index] + delta;
            }
        });
        
        // Broadcast scroll sync to popouts
        if (isElectron) {
            window.electronAPI.broadcastSync('scroll-sync', { sourceIndex, delta });
        }
        
        // Use setTimeout to reset the flag after the scroll events fire
        setTimeout(() => {
            isSyncingScroll = false;
        }, 50);
        
        return;
    }
    
    // Otherwise, use proportional sync scroll if enabled
    if (!state.syncScroll) return;
    
    isSyncingScroll = true;
    const scrollRatio = sourcePanel.scrollTop / (sourcePanel.scrollHeight - sourcePanel.clientHeight);
    
    compareRoot.querySelectorAll('.compare-panel-content').forEach((panel) => {
        const index = parseInt(panel.getAttribute('data-panel-index'), 10);
        if (!isNaN(index) && index !== sourceIndex) {
            const targetScrollTop = scrollRatio * (panel.scrollHeight - panel.clientHeight);
            panel.scrollTop = targetScrollTop;
        }
    });
    
    setTimeout(() => {
        isSyncingScroll = false;
    }, 50);
}

function toggleSyncScroll() {
    state.syncScroll = !state.syncScroll;
    const btn = document.getElementById('syncScrollBtn');
    if (state.syncScroll) {
        btn.classList.add('active');
        showToast('Sync Scroll enabled - panels will scroll together', 'success');
    } else {
        btn.classList.remove('active');
        showToast('Sync Scroll disabled', 'info');
    }
}

function highlightDifferences() {
    const compareFiles = state.files.filter(f => !f.isConfig);
    if (compareFiles.length < 2) {
        showToast('Need at least 2 log files on the Compare page', 'warning');
        return;
    }
    showDiffInfoDialog();
}

function showDiffInfoDialog() {
    const compareFiles = state.files.filter(f => !f.isConfig);
    const compareCount = compareFiles.length;

    // Remove existing if present
    const existing = document.querySelector('.diff-info-overlay');
    if (existing) existing.remove();
    
    const dialogHTML = `
        <div class="diff-info-overlay" onclick="closeDiffInfoDialog()">
            <div class="diff-info-dialog" onclick="event.stopPropagation()">
                <div class="diff-info-header">
                    <div class="diff-info-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 16v-4"></path>
                            <path d="M12 8h.01"></path>
                        </svg>
                    </div>
                    <h3>Before You Compare</h3>
                    <button class="btn-icon" onclick="closeDiffInfoDialog()" title="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <div class="diff-info-body">
                    <p class="diff-info-lead">
                        This feature is designed for spotting differences between <strong>two files that should be similar</strong> — not for comparing unrelated log files.
                    </p>
                    
                    <div class="diff-info-examples">
                        <div class="diff-info-good">
                            <div class="diff-info-example-header">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <strong>Great for</strong>
                            </div>
                            <ul>
                                <li>Two config files — spot what changed between them</li>
                                <li>Two copies of the same log — find where they diverge</li>
                                <li>Any two text files that <em>should</em> match but don't</li>
                            </ul>
                        </div>
                        <div class="diff-info-bad">
                            <div class="diff-info-example-header">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                <strong>Not ideal for</strong>
                            </div>
                            <ul>
                                <li>Comparing a Business Engine log against a Comms Engine log — they're completely different files, so almost every line will be highlighted</li>
                                <li>A customer's full suite of logs loaded together</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="diff-info-note">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                        <span>You currently have <strong>${compareCount} log file${compareCount !== 1 ? 's' : ''}</strong> in Compare. ${compareCount > 2 ? 'With more than 2 files, expect more highlighted differences.' : 'This will compare trimmed lines across those log panels.'}</span>
                    </div>
                </div>
                
                <div class="diff-info-footer">
                    <label class="diff-info-remember">
                        <input type="checkbox" id="diffInfoDontShow" />
                        <span>Don't show this again</span>
                    </label>
                    <div class="diff-info-actions">
                        <button class="btn btn-secondary" onclick="closeDiffInfoDialog()">Cancel</button>
                        <button class="btn btn-primary" onclick="proceedHighlightDifferences()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 3v18"></path>
                                <path d="M5 10l7-7 7 7"></path>
                            </svg>
                            Proceed with Comparison
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    
    // Check if user previously chose "don't show again"
    try {
        if (localStorage.getItem('traka-diff-info-skip') === 'true') {
            closeDiffInfoDialog();
            executeHighlightDifferences();
            return;
        }
    } catch (e) { /* ignore */ }
}

function closeDiffInfoDialog() {
    const overlay = document.querySelector('.diff-info-overlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        overlay.querySelector('.diff-info-dialog').style.animation = 'diffDialogOut 0.2s ease-out';
        setTimeout(() => overlay.remove(), 200);
    }
}

function proceedHighlightDifferences() {
    // Save "don't show" preference if checked
    const dontShow = document.getElementById('diffInfoDontShow');
    if (dontShow && dontShow.checked) {
        try {
            localStorage.setItem('traka-diff-info-skip', 'true');
        } catch (e) { /* ignore */ }
    }
    
    closeDiffInfoDialog();
    
    // Small delay so the dialog closes before heavy processing
    showGlobalLoader('Analysing differences...', 'Comparing lines across all files');
    setTimeout(() => {
        executeHighlightDifferences();
        hideGlobalLoader();
    }, 50);
}

function executeHighlightDifferences() {
    const compareRoot = document.getElementById('compareContainer');
    if (!compareRoot) {
        return;
    }

    const zip = [...compareRoot.querySelectorAll('.compare-panel')]
        .map(panel => {
            const gi = parseInt(panel.getAttribute('data-index'), 10);
            return { panel, file: state.files[gi] };
        })
        .filter(x => x.file && !x.file.isConfig);

    if (zip.length < 2) {
        showToast('Need at least 2 log files in Compare', 'warning');
        return;
    }

    const filesForDiff = zip.map(x => x.file);
    const allLines = filesForDiff.map(f => new Set(f.lines.map(l => String(l).trim())));
    const uniqueCounts = Array(filesForDiff.length).fill(0);
    let commonCount = 0;

    zip.forEach(({ panel, file }, panelIdx) => {
        const otherFiles = allLines.filter((_, idx) => idx !== panelIdx);
        const lines = panel.querySelectorAll('.log-line');

        lines.forEach(lineEl => {
            const lineNum = parseInt(lineEl.getAttribute('data-line'), 10);
            const lineText =
                file && !isNaN(lineNum) && lineNum >= 1
                    ? String(file.lines[lineNum - 1] || '').trim()
                    : '';

            lineEl.classList.remove('highlight-unique', 'highlight-common');

            if (!lineText) {
                return;
            }

            const isUnique = !otherFiles.some(set => set.has(lineText));
            if (isUnique) {
                lineEl.classList.add('highlight-unique');
                uniqueCounts[panelIdx]++;
            } else {
                lineEl.classList.add('highlight-common');
                commonCount++;
            }
        });
    });

    showDiffSummary(uniqueCounts, commonCount, filesForDiff);
}

function showDiffSummary(uniqueCounts, commonCount, filesOverride) {
    const files = filesOverride || state.files;
    // Create a beautiful diff summary panel
    const summaryHTML = `
        <div class="diff-summary-overlay" onclick="closeDiffSummary()">
            <div class="diff-summary-panel" onclick="event.stopPropagation()">
                <div class="diff-summary-header">
                    <h3>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 16v-4"></path>
                            <path d="M12 8h.01"></path>
                        </svg>
                        Difference Analysis
                    </h3>
                    <button class="btn-icon" onclick="closeDiffSummary()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <div class="diff-summary-content">
                    <div class="diff-legend">
                        <div class="diff-legend-item">
                            <div class="diff-legend-box unique"></div>
                            <div class="diff-legend-text">
                                <strong>Red (Unique Lines)</strong>
                                <p>Lines that only exist in this file - differences from other files</p>
                            </div>
                        </div>
                        <div class="diff-legend-item">
                            <div class="diff-legend-box common"></div>
                            <div class="diff-legend-text">
                                <strong>Blue (Common Lines)</strong>
                                <p>Lines that appear in multiple files - shared content</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="diff-stats">
                        <h4>📊 Statistics</h4>
                        ${files.map((file, idx) => `
                            <div class="diff-stat-file">
                                <div class="diff-stat-filename">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                    </svg>
                                    ${escapeHtml(file.name)}
                                </div>
                                <div class="diff-stat-numbers">
                                    <span class="diff-stat-unique">
                                        <strong>${uniqueCounts[idx]}</strong> unique lines
                                    </span>
                                    <span class="diff-stat-common">
                                        <strong>${file.lines.length - uniqueCounts[idx]}</strong> common lines
                                    </span>
                                    <span class="diff-stat-total">
                                        Total: <strong>${file.lines.length}</strong> lines
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="diff-summary-tip">
                        💡 <strong>Tip:</strong> Scroll through the comparison panels to see highlighted lines. 
                        Red indicates differences, blue shows commonalities.
                    </div>
                </div>
                
                <div class="diff-summary-footer">
                    <button class="btn btn-secondary" onclick="clearHighlights()">Clear Highlights</button>
                    <button class="btn btn-primary" onclick="closeDiffSummary()">Got It</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing summary if present
    const existing = document.querySelector('.diff-summary-overlay');
    if (existing) existing.remove();
    
    // Add new summary
    document.body.insertAdjacentHTML('beforeend', summaryHTML);
}

function closeDiffSummary() {
    const overlay = document.querySelector('.diff-summary-overlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => overlay.remove(), 200);
    }
}

function clearHighlights() {
    const compareRoot = document.getElementById('compareContainer');
    if (compareRoot) {
        compareRoot.querySelectorAll('.log-line').forEach(line => {
            line.classList.remove('highlight-unique', 'highlight-common');
        });
    }
    closeDiffSummary();
    showToast('Highlights cleared', 'info');
}

function removeFile(index) {
    const fileName = state.files[index].name;
    const hasHeavyFiles = state.files.some(f => f.lines.length > 2000);
    
    state.files.splice(index, 1);
    state.parsedLogs.delete(fileName);
    state.issues = state.issues.filter(i => i.file !== fileName);
    
    // Re-index minimized panels after removal
    const newMinimized = new Set();
    state.minimizedPanels.forEach(idx => {
        if (idx < index) newMinimized.add(idx);
        else if (idx > index) newMinimized.add(idx - 1);
        // idx === index is removed (it was the file we just removed)
    });
    state.minimizedPanels = newMinimized;
    state.lastReadPositions.delete(fileName);
    
    if (state.currentFileIndex === index) {
        state.currentFileIndex = -1;
    } else if (state.currentFileIndex > index) {
        state.currentFileIndex--;
    }
    
    if (state.currentConfigFileIndex === index) {
        const nextCfg = state.files.find(f => f.isConfig);
        state.currentConfigFileIndex = nextCfg ? state.files.indexOf(nextCfg) : -1;
    } else if (state.currentConfigFileIndex > index) {
        state.currentConfigFileIndex--;
    }
    
    // For heavy files, show a loader so the UI doesn't appear frozen
    // while the compare view rebuilds all the DOM elements
    if (hasHeavyFiles && state.files.length > 0) {
        showGlobalLoader('Updating view...', 'Rebuilding panels');
        setTimeout(() => {
            updateUI();
            updateFileDropdown();
            updateConfigFileDropdown();
            updateFilesList();
            updateCompareView();
            updateIssuesUI();
            resolveViewerFileIndex();
            
            if (state.currentFileIndex >= 0) {
                displayLog(state.files[state.currentFileIndex]);
            } else {
                displayLog(null);
            }
            if (document.getElementById('page-config')?.classList.contains('active')) {
                const cfg = state.files[state.currentConfigFileIndex];
                displayConfigFile(cfg && cfg.isConfig ? cfg : null);
            }
            hideGlobalLoader();
        }, 50);
    } else {
        updateUI();
        updateFileDropdown();
        updateConfigFileDropdown();
        updateFilesList();
        updateCompareView();
        updateIssuesUI();
        resolveViewerFileIndex();
        
        if (state.currentFileIndex >= 0) {
            displayLog(state.files[state.currentFileIndex]);
        } else {
            displayLog(null);
        }
        if (document.getElementById('page-config')?.classList.contains('active')) {
            const cfg = state.files[state.currentConfigFileIndex];
            displayConfigFile(cfg && cfg.isConfig ? cfg : null);
        }
    }
}

// ============================================
// Live Tail Functionality
// ============================================

/**
 * Toggle live tail mode on/off
 */
function toggleLiveTail() {
    if (state.liveTailActive) {
        stopLiveTail();
    } else {
        startLiveTail();
    }
}

/**
 * Start live tail monitoring
 * In Electron: Uses push-based file watchers (chokidar) for real-time updates
 * In Browser: Falls back to polling with FileReader
 */
async function startLiveTail() {
    if (state.files.length === 0) {
        showToast('Load at least one log file first', 'warning');
        return;
    }
    
    state.liveTailActive = true;
    updateLiveTailButton();
    
    // Enable auto-scroll
    state.autoScrollEnabled = true;
    
    if (isElectron) {
        // Electron mode: Use efficient polling via IPC tail-file handler.
        // This reads only new bytes from each file every poll cycle - fast and reliable.
        // Chokidar push events are used as bonus acceleration but NOT relied upon.
        let pathCount = 0;
        for (const fileData of state.files) {
            if (fileData.path) {
                // Initialize byte offset from file's current content size
                if (!state.lastReadPositions.has(fileData.name)) {
                    state.lastReadPositions.set(fileData.name, fileData.size || 0);
                }
                pathCount++;
                
                // Also start push-based watcher as accelerator (bonus, not relied upon)
                try {
                    const result = await window.electronAPI.startTailWatch(fileData.path);
                    if (result.success) {
                        state.lastReadPositions.set(fileData.name, result.currentSize);
                    }
                } catch (error) {
                    // Push watcher failed, polling will handle it
                    console.warn(`Push watcher failed for ${fileData.name}, polling will cover it:`, error);
                }
            }
        }
        
        // Start the main polling loop - this is the primary live tail mechanism
        state.liveTailInterval = setInterval(() => {
            pollElectronFiles();
        }, state.settings.tailRefreshInterval);
        
        // Also poll browser-loaded files (drag-drop)
        const filesWithoutPaths = state.files.filter(f => !f.path && f.fileHandle);
        if (filesWithoutPaths.length > 0) {
            // These are handled in the same interval via checkForFileUpdatesBrowser
        }
        
        showToast(`Live Tail started - monitoring ${pathCount} file(s) in real-time`, 'success');
    } else {
        // Browser mode: Use polling with FileReader API
        state.liveTailInterval = setInterval(() => {
            checkForFileUpdatesBrowser();
        }, state.settings.tailRefreshInterval);
        
        showToast('Live Tail started - monitoring log files for changes', 'success');
    }
    
    // Immediately scroll to bottom on both pages so user sees the latest content
    requestAnimationFrame(() => {
        scrollToBottom();
        scrollComparePanelsToBottom();
    });
}

/**
 * Stop live tail monitoring
 */
async function stopLiveTail() {
    state.liveTailActive = false;
    
    if (state.liveTailInterval) {
        clearInterval(state.liveTailInterval);
        state.liveTailInterval = null;
    }
    
    // Stop all Electron file watchers
    if (isElectron) {
        try {
            await window.electronAPI.stopAllTailWatches();
        } catch (error) {
            console.error('Error stopping tail watches:', error);
        }
    }
    
    updateLiveTailButton();
    showToast('Live Tail stopped', 'info');
}

/**
 * Poll Electron files for new content using the efficient tail-file IPC.
 * This reads only new bytes from each file's last known byte offset.
 * This is the PRIMARY live tail mechanism - reliable and deterministic.
 *
 * FIX: Uses Promise.all() for parallel IPC calls instead of sequential await,
 * and includes a re-entrancy guard so overlapping poll cycles are skipped.
 */
let _pollInProgress = false;
async function pollElectronFiles() {
    if (!state.liveTailActive) return;
    if (_pollInProgress) return; // Prevent re-entrant polling if previous cycle is still running
    _pollInProgress = true;
    
    try {
        // Separate Electron-path files from browser-loaded files
        const electronFiles = state.files.filter(f => f.path);
        const browserFiles = state.files.filter(f => !f.path && f.fileHandle);
        
        // Fire ALL tail-file IPC calls in parallel (non-blocking)
        const tailPromises = electronFiles.map(async (fileData) => {
            try {
                const fromByte = state.lastReadPositions.get(fileData.name) || 0;
                const result = await window.electronAPI.tailFile(fileData.path, fromByte);
                return { fileData, result };
            } catch (error) {
                console.error(`Error polling file ${fileData.name}:`, error);
                return { fileData, result: null };
            }
        });
        
        const results = await Promise.all(tailPromises);
        
        // Process results (DOM work happens here, on the main thread, after all IPC is done)
        for (const { fileData, result } of results) {
            if (!result || !result.success || !result.newContent || result.newContent.length === 0) continue;
            
            const newLines = result.newContent.split(/\r?\n/).filter(line => line.trim());
            if (newLines.length === 0) continue;
            
            console.log(`[LiveTail POLL] ${fileData.name}: +${newLines.length} lines, +${result.newContent.length} bytes`);
            state.lastReadPositions.set(fileData.name, result.newOffset);
            
            if (result.wasReset) {
                // File was rotated - full reload is justified here
                fileData.content = result.newContent;
                fileData.lines = result.newContent.split(/\r?\n/);
                fileData.size = result.newContent.length;
                parseLogFile(fileData);
                if (!fileData.skipIssueAnalysis) {
                    detectIssues(fileData);
                }
                
                const currentFile = state.files[state.currentFileIndex];
                if (currentFile && currentFile.name === fileData.name) {
                    displayLog(fileData);
                }
                const comparePage = document.getElementById('page-compare');
                if (comparePage && comparePage.classList.contains('active')) {
                    updateCompareView();
                }
                updateUI();
            } else {
                // Append new content efficiently (no full re-parse)
                appendNewContentLive(fileData, result.newContent, newLines);
            }
        }
        
        // Also check browser-loaded files in parallel
        if (browserFiles.length > 0) {
            const browserPromises = browserFiles.map(async (fileData) => {
                try {
                    const response = await readFileForTail(fileData.fileHandle);
                    return { fileData, response };
                } catch (error) {
                    console.error(`Error checking browser file ${fileData.name}:`, error);
                    return { fileData, response: null };
                }
            });
            
            const browserResults = await Promise.all(browserPromises);
            for (const { fileData, response } of browserResults) {
                if (response && response.newContent) {
                    appendNewContentLive(fileData, response.newContent, response.newLines);
                }
            }
        }
    } finally {
        _pollInProgress = false;
    }
}

/**
 * Check all loaded files for updates (browser-only FileReader fallback)
 */
async function checkForFileUpdatesBrowser() {
    if (!state.liveTailActive) return;
    
    for (let i = 0; i < state.files.length; i++) {
        const fileData = state.files[i];
        
        // Skip files that have Electron paths (handled by pollElectronFiles)
        if (fileData.path) continue;
        
        try {
            // Re-read the file to check for new content
            const response = await readFileForTail(fileData.fileHandle);
            if (response && response.newContent) {
                // New content detected
                appendNewContentLive(fileData, response.newContent, response.newLines);
            }
        } catch (error) {
            console.error(`Error checking file ${fileData.name}:`, error);
            // File might have been moved or deleted, continue monitoring others
        }
    }
}

/**
 * Read file and detect new content
 * In browser, we simulate this by re-reading the entire file
 */
async function readFileForTail(fileHandle) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const fullContent = e.target.result;
            const fileName = fileHandle.name;
            const lastPosition = state.lastReadPositions.get(fileName) || 0;
            
            if (fullContent.length > lastPosition) {
                // New content available
                const newContent = fullContent.substring(lastPosition);
                const newLines = newContent.split(/\r?\n/).filter(line => line.trim());
                
                // Update last read position
                state.lastReadPositions.set(fileName, fullContent.length);
                
                resolve({ newContent, newLines });
            } else {
                resolve(null); // No new content
            }
        };
        
        reader.onerror = () => reject(reader.error);
        reader.readAsText(fileHandle);
    });
}

/**
 * Append new content to file data and update display efficiently.
 * This is the core live tail update function - it appends new lines to 
 * compare panels WITHOUT re-rendering the entire view.
 */
function appendNewContentLive(fileData, newContent, newLines) {
    if (!newLines || newLines.length === 0) return;
    
    // Append new lines to file data
    const startLineIdx = fileData.lines.length;
    fileData.lines = fileData.lines.concat(newLines);
    fileData.content += newContent;
    fileData.size += newContent.length;
    
    // Limit total lines in tail mode to prevent memory issues
    let trimmed = false;
    if (fileData.lines.length > state.settings.maxTailLines) {
        const excess = fileData.lines.length - state.settings.maxTailLines;
        fileData.lines = fileData.lines.slice(excess);
        trimmed = true;
    }
    
    // FIX: Do NOT call parseLogFile() and detectIssues() on every live tail update!
    // These are expensive O(n) full-file operations that iterate every line and run
    // regex patterns against all of them. For files with 10,000+ lines running every
    // 1 second, they were the primary cause of UI freezes.
    // They only need to run on initial file load or file rotation (wasReset).
    
    // Find the file index in state.files
    const fileIndex = state.files.findIndex(f => f.name === fileData.name);
    
    // Batch DOM updates inside requestAnimationFrame to avoid layout thrashing
    requestAnimationFrame(() => {
        // Update the Log Viewer page if this is the currently viewed file
        const currentFile = state.files[state.currentFileIndex];
        if (currentFile && currentFile.name === fileData.name) {
            if (trimmed) {
                // If trimmed, do a full re-render as line numbers shifted
                displayLog(fileData);
            } else {
                // Append new lines to the viewer efficiently
                appendLinesToViewer(fileData, newLines, startLineIdx);
            }
            
            // Auto-scroll to bottom if enabled
            if (state.autoScrollEnabled) {
                scrollToBottom();
            }
        }
        
        // Update compare panels efficiently (append-only, no full re-render)
        const comparePage = document.getElementById('page-compare');
        if (comparePage && comparePage.classList.contains('active')) {
            if (trimmed) {
                // If trimmed, full re-render needed because early lines were removed
                updateCompareView();
            } else {
                // Efficiently append just the new lines to the correct compare panel
                appendLinesToComparePanel(fileData, fileIndex, newLines, startLineIdx);
            }
            
            // Update the line count badge for this panel
            updateComparePanelBadge(fileIndex, fileData.lines.length);
            
            if (state.autoScrollEnabled) {
                scrollComparePanelToBottom(fileIndex);
            }
        }
        
        // Update stats (lightweight - just sets textContent on a few elements)
        updateUI();
        // FIX: Do NOT call updateIssuesUI() here - issues haven't changed during
        // a live tail append (no detectIssues was run), so rebuilding the issues
        // DOM on every update was pure waste.
    });
}

/**
 * Efficiently append new lines to the log viewer (single file view)
 */
function appendLinesToViewer(fileData, newLines, startLineIdx) {
    if (state.virtualScroll && state.virtualScroll.active) {
        const vs = state.virtualScroll;
        const parsed = state.parsedLogs.get(fileData.name) || [];
        const newParsed = newLines.map((line, idx) => ({
            lineNumber: startLineIdx + idx + 1,
            raw: line,
            level: detectLogLevel(line),
            timestamp: extractTimestamp(line),
            message: line
        }));
        vs.filteredLines = vs.filteredLines.concat(newParsed);
        vs.totalHeight = vs.filteredLines.length * vs.lineHeight;
        const spacer = vs.contentEl.querySelector('.virtual-scroll-spacer');
        if (spacer) spacer.style.height = vs.totalHeight + 'px';
        const gutterSpacer = vs.gutterEl.querySelector('div');
        if (gutterSpacer) gutterSpacer.style.height = vs.totalHeight + 'px';
        vs.lastRenderedStart = -1;
        updateViewerViewport();
        return;
    }

    const logContent = document.getElementById('logContent');
    if (!logContent) return;
    
    const logGutter = document.getElementById('logGutter');
    
    newLines.forEach((line, idx) => {
        const lineNum = startLineIdx + idx + 1;
        const level = detectLogLevel(line);
        const levelClass = (!fileData.skipErrorRendering && level !== 'default') ? level : '';
        
        const displayLine = state.highlightRules.length > 0 
            ? applyHighlightRules(line, fileData.name)
            : escapeHtml(line);
        
        const lineDiv = document.createElement('div');
        lineDiv.className = `log-line ${levelClass}`;
        lineDiv.setAttribute('data-line', lineNum);
        lineDiv.innerHTML = displayLine || '&nbsp;';
        logContent.appendChild(lineDiv);
        
        if (logGutter) {
            const gutterLine = document.createElement('div');
            gutterLine.className = 'gutter-line';
            gutterLine.textContent = lineNum;
            logGutter.appendChild(gutterLine);
        }
    });
}

/**
 * Efficiently append new lines to a specific compare panel without re-rendering all panels.
 * This is the key function for real-time live tail in the Compare view.
 */
function appendLinesToComparePanel(fileData, fileIndex, newLines, startLineIdx) {
    const compareFiles = state.files.filter(f => !f.isConfig);
    const panelIndex = compareFiles.findIndex(f => f.name === fileData.name);
    if (panelIndex < 0) return;

    if (state.compareVirtualScroll && state.compareVirtualScroll[panelIndex]) {
        const vs = state.compareVirtualScroll[panelIndex];
        const newTotalHeight = fileData.lines.length * vs.lineHeight;
        const spacer = vs.panelContent.querySelector('.virtual-scroll-spacer');
        if (spacer) spacer.style.height = newTotalHeight + 'px';
        vs.lastRenderedStart = -1;
        updateComparePanelViewport(panelIndex);
        return;
    }

    const panel = document.querySelector(`.compare-panel[data-index="${fileIndex}"]`);
    if (!panel) return;
    
    const panelContent = panel.querySelector('.compare-panel-content');
    if (!panelContent) return;
    
    const fragment = document.createDocumentFragment();
    
    newLines.forEach((line, idx) => {
        const lineNum = startLineIdx + idx + 1;
        const level = detectLogLevel(line);
        const levelClass = (!fileData.skipErrorRendering && level !== 'default') ? level : '';
        const timestamp = extractTimestamp(line);
        
        const displayLine = state.highlightRules.length > 0 
            ? applyHighlightRules(line, fileData.name)
            : escapeHtml(line);
        
        const lineDiv = document.createElement('div');
        lineDiv.className = `log-line ${levelClass}`;
        lineDiv.setAttribute('data-line', lineNum);
        lineDiv.setAttribute('data-file-index', fileIndex);
        if (timestamp) {
            lineDiv.setAttribute('data-timestamp', timestamp);
        }
        if (state.timeSyncActive && timestamp) {
            lineDiv.style.cursor = 'pointer';
            lineDiv.onclick = () => syncToTimestamp(timestamp, fileIndex, lineNum);
        }
        lineDiv.innerHTML = displayLine || '&nbsp;';
        lineDiv.classList.add('live-tail-new-line');
        
        fragment.appendChild(lineDiv);
    });
    
    panelContent.appendChild(fragment);
    
    requestAnimationFrame(() => {
        setTimeout(() => {
            const flashLines = panelContent.querySelectorAll('.live-tail-new-line');
            flashLines.forEach(el => el.classList.remove('live-tail-new-line'));
        }, 1500);
    });
}

/**
 * Update the line count badge for a specific compare panel
 */
function updateComparePanelBadge(fileIndex, lineCount) {
    const panel = document.querySelector(`.compare-panel[data-index="${fileIndex}"]`);
    if (!panel) return;
    
    const badge = panel.querySelector('.file-badge');
    if (badge) {
        badge.textContent = `${lineCount.toLocaleString()} lines`;
    }
}

/**
 * Scroll a specific compare panel to bottom (not all panels)
 */
function scrollComparePanelToBottom(fileIndex) {
    const panel = document.querySelector(`.compare-panel[data-index="${fileIndex}"]`);
    if (!panel) return;
    
    const panelContent = panel.querySelector('.compare-panel-content');
    if (panelContent) {
        panelContent.scrollTop = panelContent.scrollHeight;
    }
}

// Keep backward compatibility - old appendNewContent calls the new function
function appendNewContent(fileData, newContent, newLines) {
    appendNewContentLive(fileData, newContent, newLines);
}

/**
 * Scroll viewer to bottom
 */
function scrollToBottom() {
    const logContent = document.getElementById('logContent');
    if (logContent) {
        logContent.scrollTop = logContent.scrollHeight;
    }
}

/**
 * Scroll all compare panels to bottom
 */
function scrollComparePanelsToBottom() {
    const root = document.getElementById('compareContainer');
    if (!root) {
        return;
    }
    root.querySelectorAll('.compare-panel-content').forEach(panel => {
        panel.scrollTop = panel.scrollHeight;
    });
}

/**
 * Update live tail button appearance
 */
function updateLiveTailButton() {
    const viewerBtn = document.getElementById('liveTailBtn');
    const compareBtn = document.getElementById('compareLiveTailBtn');
    
    const updateButton = (btn) => {
        if (!btn) return;
        
        if (state.liveTailActive) {
            btn.classList.add('active');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                Stop Tail
            `;
            btn.title = 'Stop live tail monitoring';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                Live Tail
            `;
            btn.title = 'Start live tail monitoring';
        }
    };
    
    updateButton(viewerBtn);
    updateButton(compareBtn);
    
    // Toggle live-tail-active class on all compare panels for visual indicator
    const panels = document.querySelectorAll('.compare-panel');
    panels.forEach(panel => {
        if (state.liveTailActive) {
            panel.classList.add('live-tail-active');
        } else {
            panel.classList.remove('live-tail-active');
        }
    });
}

// ============================================
// Issues UI
// ============================================
function updateIssuesUI() {
    // Update counts
    const counts = {
        all: state.issues.length,
        critical: state.issues.filter(i => i.severity === 'critical').length,
        error: state.issues.filter(i => i.severity === 'error').length,
        warning: state.issues.filter(i => i.severity === 'warning').length,
        performance: state.issues.filter(i => i.category === 'performance').length
    };
    
    const currentFile = state.files && state.currentFileIndex >= 0 ? state.files[state.currentFileIndex] : null;
    
    if (currentFile && currentFile.skipErrorRendering) {
        // Stitched (optional) or normal log loaded with "process issues" off — keep UI light
        document.getElementById('countAll').textContent = '0';
        document.getElementById('countCritical').textContent = '0';
        document.getElementById('countError').textContent = '0';
        document.getElementById('countWarning').textContent = '0';
        document.getElementById('countPerformance').textContent = '0';
        
        document.getElementById('issuesBadge').textContent = '0';
        document.getElementById('statIssues').textContent = '0';
    } else {
        // Normal behavior
        document.getElementById('countAll').textContent = counts.all;
        document.getElementById('countCritical').textContent = counts.critical;
        document.getElementById('countError').textContent = counts.error;
        document.getElementById('countWarning').textContent = counts.warning;
        document.getElementById('countPerformance').textContent = counts.performance;
        
        // Update badges
        document.getElementById('issuesBadge').textContent = counts.all;
        document.getElementById('statIssues').textContent = counts.all;
    }
    
    renderIssues();
}

function renderIssues() {
    const container = document.getElementById('issuesList');
    
    const currentFile = state.files[state.currentFileIndex];
    if (currentFile && currentFile.skipErrorRendering) {
        const detail = currentFile.isStitched
            ? 'You turned off error highlighting for this stitched log.'
            : 'This file was loaded with "Process issues on load" unchecked — no issues were scanned and log lines use plain styling for speed.';
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <p>Issue highlighting disabled</p>
                <span>${detail}</span>
            </div>
        `;
        
        // Also zero out the numbers temporarily for this view
        document.getElementById('countAll').textContent = '0';
        document.getElementById('countCritical').textContent = '0';
        document.getElementById('countError').textContent = '0';
        document.getElementById('countWarning').textContent = '0';
        document.getElementById('countPerformance').textContent = '0';
        return;
    }
    
    let filtered = state.issues;
    if (state.activeCategory !== 'all') {
        filtered = state.issues.filter(i => 
            i.category === state.activeCategory || i.severity === state.activeCategory
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <p>No issues detected</p>
                <span>${state.files.length === 0 ? 'Load log files to automatically detect issues' : 'No issues found in the current filter'}</span>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(issue => `
        <div class="issue-card ${issue.severity}" onclick="showIssueDetail('${issue.id}')">
            <div class="issue-header">
                <div class="issue-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    ${escapeHtml(issue.title)}
                </div>
                <span class="issue-severity ${issue.severity}">${issue.severity.toUpperCase()}</span>
            </div>
            <div class="issue-description">${escapeHtml(issue.description)}</div>
            <div class="issue-meta">
                <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    ${escapeHtml(issue.file)}
                </span>
                <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                    Line ${issue.line}
                </span>
            </div>
        </div>
    `).join('');
}

let currentIssueId = null;

function showIssueDetail(issueId) {
    const issue = state.issues.find(i => i.id === issueId);
    if (!issue) return;
    
    currentIssueId = issueId;
    
    const modal = document.getElementById('issueModal');
    const content = document.getElementById('issueModalContent');
    
    // Get context lines (5 before and after)
    const file = state.files.find(f => f.name === issue.file);
    let contextLines = '';
    
    if (file) {
        const startLine = Math.max(0, issue.line - 6);
        const endLine = Math.min(file.lines.length, issue.line + 5);
        
        contextLines = file.lines.slice(startLine, endLine).map((line, idx) => {
            const lineNum = startLine + idx + 1;
            const isIssueLine = lineNum === issue.line;
            const level = detectLogLevel(line);
            return `<div class="log-line ${isIssueLine ? 'highlight' : ''} ${level}" data-line="${lineNum}">
                <span style="color: var(--text-tertiary); margin-right: 1rem;">${lineNum}</span>${escapeHtml(line)}
            </div>`;
        }).join('');
    }
    
    content.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                <span class="issue-severity ${issue.severity}">${issue.severity.toUpperCase()}</span>
                <strong style="font-size: 1.125rem;">${escapeHtml(issue.title)}</strong>
            </div>
            <p style="color: var(--text-secondary);">${escapeHtml(issue.description)}</p>
        </div>
        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.75rem; font-size: 0.9375rem;">Details</h4>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; font-size: 0.875rem;">
                <span style="color: var(--text-tertiary);">File:</span>
                <span>${escapeHtml(issue.file)}</span>
                <span style="color: var(--text-tertiary);">Line:</span>
                <span>${issue.line}</span>
                <span style="color: var(--text-tertiary);">Pattern:</span>
                <code style="font-family: var(--font-mono); font-size: 0.8125rem; color: var(--accent-primary);">${escapeHtml(issue.pattern)}</code>
            </div>
        </div>
        <div>
            <h4 style="margin-bottom: 0.75rem; font-size: 0.9375rem;">Context</h4>
            <div style="background: var(--bg-primary); border-radius: var(--radius-md); padding: 0.75rem; font-family: var(--font-mono); font-size: 12px; line-height: 20px; overflow-x: auto;">
                ${contextLines || '<em style="color: var(--text-tertiary);">Unable to load context</em>'}
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('issueModal').classList.remove('active');
    currentIssueId = null;
}

function goToIssueLine() {
    const issue = state.issues.find(i => i.id === currentIssueId);
    if (!issue) return;
    
    // Find and select the file
    const fileIndex = state.files.findIndex(f => f.name === issue.file);
    if (fileIndex >= 0) {
        state.currentFileIndex = fileIndex;
        document.getElementById('viewerFileSelect').value = issue.file;
        displayLog(state.files[fileIndex]);
        
        // Navigate to viewer
        navigateTo('viewer');
        
        // Jump to line after a short delay
        setTimeout(() => {
            const lineEl = document.querySelector(`.log-line[data-line="${issue.line}"]`);
            if (lineEl) {
                lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                lineEl.classList.add('highlight');
                setTimeout(() => lineEl.classList.remove('highlight'), 2000);
            }
        }, 100);
    }
    
    closeModal();
}

function exportIssues() {
    if (state.issues.length === 0) {
        showToast('No issues to export', 'warning');
        return;
    }
    
    const report = state.issues.map(issue => 
        `[${issue.severity.toUpperCase()}] ${issue.title}\nFile: ${issue.file}, Line: ${issue.line}\nDescription: ${issue.description}\nContent: ${issue.content}\n`
    ).join('\n---\n\n');
    
    const header = `Traka Log Analyzer - Issue Report\nGenerated: ${new Date().toISOString()}\nTotal Issues: ${state.issues.length}\n\n${'='.repeat(50)}\n\n`;
    
    const blob = new Blob([header + report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traka-log-issues-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Issue report exported', 'success');
}

// ============================================
// Settings
// ============================================
function initSettings() {
    const fontSelect = document.getElementById('fontSizeSelect');
    if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
            state.settings.fontSize = parseInt(e.target.value);
            if (state.currentFileIndex >= 0) {
                displayLog(state.files[state.currentFileIndex]);
            }
        });
    }
    
    // Checkboxes
    ['wordWrap', 'showLineNumbers', 'highlightSearch', 
     'detectErrors', 'detectExceptions', 'detectTimeouts', 'detectConnections',
     'detectAuth', 'detectPerformance', 'detectLicensing', 'detectDatabase',
     'detectIntegration', 'detectCabinet', 'detectAPI'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', (e) => {
                state.settings[id] = e.target.checked;
            });
        }
    });
    
    const processIssuesOnLoadEl = document.getElementById('processIssuesOnLoad');
    if (processIssuesOnLoadEl) {
        processIssuesOnLoadEl.addEventListener('change', (e) => {
            syncProcessIssuesOnLoadCheckboxes(e.target.checked);
            persistProcessIssuesOnLoadPreference();
        });
    }
}

function loadSettings() {
    const saved = localStorage.getItem('trakaLogAnalyzerSettings');
    if (saved) {
        try {
            Object.assign(state.settings, JSON.parse(saved));
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
    
    // Apply to UI
    document.getElementById('fontSizeSelect').value = state.settings.fontSize;
    document.getElementById('wordWrap').checked = state.settings.wordWrap;
    document.getElementById('showLineNumbers').checked = state.settings.showLineNumbers;
    document.getElementById('highlightSearch').checked = state.settings.highlightSearch;
    document.getElementById('detectErrors').checked = state.settings.detectErrors;
    document.getElementById('detectExceptions').checked = state.settings.detectExceptions;
    document.getElementById('detectTimeouts').checked = state.settings.detectTimeouts;
    document.getElementById('detectConnections').checked = state.settings.detectConnections;
    document.getElementById('detectAuth').checked = state.settings.detectAuth;
    document.getElementById('detectPerformance').checked = state.settings.detectPerformance;
    document.getElementById('detectLicensing').checked = state.settings.detectLicensing;
    document.getElementById('detectDatabase').checked = state.settings.detectDatabase;
    document.getElementById('detectIntegration').checked = state.settings.detectIntegration;
    document.getElementById('detectCabinet').checked = state.settings.detectCabinet;
    document.getElementById('detectAPI').checked = state.settings.detectAPI;
    
    syncProcessIssuesOnLoadCheckboxes(state.settings.processIssuesOnLoad !== false);
}

function saveSettings() {
    // Gather settings from UI
    state.settings.fontSize = parseInt(document.getElementById('fontSizeSelect').value);
    state.settings.wordWrap = document.getElementById('wordWrap').checked;
    state.settings.showLineNumbers = document.getElementById('showLineNumbers').checked;
    state.settings.highlightSearch = document.getElementById('highlightSearch').checked;
    state.settings.detectErrors = document.getElementById('detectErrors').checked;
    state.settings.detectExceptions = document.getElementById('detectExceptions').checked;
    state.settings.detectTimeouts = document.getElementById('detectTimeouts').checked;
    state.settings.detectConnections = document.getElementById('detectConnections').checked;
    state.settings.detectAuth = document.getElementById('detectAuth').checked;
    state.settings.detectPerformance = document.getElementById('detectPerformance').checked;
    state.settings.detectLicensing = document.getElementById('detectLicensing').checked;
    state.settings.detectDatabase = document.getElementById('detectDatabase').checked;
    state.settings.detectIntegration = document.getElementById('detectIntegration').checked;
    state.settings.detectCabinet = document.getElementById('detectCabinet').checked;
    state.settings.detectAPI = document.getElementById('detectAPI').checked;
    state.settings.processIssuesOnLoad = isProcessIssuesOnLoadEnabled();
    syncProcessIssuesOnLoadCheckboxes(state.settings.processIssuesOnLoad);
    
    // Gather custom patterns
    state.settings.customPatterns = [];
    document.querySelectorAll('.pattern-input').forEach(row => {
        const pattern = row.querySelector('.pattern-regex')?.value;
        const severity = row.querySelector('.pattern-severity')?.value;
        const desc = row.querySelector('.pattern-desc')?.value;
        if (pattern) {
            state.settings.customPatterns.push({ pattern, severity, description: desc });
        }
    });
    
    localStorage.setItem('trakaLogAnalyzerSettings', JSON.stringify(state.settings));
    
    // Save Electron-specific settings if in Electron mode
    if (isElectron) {
        const autoScanCheckbox = document.getElementById('autoScanOnStartup');
        const watchCheckbox = document.getElementById('watchDirectories');
        
        if (autoScanCheckbox) electronState.autoScanOnStartup = autoScanCheckbox.checked;
        if (watchCheckbox) electronState.watchDirectories = watchCheckbox.checked;
        
        saveElectronSettings();
    }
    
    // Re-analyze files with new settings
    state.files.forEach(file => detectIssues(file));
    
    if (state.currentFileIndex >= 0) {
        displayLog(state.files[state.currentFileIndex]);
    }
    
    showToast('Settings saved', 'success');
}

function resetSettings() {
    state.settings = {
        detectErrors: true,
        detectExceptions: true,
        detectTimeouts: true,
        detectConnections: true,
        detectAuth: true,
        detectPerformance: true,
        detectLicensing: true,
        detectDatabase: true,
        detectIntegration: true,
        detectCabinet: true,
        detectAPI: true,
        fontSize: 13,
        wordWrap: true,
        showLineNumbers: true,
        highlightSearch: true,
        customPatterns: [],
        processIssuesOnLoad: true
    };
    
    localStorage.removeItem('trakaLogAnalyzerSettings');
    loadSettings();
    showToast('Settings reset to defaults', 'info');
}

function addPattern() {
    const container = document.getElementById('customPatterns');
    const newRow = document.createElement('div');
    newRow.className = 'pattern-input';
    newRow.innerHTML = `
        <input type="text" placeholder="Pattern (regex)" class="pattern-regex">
        <select class="pattern-severity">
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
        </select>
        <input type="text" placeholder="Description" class="pattern-desc">
        <button class="btn-icon btn-remove" onclick="removePattern(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    container.appendChild(newRow);
}

function removePattern(btn) {
    const row = btn.closest('.pattern-input');
    const container = document.getElementById('customPatterns');
    if (container.children.length > 1) {
        row.remove();
    } else {
        row.querySelectorAll('input').forEach(input => input.value = '');
    }
}

// ============================================
// UI Updates
// ============================================
function updateUI() {
    // Update stats
    document.getElementById('statFiles').textContent = state.files.length;
    document.getElementById('statLines').textContent = state.files.reduce((sum, f) => sum + f.lines.length, 0).toLocaleString();
    document.getElementById('loadedFilesCount').textContent = `${state.files.length} file${state.files.length !== 1 ? 's' : ''} loaded`;
    
    // Show/hide recent files section
    document.getElementById('recentFilesSection').style.display = state.files.length > 0 ? 'block' : 'none';
}

function resolveViewerFileIndex() {
    const logs = state.files.filter(f => !f.isConfig);
    if (logs.length === 0) {
        state.currentFileIndex = -1;
        return;
    }
    const cur = state.currentFileIndex >= 0 ? state.files[state.currentFileIndex] : null;
    if (!cur || cur.isConfig) {
        state.currentFileIndex = state.files.indexOf(logs[0]);
    } else if (!logs.some(f => f.name === cur.name)) {
        state.currentFileIndex = state.files.indexOf(logs[0]);
    }
}

function updateConfigFileDropdown() {
    const select = document.getElementById('configFileSelect');
    if (!select) return;
    const configs = state.files.filter(f => f.isConfig);
    if (configs.length === 0) {
        select.innerHTML = '<option value="">-- Load a .cfg file --</option>';
        state.currentConfigFileIndex = -1;
        return;
    }
    if (state.currentConfigFileIndex < 0 || !state.files[state.currentConfigFileIndex]?.isConfig) {
        state.currentConfigFileIndex = state.files.indexOf(configs[0]);
    }
    select.innerHTML = configs.map(f => {
        const idx = state.files.indexOf(f);
        const sel = idx === state.currentConfigFileIndex ? ' selected' : '';
        return `<option value="${escapeHtml(f.name)}"${sel}>${escapeHtml(getDisplayFileName(f))}</option>`;
    }).join('');
    select.onchange = (e) => {
        const idx = state.files.findIndex(f => f.name === e.target.value);
        if (idx >= 0 && state.files[idx].isConfig) {
            state.currentConfigFileIndex = idx;
            displayConfigFile(state.files[idx]);
        }
    };
}

function updateFileDropdown() {
    const select = document.getElementById('viewerFileSelect');
    if (!select) return;
    
    resolveViewerFileIndex();
    const logFiles = state.files.filter(f => !f.isConfig);
    if (logFiles.length === 0) {
        select.innerHTML = '<option value="">-- Load a log file first --</option>';
        return;
    }
    
    select.innerHTML = logFiles.map(file => {
        const idx = state.files.indexOf(file);
        const sel = idx === state.currentFileIndex ? ' selected' : '';
        return `<option value="${escapeHtml(file.name)}"${sel}>${escapeHtml(getDisplayFileName(file))}</option>`;
    }).join('');
    
    select.onchange = (e) => {
        const index = state.files.findIndex(f => f.name === e.target.value);
        if (index >= 0) {
            state.currentFileIndex = index;
            const file = state.files[index];
            
            if (file.lines && file.lines.length > 2000) {
                showGlobalLoader('Loading file...', file.name);
                setTimeout(() => {
                    displayLog(file);
                    hideGlobalLoader();
                }, 50);
            } else {
                displayLog(file);
            }
        }
    };
}

function updateFilesList() {
    const container = document.getElementById('filesList');
    
    container.innerHTML = state.files.map((file, index) => {
        const fileTypeBadge = file.isConfig 
            ? '<span class="file-type-badge config">CONFIG</span>' 
            : '<span class="file-type-badge log">LOG</span>';
        
        return `
        <div class="file-item">
            <div class="file-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <div>
                    <div class="file-name">${escapeHtml(getDisplayFileName(file))} ${fileTypeBadge}</div>
                    <div class="file-meta">${file.lines.length.toLocaleString()} lines · ${formatFileSize(file.size)}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-small btn-secondary" onclick="viewFile(${index})">View</button>
                <button class="btn-icon" onclick="removeFile(${index})" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    `;
    }).join('');
}

function viewFile(index) {
    const file = state.files[index];
    if (file.isConfig) {
        state.currentConfigFileIndex = index;
        updateConfigFileDropdown();
        if (file.lines && file.lines.length > 2000) {
            showGlobalLoader('Loading file...', file.name);
            setTimeout(() => {
                displayConfigFile(file);
                navigateTo('config');
                hideGlobalLoader();
            }, 50);
        } else {
            displayConfigFile(file);
            navigateTo('config');
        }
        return;
    }
    state.currentFileIndex = index;
    updateFileDropdown();
    
    if (file.lines && file.lines.length > 2000) {
        showGlobalLoader('Loading file...', file.name);
        setTimeout(() => {
            displayLog(file);
            navigateTo('viewer');
            hideGlobalLoader();
        }, 50);
    } else {
        displayLog(file);
        navigateTo('viewer');
    }
}

function jumpToLine() {
    const lineNum = parseInt(document.getElementById('jumpToLine').value);
    if (isNaN(lineNum) || lineNum < 1) {
        showToast('Please enter a valid line number', 'warning');
        return;
    }
    
    const mainLogContent = document.getElementById('logContent');
    if (state.virtualScroll && state.virtualScroll.active && state.virtualScroll.contentEl === mainLogContent) {
        const vs = state.virtualScroll;
        const idx = vs.filteredLines.findIndex(e => e.lineNumber === lineNum);
        if (idx >= 0) {
            const scrollPos = idx * vs.lineHeight - vs.contentEl.clientHeight / 2;
            vs.contentEl.scrollTop = Math.max(0, scrollPos);
            vs.lastRenderedStart = -1;
            updateViewerViewport();
            requestAnimationFrame(() => {
                const lineEl = vs.viewport.querySelector(`[data-line="${lineNum}"]`);
                if (lineEl) {
                    lineEl.classList.add('highlight');
                    setTimeout(() => lineEl.classList.remove('highlight'), 2000);
                }
            });
        } else {
            showToast(`Line ${lineNum} not found in current view`, 'warning');
        }
        return;
    }
    
    const lineEl = document.querySelector(`#logContent .log-line[data-line="${lineNum}"]`);
    if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lineEl.classList.add('highlight');
        
        const gutterEl = document.querySelector(`#logGutter .line-number[data-line="${lineNum}"]`);
        if (gutterEl) gutterEl.classList.add('active');
        
        setTimeout(() => {
            lineEl.classList.remove('highlight');
            if (gutterEl) gutterEl.classList.remove('active');
        }, 2000);
    } else {
        showToast(`Line ${lineNum} not found in current view`, 'warning');
    }
}

function jumpToConfigLine() {
    if (state.configViewMode === 'multi') {
        showToast('Switch to single file view to jump to a line', 'info');
        return;
    }
    const lineNum = parseInt(document.getElementById('configJumpToLine').value);
    if (isNaN(lineNum) || lineNum < 1) {
        showToast('Please enter a valid line number', 'warning');
        return;
    }
    const cfgContent = document.getElementById('configLogContent');
    if (state.virtualScroll && state.virtualScroll.active && state.virtualScroll.contentEl === cfgContent) {
        const vs = state.virtualScroll;
        const idx = vs.filteredLines.findIndex(e => e.lineNumber === lineNum);
        if (idx >= 0) {
            const scrollPos = idx * vs.lineHeight - vs.contentEl.clientHeight / 2;
            vs.contentEl.scrollTop = Math.max(0, scrollPos);
            vs.lastRenderedStart = -1;
            updateViewerViewport();
            requestAnimationFrame(() => {
                const lineEl = vs.viewport.querySelector(`[data-line="${lineNum}"]`);
                if (lineEl) {
                    lineEl.classList.add('highlight');
                    setTimeout(() => lineEl.classList.remove('highlight'), 2000);
                }
            });
        } else {
            showToast(`Line ${lineNum} not found`, 'warning');
        }
        return;
    }
    const lineEl = document.querySelector(`#configLogContent .log-line[data-line="${lineNum}"]`);
    if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lineEl.classList.add('highlight');
        const gutterEl = document.querySelector(`#configLogGutter .line-number[data-line="${lineNum}"]`);
        if (gutterEl) gutterEl.classList.add('active');
        setTimeout(() => {
            lineEl.classList.remove('highlight');
            if (gutterEl) gutterEl.classList.remove('active');
        }, 2000);
    } else {
        showToast(`Line ${lineNum} not found`, 'warning');
    }
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
        error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
        warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
        info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    };
    
    toast.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${icons[type] || icons.info}
        </svg>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// Log File Stitching Feature
// ============================================
function toggleStitchMode() {
    state.stitchMode = !state.stitchMode;
    const panel = document.getElementById('stitchPanel');
    const btn = document.getElementById('stitchModeBtn');
    
    if (state.stitchMode) {
        panel.style.display = 'block';
        btn.classList.add('active');
        populateStitchFileList();
        hideStitchLegend();
        showToast('Select files to stitch together', 'info');
    } else {
        panel.style.display = 'none';
        btn.classList.remove('active');
        state.stitchedFiles = [];
        const cf = state.files[state.currentFileIndex];
        if (cf && cf.isStitched && Array.isArray(cf.sourceFiles)) {
            displayStitchLegend(cf.sourceFiles);
        }
    }
}

// Drag and drop handlers for stitch list
let stitchDragSourceEl = null;

function handleStitchDragStart(e) {
    stitchDragSourceEl = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.currentTarget.dataset.filename);
    
    // Capture the target element for the timeout
    const targetEl = e.currentTarget;
    setTimeout(() => {
        targetEl.style.opacity = '0.5';
        targetEl.classList.add('dragging');
    }, 0);
}

function handleStitchDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const draggingElement = document.querySelector('.stitch-file-item.dragging');
    if (!draggingElement) return;

    const targetElement = e.target.closest('.stitch-file-item');
    if (targetElement && targetElement !== draggingElement) {
        const container = document.getElementById('stitchFileList');
        const rect = targetElement.getBoundingClientRect();
        const midPoint = rect.top + rect.height / 2;
        if (e.clientY < midPoint) {
            container.insertBefore(draggingElement, targetElement);
        } else {
            container.insertBefore(draggingElement, targetElement.nextElementSibling);
        }
    }
}

function handleStitchDragEnd(e) {
    const targetEl = e.currentTarget;
    targetEl.style.opacity = '1';
    targetEl.classList.remove('dragging');
    updateStitchOrderBadges();
    updateStitchOrderDisabledStates();
    updateStitchSelection();
}

function populateStitchFileList() {
    const container = document.getElementById('stitchFileList');
    
    if (state.files.length === 0) {
        container.innerHTML = '<p class="empty-message">No files loaded. Load files first.</p>';
        return;
    }
    
    // Filter out config files and already stitched files
    let logFiles = state.files.filter(f => !f.isConfig && !f.isStitched);
    
    if (logFiles.length === 0) {
        container.innerHTML = '<p class="empty-message">No log files available for stitching. Config and stitched files cannot be stitched.</p>';
        return;
    }
    
    // Sort files logically to stitch them in chronological order
    logFiles.sort((a, b) => {
        const parseFilename = (filename) => {
            const lower = filename.toLowerCase();
            
            // Check for suffix rotation: .log.1, .txt.2
            const suffixMatch = lower.match(/^(.*(?:\.log|\.txt|\.cfg))\.(\d+)$/);
            if (suffixMatch) {
                const val = parseInt(suffixMatch[2], 10);
                // Dates like .20240319 might appear as suffix
                if (suffixMatch[2].length === 8 && suffixMatch[2].startsWith('20')) {
                    return { base: suffixMatch[1], type: 'date', val: val };
                }
                return { base: suffixMatch[1], type: 'rotation', val: val };
            }
            
            // Check for inline rotation or date: Debugging_Log_20260223.txt or Integration Service Log 001.log
            const inlineMatch = lower.match(/^(.*?)[_\-\s\(]+(\d+)[\)]?(?:\.(?:log|txt|cfg))$/);
            if (inlineMatch) {
                const ext = lower.match(/\.(log|txt|cfg)$/)?.[0] || '';
                const base = inlineMatch[1].trim() + ext;
                const val = parseInt(inlineMatch[2], 10);
                
                // If it's exactly 8 digits and starts with 20 (e.g. 2024...), treat as date
                if (inlineMatch[2].length === 8 && inlineMatch[2].startsWith('20')) {
                    return { base: base, type: 'date', val: val };
                }
                // Otherwise treat as rotation index (like _001, _002)
                return { base: base, type: 'rotation', val: val };
            }
            
            // Base file (e.g. Debugging_Log.txt, Integration_Log.txt)
            return { base: lower, type: 'base', val: 0 };
        };

        const parsedA = parseFilename(a.name);
        const parsedB = parseFilename(b.name);

        // Group by base filename
        const baseCompare = parsedA.base.localeCompare(parsedB.base, undefined, {numeric: true, sensitivity: 'base'});
        if (baseCompare !== 0) return baseCompare;

        // Within same log group:
        // Base file always at the bottom (newest)
        if (parsedA.type === 'base' && parsedB.type !== 'base') return 1;
        if (parsedB.type === 'base' && parsedA.type !== 'base') return -1;
        if (parsedA.type === 'base' && parsedB.type === 'base') return 0;

        // If both are dates, sort ascending (smaller/older date first)
        if (parsedA.type === 'date' && parsedB.type === 'date') {
            return parsedA.val - parsedB.val;
        }

        // If both are rotation indices, sort descending (higher/older number first)
        if (parsedA.type === 'rotation' && parsedB.type === 'rotation') {
            return parsedB.val - parsedA.val;
        }

        // Fallback
        return a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
    });
    
    let html = '';
    logFiles.forEach((file, index) => {
        html += `
            <div class="stitch-file-item sortable-item" draggable="true" data-filename="${escapeHtml(file.name)}" 
                 ondragstart="handleStitchDragStart(event)" ondragend="handleStitchDragEnd(event)"
                 style="display: flex; align-items: center; padding: 0.5rem; border: 1px solid var(--border-color); margin-bottom: 0.25rem; border-radius: 4px; background: var(--bg-secondary); cursor: grab;">
                <div class="stitch-order-controls" style="display: flex; flex-direction: column; margin-right: 8px;">
                    <button class="btn-icon btn-small" onclick="moveStitchItem(this, -1)" title="Move Up" style="padding: 2px;">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                    <button class="btn-icon btn-small" onclick="moveStitchItem(this, 1)" title="Move Down" style="padding: 2px;">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                </div>
                <div class="stitch-order-badge" style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-right: 8px; width: 24px; text-align: center;">
                    ${index + 1}
                </div>
                <label style="display: flex; align-items: center; flex: 1; cursor: pointer; margin: 0;">
                    <input type="checkbox" value="${escapeHtml(file.name)}" onchange="updateStitchSelection()" style="margin-right: 8px;">
                    <span class="file-name" style="flex: 1;">${escapeHtml(getDisplayFileName(file))}</span>
                    <span class="file-info" style="font-size: 0.8rem; color: var(--text-secondary);">
                        ${file.lines.length.toLocaleString()} lines | ${formatFileSize(file.size)}
                    </span>
                </label>
                <div class="drag-handle" style="padding: 0 4px; color: var(--text-tertiary); cursor: grab; display: flex; align-items: center;" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    container.ondragover = handleStitchDragOver;
    updateStitchOrderDisabledStates();
}

function moveStitchItem(btn, direction) {
    const item = btn.closest('.sortable-item');
    const container = item.parentElement;
    
    if (direction === -1 && item.previousElementSibling) {
        container.insertBefore(item, item.previousElementSibling);
    } else if (direction === 1 && item.nextElementSibling) {
        container.insertBefore(item.nextElementSibling, item);
    }
    
    // Animate to show it moved
    item.style.background = 'var(--accent-primary-alpha)';
    setTimeout(() => item.style.background = 'var(--bg-secondary)', 300);
    
    updateStitchOrderBadges();
    updateStitchOrderDisabledStates();
    updateStitchSelection();
}

function updateStitchOrderDisabledStates() {
    const items = document.querySelectorAll('#stitchFileList .sortable-item');
    items.forEach((item, index) => {
        const upBtn = item.querySelectorAll('.stitch-order-controls button')[0];
        const downBtn = item.querySelectorAll('.stitch-order-controls button')[1];
        
        upBtn.disabled = index === 0;
        upBtn.style.opacity = index === 0 ? '0.3' : '1';
        upBtn.style.cursor = index === 0 ? 'not-allowed' : 'pointer';
        
        downBtn.disabled = index === items.length - 1;
        downBtn.style.opacity = index === items.length - 1 ? '0.3' : '1';
        downBtn.style.cursor = index === items.length - 1 ? 'not-allowed' : 'pointer';
    });
}

function updateStitchOrderBadges() {
    const items = document.querySelectorAll('#stitchFileList .sortable-item');
    items.forEach((item, index) => {
        const badge = item.querySelector('.stitch-order-badge');
        if (badge) badge.textContent = index + 1;
    });
}

function groupFilesByType(files) {
    const groups = {
        'Business Engine': [],
        'Comms Engine': [],
        'Integration Engine': [],
        'Plugins': [],
        'Other Logs': []
    };
    
    files.forEach(file => {
        const lower = file.name.toLowerCase();
        if (lower.includes('business')) {
            groups['Business Engine'].push(file);
        } else if (lower.includes('comms')) {
            groups['Comms Engine'].push(file);
        } else if (lower.includes('integration')) {
            groups['Integration Engine'].push(file);
        } else if (lower.includes('ccure') || lower.includes('lenel') || lower.includes('onguard') || 
                   lower.includes('symmetry') || lower.includes('plugin')) {
            groups['Plugins'].push(file);
        } else {
            groups['Other Logs'].push(file);
        }
    });
    
    // Remove empty groups
    return Object.fromEntries(
        Object.entries(groups).filter(([_, files]) => files.length > 0)
    );
}

function updateStitchSelection() {
    const items = document.querySelectorAll('#stitchFileList .sortable-item');
    state.stitchedFiles = [];
    items.forEach(item => {
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && cb.checked) {
            state.stitchedFiles.push(cb.value);
        }
    });
    
    // Check direction
    const direction = document.getElementById('stitchDirection')?.value || 'asc';
    if (direction === 'desc') {
        state.stitchedFiles.reverse();
    }
    
    const btn = document.getElementById('performStitchBtn');
    const exportBtn = document.getElementById('exportStitchedBtn');
    
    btn.disabled = state.stitchedFiles.length < 2;
    
    if (state.stitchedFiles.length >= 2) {
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Stitch ${state.stitchedFiles.length} Files
        `;
    } else {
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Stitch Selected Files
        `;
    }
    
    // Enable export button if we have a stitched log
    exportBtn.disabled = !state.stitchedData;
}

function performStitch() {
    if (state.stitchedFiles.length < 2) {
        showToast('Select at least 2 files to stitch', 'warning');
        return;
    }
    
    // Show loading overlay
    showStitchingLoader(state.stitchedFiles.length);
    
    // Use setTimeout to allow UI to update before heavy processing
    setTimeout(async () => {
        try {
            await performStitchAsync();
        } catch (error) {
            hideStitchingLoader();
            showToast(`Stitch failed: ${error.message}`, 'error');
        }
    }, 100);
}

async function performStitchAsync() {
    // Gather all log entries from selected files
    const allEntries = [];
    let totalLines = 0;
    const totalFiles = state.stitchedFiles.length;
    let processedFiles = 0;
    
    // The files are already sorted by the user in the UI
    const sortedFiles = state.stitchedFiles.slice();
    
    // Process files in chunks to keep UI responsive
    for (const fileName of sortedFiles) {
        const fileData = state.files.find(f => f.name === fileName);
        if (!fileData) continue;
        
        const parsed = state.parsedLogs.get(fileName);
        
        // Ensure parsed log entries actually have data! Sometimes caching goes wrong.
        if (!parsed || (parsed.length === 0 && fileData.lines && fileData.lines.length > 0)) {
            // Re-parse just in case the cache got cleared
            parseLogFile(fileData);
            // Must fetch it freshly after parsing!
        }
        
        // Fetch it one more time just to be completely sure
        const freshParsed = state.parsedLogs.get(fileName);
        if (!freshParsed || freshParsed.length === 0) continue;
        
        // Update progress
        processedFiles++;
        updateStitchingProgress(processedFiles, totalFiles, `Processing ${fileName}...`);
        // Force UI update
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Inject separator line before each file
        if (allEntries.length > 0) {
            allEntries.push({
                isSeparator: true,
                raw: `--- STITCH BREAK: Switching to ${fileName} ---`,
                lineNumber: -1, // Special marker
                sourceFile: 'SEPARATOR',
                timestamp: null // explicitly mark as having no time so it inherits properly later
            });
        }
        
        // Process entries in chunks
        const chunkSize = 10000;
        for (let i = 0; i < freshParsed.length; i += chunkSize) {
            const chunk = freshParsed.slice(i, Math.min(i + chunkSize, freshParsed.length));
            
            chunk.forEach(entry => {
                totalLines++;
                // Create a fresh clone of the entry to ensure we don't accidentally mutate 
                // the original parsed cache in a way that breaks it for single-file viewing
                const newEntry = {
                    ...entry,
                    sourceFile: fileName,
                    originalIndex: entry.lineNumber
                };
                
                // Give the stitched file a continuous global line number
                newEntry.lineNumber = allEntries.length + 1;
                
                delete newEntry.cachedTime; // Force recalculation so stack traces inherit timestamps across file boundaries!
                allEntries.push(newEntry);
            });
            
            // Yield to browser every chunk
            if (i + chunkSize < freshParsed.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }
    
    // Add final "END OF STITCHED LOG" separator
    if (allEntries.length > 0) {
        allEntries.push({
            isSeparator: true,
            raw: `--- END OF STITCHED LOG ---`,
            lineNumber: -1, // Special marker
            sourceFile: 'SEPARATOR',
            timestamp: null // explicitly mark as having no time so it inherits properly later
        });
    }
    
    const finalEntries = allEntries;
    
    // Create a virtual "stitched" file
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const stitchedFileName = `Stitched_${state.stitchedFiles.length}files_${dateStr}_${timeStr}.log`;
    
    // Check if user wants to skip error rendering for performance
    const renderErrorsCheckbox = document.getElementById('renderStitchErrors');
    const skipErrorRendering = renderErrorsCheckbox ? !renderErrorsCheckbox.checked : false;
    
    updateStitchingProgress(100, 100, 'Finalizing stitched log...');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Defer array map and join to keep UI responsive
    // Instead of doing it all at once which blocks the thread, we will just keep the entries
    // For the content string (needed for export), we will build it on-demand during export to save massive memory and time.
    state.stitchedData = {
        name: stitchedFileName,
        size: finalEntries.length * 100, // Estimate size
        lastModified: new Date(),
        content: "Content generated on export", 
        lines: finalEntries, // We use entries instead of raw strings to save memory
        isStitched: true,
        sourceFiles: sortedFiles, // Keep the sorted array
        entries: finalEntries,
        isConfig: false,
        skipErrorRendering: skipErrorRendering
    };
    
    // Parse the stitched data
    state.parsedLogs.set(stitchedFileName, finalEntries);
    
    // Skip issue detection for stitched logs to save massive amounts of time.
    // Issues are already detected on the individual files anyway!
    
    // Add to files list if not already there, or replace if it exists
    const existingIndex = state.files.findIndex(f => f.name === stitchedFileName || f.isStitched);
    if (existingIndex >= 0) {
        state.files[existingIndex] = state.stitchedData;
    } else {
        state.files.push(state.stitchedData);
    }
    
    // Select and display stitched file BEFORE updating dropdown
    state.currentFileIndex = state.files.findIndex(f => f.name === stitchedFileName);
    
    // Update UI
    updateUI();
    updateFileDropdown();
    updateIssuesUI();
    
    displayStitchedLog(state.stitchedData);
    
    // Enable export button
    document.getElementById('exportStitchedBtn').disabled = false;
    
    // Hide loader
    hideStitchingLoader();
    
    // Close stitch panel
    toggleStitchMode();
    
    showToast(`✓ Successfully stitched ${state.stitchedFiles.length} files with ${finalEntries.length.toLocaleString()} log entries`, 'success');
}

function showStitchingLoader(fileCount) {
    // Remove existing overlay if present
    hideStitchingLoader();
    
    const overlay = document.createElement('div');
    overlay.id = 'stitchingLoader';
    overlay.className = 'stitching-loader-overlay';
    overlay.innerHTML = `
        <div class="stitching-loader-content">
            <div class="stitching-spinner"></div>
            <h3>Stitching ${fileCount} log files...</h3>
            <p id="stitchingStatus">Initializing...</p>
            <div class="stitching-progress-bar">
                <div class="stitching-progress-fill" id="stitchingProgress"></div>
            </div>
            <div class="stitching-status" id="stitchingDetails">
                Processing files...
            </div>
            <div class="global-loader-timer" id="stitchingTimer">0.0s</div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Start elapsed timer
    const startTime = performance.now();
    overlay._timerInterval = setInterval(() => {
        const timerEl = document.getElementById('stitchingTimer');
        if (timerEl) {
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            timerEl.textContent = `${elapsed}s`;
        }
    }, 100);
}

function hideStitchingLoader() {
    const overlay = document.getElementById('stitchingLoader');
    if (overlay) {
        if (overlay._timerInterval) {
            clearInterval(overlay._timerInterval);
        }
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => overlay.remove(), 200);
    }
}

// ============================================
// Global Loading Overlay
// ============================================
function showGlobalLoader(message = 'Loading...', subtext = '') {
    // Remove existing loader if present
    hideGlobalLoader(true); // immediate removal
    
    const overlay = document.createElement('div');
    overlay.id = 'globalLoader';
    overlay.className = 'global-loader-overlay';
    overlay.innerHTML = `
        <div class="global-loader-content">
            <div class="global-loader-spinner"></div>
            <div class="global-loader-text">${escapeHtml(message)}</div>
            ${subtext ? `<div class="global-loader-subtext">${escapeHtml(subtext)}</div>` : ''}
            <div class="global-loader-timer" id="globalLoaderTimer">0.0s</div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Start elapsed timer
    const startTime = performance.now();
    overlay._timerInterval = setInterval(() => {
        const timerEl = document.getElementById('globalLoaderTimer');
        if (timerEl) {
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            timerEl.textContent = `${elapsed}s`;
        }
    }, 100);
}

function hideGlobalLoader(immediate = false) {
    const overlay = document.getElementById('globalLoader');
    if (overlay) {
        // Clear the timer interval
        if (overlay._timerInterval) {
            clearInterval(overlay._timerInterval);
        }
        if (immediate) {
            overlay.remove();
        } else {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 150);
        }
    }
}

function updateGlobalLoaderText(message, subtext) {
    const textEl = document.querySelector('#globalLoader .global-loader-text');
    const subtextEl = document.querySelector('#globalLoader .global-loader-subtext');
    
    if (textEl) {
        textEl.textContent = message;
    }
    if (subtextEl && subtext !== undefined) {
        subtextEl.textContent = subtext;
    }
}

function updateStitchingProgress(current, total, status) {
    const progressBar = document.getElementById('stitchingProgress');
    const statusEl = document.getElementById('stitchingStatus');
    const detailsEl = document.getElementById('stitchingDetails');
    
    if (progressBar) {
        const percentage = Math.min(100, (current / total) * 100);
        progressBar.style.width = `${percentage}%`;
    }
    
    if (statusEl) {
        statusEl.textContent = status || 'Processing...';
    }
    
    if (detailsEl) {
        detailsEl.textContent = `${current} of ${total} files processed`;
    }
}

function toggleStitchBreaksVisibility() {
    const toggle = document.getElementById('toggleStitchBreaks');
    const content = document.getElementById('logContent');
    const gutter = document.getElementById('logGutter');
    
    if (toggle && content && gutter) {
        if (toggle.checked) {
            content.classList.remove('hide-stitch-breaks');
            gutter.classList.remove('hide-stitch-breaks');
        } else {
            content.classList.add('hide-stitch-breaks');
            gutter.classList.add('hide-stitch-breaks');
        }
    }
}

function jumpToNextStitchBreak() {
    if (state.virtualScroll && state.virtualScroll.active) {
        const vs = state.virtualScroll;
        
        // Find all stitch breaks in currently filtered lines
        const breakIndices = [];
        for (let i = 0; i < vs.filteredLines.length; i++) {
            if (vs.filteredLines[i].isSeparator) {
                breakIndices.push(i);
            }
        }
        
        if (breakIndices.length === 0) {
            showToast('No stitch breaks found', 'info');
            return;
        }

        // Calculate current center index
        const centerIndex = Math.floor((vs.contentEl.scrollTop + (vs.contentEl.clientHeight / 2)) / vs.lineHeight);
        
        // Find the first break that is strictly BELOW our current center plus a tiny buffer
        let targetIndex = -1;
        for (const idx of breakIndices) {
            if (idx > centerIndex + 2) {
                targetIndex = idx;
                break;
            }
        }
        
        if (targetIndex !== -1) {
            // Calculate pixel position to center it
            const scrollPos = targetIndex * vs.lineHeight - (vs.contentEl.clientHeight / 2);
            
            // Instant scroll to avoid browser smooth-scroll bugs over massive pixel distances
            vs.contentEl.scrollTop = Math.max(0, scrollPos);
            
            // Explicitly force a viewport update immediately so the DOM node exists
            updateViewerViewport();
            
            // Try to highlight it after virtual scroll has a moment to render the new chunk
            setTimeout(() => {
                const el = vs.contentEl.querySelector(`.log-line.stitched-separator[data-vindex="${targetIndex}"]`);
                if (el) {
                    el.classList.add('highlight');
                    setTimeout(() => el.classList.remove('highlight'), 2000);
                }
            }, 50); 
            return;
        } else {
            showToast('Already at the last stitch break', 'info');
            return;
        }
    }

    const breaks = Array.from(document.querySelectorAll('.log-line.stitched-separator'));
    if (!breaks.length) {
        showToast('No stitch breaks found in current view', 'info');
        return;
    }
    
    const container = document.getElementById('logContainer');
    if (!container) return;
    
    const containerTop = container.getBoundingClientRect().top;
    
    let target = null;
    for (const br of breaks) {
        const rect = br.getBoundingClientRect();
        if (rect.top > containerTop + 20) {
            target = br;
            break;
        }
    }
    
    if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        target.classList.add('highlight');
        setTimeout(() => target.classList.remove('highlight'), 2000);
    } else {
        showToast('Already at the last stitch break', 'info');
    }
}

function jumpToPrevStitchBreak() {
    if (state.virtualScroll && state.virtualScroll.active) {
        const vs = state.virtualScroll;
        
        // Find all stitch breaks in currently filtered lines
        const breakIndices = [];
        for (let i = 0; i < vs.filteredLines.length; i++) {
            if (vs.filteredLines[i].isSeparator) {
                breakIndices.push(i);
            }
        }
        
        if (breakIndices.length === 0) {
            showToast('No stitch breaks found', 'info');
            return;
        }

        // Calculate current center index
        const centerIndex = Math.floor((vs.contentEl.scrollTop + (vs.contentEl.clientHeight / 2)) / vs.lineHeight);
        
        // Find the first break that is strictly ABOVE our current center minus a tiny buffer
        let targetIndex = -1;
        for (let i = breakIndices.length - 1; i >= 0; i--) {
            if (breakIndices[i] < centerIndex - 2) {
                targetIndex = breakIndices[i];
                break;
            }
        }
        
        if (targetIndex !== -1) {
            const scrollPos = targetIndex * vs.lineHeight - (vs.contentEl.clientHeight / 2);
            
            // Instant scroll
            vs.contentEl.scrollTop = Math.max(0, scrollPos);
            
            // Explicitly force a viewport update
            updateViewerViewport();
            
            // Try to highlight it after rendering
            setTimeout(() => {
                const el = vs.contentEl.querySelector(`.log-line.stitched-separator[data-vindex="${targetIndex}"]`);
                if (el) {
                    el.classList.add('highlight');
                    setTimeout(() => el.classList.remove('highlight'), 2000);
                }
            }, 50);
            return;
        } else {
            showToast('Already at the first stitch break', 'info');
            return;
        }
    }

    const breaks = Array.from(document.querySelectorAll('.log-line.stitched-separator'));
    if (!breaks.length) {
        showToast('No stitch breaks found in current view', 'info');
        return;
    }
    
    const container = document.getElementById('logContainer');
    if (!container) return;
    
    const containerTop = container.getBoundingClientRect().top;
    
    let target = null;
    for (let i = breaks.length - 1; i >= 0; i--) {
        const rect = breaks[i].getBoundingClientRect();
        if (rect.top < containerTop - 20) {
            target = breaks[i];
            break;
        }
    }
    
    if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        target.classList.add('highlight');
        setTimeout(() => target.classList.remove('highlight'), 2000);
    } else {
        showToast('Already at the first stitch break', 'info');
    }
}

function parseTimestampForStitch(timestampStr) {
    // Reuse the existing parseTimestamp function if available, otherwise implement
    if (typeof parseTimestamp === 'function') {
        return parseTimestamp(timestampStr);
    }
    
    // Fallback implementation
    try {
        // Try ISO format first
        let match = timestampStr.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/);
        if (match) {
            const [, year, month, day, hour, min, sec, ms] = match;
            return new Date(year, month - 1, day, hour, min, sec, ms || 0).getTime();
        }
        
        // Try UK format: DD/MM/YYYY HH:MM:SS
        match = timestampStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/);
        if (match) {
            const [, day, month, year, hour, min, sec, ms] = match;
            return new Date(year, month - 1, day, hour, min, sec, ms || 0).getTime();
        }
        
        // Try US format: MM-DD-YYYY HH:MM:SS
        match = timestampStr.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/);
        if (match) {
            const [, month, day, year, hour, min, sec, ms] = match;
            return new Date(year, month - 1, day, hour, min, sec, ms || 0).getTime();
        }
        
        // Try to parse as Date
        const date = new Date(timestampStr);
        if (!isNaN(date.getTime())) {
            return date.getTime();
        }
    } catch (e) {
        // Parsing failed
    }
    
    return null;
}

function displayStitchedLog(fileData) {
    const gutter = document.getElementById('logGutter');
    const content = document.getElementById('logContent');
    const toggleContainer = document.getElementById('stitchBreakToggleContainer');
    
    if (toggleContainer) {
        toggleContainer.style.display = 'flex';
    }
    
    // Update date filter limits based on the stitched log entries
    updateDateFilterLimits(fileData.entries);
    
    let filtered = filterLines(fileData.entries);
    
    // Apply date sorting if enabled
    filtered = sortLogLinesByDate(filtered);
    
    // Performance optimization: For large logs, show a loading indicator
    if (filtered.length > 5000) {
        content.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="spin-animation">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                <p>Rendering large stitched log...</p>
                <span>${filtered.length.toLocaleString()} lines total</span>
            </div>
        `;
        
        // Use setTimeout to allow UI to update before rendering (reduced to 50ms)
        setTimeout(() => {
            renderLogOptimized(fileData, filtered, gutter, content);
            finalizeStitchedLogDisplay(fileData, filtered, content, gutter);
        }, 50);
    } else {
        renderLogOptimized(fileData, filtered, gutter, content);
        finalizeStitchedLogDisplay(fileData, filtered, content, gutter);
    }
}

function finalizeStitchedLogDisplay(fileData, filtered, content, gutter) {
    // Update stats
    const statsEl = document.getElementById('viewerStats');
    if (statsEl) {
        statsEl.textContent = `${fileData.name} | ${filtered.length.toLocaleString()} of ${fileData.lines.length.toLocaleString()} lines | Stitched from ${fileData.sourceFiles.length} files`;
    }
    
    // Apply font size
    content.style.fontSize = `${state.settings.fontSize}px`;
    gutter.style.fontSize = `${state.settings.fontSize}px`;
    
    // Apply word wrap
    content.style.whiteSpace = state.settings.wordWrap ? 'pre-wrap' : 'pre';
    
    // Show legend for source files
    displayStitchLegend(fileData.sourceFiles);
}

function hideStitchLegend() {
    const existing = document.getElementById('stitchLegend');
    if (existing) existing.remove();
}

function displayStitchLegend(sourceFiles) {
    hideStitchLegend();
    
    const legend = document.createElement('div');
    legend.id = 'stitchLegend';
    legend.className = 'stitch-legend';
    legend.innerHTML = `
        <div class="stitch-legend-header" role="button" tabindex="0" title="Show or hide source file list" aria-expanded="true">
            <strong>📎 Source Files</strong>
            <span class="stitch-legend-chevron" aria-hidden="true">▼</span>
        </div>
        <div class="stitch-legend-items">
            ${sourceFiles.map(fileName => {
                const color = getFileColor(fileName);
                return `<span class="legend-item">
                <span class="legend-dot" style="background: ${color};"></span>
                ${escapeHtml(fileName)}
            </span>`;
            }).join('')}
        </div>
    `;
    
    const header = legend.querySelector('.stitch-legend-header');
    const chevron = legend.querySelector('.stitch-legend-chevron');
    const toggleCollapsed = () => {
        const collapsed = legend.classList.toggle('stitch-legend-collapsed');
        header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (chevron) chevron.textContent = collapsed ? '▶' : '▼';
    };
    header.addEventListener('click', toggleCollapsed);
    header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCollapsed();
        }
    });
    
    const toolbar = document.querySelector('.viewer-toolbar');
    if (toolbar) {
        toolbar.appendChild(legend);
    }
}

function getFileColor(fileName) {
    // Generate consistent colors for each file
    const colors = [
        '#FF6B35', // Orange (Traka primary)
        '#4ECDC4', // Teal
        '#45B7D1', // Blue
        '#96CEB4', // Green
        '#FFEAA7', // Yellow
        '#A29BFE', // Purple
        '#FD79A8', // Pink
        '#74B9FF', // Light Blue
        '#55EFC4', // Mint
        '#FAB1A0'  // Coral
    ];
    
    // Try to get the exact index from the currently viewed stitched file for perfect uniqueness
    const currentFile = state.files && state.currentFileIndex >= 0 ? state.files[state.currentFileIndex] : null;
    if (currentFile && currentFile.isStitched && currentFile.sourceFiles) {
        const index = currentFile.sourceFiles.indexOf(fileName);
        if (index >= 0) {
            return colors[index % colors.length];
        }
    }
    
    // Simple string hash fallback
    let hash = 0;
    for (let i = 0; i < fileName.length; i++) {
        hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return colors[Math.abs(hash) % colors.length];
}

function exportStitchedLog() {
    if (!state.stitchedData) {
        showToast('No stitched log to export', 'warning');
        return;
    }
    
    try {
        // Build the text content carefully: ensure separators have clear newlines
        // If stitch breaks are hidden, we should strip the separator lines entirely from the export.
        const includeBreaks = !state.hideStitchBreaks;
        let exportContent = '';
        
        if (includeBreaks) {
            // Generate full content with separators on demand
            const lines = [];
            for (const entry of state.stitchedData.entries) {
                lines.push(entry.raw);
            }
            exportContent = lines.join('\n');
        } else {
            // Reconstruct content without the separator headers
            const lines = [];
            for (const entry of state.stitchedData.entries) {
                if (entry.isSeparator || entry.type === 'separator') continue;
                lines.push(entry.raw);
            }
            exportContent = lines.join('\n');
        }
        
        const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate a smart filename based on the engine type
        let baseName = 'Stitched_Log';
        if (state.stitchedData.entries && state.stitchedData.entries.length > 0) {
            const firstFileIndex = state.stitchedData.entries.find(e => e.type !== 'separator')?.fileIndex;
            if (firstFileIndex !== undefined && state.files[firstFileIndex]) {
                const f = state.files[firstFileIndex];
                if (f.engineType) {
                    baseName = `Stitched_${f.engineType.replace(/\s+/g, '_')}`;
                } else {
                    const cleanName = f.originalName.replace(/\.(txt|log|cfg).*$/i, '');
                    baseName = `Stitched_${cleanName}`;
                }
            }
        }
        
        // Add current timestamp to filename
        const now = new Date();
        const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
        
        a.download = `${baseName}_${dateStr}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Exported ${a.download}`, 'success');
    } catch (e) {
        showToast(`Failed to export: ${e.message}`, 'error');
    }
}

function selectAllStitchFiles() {
    const checkboxes = document.querySelectorAll('#stitchFileList input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
    updateStitchSelection();
    showToast(`Selected all ${checkboxes.length} files`, 'info');
}

function deselectAllStitchFiles() {
    const checkboxes = document.querySelectorAll('#stitchFileList input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    updateStitchSelection();
    showToast('Deselected all files', 'info');
}

// ============================================
// Custom Text Highlighting Feature (BareTail-style)
// ============================================

function getModalHighlightRules() {
    return state.highlightRulesModalScope === 'config' ? state.configHighlightRules : state.highlightRules;
}

function saveRulesForCurrentModalScope() {
    if (state.highlightRulesModalScope === 'config') saveConfigHighlightRules();
    else saveHighlightRules();
}

/**
 * @param {'logs'|'config'} [scope] — 'config' edits rules for the Config page only
 */
function openHighlightRulesModal(scope = 'logs') {
    state.highlightRulesModalScope = scope === 'config' ? 'config' : 'logs';

    const titleEl = document.getElementById('highlightRulesModalTitleText');
    const descEl = document.getElementById('highlightRulesModalDesc');
    if (titleEl) {
        titleEl.textContent = state.highlightRulesModalScope === 'config' ? 'Config highlight rules' : 'Highlight Rules';
    }
    if (descEl) {
        descEl.textContent = state.highlightRulesModalScope === 'config'
            ? 'These rules apply only to the Config file viewer. They are stored separately from Log Viewer and Compare highlight rules. Use them to flag keys, values, or sections in .cfg / .ini files.'
            : 'Create custom highlighting rules to make specific text stand out in log files. Perfect for tracking API calls, errors, or specific patterns during live tail monitoring.';
    }

    const modal = document.getElementById('highlightRulesModal');
    modal.style.display = 'flex';
    // Trigger reflow so the transition from opacity 0 → 1 actually animates
    modal.offsetHeight;
    modal.classList.add('active');
    populateRuleFileSelector();
    updateHighlightRulesList();
    updateHighlightPreview();
    
    // Setup color picker sync
    const textColorPicker = document.getElementById('newRuleTextColor');
    const textColorHex = document.getElementById('newRuleTextColorHex');
    const bgColorPicker = document.getElementById('newRuleBgColor');
    const bgColorHex = document.getElementById('newRuleBgColorHex');
    
    textColorPicker.addEventListener('input', (e) => {
        textColorHex.value = e.target.value;
        updateHighlightPreview();
    });
    
    textColorHex.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
            textColorPicker.value = e.target.value;
            updateHighlightPreview();
        }
    });
    
    bgColorPicker.addEventListener('input', (e) => {
        bgColorHex.value = e.target.value;
        updateHighlightPreview();
    });
    
    bgColorHex.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
            bgColorPicker.value = e.target.value;
            updateHighlightPreview();
        }
    });
}

function closeHighlightRulesModal() {
    const scope = state.highlightRulesModalScope;
    const modal = document.getElementById('highlightRulesModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 250);

    const finishScope = () => {
        state.highlightRulesModalScope = 'logs';
    };

    if (scope === 'config') {
        const configFile = state.currentConfigFileIndex >= 0 ? state.files[state.currentConfigFileIndex] : null;
        const cf = configFile && configFile.isConfig ? configFile : null;
        const big = cf && cf.lines && cf.lines.length > 5000;
        const refreshConfigAfterRules = () => {
            if (state.configViewMode === 'multi') {
                renderConfigMultiView();
            } else if (cf) {
                displayConfigFile(cf);
            } else {
                displayConfigFile(null);
            }
            updateConfigHighlightResults();
        };
        if (big) {
            showGlobalLoader('Applying highlight rules...', 'Updating config view');
            setTimeout(() => {
                refreshConfigAfterRules();
                hideGlobalLoader();
                finishScope();
            }, 50);
        } else {
            refreshConfigAfterRules();
            finishScope();
        }
        return;
    }

    const hasViewer = state.currentFileIndex >= 0;
    const hasCompare = state.files.length > 0;
    const totalLines = state.files.reduce((sum, f) => sum + f.lines.length, 0);
    const needsLoader = (hasViewer || hasCompare) && totalLines > 0;

    if (needsLoader) {
        showGlobalLoader('Applying highlight rules...', 'Updating log views');

        setTimeout(() => {
            if (hasViewer) {
                const currentFile = state.files[state.currentFileIndex];
                if (currentFile.isStitched) {
                    displayStitchedLog(currentFile);
                } else {
                    displayLog(currentFile);
                }
            }

            if (hasCompare) {
                updateCompareView();
                updateCompareHighlightResults();
            }

            updateViewerHighlightCounts();
            hideGlobalLoader();
            finishScope();
        }, 50);
    } else {
        finishScope();
    }
}

/**
 * Populate the file selector in the highlight rules modal.
 * Shows "All Files" plus a chip for each currently loaded file.
 */
function populateRuleFileSelector() {
    const container = document.getElementById('ruleFileSelector');
    if (!container) return;

    const isConfigScope = state.highlightRulesModalScope === 'config';
    const scopeFiles = isConfigScope ? state.files.filter(f => f.isConfig) : state.files;
    const allLabel = isConfigScope ? 'All config files' : 'All Files';
    const emptyHint = isConfigScope
        ? 'No config files loaded — rule will apply when you load a .cfg / .ini file'
        : 'No files loaded — rule will apply to all files when loaded';

    if (scopeFiles.length === 0) {
        container.innerHTML = `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.375rem 0.75rem; background: var(--accent-primary-light); border: 1px solid var(--accent-primary); border-radius: 20px; font-size: 0.8125rem; color: var(--accent-primary); font-weight: 500;">
                <input type="checkbox" id="ruleTargetAll" checked disabled style="accent-color: var(--accent-primary);">
                <span>${escapeHtml(allLabel)}</span>
            </label>
            <span style="font-size: 0.75rem; color: var(--text-tertiary); padding: 0.375rem;">${escapeHtml(emptyHint)}</span>
        `;
        return;
    }

    let html = `
        <label class="rule-file-chip" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.375rem 0.75rem; background: var(--accent-primary-light); border: 1px solid var(--accent-primary); border-radius: 20px; font-size: 0.8125rem; color: var(--accent-primary); font-weight: 500; transition: all 0.15s ease;">
            <input type="checkbox" id="ruleTargetAll" checked onchange="toggleRuleTargetAll(this.checked)" style="accent-color: var(--accent-primary);">
            <span>${escapeHtml(allLabel)}</span>
        </label>
    `;

    scopeFiles.forEach((file) => {
        const shortLabel = getShortLabel(file);
        html += `
            <label class="rule-file-chip" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.375rem 0.75rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 20px; font-size: 0.8125rem; color: var(--text-secondary); transition: all 0.15s ease;" data-file-name="${escapeHtml(file.name)}">
                <input type="checkbox" class="rule-file-checkbox" value="${escapeHtml(file.name)}" checked disabled onchange="updateRuleFileChipStyle(this)" style="accent-color: var(--accent-secondary);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; flex-shrink: 0;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span>${escapeHtml(shortLabel)}</span>
            </label>
        `;
    });

    container.innerHTML = html;
}

/**
 * Toggle "All Files" checkbox — when checked, disable individual file checkboxes.
 */
function toggleRuleTargetAll(allChecked) {
    const checkboxes = document.querySelectorAll('.rule-file-checkbox');
    checkboxes.forEach(cb => {
        cb.disabled = allChecked;
        cb.checked = allChecked;
        updateRuleFileChipStyle(cb);
    });
    
    // Style the "All" chip
    const allLabel = document.getElementById('ruleTargetAll').closest('label');
    if (allChecked) {
        allLabel.style.background = 'var(--accent-primary-light)';
        allLabel.style.borderColor = 'var(--accent-primary)';
        allLabel.style.color = 'var(--accent-primary)';
    } else {
        allLabel.style.background = 'var(--bg-tertiary)';
        allLabel.style.borderColor = 'var(--border-color)';
        allLabel.style.color = 'var(--text-secondary)';
    }
}

/**
 * Update the visual style of a file chip based on its checkbox state.
 */
function updateRuleFileChipStyle(checkbox) {
    const label = checkbox.closest('label');
    if (!label) return;
    if (checkbox.checked) {
        label.style.background = 'rgba(59, 130, 246, 0.1)';
        label.style.borderColor = 'var(--accent-secondary)';
        label.style.color = 'var(--accent-secondary)';
    } else {
        label.style.background = 'var(--bg-tertiary)';
        label.style.borderColor = 'var(--border-color)';
        label.style.color = 'var(--text-tertiary)';
    }
}

/**
 * Read the current file selection from the rule file selector.
 * @returns {'all' | string[]} 'all' or array of selected file names
 */
function getSelectedRuleTargetFiles() {
    const allCheckbox = document.getElementById('ruleTargetAll');
    if (!allCheckbox || allCheckbox.checked) return 'all';
    
    const selected = [];
    document.querySelectorAll('.rule-file-checkbox').forEach(cb => {
        if (cb.checked) selected.push(cb.value);
    });
    
    return selected.length > 0 ? selected : 'all';
}

/**
 * Pre-select files in the file selector (used when editing a rule).
 */
function setRuleTargetFilesSelection(targetFiles) {
    const allCheckbox = document.getElementById('ruleTargetAll');
    if (!allCheckbox) return;
    
    if (targetFiles === 'all' || !targetFiles) {
        allCheckbox.checked = true;
        toggleRuleTargetAll(true);
    } else {
        allCheckbox.checked = false;
        toggleRuleTargetAll(false);
        
        document.querySelectorAll('.rule-file-checkbox').forEach(cb => {
            cb.checked = targetFiles.includes(cb.value);
            updateRuleFileChipStyle(cb);
        });
    }
}

function updateHighlightPreview() {
    const textColor = document.getElementById('newRuleTextColor').value;
    const bgColor = document.getElementById('newRuleBgColor').value;
    const sample = document.getElementById('highlightPreviewSample');
    
    if (sample) {
        sample.style.color = textColor;
        sample.style.backgroundColor = bgColor;
    }
}

function addHighlightRule() {
    const pattern = document.getElementById('newRulePattern').value.trim();
    const textColor = document.getElementById('newRuleTextColor').value;
    const bgColor = document.getElementById('newRuleBgColor').value;
    const caseSensitive = document.getElementById('newRuleCaseSensitive').checked;
    const targetFiles = getSelectedRuleTargetFiles();
    
    if (!pattern) {
        showToast('Please enter a search pattern', 'warning');
        return;
    }
    
    // Create new rule
    const rule = {
        id: `rule-${Date.now()}`,
        pattern: pattern,
        textColor: textColor,
        backgroundColor: bgColor,
        caseSensitive: caseSensitive,
        enabled: true,
        targetFiles: targetFiles
    };
    
    getModalHighlightRules().push(rule);
    
    // Clear inputs and reset file selector to "All"
    document.getElementById('newRulePattern').value = '';
    document.getElementById('newRuleCaseSensitive').checked = false;
    const allCb = document.getElementById('ruleTargetAll');
    if (allCb) {
        allCb.checked = true;
        toggleRuleTargetAll(true);
    }
    
    // Update list
    updateHighlightRulesList();
    
    saveRulesForCurrentModalScope();
    
    showToast('Highlight rule added', 'success');
}

function updateHighlightRulesList() {
    const list = document.getElementById('highlightRulesList');
    const countEl = document.getElementById('rulesCount');
    const rules = getModalHighlightRules();
    
    if (!list) return;
    
    countEl.textContent = rules.length;
    
    if (rules.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary); font-size: 0.875rem;">
                No highlight rules yet. Add one above!
            </div>
        `;
        return;
    }
    
    const allTargetsLabel = state.highlightRulesModalScope === 'config' ? 'All config files' : 'All Files';

    list.innerHTML = rules.map((rule, index) => {
        // Build the "applies to" label
        let appliesTo = '';
        if (!rule.targetFiles || rule.targetFiles === 'all') {
            appliesTo = `<span style="font-size: 0.6875rem; padding: 0.125rem 0.5rem; background: var(--accent-primary-light); color: var(--accent-primary); border-radius: 10px; font-weight: 500;">${escapeHtml(allTargetsLabel)}</span>`;
        } else if (Array.isArray(rule.targetFiles)) {
            appliesTo = rule.targetFiles.map(name => {
                // Try to find the file and get its short label
                const file = state.files.find(f => f.name === name);
                const label = file ? getShortLabel(file) : name;
                return `<span style="font-size: 0.6875rem; padding: 0.125rem 0.5rem; background: rgba(59, 130, 246, 0.1); color: var(--accent-secondary); border-radius: 10px; font-weight: 500;">${escapeHtml(label)}</span>`;
            }).join(' ');
        }
        
        return `
        <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--bg-tertiary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <button class="btn-icon" onclick="moveRuleUp(${index})" title="Move up" ${index === 0 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                </button>
                <button class="btn-icon" onclick="moveRuleDown(${index})" title="Move down" ${index === rules.length - 1 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </div>
            <div style="flex: 1;">
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; margin-bottom: 0.375rem;">
                    <span style="color: ${rule.textColor}; background-color: ${rule.backgroundColor}; padding: 2px 6px; border-radius: 3px;">${escapeHtml(rule.pattern)}</span>
                    ${rule.caseSensitive ? '<span style="margin-left: 0.5rem; font-size: 0.75rem; color: var(--text-tertiary);">(case sensitive)</span>' : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 0.25rem;">
                    ${appliesTo}
                </div>
                <div style="font-size: 0.6875rem; color: var(--text-tertiary);">
                    Text: <span style="font-family: 'JetBrains Mono', monospace;">${rule.textColor}</span> &middot; 
                    Bg: <span style="font-family: 'JetBrains Mono', monospace;">${rule.backgroundColor}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleHighlightRule(${index}, this.checked)" style="margin: 0;">
                </label>
                <button class="btn-icon" onclick="editHighlightRule(${index})" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-icon" onclick="deleteHighlightRule(${index})" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
    }).join('');
}

function toggleHighlightRule(index, enabled) {
    const rules = getModalHighlightRules();
    rules[index].enabled = enabled;
    saveRulesForCurrentModalScope();
    showToast(enabled ? 'Rule enabled' : 'Rule disabled', 'info');
}

function moveRuleUp(index) {
    const rules = getModalHighlightRules();
    if (index === 0) return;
    [rules[index], rules[index - 1]] = [rules[index - 1], rules[index]];
    updateHighlightRulesList();
    saveRulesForCurrentModalScope();
}

function moveRuleDown(index) {
    const rules = getModalHighlightRules();
    if (index === rules.length - 1) return;
    [rules[index], rules[index + 1]] = [rules[index + 1], rules[index]];
    updateHighlightRulesList();
    saveRulesForCurrentModalScope();
}

function editHighlightRule(index) {
    const rules = getModalHighlightRules();
    const rule = rules[index];
    document.getElementById('newRulePattern').value = rule.pattern;
    document.getElementById('newRuleTextColor').value = rule.textColor;
    document.getElementById('newRuleTextColorHex').value = rule.textColor;
    document.getElementById('newRuleBgColor').value = rule.backgroundColor;
    document.getElementById('newRuleBgColorHex').value = rule.backgroundColor;
    document.getElementById('newRuleCaseSensitive').checked = rule.caseSensitive;
    updateHighlightPreview();
    
    // Restore file selection for this rule
    setRuleTargetFilesSelection(rule.targetFiles);
    
    rules.splice(index, 1);
    updateHighlightRulesList();
    saveRulesForCurrentModalScope();
    
    showToast('Edit rule and click "Add Rule" to save changes', 'info');
}

function deleteHighlightRule(index) {
    getModalHighlightRules().splice(index, 1);
    updateHighlightRulesList();
    saveRulesForCurrentModalScope();
    showToast('Rule deleted', 'success');
}

/**
 * Apply a given rule list to a line (escaped HTML). Used for logs and config independently.
 */
function applyHighlightRulesWithRules(lineText, fileName, rules) {
    if (!rules || !rules.length) return escapeHtml(lineText);
    let html = escapeHtml(lineText);

    rules.forEach(rule => {
        if (!rule.enabled) return;

        if (fileName && rule.targetFiles && rule.targetFiles !== 'all') {
            if (!rule.targetFiles.includes(fileName)) return;
        }

        try {
            const flags = rule.caseSensitive ? 'g' : 'gi';
            const regex = new RegExp(escapeRegex(rule.pattern), flags);

            html = html.replace(regex, (match) => {
                return `<span style="color: ${rule.textColor}; background-color: ${rule.backgroundColor}; padding: 2px 4px; border-radius: 2px; font-weight: 500;">${match}</span>`;
            });
        } catch (e) {
            console.warn('Invalid highlight pattern:', rule.pattern, e);
        }
    });

    return html;
}

/**
 * Apply highlight rules to a line of text.
 * @param {string} lineText - The raw log line text
 * @param {string} [fileName] - Optional file name to filter rules by target.
 *   When provided, only rules targeting 'all' or including this file name are applied.
 * @returns {string} HTML with highlighted spans
 */
function applyHighlightRules(lineText, fileName) {
    return applyHighlightRulesWithRules(lineText, fileName, state.highlightRules);
}

function countHighlightMatchesForFile(lines, fileName, collectLines, rules = null) {
    const ruleList = rules ?? state.highlightRules;
    if (!ruleList.length) return [];

    return ruleList.reduce((results, rule) => {
        if (!rule.enabled) return results;

        if (fileName && rule.targetFiles && rule.targetFiles !== 'all') {
            if (!rule.targetFiles.includes(fileName)) return results;
        }

        try {
            const flags = rule.caseSensitive ? '' : 'i';
            const regex = new RegExp(escapeRegex(rule.pattern), flags);
            let count = 0;
            const matchedLines = collectLines ? [] : null;

            for (let i = 0; i < lines.length; i++) {
                const text = typeof lines[i] === 'string' ? lines[i] : lines[i].raw;
                if (regex.test(text)) {
                    count++;
                    if (collectLines) {
                        const lineNum = typeof lines[i] === 'string' ? (i + 1) : (lines[i].lineNumber || (i + 1));
                        matchedLines.push({ lineNumber: lineNum, text: text });
                    }
                }
            }

            results.push({
                pattern: rule.pattern,
                textColor: rule.textColor,
                backgroundColor: rule.backgroundColor,
                count: count,
                matchedLines: matchedLines
            });
        } catch (e) {
            // skip invalid pattern
        }

        return results;
    }, []);
}

function generateMatchPillsHtml(matches) {
    if (!matches || !matches.length) return '';

    return matches
        .filter(m => m.count > 0)
        .map(m =>
            `<span class="hl-match-pill" style="color: ${m.textColor}; background-color: ${m.backgroundColor};" title="${escapeHtml(m.pattern)}: ${m.count.toLocaleString()} line${m.count !== 1 ? 's' : ''} matched">${escapeHtml(m.pattern)} <span class="hl-pill-count">${m.count.toLocaleString()}</span></span>`
        ).join('');
}

// ============================================
// Highlight Results Panel (Notepad++ style)
// ============================================

function truncateMatchText(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '\u2026';
}

function buildRuleGroupHtml(match, navTarget, startCollapsed) {
    if (match.count === 0) return '';

    const escapedPattern = escapeHtml(match.pattern);
    const collapsedClass = startCollapsed ? ' collapsed' : '';
    const chevronRotation = startCollapsed ? '' : ' rotated';

    let linesHtml = '';
    if (match.matchedLines) {
        linesHtml = match.matchedLines.map(ml => {
            const truncated = escapeHtml(truncateMatchText(ml.text, 300));
            return `<div class="hlr-match-line" ondblclick="navigateToHighlightLine(${ml.lineNumber}, ${navTarget})" title="Double-click to go to line ${ml.lineNumber}">
                <span class="hlr-line-num">${ml.lineNumber}</span>
                <span class="hlr-line-text">${truncated}</span>
            </div>`;
        }).join('');
    }

    return `<div class="hlr-rule-group${collapsedClass}">
        <div class="hlr-rule-header" onclick="toggleHlrGroup(this)">
            <svg class="hlr-chevron${chevronRotation}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            <span class="hlr-rule-swatch" style="background-color: ${match.backgroundColor}; border-color: ${match.textColor};"></span>
            <span class="hlr-rule-pattern">${escapedPattern}</span>
            <span class="hlr-rule-count">${match.count.toLocaleString()} match${match.count !== 1 ? 'es' : ''}</span>
        </div>
        <div class="hlr-rule-matches">${linesHtml}</div>
    </div>`;
}

function updateConfigHighlightResults() {
    const panel = document.getElementById('configHighlightResults');
    if (!panel) return;

    if (state.configViewMode === 'multi') {
        panel.style.display = 'none';
        return;
    }

    if (!state.configHighlightRules.length || state.currentConfigFileIndex < 0) {
        panel.style.display = 'none';
        return;
    }

    const file = state.files[state.currentConfigFileIndex];
    if (!file || !file.isConfig) {
        panel.style.display = 'none';
        return;
    }

    const parsed = state.parsedLogs.get(file.name) || file.lines;
    const matches = countHighlightMatchesForFile(parsed, file.name, true, state.configHighlightRules);
    const activeMatches = matches.filter(m => m.count > 0);

    if (!activeMatches.length) {
        panel.style.display = 'none';
        return;
    }

    const totalMatches = activeMatches.reduce((s, m) => s + m.count, 0);
    const rulesText = activeMatches.length === 1 ? '1 rule' : `${activeMatches.length} rules`;

    const groupsHtml = activeMatches.map(m =>
        buildRuleGroupHtml(m, `'config'`, true)
    ).join('');

    panel.style.display = '';
    let expanded = false;
    try {
        expanded = localStorage.getItem('traka-config-hlr-expanded') === 'true';
    } catch (e) {
        expanded = false;
    }
    panel.classList.toggle('panel-collapsed', !expanded);
    const isCollapsed = !expanded;
    panel.innerHTML = `
        <div class="hlr-header" onclick="toggleHlrPanel(this.parentElement)">
            <div class="hlr-title">
                <svg class="hlr-panel-chevron${isCollapsed ? '' : ' rotated'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <svg class="hlr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <span>Highlight Results</span>
                <span class="hlr-summary">${rulesText} &middot; ${totalMatches.toLocaleString()} matches</span>
            </div>
        </div>
        <div class="hlr-body">${groupsHtml}</div>
    `;
}

function updateViewerHighlightResults() {
    const panel = document.getElementById('viewerHighlightResults');
    if (!panel) return;

    if (!state.highlightRules.length || state.currentFileIndex < 0) {
        panel.style.display = 'none';
        return;
    }

    const file = state.files[state.currentFileIndex];
    if (!file) { panel.style.display = 'none'; return; }

    const parsed = state.parsedLogs.get(file.name) || file.lines;
    const matches = countHighlightMatchesForFile(parsed, file.name, true);
    const activeMatches = matches.filter(m => m.count > 0);

    if (!activeMatches.length) {
        panel.style.display = 'none';
        return;
    }

    const totalMatches = activeMatches.reduce((s, m) => s + m.count, 0);
    const rulesText = activeMatches.length === 1 ? '1 rule' : `${activeMatches.length} rules`;

    const groupsHtml = activeMatches.map(m =>
        buildRuleGroupHtml(m, `'viewer'`, true)
    ).join('');

    panel.style.display = '';
    let expanded = false;
    try {
        expanded = localStorage.getItem('traka-viewer-hlr-expanded') === 'true';
    } catch (e) {
        expanded = false;
    }
    panel.classList.toggle('panel-collapsed', !expanded);
    const isCollapsed = !expanded;
    panel.innerHTML = `
        <div class="hlr-header" onclick="toggleHlrPanel(this.parentElement)">
            <div class="hlr-title">
                <svg class="hlr-panel-chevron${isCollapsed ? '' : ' rotated'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <svg class="hlr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <span>Highlight Results</span>
                <span class="hlr-summary">${rulesText} &middot; ${totalMatches.toLocaleString()} matches</span>
            </div>
        </div>
        <div class="hlr-body">${groupsHtml}</div>
    `;
}

function updateCompareHighlightResults() {
    const panel = document.getElementById('compareHighlightResults');
    if (!panel) return;

    if (!state.highlightRules.length || !state.files.length) {
        panel.style.display = 'none';
        return;
    }

    const fileResults = [];
    let grandTotal = 0;

    state.files.forEach((file, fileIndex) => {
        if (file.isConfig) return;
        const matches = countHighlightMatchesForFile(file.lines, file.name, true);
        const activeMatches = matches.filter(m => m.count > 0);
        const fileTotal = activeMatches.reduce((s, m) => s + m.count, 0);

        if (activeMatches.length > 0) {
            fileResults.push({
                fileName: file.name,
                fileIndex: fileIndex,
                matches: activeMatches,
                total: fileTotal
            });
            grandTotal += fileTotal;
        }
    });

    if (!fileResults.length) {
        panel.style.display = 'none';
        return;
    }

    const filesText = fileResults.length === 1 ? '1 file' : `${fileResults.length} files`;
    const rulesCount = new Set(fileResults.flatMap(fr => fr.matches.map(m => m.pattern))).size;
    const rulesText = rulesCount === 1 ? '1 rule' : `${rulesCount} rules`;

    let bodyHtml = '';
    fileResults.forEach(fr => {
        const shortName = escapeHtml(fr.fileName.length > 50 ? '\u2026' + fr.fileName.slice(-47) : fr.fileName);
        const groupsHtml = fr.matches.map(m =>
            buildRuleGroupHtml(m, fr.fileIndex, true)
        ).join('');

        bodyHtml += `<div class="hlr-file-group">
            <div class="hlr-file-header" onclick="toggleHlrGroup(this)">
                <svg class="hlr-chevron rotated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <svg class="hlr-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span class="hlr-file-name">${shortName}</span>
                <span class="hlr-file-count">${fr.total.toLocaleString()} match${fr.total !== 1 ? 'es' : ''}</span>
            </div>
            <div class="hlr-file-matches">${groupsHtml}</div>
        </div>`;
    });

    panel.style.display = '';
    const isCollapsed = panel.classList.contains('panel-collapsed');
    panel.innerHTML = `
        <div class="hlr-header" onclick="toggleHlrPanel(this.parentElement)">
            <div class="hlr-title">
                <svg class="hlr-panel-chevron${isCollapsed ? '' : ' rotated'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <svg class="hlr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <span>Highlight Results</span>
                <span class="hlr-summary">${filesText} &middot; ${rulesText} &middot; ${grandTotal.toLocaleString()} matches</span>
            </div>
        </div>
        <div class="hlr-body">${bodyHtml}</div>
    `;
}

function toggleHlrPanel(panelEl) {
    panelEl.classList.toggle('panel-collapsed');
    const chevron = panelEl.querySelector('.hlr-panel-chevron');
    if (chevron) chevron.classList.toggle('rotated', !panelEl.classList.contains('panel-collapsed'));
    if (panelEl.id === 'viewerHighlightResults') {
        try {
            localStorage.setItem('traka-viewer-hlr-expanded', (!panelEl.classList.contains('panel-collapsed')).toString());
        } catch (e) {
            /* ignore */
        }
    }
    if (panelEl.id === 'configHighlightResults') {
        try {
            localStorage.setItem('traka-config-hlr-expanded', (!panelEl.classList.contains('panel-collapsed')).toString());
        } catch (e) {
            /* ignore */
        }
    }
}

function toggleHlrGroup(headerEl) {
    const group = headerEl.parentElement;
    group.classList.toggle('collapsed');
    const chevron = headerEl.querySelector('.hlr-chevron');
    if (chevron) chevron.classList.toggle('rotated');
    event.stopPropagation();
}

function navigateToHighlightLine(lineNumber, target) {
    if (target === 'viewer') {
        // Navigate in the main log viewer
        if (state.virtualScroll && state.virtualScroll.active) {
            const vs = state.virtualScroll;
            const logContentEl = document.getElementById('logContent');
            if (vs.contentEl !== logContentEl) {
                const lineEl = document.querySelector(`#logContent .log-line[data-line="${lineNumber}"]`);
                if (lineEl) {
                    lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    lineEl.classList.add('highlight');
                    setTimeout(() => lineEl.classList.remove('highlight'), 2000);
                }
                return;
            }
            const idx = vs.filteredLines.findIndex(e => e.lineNumber === lineNumber);
            if (idx >= 0) {
                const scrollPos = idx * vs.lineHeight - vs.contentEl.clientHeight / 2;
                vs.contentEl.scrollTop = Math.max(0, scrollPos);
                vs.lastRenderedStart = -1;
                updateViewerViewport();
                requestAnimationFrame(() => {
                    const lineEl = vs.viewport.querySelector(`[data-line="${lineNumber}"]`);
                    if (lineEl) {
                        lineEl.classList.add('highlight');
                        setTimeout(() => lineEl.classList.remove('highlight'), 2000);
                    }
                });
            } else {
                showToast(`Line ${lineNumber} not found in current view`, 'warning');
            }
        } else {
            const lineEl = document.querySelector(`#logContent .log-line[data-line="${lineNumber}"]`);
            if (lineEl) {
                lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                lineEl.classList.add('highlight');
                setTimeout(() => lineEl.classList.remove('highlight'), 2000);
            }
        }
    } else if (target === 'config') {
        const cfgContent = document.getElementById('configLogContent');
        if (state.virtualScroll && state.virtualScroll.active && state.virtualScroll.contentEl === cfgContent) {
            const vs = state.virtualScroll;
            const idx = vs.filteredLines.findIndex(e => e.lineNumber === lineNumber);
            if (idx >= 0) {
                const scrollPos = idx * vs.lineHeight - vs.contentEl.clientHeight / 2;
                vs.contentEl.scrollTop = Math.max(0, scrollPos);
                vs.lastRenderedStart = -1;
                updateViewerViewport();
                requestAnimationFrame(() => {
                    const lineEl = vs.viewport.querySelector(`[data-line="${lineNumber}"]`);
                    if (lineEl) {
                        lineEl.classList.add('highlight');
                        setTimeout(() => lineEl.classList.remove('highlight'), 2000);
                    }
                });
            } else {
                showToast(`Line ${lineNumber} not found in current view`, 'warning');
            }
        } else {
            const lineEl = document.querySelector(`#configLogContent .log-line[data-line="${lineNumber}"]`);
            if (lineEl) {
                lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                lineEl.classList.add('highlight');
                setTimeout(() => lineEl.classList.remove('highlight'), 2000);
            }
        }
    } else if (typeof target === 'number') {
        // Navigate in a compare panel by file index
        const cvs = state.compareVirtualScroll;
        if (!cvs || !cvs[target]) return;
        const vs = cvs[target];
        const scrollPos = (lineNumber - 1) * vs.lineHeight - vs.panelContent.clientHeight / 2;
        vs.panelContent.scrollTop = Math.max(0, scrollPos);
        vs.lastRenderedStart = -1;
        updateComparePanelViewport(target, true);
        requestAnimationFrame(() => {
            const lineEl = vs.viewport.querySelector(`[data-line="${lineNumber}"]`);
            if (lineEl) {
                lineEl.classList.add('highlight');
                setTimeout(() => lineEl.classList.remove('highlight'), 2000);
            }
        });
    }
}

function updateViewerHighlightCounts() {
    updateViewerHighlightResults();
}

function generateComparePanelMatchPills(file) {
    return '';
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function saveHighlightRules() {
    try {
        localStorage.setItem('traka-highlight-rules', JSON.stringify(state.highlightRules));
    } catch (e) {
        console.error('Failed to save highlight rules:', e);
    }
}

function loadHighlightRules() {
    try {
        const saved = localStorage.getItem('traka-highlight-rules');
        if (saved) {
            state.highlightRules = JSON.parse(saved);
            // Ensure all rules have a targetFiles property (backward compat)
            state.highlightRules.forEach(rule => {
                if (!rule.targetFiles) rule.targetFiles = 'all';
            });
        }
    } catch (e) {
        console.error('Failed to load highlight rules:', e);
    }
}

function saveConfigHighlightRules() {
    try {
        localStorage.setItem('traka-config-highlight-rules', JSON.stringify(state.configHighlightRules));
    } catch (e) {
        console.error('Failed to save config highlight rules:', e);
    }
}

function loadConfigHighlightRules() {
    try {
        const saved = localStorage.getItem('traka-config-highlight-rules');
        if (saved) {
            state.configHighlightRules = JSON.parse(saved);
            state.configHighlightRules.forEach(rule => {
                if (!rule.targetFiles) rule.targetFiles = 'all';
            });
        }
    } catch (e) {
        console.error('Failed to load config highlight rules:', e);
    }
}


// ============================================
// Date Sorting Feature
// ============================================
function changeDateSort() {
    const sortOrder = document.getElementById('dateSortOrder').value;
    state.dateSortOrder = sortOrder;
    
    // Re-display the current log with new sort order
    if (state.currentFileIndex >= 0) {
        const currentFile = state.files[state.currentFileIndex];
        if (currentFile.isStitched) {
            displayStitchedLog(currentFile);
        } else {
            displayLog(currentFile);
        }
    }
    
    // Show feedback
    const sortLabels = {
        'none': 'Original order',
        'asc': 'Oldest first (ascending)',
        'desc': 'Newest first (descending)'
    };
    showToast(`Sorted by date: ${sortLabels[sortOrder]}`, 'info');
}

function sortLogLinesByDate(lines) {
    // If no sorting requested, return as-is
    if (state.dateSortOrder === 'none') {
        return lines;
    }
    
    // Pre-calculate timestamps to avoid million of Date object creations during sort
    // IMPORTANT: To prevent stack traces (lines without timestamps) from being ripped away 
    // from their parent log lines, they must inherit the timestamp of the line above them!
    
    // To handle multiple files properly, we shouldn't leak the lastKnownTime across stitch boundaries.
    // However, a stitch break itself needs a time so it sorts correctly.
    let lastKnownTime = 0;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].cachedTime === undefined || lines[i].cachedTime === null) {
            let time = 0;
            if (lines[i].timestamp) {
                time = new Date(lines[i].timestamp).getTime();
                if (!isNaN(time) && time > 0) {
                    lastKnownTime = time;
                } else {
                    time = lastKnownTime; // Fallback to previous if parsing fails
                }
            } else {
                // If it's a separator, we want it to sit EXACTLY where it was placed natively
                // in the array by inheriting the last timestamp seen.
                // However, for the very first file, lastKnownTime might be 0. We don't want it to
                // permanently get stuck at 0.
                time = lastKnownTime;
            }
            lines[i].cachedTime = time;
        } else {
            // Update lastKnownTime from cachedTime if it's valid
            if (lines[i].cachedTime > 0) {
                lastKnownTime = lines[i].cachedTime;
            }
        }
        
        // Add original index to preserve stable sorting for lines with the exact same timestamp
        lines[i]._stableIndex = i;
    }
    
    // Now that all lines have inherited times, do a quick BACKWARD pass to fix the top of the file!
    // If the first file started with stack traces or a stitch break (so they got cachedTime = 0),
    // they need to inherit the first VALID time found further down the file, otherwise they 
    // sink to the very bottom of the logs!
    let firstValidTime = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].cachedTime > 0) {
            firstValidTime = lines[i].cachedTime;
            break;
        }
    }
    
    // Set ANY line that has a 0 cachedTime to the first valid time so it doesn't sink 
    // to the very bottom (or top) inappropriately when sorting!
    if (firstValidTime > 0) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].cachedTime === 0 || !lines[i].cachedTime) {
                lines[i].cachedTime = firstValidTime;
            }
        }
    }
    
    // Create a copy to avoid mutating original
    const sorted = [...lines];
    
    // Sort by cached timestamp
    sorted.sort((a, b) => {
        // ALWAYS keep stitch breaks exactly where they belong relative to their neighboring files
        // We do this by ensuring we fallback to stable index if times are completely equal.
        const timeA = a.cachedTime || 0;
        const timeB = b.cachedTime || 0;
        
        if (!timeA && !timeB) return a._stableIndex - b._stableIndex;
        if (!timeA) return state.dateSortOrder === 'asc' ? 1 : 1;
        if (!timeB) return state.dateSortOrder === 'asc' ? -1 : -1;
        
        if (timeA !== timeB) {
            // Sort based on order
            if (state.dateSortOrder === 'asc') {
                return timeA - timeB; // Oldest first
            } else {
                return timeB - timeA; // Newest first
            }
        } else {
            // If timestamps are exactly the same (e.g. stack trace lines belonging to the same entry,
            // or stitch breaks), ALWAYS preserve their original relative vertical order to keep the timeline logical!
            return a._stableIndex - b._stableIndex;
        }
    });
    
    return sorted;
}

// ============================================
// Fullscreen Log Viewer Mode
// ============================================
function syncViewerFullscreenButtons(isFullscreen) {
    const expandIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
    const shrinkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
    ['viewerFullscreenToggleTop', 'viewerFullscreenToggleBottom'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.toggle('active', isFullscreen);
        btn.title = isFullscreen ? 'Exit fullscreen mode (ESC)' : 'Toggle fullscreen mode';
        btn.innerHTML = isFullscreen ? shrinkIcon : expandIcon;
    });
}

function toggleLogViewerFullscreen() {
    const viewerPage = document.getElementById('page-viewer');
    if (!viewerPage) return;
    
    if (viewerPage.classList.contains('fullscreen-mode')) {
        viewerPage.classList.remove('fullscreen-mode');
        document.body.classList.remove('fullscreen-active');
        syncViewerFullscreenButtons(false);
        showToast('Exited fullscreen mode', 'info');
        requestAnimationFrame(() => {
            if (state.currentFileIndex >= 0 && state.files[state.currentFileIndex] && !state.files[state.currentFileIndex].isConfig) {
                displayLog(state.files[state.currentFileIndex]);
            }
        });
    } else {
        viewerPage.classList.add('fullscreen-mode');
        document.body.classList.add('fullscreen-active');
        syncViewerFullscreenButtons(true);
        showToast('Fullscreen mode enabled (press ESC to exit)', 'success');
        setTimeout(() => adjustFullscreenLogHeight(), 50);
    }
}

// Helper: ensure main viewer log + gutter fill the flex region in fullscreen
function adjustFullscreenLogHeight() {
    const viewerPage = document.getElementById('page-viewer');
    const logContainer = viewerPage?.querySelector('.log-container:not(.config-viewer-log)');
    if (!viewerPage || !logContainer || !viewerPage.classList.contains('fullscreen-mode')) {
        return;
    }
    const logContent = logContainer.querySelector('.log-content');
    const logGutter = logContainer.querySelector('.log-gutter');
    if (logContent) logContent.style.height = '100%';
    if (logGutter) logGutter.style.height = '100%';
}

// Add keyboard shortcut for fullscreen (ESC to exit)
document.addEventListener('keydown', (e) => {
    // Prevent interfering with input fields, textareas, etc.
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
    }

    if (e.key === 'Escape') {
        // First check if a single panel is maximized - restore that first
        const maximizedPanel = document.querySelector('.compare-panel.panel-maximized');
        if (maximizedPanel) {
            if (maximizedPanel.closest('#configMultiContainer')) {
                restoreConfigMultiMaximized();
            } else {
                restoreAllPanels();
            }
            return;
        }
        
        const viewerPage = document.getElementById('page-viewer');
        const comparePage = document.getElementById('page-compare');
        
        if (viewerPage && viewerPage.classList.contains('fullscreen-mode')) {
            toggleLogViewerFullscreen();
        } else if (comparePage && comparePage.classList.contains('fullscreen-mode')) {
            toggleCompareFullscreen();
        }
    }
});

// ============================================
// Scroll Synchronization for Line Numbers
// ============================================
function initScrollSync() {
    const logContent = document.getElementById('logContent');
    const logGutter = document.getElementById('logGutter');
    
    if (!logContent || !logGutter) return;
    
    let isSyncingGutter = false;
    let isSyncingContent = false;
    
    // Sync gutter when content scrolls
    logContent.addEventListener('scroll', () => {
        if (isSyncingContent) {
            isSyncingContent = false;
            return;
        }
        isSyncingGutter = true;
        logGutter.scrollTop = logContent.scrollTop;
    });
    
    // Sync content when gutter scrolls (for users who scroll on the line numbers)
    logGutter.addEventListener('scroll', () => {
        if (isSyncingGutter) {
            isSyncingGutter = false;
            return;
        }
        isSyncingContent = true;
        logContent.scrollTop = logGutter.scrollTop;
    });
}

function initConfigLogScrollSync() {
    const logContent = document.getElementById('configLogContent');
    const logGutter = document.getElementById('configLogGutter');
    if (!logContent || !logGutter) return;
    let isSyncingGutter = false;
    let isSyncingContent = false;
    logContent.addEventListener('scroll', () => {
        if (isSyncingContent) {
            isSyncingContent = false;
            return;
        }
        isSyncingGutter = true;
        logGutter.scrollTop = logContent.scrollTop;
    });
    logGutter.addEventListener('scroll', () => {
        if (isSyncingGutter) {
            isSyncingGutter = false;
            return;
        }
        isSyncingContent = true;
        logContent.scrollTop = logGutter.scrollTop;
    });
}

// ============================================
// Compare Page Fullscreen Mode
// ============================================
function toggleCompareFullscreen() {
    const comparePage = document.getElementById('page-compare');
    const fullscreenBtn = document.getElementById('compareFullscreenToggle');
    const navSidebar = document.querySelector('.nav-sidebar');
    
    if (!comparePage) return;
    
    const isEntering = !comparePage.classList.contains('fullscreen-mode');
    
    // Show loader for the brief layout transition
    showGlobalLoader(
        isEntering ? 'Entering fullscreen...' : 'Exiting fullscreen...',
        'Adjusting layout'
    );
    
    // Defer the actual toggle so the loader can paint
    setTimeout(() => {
        if (!isEntering) {
            // Exit fullscreen
            comparePage.classList.remove('fullscreen-mode');
            document.body.classList.remove('fullscreen-active');
            if (navSidebar) navSidebar.style.display = '';
            fullscreenBtn.classList.remove('active');
            fullscreenBtn.title = 'Toggle fullscreen mode';
            
            // Update the SVG to "expand" icon
            fullscreenBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
                Fullscreen
            `;
            
            showToast('Exited fullscreen mode', 'info');
        } else {
            // Enter fullscreen
            comparePage.classList.add('fullscreen-mode');
            document.body.classList.add('fullscreen-active');
            if (navSidebar) navSidebar.style.display = 'none';
            fullscreenBtn.classList.add('active');
            fullscreenBtn.title = 'Exit fullscreen mode (ESC)';
            
            // Update the SVG to "minimize" icon
            fullscreenBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
                Exit Fullscreen
            `;
            
            showToast('Fullscreen mode enabled (press ESC to exit)', 'success');
        }
        
        hideGlobalLoader();
        requestAnimationFrame(() => refreshCompareVirtualScrollLayout());
    }, 50);
}

// ============================================
// Per-Panel Maximize (Focus View)
// ============================================

/**
 * Toggle a single compare panel to fill the entire compare area.
 * Other panels are hidden. Click again or press ESC to restore.
 */
function toggleMaximizePanel(panelIndex) {
    const container = document.getElementById('compareContainer');
    const panels = container.querySelectorAll('.compare-panel');
    const targetPanel = container.querySelector(`.compare-panel[data-index="${panelIndex}"]`);
    
    if (!targetPanel) return;
    
    const isMaximized = targetPanel.classList.contains('panel-maximized');
    
    if (isMaximized) {
        // Restore all panels
        restoreAllPanels();
    } else {
        // Maximize this panel, hide others
        container.classList.add('has-maximized-panel');
        
        panels.forEach(panel => {
            const idx = parseInt(panel.getAttribute('data-index'));
            if (idx === panelIndex) {
                panel.classList.add('panel-maximized');
                // Change button to minimize icon
                const btn = panel.querySelector('.panel-maximize-btn');
                if (btn) {
                    btn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                        </svg>
                    `;
                    btn.title = 'Restore panel (ESC)';
                }
            } else {
                panel.classList.add('panel-hidden');
            }
        });
        
        // Scroll to bottom if live tailing
        if (state.liveTailActive && state.autoScrollEnabled) {
            const panelContent = targetPanel.querySelector('.compare-panel-content');
            if (panelContent) {
                requestAnimationFrame(() => {
                    panelContent.scrollTop = panelContent.scrollHeight;
                });
            }
        }
        requestAnimationFrame(() => refreshCompareVirtualScrollLayout());
    }
}

/**
 * Restore all panels from maximized state
 */
function restoreAllPanels() {
    const container = document.getElementById('compareContainer');
    if (!container) return;
    
    container.classList.remove('has-maximized-panel');
    
    const panels = container.querySelectorAll('.compare-panel');
    panels.forEach(panel => {
        panel.classList.remove('panel-maximized', 'panel-hidden');
        // Restore maximize button icon
        const btn = panel.querySelector('.panel-maximize-btn');
        if (btn) {
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
            `;
            btn.title = 'Maximize this panel';
        }
    });
    requestAnimationFrame(() => refreshCompareVirtualScrollLayout());
}

// ============================================
// Per-Panel Popout (New Window)
// ============================================

/**
 * Pops out a compare panel into its own detached window.
 */
async function popOutPanel(panelIndex) {
    if (!isElectron) {
        showToast('Pop-out feature is only available in Desktop Edition', 'warning');
        return;
    }
    
    // Don't allow popping out all panels
    const visibleCount = state.files.length - state.minimizedPanels.size - state.poppedOutPanels.size;
    if (visibleCount <= 1) {
        showToast('Cannot pop out the last visible panel', 'warning');
        return;
    }
    
    const file = state.files[panelIndex];
    if (!file) return;
    
    // Create a lightweight copy of the file to prevent IPC freezing on huge strings
    const lightweightFile = {
        name: file.name,
        originalName: file.originalName,
        path: file.path || (file.fileHandle && file.fileHandle.path) || undefined,
        size: file.size,
        engineType: file.engineType,
        isConfig: file.isConfig,
        lastModified: file.lastModified
    };
    
    // Fallback: If absolutely no path can be found (e.g. strict web mode),
    // we must pass the raw content string (NOT the array of lines to avoid JSON array serialization limits)
    if (!lightweightFile.path && file.content) {
        lightweightFile.content = file.content;
    }
    
    // Gather necessary state data to pass to the popout window
    const stateData = {
        highlightRules: state.highlightRules,
        timeSyncActive: state.timeSyncActive,
        timeSyncLastTarget: state.timeSyncLastTarget,
        timeSyncRange: state.timeSyncRange,
        liveTailActive: state.liveTailActive,
        currentScrollPos: state.compareVirtualScroll && state.compareVirtualScroll[panelIndex] 
            ? state.compareVirtualScroll[panelIndex].panelContent.scrollTop 
            : 0
    };
    
    // Mark as popped out in state
    state.poppedOutPanels.add(panelIndex);
    
    // Hide panel in UI immediately
    const container = document.getElementById('compareContainer');
    const panel = container.querySelector(`.compare-panel[data-index="${panelIndex}"]`);
    if (panel) {
        panel.style.display = 'none';
        panel.classList.add('panel-popped-out');
    }
    
    // Invoke main process to open window
    try {
        await window.electronAPI.openPopout(panelIndex, lightweightFile, stateData);
        showToast(`Popped out "${getShortLabel(file)}"`, 'info');
    } catch (err) {
        showToast('Error popping out panel: ' + err.message, 'error');
        // Revert
        state.poppedOutPanels.delete(panelIndex);
        if (panel) {
            panel.style.display = 'flex';
            panel.classList.remove('panel-popped-out');
        }
    }
}

/**
 * Restore a popped out panel back to the main window grid.
 */
function restorePoppedOutPanel(panelIndex) {
    if (!state.poppedOutPanels.has(panelIndex)) return;
    
    state.poppedOutPanels.delete(panelIndex);
    
    const container = document.getElementById('compareContainer');
    const panel = container.querySelector(`.compare-panel[data-index="${panelIndex}"]`);
    if (panel) {
        panel.style.display = 'flex';
        panel.classList.remove('panel-popped-out');
        panel.classList.add('panel-restoring');
        setTimeout(() => panel.classList.remove('panel-restoring'), 300);
    }
    
    const shortLabel = getShortLabel(state.files[panelIndex]);
    showToast(`Restored "${shortLabel}" to main window`, 'success');
    requestAnimationFrame(() => refreshCompareVirtualScrollLayout());
}

// ============================================
// Per-Panel Minimize (Collapse to Dock)
// ============================================

/**
 * Toggle minimize state for a single compare panel.
 * Minimized panels collapse out of view and appear as clickable chips
 * in a dock at the bottom of the compare container. Remaining panels
 * automatically share the freed space equally.
 */
function toggleMinimizePanel(panelIndex) {
    if (state.minimizedPanels.has(panelIndex)) {
        restoreMinimizedPanel(panelIndex);
        return;
    }
    
    // Don't allow minimizing all panels
    const visibleCount = state.files.length - state.minimizedPanels.size;
    if (visibleCount <= 1) {
        showToast('Cannot minimize the last visible panel', 'warning');
        return;
    }
    
    state.minimizedPanels.add(panelIndex);
    
    // Apply minimized class immediately without full re-render for smooth UX
    const container = document.getElementById('compareContainer');
    const panel = container.querySelector(`.compare-panel[data-index="${panelIndex}"]`);
    
    if (panel) {
        panel.classList.add('panel-minimized');
    }
    
    // Rebuild dock and update layout
    updateMinimizedDock();
    requestAnimationFrame(() => refreshCompareVirtualScrollLayout());
    
    const shortLabel = getShortLabel(state.files[panelIndex]);
    showToast(`Minimized "${shortLabel}" — click to restore`, 'info');
}

/**
 * Restore a minimized panel back to its normal position.
 */
function restoreMinimizedPanel(panelIndex) {
    if (!state.minimizedPanels.has(panelIndex)) return;
    
    state.minimizedPanels.delete(panelIndex);
    
    const container = document.getElementById('compareContainer');
    const panel = container.querySelector(`.compare-panel[data-index="${panelIndex}"]`);
    
    if (panel) {
        panel.classList.remove('panel-minimized');
        panel.classList.add('panel-restoring');
        // Remove the animation class after it plays
        setTimeout(() => panel.classList.remove('panel-restoring'), 300);
    }
    
    // Rebuild dock (may remove dock entirely if no more minimized panels)
    updateMinimizedDock();
    requestAnimationFrame(() => refreshCompareVirtualScrollLayout());
    
    const shortLabel = getShortLabel(state.files[panelIndex]);
    showToast(`Restored "${shortLabel}"`, 'success');
}

/**
 * Update the minimized panels dock.
 * The dock floats at the bottom of the compare page (outside the
 * overflow-hidden compare-container) so it's always visible and clickable.
 */
function updateMinimizedDock() {
    const comparePage = document.getElementById('page-compare');
    if (!comparePage) return;
    
    // Remove existing dock wherever it might be
    const existingDock = document.querySelector('.minimized-panels-dock');
    if (existingDock) existingDock.remove();
    
    if (state.minimizedPanels.size === 0) return;
    
    const dock = document.createElement('div');
    dock.className = 'minimized-panels-dock';
    dock.id = 'minimizedPanelsDock';
    
    // Label
    const label = document.createElement('span');
    label.className = 'minimized-dock-label';
    label.textContent = 'Minimized:';
    dock.appendChild(label);
    
    state.minimizedPanels.forEach(idx => {
        if (idx < state.files.length) {
            const file = state.files[idx];
            const shortLabel = getShortLabel(file);
            const chip = document.createElement('button');
            chip.className = 'minimized-panel-chip';
            chip.title = `Click to restore "${shortLabel}"`;
            chip.onclick = () => restoreMinimizedPanel(idx);
            chip.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span>${escapeHtml(shortLabel)}</span>
                <span class="minimized-chip-lines">${file.lines.length.toLocaleString()} lines</span>
            `;
            dock.appendChild(chip);
        }
    });
    
    // Add a "Restore All" button when more than one is minimized
    if (state.minimizedPanels.size > 1) {
        const restoreAllBtn = document.createElement('button');
        restoreAllBtn.className = 'minimized-panel-chip minimized-restore-all';
        restoreAllBtn.title = 'Restore all minimized panels';
        restoreAllBtn.onclick = () => {
            state.minimizedPanels.clear();
            updateCompareView();
            showToast('All panels restored', 'success');
        };
        restoreAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            <span>Restore All</span>
        `;
        dock.appendChild(restoreAllBtn);
    }
    
    comparePage.appendChild(dock);
}

// ============================================
// FAQs / Knowledge Base Page
// ============================================

let faqCategoryFilter = 'all';
let faqSearchTerm = '';

/**
 * Render the FAQs knowledge base from the solution database.
 * Shows all known error patterns and solutions regardless of
 * whether they appear in the currently loaded log files.
 */
function renderFAQs() {
    const list = document.getElementById('faqsList');
    const stats = document.getElementById('faqsStats');
    if (!list || typeof solutionDatabase === 'undefined') return;
    
    const patterns = solutionDatabase.patterns || [];
    
    // Apply filters
    let filtered = patterns;
    
    if (faqCategoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === faqCategoryFilter);
    }
    
    if (faqSearchTerm) {
        const term = faqSearchTerm.toLowerCase();
        filtered = filtered.filter(p =>
            p.title.toLowerCase().includes(term) ||
            p.id.toLowerCase().includes(term) ||
            p.category.toLowerCase().includes(term) ||
            p.severity.toLowerCase().includes(term) ||
            p.why.toLowerCase().includes(term) ||
            p.steps.some(s => s.title.toLowerCase().includes(term) || s.description.toLowerCase().includes(term))
        );
    }
    
    // Category counts for stats
    const categoryCounts = {};
    patterns.forEach(p => {
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    });
    
    // Severity counts
    const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
    patterns.forEach(p => {
        if (severityCounts[p.severity] !== undefined) severityCounts[p.severity]++;
    });
    
    // Render stats bar
    stats.innerHTML = `
        <div class="faqs-stats-row">
            <div class="faqs-stat-chip">
                <span class="faqs-stat-number">${patterns.length}</span>
                <span class="faqs-stat-label">Known Issues</span>
            </div>
            <div class="faqs-stat-chip severity-critical">
                <span class="faqs-stat-number">${severityCounts.CRITICAL}</span>
                <span class="faqs-stat-label">Critical</span>
            </div>
            <div class="faqs-stat-chip severity-high">
                <span class="faqs-stat-number">${severityCounts.HIGH}</span>
                <span class="faqs-stat-label">High</span>
            </div>
            <div class="faqs-stat-chip severity-medium">
                <span class="faqs-stat-number">${severityCounts.MEDIUM}</span>
                <span class="faqs-stat-label">Medium</span>
            </div>
            <div class="faqs-stat-chip">
                <span class="faqs-stat-number">${Object.keys(categoryCounts).length}</span>
                <span class="faqs-stat-label">Categories</span>
            </div>
            ${filtered.length !== patterns.length ? `
                <div class="faqs-stat-chip faqs-stat-filtered">
                    <span class="faqs-stat-number">${filtered.length}</span>
                    <span class="faqs-stat-label">Showing</span>
                </div>
            ` : ''}
        </div>
    `;
    
    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="faqs-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <p>No matching issues found</p>
                <span>Try a different search term or category filter</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = filtered.map((solution, idx) => {
        const severityClass = solution.severity.toLowerCase();
        const isDetected = state.issues.some(issue => {
            if (issue.solution && issue.solution.id === solution.id) return true;
            return solution.pattern.test(issue.content || '');
        });
        const detectedBadge = isDetected 
            ? '<span class="faq-detected-badge">DETECTED IN LOGS</span>' 
            : '';
        
        return `
        <div class="faq-card" data-faq-index="${idx}">
            <div class="faq-card-header" onclick="toggleFAQCard(${idx})">
                <div class="faq-card-title-row">
                    <span class="faq-severity-badge ${severityClass}">${escapeHtml(solution.severity)}</span>
                    <span class="faq-category-badge">${escapeHtml(solution.category)}</span>
                    ${detectedBadge}
                    <h3>${escapeHtml(solution.title)}</h3>
                </div>
                <div class="faq-card-meta">
                    <span class="faq-id">${escapeHtml(solution.id)}</span>
                    <span class="faq-time">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        ${escapeHtml(solution.estimatedTime)}
                    </span>
                    <svg class="faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>
            <div class="faq-card-body">
                <div class="faq-why">
                    <h4>Why does this happen?</h4>
                    <p>${escapeHtml(solution.why)}</p>
                </div>
                
                ${solution.prerequisites && solution.prerequisites.length > 0 ? `
                <div class="faq-prereqs">
                    <h4>Prerequisites</h4>
                    <ul>
                        ${solution.prerequisites.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                <div class="faq-steps">
                    <h4>Resolution Steps</h4>
                    <ol class="faq-steps-list">
                        ${solution.steps.map(step => `
                            <li class="faq-step">
                                <div class="faq-step-title">${escapeHtml(step.title)}</div>
                                <div class="faq-step-desc">${escapeHtml(step.description)}</div>
                                ${step.command ? `<code class="faq-step-cmd">${escapeHtml(step.command)}</code>` : ''}
                            </li>
                        `).join('')}
                    </ol>
                </div>
                
                ${solution.relatedIssues && solution.relatedIssues.length > 0 ? `
                <div class="faq-related">
                    <h4>Related Issues</h4>
                    <div class="faq-related-chips">
                        ${solution.relatedIssues.map(r => `
                            <button class="faq-related-chip" onclick="jumpToFAQById('${escapeHtml(r)}')">${escapeHtml(r)}</button>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
}

/**
 * Toggle expand/collapse of a FAQ card.
 */
function toggleFAQCard(index) {
    const card = document.querySelector(`.faq-card[data-faq-index="${index}"]`);
    if (!card) return;
    card.classList.toggle('expanded');
}

/**
 * Filter FAQs by search term (debounced via oninput).
 */
function filterFAQs() {
    const input = document.getElementById('faqsSearchInput');
    faqSearchTerm = input ? input.value.trim() : '';
    renderFAQs();
}

/**
 * Set the active FAQ category filter.
 */
function setFAQCategory(category) {
    faqCategoryFilter = category;
    
    // Update button active states
    document.querySelectorAll('.faqs-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    renderFAQs();
}

/**
 * Jump to and expand a FAQ card by its solution ID (e.g. from related issues links).
 */
function jumpToFAQById(solutionId) {
    // Clear filters so the target is visible
    faqCategoryFilter = 'all';
    faqSearchTerm = '';
    const searchInput = document.getElementById('faqsSearchInput');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.faqs-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === 'all');
    });
    
    renderFAQs();
    
    // Find the card with the matching ID
    const patterns = solutionDatabase.patterns || [];
    const targetIndex = patterns.findIndex(p => p.id === solutionId);
    if (targetIndex === -1) {
        showToast(`Issue "${solutionId}" not found in knowledge base`, 'warning');
        return;
    }
    
    const card = document.querySelector(`.faq-card[data-faq-index="${targetIndex}"]`);
    if (card) {
        card.classList.add('expanded');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Brief highlight flash
        card.classList.add('faq-highlight-flash');
        setTimeout(() => card.classList.remove('faq-highlight-flash'), 1500);
    }
}

// ============================================
// Utility Functions
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @param {string} successMessage - Toast message on success
 */
function copyToClipboard(text, successMessage = 'Copied to clipboard') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(successMessage, 'success');
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
            showToast('Failed to copy to clipboard', 'error');
        });
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast(successMessage, 'success');
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            showToast('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textarea);
    }
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Global sync scroll variable
let syncScroll = false;

// ============================================
// Analytics Dashboard
// ============================================
let charts = { severity: null, timeline: null, topIssues: null, fileComparison: null };

function updateAnalytics() {
    console.log('updateAnalytics() called. Issues:', state.issues?.length || 0, 'Files:', state.files?.length || 0);
    
    if (!state.issues || state.issues.length === 0) {
        console.warn('No issues to display in analytics');
        return;
    }
    
    updateAnalyticsCards();
    initializeCharts();
}

function updateAnalyticsCards() {
    const total = state.issues.length;
    const critical = state.issues.filter(i => i.severity === 'critical').length;
    const errors = state.issues.filter(i => i.severity === 'error').length;
    const warnings = state.issues.filter(i => i.severity === 'warning').length;
    const performance = state.issues.filter(i => i.category === 'performance').length;
    
    console.log('updateAnalyticsCards() - Counts:', { total, critical, errors, warnings, performance });
    
    // Update analytics cards
    const totalEl = document.getElementById('analyticsTotal');
    const criticalEl = document.getElementById('analyticsCritical');
    const errorsEl = document.getElementById('analyticsErrors');
    const warningsEl = document.getElementById('analyticsWarnings');
    const performanceEl = document.getElementById('analyticsPerformance');
    const filesEl = document.getElementById('analyticsFiles');
    const linesTotalEl = document.getElementById('analyticsLinesTotal');
    
    console.log('Elements found:', {
        totalEl: !!totalEl,
        criticalEl: !!criticalEl,
        errorsEl: !!errorsEl,
        warningsEl: !!warningsEl,
        performanceEl: !!performanceEl,
        filesEl: !!filesEl,
        linesTotalEl: !!linesTotalEl
    });
    
    if (totalEl) totalEl.textContent = total.toLocaleString();
    if (criticalEl) criticalEl.textContent = critical.toLocaleString();
    if (errorsEl) errorsEl.textContent = errors.toLocaleString();
    if (warningsEl) warningsEl.textContent = warnings.toLocaleString();
    if (performanceEl) performanceEl.textContent = performance.toLocaleString();
    if (filesEl) filesEl.textContent = state.files.length;
    
    // Update percentages
    const criticalPctEl = document.getElementById('analyticsCriticalPct');
    const errorsPctEl = document.getElementById('analyticsErrorsPct');
    const warningsPctEl = document.getElementById('analyticsWarningsPct');
    const performancePctEl = document.getElementById('analyticsPerformancePct');
    
    if (criticalPctEl) criticalPctEl.textContent = total > 0 ? `${Math.round(critical / total * 100)}%` : '0%';
    if (errorsPctEl) errorsPctEl.textContent = total > 0 ? `${Math.round(errors / total * 100)}%` : '0%';
    if (warningsPctEl) warningsPctEl.textContent = total > 0 ? `${Math.round(warnings / total * 100)}%` : '0%';
    if (performancePctEl) performancePctEl.textContent = total > 0 ? `${Math.round(performance / total * 100)}%` : '0%';
    
    // Update lines total
    const totalLines = state.files.reduce((sum, f) => sum + f.lines.length, 0);
    if (linesTotalEl) linesTotalEl.textContent = `${totalLines.toLocaleString()} lines`;
    
    console.log('Analytics cards updated successfully');
    
    // Update insights
    updateInsights(critical, errors, warnings, performance);
}

function updateInsights(critical, errors, warnings, performance) {
    const criticalInsight = document.getElementById('insightCritical');
    const trendInsight = document.getElementById('insightTrend');
    const recommendationInsight = document.getElementById('insightRecommendation');
    
    if (criticalInsight) {
        if (critical > 0) {
            criticalInsight.textContent = `${critical} critical issue${critical > 1 ? 's' : ''} detected. Immediate attention required!`;
        } else {
            criticalInsight.textContent = 'No critical issues detected. System appears stable.';
        }
    }
    
    if (trendInsight) {
        const total = state.issues.length;
        if (total === 0) {
            trendInsight.textContent = 'Load log files to see issue trends and patterns.';
        } else if (errors > warnings) {
            trendInsight.textContent = `Error rate is higher than warnings. Focus on resolving ${errors} error${errors > 1 ? 's' : ''}.`;
        } else {
            trendInsight.textContent = `Most issues are warnings. System is relatively stable with ${total} total issue${total > 1 ? 's' : ''}.`;
        }
    }
    
    if (recommendationInsight) {
        if (critical > 0) {
            recommendationInsight.textContent = 'Address critical issues first, then work through errors systematically.';
        } else if (errors > 0) {
            recommendationInsight.textContent = 'Review and resolve error messages to improve system reliability.';
        } else if (warnings > 0) {
            recommendationInsight.textContent = 'Monitor warnings to prevent them from escalating into errors.';
        } else {
            recommendationInsight.textContent = 'System is healthy. Continue monitoring logs regularly.';
        }
    }
}

function initializeCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js is not loaded. Charts will not be displayed.');
        return;
    }
    
    createSeverityChart();
    createTimelineChart();
    createTopIssuesChart();
    createFileComparisonChart();
}

function createSeverityChart() {
    const ctx = document.getElementById('severityChart');
    if (!ctx) return;
    
    const critical = state.issues.filter(i => i.severity === 'critical').length;
    const errors = state.issues.filter(i => i.severity === 'error').length;
    const warnings = state.issues.filter(i => i.severity === 'warning').length;
    
    if (charts.severity) charts.severity.destroy();
    
    charts.severity = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Critical', 'Error', 'Warning'],
            datasets: [{
                data: [critical, errors, warnings],
                backgroundColor: [
                    'rgba(153, 27, 27, 0.85)',   // Dark Red for Critical
                    'rgba(239, 68, 68, 0.85)',   // Bright Red for Error
                    'rgba(234, 179, 8, 0.85)'    // Yellow/Amber for Warning
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: {
                            family: 'Outfit, sans-serif'
                        }
                    }
                }
            }
        }
    });
}

function createTimelineChart() {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;
    
    const filter = document.getElementById('timelineFilter')?.value || 'file';
    let labels, data;
    
    if (filter === 'file') {
        labels = state.files.map(f => f.name);
        data = labels.map(l => state.issues.filter(i => i.file === l).length);
    } else {
        // For now, just use file-based data
        labels = state.files.map(f => f.name);
        data = labels.map(l => state.issues.filter(i => i.file === l).length);
    }
    
    if (charts.timeline) charts.timeline.destroy();
    
    charts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Issues',
                data: data,
                borderColor: 'rgba(59, 130, 246, 1)', // Blue
                backgroundColor: 'rgba(59, 130, 246, 0.15)', // Light Blue transparent
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(59, 130, 246, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function createTopIssuesChart() {
    const ctx = document.getElementById('topIssuesChart');
    if (!ctx) return;
    
    const issueCounts = {};
    state.issues.forEach(issue => {
        issueCounts[issue.title] = (issueCounts[issue.title] || 0) + 1;
    });
    
    const sorted = Object.entries(issueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);
    
    if (charts.topIssues) charts.topIssues.destroy();
    
    // Generate a pleasant color palette instead of just solid orange
    const colors = [
        'rgba(59, 130, 246, 0.8)',   // Blue
        'rgba(16, 185, 129, 0.8)',   // Emerald
        'rgba(139, 92, 246, 0.8)',   // Violet
        'rgba(245, 158, 11, 0.8)',   // Amber
        'rgba(236, 72, 153, 0.8)',   // Pink
        'rgba(6, 182, 212, 0.8)',    // Cyan
        'rgba(249, 115, 22, 0.8)',   // Orange
        'rgba(99, 102, 241, 0.8)',   // Indigo
        'rgba(20, 184, 166, 0.8)',   // Teal
        'rgba(239, 68, 68, 0.8)'     // Red
    ];
    
    charts.topIssues = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Occurrences',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function createFileComparisonChart() {
    const ctx = document.getElementById('fileComparisonChart');
    if (!ctx) return;
    
    const labels = state.files.map(f => f.name);
    const critical = labels.map(l => state.issues.filter(i => i.file === l && i.severity === 'critical').length);
    const errors = labels.map(l => state.issues.filter(i => i.file === l && i.severity === 'error').length);
    const warnings = labels.map(l => state.issues.filter(i => i.file === l && i.severity === 'warning').length);
    
    if (charts.fileComparison) charts.fileComparison.destroy();
    
    charts.fileComparison = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Critical',
                    data: critical,
                    backgroundColor: 'rgba(153, 27, 27, 0.85)',
                    borderWidth: 0
                },
                {
                    label: 'Error',
                    data: errors,
                    backgroundColor: 'rgba(239, 68, 68, 0.85)',
                    borderWidth: 0
                },
                {
                    label: 'Warning',
                    data: warnings,
                    backgroundColor: 'rgba(234, 179, 8, 0.85)',
                    borderWidth: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: {
                            family: 'Outfit, sans-serif'
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                }
            }
        }
    });
}

function updateTimelineChart() {
    createTimelineChart();
}

function refreshCharts() {
    if (state.issues.length === 0) {
        showToast('Load log files to see analytics', 'info');
        return;
    }
    updateAnalytics();
    showToast('Charts refreshed', 'success');
}

// ============================================
// Clear All Logs Functionality
// ============================================
function confirmClearAllLogs() {
    if (state.files.length === 0) {
        showToast('No files loaded to clear', 'info');
        return;
    }
    
    // Update count in modal
    document.getElementById('clearLogsCount').textContent = state.files.length;
    
    // Show confirmation modal
    const modal = document.getElementById('clearLogsModal');
    modal.classList.add('active');
}

function closeClearLogsModal() {
    const modal = document.getElementById('clearLogsModal');
    modal.classList.remove('active');
}

async function clearAllLogs() {
    // Stop live tail if active
    if (state.liveTailActive) {
        await stopLiveTail();
    }
    
    const fileCount = state.files.length;
    
    // Clear all state
    state.files = [];
    state.currentFileIndex = -1;
    state.currentConfigFileIndex = -1;
    state.parsedLogs.clear();
    state.issues = [];
    state.searchMatches = [];
    state.currentMatchIndex = -1;
    state.activeFilter = 'all';
    state.activeCategory = 'all';
    state.lastReadPositions.clear();
    state.liveTailFileHandles.clear();
    state.engineFilters = {
        business: false,
        comms: false,
        integration: false
    };

    state.compareLayout = 'sideBySide';
    try {
        localStorage.setItem('traka-compare-layout', 'sideBySide');
    } catch (e) {
        /* ignore */
    }
    
    // Reset UI
    updateUI();
    updateFileDropdown();
    updateConfigFileDropdown();
    updateFilesList();
    updateCompareView();
    updateIssuesUI();
    displayLog(null);
    displayConfigFile(null);
    
    // Clear search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Clear date filters
    if (state.dateFromPicker) {
        state.dateFromPicker.clear();
    } else {
        const dateFrom = document.getElementById('dateFrom');
        if (dateFrom) dateFrom.value = '';
    }
    
    if (state.dateToPicker) {
        state.dateToPicker.clear();
    } else {
        const dateTo = document.getElementById('dateTo');
        if (dateTo) dateTo.value = '';
    }
    
    // Reset filter chips to 'All'
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.level === 'all');
    });
    
    // Reset engine filters
    document.querySelectorAll('.engine-filter-chip').forEach(chip => {
        chip.classList.remove('active');
    });
    
    // Close modal
    closeClearLogsModal();
    
    // Navigate to home
    navigateTo('home');
    
    // Show success message
    showToast(`Successfully cleared ${fileCount} file${fileCount !== 1 ? 's' : ''} and all analysis data`, 'success');
}

// ============================================
// Time Sync Functionality
// ============================================
function toggleTimeSync() {
    // Prevent double-clicking
    if (state.timeSyncProcessing) {
        return;
    }
    
    const btn = document.getElementById('timeSyncBtn');
    const infoPanel = document.getElementById('timeSyncInfo');
    
    // Show immediate visual feedback
    state.timeSyncProcessing = true;
    btn.disabled = true;
    btn.style.opacity = '0.6';
    
    // Store original button content
    const originalHTML = btn.innerHTML;
    
    if (!state.timeSyncActive) {
        // Enabling
        if (state.files.length < 2) {
            showToast('Load at least 2 log files to use time sync', 'warning');
            state.timeSyncProcessing = false;
            btn.disabled = false;
            btn.style.opacity = '1';
            return;
        }
        
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-animation">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Enabling...
        `;
        
        // Show global loader for a polished feel while processing
        showGlobalLoader();
        
        // Use setTimeout to allow UI to update
        setTimeout(() => {
            state.timeSyncActive = true;
            btn.classList.add('active');
            btn.innerHTML = originalHTML;
            
            if (infoPanel) {
                infoPanel.style.display = 'block';
                // Animate in
                infoPanel.style.opacity = '0';
                setTimeout(() => {
                    infoPanel.style.opacity = '1';
                }, 10);
                
                // Restore collapsed state from localStorage
                try {
                    const wasCollapsed = localStorage.getItem('traka-timesync-collapsed') === 'true';
                    if (wasCollapsed) {
                        infoPanel.classList.add('collapsed');
                    }
                } catch (e) {
                    console.error('Failed to restore time sync panel state:', e);
                }
            }
            
            // Add click handlers to existing elements instead of rebuilding
            enableTimeSyncHandlers();
            
            state.timeSyncProcessing = false;
            btn.disabled = false;
            btn.style.opacity = '1';
            
            hideGlobalLoader();
            showToast('Time Sync enabled - Click any timestamped line (Press T to collapse panel)', 'success');
        }, 50);
    } else {
        // Disabling
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-animation">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Disabling...
        `;
        
        // Show global loader for a polished feel while processing
        showGlobalLoader();
        
        setTimeout(() => {
            state.timeSyncActive = false;
            btn.classList.remove('active');
            btn.innerHTML = originalHTML;
            
            if (infoPanel) {
                infoPanel.style.opacity = '0';
                setTimeout(() => {
                    infoPanel.style.display = 'none';
                }, 200);
            }
            
            clearTimeSyncHighlights();
            disableTimeSyncHandlers();
            state.timeSyncLastTarget = null;
            
            state.timeSyncProcessing = false;
            btn.disabled = false;
            btn.style.opacity = '1';
            
            hideGlobalLoader();
            showToast('Time Sync disabled', 'info');
        }, 50);
    }
}

function toggleTimeSyncPanel() {
    const infoPanel = document.getElementById('timeSyncInfo');
    const toggleBtn = document.getElementById('timeSyncToggleBtn');
    
    if (!infoPanel) return;
    
    const isCollapsed = infoPanel.classList.toggle('collapsed');
    
    // Update button icon rotation handled by CSS
    
    // No manual padding needed — flex layout auto-fills available space
    
    // Save preference
    try {
        localStorage.setItem('traka-timesync-collapsed', isCollapsed.toString());
    } catch (e) {
        console.error('Failed to save time sync panel state:', e);
    }
}

// Keyboard shortcut for toggling time sync panel
document.addEventListener('keydown', (e) => {
    // Prevent interfering with input fields, textareas, etc.
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
    }

    // 'T' key to toggle time sync panel (only when time sync is active)
    if (e.key === 't' || e.key === 'T') {
        const infoPanel = document.getElementById('timeSyncInfo');
        if (infoPanel && infoPanel.style.display !== 'none') {
            e.preventDefault();
            toggleTimeSyncPanel();
        }
    }
});

function enableTimeSyncHandlers() {
    // Add click handlers to timestamped lines without rebuilding entire view
    document.querySelectorAll('.log-line[data-timestamp]').forEach(line => {
        const timestamp = line.getAttribute('data-timestamp');
        const fileIndex = parseInt(line.getAttribute('data-file-index'));
        const lineNum = parseInt(line.getAttribute('data-line'));
        
        if (timestamp) {
            line.style.cursor = 'pointer';
            line.onclick = () => syncToTimestamp(timestamp, fileIndex, lineNum);
        }
    });
}

function disableTimeSyncHandlers() {
    // Remove click handlers from timestamped lines
    document.querySelectorAll('.log-line[data-timestamp]').forEach(line => {
        line.style.cursor = '';
        line.onclick = null;
    });
}

function updateTimeSyncThreshold(value) {
    state.timeSyncRange = parseInt(value) * 1000; // Convert to milliseconds
    const display = document.getElementById('thresholdDisplay');
    if (display) {
        const val = parseInt(value);
        if (val >= 60) {
            const mins = val / 60;
            display.textContent = `±${mins} minute${mins !== 1 ? 's' : ''}`;
        } else {
            display.textContent = `±${val} second${val !== 1 ? 's' : ''}`;
        }
    }
    
    updatePresetButtons(parseInt(value));
    
    // Live re-sync: re-apply highlights with the new threshold if a sync target exists
    if (state.timeSyncActive && state.timeSyncLastTarget) {
        clearTimeout(state.timeSyncThresholdTimer);
        state.timeSyncThresholdTimer = setTimeout(() => {
            const t = state.timeSyncLastTarget;
            performTimeSyncInternal(t.timestampStr, t.targetTime, t.sourceFileIndex, t.sourceLine);
        }, 80);
    }
}

function setTimeSyncThreshold(seconds) {
    const slider = document.getElementById('timeSyncThreshold');
    if (slider) {
        slider.value = seconds;
        updateTimeSyncThreshold(seconds);
    }
}

function updatePresetButtons(value) {
    document.querySelectorAll('.btn-preset').forEach(btn => {
        let btnValue;
        if (btn.textContent.includes('m')) {
            btnValue = parseInt(btn.textContent) * 60;
        } else {
            btnValue = parseInt(btn.textContent);
        }
        btn.classList.toggle('active', btnValue === value);
    });
}

function syncToTimestamp(timestampStr, sourceFileIndex, sourceLine) {
    if (!state.timeSyncActive) return;
    
    // Prevent double-clicks during sync
    if (state.timeSyncProcessing) return;
    state.timeSyncProcessing = true;
    
    // Parse the timestamp
    const targetTime = parseTimestamp(timestampStr);
    if (!targetTime) {
        console.warn('Failed to parse timestamp:', timestampStr);
        showToast('Unable to parse timestamp from this line', 'warning');
        state.timeSyncProcessing = false;
        return;
    }
    
    // Show loader for multiple files or large files
    const totalLines = state.files.reduce((sum, f) => sum + (f.lines ? f.lines.length : 0), 0);
    const showLoader = state.files.length > 2 || totalLines > 10000;
    
    if (showLoader) {
        showGlobalLoader('Syncing...', 'Finding matching timestamps');
    }
    
    // Use setTimeout to allow loader to render
    setTimeout(() => {
        performTimeSyncInternal(timestampStr, targetTime, sourceFileIndex, sourceLine);
        
        if (showLoader) {
            hideGlobalLoader();
        }
        state.timeSyncProcessing = false;
    }, showLoader ? 50 : 0);
}

function performTimeSyncInternal(timestampStr, targetTime, sourceFileIndex, sourceLine) {
    console.log('Time Sync - Target timestamp:', timestampStr, '| Parsed to:', new Date(targetTime).toISOString(), '| Ms:', targetTime);
    
    const rangeMs = state.timeSyncRange;
    const minTime = targetTime - rangeMs;
    const maxTime = targetTime + rangeMs;
    
    state.timeSyncLastTarget = { timestampStr, targetTime, minTime, maxTime, sourceFileIndex, sourceLine };
    state.timeSyncNearestLines = {}; // Initialize object to store nearest lines
    state.timeSyncBounds = {}; // Initialize object to store first/last match indices
    state.timeSyncOffsets = {}; // Store precise pixel offsets for slot-machine scrolling
    
    // Clear status display manually instead of calling clearTimeSyncHighlights() which would wipe our state
    const statusClearEl = document.getElementById('timeSyncStatus');
    if (statusClearEl) {
        statusClearEl.innerHTML = '';
    }
    
    console.log(`Time Sync - Range: ±${rangeMs}ms (${rangeMs/1000}s) | Min: ${new Date(minTime).toISOString()} | Max: ${new Date(maxTime).toISOString()}`);
    
    let totalHighlightedOtherFiles = 0;
    let otherFilesWithMatches = 0;
    const totalOtherFiles = state.files.length - 1;
    
    // Suppress sync-scroll while we programmatically position all panels
    state.timeSyncScrolling = true;
    
    state.files.forEach((file, fileIndex) => {
        const isSource = (fileIndex === sourceFileIndex);
        let closestLineIdx = -1;
        let closestDelta = Infinity;
        let fileHighlightCount = 0;
        let firstMatchIdx = -1;
        let lastMatchIdx = -1;
        
        // Scan ALL lines in the file to find timestamps
        for (let i = 0; i < file.lines.length; i++) {
            const line = file.lines[i];
            const tsStr = extractTimestamp(line);
            if (!tsStr) continue;
            
            const lineTime = parseTimestamp(tsStr);
            if (!lineTime) continue;
            
            // Highlight checking
            if (lineTime >= minTime && lineTime <= maxTime) {
                if (firstMatchIdx === -1) firstMatchIdx = i;
                lastMatchIdx = i;
                
                if (!isSource) {
                    fileHighlightCount++;
                    totalHighlightedOtherFiles++;
                }
            }
            
            // Track closest
            const delta = Math.abs(lineTime - targetTime);
            if (delta < closestDelta) {
                closestDelta = delta;
                closestLineIdx = i;
            }
        }
        
        state.timeSyncBounds[fileIndex] = { start: firstMatchIdx, end: lastMatchIdx };
        
        if (!isSource && fileHighlightCount > 0) {
            otherFilesWithMatches++;
        }
        
        const targetLineIdx = isSource ? (sourceLine - 1) : closestLineIdx;
        
        if (targetLineIdx >= 0) {
            // Unconditionally mark the closest match for all other files as the nearest/target
            if (!isSource) {
                state.timeSyncNearestLines[fileIndex] = targetLineIdx;
            }
            
            // Scroll virtual viewport to this line index
            const cvs = state.compareVirtualScroll;
            if (cvs && cvs[fileIndex]) {
                const vs = cvs[fileIndex];
                
                // Use getBoundingClientRect().height instead of clientHeight to calculate center.
                // clientHeight is reduced if a horizontal scrollbar is present, which causes
                // the "center" calculation to differ between panels, breaking perfect alignment.
                // getBoundingClientRect().height is consistent for all panels in the flex row.
                const panelHeight = vs.panelContent.getBoundingClientRect().height || 600;
                
                // Try to center the target line perfectly in the middle of the panel
                const scrollPos = (targetLineIdx + 0.5) * vs.lineHeight - panelHeight / 2;
                
                // Ensure we don't try to scroll below the bottom (causes clamping and breaks sync)
                const maxScroll = Math.max(0, vs.panelContent.scrollHeight - vs.panelContent.clientHeight);
                const finalScrollTop = Math.min(Math.max(0, scrollPos), maxScroll);
                
                vs.panelContent.scrollTop = finalScrollTop;
                
                // Store the precise pixel offset to lock scrolling in slot-machine mode
                state.timeSyncOffsets[fileIndex] = finalScrollTop;
                
                // Force a synchronous re-render of this panel's virtual scroll to apply the new highlights immediately
                vs.lastRenderedStart = -1;
                updateComparePanelViewport(fileIndex, true);
            }
        } else {
            // Even if no target found, store the offset to keep it locked where it is
            const cvs = state.compareVirtualScroll;
            if (cvs && cvs[fileIndex]) {
                state.timeSyncOffsets[fileIndex] = cvs[fileIndex].panelContent.scrollTop;
            }
        }
        
        // Always force a re-render so classes (like dimmed) apply correctly
        const fallbackCvs = state.compareVirtualScroll;
        if (fallbackCvs && fallbackCvs[fileIndex] && targetLineIdx < 0) {
            const vs = fallbackCvs[fileIndex];
            vs.lastRenderedStart = -1;
            updateComparePanelViewport(fileIndex, true);
        }
        
        console.log(`Time Sync - File ${fileIndex} (${isSource ? 'SOURCE' : 'OTHER'}): ${fileHighlightCount} matches in range, closest delta: ${Math.round(closestDelta)}ms`);
    });
    
    // Re-enable sync-scroll after a short delay so smooth-scroll events don't cascade
    setTimeout(() => { state.timeSyncScrolling = false; }, 100);
    
    console.log(`Time Sync - Total matches in OTHER files: ${totalHighlightedOtherFiles} across ${totalOtherFiles} other files`);
    
    // Update status display
    const statusEl = document.getElementById('timeSyncStatus');
    if (statusEl) {
        let thresholdLabel = `${state.timeSyncRange / 1000}s`;
        if (state.timeSyncRange >= 60000) {
            thresholdLabel = `${state.timeSyncRange / 60000}m`;
        }
        
        const fileMatchSummary = otherFilesWithMatches === totalOtherFiles
            ? `all ${totalOtherFiles} other file${totalOtherFiles !== 1 ? 's' : ''}`
            : `${otherFilesWithMatches} of ${totalOtherFiles} other file${totalOtherFiles !== 1 ? 's' : ''}`;
        
        statusEl.innerHTML = `
            <div style="padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius-md); border-left: 3px solid var(--accent-primary);">
                <strong>Synced to:</strong> ${escapeHtml(timestampStr)}<br>
                <span style="color: var(--text-tertiary); font-size: 0.875rem;">
                    ${totalHighlightedOtherFiles > 0 
                        ? `${totalHighlightedOtherFiles} matching line${totalHighlightedOtherFiles !== 1 ? 's' : ''} found in ${fileMatchSummary} within ±${thresholdLabel} — all panels lined up`
                        : `No exact matches within ±${thresholdLabel} — panels scrolled to nearest timestamps`}
                </span>
            </div>
        `;
    }
    
    if (totalHighlightedOtherFiles > 0) {
        showToast(`Time sync: ${totalHighlightedOtherFiles} match${totalHighlightedOtherFiles !== 1 ? 'es' : ''} in ${otherFilesWithMatches} other file${otherFilesWithMatches !== 1 ? 's' : ''}`, 'success');
    } else {
        let thresholdLabel = `${state.timeSyncRange / 1000}s`;
        if (state.timeSyncRange >= 60000) {
            thresholdLabel = `${state.timeSyncRange / 60000}m`;
        }
        showToast(`No matches within ±${thresholdLabel} — panels scrolled to nearest timestamps`, 'info');
    }
    
    // Broadcast time sync event to popouts
    if (isElectron) {
        window.electronAPI.broadcastSync('time-sync', {
            timestampStr,
            targetTime,
            sourceFileIndex,
            sourceLine,
            bounds: state.timeSyncBounds,
            nearestLines: state.timeSyncNearestLines,
            offsets: state.timeSyncOffsets
        });
    }
}

function clearTimeSyncHighlights(isRemoteSync = false) {
    state.timeSyncLastTarget = null;
    state.timeSyncNearestLines = {};
    state.timeSyncBounds = {};
    state.timeSyncOffsets = {};
    
    // Force re-render of all virtual scroll viewports to clear highlights
    if (state.compareVirtualScroll) {
        state.compareVirtualScroll.forEach((vs, idx) => {
            if (vs) {
                vs.lastRenderedStart = -1;
                updateComparePanelViewport(idx, true);
            }
        });
    }
    
    const statusEl = document.getElementById('timeSyncStatus');
    if (statusEl) {
        statusEl.innerHTML = '';
    }
    
    // Broadcast clear event to popouts
    if (!isRemoteSync && isElectron) {
        window.electronAPI.broadcastSync('time-sync-clear');
    }
}

function parseTimestamp(timestampStr) {
    // Try various timestamp formats and convert to milliseconds since epoch
    
    // Helper to parse fractional seconds correctly
    const parseMs = (msStr) => {
        if (!msStr) return 0;
        return parseFloat("0." + msStr) * 1000;
    };
    
    // Format: 2024-01-19 14:25:30.123 or 2024-01-19T14:25:30.123
    let match = timestampStr.match(/(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?/);
    if (match) {
        const [, year, month, day, hour, min, sec, ms] = match;
        return new Date(year, month - 1, day, hour, min, sec).getTime() + parseMs(ms);
    }
    
    // Format: 19/01/2024 14:25:30.123
    match = timestampStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?/);
    if (match) {
        const [, day, month, year, hour, min, sec, ms] = match;
        return new Date(year, month - 1, day, hour, min, sec).getTime() + parseMs(ms);
    }
    
    // Format: 01-19-2024 14:25:30.123
    match = timestampStr.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?/);
    if (match) {
        const [, month, day, year, hour, min, sec, ms] = match;
        return new Date(year, month - 1, day, hour, min, sec).getTime() + parseMs(ms);
    }
    
    // Format: [14:25:30.123] or 14:25:30.123 (time only - use today's date)
    match = timestampStr.match(/\[?(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?\]?/);
    if (match) {
        const today = new Date();
        const [, hour, min, sec, ms] = match;
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, min, sec).getTime() + parseMs(ms);
    }
    
    // If no pattern matched, try standard Date parsing as fallback
    const fallbackTime = Date.parse(timestampStr);
    if (!isNaN(fallbackTime)) {
        return fallbackTime;
    }
    
    return null;
}