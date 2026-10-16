/**
 * Build-time ReSkate release history from GitHub. Release notes are empty, so each release lists
 * the commit subjects since the previous tag. Uses GITHUB_TOKEN when set (CI); unauthenticated
 * calls fit in GitHub's 60/hour limit for one build. Empty if GitHub can't be reached.
 */
const REPO = 'Dingo-Shenanigans/ReSkate';
const API = `https://api.github.com/repos/${REPO}`;

export interface Release {
  tag: string;
  date: string;
  url: string;
  downloads: number;
  /** Direct link to the ReSkate-<version>.zip asset, if the release has one. */
  zip?: string;
  /** A test build GitHub marks as a pre-release. */
  prerelease: boolean;
  /** The release notes on GitHub, as Markdown; empty for most releases. */
  notes: string;
  changes: { text: string; url: string }[];
}

const headers: Record<string, string> = { 'User-Agent': 'skatemods.com build', Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const get = (path: string) => fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(20000) }).then((r) => {
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
});

// Merge commits and housekeeping say nothing to a player.
const noise = /^(Merge (pull request|branch|remote-tracking|main)|Delete |Update \S+\.(cpp|h|md|py)$|log changes$|merge bug)/i;

let cache: Promise<Release[]> | undefined;

export function getReleases(): Promise<Release[]> {
  cache ??= (async () => {
    const releases: any[] = (await get('/releases?per_page=40')).filter((r: any) => !r.draft);
    const out: Release[] = [];
    for (let i = 0; i < releases.length; i++) {
      const r = releases[i];
      const prev = releases[i + 1];
      let changes: Release['changes'] = [];
      if (prev) {
        try {
          const cmp = await get(`/compare/${prev.tag_name}...${r.tag_name}`);
          const seen = new Set<string>();
          changes = cmp.commits
            .map((c: any) => ({ text: c.commit.message.split('\n')[0].trim(), url: c.html_url }))
            .filter((c: { text: string }) => !noise.test(c.text) && !seen.has(c.text) && seen.add(c.text))
            .reverse();
        } catch {}
      }
      out.push({
        tag: r.tag_name,
        date: r.published_at,
        url: r.html_url,
        downloads: r.assets.reduce((n: number, a: any) => n + a.download_count, 0),
        zip: r.assets.find((a: any) => /^ReSkate-[\w.-]+\.zip$/.test(a.name))?.browser_download_url,
        prerelease: !!r.prerelease,
        notes: (r.body ?? '').trim(),
        changes,
      });
    }
    return out;
  })().catch(() => []);
  return cache;
}

/** The newest stable release, or undefined if GitHub couldn't be reached at build time. */
export const latestRelease = async (): Promise<Release | undefined> => (await getReleases()).find((r) => !r.prerelease);

/** A pre-release newer than the latest stable one, if there is one. */
export const latestPrerelease = async (): Promise<Release | undefined> => {
  const all = await getReleases();
  const stable = all.findIndex((r) => !r.prerelease);
  return all.slice(0, stable < 0 ? all.length : stable).find((r) => r.prerelease);
};
