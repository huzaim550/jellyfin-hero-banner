# Hero Banner for Jellyfin

Adds a rotating hero banner to the top of the Jellyfin home screen, showing the
most recently added item from each of your libraries — backdrop image, title,
year/rating/runtime/genres, overview, and Play / More info buttons.

Artwork cross-fades between titles with a slow push-in, the library name sits in
a badge, and the slide indicators fill up over the rotation interval so you can
see how long is left. Items with no artwork of their own get a tinted gradient
rather than a black rectangle, and the layout adapts to narrow screens and
honours `prefers-reduced-motion`.

## How it works

Jellyfin's server-side plugin system doesn't have an official hook for adding
widgets to the home screen — that lives in the web client, which plugins don't
directly control. So this plugin:

1. On server startup, patches the web client's `index.html` to load one extra
   `<script>` and `<link>` tag (between HTML comment markers, so it's easy to
   find and undo).
2. Serves that script/stylesheet itself from `/HeroBanner/heroBanner.js` and
   `/HeroBanner/heroBanner.css`.
3. The script waits for the page's existing `ApiClient` (already logged in),
   fetches the latest item per library, and renders the banner into the home
   page.

Because it edits `index.html` on disk, the injection re-applies itself on
every server start — which also means it survives Jellyfin server *updates*
(which overwrite `index.html`), since it's re-run each restart.

**Heads up:** the exact home-page DOM structure isn't a documented, stable
API and can differ between Jellyfin versions/skins. `Web/heroBanner.js` looks
for the home page's own tab container (see `findHomeTab()`); if the banner
doesn't show up on your version, open your browser's dev tools on the Jellyfin
home page, find the container that wraps the home sections, and update that
function.

## Settings

Dashboard → Plugins → Hero Banner:

| Setting | What it does |
| --- | --- |
| Rotation interval | Seconds each title stays on screen before rotating (3–60). |
| How many titles will slide | Most recently added items to pull per library (1–20). |
| Only include these libraries | Comma-separated allow-list of library names. Blank means every library. |
| Exclude these libraries | Comma-separated list of library names to always leave out. Exclusions win over inclusions. |
| Show the overview text | Whether the plot summary appears on the banner. |

Library names are matched case-insensitively, and surrounding spaces are
ignored, so `Movies` and ` movies ` are the same library. If the include list
matches nothing (or every library is empty), the banner takes itself out of the
layout rather than leaving an empty box above your libraries.

The banner is scoped to the Home tab, so it doesn't follow you to Favorites or
any other page. It reads its settings when it loads, so a browser that is
already open picks changes up the next time the page loads.

The settings endpoint (`/HeroBanner/Settings`) only serves signed-in users; the
banner reads it through the web client's `ApiClient` so the access token is
sent along.

## Easiest path: let GitHub build it, add it as a repository (no coding needed)

This project includes `.github/workflows/build.yml`, which makes GitHub
compile the plugin for you and publish it as a proper Jellyfin repository you
can add from Dashboard → Plugins → Repositories, same as any community plugin.

1. Create a free GitHub account if you don't have one (github.com).
2. Create a new **public** repository (e.g. `jellyfin-hero-banner`).
3. Extract this zip on your computer, then on your new repo's page use
   **Add file → Upload files** and drag in everything from the extracted
   `JellyfinHeroBanner` folder (including the hidden `.github` folder — if
   your OS hides it, unhide hidden files first, or drag the whole folder at
   once rather than picking files individually).
4. Go to **Settings → Actions → General → Workflow permissions**, choose
   **Read and write permissions**, and save. (This lets the automated build
   publish a release for you.)
5. Open the **Actions** tab — a build should already be running from your
   upload. Wait for the green checkmark (~1-2 minutes).
6. Once it's done, your manifest will be live at:
   `https://raw.githubusercontent.com/huzaim550/jellyfin-hero-banner/main/manifest.json`
7. In Jellyfin: **Dashboard → Plugins → Repositories → Add Repository**,
   paste that URL, save.
8. Go to **Dashboard → Plugins → Catalog**, find **Hero Banner** under
   General, click **Install**, then restart Jellyfin.

From then on, bumping `<AssemblyVersion>` in the `.csproj` and pushing again
publishes a new version automatically — Jellyfin will offer it as an update
through the same repository.

## Build it yourself instead

If you'd rather build locally: you'll need the .NET 8 SDK and internet access
to NuGet (this project pulls `Jellyfin.Controller` / `Jellyfin.Model`).

```bash
cd JellyfinHeroBanner
dotnet restore
dotnet publish -c Release -o out
```

**Before building**, open `Jellyfin.Plugin.HeroBanner.csproj` and set the
`Jellyfin.Controller` / `Jellyfin.Model` package versions to match your
Jellyfin *server* version (Dashboard → About). Also update `targetAbi` in
`build.yaml` to match if you're packaging for a repository. Mismatched
versions are the most common reason a plugin fails to load.

## Install

1. On your Jellyfin server, find the plugins folder — usually:
   - Docker: the path you mounted to `/config`, under `plugins/`
   - Linux: `/var/lib/jellyfin/plugins/`
   - Windows: `%ProgramData%\Jellyfin\Server\plugins\`
2. Create a folder there, e.g. `plugins/HeroBanner_1.0.13.0/`. The name is up to
   you, but keeping the version in it (matching `<AssemblyVersion>`) makes it
   obvious which build is installed.
3. Copy `out/Jellyfin.Plugin.HeroBanner.dll` into it.
4. Restart Jellyfin.
5. Check **Dashboard → Plugins** — "Hero Banner" should be listed. Open it to
   configure rotation speed, items per library, and library include/exclude
   lists.
6. Hard-refresh the Jellyfin web app (Ctrl/Cmd+Shift+R) so the browser picks
   up the patched `index.html`.

## Manual injection (if auto-patching fails)

If `index.html` is read-only, or the plugin logs a warning that it couldn't
patch it, add these two lines yourself just before `</head>` in your web
client's `index.html`:

```html
<link rel="stylesheet" href="/HeroBanner/heroBanner.css">
<script defer src="/HeroBanner/heroBanner.js"></script>
```

## Uninstall

Remove the plugin from Dashboard → Plugins. It will attempt to strip the
injected lines from `index.html` automatically; if it can't (e.g. permissions),
remove the two lines above by hand.

## Project layout

```
Jellyfin.Plugin.HeroBanner.csproj   Project file (NuGet package refs)
Plugin.cs                           Plugin entry point / metadata
WebClientInjector.cs                Patches index.html on startup
HeroBannerController.cs             Serves the injected JS/CSS + settings
Configuration/
  PluginConfiguration.cs            Settings model
  configPage.html                   Dashboard settings page
Web/
  heroBanner.js                     Injected client script (builds the banner)
  heroBanner.css                    Injected stylesheet
build.yaml                          Manifest for jprm / a plugin repository
```
