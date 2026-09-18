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
