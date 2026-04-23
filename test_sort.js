const files = [
  { engineType: 'Business Engine', originalName: 'Debugging_Log_20260304.txt', lastModified: new Date('2026-03-04') },
  { engineType: 'Business Engine', originalName: 'Debugging_Log_20260225.txt', lastModified: new Date('2026-02-25') },
  { engineType: 'Business Engine', originalName: 'Debugging_Log_20260213.txt', lastModified: new Date('2026-02-13') },
  { engineType: 'Business Engine', originalName: 'Debugging_Log_20260223.txt', lastModified: new Date('2026-02-23') },
  { engineType: 'Business Engine', originalName: 'Debugging_Log.txt.20260213', lastModified: new Date('2026-02-13') },
  { engineType: 'Business Engine', originalName: 'Debugging_Log.txt.20260223', lastModified: new Date('2026-02-23') },
];

function sortFilesForCompare(files) {
    const order = { 'Business Engine': 1 };
    
    return files.sort((a, b) => {
        const orderA = order[a.engineType] || 999;
        const orderB = order[b.engineType] || 999;
        
        if (orderA !== orderB) return orderA - orderB;
        
        const originalA = (a.originalName || a.name || '').toLowerCase();
        const originalB = (b.originalName || b.name || '').toLowerCase();
        
        const hasDateA = /\.(?:txt|log)\.([^.]+)$/i.test(originalA) || /[_-](\d+)\.(?:txt|log|cfg)$/i.test(originalA);
        const hasDateB = /\.(?:txt|log)\.([^.]+)$/i.test(originalB) || /[_-](\d+)\.(?:txt|log|cfg)$/i.test(originalB);
        
        if (!hasDateA && hasDateB) return -1;
        if (hasDateA && !hasDateB) return 1;
        
        const extractDate = (filename) => {
            let match = filename.match(/\.(?:txt|log)\.(\d{8})$/i) || filename.match(/[_-](\d{8})\.(?:txt|log|cfg)$/i);
            if (match) {
                const year = parseInt(match[1].substring(0, 4), 10);
                const month = parseInt(match[1].substring(4, 6), 10);
                const day = parseInt(match[1].substring(6, 8), 10);
                return new Date(year, month - 1, day).getTime();
            }
            match = filename.match(/\.(?:txt|log)\.(\d{4}-\d{2}-\d{2})$/i) || filename.match(/[_-](\d{4}-\d{2}-\d{2})\.(?:txt|log|cfg)$/i);
            if (match) {
                return new Date(match[1]).getTime();
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

const sorted = sortFilesForCompare(files);
for (const f of sorted) {
  console.log(f.originalName);
}
