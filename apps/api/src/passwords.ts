/** PBKDF2-SHA256 password hashing with WebCrypto (100k is the Workers maximum). */

const ITERATIONS = 100_000;
const enc = new TextEncoder();

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Same work whether or not the account exists, so timing doesn't reveal usernames.
  const [scheme, iter, salt, hash] = (stored ?? `pbkdf2$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$`).split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = await derive(password, unb64(salt), Number(iter));
  const want = hash ? unb64(hash) : new Uint8Array(32);
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got[i] ^ want[i];
  return stored !== null && diff === 0;
}

const COMMON = new Set(['password', 'password1', '12345678', '123456789', 'qwerty123', 'skate3skate3', 'iloveskate', 'skatemods']);

export function passwordProblem(password: string, username: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters';
  if (password.length > 200) return 'That password is too long';
  if (COMMON.has(password.toLowerCase()) || password.toLowerCase().includes(username.toLowerCase())) {
    return 'Pick a less guessable password';
  }
  return null;
}
