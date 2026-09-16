using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.HeroBanner.Configuration
{
    /// <summary>
    /// Configuration for the Hero Banner plugin.
    /// </summary>
    public class PluginConfiguration : BasePluginConfiguration
    {
        public PluginConfiguration()
        {
            RotationSeconds = 8;
            ItemsPerLibrary = 1;
            IncludedLibraryNames = string.Empty;
            ExcludedLibraryNames = string.Empty;
            ShowOverview = true;
        }

        /// <summary>
        /// Gets or sets how long each slide is shown before rotating to the next, in seconds.
        /// </summary>
        public int RotationSeconds { get; set; }

        /// <summary>
        /// Gets or sets how many of the most recently added items to pull from each library.
        /// </summary>
        public int ItemsPerLibrary { get; set; }

        /// <summary>
        /// Gets or sets a comma-separated allow-list of library names. Empty means "all libraries".
        /// </summary>
        public string IncludedLibraryNames { get; set; }

        /// <summary>
        /// Gets or sets a comma-separated list of library names to always skip.
        /// </summary>
        public string ExcludedLibraryNames { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether to show the item overview text on the banner.
        /// </summary>
        public bool ShowOverview { get; set; }
    }
}
