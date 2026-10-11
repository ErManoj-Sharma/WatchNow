export const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mkv',
  'avi',
  'mov',
  'm4v',
  'webm',
  'ts',
  '3gp',
]);

export const SUBTITLE_EXTENSIONS = new Set(['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx']);

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

export function isVideoFile(fileName: string): boolean {
  return VIDEO_EXTENSIONS.has(extensionOf(fileName));
}

export function isSubtitleFile(fileName: string): boolean {
  return SUBTITLE_EXTENSIONS.has(extensionOf(fileName));
}

export function stripExtension(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(0, i) : fileName;
}

export function splitPath(relativePath: string): { dirs: string[]; fileName: string } {
  const parts = relativePath.split('/').filter(Boolean);
  const fileName = parts.pop() ?? relativePath;
  return { dirs: parts, fileName };
}

const TECHNICAL_TOKENS = new Set([
  '2160p', '1080p', '720p', '576p', '480p', '360p', '4k', '8k', 'uhd', 'hd', 'sd',
  'webdl', 'web-dl', 'web', 'webrip', 'bluray', 'blu-ray', 'bdrip', 'brrip', 'hdtv',
  'dvdrip', 'dvd', 'remux', 'cam', 'hdtv',
  'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid', 'divx',
  'aac', 'ac3', 'eac3', 'dts', 'ddp', 'dd5', 'ddp5', 'atmos', 'truehd',
  'hdr', 'hdr10', 'dv', 'sdr', 'hlg', '10bit', '8bit',
  'proper', 'repack', 'extended', 'unrated', 'limited', 'complete', 'internal',
  'multi', 'dual', 'subbed', 'dubbed', 'subs', 'hc', 'hdcam',
  'amzn', 'nf', 'dsnp', 'hulu', 'itunes', 'max', 'vudu',
  'aac2', 'hindi', 'english', 'eng', 'hin',
]);

export function isTechnicalToken(token: string): boolean {
  const t = token.toLowerCase().replace(/[.\s_-]+/g, '');
  if (TECHNICAL_TOKENS.has(t)) return true;
  return /^\d{3,4}p$/.test(t) || /^\d{3,4}x\d{3,4}$/.test(t);
}

export function isTechnicalDir(dirName: string): boolean {
  return isTechnicalToken(dirName);
}

const PASS_THROUGH = /^(disc|cd|part|pt|disk)[\s._-]*\d{1,2}$/i;

export function isPassThroughDir(dirName: string): boolean {
  return isTechnicalDir(dirName) || PASS_THROUGH.test(dirName.trim());
}

const SEASON_PATTERNS: RegExp[] = [
  /^season[\s._-]*0*(\d{1,2})\b/i,
  /^s0*(\d{1,2})$/i,
  /[\s._-]season[\s._-]*0*(\d{1,2})$/i,
];

export function parseSeasonFromDir(dirName: string): number | null {
  const name = dirName.trim();
  for (const re of SEASON_PATTERNS) {
    const m = name.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 99) return n;
    }
  }
  return null;
}

export type EpisodePattern = { season: number | null; episode: number; confidence: number; matched: string };

const EPISODE_PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => EpisodePattern }[] = [
  {
    re: /(?:^|[^a-z0-9])s(\d{1,2})[\s._-]*e(\d{1,3})(?:[^a-z0-9]|$)/i,
    build: (m) => ({ season: Number(m[1]), episode: Number(m[2]), confidence: 0.95, matched: m[0] }),
  },
  {
    re: /(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?!\d)/,
    build: (m) => ({ season: Number(m[1]), episode: Number(m[2]), confidence: 0.9, matched: m[0] }),
  },
  {
    re: /season[\s._-]*(\d{1,2})[\s._-]*episode[\s._-]*(\d{1,3})/i,
    build: (m) => ({ season: Number(m[1]), episode: Number(m[2]), confidence: 0.9, matched: m[0] }),
  },
  {
    re: /(?:^|[^a-z0-9])episode[\s._-]*(\d{1,3})(?!\d)/i,
    build: (m) => ({ season: null, episode: Number(m[2] ?? m[1]), confidence: 0.75, matched: m[0] }),
  },
  {
    re: /(?:^|[^a-z0-9])e(?:p)?[\s._-]*(\d{1,3})(?!\d)/i,
    build: (m) => ({ season: null, episode: Number(m[1]), confidence: 0.75, matched: m[0] }),
  },
];

export function parseEpisodePattern(fileName: string): EpisodePattern | null {
  const base = stripExtension(fileName);
  for (const { re, build } of EPISODE_PATTERNS) {
    const m = base.match(re);
    if (m) {
      const parsed = build(m);
      if (parsed.episode > 0 && parsed.episode < 1000 && parsed.season !== 0) return parsed;
    }
  }
  return null;
}

export function stripTechnicalTokens(name: string): string {
  const base = stripExtension(name);
  const tokens = base.split(/[.\s_]+/).filter(Boolean);
  const kept = tokens.filter((t) => {
    if (isTechnicalToken(t)) return false;
    if (/^s\d{1,2}e\d{1,3}$/i.test(t)) return false;
    if (/^\d{1,2}x\d{2,3}$/.test(t)) return false;
    if (/^(episode|ep|season|part|e)\s*\d{1,3}$/i.test(t)) return false;
    return true;
  });
  const joined = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
  return joined || base.replace(/[.\s_]+/g, ' ').trim();
}

const QUALITY_RE = /\b(2160p|1080p|720p|576p|480p|4k|8k|uhd)\b/i;
const SOURCE_RE = /\b(web-?dl|webrip|bluray|blu-?ray|bdrip|brrip|hdtv|dvdrip|remux|cam)\b/i;

export function qualityOf(...parts: string[]): string | null {
  const joined = parts.join(' ').replace(/[.\s_]+/g, ' ');
  const q = joined.match(QUALITY_RE);
  const s = joined.match(SOURCE_RE);
  if (q && s) return `${q[1].toUpperCase()} ${s[1].replace(/-/g, '')}`;
  if (q) return q[1].toUpperCase();
  if (s) return s[1].replace(/-/g, '').toUpperCase();
  return null;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortTitleOf(title: string): string {
  const t = title.trim().toLowerCase();
  const m = t.match(/^(the|a|an)\s+/);
  return m ? t.slice(m[0].length) : t;
}
