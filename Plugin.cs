using System;
using System.Collections.Generic;
using System.Globalization;
using Jellyfin.Plugin.HeroBanner.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.HeroBanner
{
    /// <summary>
    /// The Hero Banner plugin. Adds a rotating hero banner of the latest items
    /// per library to the Jellyfin web client's home screen.
    /// </summary>
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        private readonly IApplicationPaths _applicationPaths;
        private readonly ILogger<Plugin> _logger;

        public Plugin(
            IApplicationPaths applicationPaths,
            IXmlSerializer xmlSerializer,
            ILogger<Plugin> logger)
            : base(applicationPaths, xmlSerializer)
        {
            _applicationPaths = applicationPaths;
            _logger = logger;
            Instance = this;

            try
            {
                WebClientInjector.Inject(_applicationPaths, _logger);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Hero Banner failed to inject the web client script");
            }
        }

        /// <inheritdoc />
        public override string Name => "Hero Banner";

        /// <summary>
        /// Gets the plugin GUID. Generated once for this plugin - do not change,
        /// or Jellyfin will treat future versions as a different plugin.
        /// </summary>
        public override Guid Id => Guid.Parse("6f2e9f2a-6c3a-4a9a-9b7e-3a6a9e7c1d4f");

        /// <inheritdoc />
        public override string Description =>
            "Adds a rotating hero banner showcasing the latest additions to each library on the home screen.";

        /// <summary>
        /// Gets the current plugin instance, used by the controller to read configuration.
        /// </summary>
        public static Plugin? Instance { get; private set; }

        /// <inheritdoc />
        public IEnumerable<PluginPageInfo> GetPages()
        {
            yield return new PluginPageInfo
            {
                Name = "herobanner",
                EmbeddedResourcePath = string.Format(
                    CultureInfo.InvariantCulture,
                    "{0}.Configuration.configPage.html",
                    GetType().Namespace)
            };
        }

        /// <summary>
        /// Called by Jellyfin when the plugin is being uninstalled. Removes the
        /// snippet we injected into index.html so the server is left clean.
        /// </summary>
        public override void OnUninstalling()
        {
            WebClientInjector.Remove(_applicationPaths, _logger);
            base.OnUninstalling();
        }
    }
}
