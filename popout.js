// Traka Log Analyzer - Popout Window Script

let state = {
    panelIndex: -1,
    file: null,
    highlightRules: [],
    timeSyncActive: false,
    timeSyncLastTarget: null,
    timeSyncBounds: null,
    timeSyncNearestLines: null,
    timeSyncOffsets: null,
    liveTailActive: false,
    lastRenderedStart: -1,
    lastRenderedEnd: -1,
    lineHeight: 20,
    overscan: 150,
    isScrollingFromSync: false
};

const elements = {
    fileNameDisplay: document.getElementById('fileNameDisplay'),
    panelContent: document.getElementById('popoutPanelContent'),
    spacer: document.getElementById('virtualScrollSpacer'),
    viewport: document.getElementById('virtualScrollViewport')
};

// ============================================
// IPC Initialization
// ============================================

if (window.electronAPI) {
    window.electronAPI.onInitPopout(async (data) => {
        state.panelIndex = data.panelIndex;
        state.file = data.fileData; // Lightweight file object
        
        // Load state
        const s = data.stateData;
        state.highlightRules = s.highlightRules || [];
        state.timeSyncActive = s.timeSyncActive || false;
        state.timeSyncLastTarget = s.timeSyncLastTarget || null;
        state.liveTailActive = s.liveTailActive || false;
        
        document.title = `${state.file.name} - Traka Log Analyzer`;
        elements.fileNameDisplay.textContent = "Loading file content...";
        
        // Fetch full content using the file path
        if (state.file.path) {
            try {
                const result = await window.electronAPI.readLogFile(state.file.path);
                if (result.success) {
                    state.file.content = result.content;
                    state.file.lines = result.content.split(/\r?\n/);
                    elements.fileNameDisplay.textContent = state.file.originalName || state.file.name;
                    
                    initVirtualScroll();
                    
                    // Restore scroll position
                    if (s.currentScrollPos) {
                        elements.panelContent.scrollTop = s.currentScrollPos;
                    }
                } else {
                    elements.fileNameDisplay.textContent = "Error loading file: " + result.error;
                }
            } catch (err) {
                elements.fileNameDisplay.textContent = "Error loading file: " + err.message;
            }
        } else if (state.file.content) {
            // Fallback: the content string was passed directly via IPC
            state.file.lines = state.file.content.split(/\r?\n/);
            elements.fileNameDisplay.textContent = state.file.originalName || state.file.name;
            
            initVirtualScroll();
            
            if (s.currentScrollPos) {
                elements.panelContent.scrollTop = s.currentScrollPos;
            }
        } else {
            elements.fileNameDisplay.textContent = "No file data available for: " + state.file.name;
        }
    });

    window.electronAPI.onSyncEvent((type, data) => {
        if (type === 'time-sync') {
            state.timeSyncActive = true;
            state.timeSyncLastTarget = {
                timestampStr: data.timestampStr,
                targetTime: data.targetTime,
                minTime: data.targetTime - (data.range || 30000), // Default 30s if not passed
                maxTime: data.targetTime + (data.range || 30000),
                sourceFileIndex: data.sourceFileIndex,
                sourceLine: data.sourceLine
            };
            state.timeSyncBounds = data.bounds;
            state.timeSyncNearestLines = data.nearestLines;
            state.timeSyncOffsets = data.offsets;
            
            // Apply sync
            state.isScrollingFromSync = true;
            if (state.timeSyncOffsets && state.timeSyncOffsets[state.panelIndex] !== undefined) {
                elements.panelContent.scrollTop = state.timeSyncOffsets[state.panelIndex];
            }
            state.lastRenderedStart = -1;
            updateViewport(true);
            setTimeout(() => { state.isScrollingFromSync = false; }, 100);
            
        } else if (type === 'time-sync-clear') {
            state.timeSyncActive = false;
            state.timeSyncLastTarget = null;
            state.timeSyncBounds = null;
            state.timeSyncNearestLines = null;
            state.timeSyncOffsets = null;
            state.lastRenderedStart = -1;
            updateViewport(true);
            
        } else if (type === 'scroll-sync') {
            if (state.timeSyncActive && state.timeSyncOffsets && state.timeSyncOffsets[state.panelIndex] !== undefined) {
                state.isScrollingFromSync = true;
                elements.panelContent.scrollTop = state.timeSyncOffsets[state.panelIndex] + data.delta;
                setTimeout(() => { state.isScrollingFromSync = false; }, 50);
            }
        }
    });

    window.electronAPI.onFileTailUpdate && window.electronAPI.onFileTailUpdate((data) => {
        if (state.liveTailActive && state.file && (data.path === state.file.path || data.name === state.file.name)) {
            const newLines = data.newContent.split(/\r?\n/).filter(line => line.trim());
            if (newLines.length > 0) {
                // Auto scroll check
                const isAtBottom = elements.panelContent.scrollHeight - elements.panelContent.scrollTop <= elements.panelContent.clientHeight + 50;
                
                state.file.lines.push(...newLines);
                state.file.size = data.newOffset;
                elements.spacer.style.height = `${state.file.lines.length * state.lineHeight}px`;
                
                if (isAtBottom) {
                    elements.panelContent.scrollTop = elements.panelContent.scrollHeight;
                } else {
                    updateViewport();
                }
            }
        }
    });

    window.electronAPI.onFileTailReset && window.electronAPI.onFileTailReset((data) => {
        if (state.liveTailActive && state.file && (data.path === state.file.path || data.name === state.file.name)) {
            state.file.content = data.content;
            state.file.lines = data.content.split(/\r?\n/);
            state.file.size = data.newOffset;
            elements.spacer.style.height = `${state.file.lines.length * state.lineHeight}px`;
            state.lastRenderedStart = -1;
            updateViewport(true);
        }
    });
}

function snapBack() {
    if (window.electronAPI) {
        window.electronAPI.closePopout(state.panelIndex);
    } else {
        window.close();
    }
}

// ============================================
// Virtual Scroll & Rendering
// ============================================

function initVirtualScroll() {
    if (!state.file || !state.file.lines) return;
    elements.spacer.style.height = `${state.file.lines.length * state.lineHeight}px`;
    updateViewport(true);
}

function handleScroll(event) {
    updateViewport();
    
    // Broadcast scroll if we're synced
    if (!state.isScrollingFromSync && state.timeSyncActive && state.timeSyncOffsets && state.timeSyncOffsets[state.panelIndex] !== undefined) {
        const delta = elements.panelContent.scrollTop - state.timeSyncOffsets[state.panelIndex];
        if (window.electronAPI) {
            window.electronAPI.broadcastSync('scroll-sync', { sourceIndex: state.panelIndex, delta });
        }
    }
}

function updateViewport(force = false) {
    if (!state.file || !state.file.lines) return;

    const scrollTop = elements.panelContent.scrollTop;
    const clientHeight = elements.panelContent.clientHeight || window.innerHeight;

    const visibleStart = Math.floor(scrollTop / state.lineHeight);
    const visibleEnd = Math.ceil((scrollTop + clientHeight) / state.lineHeight);

    if (!force && state.lastRenderedStart >= 0) {
        const safeTop = state.lastRenderedStart + state.overscan * 0.4;
        const safeBot = state.lastRenderedEnd - state.overscan * 0.4;
        if (visibleStart >= safeTop && visibleEnd <= safeBot) {
            return;
        }
    }

    const startIdx = Math.max(0, visibleStart - state.overscan);
    const endIdx = Math.min(state.file.lines.length, visibleEnd + state.overscan);

    state.lastRenderedStart = startIdx;
    state.lastRenderedEnd = endIdx;

    const html = [];
    const timeSyncActive = state.timeSyncActive;
    const tsTarget = state.timeSyncActive ? state.timeSyncLastTarget : null;

    for (let i = startIdx; i < endIdx; i++) {
        const line = state.file.lines[i];
        const level = detectLogLevel(line);
        let levelClass = level !== 'default' ? level : '';
        const timestamp = extractTimestamp(line);
        const timestampAttr = timestamp ? ` data-timestamp="${timestamp}"` : '';

        // Time Sync Classes
        let tsClass = '';
        if (timeSyncActive && tsTarget) {
            let isDimmed = false;
            let isHighlight = false;
            let isNearest = false;
            let isSource = false;

            const bounds = state.timeSyncBounds ? state.timeSyncBounds[state.panelIndex] : null;
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
                    const isTargetMatch = (!isSource && state.timeSyncNearestLines && state.timeSyncNearestLines[state.panelIndex] === i);
                    
                    if (state.panelIndex === tsTarget.sourceFileIndex && i + 1 === tsTarget.sourceLine) {
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
            ? applyHighlightRules(line, state.file.name)
            : escapeHtml(line);

        html.push(`<div class="log-line ${levelClass}${tsClass}" data-line="${i + 1}"${timestampAttr}>${displayLine || '&nbsp;'}</div>`);
    }

    elements.viewport.innerHTML = html.join('');
    elements.viewport.style.transform = `translateY(${startIdx * state.lineHeight}px)`;
}

// ============================================
// Helpers reused from app.js
// ============================================

const logLevelErrorRegex = /\b(error|fatal|critical|exception|failed)\b/i;
const logLevelWarnRegex = /\b(warning|warn)\b/i;
const logLevelDebugRegex = /\b(debug|trace|verbose)\b/i;
const logLevelInfoRegex = /\b(info|information)\b/i;

function detectLogLevel(line) {
    if (!line) return 'default';
    if (logLevelErrorRegex.test(line)) return 'error';
    if (logLevelWarnRegex.test(line)) return 'warning';
    if (logLevelDebugRegex.test(line)) return 'debug';
    if (logLevelInfoRegex.test(line)) return 'info';
    return 'default';
}

const timestampPatterns = [
    /\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\b/,
    /\b\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\b/,
    /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\b/,
    /\[?\b\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\b\]?/
];

function extractTimestamp(line) {
    if (!line || !/\d/.test(line)) return null;
    for (const regex of timestampPatterns) {
        const match = line.match(regex);
        if (match) return match[0];
    }
    return null;
}

function parseTimestamp(timestampStr) {
    const parseMs = (msStr) => msStr ? parseFloat("0." + msStr) * 1000 : 0;
    
    let match = timestampStr.match(/(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?/);
    if (match) return new Date(match[1], match[2] - 1, match[3], match[4], match[5], match[6]).getTime() + parseMs(match[7]);
    
    match = timestampStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?/);
    if (match) return new Date(match[3], match[2] - 1, match[1], match[4], match[5], match[6]).getTime() + parseMs(match[7]);
    
    match = timestampStr.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?/);
    if (match) return new Date(match[3], match[1] - 1, match[2], match[4], match[5], match[6]).getTime() + parseMs(match[7]);
    
    match = timestampStr.match(/\[?(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?\]?/);
    if (match) {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), match[1], match[2], match[3]).getTime() + parseMs(match[4]);
    }
    
    const fallbackTime = Date.parse(timestampStr);
    return isNaN(fallbackTime) ? null : fallbackTime;
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyHighlightRules(line, fileName) {
    if (!state.highlightRules || state.highlightRules.length === 0) return escapeHtml(line);
    
    let isMatched = false;
    let matchColor = '';
    let matchBg = '';
    let isBold = false;
    
    for (const rule of state.highlightRules) {
        if (!rule.active) continue;
        
        const isTargetFile = rule.targetFiles === 'all' || 
                           (rule.targetFiles === 'current' && rule.specificFileName === fileName);
                           
        if (!isTargetFile) continue;
        
        let matches = false;
        
        try {
            if (rule.useRegex) {
                const regex = new RegExp(rule.pattern, rule.matchCase ? '' : 'i');
                matches = regex.test(line);
            } else {
                if (rule.matchCase) {
                    matches = line.includes(rule.pattern);
                } else {
                    matches = line.toLowerCase().includes(rule.pattern.toLowerCase());
                }
            }
        } catch (e) {
            console.error('Invalid regex in highlight rule', e);
        }
        
        if (matches) {
            isMatched = true;
            matchColor = rule.color || 'var(--text-primary)';
            matchBg = rule.background || 'transparent';
            isBold = rule.bold || false;
            break; 
        }
    }
    
    const escapedLine = escapeHtml(line);
    
    if (isMatched) {
        const style = `color: ${matchColor} !important; background-color: ${matchBg} !important; ${isBold ? 'font-weight: bold !important;' : ''}`;
        return `<span style="${style}" class="highlight-rule-match">${escapedLine}</span>`;
    }
    
    return escapedLine;
}