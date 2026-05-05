import type { Task } from './types.js';

/**
 * Parse one line of task input into a partial Task object.
 *
 * Syntax: `title NNh | NN.Nh | NNm [xN] [pN]`
 * Examples:
 *   "draft email .5h x2, p2"
 *   "ship invoice 1h, p1"
 *   "deep work 2h x3, p3"
 *   "stand-up 15m"
 *
 * @param raw - Raw text line from the textarea
 * @returns Parsed task fields (without id/createdAt) or null if invalid
 */
export function parseLine(raw: string): Omit<Task, 'id' | 'createdAt'> | null {
  const line = raw.trim();
  if (!line) return null;

  // Match duration token: NN.NNh or NNm (case-insensitive)
  const durMatch = line.match(/(\d*\.?\d+)\s*(h|m)/i);
  if (!durMatch) return null;

  const durValue = parseFloat(durMatch[1]);
  const durUnit = durMatch[2].toLowerCase();
  const sessionMin = durUnit === 'h'
    ? Math.round(durValue * 60)
    : Math.round(durValue);

  // Sanity bounds: 15 minutes to 8 hours
  if (sessionMin < 15 || sessionMin > 480) return null;

  // xN: session count, capped at 14
  const xMatch = line.match(/\bx(\d+)\b/i);
  const sessionsTotal = xMatch ? Math.min(14, parseInt(xMatch[1], 10)) : 1;

  // pN: priority 1-4
  const pMatch = line.match(/\bp([1-4])\b/i);
  const priority = (pMatch ? parseInt(pMatch[1], 10) : 3) as 1 | 2 | 3 | 4;

  // Title is everything before the duration token, stripping trailing commas/semicolons
  const title = line.slice(0, durMatch.index).replace(/[,;]\s*$/, '').trim();
  if (!title) return null;

  return {
    title,
    sessionMin,
    sessionsTotal,
    sessionsDone: 0,
    priority
  };
}
