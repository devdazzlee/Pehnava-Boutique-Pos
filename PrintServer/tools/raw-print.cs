// Pehnava Print Server — send RAW bytes (EPL/ZPL) to a Windows printer queue.
// Build: tools/build-rawprint.bat (uses built-in .NET Framework csc.exe)
using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class RawPrint
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DOCINFO
    {
        public string pDocName;
        public string pOutputFile;
        public string pDatatype;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "OpenPrinterW")]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "StartDocPrinterW")]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    private static int Send(string printerName, byte[] data)
    {
        IntPtr h;
        if (!OpenPrinter(printerName, out h, IntPtr.Zero))
        {
            Console.Error.WriteLine("OpenPrinter failed: " + Marshal.GetLastWin32Error());
            return 1;
        }
        try
        {
            var di = new DOCINFO { pDocName = "Pehnava Label", pDatatype = "RAW" };
            if (!StartDocPrinter(h, 1, di))
            {
                Console.Error.WriteLine("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
                return 1;
            }
            if (!StartPagePrinter(h))
            {
                Console.Error.WriteLine("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
                return 1;
            }
            int written;
            if (!WritePrinter(h, data, data.Length, out written) || written <= 0)
            {
                Console.Error.WriteLine("WritePrinter failed: " + Marshal.GetLastWin32Error());
                return 1;
            }
            EndPagePrinter(h);
            EndDocPrinter(h);
            Console.WriteLine("OK:" + written);
            return 0;
        }
        finally
        {
            ClosePrinter(h);
        }
    }

    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Usage: rawprint.exe \"Printer Name\" path-to-file");
            return 2;
        }
        string printer = args[0];
        string file = args[1];
        if (!File.Exists(file))
        {
            Console.Error.WriteLine("File not found: " + file);
            return 2;
        }
        byte[] data = File.ReadAllBytes(file);
        return Send(printer, data);
    }
}
