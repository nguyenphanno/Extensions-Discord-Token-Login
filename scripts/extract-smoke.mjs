import { mkdtempSync as mk1, rmSync as rm1, writeFileSync as wf1 } from 'node:fs';
import { tmpdir as td1 } from 'node:os';
import { dirname as dn1, join as jn1, resolve as rs1 } from 'node:path';
import { fileURLToPath as fp1, pathToFileURL as pu1 } from 'node:url';
import * as eb from 'esbuild';
const RT = rs1(dn1(fp1(import.meta.url)), '..');
const SR = jn1(RT, 'src').replace(/\\/g, '/');
const TK = 'A'.repeat(24) + '.' + 'B'.repeat(6) + '.' + 'C'.repeat(27) + '12';
const lines = [
  "import { extractFromActiveSession, NoDiscordTabError } from '__SRC__/services/token-extractor';",
  'const out = [];',
  'const check = (name, passed) => out.push([name, Boolean(passed)]);',
  'const read = (over) => ({ url: "https://discord.com/app", frameUrl: "https://discord.com/app", candidates: [], storageKeys: [], hasApp: false, hasTokenFn: false, reason: "no-session", ...over });',
  'const hit = () => read({ candidates: [{ token: "__TOKEN__", origin: "memory", key: null, probe: "memory", strict: false }] });',
];
const more = [
  'function browser(options) {',
  '  const state = { executes: 0, reloads: 0, gets: 0 };',
  '  let tab = { id: 7, active: true, status: "complete", url: "https://discord.com/app" };',
  '  if (options.tab !== undefined) tab = { ...tab, ...options.tab };',
  '  let frames = options.reads || [];',
  '  globalThis.chrome = { tabs: {',
  '    query: async () => [tab],',
  '    get: async () => { state.gets += 1; const nx = (options.answers || [])[state.gets - 1]; if (nx !== undefined) tab = { ...tab, ...nx }; return tab; },',
  '    reload: async () => { state.reloads += 1; if (options.afterReload !== undefined) frames = options.afterReload; },',
  '  }, scripting: { executeScript: async () => { state.executes += 1; return frames.map((result) => ({ frameId: 0, result })); } } };',
  '  globalThis.fetch = async () => ({ ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => "{}", json: async () => ({ id: "1", username: "a", discriminator: "0", avatar: null, bot: false, public_flags: 0, verified: true, mfa_enabled: false }) });',
  '  return state;',
  '}',
  'export async function run() {',
  '  { const s = browser({ reads: [hit()] }); const o = await extractFromActiveSession(1); check("ready captures", o.token === "__TOKEN__"); check("ready costs no reload", s.reloads === 0); }',
  '  { const s = browser({ answers: [{ url: "about:blank" }, { url: "https://discord.com/app" }], reads: [hit()] }); const o = await extractFromActiveSession(60000); check("blank waited out", s.gets >= 2 && o.token === "__TOKEN__"); check("wait costs no reload", s.reloads === 0); }',
  '  { const s = browser({ tab: { url: "about:blank" }, answers: [{ url: "about:blank", status: "complete" }] }); let m = ""; try { await extractFromActiveSession(1); } catch (e) { m = e instanceof NoDiscordTabError ? e.message : "wrong"; } check("unreachable named", m.includes("never reached discord.com")); check("unreachable reads nothing", s.executes === 0); }',
  '  { const s = browser({ reads: [read({ url: "about:blank", reason: "no-storage" })] }); let m = ""; try { await extractFromActiveSession(1); } catch (e) { m = e instanceof NoDiscordTabError ? e.message : "wrong"; } check("no-storage named", m.includes("nowhere to store a session")); check("one reload spent", s.reloads === 1); check("retry reads again", s.executes === 2); }',
  '  { const s = browser({ reads: [read({ url: "about:blank", reason: "no-storage" })], afterReload: [hit()] }); const o = await extractFromActiveSession(1); check("reload lets read land", o.token === "__TOKEN__"); check("recovered costs one reload", s.reloads === 1); }',
  '  return out;',
  '}',
];
async function main() {
  const src = lines.concat(more).join('\n');
  const all = src.split('__SRC__').join(SR).split('__TOKEN__').join(TK);
  const dir = mk1(jn1(td1(), 'dtl-extract-'));
  const entry = jn1(dir, 'entry.mjs');
  const bundle = jn1(dir, 'bundle.mjs');
  wf1(entry, all, 'utf8');
  try {
    await eb.build({
      entryPoints: [entry],
      outfile: bundle,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: ['node20'],
      logLevel: 'silent',
    });
    const mod = await import(pu1(bundle).href);
    const results = await mod.run();
    let failed = 0;
    for (const pair of results) {
      const ok = pair[1];
      if (!ok) failed += 1;
      process.stdout.write('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + pair[0] + '\n');
    }
    const total = results.length;
    process.stdout.write('\n' + String(total - failed) + '/' + String(total) + ' checks passed\n');
    if (failed > 0) process.exit(1);
  } finally {
    rm1(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  process.stderr.write(String(e && e.stack ? e.stack : e) + '\n');
  process.exit(1);
});
