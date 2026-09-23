using Jellyfin.Plugin.HeroBanner.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.HeroBanner
{
    /// <summary>
    /// Serves the static assets injected into the web client, plus a small
    /// anonymous settings endpoint the client script reads on load.
    /// </summary>
    [ApiController]
    [Route("HeroBanner")]
    public class HeroBannerController : ControllerBase
    {
        /// <summary>
        /// The webfonts shipped with the plugin. The banner serves its own type
        /// so it renders the same on a server with no internet access and on a
        /// machine that has neither face installed.
        /// </summary>
        private static readonly HashSet<string> BundledFonts = new HashSet<string>(StringComparer.Ordinal)
        {
            "inter-latin.woff2",
            "inter-tight-latin.woff2"
        };

        /// <summary>
        /// Serves the injected client script.
        /// </summary>
        [HttpGet("heroBanner.js")]
        [AllowAnonymous]
        public ActionResult GetScript()
        {
            var stream = GetType().Assembly.GetManifestResourceStream(
                "Jellyfin.Plugin.HeroBanner.Web.heroBanner.js");

            if (stream is null)
            {
                return NotFound();
            }

            return File(stream, "application/javascript");
        }

        /// <summary>
        /// Serves the injected stylesheet.
        /// </summary>
        [HttpGet("heroBanner.css")]
        [AllowAnonymous]
        public ActionResult GetStyle()
        {
            var stream = GetType().Assembly.GetManifestResourceStream(
                "Jellyfin.Plugin.HeroBanner.Web.heroBanner.css");

            if (stream is null)
            {
                return NotFound();
            }

            return File(stream, "text/css");
        }

        /// <summary>
        /// Serves a bundled webfont.
        /// </summary>
        /// <param name="name">File name of the font, with no path.</param>
        [HttpGet("fonts/{name}")]
        [AllowAnonymous]
        public ActionResult GetFont(string name)
        {
            // Only names on the list are served, so a request cannot be aimed at
            // any other embedded resource and no path ever reaches the lookup.
            if (!BundledFonts.Contains(name))
            {
                return NotFound();
            }

            var stream = GetType().Assembly.GetManifestResourceStream(
                "Jellyfin.Plugin.HeroBanner.Web.fonts." + name);

            if (stream is null)
            {
                return NotFound();
            }

            // The fonts carry no version in their URL, so this stays short of
            // "immutable" - a later release can replace them.
            Response.Headers.CacheControl = "public, max-age=604800";

            return File(stream, "font/woff2");
        }

        /// <summary>
        /// Returns the subset of plugin configuration the client script needs.
        /// Separate from Jellyfin's own plugin-configuration endpoint so a signed-in
        /// user can read it without admin rights - but not anonymous callers, who
        /// would otherwise be able to read the server's library names and settings
        /// straight off the login screen. The client script requests this through
        /// ApiClient so its access token is sent along.
        /// </summary>
        /// <remarks>
        /// [Authorize] is required explicitly: Jellyfin does not apply a fallback
        /// authorization policy to plugin controllers, so leaving it off serves this
        /// endpoint to anonymous callers.
        /// </remarks>
        [HttpGet("Settings")]
        [Authorize]
        public ActionResult<object> GetSettings()
        {
            var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();

            return Ok(new
            {
                rotationSeconds = config.RotationSeconds,
                itemsPerLibrary = config.ItemsPerLibrary,
                includedLibraryNames = config.IncludedLibraryNames,
                excludedLibraryNames = config.ExcludedLibraryNames,
                showOverview = config.ShowOverview
            });
        }
    }
}
