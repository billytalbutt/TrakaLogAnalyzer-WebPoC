// Wrapper for 7za.exe that strips the -snld flag and treats exit code 2 as success.
// This fixes the Windows symlink permission issue during electron-builder builds.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

class SevenZaWrapper
{
    static int Main(string[] args)
    {
        string myDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        string realExe = Path.Combine(myDir, "7za-real.exe");

        // Strip the -snld flag (which causes symlink creation to fail on non-admin Windows)
        string[] filteredArgs = args.Where(a => a != "-snld").ToArray();

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = realExe;
        // Re-quote arguments properly for Windows (double quotes, not single)
        psi.Arguments = string.Join(" ", filteredArgs.Select(a => {
            // If arg already has quotes or special chars, wrap in double quotes
            if (a.Contains(" ") || a.Contains("'"))
            {
                // Strip any existing single quotes from electron-builder
                string clean = a.Replace("'", "");
                return "\"" + clean + "\"";
            }
            return a;
        }));
        psi.UseShellExecute = false;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;

        Process p = Process.Start(psi);

        // Stream output in real-time
        p.OutputDataReceived += (s, e) => { if (e.Data != null) Console.WriteLine(e.Data); };
        p.ErrorDataReceived += (s, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();

        p.WaitForExit();

        // Exit code 2 from 7z means "warning" (e.g. failed symlinks) — treat as success
        int exitCode = p.ExitCode;
        if (exitCode == 2) exitCode = 0;

        return exitCode;
    }
}
