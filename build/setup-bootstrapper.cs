// Traka Log Analyzer — Setup Bootstrapper
// A tiny self-extracting launcher that:
// 1. Extracts the bundled app archive to a temp directory
// 2. Launches the app in --setup mode (gorgeous dark installer UI)
// 3. Waits for the installer to complete
// 4. Cleans up the temp directory
//
// This is compiled to a ~5KB exe and combined with a 7z archive
// to create the final "Traka Log Analyzer Setup 3.0.0.exe"

using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Threading;

class SetupBootstrapper
{
    static int Main(string[] args)
    {
        string appName = "Traka Log Analyzer";
        string tempBase = Path.Combine(Path.GetTempPath(), "TrakaLogAnalyzerSetup");
        string exeName = "Traka Log Analyzer.exe";

        Console.Title = appName + " Setup";

        try
        {
            // Clean up any previous setup attempt
            if (Directory.Exists(tempBase))
            {
                try { Directory.Delete(tempBase, true); } catch { }
                Thread.Sleep(500);
            }

            // Find the payload zip (should be next to this exe, or embedded)
            string myDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
            string payloadZip = Path.Combine(myDir, "app-payload.zip");

            if (!File.Exists(payloadZip))
            {
                Console.Error.WriteLine("Setup payload not found: " + payloadZip);
                Console.Error.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return 1;
            }

            // Extract to temp
            Console.WriteLine("Preparing " + appName + " Setup...");
            Directory.CreateDirectory(tempBase);
            ZipFile.ExtractToDirectory(payloadZip, tempBase);

            // Find the exe
            string setupExe = Path.Combine(tempBase, exeName);
            if (!File.Exists(setupExe))
            {
                // Try one level deeper (in case zip has a root folder)
                string[] dirs = Directory.GetDirectories(tempBase);
                if (dirs.Length == 1)
                {
                    setupExe = Path.Combine(dirs[0], exeName);
                }
            }

            if (!File.Exists(setupExe))
            {
                Console.Error.WriteLine("Application not found in extracted files.");
                Console.Error.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return 1;
            }

            // Launch the app in setup mode
            Console.WriteLine("Starting installer...");
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = setupExe;
            psi.Arguments = "--setup";
            psi.WorkingDirectory = Path.GetDirectoryName(setupExe);
            psi.UseShellExecute = false;

            Process p = Process.Start(psi);
            p.WaitForExit();

            // Clean up temp directory (best effort)
            try
            {
                Thread.Sleep(1000);
                Directory.Delete(tempBase, true);
            }
            catch
            {
                // Some files may still be locked; that's OK
            }

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Setup error: " + ex.Message);
            Console.Error.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return 1;
        }
    }
}
