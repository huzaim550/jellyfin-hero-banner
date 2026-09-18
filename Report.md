# Hero Banner — Bug Report

What was broken, why, and what was changed. Every fix below was reproduced on a
real Jellyfin instance and verified in a browser before and after.

**Test setup:** two Jellyfin servers running under podman — 10.9.11 on port 8096
and 10.11.11 on port 8097 — each with sample Movies / TV Shows / Music
libraries. Verification was driven with Playwright against a real Chromium
browser: 21 behavioural checks plus 9 edge-case checks, run against **both**
server versions.

---

## Bug 1 — The Save button on the settings page did nothing

**This was the main bug, and the one the earlier commits kept chasing.**

### Symptom

Dashboard → Plugins → Hero Banner opened, but:

- every field was empty, even after settings had been saved
- pressing **Save** produced no request and no error — the page just sat there
- nothing was ever persisted, so the banner always ran on its defaults

### Root cause

The page's `<script>` element sat **outside** the `<div data-role="page">`:

```html
<div id="HeroBannerConfigPage" data-role="page">
    ...the form...
</div>
<script>  <!-- dropped by Jellyfin before the browser ever saw it -->
```

jellyfin-web does not insert a plugin config page as-is. It fetches the HTML and
runs it through `viewContainer.parseHtml()`, which **reduces the document to the
single `div[data-role="page"]` element** and then executes only the script
elements found *inside* that element:

```js
wrapper.querySelector('div[data-role="page"]')   // everything else is discarded
```

Anything outside that div — including a trailing `<script>` — is thrown away
before parsing. So the script never ran:

- no code to fill the form from the server → the fields rendered empty
- no `submit` handler → clicking Save did nothing observable

That is the whole bug. The save logic itself was fine; it was never loaded.

Measured on the broken build: `scriptsInsidePageDiv: 0`.

### Fix

`Configuration/configPage.html`:

- the `<script>` now lives **inside** the `data-role="page"` div (with a comment
  explaining why it must stay there — it is a silent failure if it moves)
- a `window.__heroBannerConfigBound` guard, because the view markup is
  re-inserted on every visit and the script can run more than once — without it,
  one Save could fire twice
- all lookups made null-safe, so a future markup change cannot throw and leave
  the page dead
- `submit` is bound on `document` (delegated), so it survives the markup being
  replaced
- config loading runs on Jellyfin's `pageshow` event, with a short timer as a
  fallback for the case where that event never arrives — the form can no longer
  stay empty
- errors now surface in a status area instead of failing silently

---

## Bug 2 — The banner showed up on the Favorites tab

### Symptom

The banner belongs on the Home tab, but it stayed on screen after switching to
**Favorites**, sitting above the Favorites content.

### Root cause

The banner was mounted into the home *page* root (`#indexPage`) rather than the
Home *tab*'s content container. Jellyfin's home page holds its tabs as siblings:

```
#indexPage.homePage
├── #homeTab        ← Home content
└── #favoritesTab   ← Favorites content
```

The inactive tab is hidden with CSS, not removed
(`.tabContent:not(.is-active) { display: none }`). A banner inserted as a
*sibling* of those panels is outside the hidden region, so it stayed visible
whenever Favorites was selected.

### Fix

`findHomeTab()` in `Web/heroBanner.js` mounts into the home page's own
`#homeTab` container, falling back to the page root only if that container is
missing. The banner is now inside the element Jellyfin hides.

---

## Bug 3 — The banner never came back after navigating away

### Symptom

Home → Movies → Home, and the banner was gone for good. Only a full page reload
brought it back.

### Root cause

Two things combined:

1. **Jellyfin does not reuse the home page element.** Coming back to Home builds
   a *second* `.homePage` element; the old one stays in the DOM carrying the
   `hide` class. The code used `document.querySelector('.homePage')`, which
   returns the **first** match — the cached, hidden one. The banner was being
   inserted into an invisible page, so it looked like it had vanished.
2. **Routing.** The code waited for `hashchange`, but jellyfin-web routes with
   the History API and announces view changes with `viewshow` / `viewhide` /
   `pageshow` events. `hashchange` misses most transitions.

Measured on the broken build: `indexPageCount: 2`, first match `[HIDE]`.

### Fix

- `homePage()` walks every matching page and picks the one **without** `hide`
- the script listens to `viewshow`, `viewhide`, `pageshow` and `hashchange`,
  plus a MutationObserver for transitions that fire no event at all
- every trigger goes through `scheduleSync()`, which coalesces a burst of DOM
  changes into one pass 150 ms later

---

## Bug 4 — The rotation timer kept restarting (banner could freeze on one slide)

### Root cause

`mount()` restarted the rotation interval unconditionally, and the
MutationObserver called `mount()` on every DOM change. On a page that mutates
often — and the banner's own rendering mutates it — the timer was reset
constantly and never reached its interval, so the banner appeared stuck on the
first slide.

### Fix

- `mount()` only re-inserts, re-renders and restarts the timer when the banner
  actually had to be moved (tracked with an `inserted` flag)
- the observer ignores mutations originating inside the banner
- a single slide never starts a timer at all

---

## Bug 5 — Empty state left a large empty box

### Root cause

If the include filter matched no library (or every library was empty),
`state.slides` was empty but the container stayed in the layout — 60vh tall,
with its background and border — leaving a big empty rectangle above the home
screen sections.

### Fix

`render()` sets `display: none` when there is nothing to show, so the banner
takes up no space and the home sections sit where they normally would.

---

## Bug 6 — The settings endpoint was readable without logging in

### Root cause

`HeroBannerController.GetSettings` was marked `[AllowAnonymous]`, so anyone who
could reach the server — including someone who never logged in — could read the
plugin's configuration and the server's library names from
`/HeroBanner/Settings`.

A second, subtler problem surfaced while fixing it: **removing
`[AllowAnonymous]` on its own changed nothing.** Jellyfin does not apply a
fallback authorization policy to plugin controllers, so an endpoint with no
authorization attribute is simply open. Confirmed by testing: anonymous requests
still returned `200` until `[Authorize]` was added explicitly.

### Fix

- `[Authorize]` added explicitly to the settings endpoint, with a comment
  recording why it cannot be left implicit
- the banner now reads its settings through `ApiClient.getJSON(...)` so the
  access token is sent, instead of a plain `fetch`
- the JS and CSS assets stay anonymous on purpose — the login page loads them

Verified: anonymous → `401`, with token → `200`, and the banner still applies
saved settings.

---

## Bug 7 — Incomplete slide data could stick the banner in a loading state

### Root cause

If `ApiClient` never became available (nobody signed in), `waitForApiClient`
gave up after ~20 s but left `state.loading = true`. The banner then refused to
try again for the rest of the session.

### Fix

`waitForApiClient` takes an `onGiveUp` callback that clears the flag, so a later
refresh can retry.

---

## Notes on things that were checked and are *not* bugs

- **Jellyfin 10.11 compatibility.** The plugin is compiled against the 10.9.11
  packages and loads cleanly on 10.11.11. Both versions were put through the
  full suite.
- **Library name matching** is case-insensitive and trims whitespace
  (` movies , MUSIC ` works). Exclusions win over inclusions.
- **A single-slide banner draws no navigation dots.** That is deliberate —
  there is nowhere to navigate to — so it is not a missing-dots bug.
- **The stylesheet** is class-prefixed and does not collide with the web
  client's own styles; it already handles narrow screens and
  `prefers-reduced-motion`.

---

## Files changed

| File | Change |
| --- | --- |
| `Configuration/configPage.html` | Script moved inside the page div (Bug 1); robust load/save, status messages |
| `Web/heroBanner.js` | Tab scoping (2), navigation handling (3), timer (4), empty state (5), authenticated settings fetch (6), retry (7) |
| `HeroBannerController.cs` | `[Authorize]` on the settings endpoint (6) |
| `README.md` | Corrected a stale function reference; documented the settings |
| `.gitignore` | Ignore `publish/` and packaged `*.zip` releases |

## How this was verified

Two podman-served Jellyfin instances (10.9.11 and 10.11.11), sample media, and a
Playwright suite covering: banner placement inside `#homeTab`, absence on the
Favorites tab, navigation away and back, the settings round-trip through the
dashboard form, persistence across a page reload, the empty-filter state, single
and multiple slides, name matching, and console errors.

**Result: 21/21 behavioural checks and 9/9 edge-case checks pass on both Jellyfin
10.9.11 and 10.11.11.**

Those runs were against the build whose sources were identical to the released
1.0.12.0 apart from the version string itself. After bumping the version, the
1.0.12.0 build was deployed to both servers and confirmed to load
(`Loaded plugin: Hero Banner 1.0.12.0`) and to serve the settings endpoint; the
suites were not re-run against it.

A bug in the *test suite* was found and fixed along the way: it asserted against
Jellyfin 10.9's `movies.html` routes, but 10.11 uses slug routes
(`#/movies?topParentId=…`), so the navigation step silently did nothing and
reported a false failure. The suite now asserts that navigation actually
happened before checking the result.

## Release

Version bumped to **1.0.12.0** in `Jellyfin.Plugin.HeroBanner.csproj`
(`AssemblyVersion` + `FileVersion`), `build.yaml` and `manifest.json`, as
AGENTS.md requires before distributing a build.

```bash
dotnet publish Jellyfin.Plugin.HeroBanner.csproj -c Release -o out
cd out && zip ../herobanner_1.0.12.0.zip Jellyfin.Plugin.HeroBanner.dll
```

| | |
| --- | --- |
| Artifact | `herobanner_1.0.12.0.zip` (DLL only, as CI packages it) |
| MD5 | `43a521af6c69da45852116bb86ce79d8` |
| Size | 16,249 bytes |

One caveat about the checksum: a zip's MD5 depends on the archiver and file
timestamps, so a zip rebuilt by CI will not have this same hash. The workflow in
`.github/workflows/build.yml` builds its own zip and writes the real checksum
back into `manifest.json` on every push, so that value is authoritative — the
one above is correct for the artifact built here, and should be used if this zip
is the one uploaded to the release.
