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
    
    window.electronAPI.onFileRemoved((data) => {
        console.log('File removed:', data.name);
        showToast(`Log file removed: ${data.name}`, 'warning');
    });
}

/**
 * Scan Traka log directories automatically
 */
async function scanTrakaLogs() {
    if (!isElectron) {
        showToast('Directory scanning is only available in Desktop Edition', 'warning');
        return;
    }
    
    const btn = document.getElementById('scanTrakaLogsBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg> Scanning...';
    }
    
    try {
        const result = await window.electronAPI.scanTrakaLogs();
        
        if (result.success) {
            electronState.scannedFiles = result.files;
            
            if (result.files.length === 0) {
                showToast('No log files found in Traka directories', 'warning');
                updateDiscoveryStatus(`Scanned ${result.scannedPaths.length} directories - No log files found`);
            } else {
                showToast(`Found ${result.totalFiles} log files in ${result.scannedPaths.length} directories`, 'success');
                updateDiscoveryStatus(`Found ${result.totalFiles} log files`);
                
                // Show file selection modal
                showFileSelectionModal(result.files, result.scannedPaths);
            }
        } else {
            showToast(`Scan failed: ${result.error}`, 'error');
            updateDiscoveryStatus('Scan failed');
        }
    } catch (error) {
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
            const scanResult = await window.electronAPI.scanDirectory(result.path);
            
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
            showToast(`Loading ${result.paths.length} file(s)...`, 'info');
            
            for (const filePath of result.paths) {
                await loadFileFromPath(filePath);
            }
            
            showToast(`Successfully loaded ${result.paths.length} file(s)`, 'success');
        }
    } catch (error) {
        console.error('File picker error:', error);
        showToast('Error loading files', 'error');
    }
}

/**
 * Load a file from file system path (Electron only)
 */
async function loadFileFromPath(filePath) {
    if (!isElectron) return;
    
    try {
        const result = await window.electronAPI.readLogFile(filePath);
        
        if (result.success) {
            // Create a file-like object to use with existing loadFile function
            const fileObj = {
                name: result.name,
                size: result.size,
                lastModified: new Date(result.modified).getTime(),
                content: result.content,
                path: result.path
            };
            
            // Process the file content using existing logic
            const isConfig = fileObj.name.endsWith('.cfg');
            const fileData = {
                name: fileObj.name,
                size: fileObj.size,
                lastModified: new Date(fileObj.lastModified),
                content: fileObj.content,
                lines: fileObj.content.split('\n'),
                type: isConfig ? 'config' : 'log',
                path: fileObj.path
            };
            
            // Add to state and process
            state.files.push(fileData);
            state.parsedLogs.set(fileData.name, fileData.lines);
            
            if (!isConfig) {
                parseAndDetectIssues(fileData);
            }
            
            updateUI();
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
    // Create modal HTML
    const modalHTML = `
        <div class="modal-overlay" id="fileSelectionModal" style="display: flex;">
            <div class="modal" style="max-width: 800px; max-height: 80vh;">
                <div class="modal-header">
                    <h3>Select Log Files to Load</h3>
                    <button class="btn-icon" onclick="closeFileSelectionModal()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-content" style="max-height: 50vh; overflow-y: auto;">
                    <p style="margin-bottom: 1rem;">Found ${files.length} log files in ${directories.length} directories:</p>
                    <div style="margin-bottom: 1rem;">
                        <button class="btn btn-small btn-secondary" onclick="selectAllDiscoveredFiles()">Select All</button>
                        <button class="btn btn-small btn-secondary" onclick="deselectAllDiscoveredFiles()">Deselect All</button>
                    </div>
                    <div id="discoveredFilesList" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${files.map((file, idx) => `
                            <label style="display: flex; align-items: center; padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 4px; cursor: pointer;">
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

async function loadSelectedDiscoveredFiles() {
    const checkboxes = document.querySelectorAll('.discovered-file-checkbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (selectedIndices.length === 0) {
        showToast('No files selected', 'warning');
        return;
    }
    
    closeFileSelectionModal();
    showToast(`Loading ${selectedIndices.length} file(s)...`, 'info');
    
    let loadedCount = 0;
    for (const idx of selectedIndices) {
        const file = electronState.scannedFiles[idx];
        if (file) {
            const result = await loadFileFromPath(file.path);
            if (result) loadedCount++;
        }
    }
    
    if (loadedCount > 0) {
        showToast(`Successfully loaded ${loadedCount} file(s)`, 'success');
        navigateTo('viewer');
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
    stitchMode: false,
    stitchedFiles: [], // Files selected for stitching
    stitchedData: null, // Merged log data
    dateSortOrder: 'none', // Date sorting: 'none', 'asc', 'desc'
    engineFilters: {
        business: false,
        comms: false,
        integration: false
    },
    filterDebounceTimer: null, // Debounce timer for filter changes
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
        maxTailLines: 10000 // Maximum lines to keep in tail mode
    }
};

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
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFileDropZone();
    initFileInputs();
    initSearch();
    initFilters();
    initSettings();
    loadSettings();
    updateUI();
    initScrollSync(); // Initialize scroll synchronization for line numbers
    
    // Initialize Electron-specific features
    if (isElectron) {
        initElectronUI();
    }
});

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
}

function navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });
    
    // Trigger page-specific initialization
    if (page === 'analytics') {
        // Update analytics when navigating to the page
        if (state.issues && state.issues.length > 0) {
            updateAnalytics();
        }
    }
}

// ============================================
// File Handling
// ============================================
function initFileDropZone() {
    const dropZone = document.getElementById('homeDropZone');
    const fileInput = document.getElementById('homeFileInput');
    
    if (!dropZone) return;
    
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
}

function handleFiles(files, sortIntelligently = false, skipNavigation = false) {
    const validFiles = Array.from(files).filter(file => {
        if (file.name.endsWith('.log') || file.name.endsWith('.txt') || file.name.endsWith('.cfg')) {
            return true;
        } else {
            showToast(`Skipped ${file.name} - only .log, .txt, and .cfg files supported`, 'warning');
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
    
    // Show initial loading message for multiple files
    if (validFiles.length > 1) {
        showToast(`Loading ${validFiles.length} files...`, 'info');
    }
    
    // Load all files (pass skipNavigation to each, suppress individual toasts)
    const suppressToast = validFiles.length > 1;
    validFiles.forEach(file => loadFile(file, skipNavigation, suppressToast));
    
    // Show completion message after all files loaded
    if (validFiles.length > 1) {
        setTimeout(() => {
            if (sortIntelligently) {
                const fileTypes = validFiles.map(f => detectEngineType(f.name));
                showToast(`✓ Loaded ${validFiles.length} files: ${fileTypes.join(' → ')}`, 'success');
            } else {
                showToast(`✓ Successfully loaded ${validFiles.length} files`, 'success');
            }
        }, 500);
    }
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
    if (lower.includes('integration')) return 'Integration Engine';
    if (lower.includes('ccure')) return 'CCure Plugin';
    if (lower.includes('lenel')) return 'Lenel Plugin';
    if (lower.includes('onguard')) return 'OnGuard Plugin';
    if (lower.includes('symmetry')) return 'Symmetry Plugin';
    if (lower.includes('secure')) return 'Secure Plugin';
    if (lower.endsWith('.cfg')) return 'Config';
    
    return 'Log File';
}

function loadFile(file, skipNavigation = false, suppressToast = false) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const content = e.target.result;
        const isConfig = file.name.endsWith('.cfg');
        const fileData = {
            name: file.name,
            size: file.size,
            lastModified: new Date(file.lastModified),
            content: content,
            lines: content.split('\n'),
            fileHandle: file, // Store original File object for live monitoring
            isConfig: isConfig // Flag to identify config files
        };
        
        // Check if file already loaded
        const existingIndex = state.files.findIndex(f => f.name === file.name);
        if (existingIndex >= 0) {
            state.files[existingIndex] = fileData;
        } else {
            state.files.push(fileData);
        }
        
        // Initialize last read position for live tail
        state.lastReadPositions.set(file.name, content.length);
        
        // Parse and analyze (skip issue detection for config files)
        parseLogFile(fileData);
        if (!isConfig) {
            detectIssues(fileData);
        }
        
        // Update UI
        updateUI();
        updateFileDropdown();
        updateFilesList();
        updateCompareView();
        
        // Auto-select first file only if we're not skipping navigation
        if (!skipNavigation && state.currentFileIndex === -1) {
            state.currentFileIndex = 0;
            displayLog(state.files[0]);
        }
        
        // Navigate to viewer for better UX - but NOT if skipNavigation is true
        if (!skipNavigation) {
            navigateTo('viewer');
        }
        
        // Show individual toast only if not suppressed (for batch loading)
        if (!suppressToast) {
            const fileType = isConfig ? 'config file' : 'log file';
            showToast(`Loaded ${file.name} as ${fileType} (${formatFileSize(file.size)})`, 'success');
        }
    };
    
    reader.onerror = () => {
        showToast(`Failed to load ${file.name}`, 'error');
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

function detectLogLevel(line) {
    const lowerLine = line.toLowerCase();
    if (/\berror\b|\bfail|\bexception\b|\bcritical\b|\bfatal\b/.test(lowerLine)) return 'error';
    if (/\bwarn\b|\bwarning\b/.test(lowerLine)) return 'warning';
    if (/\binfo\b|\binformation\b/.test(lowerLine)) return 'info';
    if (/\bdebug\b|\btrace\b|\bverbose\b/.test(lowerLine)) return 'debug';
    return 'default';
}

function extractTimestamp(line) {
    // Common timestamp patterns
    const patterns = [
        /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/,
        /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/,
        /(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
        /\[(\d{2}:\d{2}:\d{2})\]/
    ];
    
    for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// ============================================
// Issue Detection
// ============================================
function detectIssues(fileData) {
    const fileIssues = [];
    
    fileData.lines.forEach((line, index) => {
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
                    pattern: pattern.pattern.toString()
                });
                break; // Only first matching pattern per line
            }
        }
        
        // Check custom patterns
        state.settings.customPatterns.forEach(custom => {
            try {
                const regex = new RegExp(custom.pattern, 'i');
                if (regex.test(line)) {
                    fileIssues.push({
                        id: `${fileData.name}-${index}-custom-${Date.now()}`,
                        file: fileData.name,
                        line: index + 1,
                        content: line,
                        severity: custom.severity,
                        category: custom.severity,
                        title: 'Custom Pattern Match',
                        description: custom.description || 'Custom pattern detected',
                        pattern: custom.pattern
                    });
                }
            } catch (e) {
                // Invalid regex, skip
            }
        });
    });
    
    // Remove old issues for this file and add new ones
    state.issues = state.issues.filter(i => i.file !== fileData.name);
    state.issues = [...state.issues, ...fileIssues];
    
    // Sort by severity
    const severityOrder = { critical: 0, error: 1, warning: 2, performance: 3, info: 4 };
    state.issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    updateIssuesUI();
    updateAnalytics(); // Update analytics dashboard
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
function displayLog(fileData) {
    const gutter = document.getElementById('logGutter');
    const content = document.getElementById('logContent');
    
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
}

function renderLogOptimized(fileData, filteredLines, gutter, content) {
    // Build gutter using DocumentFragment
    if (state.settings.showLineNumbers) {
        const gutterFragment = document.createDocumentFragment();
        const gutterDiv = document.createElement('div');
        gutterDiv.innerHTML = filteredLines.map(entry => 
            `<div class="line-number" data-line="${entry.lineNumber}">${entry.lineNumber}</div>`
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
        // Config file display with syntax highlighting
        contentDiv.innerHTML = filteredLines.map(entry => {
            let highlightedLine = escapeHtml(entry.raw);
            
            if (entry.raw.trim().startsWith('[') && entry.raw.trim().endsWith(']')) {
                highlightedLine = `<span style="color: var(--accent-primary); font-weight: 600;">${highlightedLine}</span>`;
            } else if (entry.raw.trim().startsWith('#') || entry.raw.trim().startsWith(';')) {
                highlightedLine = `<span style="color: var(--text-tertiary); font-style: italic;">${highlightedLine}</span>`;
            } else if (entry.raw.includes('=')) {
                const parts = entry.raw.split('=');
                if (parts.length >= 2) {
                    const key = escapeHtml(parts[0]);
                    const value = escapeHtml(parts.slice(1).join('='));
                    highlightedLine = `<span style="color: var(--accent-secondary);">${key}</span>=<span style="color: var(--text-primary);">${value}</span>`;
                }
            }
            
            return `<div class="log-line config-line" data-line="${entry.lineNumber}">${highlightedLine || '&nbsp;'}</div>`;
        }).join('');
    } else {
        // Regular log file display
        contentDiv.innerHTML = filteredLines.map(entry => {
            const levelClass = entry.level !== 'default' ? entry.level : '';
            const highlightedLine = state.settings.highlightSearch && state.searchMatches.length > 0 
                ? highlightSearchTerms(escapeHtml(entry.raw))
                : escapeHtml(entry.raw);
            
            return `<div class="log-line ${levelClass}" data-line="${entry.lineNumber}">${highlightedLine || '&nbsp;'}</div>`;
        }).join('');
    }
    
    while (contentDiv.firstChild) {
        contentFragment.appendChild(contentDiv.firstChild);
    }
    
    content.innerHTML = '';
    content.appendChild(contentFragment);
    
    // Update stats
    updateViewerStats(fileData, filteredLines.length);
    
    // Apply font size
    content.style.fontSize = `${state.settings.fontSize}px`;
    gutter.style.fontSize = `${state.settings.fontSize}px`;
    
    // Apply word wrap
    content.style.whiteSpace = state.settings.wordWrap ? 'pre-wrap' : 'pre';
}

function filterLines(parsed) {
    // Pre-calculate filter conditions once
    const hasLevelFilter = state.activeFilter !== 'all';
    const hasActiveEngineFilter = Object.values(state.engineFilters).some(v => v);
    
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    const hasDateFilter = dateFrom || dateTo;
    
    const dateFromObj = dateFrom ? new Date(dateFrom) : null;
    const dateToObj = dateTo ? new Date(dateTo) : null;
    
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
        if (hasDateFilter && entry.timestamp) {
            const entryDate = new Date(entry.timestamp);
            if (dateFromObj && entryDate < dateFromObj) return false;
            if (dateToObj && entryDate > dateToObj) return false;
        }
        
        return true;
    });
    
    return filtered;
}

function updateViewerStats(fileData, displayedLines) {
    const stats = document.getElementById('viewerStats');
    if (stats) {
        stats.textContent = `${fileData.name} | ${displayedLines.toLocaleString()} of ${fileData.lines.length.toLocaleString()} lines displayed`;
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
        compareSearch.addEventListener('input', debounce(performCompareSearch, 300));
    }
}

function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const searchNav = document.getElementById('searchNav');
    
    if (!query) {
        clearSearch();
        return;
    }
    
    // Check if regex search
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
    
    // Find matches
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
    
    // Update search navigation
    if (state.searchMatches.length > 0) {
        state.currentMatchIndex = 0;
        updateSearchNavigation();
        scrollToMatch(0);
        searchNav.style.display = 'flex';
    } else {
        searchNav.style.display = 'none';
        showToast('No matches found', 'info');
    }
    
    // Re-highlight search terms
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
    
    // Update current match highlight
    state.searchMatches.forEach((match, idx) => {
        match.element.classList.toggle('current-match', idx === state.currentMatchIndex);
    });
}

function scrollToMatch(index) {
    const match = state.searchMatches[index];
    if (match && match.element) {
        match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearSearch() {
    state.searchMatches = [];
    state.currentMatchIndex = -1;
    
    document.querySelectorAll('.log-line').forEach(line => {
        line.classList.remove('search-match', 'current-match');
    });
    
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
    if (!query) return;
    
    // Highlight in all compare panels
    const panels = document.querySelectorAll('.compare-panel-content');
    panels.forEach(panel => {
        const lines = panel.querySelectorAll('.log-line');
        const regex = new RegExp(escapeRegex(query), 'gi');
        
        lines.forEach(line => {
            if (regex.test(line.textContent)) {
                line.classList.add('search-match');
            } else {
                line.classList.remove('search-match');
            }
        });
    });
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
    document.getElementById('dateFrom')?.addEventListener('change', () => {
        if (state.filterDebounceTimer) clearTimeout(state.filterDebounceTimer);
        state.filterDebounceTimer = setTimeout(() => {
            if (state.currentFileIndex >= 0) {
                displayLog(state.files[state.currentFileIndex]);
            }
        }, 200);
    });
    
    document.getElementById('dateTo')?.addEventListener('change', () => {
        if (state.filterDebounceTimer) clearTimeout(state.filterDebounceTimer);
        state.filterDebounceTimer = setTimeout(() => {
            if (state.currentFileIndex >= 0) {
                displayLog(state.files[state.currentFileIndex]);
            }
        }, 200);
    });
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
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    
    if (state.currentFileIndex >= 0) {
        displayLog(state.files[state.currentFileIndex]);
    }
}

// ============================================
// Compare View
// ============================================
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
    
    if (state.files.length < 1) {
        container.innerHTML = `
            <div class="compare-empty" id="compareDropZone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p class="drop-title">Drag & Drop Multiple Logs Here</p>
                <span class="drop-instruction">Drop Business, Comms, Integration, and Plugin logs</span>
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
        return;
    }
    
    // Set data attribute for grid layout
    container.setAttribute('data-file-count', state.files.length);
    
    container.innerHTML = state.files.map((file, index) => {
        const fileTypeBadge = file.isConfig 
            ? '<span class="file-type-badge config" style="margin-left: 0.5rem;">CONFIG</span>' 
            : '';
        
        return `
        <div class="compare-panel" data-index="${index}">
            <div class="compare-panel-header">
                <h4>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    ${escapeHtml(file.name)}${fileTypeBadge}
                </h4>
                <div class="file-badge">${file.lines.length.toLocaleString()} lines</div>
                <button class="btn-icon" onclick="removeFile(${index})" title="Remove file">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="compare-panel-content" onscroll="handleCompareScroll(event, ${index})">
                ${file.lines.map((line, lineIdx) => {
                    const level = detectLogLevel(line);
                    const levelClass = level !== 'default' ? level : '';
                    const timestamp = extractTimestamp(line);
                    const timestampAttr = timestamp ? `data-timestamp="${timestamp}"` : '';
                    const clickHandler = state.timeSyncActive && timestamp ? `onclick="syncToTimestamp('${timestamp}', ${index}, ${lineIdx + 1})"` : '';
                    const cursorStyle = state.timeSyncActive && timestamp ? 'cursor: pointer;' : '';
                    return `<div class="log-line ${levelClass}" data-line="${lineIdx + 1}" data-file-index="${index}" ${timestampAttr} ${clickHandler} style="${cursorStyle}">${escapeHtml(line) || '&nbsp;'}</div>`;
                }).join('')}
            </div>
        </div>
    `;
    }).join('');
}

function handleCompareScroll(event, sourceIndex) {
    if (!state.syncScroll) return;
    
    const sourcePanel = event.target;
    const scrollRatio = sourcePanel.scrollTop / (sourcePanel.scrollHeight - sourcePanel.clientHeight);
    
    document.querySelectorAll('.compare-panel-content').forEach((panel, index) => {
        if (index !== sourceIndex) {
            const targetScrollTop = scrollRatio * (panel.scrollHeight - panel.clientHeight);
            panel.scrollTop = targetScrollTop;
        }
    });
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
    // Simple difference highlighting - marks lines that are unique to each file
    if (state.files.length < 2) {
        showToast('Need at least 2 files to compare', 'warning');
        return;
    }
    
    const allLines = state.files.map(f => new Set(f.lines.map(l => l.trim())));
    let uniqueCounts = Array(state.files.length).fill(0);
    let commonCount = 0;
    
    document.querySelectorAll('.compare-panel').forEach((panel, fileIndex) => {
        const lines = panel.querySelectorAll('.log-line');
        const otherFiles = allLines.filter((_, idx) => idx !== fileIndex);
        
        lines.forEach((lineEl, lineIdx) => {
            const lineText = state.files[fileIndex].lines[lineIdx]?.trim();
            const isUnique = !otherFiles.some(set => set.has(lineText));
            
            // Remove both highlight classes first
            lineEl.classList.remove('highlight-unique', 'highlight-common');
            
            if (isUnique && lineText) {
                lineEl.classList.add('highlight-unique');
                uniqueCounts[fileIndex]++;
            } else if (lineText) {
                lineEl.classList.add('highlight-common');
                commonCount++;
            }
        });
    });
    
    // Show beautiful diff summary panel
    showDiffSummary(uniqueCounts, commonCount);
}

function showDiffSummary(uniqueCounts, commonCount) {
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
                        ${state.files.map((file, idx) => `
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
    document.querySelectorAll('.log-line').forEach(line => {
        line.classList.remove('highlight-unique', 'highlight-common');
    });
    closeDiffSummary();
    showToast('Highlights cleared', 'info');
}

function removeFile(index) {
    const fileName = state.files[index].name;
    state.files.splice(index, 1);
    state.parsedLogs.delete(fileName);
    state.issues = state.issues.filter(i => i.file !== fileName);
    state.lastReadPositions.delete(fileName);
    
    if (state.currentFileIndex === index) {
        state.currentFileIndex = state.files.length > 0 ? 0 : -1;
    } else if (state.currentFileIndex > index) {
        state.currentFileIndex--;
    }
    
    updateUI();
    updateFileDropdown();
    updateFilesList();
    updateCompareView();
    updateIssuesUI();
    
    if (state.currentFileIndex >= 0) {
        displayLog(state.files[state.currentFileIndex]);
    } else {
        displayLog(null);
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
 */
function startLiveTail() {
    if (state.files.length === 0) {
        showToast('Load at least one log file first', 'warning');
        return;
    }
    
    state.liveTailActive = true;
    updateLiveTailButton();
    
    // Start polling for file changes
    state.liveTailInterval = setInterval(() => {
        checkForFileUpdates();
    }, state.settings.tailRefreshInterval);
    
    showToast('Live Tail started - monitoring log files for changes', 'success');
    
    // Enable auto-scroll
    state.autoScrollEnabled = true;
}

/**
 * Stop live tail monitoring
 */
function stopLiveTail() {
    state.liveTailActive = false;
    
    if (state.liveTailInterval) {
        clearInterval(state.liveTailInterval);
        state.liveTailInterval = null;
    }
    
    updateLiveTailButton();
    showToast('Live Tail stopped', 'info');
}

/**
 * Check all loaded files for updates
 */
async function checkForFileUpdates() {
    if (!state.liveTailActive) return;
    
    for (let i = 0; i < state.files.length; i++) {
        const fileData = state.files[i];
        
        try {
            // Re-read the file to check for new content
            const response = await readFileForTail(fileData.fileHandle);
            if (response && response.newContent) {
                // New content detected
                appendNewContent(fileData, response.newContent, response.newLines);
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
                const newLines = newContent.split('\n').filter(line => line.trim());
                
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
 * Append new content to file data and update display
 */
function appendNewContent(fileData, newContent, newLines) {
    if (!newLines || newLines.length === 0) return;
    
    // Append new lines to file data
    fileData.lines = fileData.lines.concat(newLines);
    fileData.content += newContent;
    fileData.size += newContent.length;
    
    // Limit total lines in tail mode to prevent memory issues
    if (fileData.lines.length > state.settings.maxTailLines) {
        const excess = fileData.lines.length - state.settings.maxTailLines;
        fileData.lines = fileData.lines.slice(excess);
        showToast(`Trimmed ${excess} old lines from ${fileData.name}`, 'info');
    }
    
    // Re-parse new lines
    parseLogFile(fileData);
    detectIssues(fileData);
    
    // Update UI if this is the currently viewed file
    const currentFile = state.files[state.currentFileIndex];
    if (currentFile && currentFile.name === fileData.name) {
        displayLog(fileData);
        
        // Auto-scroll to bottom if enabled
        if (state.autoScrollEnabled) {
            scrollToBottom();
        }
    }
    
    // Update compare view if active
    const comparePage = document.getElementById('page-compare');
    if (comparePage && comparePage.classList.contains('active')) {
        updateCompareView();
        
        if (state.autoScrollEnabled) {
            scrollComparePanelsToBottom();
        }
    }
    
    // Update stats
    updateUI();
    updateIssuesUI();
    
    // Show notification for new content
    const currentPage = document.querySelector('.page.active');
    if (currentPage && currentPage.id !== 'page-viewer' && currentPage.id !== 'page-compare') {
        showToast(`${newLines.length} new line(s) in ${fileData.name}`, 'info');
    }
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
    const panels = document.querySelectorAll('.compare-panel-content');
    panels.forEach(panel => {
        panel.scrollTop = panel.scrollHeight;
    });
}

/**
 * Toggle auto-scroll feature
 */
function toggleAutoScroll() {
    state.autoScrollEnabled = !state.autoScrollEnabled;
    updateAutoScrollButton();
    
    if (state.autoScrollEnabled) {
        showToast('Auto-scroll enabled - will scroll to new lines', 'success');
        if (state.liveTailActive) {
            scrollToBottom();
        }
    } else {
        showToast('Auto-scroll disabled', 'info');
    }
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
}

/**
 * Update auto-scroll button appearance
 */
function updateAutoScrollButton() {
    const btn = document.getElementById('autoScrollBtn');
    if (btn) {
        if (state.autoScrollEnabled) {
            btn.classList.add('active');
            btn.title = 'Auto-scroll enabled';
        } else {
            btn.classList.remove('active');
            btn.title = 'Auto-scroll disabled';
        }
    }
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
    
    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countCritical').textContent = counts.critical;
    document.getElementById('countError').textContent = counts.error;
    document.getElementById('countWarning').textContent = counts.warning;
    document.getElementById('countPerformance').textContent = counts.performance;
    
    // Update badges
    document.getElementById('issuesBadge').textContent = counts.all;
    document.getElementById('statIssues').textContent = counts.all;
    
    renderIssues();
}

function renderIssues() {
    const container = document.getElementById('issuesList');
    
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
        customPatterns: []
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

function updateFileDropdown() {
    const select = document.getElementById('viewerFileSelect');
    
    if (state.files.length === 0) {
        select.innerHTML = '<option value="">-- Load a file first --</option>';
        return;
    }
    
    select.innerHTML = state.files.map((file, index) => 
        `<option value="${escapeHtml(file.name)}" ${index === state.currentFileIndex ? 'selected' : ''}>${escapeHtml(file.name)}</option>`
    ).join('');
    
    select.onchange = (e) => {
        const index = state.files.findIndex(f => f.name === e.target.value);
        if (index >= 0) {
            state.currentFileIndex = index;
            displayLog(state.files[index]);
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
                    <div class="file-name">${escapeHtml(file.name)} ${fileTypeBadge}</div>
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
    state.currentFileIndex = index;
    updateFileDropdown();
    displayLog(state.files[index]);
    navigateTo('viewer');
}

function jumpToLine() {
    const lineNum = parseInt(document.getElementById('jumpToLine').value);
    if (isNaN(lineNum) || lineNum < 1) {
        showToast('Please enter a valid line number', 'warning');
        return;
    }
    
    const lineEl = document.querySelector(`.log-line[data-line="${lineNum}"]`);
    if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lineEl.classList.add('highlight');
        
        // Highlight gutter
        const gutterEl = document.querySelector(`.line-number[data-line="${lineNum}"]`);
        if (gutterEl) gutterEl.classList.add('active');
        
        setTimeout(() => {
            lineEl.classList.remove('highlight');
            if (gutterEl) gutterEl.classList.remove('active');
        }, 2000);
    } else {
        showToast(`Line ${lineNum} not found in current view`, 'warning');
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
        showToast('Select files to stitch together', 'info');
    } else {
        panel.style.display = 'none';
        btn.classList.remove('active');
        state.stitchedFiles = [];
    }
}

function populateStitchFileList() {
    const container = document.getElementById('stitchFileList');
    
    if (state.files.length === 0) {
        container.innerHTML = '<p class="empty-message">No files loaded. Load files first.</p>';
        return;
    }
    
    // Filter out config files and already stitched files
    const logFiles = state.files.filter(f => !f.isConfig && !f.isStitched);
    
    if (logFiles.length === 0) {
        container.innerHTML = '<p class="empty-message">No log files available for stitching. Config and stitched files cannot be stitched.</p>';
        return;
    }
    
    // Group files by type (Business Engine, Comms Engine, etc.)
    const grouped = groupFilesByType(logFiles);
    
    let html = '';
    for (const [type, files] of Object.entries(grouped)) {
        html += `
            <div class="stitch-group">
                <h4>${type}</h4>
                ${files.map(file => `
                    <label class="stitch-file-item">
                        <input type="checkbox" 
                               value="${escapeHtml(file.name)}" 
                               onchange="updateStitchSelection()">
                        <span class="file-name">${escapeHtml(file.name)}</span>
                        <span class="file-info">${file.lines.length.toLocaleString()} lines | ${formatFileSize(file.size)}</span>
                    </label>
                `).join('')}
            </div>
        `;
    }
    
    container.innerHTML = html;
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
    const checkboxes = document.querySelectorAll('#stitchFileList input[type="checkbox"]');
    state.stitchedFiles = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
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
    
    showToast(`Stitching ${state.stitchedFiles.length} files...`, 'info');
    
    // Gather all log entries from selected files
    const allEntries = [];
    let totalLines = 0;
    let entriesWithTimestamps = 0;
    let entriesWithoutTimestamps = 0;
    
    state.stitchedFiles.forEach(fileName => {
        const fileData = state.files.find(f => f.name === fileName);
        if (!fileData) return;
        
        const parsed = state.parsedLogs.get(fileName);
        if (!parsed) return;
        
        // Add each log entry with source file info
        parsed.forEach(entry => {
            totalLines++;
            if (entry.timestamp) {
                const sortableTime = parseTimestampForStitch(entry.timestamp);
                if (sortableTime !== null) {
                    allEntries.push({
                        ...entry,
                        sourceFile: fileName,
                        sortableTimestamp: sortableTime
                    });
                    entriesWithTimestamps++;
                } else {
                    // Timestamp exists but couldn't be parsed
                    allEntries.push({
                        ...entry,
                        sourceFile: fileName,
                        sortableTimestamp: null
                    });
                    entriesWithoutTimestamps++;
                }
            } else {
                // No timestamp at all
                allEntries.push({
                    ...entry,
                    sourceFile: fileName,
                    sortableTimestamp: null
                });
                entriesWithoutTimestamps++;
            }
        });
    });
    
    // Sort by timestamp - entries without timestamps go to the end
    const sortedEntries = allEntries.sort((a, b) => {
        if (!a.sortableTimestamp && !b.sortableTimestamp) return 0;
        if (!a.sortableTimestamp) return 1;
        if (!b.sortableTimestamp) return -1;
        return a.sortableTimestamp - b.sortableTimestamp;
    });
    
    // Create a virtual "stitched" file
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const stitchedFileName = `Stitched_${state.stitchedFiles.length}files_${dateStr}_${timeStr}.log`;
    const stitchedContent = sortedEntries.map(entry => entry.raw).join('\n');
    
    state.stitchedData = {
        name: stitchedFileName,
        size: stitchedContent.length,
        lastModified: new Date(),
        content: stitchedContent,
        lines: sortedEntries.map(e => e.raw),
        isStitched: true,
        sourceFiles: state.stitchedFiles.slice(), // Copy array
        entries: sortedEntries
    };
    
    // Parse the stitched data
    state.parsedLogs.set(stitchedFileName, sortedEntries);
    
    // Add to files list if not already there, or replace if it exists
    const existingIndex = state.files.findIndex(f => f.name === stitchedFileName || f.isStitched);
    if (existingIndex >= 0) {
        state.files[existingIndex] = state.stitchedData;
    } else {
        state.files.push(state.stitchedData);
    }
    
    // Also detect issues in stitched log
    detectIssues(state.stitchedData);
    
    // Update UI
    updateUI();
    updateFileDropdown();
    
    // Select and display stitched file
    state.currentFileIndex = state.files.findIndex(f => f.name === stitchedFileName);
    displayStitchedLog(state.stitchedData);
    
    // Enable export button
    document.getElementById('exportStitchedBtn').disabled = false;
    
    // Close stitch panel
    toggleStitchMode();
    
    const successMsg = entriesWithoutTimestamps > 0 
        ? `✓ Stitched ${state.stitchedFiles.length} files (${entriesWithTimestamps.toLocaleString()} sorted by timestamp, ${entriesWithoutTimestamps.toLocaleString()} without timestamps at end)`
        : `✓ Successfully stitched ${state.stitchedFiles.length} files with ${sortedEntries.length.toLocaleString()} log entries`;
    
    showToast(successMsg, 'success');
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
        setTimeout(() => renderStitchedLogOptimized(fileData, filtered, gutter, content), 50);
    } else {
        renderStitchedLogOptimized(fileData, filtered, gutter, content);
    }
}

function renderStitchedLogOptimized(fileData, filtered, gutter, content) {
    // Build gutter
    if (state.settings.showLineNumbers) {
        // Use DocumentFragment for better performance
        const gutterFragment = document.createDocumentFragment();
        const gutterDiv = document.createElement('div');
        
        // Batch render gutter lines
        const gutterHTML = filtered.map((entry, idx) => 
            `<div class="line-number" data-line="${idx + 1}">${idx + 1}</div>`
        ).join('');
        
        gutterDiv.innerHTML = gutterHTML;
        while (gutterDiv.firstChild) {
            gutterFragment.appendChild(gutterDiv.firstChild);
        }
        
        gutter.innerHTML = '';
        gutter.appendChild(gutterFragment);
        gutter.style.display = 'block';
    } else {
        gutter.style.display = 'none';
    }
    
    // Build content with source file indicators using DocumentFragment
    const contentFragment = document.createDocumentFragment();
    const contentDiv = document.createElement('div');
    
    // Batch size for rendering (smaller batches = more responsive)
    const BATCH_SIZE = 2000;
    
    if (filtered.length > BATCH_SIZE) {
        // Render in batches for very large files
        renderInBatches(filtered, contentDiv, fileData, 0, BATCH_SIZE, () => {
            while (contentDiv.firstChild) {
                contentFragment.appendChild(contentDiv.firstChild);
            }
            content.innerHTML = '';
            content.appendChild(contentFragment);
            
            // Update stats and apply styling after rendering
            finalizeStitchedLogDisplay(fileData, filtered, content, gutter);
        });
    } else {
        // Render all at once for smaller files
        const contentHTML = filtered.map((entry, idx) => {
            const levelClass = entry.level !== 'default' ? entry.level : '';
            const highlightedLine = state.settings.highlightSearch && state.searchMatches.length > 0 
                ? highlightSearchTerms(escapeHtml(entry.raw))
                : escapeHtml(entry.raw);
            
            const fileColor = getFileColor(entry.sourceFile);
            const sourceIndicator = `<span class="source-indicator" style="background: ${fileColor};" title="${escapeHtml(entry.sourceFile)}"></span>`;
            
            return `<div class="log-line stitched-line ${levelClass}" data-line="${idx + 1}" data-source="${escapeHtml(entry.sourceFile)}">
                ${sourceIndicator}${highlightedLine || '&nbsp;'}
            </div>`;
        }).join('');
        
        contentDiv.innerHTML = contentHTML;
        while (contentDiv.firstChild) {
            contentFragment.appendChild(contentDiv.firstChild);
        }
        
        content.innerHTML = '';
        content.appendChild(contentFragment);
        
        finalizeStitchedLogDisplay(fileData, filtered, content, gutter);
    }
}

function renderInBatches(filtered, contentDiv, fileData, startIdx, batchSize, callback) {
    const endIdx = Math.min(startIdx + batchSize, filtered.length);
    
    // Render this batch - use array join for better performance
    const batchHTML = [];
    for (let i = startIdx; i < endIdx; i++) {
        const entry = filtered[i];
        const levelClass = entry.level !== 'default' ? entry.level : '';
        const highlightedLine = state.settings.highlightSearch && state.searchMatches.length > 0 
            ? highlightSearchTerms(escapeHtml(entry.raw))
            : escapeHtml(entry.raw);
        
        const fileColor = getFileColor(entry.sourceFile);
        const sourceIndicator = `<span class="source-indicator" style="background: ${fileColor};" title="${escapeHtml(entry.sourceFile)}"></span>`;
        
        batchHTML.push(`<div class="log-line stitched-line ${levelClass}" data-line="${i + 1}" data-source="${escapeHtml(entry.sourceFile)}">${sourceIndicator}${highlightedLine || '&nbsp;'}</div>`);
    }
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = batchHTML.join('');
    while (tempDiv.firstChild) {
        contentDiv.appendChild(tempDiv.firstChild);
    }
    
    // Continue with next batch or finish
    if (endIdx < filtered.length) {
        // Reduced timeout for faster rendering (1ms instead of 10ms)
        setTimeout(() => renderInBatches(filtered, contentDiv, fileData, endIdx, batchSize, callback), 1);
    } else {
        callback();
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

function displayStitchLegend(sourceFiles) {
    // Remove existing legend if any
    const existing = document.getElementById('stitchLegend');
    if (existing) existing.remove();
    
    const legend = document.createElement('div');
    legend.id = 'stitchLegend';
    legend.className = 'stitch-legend';
    legend.innerHTML = `
        <strong>📎 Source Files:</strong>
        ${sourceFiles.map(fileName => {
            const color = getFileColor(fileName);
            return `<span class="legend-item">
                <span class="legend-dot" style="background: ${color};"></span>
                ${escapeHtml(fileName)}
            </span>`;
        }).join('')}
    `;
    
    const toolbar = document.querySelector('.viewer-toolbar');
    if (toolbar) {
        toolbar.appendChild(legend);
    }
}

function getFileColor(fileName) {
    // Generate consistent colors for each file using a simple hash
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
    
    // Simple string hash
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
        const blob = new Blob([state.stitchedData.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = state.stitchedData.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Exported ${state.stitchedData.name}`, 'success');
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
    
    // Create a copy to avoid mutating original
    const sorted = [...lines];
    
    // Sort by timestamp
    sorted.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        
        // Handle entries without timestamps (put them at the end)
        if (!timeA && !timeB) return 0;
        if (!timeA) return 1;
        if (!timeB) return -1;
        
        // Sort based on order
        if (state.dateSortOrder === 'asc') {
            return timeA - timeB; // Oldest first
        } else {
            return timeB - timeA; // Newest first
        }
    });
    
    return sorted;
}

// ============================================
// Fullscreen Log Viewer Mode
// ============================================
function toggleLogViewerFullscreen() {
    const viewerPage = document.getElementById('page-viewer');
    const fullscreenBtn = document.getElementById('fullscreenToggle');
    
    if (!viewerPage) return;
    
    if (viewerPage.classList.contains('fullscreen-mode')) {
        // Exit fullscreen
        viewerPage.classList.remove('fullscreen-mode');
        document.body.classList.remove('fullscreen-active');
        fullscreenBtn.classList.remove('active');
        fullscreenBtn.title = 'Toggle fullscreen mode';
        
        // Update the SVG to "expand" icon
        fullscreenBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
        `;
        
        showToast('Exited fullscreen mode', 'info');
    } else {
        // Enter fullscreen
        viewerPage.classList.add('fullscreen-mode');
        document.body.classList.add('fullscreen-active');
        fullscreenBtn.classList.add('active');
        fullscreenBtn.title = 'Exit fullscreen mode (ESC)';
        
        // Update the SVG to "minimize" icon
        fullscreenBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
            </svg>
        `;
        
        showToast('Fullscreen mode enabled (press ESC to exit)', 'success');
        
        // Dynamically adjust log container height based on visible elements
        setTimeout(() => {
            adjustFullscreenLogHeight();
        }, 50);
    }
}

// Helper function to dynamically calculate log container height in fullscreen
function adjustFullscreenLogHeight() {
    const viewerPage = document.getElementById('page-viewer');
    const logContainer = document.querySelector('.log-container');
    
    if (!viewerPage || !logContainer || !viewerPage.classList.contains('fullscreen-mode')) {
        return;
    }
    
    // With flexbox layout, we don't need to manually calculate height
    // But we can ensure scrolling works properly
    const logContent = logContainer.querySelector('.log-content');
    const logGutter = logContainer.querySelector('.log-gutter');
    
    if (logContent) {
        logContent.style.height = '100%';
    }
    if (logGutter) {
        logGutter.style.height = '100%';
    }
}

// Add keyboard shortcut for fullscreen (ESC to exit)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
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

// ============================================
// Compare Page Fullscreen Mode
// ============================================
function toggleCompareFullscreen() {
    const comparePage = document.getElementById('page-compare');
    const fullscreenBtn = document.getElementById('compareFullscreenToggle');
    const navSidebar = document.querySelector('.nav-sidebar');
    
    if (!comparePage) return;
    
    if (comparePage.classList.contains('fullscreen-mode')) {
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
                    'rgba(220, 38, 38, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(245, 158, 11, 0.8)'
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
                borderColor: 'rgba(255, 107, 53, 1)',
                backgroundColor: 'rgba(255, 107, 53, 0.1)',
                tension: 0.4,
                fill: true
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
    
    charts.topIssues = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Occurrences',
                data: data,
                backgroundColor: 'rgba(255, 107, 53, 0.8)',
                borderWidth: 0
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
                    backgroundColor: 'rgba(220, 38, 38, 0.8)',
                    borderWidth: 0
                },
                {
                    label: 'Error',
                    data: errors,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderWidth: 0
                },
                {
                    label: 'Warning',
                    data: warnings,
                    backgroundColor: 'rgba(245, 158, 11, 0.8)',
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

function clearAllLogs() {
    // Stop live tail if active
    if (state.liveTailActive) {
        stopLiveTail();
    }
    
    const fileCount = state.files.length;
    
    // Clear all state
    state.files = [];
    state.currentFileIndex = -1;
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
    
    // Reset UI
    updateUI();
    updateFileDropdown();
    updateFilesList();
    updateCompareView();
    updateIssuesUI();
    displayLog(null);
    
    // Clear search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Clear date filters
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
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
            }
            
            // Add click handlers to existing elements instead of rebuilding
            enableTimeSyncHandlers();
            
            state.timeSyncProcessing = false;
            btn.disabled = false;
            btn.style.opacity = '1';
            
            showToast('Time Sync enabled - Click any timestamped line', 'success');
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
            
            // Clear highlights and remove handlers
            clearTimeSyncHighlights();
            disableTimeSyncHandlers();
            
            state.timeSyncProcessing = false;
            btn.disabled = false;
            btn.style.opacity = '1';
            
            showToast('Time Sync disabled', 'info');
        }, 50);
    }
}

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
        display.textContent = `±${value} second${value > 1 ? 's' : ''}`;
    }
    
    // Update preset button states
    updatePresetButtons(parseInt(value));
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
        const btnValue = parseInt(btn.textContent);
        btn.classList.toggle('active', btnValue === value);
    });
}

function syncToTimestamp(timestampStr, sourceFileIndex, sourceLine) {
    if (!state.timeSyncActive) return;
    
    // Parse the timestamp
    const targetTime = parseTimestamp(timestampStr);
    if (!targetTime) {
        showToast('Unable to parse timestamp from this line', 'warning');
        return;
    }
    
    // Clear previous highlights
    clearTimeSyncHighlights();
    
    const rangeMs = state.timeSyncRange;
    const minTime = targetTime - rangeMs;
    const maxTime = targetTime + rangeMs;
    
    let totalHighlighted = 0;
    
    // Highlight matching time ranges in all files
    document.querySelectorAll('.compare-panel').forEach((panel, panelIndex) => {
        const lines = panel.querySelectorAll('.log-line[data-timestamp]');
        let firstMatch = null;
        let fileHighlightCount = 0;
        
        lines.forEach(line => {
            const lineTimestamp = line.getAttribute('data-timestamp');
            if (lineTimestamp) {
                const lineTime = parseTimestamp(lineTimestamp);
                if (lineTime && lineTime >= minTime && lineTime <= maxTime) {
                    line.classList.add('time-sync-highlight');
                    fileHighlightCount++;
                    totalHighlighted++;
                    
                    if (!firstMatch) {
                        firstMatch = line;
                    }
                }
            }
        });
        
        // Scroll to first match in each panel
        if (firstMatch) {
            const panelContent = panel.querySelector('.compare-panel-content');
            if (panelContent) {
                // Calculate scroll position to center the line
                const lineTop = firstMatch.offsetTop;
                const panelHeight = panelContent.clientHeight;
                const scrollPos = lineTop - (panelHeight / 2);
                panelContent.scrollTop = Math.max(0, scrollPos);
            }
        }
    });
    
    // Update status display
    const statusEl = document.getElementById('timeSyncStatus');
    if (statusEl) {
        const thresholdSeconds = state.timeSyncRange / 1000;
        statusEl.innerHTML = `
            <div style="padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius-md); border-left: 3px solid var(--accent-primary);">
                <strong>Synced to:</strong> ${escapeHtml(timestampStr)}<br>
                <span style="color: var(--text-tertiary); font-size: 0.875rem;">
                    ${totalHighlighted} matching line${totalHighlighted !== 1 ? 's' : ''} found within ±${thresholdSeconds} second${thresholdSeconds !== 1 ? 's' : ''} across ${state.files.length} file${state.files.length !== 1 ? 's' : ''}
                </span>
            </div>
        `;
    }
    
    showToast(`Time sync: Found ${totalHighlighted} matching lines`, 'success');
}

function clearTimeSyncHighlights() {
    document.querySelectorAll('.time-sync-highlight').forEach(line => {
        line.classList.remove('time-sync-highlight');
    });
    
    const statusEl = document.getElementById('timeSyncStatus');
    if (statusEl) {
        statusEl.innerHTML = '';
    }
}

function parseTimestamp(timestampStr) {
    // Try various timestamp formats and convert to milliseconds since epoch
    
    // Format: 2024-01-19 14:25:30 or 2024-01-19T14:25:30
    let match = timestampStr.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/);
    if (match) {
        const [, year, month, day, hour, min, sec, ms] = match;
        return new Date(year, month - 1, day, hour, min, sec, ms || 0).getTime();
    }
    
    // Format: 19/01/2024 14:25:30
    match = timestampStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/);
    if (match) {
        const [, day, month, year, hour, min, sec, ms] = match;
        return new Date(year, month - 1, day, hour, min, sec, ms || 0).getTime();
    }
    
    // Format: 01-19-2024 14:25:30
    match = timestampStr.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/);
    if (match) {
        const [, month, day, year, hour, min, sec, ms] = match;
        return new Date(year, month - 1, day, hour, min, sec, ms || 0).getTime();
    }
    
    // Format: [14:25:30] (time only - use today's date)
    match = timestampStr.match(/\[?(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?\]?/);
    if (match) {
        const today = new Date();
        const [, hour, min, sec, ms] = match;
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, min, sec, ms || 0).getTime();
    }
    
    return null;
}