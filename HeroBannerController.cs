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
        /// Kept separate from Jellyfin's own plugin-configuration endpoint so the
        /// home screen script doesn't need an admin-level token to read it.
        /// </summary>
        [HttpGet("Settings")]
        [AllowAnonymous]
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
