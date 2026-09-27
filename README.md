<div align="center">

<img src="./images/banner.png" alt="Discord Token Login" width="100%" />

# Discord Token Login

**The multi-account manager and token switcher for Discord**  
*A Chromium (Manifest V3) extension. Everything runs locally — no analytics, no telemetry, no third-party endpoints.*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-5865F2?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro)
[![AES-256-GCM](https://img.shields.io/badge/AES--256--GCM-5865F2?style=flat-square&logo=lock&logoColor=white)](#-security-model)
[![Zero Telemetry](https://img.shields.io/badge/Zero-Telemetry-57F287?style=flat-square&logo=shield&logoColor=white)](#-security-model)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![Build](https://img.shields.io/badge/Build-Passing-57F287?style=flat-square&logo=githubactions&logoColor=white)](#-development--quality-gates)
[![Tests](https://img.shields.io/badge/Tests-134%2F134-57F287?style=flat-square&logo=jest&logoColor=white)](#-development--quality-gates)
[![License: MIT](https://img.shields.io/badge/License-MIT-ED4245?style=flat-square)](LICENSE)

</div>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-installation">Install</a> •
  <a href="#-security-model">Security</a> •
  <a href="#-how-token-capture-works">How it works</a> •
  <a href="#-development--quality-gates">Development</a> •
  <a href="#-star-history">Star History</a>
</p>

---

## 🌐 Languages

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/README-English-5865F2?style=flat-square&logo=googlechrome&logoColor=white" alt="English" /></a>
  <a href="./README_VI.md"><img src="https://img.shields.io/badge/README-Ti%E1%BA%BFng_Vi%E1%BB%87t-5865F2?style=flat-square" alt="Tiếng Việt" /></a>
  <a href="./README_ZH.md"><img src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-5865F2?style=flat-square" alt="简体中文" /></a>
  <a href="./README_KO.md"><img src="https://img.shields.io/badge/README-%ED%95%9C%EA%B5%AD%EC%96%B4-5865F2?style=flat-square" alt="한국어" /></a>
  <a href="./README_JA.md"><img src="https://img.shields.io/badge/README-%E6%97%A5%E6%9C%AC%E8%AA%9E-5865F2?style=flat-square" alt="日本語" /></a>
</p>

---
## 📸 Demo

<div align="center">

### Main popup — quick login, account switching, and session status

<img src="./images/popup.png" alt="Discord Token Login popup" width="820" />

<br />

### Account manager — multiple profiles, token health, and private notes

<img src="./images/accounts.png" alt="Discord Token Login account manager" width="820" />

<br />

### Settings — encryption mode, passphrase vault, and capture behaviour

<img src="./images/settings.png" alt="Discord Token Login settings" width="820" />

</div>

---

## ✨ Features

| Area | What it does |
| --- | --- |
| **Quick login** | Paste a token and sign in. The token is validated before it is written anywhere. |
| **Token capture** | Read the token straight out of a Discord tab that is already signed in, without copying anything by hand. |
| **Account manager** | Keep several accounts, switch between them, attach local notes, and see which tokens are still healthy — avatars and avatar decorations included. |
| **Encrypted storage** | Every token is sealed with **AES-256-GCM** before it reaches `chrome.storage.local`. Optional passphrase protection derives the key with **PBKDF2-HMAC-SHA256** at 310 000 iterations. |
| **Context menu** | Right-click the toolbar icon for quick login, token capture, and settings — no need to open the popup first. |
| **Toolbar badge** | Shows how many accounts are stored without opening anything. |
| **Clean UI** | Dark interface built on Discord's 2023 palette, Tabler's filled icon set vendored at build time, and a design system built on scales rather than ad-hoc values. |

---

## 📥 Installation

### From source

```bash
git clone https://github.com/nguyenphanno/Extensions-Discord-Token-Login.git
cd Extensions-Discord-Token-Login
npm install          # once
npm run build        # writes dist/
```

### Load it in your browser

Then in Chrome, Edge, Brave, Opera or Arc:

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

> **npm may print an `install-scripts` warning.** npm 11 blocks dependency
> lifecycle scripts by default. esbuild does not need one — its platform binary
> arrives through the optional dependency `@esbuild/win32-x64` — so the build
> works anyway. You can ignore the warning.

### Requirements

| | |
| --- | --- |
| **Browser** | Chrome / Edge / Brave / Opera / Arc 116+ (Manifest V3) |
| **Node.js** | 20 or newer (for building and the verification suites — the extension itself needs no runtime) |
| **Permissions** | `storage`, `scripting`, `contextMenus`, plus host access to `https://discord.com/*` — all declared in `src/manifest.json` |

---

## 🔒 Security model

Stated plainly, because tools that overstate their guarantees are worse than
tools that admit their limits.

**What is guaranteed**

- Tokens are AES-256-GCM ciphertext at rest. A 96-bit random IV is drawn for
  every single write — a `(key, nonce)` pair is never reused.
- In **passphrase** mode the key is derived from your passphrase and is *never*
  written to disk. It lives in `chrome.storage.session`, which is memory-backed,
  unreachable from content scripts, and wiped when the browser closes.
- A failed passphrase produces the same error as a tampered record, so an
  attacker cannot distinguish "wrong password" from "corrupt data".
- Switching protection mode re-encrypts every record, and a failed write rolls
  back to the previous ciphertexts rather than leaving a half-migrated vault.

**What is not guaranteed**

- In **device key** mode (the default) the key sits in `chrome.storage.local`
  next to the ciphertext. This defeats a copied profile, a synced backup, and
  someone casually opening devtools. It does **not** defeat code that is already
  running on your machine.
- The extension can read a Discord token because that is what it is for. Treat
  it like any other tool that can touch credentials: install it from a source
  you trust.
- Discord's terms of service govern the use of tokens, including your own.

**Leaving traces?** The logger redacts anything token-shaped before it reaches
the service worker console, so turning on verbose logging cannot be the thing
that leaks a credential into `chrome://extensions`.

### Data flow at a glance

```
token in  ──►  structural check  ──►  AES-256-GCM seal  ──►  chrome.storage.local
                                               ▲
                                               │
                        device key  ────────────┤
                        PBKDF2(passphrase) ─────┘   (passphrase mode:
                                                       key lives only in
                                                       chrome.storage.session)
```

### Threat model summary

| Scenario | Device key mode | Passphrase mode |
| --- | --- | --- |
| Stolen browser profile | ⚠️ Key + ciphertext travel together | ✅ Only ciphertext is on disk |
| Synced / backed-up profile | ⚠️ Both copies are readable | ✅ Ciphertext only |
| Someone opening devtools | ⚠️ Visible | ✅ Visible, but useless without the passphrase |
| Malware already running as you | ❌ Not defended | ❌ Not defended |
| Browser closed | Key persists | ✅ Key wiped from memory |

---

## 🧠 How token capture works

A Discord tab's session is owned by the page, so capture goes through
`chrome.scripting.executeScript` with `world: 'MAIN'` — inside the page's own
JavaScript context. A content script runs in an isolated world and can see
neither page storage nor the client's modules.

Discord does **not** keep the token under a fixed storage key. The running
client holds it in memory and mirrors it into `localStorage` only while the page
is unloading, so `localStorage.getItem('token')` comes back empty on a session
that is very much alive. Capture therefore tries four layers in order and
reports which one answered:

1. **The documented key** — right on older builds, and on a page that has only
   just finished loading.
2. **A synthetic `beforeunload`** — the signal the client itself flushes on, so a
   running client publishes what it holds. Nothing is written here; the extension
   only rings the client's bell.
3. **The client's own `getToken()`** — reached through the bundler's module
   cache, by pushing a no-op chunk that hands the callback the cache. This is
   what works on a tab that has been open for hours. Only the module that can
   *also write* a token counts as the auth store; the chunk entry is popped
   again, so the page is left exactly as it was found.
4. **A bounded scan of storage values** for a token-shaped string, so a build
   that moves the token to a new key stays readable. A value that *is* a session
   token is accepted whatever the key is called; one buried in a larger blob is
   only lifted out of a key whose name says what it holds.

```
 ┌──────────────────────────────────────────────────────────┐
 │            Discord tab token extraction                  │
 └──────────────────────────────────────────────────────────┘
          │
          │  1. documented storage key
          │  2. synthetic beforeunload  → memory flush
          │  3. bundler module cache    → getToken()
          │  4. bounded storage scan    → token-shaped value
          ▼
   candidates ranked by provenance + structure
          │
          ▼
   Discord /users/@me decides which one is real
```

The page only *proposes*. Other modules in the client hand out strings with
exactly a token's length and character set — a captcha, an analytics id, a nonce
— and nothing local can tell those from a session. So the page returns every
plausible value, tagged with where it came from and whether it has a real
token's *structure* (base64url segments whose first one decodes to a numeric
account id), and the worker asks Discord which one is real: candidates are tried
in order of trust, up to a small cap, and the first one Discord accepts wins. A
false positive costs one request instead of the whole capture, and a capture
that finds nothing usable now says so instead of showing a bare 401.

### How sign-in works

Signing in is the same story in reverse, with the same trap: the client
publishes the session it holds in memory while the page unloads, so a plain
storage write is undone by the very reload meant to activate it. The write
therefore

- stores the token the way the client stores it — JSON-quoted, which is what
  `getItem` returns whenever the value is there at all;
- calls the client's own `setToken` when it can be found, waiting briefly for
  the module cache to fill as the bundle boots; and
- registers a one-shot `beforeunload` listener that re-asserts the intended
  value. Listeners run in registration order, so ours runs after the client's
  own handler and wins. It removes itself, so later navigations are untouched.

Signing out uses the same guard with the opposite intent, which is why a signed
out tab stays signed out across the reload.

```
  setToken()      ─┐
  storage write   ─┼─►  beforeunload  ─►  reload  ─►  session active
  unload guard    ─┘        ▲
                          └── registered last, so it outranks the client's own
```

> ⚠️ **Only ever capture your own account.** A token is a password. This project
> is an independent tool and is **not affiliated with, endorsed by, or connected
> to Discord Inc.** Using tokens — including your own — is governed by Discord's
> Terms of Service.

---

## 📁 Project structure

```
src/
├── manifest.json          MV3 manifest
├── assets/icons/          generated PNGs (16/32/48/128/512)
│
├── core/                  no Chrome APIs, no DOM — pure domain logic
│   ├── constants.ts       every tunable value in the project
│   ├── types.ts           domain model + worker message protocol
│   ├── logger.ts          scoped logging with token redaction
│   └── utils/             encoding, async/control flow, formatting
│
├── crypto/                the vault
│   ├── aes-gcm.ts         envelope encryption
│   ├── key-derivation.ts  PBKDF2 / device keys
│   └── vault.ts           lock state machine, atomic re-key
│
├── platform/              thin wrappers over Chrome APIs
│   ├── messaging.ts       typed request/response to the worker
│   └── settings.ts        plaintext preferences
│
├── services/              application logic
│   ├── discord-client.ts  the only module that calls the Discord API
│   ├── account-service.ts orchestration
│   ├── session-injector.ts sign in / sign out
│   └── token-extractor.ts  capture from a live tab
│
├── background/            service worker
│   ├── index.ts           listener wiring only
│   ├── router.ts          request → handler, never throws
│   ├── menu.ts            right-click menu
│   └── badge.ts           toolbar badge
│
├── ui/                    shared, framework-free
│   ├── icons.ts           the SVG icon set
│   ├── dom.ts             element helpers
│   ├── feedback.ts        toasts, sheets, busy states
│   └── styles/            tokens → base → components
│
├── popup/                 380 × 600 popup surface
└── options/               full settings tab
```

The dependency direction is strictly one-way: `ui → platform → services →
crypto → core`. Nothing in `core/` imports a Chrome API, which is what keeps the
security-critical code testable in isolation.

### Design system

`src/ui/styles/tokens.css` holds every colour, spacing step, type size, radius
and duration. Components reference tokens only, never raw values. Colour is
sampled from Discord's live web client so the extension reads as part of the
product rather than a bolt-on, and it is used semantically: blurple is reserved
for the primary action, green/red/amber mean valid/expired/needs-attention, and
nothing else is coloured at all.

Interface icons come from Tabler's filled set, vendored at build time:
`scripts/gen-icons-ts.mjs` reads the SVG paths straight out of
`node_modules/@tabler/icons` into `src/ui/icon-paths.ts`, which `src/ui/icons.ts`
turns into inline SVG. The result is no icon font, no network fetch, and one
licensed (MIT) source for every glyph in the UI, all on the same 24×24 grid. The
toolbar PNGs are a different thing and are still drawn analytically by
`scripts/generate-icons.mjs`, so the mark stays crisp at 16 px with no native
image dependency in the toolchain.

---

## 🛠️ Development & quality gates

```bash
npm install

npm run typecheck      # tsc --noEmit, strict
npm run lint          # eslint + prettier over the whole repo
npm run verify:crypto  # exercises the real AES-GCM / PBKDF2 / re-key paths
npm run verify:api     # asserts on the request the token travels in
npm run verify:signin  # drives sign-in against stubbed browser APIs
npm run verify:extract  # drives capture against stubbed Discord tabs
npm run verify:format  # exercises the pure formatting + CDN URL helpers
npm run verify:page    # drives the injected page functions against a fake page
npm run verify:docs    # every relative link in the READMEs resolves
npm run build          # bundle + copy + verify into dist/
npm run watch          # incremental rebuild
npm run icons          # regenerate the PNG set
npm run icons:preview  # build an icon contact sheet in icon-sheet.html
npm run clean          # remove dist/
npm run pack           # build + wrap dist/ into a store-ready zip
npm run verify         # all ten gates in order
```

The build refuses to emit a `dist/` whose manifest or HTML references a file
that does not exist — a broken package fails the build rather than Chrome.

| Gate | Checks | What it exists for |
| --- | --- | --- |
| `typecheck` | strict `tsc` | Types, dead imports, API drift |
| `lint` | eslint + prettier | Unused code, undefined globals, style drift — the mechanical errors `tsc` alone cannot see |
| `verify:crypto` | 20 | Ciphertext hides the token, no IV reuse, wrong passphrase rejected, locking works, re-key migrates every record without loss |
| `verify:api` | 18 | The token travels in the right header with no prefix or whitespace; 200/401/429 are classified correctly |
| `verify:signin` | 15 | Sign-in waits for a committed document, falls back across frames, recovers via single reload, and reports the tab rather than the token on failure |
| `verify:extract` | 11 | Capture waits for a committed document, names each failure mode it meets, and spends exactly one reload on the no-storage recovery |
| `verify:page` | 41 | The four capture layers, candidate ranking, and the unload guard that outranks the client's own handler |
| `verify:format` | 23 | Decoration + avatar CDN URLs, token-list parsing, snowflake decoding and time buckets |
| `verify:docs` | 6 | Every relative link across the five READMEs resolves to a real file |
| `build` | manifest + HTML | Every referenced file exists in `dist/` |

Each suite exists because of a real bug it caught. `verify:crypto` found a
first-run bug where a fresh profile generated its device key but kept reading
pre-initialisation metadata. `verify:api` caught a `Token ` prefix that made
Discord answer `401 Unauthorized` to perfectly valid tokens while every other
gate stayed green. `verify:page` reproduces Chrome's injection model exactly — the
function's own source evaluated in a bare realm — because the bug that made
capture fail for months was an injected function reaching for a module binding
that does not exist in the page, swallowed by its own `try/catch`.

---

## ❓ FAQ

**Does this steal my account?**
No. There is no server, no analytics, and no network call to anything but
`discord.com`. Read `src/manifest.json` and `src/services/discord-client.ts` —
they are short, and the whole codebase is auditable.

**Why not just read `localStorage.getItem('token')`?**
Because modern Discord keeps the token in memory and only mirrors it into
storage while the page unloads. See [How token capture works](#-how-token-capture-works).

**My account shows as expired.**
Discord invalidated the session. Re-capture the token from a tab that is still
signed in and save it again.

**Can I use it on Firefox?**
Not as-is. The extension targets Chromium MV3 and uses
`chrome.scripting.executeScript` with `world: 'MAIN'`, which Firefox does not
implement the same way.

**Does the passphrase mode protect me from malware?**
No. Anything already running as you can read process memory. It protects the
*stored* copy, which is the realistic risk for a shared or backed-up machine.

---

## 📈 Star history

Show your support by starring this repository!

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
  </picture>
</p>

---

## ⚠️ Disclaimer

- This project is an independent open-source tool and is **not affiliated,
  associated, authorized, endorsed by, or in any way officially connected with
  Discord Inc.**
- "Discord" and Discord logos are trademarks of Discord Inc.
- Use this extension responsibly and in compliance with Discord's Terms of
  Service. Never share your authentication tokens with untrusted parties.
- The authors are not responsible for any account loss or restriction resulting
  from misuse.

---

## 📜 License

Distributed under the [MIT License](LICENSE). Built with ❤️ by
[nguyenphanno](https://github.com/nguyenphanno).

For an incremental rebuild while editing, use `npm run watch`.

