using System.Buffers.Binary;

namespace ArenaBuilder;

/// <summary>
/// Managed MD5 (RFC 1321) standing in for System.Security.Cryptography.MD5, which the .NET
/// browser runtime does not implement. Bound by name lookup; see ArenaBuilder.Wasm.csproj.
/// Used only for content-derived GUIDs, never for security.
/// </summary>
internal static class MD5
{
    private static readonly uint[] K = Enumerable.Range(0, 64)
        .Select(i => (uint)(long)Math.Floor(Math.Abs(Math.Sin(i + 1)) * 4294967296.0)).ToArray();
    private static readonly int[] S =
    {
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    };

    public static byte[] HashData(byte[] source) => HashData((ReadOnlySpan<byte>)source);

    public static byte[] HashData(ReadOnlySpan<byte> source)
    {
        int padded = ((source.Length + 8) / 64 + 1) * 64;
        var msg = new byte[padded];
        source.CopyTo(msg);
        msg[source.Length] = 0x80;
        BinaryPrimitives.WriteUInt64LittleEndian(msg.AsSpan(padded - 8), (ulong)source.Length * 8);

        uint a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
        Span<uint> m = stackalloc uint[16];
        for (int off = 0; off < padded; off += 64)
        {
            for (int i = 0; i < 16; i++) m[i] = BinaryPrimitives.ReadUInt32LittleEndian(msg.AsSpan(off + 4 * i));
            uint a = a0, b = b0, c = c0, d = d0;
            for (int i = 0; i < 64; i++)
            {
                uint f; int g;
                if (i < 16) { f = (b & c) | (~b & d); g = i; }
                else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
                else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
                else { f = c ^ (b | ~d); g = (7 * i) & 15; }
                f = unchecked(f + a + K[i] + m[g]);
                a = d; d = c; c = b;
                b = unchecked(b + ((f << S[i]) | (f >> (32 - S[i]))));
            }
            a0 = unchecked(a0 + a); b0 = unchecked(b0 + b); c0 = unchecked(c0 + c); d0 = unchecked(d0 + d);
        }
        var digest = new byte[16];
        BinaryPrimitives.WriteUInt32LittleEndian(digest.AsSpan(0), a0);
        BinaryPrimitives.WriteUInt32LittleEndian(digest.AsSpan(4), b0);
        BinaryPrimitives.WriteUInt32LittleEndian(digest.AsSpan(8), c0);
        BinaryPrimitives.WriteUInt32LittleEndian(digest.AsSpan(12), d0);
        return digest;
    }
}
