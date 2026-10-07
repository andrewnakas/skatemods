namespace Sk3Wasm;
internal static class BuildInfo
{
    // Stamped from the assembly's informational version (includes the build timestamp set in build.sh).
    public static string Stamp =>
        (System.Reflection.CustomAttributeExtensions.GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>(
            typeof(BuildInfo).Assembly)?.InformationalVersion) ?? "dev";
}
