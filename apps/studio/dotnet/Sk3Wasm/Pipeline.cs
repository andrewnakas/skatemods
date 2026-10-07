using System.Numerics;
using System.Text.Json;
using ArenaBuilder.Build;
using ArenaBuilder.Core.Platforms.Common.PsgFormat;
using ArenaBuilder.Glb;
using Sk3.Stream;

namespace Sk3Wasm;

/// <summary>Options for <see cref="Pipeline.BuildDlcFromGlbFolder"/>; parsed from the JS side's JSON.</summary>
public sealed record DlcOptions
{
    public string Name { get; init; } = "Custom Map";
    public string? DistName { get; init; }
    public float SpawnX { get; init; }
    public float SpawnY { get; init; }
    public float SpawnZ { get; init; }
    public float SpawnYaw { get; init; }
    public string Target { get; init; } = "x360";
    public string Section { get; init; } = "Maps";
    public bool GlobalOnly { get; init; }
    public float? YMin { get; init; }
    public float? YMax { get; init; }
    /// <summary>Return a zip of {big, DIST/…, log} instead of the bare .big.</summary>
    public bool IncludeDist { get; init; }

    public static DlcOptions Parse(string? json)
    {
        var o = new DlcOptions();
        if (string.IsNullOrWhiteSpace(json)) return o;
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
        string? S(string k) => r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        bool B(string k) => r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True;
        float? F(JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetSingle() : null;
        var spawn = r.TryGetProperty("spawn", out var sp) && sp.ValueKind == JsonValueKind.Object ? sp : default;
        return o with
        {
            Name = S("name") ?? o.Name,
            DistName = S("distName"),
            Target = (S("target") ?? o.Target).ToLowerInvariant(),
            Section = S("section") ?? o.Section,
            GlobalOnly = B("globalOnly"),
            IncludeDist = B("includeDist"),
            YMin = F(r, "yMin"),
            YMax = F(r, "yMax"),
            SpawnX = spawn.ValueKind == JsonValueKind.Object ? F(spawn, "x") ?? 0 : 0,
            SpawnY = spawn.ValueKind == JsonValueKind.Object ? F(spawn, "y") ?? 0 : 0,
            SpawnZ = spawn.ValueKind == JsonValueKind.Object ? F(spawn, "z") ?? 0 : 0,
            SpawnYaw = spawn.ValueKind == JsonValueKind.Object ? F(spawn, "yaw") ?? 0 : 0,
        };
    }
}

/// <summary>
/// GLB folder → ArenaBuilder X360 arenas → managed stream pack → DlcBuilder staging → .big.
/// The same sequence as <c>ArenaBuilder.Cli psg-build-batch --platform=xbox</c> followed by
/// Stream File Tool and <c>sk3 build-dlc</c>, minus the PS3→X360 transcode (ArenaBuilder emits
/// X360 arenas directly) and minus every external executable.
/// </summary>
public static class Pipeline
{
    public static byte[] BuildDlcFromGlbFolder(string glbDir, string work, DlcOptions o, Action<string> log)
    {
        if (o.Target != "x360")
            throw new NotSupportedException(
                $"target '{o.Target}': only 'x360' (skate3recomp / Xbox 360) is supported. A PS3 package " +
                "needs bigfile.exe and an NPDRM-signed .big.edat, neither of which exists in managed code.");

        string slug = DlcBuilder.Modules.DlcManifest.DlcSpec.ToSlug(o.Name);
        if (slug.Length == 0) throw new ArgumentException($"'{o.Name}' has no letters or digits to build a slug from.");
        string distName = o.DistName ?? "DIST_" + string.Concat(o.Name.Where(char.IsLetterOrDigit));

        var glbs = Directory.GetFiles(glbDir, "*.glb", SearchOption.TopDirectoryOnly)
                            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToArray();
        if (glbs.Length == 0) throw new ArgumentException("no .glb files in the input.");

        // 1. GLB → X360 arenas (cPres_*/cSim_* folders of <GUID>.rx2).
        string arenas = Path.Combine(work, "arenas");
        Directory.CreateDirectory(arenas);
        var tileOptions = new TileBuildOptions
        {
            GlobalOnly = o.GlobalOnly,
            TargetPlatform = ArenaPlatform.Xbox360,
        };
        log($"[1/4] ArenaBuilder: {glbs.Length} GLB(s) -> X360 arenas");
        TileBuildPipeline.Build(glbDir, arenas, glbs, tileOptions, 1f, log);

        // 2. Arenas → DIST (managed stand-in for Stream File Tool.exe).
        string dist = Path.Combine(work, distName);
        var y = (o.YMin.HasValue && o.YMax.HasValue) ? (o.YMin.Value, o.YMax.Value) : GlbYRange(glbs);
        log($"[2/4] stream pack -> {distName} (cell Y {y.Item1:0.##}..{y.Item2:0.##})");
        foreach (var k in StreamPacker.Pack(arenas, dist, y, TexTemplate(), log: log))
            log($"  {distName}_{k.Kind}: {k.Tiles} tile file(s), {k.Arenas} arena(s), group {k.GroupHash:x8}");
        EmptyContentlessStreamKinds(dist, distName, log);

        // 3. DlcBuilder staging tree (VLT rows, locator arena, mission stubs, FE strings).
        log("[3/4] DlcBuilder staging");
        var map = new DlcBuilder.Inputs.MapInput
        {
            DistFolderPath = dist,
            DisplayName = o.Name,
            SlugSuffix = slug,
            Section = o.Section,
            SpawnX = o.SpawnX,
            SpawnY = o.SpawnY,
            SpawnZ = o.SpawnZ,
            SpawnYaw = o.SpawnYaw,
            Locators = new[]
            {
                new DlcBuilder.Inputs.LocatorInput
                {
                    Id = Guid.NewGuid(),
                    Name = o.Name,
                    Position = new Vector3(o.SpawnX, o.SpawnY, o.SpawnZ),
                    RotationDegrees = new Vector3(0f, o.SpawnYaw, 0f),
                    Kind = DlcBuilder.Inputs.LocatorKind.Spawn,
                    IsFreeskateMenuSlot = true,
                },
            },
        };
        var package = new DlcBuilder.Inputs.PackageInput { PackageName = o.Name, Maps = new[] { map } };
        var result = new DlcBuilder.Modules.Orchestrator.DlcBuildOrchestrator().Build(
            package, Path.Combine(work, "staged"),
            new DlcBuilder.BuildOptions { Platform = DlcBuilder.DlcPlatform.Xbox360, PackBig = false });
        foreach (var d in result.Diagnostics)
            if (d.Level != DlcBuilder.Outputs.DiagnosticLevel.Info)
                log($"  [{d.Level}] {d.Source}: {d.Message}");
        if (result.Status == DlcBuilder.Outputs.BuildStatus.Failed)
            throw new InvalidOperationException("DlcBuilder refused the package: " + string.Join("; ",
                result.Diagnostics.Where(x => x.Level == DlcBuilder.Outputs.DiagnosticLevel.Error)
                                  .Select(x => $"{x.Source}: {x.Message}")));

        // The orchestrator stages next to its own assembly (AppContext.BaseDirectory/data).
        string stagingData = Path.Combine(AppContext.BaseDirectory.TrimEnd('/', '\\'), "data");
        if (!Directory.Exists(stagingData)) throw new InvalidOperationException($"no staging tree at {stagingData}");
        DropWorldUnlockRows(stagingData, log);

        // 4. Staging tree → DLC .big with a generated path directory.
        log("[4/4] .big");
        byte[] big = PackStagingTree(stagingData, log);
        File.WriteAllBytes(Path.Combine(work, $"{slug}_00000000.big"), big);
        return big;
    }

    /// <summary>Y extent of every POSITION in the GLBs (node transforms applied), padded.</summary>
    public static (float, float) GlbYRange(IEnumerable<string> glbs)
    {
        float lo = float.MaxValue, hi = float.MinValue;
        foreach (var path in glbs)
        {
            try
            {
                var model = SharpGLTF.Schema2.ModelRoot.Load(path);
                foreach (var node in model.LogicalNodes)
                {
                    if (node.Mesh == null) continue;
                    var m = node.WorldMatrix;
                    foreach (var prim in node.Mesh.Primitives)
                    {
                        var acc = prim.GetVertexAccessor("POSITION");
                        if (acc == null) continue;
                        foreach (var p in acc.AsVector3Array())
                        {
                            float wy = Vector3.Transform(p, m).Y;
                            lo = Math.Min(lo, wy); hi = Math.Max(hi, wy);
                        }
                    }
                }
            }
            catch (Exception) { }
        }
        return lo > hi ? (-100f, 500f) : (lo - 1f, hi + 1f);
    }

    public static IReadOnlyDictionary<string, byte[]> TexTemplate()
    {
        var asm = typeof(Pipeline).Assembly;
        var d = new Dictionary<string, byte[]>();
        foreach (var ext in new[] { ".xmm", ".xsm", ".xss", ".xst" })
        {
            using var s = asm.GetManifestResourceStream("tex" + ext)
                ?? throw new InvalidOperationException($"missing embedded Tex template tex{ext}");
            using var ms = new MemoryStream();
            s.CopyTo(ms);
            d[ext] = ms.ToArray();
        }
        return d;
    }

    // ── ported from Sk3.Cli/Program.cs (top-level statics, not referenceable) ──────────────

    /// <summary>Sk3.Cli EmptyContentlessStreamKinds: keep manifests, empty tile list, drop empty tiles.</summary>
    public static void EmptyContentlessStreamKinds(string distDir, string distName, Action<string> log)
    {
        foreach (string kind in new[] { "Pres", "Sim", "Tex" })
        {
            string atoc = Path.Combine(distDir, $"{distName}_{kind}.xst");
            if (!File.Exists(atoc)) continue;
            int records;
            try { records = AtocFile.Read(atoc, StreamPlatform.Xbox360).Records.Count; }
            catch (Exception) { continue; }
            if (records > 0) continue;

            string cmapPath = Path.Combine(distDir, $"{distName}_{kind}.xsm");
            if (File.Exists(cmapPath))
            {
                var cmap = CmapFile.Read(cmapPath);
                File.WriteAllBytes(cmapPath, CmapFile.Write(cmap with { Entries = new List<CmapEntry>(), Platform = StreamPlatform.Xbox360 }));
            }
            string cspaPath = Path.Combine(distDir, $"{distName}_{kind}.xss");
            if (File.Exists(cspaPath))
            {
                var cspa = CspaFile.Read(cspaPath);
                File.WriteAllBytes(cspaPath, CspaFile.Write(cspa with { Cells = new List<CspaFile.Cell>() }));
            }
            var tiles = Directory.EnumerateFiles(distDir, $"c{kind}_*.xsf").ToList();
            foreach (string tile in tiles) File.Delete(tile);
            log($"  {kind} stream holds no arenas: kept its 4 manifests, dropped {tiles.Count} tile(s)");
        }
    }

    /// <summary>Sk3.Cli DropWorldUnlockRows: a WORLDS,&lt;slug&gt; unlock row hangs the DLC scan.</summary>
    public static void DropWorldUnlockRows(string stagingData, Action<string> log)
    {
        string unlocks = Path.Combine(stagingData, "unlocks");
        if (!Directory.Exists(unlocks)) return;
        foreach (var path in Directory.EnumerateFiles(unlocks, "*.unlock"))
        {
            var all = File.ReadAllLines(path);
            var kept = all.Where(l => !l.StartsWith("WORLDS,", StringComparison.Ordinal)).ToList();
            if (kept.Count == all.Length) continue;
            File.WriteAllText(path, kept.Count == 0 ? "" : string.Join("\n", kept) + "\n");
            log($"  dropped world rows from {Path.GetFileName(path)}");
        }
    }

    /// <summary>Sk3.Cli PackStagingTree, returning bytes.</summary>
    public static byte[] PackStagingTree(string stagingData, Action<string> log)
    {
        var entries = new List<BigEntry>();
        var paths = new List<string>();
        foreach (var file in Directory.EnumerateFiles(stagingData, "*", SearchOption.AllDirectories)
                                      .OrderBy(p => p, StringComparer.Ordinal))
        {
            string relative = Path.GetRelativePath(stagingData, file).Replace(Path.DirectorySeparatorChar, '/');
            string full = "data/" + relative;
            int cut = full.LastIndexOf('/');
            entries.Add(new BigEntry(full[..cut], full[(cut + 1)..], File.ReadAllBytes(file)));
            paths.Add(full);
        }
        if (entries.Count == 0) throw new InvalidOperationException($"{stagingData} holds no files.");

        var directory = BigArchive.BuildPathDirectory(BigArchive.PlanPathDirectory(paths));
        var archive = new BigArchive.Archive(
            Roots: entries.Select(e => e.Root).Distinct(StringComparer.Ordinal).OrderBy(r => r, StringComparer.Ordinal).ToList(),
            NameLayout: 0,
            Flags: BigArchive.DlcFlags,
            Entries: entries,
            Field20: (uint)directory.Length,
            PathDirectory: directory);
        byte[] big = BigArchive.Write(archive);
        log($"  {entries.Count} entries, {archive.Roots.Count} roots, path directory {directory.Length} B, {big.Length / 1048576.0:N1} MiB");
        return big;
    }
}
