# Demo Mode — Design Spec

**Date:** 2026-05-11

## Context

Mermaid Studio is a self-hosted Mermaid diagram editor with scrypt-based auth and in-memory sessions. There is no way to share a "try it now" link that auto-authenticates a visitor. The goal is to let operators share a URL that automatically logs in the visitor as a pre-configured demo user, with no interaction required.

## Feature Description

When the app loads with `?demo=<uuid>` in the URL, it automatically logs in as the `demo` user using the UUID as the password. A module-level flag is set so other parts of the app can inspect whether demo mode is active.

**Non-goals:** The URL is not cleaned up after detection. No server changes are required. Demo mode does not restrict or alter the user's experience beyond who they are logged in as.

## Implementation

### `js/auth.js`

Modify `checkSession()` to:

1. Read `new URLSearchParams(location.search).get('demo')` at the start.
2. Store the value in a module-level `demoPassword` variable.
3. Export a new function `isDemoMode()` that returns `!!demoPassword`.
4. If `/api/auth/me` returns a non-OK response (no active session) **and** `demoPassword` is set, POST to `/api/auth/login` with `{ username: 'demo', password: demoPassword }`.
5. If the auto-login succeeds, the existing `setUser()` path runs normally.
6. If the auto-login fails (wrong UUID, no demo user), fail silently — user stays logged out.

No other files are changed in the client or server.

### `README.md`

Add a **Demo Mode** section documenting:
- How to create the `demo` user (sign up via the app or via a setup script).
- How to share the demo URL: `https://your-host/?demo=<password>`.
- Security note: the UUID in the URL is the demo account's password — treat it accordingly.

## Pre-requisite (operator responsibility)

A `demo` user must exist in `users.json` with the desired UUID as its password. Created by signing up normally through the app UI with username `demo` and password set to the chosen UUID.

## Files Modified

| File | Change |
|------|--------|
| `js/auth.js` | Add demo mode detection + auto-login to `checkSession()`, export `isDemoMode()` |
| `README.md` | Add Demo Mode section |

## Verification

1. Create a `demo` user via the sign-up form with a known UUID as the password.
2. Visit `/?demo=<uuid>` — the app should load already logged in as `demo`.
3. Visit `/?demo=wrong-uuid` — the app should load logged out with no error shown.
4. Visit `/` (no param) — normal behaviour unchanged.
5. Visit `/?demo=<uuid>` while already logged in as another user — existing session should be preserved (no re-login attempt).
