# Privacy Policy

**Discord Token Login** runs entirely inside your browser. This project operates
no servers, collects no analytics, and sends nothing anywhere except Discord
itself.

## What it handles

| Data | Why |
| --- | --- |
| Discord session tokens you paste or capture | To validate the account and sign in on your behalf |
| Account metadata returned by Discord (`id`, username, avatar, decoration) | So the account list can render an identity |
| Notes you attach to an account | Local reminders, stored with the account |
| Preferences (badge, focus behaviour, reveal/masking, window handling) | To remember how you configured the extension |

## Where it lives

- **Tokens** are encrypted with AES-256-GCM before they reach
  `chrome.storage.local`. Nothing token-shaped is ever stored in plaintext.
- **Preferences** are stored in plaintext in `chrome.storage.local`; they
  contain no secrets.
- **In passphrase mode**, the unlock key is held in `chrome.storage.session`
  (memory-backed, unreadable from content scripts, cleared when the browser
  closes).
- Nothing is written outside the browser profile.

## Network activity

There are exactly two destinations, both Discord's:

- `https://discord.com/api/v9/users/@me` — to validate a token and fetch the
  owning account.
- `https://cdn.discordapp.com` — to render avatars and avatar decorations in
  the account list.

No other host is ever contacted. No request contains anything beyond the token
being checked. There is no analytics, no crash reporting, no telemetry and no
remote code.

## Permissions and why they exist

- `storage` — save accounts (encrypted) and preferences.
- `scripting` — read a live session's token from a Discord tab, and write a
  session back when you sign in.
- `contextMenus` — the right-click menu on the toolbar icon.
- Host access to `https://discord.com/*` — the only site the extension can
  touch.

## Your control

- **Remove an account** — deletes its encrypted record immediately.
- **Wipe vault** (options page) — deletes every account and all key material.
- **Uninstall** — Chrome removes all extension storage with the extension.

## Changes and contact

Material changes to this policy are noted in the repository history of this
file. Questions and reports: open an issue, or for vulnerabilities follow
[SECURITY.md](SECURITY.md).
