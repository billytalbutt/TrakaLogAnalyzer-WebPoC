/* ============================================
   Traka Log Analyzer - Solution Cards UI
   Interactive solution cards with progress tracking
   ============================================ */

// Solution progress tracking (persists in localStorage)
const solutionProgress = {
    completedSteps: {}, // { solutionId-issueId: [1, 3, 5] } - completed step numbers
    resolvedIssues: [], // [issueId1, issueId2]
    
    // Load from localStorage
    load() {
        try {
            const saved = localStorage.getItem('traka-solution-progress');
            if (saved) {
                const data = JSON.parse(saved);
                this.completedSteps = data.completedSteps || {};
                this.resolvedIssues = data.resolvedIssues || [];
            }
        } catch (e) {
            console.error('Failed to load solution progress:', e);
        }
    },
    
    // Save to localStorage
    save() {
        try {
            localStorage.setItem('traka-solution-progress', JSON.stringify({
                completedSteps: this.completedSteps,
                resolvedIssues: this.resolvedIssues
            }));
        } catch (e) {
            console.error('Failed to save solution progress:', e);
        }
    },
    
    // Toggle step completion
    toggleStep(progressKey, stepNumber) {
        if (!this.completedSteps[progressKey]) {
            this.completedSteps[progressKey] = [];
        }
        
        const steps = this.completedSteps[progressKey];
        const index = steps.indexOf(stepNumber);
        
        if (index >= 0) {
            steps.splice(index, 1); // Remove
        } else {
            steps.push(stepNumber); // Add
        }
        
        this.save();
        return index < 0; // Return true if now checked
    },
    
    // Check if step is completed
    isStepCompleted(progressKey, stepNumber) {
        return this.completedSteps[progressKey]?.includes(stepNumber) || false;
    },
    
    // Get completion percentage
    getCompletionPercentage(progressKey, totalSteps) {
        const completed = this.completedSteps[progressKey]?.length || 0;
        return Math.round((completed / totalSteps) * 100);
    },
    
    // Mark issue as resolved
    resolveIssue(issueId) {
        if (!this.resolvedIssues.includes(issueId)) {
            this.resolvedIssues.push(issueId);
            this.save();
        }
    },
    
    // Check if issue is resolved
    isIssueResolved(issueId) {
        return this.resolvedIssues.includes(issueId);
    },
    
    // Clear progress for an issue
    clearProgress(progressKey, issueId) {
        delete this.completedSteps[progressKey];
        this.resolvedIssues = this.resolvedIssues.filter(id => id !== issueId);
        this.save();
    }
};

/**
 * Render solutions panel for issues with known solutions
 * @param {Array} issues - Array of issues with solutions
 */
function renderSolutionsPanel(issues) {
    // Filter to only issues with solutions
    const issuesWithSolutions = issues.filter(issue => issue.hasSolution);
    
    if (issuesWithSolutions.length === 0) {
        return; // No solutions to show
    }
    
    // Group by severity
    const grouped = {
        CRITICAL: issuesWithSolutions.filter(i => i.solution.severity === 'CRITICAL'),
        HIGH: issuesWithSolutions.filter(i => i.solution.severity === 'HIGH'),
        MEDIUM: issuesWithSolutions.filter(i => i.solution.severity === 'MEDIUM')
    };
    
    const totalCount = issuesWithSolutions.length;
    const criticalCount = grouped.CRITICAL.length;
    const highCount = grouped.HIGH.length;
    const mediumCount = grouped.MEDIUM.length;
    
    // Create solutions panel HTML
    const panelHTML = `
        <div class="solutions-panel" id="solutionsPanel">
            <div class="solutions-header">
                <div class="solutions-title-section">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="solutions-icon">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <div>
                        <h2>Solutions Available</h2>
                        <p>${totalCount} issue${totalCount !== 1 ? 's' : ''} detected with known solutions</p>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="exportSolutionsPDF()" title="Export solutions as beautiful PDF report">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="8" y1="13" x2="16" y2="13"></line>
                        <line x1="8" y1="17" x2="16" y2="17"></line>
                        <line x1="8" y1="9" x2="10" y2="9"></line>
                    </svg>
                    Export PDF Report
                </button>
            </div>
            
            <div class="solutions-summary">
                ${criticalCount > 0 ? `
                    <div class="summary-badge critical">
                        <span class="badge-count">${criticalCount}</span>
                        <span class="badge-label">Critical</span>
                    </div>
                ` : ''}
                ${highCount > 0 ? `
                    <div class="summary-badge high">
                        <span class="badge-count">${highCount}</span>
                        <span class="badge-label">High Priority</span>
                    </div>
                ` : ''}
                ${mediumCount > 0 ? `
                    <div class="summary-badge medium">
                        <span class="badge-count">${mediumCount}</span>
                        <span class="badge-label">Medium</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="solutions-list">
                ${renderSolutionCards(issuesWithSolutions)}
            </div>
        </div>
    `;
    
    return panelHTML;
}

/**
 * Render individual solution cards
 */
function renderSolutionCards(issues) {
    return issues.map(issue => {
        const solution = issue.solution;
        const progressKey = `${solution.id}-${issue.id}`;
        const completionPct = solutionProgress.getCompletionPercentage(progressKey, solution.steps.length);
        const isResolved = solutionProgress.isIssueResolved(issue.id);
        const isExpanded = state.expandedSolutions?.includes(issue.id) || false;
        
        const severityColors = {
            'CRITICAL': '#EF4444',
            'HIGH': '#F59E0B',
            'MEDIUM': '#EAB308',
            'LOW': '#3B82F6'
        };
        
        const severityColor = severityColors[solution.severity] || '#6B7280';
        
        return `
            <div class="solution-card ${isResolved ? 'resolved' : ''} ${isExpanded ? 'expanded' : ''}" data-issue-id="${issue.id}">
                <div class="solution-card-header" onclick="toggleSolutionCard('${issue.id}')">
                    <div class="solution-header-left">
                        <div class="severity-indicator" style="background: ${severityColor};">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                        </div>
                        <div class="solution-title-section">
                            <div class="solution-severity-badge" style="background: ${severityColor}15; color: ${severityColor}; border: 1px solid ${severityColor}40;">
                                ${solution.severity}
                            </div>
                            <h3>${escapeHtml(solution.title)}</h3>
                            <div class="solution-meta">
                                <span title="File location">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                    </svg>
                                    ${escapeHtml(issue.file)} : Line ${issue.line}
                                </span>
                                <span title="Estimated time to resolve">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                    ${solution.estimatedTime}
                                </span>
                                <span title="Category" class="category-tag">
                                    ${solution.category}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="solution-header-right">
                        <div class="completion-indicator">
                            <svg class="completion-circle" viewBox="0 0 36 36">
                                <path class="completion-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <path class="completion-fill" stroke-dasharray="${completionPct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <text x="18" y="20.5" class="completion-text">${completionPct}%</text>
                            </svg>
                        </div>
                        <button class="expand-toggle" title="${isExpanded ? 'Collapse' : 'Expand'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="solution-card-body" style="display: ${isExpanded ? 'block' : 'none'};">
                    <div class="solution-context">
                        <div class="context-item why-section">
                            <div class="context-icon">💡</div>
                            <div class="context-content">
                                <h4>Why This Happens</h4>
                                <p>${escapeHtml(solution.why)}</p>
                            </div>
                        </div>
                        
                        ${solution.prerequisites && solution.prerequisites.length > 0 ? `
                            <div class="context-item prerequisites-section">
                                <div class="context-icon">📋</div>
                                <div class="context-content">
                                    <h4>Prerequisites</h4>
                                    <ul>
                                        ${solution.prerequisites.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="solution-steps">
                        <div class="steps-header">
                            <h4>Solution Steps</h4>
                            <div class="steps-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${completionPct}%;"></div>
                                </div>
                                <span class="progress-label">${solutionProgress.completedSteps[progressKey]?.length || 0} of ${solution.steps.length} complete</span>
                            </div>
                        </div>
                        
                        <div class="steps-list">
                            ${solution.steps.map(step => renderSolutionStep(step, progressKey, issue.id)).join('')}
                        </div>
                    </div>
                    
                    <div class="solution-actions">
                        <button class="btn btn-secondary" onclick="viewIssueInLog('${issue.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            View in Log
                        </button>
                        <button class="btn btn-secondary" onclick="copySolutionSteps('${progressKey}', '${solution.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            Copy Steps
                        </button>
                        <button class="btn btn-secondary" onclick="clearSolutionProgress('${progressKey}', '${issue.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                            Reset Progress
                        </button>
                        ${!isResolved ? `
                            <button class="btn btn-success" onclick="markIssueResolved('${issue.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Mark as Resolved
                            </button>
                        ` : `
                            <button class="btn btn-secondary" onclick="markIssueUnresolved('${issue.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Mark as Unresolved
                            </button>
                        `}
                    </div>
                    
                    ${solution.relatedIssues && solution.relatedIssues.length > 0 ? `
                        <div class="related-issues">
                            <h4>💡 Fixing this may also resolve:</h4>
                            <div class="related-tags">
                                ${solution.relatedIssues.map(id => `<span class="related-tag">${id}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render individual solution step
 */
function renderSolutionStep(step, progressKey, issueId) {
    const isCompleted = solutionProgress.isStepCompleted(progressKey, step.number);
    
    return `
        <div class="solution-step ${isCompleted ? 'completed' : ''}" data-step="${step.number}">
            <div class="step-checkbox-wrapper">
                <input type="checkbox" 
                       id="step-${progressKey}-${step.number}" 
                       class="step-checkbox"
                       ${isCompleted ? 'checked' : ''}
                       onchange="toggleStepCompletion('${progressKey}', ${step.number})">
                <label for="step-${progressKey}-${step.number}" class="step-checkbox-label"></label>
            </div>
            <div class="step-number">${step.number}</div>
            <div class="step-content">
                <h5>${escapeHtml(step.title)}</h5>
                <p>${escapeHtml(step.description)}</p>
                ${step.command ? `
                    <div class="step-command">
                        <code>${escapeHtml(step.command)}</code>
                        <button class="btn-copy-command" onclick="copyToClipboard('${escapeHtml(step.command)}', 'Command copied')" title="Copy command">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Toggle solution card expanded state
 */
function toggleSolutionCard(issueId) {
    if (!state.expandedSolutions) {
        state.expandedSolutions = [];
    }
    
    const index = state.expandedSolutions.indexOf(issueId);
    if (index >= 0) {
        state.expandedSolutions.splice(index, 1);
    } else {
        state.expandedSolutions.push(issueId);
    }
    
    // Re-render solutions
    refreshSolutionsDisplay();
}

/**
 * Toggle step completion
 */
function toggleStepCompletion(progressKey, stepNumber) {
    const isNowChecked = solutionProgress.toggleStep(progressKey, stepNumber);
    
    // Play satisfying animation
    if (isNowChecked) {
        // Trigger confetti or checkmark animation
        playStepCompletionAnimation(progressKey, stepNumber);
    }
    
    // Re-render to update progress bars
    refreshSolutionsDisplay();
}

/**
 * Play step completion animation
 */
function playStepCompletionAnimation(progressKey, stepNumber) {
    const stepEl = document.querySelector(`.solution-step[data-step="${stepNumber}"]`);
    if (stepEl) {
        stepEl.classList.add('step-complete-animation');
        setTimeout(() => {
            stepEl.classList.remove('step-complete-animation');
        }, 600);
    }
}

/**
 * Mark issue as resolved
 */
function markIssueResolved(issueId) {
    solutionProgress.resolveIssue(issueId);
    showToast('Issue marked as resolved! 🎉', 'success');
    refreshSolutionsDisplay();
}

/**
 * Mark issue as unresolved
 */
function markIssueUnresolved(issueId) {
    solutionProgress.resolvedIssues = solutionProgress.resolvedIssues.filter(id => id !== issueId);
    solutionProgress.save();
    showToast('Issue marked as unresolved', 'info');
    refreshSolutionsDisplay();
}

/**
 * Clear solution progress
 */
function clearSolutionProgress(progressKey, issueId) {
    if (confirm('Are you sure you want to reset all progress for this solution?')) {
        solutionProgress.clearProgress(progressKey, issueId);
        showToast('Progress reset', 'info');
        refreshSolutionsDisplay();
    }
}

/**
 * Copy solution steps to clipboard
 */
function copySolutionSteps(progressKey, solutionId) {
    // Find the solution
    const solution = solutionDatabase.patterns.find(s => s.id === solutionId);
    if (!solution) return;
    
    // Format steps as text
    const stepsText = `
✅ Traka Solution: ${solution.title}

Category: ${solution.category}
Severity: ${solution.severity}
Estimated Time: ${solution.estimatedTime}

WHY THIS HAPPENS:
${solution.why}

${solution.prerequisites && solution.prerequisites.length > 0 ? `
PREREQUISITES:
${solution.prerequisites.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}
` : ''}

SOLUTION STEPS:
${solution.steps.map(step => `
Step ${step.number}: ${step.title}
${step.description}
${step.command ? `Command: ${step.command}` : ''}
`).join('\n')}

Generated by Traka Log Analyzer
`.trim();
    
    copyToClipboard(stepsText, 'Solution steps copied to clipboard');
}

/**
 * View issue in log viewer
 */
function viewIssueInLog(issueId) {
    // Use existing goToIssueLine function
    const issue = state.issues.find(i => i.id === issueId);
    if (issue) {
        currentIssueId = issueId;
        goToIssueLine();
    }
}

/**
 * Refresh solutions display
 */
function refreshSolutionsDisplay() {
    const container = document.getElementById('solutionsPanelContainer');
    if (!container) return;
    
    // Get issues with solutions
    const issuesWithSolutions = enrichIssuesWithSolutions(state.issues);
    
    if (issuesWithSolutions.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    
    container.innerHTML = renderSolutionsPanel(issuesWithSolutions);
    container.style.display = 'block';
}

/**
 * Initialize solutions panel on Issues page
 */
function initializeSolutionsPanel() {
    // Load progress from localStorage
    solutionProgress.load();
    
    // Create container on Issues page if it doesn't exist
    const issuesPage = document.getElementById('page-issues');
    if (issuesPage && !document.getElementById('solutionsPanelContainer')) {
        const container = document.createElement('div');
        container.id = 'solutionsPanelContainer';
        
        // Insert after issues toolbar
        const toolbar = issuesPage.querySelector('.issues-toolbar');
        if (toolbar) {
            toolbar.after(container);
        } else {
            issuesPage.insertBefore(container, issuesPage.firstChild);
        }
    }
    
    // Initial render
    refreshSolutionsDisplay();
}

// Initialize when state.expandedSolutions doesn't exist
if (!state.expandedSolutions) {
    state.expandedSolutions = [];
}
