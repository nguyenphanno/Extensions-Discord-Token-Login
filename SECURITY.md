# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a suspected vulnerability. Use GitHub's
private reporting instead:

**Security tab → "Report a vulnerability"** →
<https://github.com/nguyenphanno/Extensions-Discord-Token-Login/security/advisories/new>

A useful report includes:

- the affected commit or release,
- the steps to reproduce,
- the impact you believe it has, and
- any suggested fix, if you have one.

You can expect an acknowledgement within **72 hours** and a triage decision
within **7 days**. Fixes land on `main` and are noted in the release that
carries them; your name is credited in the advisory unless you ask otherwise.

## Supported versions

Only the latest release is supported. The extension does not auto-update, so a
copy built from an older tag keeps whatever it shipped with — pin to a tag you
have reviewed and rebuild after pulling fixes.

## Scope

**In scope**

- The vault: the AES-256-GCM envelope, PBKDF2 parameters, the re-key path and
  how key material is held (`src/crypto/`).
- Token capture and session injection (`src/services/token-extractor.ts`,
  `src/services/session-injector.ts`).
- The message boundary between the UI surfaces and the service worker
  (`src/background/router.ts`, `src/platform/messaging.ts`).
- Log redaction, the manifest (permissions, CSP) and the build pipeline.

**Out of scope**

- Anything that requires code execution on the user's machine. Device-key mode
  is documented as unable to defend against that — it is a stated limitation,
  not a vulnerability (see the threat model below).
- Physical access to an unlocked, signed-in browser profile.
- Discord-side issues. Report those to Discord.
- Malicious forks of this repository.

## Threat model, in one paragraph

Tokens are AES-256-GCM ciphertext at rest with a fresh 96-bit IV per write. In
**passphrase** mode the key is derived with PBKDF2-HMAC-SHA256 (310 000
iterations) and is never written to disk — it lives in `chrome.storage.session`,
which is memory-backed and cleared when the browser closes. In **device** mode
the key sits in `chrome.storage.local` next to the ciphertext: that defeats a
copied profile, a synced backup and casual devtools inspection, but it does not
defeat code already running as you. Both statements are load-bearing parts of
the design and are documented in the README.

The extension talks to nothing except `discord.com` and its CDN, ships no
telemetry, and loads no remote code.

## Hardening for users

- Prefer passphrase mode when the machine is shared or backed up.
- Treat a captured token as a password: anyone holding it controls the account
  until the next password change.
- If a token may have been exposed, change the Discord password (which
  invalidates sessions) and re-capture.
