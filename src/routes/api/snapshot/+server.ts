import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'snapshots');
const KEEP = 500;

await mkdir(DIR, { recursive: true });

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) return new Response(null, { status: 405 });
  const body = await request.text();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(join(DIR, `${ts}.json`), body, 'utf-8');
  await prune();
  return new Response(null, { status: 204 });
};

async function prune() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.json')).sort();
  const excess = files.length - KEEP;
  if (excess > 0) {
    await Promise.all(files.slice(0, excess).map(f => unlink(join(DIR, f))));
  }
}
