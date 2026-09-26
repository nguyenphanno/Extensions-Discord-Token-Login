/**
 * Vault smoke test.
 *
 * The crypto layer is the one part of this extension where "it typechecks" is
 * not evidence of anything. This exercises the real AES-256-GCM, PBKDF2 and
 * re-key code paths against a fake `chrome.storage`, in Node, with no browser.
 *
 * Each case starts from a clean profile, so one case cannot mask another.
 *
 * Run with `npm run verify:crypto`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

/**
 * The suite is bundled and executed, so the shim has to live inside the
 * generated entry — an in-memory `chrome.storage` the vault can actually use.
 */
const ENTRY = `
import { Vault, VaultAuthError, VaultLockedError } from '${SRC}/crypto/vault';

const record = { token: 'MTIzNDU2Nzg5.YWJjZGVm.0123456789abcdef', account: { id: '1', tag: 'kiro' } };
const other  = { token: 'OTg3NjU0MzIx.dGVmZ2hp.am9rbnFyc3R1dnd4eXox', account: { id: '2', tag: 'nyx' } };

/** Wipes the fake profile so each case starts from a first-run state. */
function fresh() {
  const area = () => {
    const data = new Map();
    return {
      async get(keys) {
        if (keys === null || keys === undefined) return Object.fromEntries(data);
        const out = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (data.has(key)) out[key] = data.get(key);
        }
        return out;
      },
      async set(items) { for (const [k, v] of Object.entries(items)) data.set(k, v); },
      async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k); },
      async clear() { data.clear(); },
      __raw: data,
    };
  };
  globalThis.chrome = { storage: { local: area(), session: area() } };
}

const raw = (id) => globalThis.chrome.storage.local.__raw.get('dtl:rec:' + id);
const out = [];
const check = (name, passed) => out.push([name, Boolean(passed)]);

export async function run() {
  // 1. a fresh profile generates a device key and round-trips a record
  fresh();
  {
    const vault = new Vault();
    await vault.write('1', record);
    check('device round trip', JSON.stringify(await vault.read('1')) === JSON.stringify(record));
    check('device reports unprotected', (await vault.state()) === 'unprotected');
    check('listIds', (await vault.listIds()).join(',') === '1');
  }

  // 2. what lands on disk is ciphertext, not the token
  fresh();
  {
    await new Vault().write('1', record);
    const blob = raw(1);
    check('ciphertext hides token', !JSON.stringify(blob).includes(record.token));
    check('envelope shape', blob.v === 1 && typeof blob.iv === 'string' && typeof blob.ct === 'string');
  }

  // 3. every write draws a fresh IV
  fresh();
  {
    const vault = new Vault();
    await vault.write('1', record);
    const first = raw(1).iv;
    await vault.write('1', { ...record, account: { ...record.account, tag: 'kiro2' } });
    check('IV never reused', first !== raw(1).iv);
  }

  // 4. the device key survives a worker restart
  fresh();
  {
    await new Vault().write('1', record);
    const read = await new Vault().read('1');
    check('device key persists across instances', read !== null && read.account.tag === 'kiro');
  }
  // 5. passphrase mode: wrong passphrase rejected, right one accepted
  fresh();
  {
    const vault = new Vault();
    await vault.write('1', record);
    await vault.setPassphrase('correct horse battery');

    let rejected = false;
    try {
      await vault.unlock('wrong passphrase');
    } catch (error) {
      rejected = error instanceof VaultAuthError;
    }
    check('wrong passphrase rejected', rejected);

    await vault.unlock('correct horse battery');
    check('right passphrase unlocks', (await vault.state()) === 'unlocked');

    const read = await vault.read('1');
    check('record survives re-key', read !== null && read.account.tag === 'kiro');
  }

  // 6. re-key migrates every record and replaces the old ciphertext
  fresh();
  {
    const vault = new Vault();
    await vault.write('1', record);
    await vault.write('2', other);
    const before = raw(2).ct;

    await vault.setPassphrase('a different passphrase');
    check('re-key rewrote ciphertext', before !== raw(2).ct);
    check('both records survive', (await vault.listIds()).length === 2);

    const second = await vault.read('2');
    check('second record intact', second !== null && second.account.id === '2');
  }

  // 7. locking hides records until the passphrase comes back
  fresh();
  {
    const vault = new Vault();
    await vault.write('1', record);
    await vault.setPassphrase('lock me');
    vault.lock();
    check('locked state', (await vault.state()) === 'locked');

    let threw = false;
    try {
      await vault.read('1');
    } catch (error) {
      threw = error instanceof VaultLockedError;
    }
    check('locked vault refuses reads', threw);

    await vault.unlock('lock me');
    check('unlock restores access', (await vault.read('1')) !== null);
  }

  // 8. dropping the passphrase re-keys again and stays readable
  fresh();
  {
    const vault = new Vault();
    await vault.write('1', record);
    await vault.setPassphrase('temporary');
    await vault.removePassphrase();

    check('device mode restored', (await vault.state()) === 'unprotected');
    const read = await vault.read('1');
    check('readable after passphrase removed', read !== null && read.token === record.token);
  }

  // 9. destroy wipes everything and leaves a fresh device vault
  fresh();
  {
    const vault = new Vault();
    await vault.write('1', record);
    await vault.destroy();
    check('destroy clears records', (await vault.listIds()).length === 0);
    check('destroy resets to device mode', (await vault.state()) === 'unprotected');
  }

  return out;
}
`;

/* ------------------------------------------------------------------- main */

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'dtl-smoke-'));
  const entryFile = join(dir, 'entry.mjs');
  const outFile = join(dir, 'bundle.mjs');
  writeFileSync(entryFile, ENTRY, 'utf8');

  try {
    await esbuild.build({
      entryPoints: [entryFile],
      outfile: outFile,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: ['node20'],
      logLevel: 'silent',
    });

    const { run } = await import(pathToFileURL(outFile).href);
    const results = await run();

    let failed = 0;
    for (const [name, passed] of results) {
      if (!passed) failed += 1;
      process.stdout.write(`  ${passed ? 'PASS' : 'FAIL'}  ${name}\n`);
    }

    process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
    if (failed > 0) process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
