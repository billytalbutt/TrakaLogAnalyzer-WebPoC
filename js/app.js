/* ============================================
   Traka Log Analyzer - Web PoC
   JavaScript Application
   ============================================ */

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
        customPatterns: []
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
}

function initFileInputs() {
    const viewerInput = document.getElementById('viewerFileInput');
    const compareInput = document.getElementById('compareFileInput');
    
    if (viewerInput) {
        viewerInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
    
    if (compareInput) {
        compareInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
}

function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (file.name.endsWith('.log') || file.name.endsWith('.txt')) {
            loadFile(file);
        } else {
            showToast(`Skipped ${file.name} - only .log and .txt files supported`, 'warning');
        }
    });
}

function loadFile(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const content = e.target.result;
        const fileData = {
            name: file.name,
            size: file.size,
            lastModified: new Date(file.lastModified),
            content: content,
            lines: content.split('\n')
        };
        
        // Check if file already loaded
        const existingIndex = state.files.findIndex(f => f.name === file.name);
        if (existingIndex >= 0) {
            state.files[existingIndex] = fileData;
        } else {
            state.files.push(fileData);
        }
        
        // Parse and analyze
        parseLogFile(fileData);
        detectIssues(fileData);
        
        // Update UI
        updateUI();
        updateFileDropdown();
        updateFilesList();
        updateCompareView();
        
        // Auto-select first file
        if (state.currentFileIndex === -1) {
            state.currentFileIndex = 0;
            displayLog(state.files[0]);
        }
        
        // Navigate to viewer for better UX
        navigateTo('viewer');
        
        showToast(`Loaded ${file.name} (${formatFileSize(file.size)})`, 'success');
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
    const filteredLines = filterLines(parsed);
    
    // Build gutter
    if (state.settings.showLineNumbers) {
        gutter.innerHTML = filteredLines.map(entry => 
            `<div class="line-number" data-line="${entry.lineNumber}">${entry.lineNumber}</div>`
        ).join('');
        gutter.style.display = 'block';
    } else {
        gutter.style.display = 'none';
    }
    
    // Build content
    content.innerHTML = filteredLines.map(entry => {
        const levelClass = entry.level !== 'default' ? entry.level : '';
        const highlightedLine = state.settings.highlightSearch && state.searchMatches.length > 0 
            ? highlightSearchTerms(escapeHtml(entry.raw))
            : escapeHtml(entry.raw);
        
        return `<div class="log-line ${levelClass}" data-line="${entry.lineNumber}">${highlightedLine || '&nbsp;'}</div>`;
    }).join('');
    
    // Update stats
    updateViewerStats(fileData, filteredLines.length);
    
    // Apply font size
    content.style.fontSize = `${state.settings.fontSize}px`;
    gutter.style.fontSize = `${state.settings.fontSize}px`;
    
    // Apply word wrap
    content.style.whiteSpace = state.settings.wordWrap ? 'pre-wrap' : 'pre';
}

function filterLines(parsed) {
    let filtered = parsed;
    
    // Level filter
    if (state.activeFilter !== 'all') {
        filtered = filtered.filter(entry => entry.level === state.activeFilter);
    }
    
    // Date filter
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    
    if (dateFrom || dateTo) {
        filtered = filtered.filter(entry => {
            if (!entry.timestamp) return true;
            const entryDate = new Date(entry.timestamp);
            if (dateFrom && entryDate < new Date(dateFrom)) return false;
            if (dateTo && entryDate > new Date(dateTo)) return false;
            return true;
        });
    }
    
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
        if (state.currentFileIndex >= 0) {
            displayLog(state.files[state.currentFileIndex]);
        }
    });
    
    document.getElementById('dateTo')?.addEventListener('change', () => {
        if (state.currentFileIndex >= 0) {
            displayLog(state.files[state.currentFileIndex]);
        }
    });
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
function updateCompareView() {
    const container = document.getElementById('compareContainer');
    
    if (state.files.length < 1) {
        container.innerHTML = `
            <div class="compare-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="7" height="18" rx="1"></rect>
                    <rect x="14" y="3" width="7" height="18" rx="1"></rect>
                </svg>
                <p>No logs loaded for comparison</p>
                <span>Load two or more log files to compare them side by side</span>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.files.map((file, index) => `
        <div class="compare-panel" data-index="${index}">
            <div class="compare-panel-header">
                <h4>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    ${escapeHtml(file.name)}
                </h4>
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
                    return `<div class="log-line ${levelClass}" data-line="${lineIdx + 1}">${escapeHtml(line) || '&nbsp;'}</div>`;
                }).join('')}
            </div>
        </div>
    `).join('');
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

function highlightDifferences() {
    // Simple difference highlighting - marks lines that are unique to each file
    if (state.files.length < 2) {
        showToast('Need at least 2 files to compare', 'warning');
        return;
    }
    
    const allLines = state.files.map(f => new Set(f.lines.map(l => l.trim())));
    
    document.querySelectorAll('.compare-panel').forEach((panel, fileIndex) => {
        const lines = panel.querySelectorAll('.log-line');
        const otherFiles = allLines.filter((_, idx) => idx !== fileIndex);
        
        lines.forEach((lineEl, lineIdx) => {
            const lineText = state.files[fileIndex].lines[lineIdx]?.trim();
            const isUnique = !otherFiles.some(set => set.has(lineText));
            
            if (isUnique && lineText) {
                lineEl.classList.add('highlight');
            } else {
                lineEl.classList.remove('highlight');
            }
        });
    });
    
    showToast('Unique lines highlighted in each file', 'info');
}

function removeFile(index) {
    const fileName = state.files[index].name;
    state.files.splice(index, 1);
    state.parsedLogs.delete(fileName);
    state.issues = state.issues.filter(i => i.file !== fileName);
    
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
    
    container.innerHTML = state.files.map((file, index) => `
        <div class="file-item">
            <div class="file-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <div>
                    <div class="file-name">${escapeHtml(file.name)}</div>
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
    `).join('');
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
