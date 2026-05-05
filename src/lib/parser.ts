import type { Task } from './types.js';

/**
 * Parse one line of task input into a partial Task object.
 *
 * Syntax: `title NNh | NN.Nh | NNm | NN.NN  [xN]  [pN]`
 * Examples:
 *   "draft email .5h x2, p2"
 *   "ship invoice 1h, p1"
 *   "Court prep 1hx2 p1"     ← xN attached directly to duration
 *   "Motel tax .5 p1"        ← bare decimal treated as hours
 *
 * Returns null only when the line is empty or has no parseable title.
 * Missing duration → caller should apply a default (30 m, p3).
 *
 * @param raw - Raw text line
 * @returns Parsed task fields or null if line is blank / has no title
 */
export function parseLine(raw: string): Omit<Task, 'id' | 'createdAt'> | null {
  const line = raw.trim();
  if (!line) return null;

  // ── Duration ────────────────────────────────────────────────────────────
  const durWithUnit = line.match(/(\d*\.?\d+)\s*(h|m)/i);
  const durBare     = durWithUnit ? null : line.match(/(\d*\.\d+)(?=[\s,]|$)/);
  const durMatch    = durWithUnit ?? durBare;

  let sessionMin = 30; // default if no duration found
  let durIndex   = line.length; // where the duration token starts (for title extraction)

  if (durMatch) {
    const durValue = parseFloat(durMatch[1]);
    const durUnit  = durWithUnit ? durMatch[2].toLowerCase() : 'h';
    sessionMin     = durUnit === 'h' ? Math.round(durValue * 60) : Math.round(durValue);
    durIndex       = durMatch.index ?? line.length;
    if (sessionMin < 15 || sessionMin > 480) sessionMin = 30;
  }

  // ── Session count (xN) ───────────────────────────────────────────────────
  const durEnd      = durMatch ? (durMatch.index ?? 0) + durMatch[0].length : line.length;
  const xAttached   = durMatch ? line.slice(durEnd).match(/^x(\d+)/i) : null;
  const xStandalone = xAttached ? null : line.match(/(?<=[\s,])x(\d+)/i);
  const xRaw        = xAttached?.[1] ?? xStandalone?.[1];
  const sessionsTotal = xRaw ? Math.min(14, parseInt(xRaw, 10)) : 1;

  // ── Priority (pN) ────────────────────────────────────────────────────────
  const pMatch   = line.match(/\bp([1-4])\b/i);
  const priority = (pMatch ? parseInt(pMatch[1], 10) : 3) as 1 | 2 | 3 | 4;

  // ── Title ────────────────────────────────────────────────────────────────
  // Take text before the duration token; strip metadata tokens (pN, xN) that
  // appear before the duration so they don't bleed into the title.
  const title = line.slice(0, durIndex)
    .replace(/\s+[px]\d+\b/gi, '')
    .replace(/[,;]\s*$/, '')
    .trim();

  if (!title) return null;

  return { title, sessionMin, sessionsTotal, sessionsDone: 0, priority };
}

/**
 * Pre-process a block of text that may contain GitHub-flavoured Markdown
 * task-list syntax, returning bare task strings for parseLine().
 *
 * Rules:
 *   - `# heading` → skipped, resets nesting context
 *   - `- [x] done` → skipped at any indent level
 *   - `- [ ] task` → extracted; if indented under an unchecked parent,
 *     emitted as "parent: child"
 *   - Plain lines with no list marker → passed through as-is when no
 *     Markdown patterns are detected
 *
 * @param text - Raw textarea content, possibly Markdown
 * @returns Array of bare task strings for parseLine()
 */
export function parseMarkdown(text: string): string[] {
  const rawLines   = text.split('\n');
  const hasMarkdown = rawLines.some(
    l => /^[\t ]*-\s*\[/.test(l) || /^\s*#{1,6}\s/.test(l)
  );

  if (!hasMarkdown) return rawLines.map(l => l.trim()).filter(Boolean);

  const result: string[]    = [];
  let lastParent: string | null = null; // last unchecked top-level item text

  for (const raw of rawLines) {
    const indented = /^(\t| {2,})/.test(raw);
    const line     = raw.trim();
    if (!line) continue;

    // Heading — reset parent context
    if (/^#{1,6}\s/.test(line)) {
      lastParent = null;
      continue;
    }

    const checked   = line.match(/^-\s*\[x\]\s*(.*)/i);
    const unchecked = line.match(/^-\s*\[\s*\]\s*(.*)/);

    if (checked) {
      if (!indented) lastParent = null; // checked top-level resets context
      continue;                         // never import checked items
    }

    if (unchecked) {
      const text = unchecked[1].trim();
      if (!text) continue;

      if (indented && lastParent) {
        result.push(`${lastParent}: ${text}`);
        // nested items don't become new parents
      } else {
        result.push(text);
        if (!indented) lastParent = text;
      }
      continue;
    }
    // Non-list, non-heading lines are ignored in markdown mode
  }

  return result.filter(Boolean);
}
