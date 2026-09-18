# AGENTS

## Project
This repository is a Jellyfin plugin named Hero Banner.

## Important rules
- Always bump the plugin version before distributing a new built plugin or publishing a new release.
- Jellyfin often does not reload plugin changes unless the version number changes.
- Keep the assembly version and the manifest version in sync.
- If a fix affects plugin settings or UI behavior, update the changelog text in `manifest.json` to describe the fix.

## Versioning
- Use semantic-style versioning for the plugin: `MAJOR.MINOR.PATCH.BUILD`
- Current version should be kept aligned in:
  - `Jellyfin.Plugin.HeroBanner.csproj` (`AssemblyVersion` and `FileVersion`)
  - `manifest.json` (`versions[].version`)

## Build validation
- Validate with: `dotnet build -nologo`
- Do not treat a successful build as enough for deployment if the version was not incremented.

## Deployment reminder
To apply plugin changes in Jellyfin, rebuild, replace the DLL in the plugin folder, and ensure the folder name/version matches the new release.
