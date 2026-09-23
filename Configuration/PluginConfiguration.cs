using System;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.HeroBanner.Configuration
{
    /// <summary>
    /// Configuration for the Hero Banner plugin.
    /// </summary>
    public class PluginConfiguration : BasePluginConfiguration
    {
        /// <summary>
        /// The banner shows the most recently added item from each library.
        /// This is the original behaviour and stays the default.
        /// </summary>
        public const string SourceLatest = "Latest";

        /// <summary>
        /// The banner shows what the signed-in user has started but not finished.
        /// </summary>
        public const string SourceContinueWatching = "ContinueWatching";

        /// <summary>
        /// The banner shows the next unwatched episode of each series in progress.
        /// </summary>
        public const string SourceNextUp = "NextUp";

        /// <summary>
        /// The banner shows a random pick from each library, which reshuffles
        /// every time the home page is loaded.
        /// </summary>
        public const string SourceRandom = "Random";

        /// <summary>
        /// Every content source this version understands, in the order the
        /// settings page lists them. Kept in step with the options in
        /// configPage.html.
        /// </summary>
        public static readonly string[] ContentSources =
        {
            SourceLatest,
            SourceContinueWatching,
            SourceNextUp,
            SourceRandom
        };

        public PluginConfiguration()
        {
            ContentSource = SourceLatest;
            RotationSeconds = 8;
            ItemsPerLibrary = 1;
            IncludedLibraryNames = string.Empty;
            ExcludedLibraryNames = string.Empty;
            ShowOverview = true;
        }

        /// <summary>
        /// Gets or sets which set of items the banner rotates through. One of
        /// <see cref="ContentSources"/>.
        /// </summary>
        public string ContentSource { get; set; }

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

        /// <summary>
        /// Returns the given source when it is one this version knows about,
        /// and the latest-additions source otherwise. Guards a hand-edited
        /// config file, and a value written by a newer version of the plugin
        /// that has since been rolled back.
        /// </summary>
        /// <param name="value">The configured source.</param>
        /// <returns>A value from <see cref="ContentSources"/>.</returns>
        public static string NormalizeContentSource(string? value)
        {
            if (!string.IsNullOrEmpty(value))
            {
                foreach (var known in ContentSources)
                {
                    if (string.Equals(known, value, StringComparison.OrdinalIgnoreCase))
                    {
                        return known;
                    }
                }
            }

            return SourceLatest;
        }
    }
}
