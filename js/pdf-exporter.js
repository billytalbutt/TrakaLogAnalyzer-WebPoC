/* ============================================
   Traka Log Analyzer - PDF Report Exporter
   Beautiful, professional PDF reports with jsPDF
   ============================================ */

/**
 * Export solutions as a beautiful PDF report
 */
async function exportSolutionsPDF() {
    showToast('Generating PDF report...', 'info');
    
    try {
        // Check if jsPDF is available
        if (typeof jspdf === 'undefined') {
            throw new Error('PDF library not loaded. Please refresh the page.');
        }
        
        const { jsPDF } = jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        // Get issues with solutions
        const issuesWithSolutions = enrichIssuesWithSolutions(state.issues);
        
        if (issuesWithSolutions.length === 0) {
            showToast('No solutions to export', 'warning');
            return;
        }
        
        // Page settings
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);
        let yPos = margin;
        
        // Helper function to add new page if needed
        function checkPageBreak(requiredSpace) {
            if (yPos + requiredSpace > pageHeight - margin) {
                doc.addPage();
                yPos = margin;
                addPageFooter();
                return true;
            }
            return false;
        }
        
        // Helper function to add page footer
        function addPageFooter() {
            const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
            const totalPages = doc.internal.getNumberOfPages();
            
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Traka Log Analysis Report | Page ${pageNum}`, margin, pageHeight - 10);
            doc.text(new Date().toLocaleString(), pageWidth - margin, pageHeight - 10, { align: 'right' });
        }
        
        // Page 1: Title Page
        doc.setFillColor(255, 107, 53); // Traka orange
        doc.rect(0, 0, pageWidth, 60, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(32);
        doc.setFont('helvetica', 'bold');
        doc.text('TRAKA', pageWidth / 2, 25, { align: 'center' });
        
        doc.setFontSize(20);
        doc.setFont('helvetica', 'normal');
        doc.text('Log Analysis Report', pageWidth / 2, 38, { align: 'center' });
        
        doc.setFontSize(12);
        doc.text('Troubleshooting Guide with Solutions', pageWidth / 2, 50, { align: 'center' });
        
        yPos = 80;
        
        // Report metadata
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Generated:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(new Date().toLocaleString(), margin + 35, yPos);
        
        yPos += 10;
        doc.setFont('helvetica', 'bold');
        doc.text('Analyzed Files:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(`${state.files.length} log file${state.files.length !== 1 ? 's' : ''}`, margin + 35, yPos);
        
        yPos += 10;
        doc.setFont('helvetica', 'bold');
        doc.text('Time Range:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        const oldestFile = state.files.reduce((oldest, file) => 
            file.lastModified < oldest.lastModified ? file : oldest, state.files[0]);
        const newestFile = state.files.reduce((newest, file) => 
            file.lastModified > newest.lastModified ? file : newest, state.files[0]);
        doc.text(`${oldestFile.lastModified.toLocaleDateString()} - ${newestFile.lastModified.toLocaleDateString()}`, margin + 35, yPos);
        
        // Summary section
        yPos += 25;
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(margin, yPos, contentWidth, 40, 3, 3, 'F');
        
        yPos += 10;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('SUMMARY', margin + 5, yPos);
        
        yPos += 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        // Count by severity
        const criticalCount = issuesWithSolutions.filter(i => i.solution.severity === 'CRITICAL').length;
        const highCount = issuesWithSolutions.filter(i => i.solution.severity === 'HIGH').length;
        const mediumCount = issuesWithSolutions.filter(i => i.solution.severity === 'MEDIUM').length;
        
        doc.setTextColor(239, 68, 68); // Red for critical
        doc.text(`● ${criticalCount} Critical Issue${criticalCount !== 1 ? 's' : ''} Requiring Immediate Attention`, margin + 10, yPos);
        
        yPos += 7;
        doc.setTextColor(245, 158, 11); // Orange for high
        doc.text(`● ${highCount} High Priority Issue${highCount !== 1 ? 's' : ''}`, margin + 10, yPos);
        
        yPos += 7;
        doc.setTextColor(234, 179, 8); // Yellow for medium
        doc.text(`● ${mediumCount} Medium Priority Issue${mediumCount !== 1 ? 's' : ''}`, margin + 10, yPos);
        
        // Most critical findings
        yPos += 15;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('MOST CRITICAL FINDINGS:', margin + 5, yPos);
        
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const topIssues = issuesWithSolutions
            .sort((a, b) => {
                const severityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2 };
                return severityOrder[a.solution.severity] - severityOrder[b.solution.severity];
            })
            .slice(0, 5);
        
        topIssues.forEach((issue, index) => {
            doc.text(`${index + 1}. ${issue.solution.title}`, margin + 10, yPos);
            yPos += 7;
        });
        
        addPageFooter();
        
        // Pages 2+: Detailed Solutions
        issuesWithSolutions.forEach((issue, issueIndex) => {
            const solution = issue.solution;
            
            // Start each issue on a new page
            doc.addPage();
            yPos = margin;
            
            // Issue header with colored background
            const severityColors = {
                'CRITICAL': [239, 68, 68],
                'HIGH': [245, 158, 11],
                'MEDIUM': [234, 179, 8]
            };
            const color = severityColors[solution.severity] || [107, 114, 128];
            
            doc.setFillColor(...color);
            doc.rect(0, yPos, pageWidth, 25, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text(`ISSUE #${issueIndex + 1}`, margin, yPos + 10);
            
            doc.setFontSize(10);
            doc.text(solution.severity, pageWidth - margin, yPos + 10, { align: 'right' });
            
            doc.setFontSize(14);
            doc.text(solution.title, margin, yPos + 19);
            
            yPos += 35;
            
            // Location section
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(100, 100, 100);
            doc.text('📍 LOCATION', margin, yPos);
            
            yPos += 7;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            doc.text(`File: ${issue.file}`, margin + 5, yPos);
            
            yPos += 6;
            doc.text(`Line: ${issue.line}`, margin + 5, yPos);
            
            yPos += 6;
            doc.text(`Timestamp: ${issue.timestamp || 'N/A'}`, margin + 5, yPos);
            
            yPos += 12;
            
            // Log message box
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(100, 100, 100);
            doc.text('📋 LOG MESSAGE', margin, yPos);
            
            yPos += 5;
            doc.setFillColor(245, 247, 250);
            const messageHeight = 15;
            doc.roundedRect(margin, yPos, contentWidth, messageHeight, 2, 2, 'F');
            
            doc.setFont('courier', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(30, 30, 30);
            
            const messageLines = doc.splitTextToSize(issue.content, contentWidth - 10);
            doc.text(messageLines.slice(0, 2), margin + 5, yPos + 5);
            
            yPos += messageHeight + 10;
            
            // What this means
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text('💡 WHAT THIS MEANS', margin, yPos);
            
            yPos += 7;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            doc.setFontSize(9);
            const whyLines = doc.splitTextToSize(solution.why, contentWidth - 5);
            doc.text(whyLines, margin + 5, yPos);
            yPos += (whyLines.length * 5) + 8;
            
            checkPageBreak(20);
            
            // Prerequisites (if any)
            if (solution.prerequisites && solution.prerequisites.length > 0) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.text('⚠️ PREREQUISITES', margin, yPos);
                
                yPos += 7;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(50, 50, 50);
                doc.setFontSize(9);
                
                solution.prerequisites.forEach(prereq => {
                    checkPageBreak(10);
                    doc.text(`• ${prereq}`, margin + 5, yPos);
                    yPos += 5;
                });
                
                yPos += 5;
            }
            
            checkPageBreak(20);
            
            // Solution steps
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30, 30, 30);
            doc.text('✅ SOLUTION STEPS', margin, yPos);
            
            yPos += 10;
            
            solution.steps.forEach((step, stepIndex) => {
                checkPageBreak(35);
                
                // Step number circle
                doc.setFillColor(59, 130, 246);
                doc.circle(margin + 3, yPos - 2, 4, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text(step.number.toString(), margin + 3, yPos + 1, { align: 'center' });
                
                // Step title
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(30, 30, 30);
                doc.text(`Step ${step.number}: ${step.title}`, margin + 10, yPos);
                
                yPos += 6;
                
                // Step description
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(60, 60, 60);
                const descLines = doc.splitTextToSize(step.description, contentWidth - 15);
                doc.text(descLines, margin + 10, yPos);
                yPos += (descLines.length * 5);
                
                // Command (if any)
                if (step.command) {
                    yPos += 3;
                    doc.setFillColor(240, 240, 240);
                    doc.roundedRect(margin + 10, yPos, contentWidth - 15, 8, 1, 1, 'F');
                    doc.setFont('courier', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(200, 50, 50);
                    doc.text(step.command, margin + 12, yPos + 5);
                    yPos += 10;
                }
                
                yPos += 5;
            });
            
            checkPageBreak(15);
            
            // Estimated time and category
            yPos += 5;
            doc.setFillColor(250, 250, 250);
            doc.roundedRect(margin, yPos, contentWidth, 12, 2, 2, 'F');
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(80, 80, 80);
            doc.text(`⏱️ Estimated Time: ${solution.estimatedTime}`, margin + 5, yPos + 5);
            doc.text(`📂 Category: ${solution.category}`, margin + 5, yPos + 9);
            
            yPos += 20;
            
            // Related issues (if any)
            if (solution.relatedIssues && solution.relatedIssues.length > 0) {
                checkPageBreak(20);
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.text('🔗 RELATED ISSUES', margin, yPos);
                
                yPos += 7;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(60, 60, 60);
                doc.text('Resolving this issue may also fix:', margin + 5, yPos);
                
                yPos += 5;
                solution.relatedIssues.forEach(relatedId => {
                    doc.text(`• ${relatedId}`, margin + 10, yPos);
                    yPos += 5;
                });
            }
            
            addPageFooter();
        });
        
        // Last page: Quick Reference
        doc.addPage();
        yPos = margin;
        
        doc.setFillColor(59, 130, 246);
        doc.rect(0, yPos, pageWidth, 15, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('QUICK REFERENCE', pageWidth / 2, yPos + 10, { align: 'center' });
        
        yPos += 25;
        
        // Emergency contacts section
        doc.setFontSize(12);
        doc.setTextColor(30, 30, 30);
        doc.text('📞 SUPPORT CONTACTS', margin, yPos);
        
        yPos += 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text('Traka Support: support@traka.com', margin + 5, yPos);
        yPos += 7;
        doc.text('Phone: +44 (0)1480 414204', margin + 5, yPos);
        yPos += 7;
        doc.text('Web: https://www.traka.com/support', margin + 5, yPos);
        
        yPos += 15;
        
        // Common commands
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('💻 COMMON COMMANDS', margin, yPos);
        
        yPos += 10;
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        
        const commands = [
            { cmd: 'services.msc', desc: 'Open Windows Services' },
            { cmd: 'certlm.msc', desc: 'Manage Local Machine Certificates' },
            { cmd: 'eventvwr.msc', desc: 'Open Windows Event Viewer' },
            { cmd: 'iisreset', desc: 'Restart IIS' },
            { cmd: 'ping [IP]', desc: 'Test network connectivity' },
            { cmd: 'Test-NetConnection [IP] -Port [PORT]', desc: 'Test port connectivity (PowerShell)' }
        ];
        
        commands.forEach(({ cmd, desc }) => {
            checkPageBreak(10);
            doc.text(cmd, margin + 5, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(`- ${desc}`, margin + 60, yPos);
            doc.setFont('courier', 'normal');
            yPos += 7;
        });
        
        addPageFooter();
        
        // Update total pages on first page footer
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            const pageNum = i;
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Traka Log Analysis Report | Page ${pageNum} of ${totalPages}`, margin, pageHeight - 10);
        }
        
        // Save the PDF
        const filename = `Traka_Log_Analysis_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
        
        showToast('PDF report generated successfully! 📄', 'success');
        
    } catch (error) {
        console.error('PDF generation error:', error);
        showToast(`Failed to generate PDF: ${error.message}`, 'error');
    }
}

/**
 * Load jsPDF library if not already loaded
 */
function ensureJsPDFLoaded() {
    return new Promise((resolve, reject) => {
        if (typeof jspdf !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load jsPDF library'));
        document.head.appendChild(script);
    });
}
