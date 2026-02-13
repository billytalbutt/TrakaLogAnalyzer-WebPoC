/**
 * Traka Log Analyzer — Installer Build Script
 * 
 * Wraps electron-builder to handle the Windows symlink permission issue
 * with the winCodeSign cache extraction. Monkey-patches child_process.spawn
 * to strip the -snld flag from 7za.exe calls (which tries to create macOS
 * symlinks that are irrelevant on Windows and fail without admin/dev mode).
 */

const { spawn: originalSpawn } = require('child_process');
const childProcess = require('child_process');
const path = require('path');

// Monkey-patch spawn to intercept 7za.exe calls
childProcess.spawn = function patchedSpawn(command, args, options) {
    // If this is a 7za call with -snld, strip the flag
    if (command && command.includes('7za') && Array.isArray(args) && args.includes('-snld')) {
        args = args.filter(a => a !== '-snld');
        console.log('  [build-installer] Stripped -snld flag from 7za call');
    }
    return originalSpawn.call(this, command, args, options);
};

// Also patch execFile and execFileSync (used in some code paths)
const { execFile: originalExecFile } = childProcess;
childProcess.execFile = function patchedExecFile(file, args, options, callback) {
    if (file && file.includes('7za') && Array.isArray(args) && args.includes('-snld')) {
        args = args.filter(a => a !== '-snld');
        console.log('  [build-installer] Stripped -snld flag from 7za execFile call');
    }
    return originalExecFile.call(this, file, args, options, callback);
};

// Set environment to skip code signing (we don't have a certificate)
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

console.log('');
console.log('  ============================================');
console.log('   Traka Log Analyzer — Installer Builder');
console.log('   Building Windows NSIS installer...');
console.log('  ============================================');
console.log('');

// Run electron-builder programmatically
const builder = require('electron-builder');

builder.build({
    targets: builder.Platform.WINDOWS.createTarget('nsis'),
    config: {
        // Config is loaded from package.json "build" field
    }
}).then(() => {
    console.log('');
    console.log('  ============================================');
    console.log('   BUILD SUCCESSFUL');
    console.log('  ============================================');
    console.log('');
    
    // Find the output file
    const fs = require('fs');
    const distDir = path.join(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir).filter(f => f.endsWith('.exe'));
        files.forEach(f => {
            const size = (fs.statSync(path.join(distDir, f)).size / (1024 * 1024)).toFixed(1);
            console.log(`   ${f} (${size} MB)`);
        });
    }
    console.log('');
}).catch(err => {
    console.error('');
    console.error('  BUILD FAILED:', err.message || err);
    console.error('');
    process.exit(1);
});
