using System.IO.Compression;
using System.Runtime.InteropServices.JavaScript;
using System.Text;
using System.Text.Json;
using Sk3.Stream;

namespace Sk3Wasm;

/// <summary>JS entry points. Everything is synchronous; call from a Web Worker in the browser.</summary>
public static partial class Exports
{
    private static readonly StringBuilder Log = new();
    private static void L(string s) { lock (Log) Log.AppendLine(s); }

    public static void Main() { }

    [JSExport]
    public static string Info() => JsonSerializer.Serialize(new Dictionary<string, string>
    {
        ["name"] = "Sk3Wasm",
        ["version"] = typeof(Exports).Assembly.GetName().Version?.ToString() ?? "?",
        ["runtime"] = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
        ["os"] = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
        ["arch"] = System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),
        ["targets"] = "x360",
        ["built"] = BuildInfo.Stamp,
    }, InfoJson.Default.DictionaryStringString);

    /// <summary>Log lines from the last call (cleared at the start of each call).</summary>
    [JSExport]
    public static string LastLog() { lock (Log) return Log.ToString(); }

    /// <param name="glbZip">Zip of *.glb (plus optional blenrose_materials.json / splines.json) at its root.</param>
    /// <param name="optionsJson">{name, spawn:{x,y,z,yaw}, target:"x360", section, globalOnly, yMin, yMax, includeDist}</param>
    /// <returns>The DLC .big, or (includeDist) a zip of the .big, the DIST folder and build.log.</returns>
    [JSExport]
    public static byte[] BuildDlcFromGlb(byte[] glbZip, string optionsJson)
    {
        lock (Log) Log.Clear();
        var o = DlcOptions.Parse(optionsJson);
        string work = NewWork("dlc");
        try
        {
            string glbDir = Path.Combine(work, "glb");
            Directory.CreateDirectory(glbDir);
            using (var zip = new ZipArchive(new MemoryStream(glbZip), ZipArchiveMode.Read))
                foreach (var e in zip.Entries)
                {
                    if (e.FullName.EndsWith('/')) continue;
                    string name = Path.GetFileName(e.FullName);
                    if (name.Length == 0) continue;
                    e.ExtractToFile(Path.Combine(glbDir, name), overwrite: true);
                }

            var t0 = DateTime.UtcNow;
            byte[] big = Pipeline.BuildDlcFromGlbFolder(glbDir, work, o, L);
            L($"done in {(DateTime.UtcNow - t0).TotalSeconds:N1} s, {big.Length:N0} B");
            if (!o.IncludeDist) return big;

            var ms = new MemoryStream();
            using (var outZip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            {
                string slug = DlcBuilder.Modules.DlcManifest.DlcSpec.ToSlug(o.Name);
                Add(outZip, $"{slug}_00000000.big", big);
                foreach (var dir in Directory.EnumerateDirectories(work, "DIST_*"))
                    foreach (var f in Directory.EnumerateFiles(dir))
                        Add(outZip, $"{Path.GetFileName(dir)}/{Path.GetFileName(f)}", File.ReadAllBytes(f));
                Add(outZip, "build.log", Encoding.UTF8.GetBytes(LastLog()));
            }
            return ms.ToArray();
        }
        catch (Exception ex)
        {
            L("ERROR " + ex);
            throw;
        }
        finally { TryDelete(work); TryDelete(Path.Combine(AppContext.BaseDirectory, "data")); }
    }

    /// <summary>Unpacks a DLC .big (or an unencrypted .big.edat) into a zip of its file tree.</summary>
    [JSExport]
    public static byte[] ReadBig(byte[] bigBytes)
    {
        lock (Log) Log.Clear();
        if (bigBytes.Length >= 4 && bigBytes[0] == (byte)'N' && bigBytes[1] == (byte)'P' && bigBytes[2] == (byte)'D')
            throw new NotSupportedException("NPDRM-encrypted .edat; decrypt it first (the EB archive inside is what this reads).");
        var archive = BigArchive.Read(bigBytes);
        L($"{archive.Entries.Count} entries, {archive.Roots.Count} roots, flags 0x{archive.Flags:X8}");
        var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var e in archive.Entries)
                Add(zip, e.Path.TrimStart('/'), e.Data, CompressionLevel.Fastest);
        return ms.ToArray();
    }

    private static void Add(ZipArchive zip, string path, byte[] data, CompressionLevel level = CompressionLevel.Optimal)
    {
        var entry = zip.CreateEntry(path, level);
        using var s = entry.Open();
        s.Write(data);
    }

    private static string NewWork(string tag)
    {
        string dir = Path.Combine(Path.GetTempPath(), $"sk3-{tag}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void TryDelete(string dir)
    {
        try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch (Exception) { }
    }
}

[System.Text.Json.Serialization.JsonSerializable(typeof(Dictionary<string, string>))]
internal partial class InfoJson : System.Text.Json.Serialization.JsonSerializerContext { }
