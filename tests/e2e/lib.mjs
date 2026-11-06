import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

export function chromePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  const d = readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
  // the folder is chrome-linux in older Playwright builds and chrome-linux64 in newer ones; /opt/pw-browsers/chromium links to it when present
  for (const p of [`${base}/${d}/chrome-linux/chrome`, `${base}/${d}/chrome-linux64/chrome`, `${base}/chromium`]) if (existsSync(p)) return p;
  throw new Error('Chromium not found in ' + base);
}

export async function startPreview(port = 4173) {
  const p = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) return { url: `http://localhost:${port}/`, stop: () => p.kill() }; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  p.kill(); throw new Error('preview did not start');
}

export async function launch(opts = {}) {
  return chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', ...(opts.args || [])] });
}

export async function openGame(browser, url, query = '', ctxOpts = {}, initScript = null, initArg = null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...ctxOpts });
  if (initScript) await ctx.addInitScript(initScript, initArg);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(url + (query ? '?' + query : ''));
  return { ctx, page, errors };
}
