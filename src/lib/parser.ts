import type { Task } from './types.js';

/**
 * Parse one line of task input into a partial Task object.
 *
 * Syntax: `title NNh | NN.Nh | NNm | NN.NN  [xN]  [pN]`
 * Examples:
 *   "draft email .5h x2, p2"
 *   "ship invoice 1h, p1"
 *   "deep work 2h x3, p3"
 *   "Court prep 1hx2 p1"     ← xN may be attached directly to duration
 *   "Motel tax .5 p1"        ← bare decimal treated as hours
 *   "stand-up 15m"
 *
 * @param raw - Raw text line
 * @returns Parsed task fields (without id/createdAt) or null if unparseable
 */
export function parseLine(raw: string): Omit<Task, 'id' | 'createdAt'> | null {
  const line = raw.trim();
  if (!line) return null;

  // ── Duration ────────────────────────────────────────────────────────────
  // Primary: explicit unit (h/m), e.g. "1h", ".5h", "90m"
  const durWithUnit = line.match(/(\d*\.?\d+)\s*(h|m)/i);
  // Fallback: bare decimal with no unit, treated as hours, e.g. ".5", ".25"
  // Only fires when no explicit-unit match is found.
  const durBare = durWithUnit ? null : line.match(/(\d*\.\d+)(?=[\s,]|$)/);
  const durMatch = durWithUnit ?? durBare;
  if (!durMatch) return null;

  const durValue = parseFloat(durMatch[1]);
  const durUnit  = durWithUnit ? durMatch[2].toLowerCase() : 'h';
  const sessionMin = durUnit === 'h'
    ? Math.round(durValue * 60)
    : Math.round(durValue);

  if (sessionMin < 15 || sessionMin > 480) return null;

  // ── Session count (xN) ───────────────────────────────────────────────────
  // Handle two forms:
  //   attached  "1hx2"  — xN immediately follows the duration token
  //   standalone ".5h x3" — xN preceded by whitespace or comma
  const durEnd      = (durMatch.index ?? 0) + durMatch[0].length;
  const xAttached   = line.slice(durEnd).match(/^x(\d+)/i);
  const xStandalone = xAttached
    ? null
    : line.match(/(?<=[\s,])x(\d+)/i);
  const xRaw        = xAttached?.[1] ?? xStandalone?.[1];
  const sessionsTotal = xRaw ? Math.min(14, parseInt(xRaw, 10)) : 1;

  // ── Priority (pN) ────────────────────────────────────────────────────────
  // \b on both sides means "p1,3" correctly yields p1 (comma is a boundary).
  const pMatch  = line.match(/\bp([1-4])\b/i);
  const priority = (pMatch ? parseInt(pMatch[1], 10) : 3) as 1 | 2 | 3 | 4;

  // ── Title ────────────────────────────────────────────────────────────────
  // Strip any pN / xN tokens that appear before the duration (they're metadata,
  // not part of the task name). Example: "Chipper .25 p1 1h p3" → "Chipper .25"
  const title = line.slice(0, durMatch.index)
    .replace(/\s+[px]\d+\b/gi, '')
    .replace(/[,;]\s*$/, '')
    .trim();
  if (!title) return null;

  return { title, sessionMin, sessionsTotal, sessionsDone: 0, priority };
}

/**
 * Pre-process a block of text that may contain GitHub-flavoured Markdown
 * task-list syntax, returning bare task strings suitable for parseLine().
 *
 * Rules:
 *   - `# heading` and `## heading` lines → skipped
 *   - `- [x] done item` → skipped (already completed)
 *   - `- [ ] task text` → "task text" extracted
 *   - Plain lines with no list marker → passed through unchanged
 *   - Blank lines → skipped
 *
 * If the input contains no Markdown patterns at all, every non-blank line
 * is returned as-is so the function is safe to call unconditionally.
 *
 * @param text - Raw textarea content, possibly Markdown
 * @returns Array of bare task strings for parseLine()
 */
export function parseMarkdown(text: string): string[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const hasMarkdown = lines.some(l => /^-\s*\[/.test(l) || /^#{1,6}\s/.test(l));

  if (!hasMarkdown) return lines;

  return lines.flatMap(line => {
    if (/^#{1,6}\s/.test(line))   return [];          // heading
    if (/^-\s*\[x\]/i.test(line)) return [];          // checked — skip
    const m = line.match(/^-\s*\[\s*\]\s*(.*)/);
    if (m) return [m[1].trim()];                       // unchecked — extract
    return [];                                         // other (plain list, etc.)
  }).filter(Boolean);
}
