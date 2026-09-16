using System;
using System.IO;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.HeroBanner
{
    /// <summary>
    /// Jellyfin auto-discovers every <see cref="IServerEntryPoint"/> implementation in a
    /// loaded plugin assembly and calls <see cref="Run"/> once at server startup - no manual
    /// registration needed. We use that hook to patch the web client's index.html so it
    /// loads our injected script and stylesheet.
    /// </summary>
    public class WebClientInjector : IServerEntryPoint
    {
        private const string MarkerStart = "<!-- HeroBannerPlugin:start -->";
        private const string MarkerEnd = "<!-- HeroBannerPlugin:end -->";

        private readonly IApplicationPaths _applicationPaths;
        private readonly ILogger<WebClientInjector> _logger;

        public WebClientInjector(IApplicationPaths applicationPaths, ILogger<WebClientInjector> logger)
        {
            _applicationPaths = applicationPaths;
            _logger = logger;
        }

        /// <inheritdoc />
        public void Run()
        {
            try
            {
                Inject(_applicationPaths, _logger);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Hero Banner could not patch index.html automatically. " +
                    "See the plugin README for how to add the two tags by hand.");
            }
        }

        /// <inheritdoc />
        public void Dispose()
        {
            GC.SuppressFinalize(this);
        }

        /// <summary>
        /// Inserts (or refreshes) the hero banner script/style tags into index.html.
        /// Runs on every server start, since Jellyfin overwrites the web client's
        /// files on version upgrades.
        /// </summary>
        internal static void Inject(IApplicationPaths applicationPaths, ILogger logger)
        {
            var indexPath = Path.Combine(applicationPaths.WebPath, "index.html");
            if (!File.Exists(indexPath))
            {
                logger.LogWarning("Hero Banner could not find index.html at {Path}", indexPath);
                return;
            }

            var html = File.ReadAllText(indexPath);

            var snippet = MarkerStart +
                "<link rel=\"stylesheet\" href=\"/HeroBanner/ClientStyle.css\">" +
                "<script defer src=\"/HeroBanner/ClientScript.js\"></script>" +
                MarkerEnd;

            var startIdx = html.IndexOf(MarkerStart, StringComparison.Ordinal);
            if (startIdx >= 0)
            {
                var endIdx = html.IndexOf(MarkerEnd, StringComparison.Ordinal);
                if (endIdx > startIdx)
                {
                    endIdx += MarkerEnd.Length;
                    var existing = html.Substring(startIdx, endIdx - startIdx);
                    if (existing == snippet)
                    {
                        // Already up to date.
                        return;
                    }

                    html = html.Remove(startIdx, endIdx - startIdx).Insert(startIdx, snippet);
                    File.WriteAllText(indexPath, html);
                    logger.LogInformation("Hero Banner refreshed its index.html injection");
                    return;
                }
            }

            var headIdx = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            if (headIdx < 0)
            {
                logger.LogWarning("Hero Banner could not find a </head> tag in index.html");
                return;
            }

            html = html.Insert(headIdx, snippet);
            File.WriteAllText(indexPath, html);
            logger.LogInformation("Hero Banner injected its script into index.html");
        }

        /// <summary>
        /// Removes the injected snippet. Called when the plugin is uninstalled.
        /// </summary>
        public static void Remove(IApplicationPaths applicationPaths, ILogger logger)
        {
            try
            {
                var indexPath = Path.Combine(applicationPaths.WebPath, "index.html");
                if (!File.Exists(indexPath))
                {
                    return;
                }

                var html = File.ReadAllText(indexPath);
                var startIdx = html.IndexOf(MarkerStart, StringComparison.Ordinal);
                var endIdx = html.IndexOf(MarkerEnd, StringComparison.Ordinal);
                if (startIdx >= 0 && endIdx > startIdx)
                {
                    endIdx += MarkerEnd.Length;
                    html = html.Remove(startIdx, endIdx - startIdx);
                    File.WriteAllText(indexPath, html);
                    logger.LogInformation("Hero Banner removed its index.html injection");
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Hero Banner failed to clean up its index.html injection");
            }
        }
    }
}
