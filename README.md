# Hero Banner for Jellyfin (Stable)

Adds a rotating hero banner to the top of the Jellyfin home screen, showing content from your libraries with:

* Backdrop artwork
* Title, year, rating, runtime, and genres
* Overview/plot summary
* **Play** and **More Info** buttons
* Four content sources — recently added, continue watching, next up, or a random pick
* A resume bar and a **Resume** label on anything you are part-way through
* Smooth artwork cross-fades and slow zoom animation
* Slide indicators showing the rotation progress
* A fallback background when artwork isn't available
* Typography that ships with the plugin, so it looks the same everywhere
* Responsive layout for phones, tablets, and desktop
* Support for `prefers-reduced-motion`

---

# 🚀 Install in Jellyfin — No Coding Required

The easiest way to install Hero Banner is through Jellyfin's **Plugin Repository** system.

You don't need to compile anything, install .NET, or manually copy DLL files.

### 1. Copy the repository URL

Copy this URL:

```text
https://raw.githubusercontent.com/huzaim550/jellyfin-hero-banner/main/manifest.json
```

### 2. Open Jellyfin Dashboard

In Jellyfin, go to:

**Dashboard → Plugins → Repositories**

Then click **Add Repository**.

### 3. Paste the URL

Paste the repository URL into the repository field:

```text
https://raw.githubusercontent.com/huzaim550/jellyfin-hero-banner/main/manifest.json
```

Give it any name you like, for example:

```text
Hero Banner
```

Click **Save**.

### 4. Install Hero Banner

Now go to:

**Dashboard → Plugins → Catalog**

Find:

**Hero Banner**

Open it and click **Install**.

### 5. Restart Jellyfin

Restart your Jellyfin server when prompted.

That's it.

After Jellyfin starts again, open the **Home** page and the Hero Banner should appear above your library sections.

> **Tip:** If you already had Jellyfin open in your browser, do a hard refresh with **Ctrl + Shift + R** (Windows/Linux) or **Cmd + Shift + R** (macOS).

---

# ⚙️ Configure Hero Banner

After installation, go to:

**Dashboard → Plugins → Hero Banner**

You can configure:

| Setting                          | Description                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| **What the banner shows**        | Where the titles come from — see [Content sources](#content-sources).         |
| **Rotation interval**            | How many seconds each title stays on screen. Supports 3–60 seconds.          |
| **How many titles will slide**   | How many titles the banner rotates through. Supports 1–20.                   |
| **Only include these libraries** | Optional comma-separated list of libraries to include.                       |
| **Exclude these libraries**      | Libraries that should always be excluded. Exclusions take priority.          |
| **Show the overview text**       | Controls whether the plot/overview is displayed.                             |

---

# 🎬 Content sources

**What the banner shows** decides where the titles come from.

| Source                | What it shows                                                                 |
| --------------------- | ----------------------------------------------------------------------------- |
| **Recently added**    | The newest item in each library. The default, and the same for everyone.       |
| **Continue watching** | What *you* have started but not finished, with a resume bar on each slide.     |
| **Next up**           | The next unwatched episode of every series you are part-way through.           |
| **Random pick**       | A random title from each library, reshuffled every time the home page loads.   |

The last two are the interesting ones: they follow the person looking at the screen,
so every user on the server sees their own banner rather than the same one.

Two things worth knowing about them:

* The **library filters do not apply** to *Continue watching* and *Next up*. Those
  are drawn from your watch history rather than from a library, so there is no
  library to filter on.
* **How many titles will slide** means different things per source. *Recently added*
  and *Random pick* take that many from **each** library; *Continue watching* and
  *Next up* use it as a total across all of them. At the default of 1, the banner
  shows a single title and does not rotate.

Anything you are part-way through — from either *Continue watching* or *Next up* —
gets a thin progress bar along the bottom of the banner and a **Resume** button
instead of **Play**.

Library names are matched case-insensitively and surrounding spaces are ignored.

For example:

```text
Movies
 movies
MOVIES
```

are all treated as the same library.

If there are no matching libraries or no suitable items are found, the banner removes itself instead of leaving an empty space above your libraries.

---

# 🎨 How It Works

Hero Banner runs inside Jellyfin's existing web client.

Jellyfin's server-side plugin system doesn't provide an official API for inserting custom widgets directly into the Home screen. Therefore, Hero Banner uses a small web-client injection mechanism.

When the Jellyfin server starts, the plugin:

1. Locates Jellyfin's `index.html`.
2. Adds a `<script>` and `<link>` tag between identifiable HTML comment markers.
3. Serves the JavaScript and CSS from the Jellyfin server itself.
4. The JavaScript waits for Jellyfin's existing authenticated `ApiClient`.
5. It retrieves the configured libraries and their recently added items.
6. It creates the hero banner inside the Home page.

The injected resources are:

```text
/HeroBanner/heroBanner.js
/HeroBanner/heroBanner.css
```

The settings endpoint is:

```text
/HeroBanner/Settings
```

The settings endpoint only serves signed-in users, and the web client accesses it through Jellyfin's existing `ApiClient`, so the authentication token is included automatically.

---

# 🔄 Jellyfin Updates

The plugin automatically attempts to apply its injection again whenever Jellyfin starts.

This is important because Jellyfin updates can replace the web client's `index.html`.

After an update:

```text
Jellyfin update
      ↓
index.html replaced
      ↓
Jellyfin starts
      ↓
Hero Banner detects the new index.html
      ↓
Injection is applied again
      ↓
Hero Banner works again
```

You may still need to hard-refresh your browser after a Jellyfin update so that the browser loads the latest web-client files.

---

# 🛠️ If Hero Banner Doesn't Appear

The Jellyfin Home page's internal HTML structure is not a documented, stable plugin API.

Different Jellyfin versions or custom skins can change the DOM structure.

The client script therefore searches for the Home page's tab/container using:

```text
Web/heroBanner.js
```

specifically the:

```text
findHomeTab()
```

function.

If the plugin loads successfully but the banner doesn't appear:

1. Open Jellyfin in your browser.
2. Open your browser's Developer Tools.
3. Inspect the Home page.
4. Find the container that contains the Home page's library sections.
5. Compare it with what `findHomeTab()` is searching for.
6. Update the function if your Jellyfin version uses a different structure.

---

# 🔧 Manual Injection

Normally this isn't necessary.

If Jellyfin's `index.html` is read-only and the plugin cannot modify it automatically, you can manually add the following immediately before `</head>`:

```html
<link rel="stylesheet" href="/HeroBanner/heroBanner.css">
<script defer src="/HeroBanner/heroBanner.js"></script>
```

The plugin will then be able to serve the required files while the Jellyfin web client loads them.

---

# 🗑️ Uninstall

Remove **Hero Banner** from:

**Dashboard → Plugins**

The plugin will attempt to remove its injected JavaScript and CSS references from `index.html`.

If Jellyfin's files are read-only and the plugin cannot clean them up automatically, remove these two lines manually:

```html
<link rel="stylesheet" href="/HeroBanner/heroBanner.css">
<script defer src="/HeroBanner/heroBanner.js"></script>
```

---

# 👨‍💻 Developer / Manual Installation

The following section is only necessary if you want to build or modify the plugin yourself.

## Requirements

You'll need:

* .NET 8 SDK
* Internet access to NuGet
* A Jellyfin server version compatible with the package versions used by the project

Before building, open:

```text
Jellyfin.Plugin.HeroBanner.csproj
```

and make sure the `Jellyfin.Controller` and `Jellyfin.Model` package versions match your Jellyfin **server** version.

You can find your Jellyfin server version under:

**Dashboard → About**

If you're creating a repository package, also make sure `targetAbi` in:

```text
build.yaml
```

matches the target Jellyfin version.

Version mismatches are one of the most common reasons a Jellyfin plugin fails to load.

---

# 🏗️ Build Locally

From the project directory:

```bash
cd JellyfinHeroBanner
dotnet restore
dotnet publish -c Release -o out
```

The compiled plugin will be placed in:

```text
out/
```

with the main assembly:

```text
Jellyfin.Plugin.HeroBanner.dll
```

---

# 📦 Manual Plugin Installation

Find your Jellyfin plugins directory.

Common locations include:

### Docker

The directory mounted to:

```text
/config
```

and then:

```text
/config/plugins/
```

### Linux

```text
/var/lib/jellyfin/plugins/
```

### Windows

```text
%ProgramData%\Jellyfin\Server\plugins\
```

Create a directory such as:

```text
plugins/HeroBanner_1.0.15.0/
```

Copy:

```text
Jellyfin.Plugin.HeroBanner.dll
```

into that directory.

Restart Jellyfin and check:

**Dashboard → Plugins**

Hero Banner should now be listed.

---

# 📁 Project Structure

```text
Jellyfin.Plugin.HeroBanner.csproj
Plugin.cs
WebClientInjector.cs
HeroBannerController.cs

Configuration/
  PluginConfiguration.cs
  configPage.html

Web/
  heroBanner.js
  heroBanner.css

build.yaml
.github/
  workflows/
    build.yml
```

### Main components

**`Plugin.cs`**
Plugin entry point, metadata, and configuration handling.

**`WebClientInjector.cs`**
Finds Jellyfin's web client's `index.html` and adds the Hero Banner resources.

**`HeroBannerController.cs`**
Serves the JavaScript, CSS, and settings endpoint.

**`Web/heroBanner.js`**
Runs inside the Jellyfin web client and creates the banner.

**`Web/heroBanner.css`**
Controls the banner's layout, animations, responsive behavior, and visual styling.

**`Configuration/PluginConfiguration.cs`**
Stores the plugin's configuration.

**`Configuration/configPage.html`**
Provides the Jellyfin Dashboard configuration interface.

**`build.yaml`**
Defines the information required to package the plugin for a Jellyfin plugin repository.

**`.github/workflows/build.yml`**
Automatically builds and publishes the plugin through GitHub Actions.

---

# 🤖 Automatic GitHub Builds

The repository includes a GitHub Actions workflow:

```text
.github/workflows/build.yml
```

This allows GitHub to build and publish the plugin automatically.

For developers maintaining their own copy:

1. Create a public GitHub repository.
2. Upload the project files.
3. Enable **Read and write permissions** for GitHub Actions under:
   **Settings → Actions → General → Workflow permissions**
4. Push your changes.
5. GitHub Actions builds the plugin automatically.
6. The repository manifest can then be used by Jellyfin's Plugin Repository system.

When releasing a new version, update:

```xml
<AssemblyVersion>...</AssemblyVersion>
```

in:

```text
Jellyfin.Plugin.HeroBanner.csproj
```

and push the changes.

---

# 📌 Repository

The official repository for this project is:

[GitHub — jellyfin-hero-banner](https://github.com/huzaim550/jellyfin-hero-banner?utm_source=chatgpt.com)

### Jellyfin Repository Manifest

For the easiest installation, add this manifest to Jellyfin:

```text
https://raw.githubusercontent.com/huzaim550/jellyfin-hero-banner/main/manifest.json
```

Once added, Jellyfin handles downloading and installing the plugin through its normal Plugin Catalog.

---

# ⚡ Quick Start

If you just want the banner running, **you only need these steps**:

```text
1. Copy the manifest URL
        ↓
2. Jellyfin Dashboard
        ↓
3. Plugins → Repositories
        ↓
4. Add Repository
        ↓
5. Paste manifest.json URL
        ↓
6. Save
        ↓
7. Plugins → Catalog
        ↓
8. Install "Hero Banner"
        ↓
9. Restart Jellyfin
        ↓
10. Open Home
```

**No coding. No compiling. No DLL copying.**

For developers who want to modify or build the plugin themselves, see the **Developer / Manual Installation** section above.

