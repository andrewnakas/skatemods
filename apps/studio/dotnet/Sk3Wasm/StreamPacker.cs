using System.Buffers.Binary;
using System.Globalization;
using System.Text;
using Sk3.Stream;

namespace Sk3Wasm;

/// <summary>
/// Managed replacement for "Stream File Tool.exe pack --platform=x": turns ArenaBuilder's
/// per-tile arena folders (<c>cPres_*</c>, <c>cSim_*</c> holding <c>&lt;GUID&gt;.rx2</c>) into an
/// Xbox 360 DIST: one <c>.xsf</c> per folder plus <c>.xsm/.xmm/.xss/.xst</c> per stream kind.
/// </summary>
/// <remarks>
/// Reverse-engineered from DIST_DMJumpline (ArenaBuilder X360 output packed by the Windows tool,
/// arenas/ and DIST/ both on disk). <see cref="Pack"/> reproduces its .xsf files, CMAP, ATOC and
/// CSPA cell layout byte-for-byte except the CSPA Y extents and the group hash (both inputs here). What is known:
/// <list type="bullet">
/// <item>tile asset id = FNV-1 64 of the folder name (<c>cPres_50_50_high</c> → fb4c3af3cd410a21,
///   identical across every DIST checked);</item>
/// <item><c>cPres_Global</c> asset id = FNV-1 64 of <c>cPres_Global_&lt;DIST&gt;</c>; its group id is the
///   constant e171e1abfedb69ed; every tile's group id is the kind's Global id (also when that kind
///   has no Global folder, as with cSim);</item>
/// <item>chunk asset id = the arena's file name (hex GUID), chunks ordered by id inside a file;
///   container is the PS3-raw framing (<see cref="WriteRaw"/>), alignment 0x100,
///   SFIL tail 0x58000000 for Pres and 0x57000000 for Sim;</item>
/// <item>CMAP lists Global first then tiles in ordinal name order; ATOC lists each distinct arena
///   once, in first-seen order over that CMAP order;</item>
/// <item>CSPA has one 80-byte cell per tile (no Global): u32 0, u32 0, then four float4:
///   (minX, minY, minZ, 1) (maxX, maxY, maxZ, 1) (cX, minY, cZ, 1) (maxX, maxY, maxZ, 1).</item>
/// </list>
/// Unknown: how the 32-bit stream group hash is derived (it is not FNV/djb2/CRC of any obvious
/// name; it only has to agree across the five files of a kind). We use FNV-1 32 of
/// <c>&lt;DIST&gt;_&lt;Kind&gt;</c>, or the caller's value.
/// </remarks>
public static class StreamPacker
{
    public const ulong GlobalGroupId = 0xE171E1ABFEDB69ED;

    public sealed record KindResult(string Kind, int Tiles, int Arenas, uint GroupHash);

    public static ulong Fnv1_64(string s)
    {
        ulong h = 0xCBF29CE484222325;
        foreach (byte b in Encoding.ASCII.GetBytes(s)) { h = unchecked(h * 0x100000001B3); h ^= b; }
        return h;
    }

    public static uint Fnv1_32(string s)
    {
        uint h = 0x811C9DC5;
        foreach (byte b in Encoding.ASCII.GetBytes(s)) { h = unchecked(h * 0x01000193); h ^= b; }
        return h;
    }

    /// <param name="arenaRoot">Folder holding cPres_* / cSim_* sub-folders of .rx2 arenas.</param>
    /// <param name="distDir">Output DIST folder; its leaf name is the DIST name.</param>
    /// <param name="yRange">World Y extent written into every CSPA cell.</param>
    /// <param name="texTemplate">The four empty X360 Tex manifests (ext → bytes), copied verbatim.</param>
    public static List<KindResult> Pack(string arenaRoot, string distDir, (float Min, float Max) yRange,
                                        IReadOnlyDictionary<string, byte[]> texTemplate,
                                        Func<string, uint>? groupHash = null, Action<string>? log = null)
    {
        Directory.CreateDirectory(distDir);
        string distName = Path.GetFileName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(distDir)));
        groupHash ??= kind => Fnv1_32($"{distName}_{kind}");
        var results = new List<KindResult>();

        foreach (var (kind, prefix, tail) in new[] { ("Pres", "cPres", 0x58000000u), ("Sim", "cSim", 0x57000000u) })
        {
            var folders = Directory.Exists(arenaRoot)
                ? Directory.EnumerateDirectories(arenaRoot, prefix + "_*")
                           .Select(Path.GetFileName).Select(n => n!)
                           .Where(n => Directory.EnumerateFiles(Path.Combine(arenaRoot, n)).Any())
                           .ToList()
                : new List<string>();
            if (folders.Count == 0) continue;

            string globalName = prefix + "_Global";
            var ordered = folders.Where(n => n == globalName)
                                 .Concat(folders.Where(n => n != globalName).OrderBy(n => n, StringComparer.Ordinal))
                                 .ToList();
            uint gh = groupHash(kind);
            ulong globalId = Fnv1_64($"{globalName}_{distName}");

            var cmapEntries = new List<CmapEntry>();
            var atoc = new List<AtocFile.Record>();
            var seen = new HashSet<ulong>();
            var cells = new List<CspaFile.Cell>();
            int arenaCount = 0;

            foreach (string folder in ordered)
            {
                var assets = Directory.EnumerateFiles(Path.Combine(arenaRoot, folder))
                    .Select(p => (Id: ParseGuid(p), Path: p))
                    .Where(a => a.Id.HasValue)
                    .OrderBy(a => a.Id!.Value)
                    .Select(a => new StreamAsset(a.Id!.Value, File.ReadAllBytes(a.Path)))
                    .ToList();
                byte[] xsf = WriteRaw(gh, tail, assets);
                File.WriteAllBytes(Path.Combine(distDir, folder + ".xsf"), xsf);
                arenaCount += assets.Count;

                bool isGlobal = folder == globalName;
                ulong id = isGlobal ? globalId : Fnv1_64(folder);
                cmapEntries.Add(new CmapEntry(id, isGlobal ? GlobalGroupId : globalId, (uint)SfilFile.Ps3Align,
                                              (uint)xsf.Length, (uint)assets.Count, folder));
                foreach (var a in assets)
                    if (seen.Add(a.AssetId)) atoc.Add(AtocFile.RecordFor(a.AssetId, a.Arena));

                if (!isGlobal && TryTileCenter(folder, out float cx, out float cz))
                    cells.Add(new CspaFile.Cell(id, CellBody(cx, cz, 100f, yRange)));
                log?.Invoke($"  {folder}.xsf  {assets.Count} arenas, {xsf.Length / 1024.0:N0} KiB");
            }

            string b = Path.Combine(distDir, $"{distName}_{kind}");
            File.WriteAllBytes(b + ".xsm", CmapFile.Write(new CmapFile.Manifest(gh, 0, StreamPlatform.Ps3Raw, cmapEntries)));
            File.WriteAllBytes(b + ".xmm", MmapFile.Write(gh));
            File.WriteAllBytes(b + ".xss", CspaFile.Write(new CspaFile.Manifest(gh, 0, cells)));
            File.WriteAllBytes(b + ".xst", AtocFile.WriteXbox360(gh, atoc));
            results.Add(new KindResult(kind, cmapEntries.Count, arenaCount, gh));
        }

        foreach (var (ext, bytes) in texTemplate)
        {
            string path = Path.Combine(distDir, $"{distName}_Tex{ext}");
            if (!File.Exists(path)) File.WriteAllBytes(path, bytes);
        }
        return results;
    }

    /// <summary>
    /// <see cref="SfilFile.WriteXbox360Raw"/>'s container, with the tool's one quirk: a chunk is
    /// padded by <c>0x100 - size % 0x100</c>, so an arena whose size is already a multiple of 0x100
    /// gets a whole empty 0x100 block after it (10 of DMJumpline's 175 tile files depend on this).
    /// </summary>
    public static byte[] WriteRaw(uint groupHash, uint tail, IReadOnlyList<StreamAsset> assets)
    {
        const int align = SfilFile.Ps3Align;
        var buf = new MemoryStream();
        var fileHeader = new byte[align];
        W32(fileHeader, 0x00, SfilFile.Magic);
        W32(fileHeader, 0x04, SfilFile.Version);
        W32(fileHeader, 0x0C, groupHash);
        W32(fileHeader, 0x10, align);
        W32(fileHeader, 0x14, 1);
        W32(fileHeader, 0x18, (uint)StreamPlatform.Ps3Raw);
        W32(fileHeader, 0x1C, tail);
        buf.Write(fileHeader);
        foreach (var asset in assets)
        {
            int pad = align - asset.Arena.Length % align;
            var chunkHeader = new byte[align];
            BinaryPrimitives.WriteUInt64BigEndian(chunkHeader.AsSpan(0, 8), asset.AssetId);
            W32(chunkHeader, 0x08, (uint)asset.Arena.Length);
            W32(chunkHeader, 0x0C, align);
            W32(chunkHeader, 0x10, (uint)(align + asset.Arena.Length + pad));
            buf.Write(chunkHeader);
            buf.Write(asset.Arena);
            buf.Write(new byte[pad]);
        }
        return buf.ToArray();
    }

    private static void W32(Span<byte> d, int o, uint v) => BinaryPrimitives.WriteUInt32BigEndian(d.Slice(o, 4), v);

    private static ulong? ParseGuid(string path)
    {
        string stem = Path.GetFileNameWithoutExtension(path);
        string ext = Path.GetExtension(path);
        if (!ext.Equals(".rx2", StringComparison.OrdinalIgnoreCase) && !ext.Equals(".psg", StringComparison.OrdinalIgnoreCase))
            return null;
        return ulong.TryParse(stem, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out ulong v) ? v : null;
    }

    public static bool TryTileCenter(string folder, out float cx, out float cz)
    {
        cx = cz = 0;
        var parts = folder.Split('_');
        return parts.Length == 4
            && float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out cx)
            && float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out cz);
    }

    private static byte[] CellBody(float cx, float cz, float size, (float Min, float Max) y)
    {
        float h = size / 2;
        var f = new[]
        {
            cx - h, y.Min, cz - h, 1f,
            cx + h, y.Max, cz + h, 1f,
            cx,     y.Min, cz,     1f,
            cx + h, y.Max, cz + h, 1f,
        };
        var body = new byte[CspaFile.BodySize];
        for (int i = 0; i < f.Length; i++)
            BinaryPrimitives.WriteSingleBigEndian(body.AsSpan(8 + 4 * i, 4), f[i]);
        return body;
    }
}
