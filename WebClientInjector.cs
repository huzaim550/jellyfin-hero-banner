using System;
using System.IO;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.HeroBanner
{
    /// <summary>
    /// Implements <see cref="IPluginServiceRegistrator"/> to run server startup tasks in Jellyfin 10.9+.
    /// We use this entry point to patch index.html on server start.
    /// </summary>
    public class WebClientInjector : IPluginServiceRegistrator
    {
        private const string MarkerStart = "<!-- HeroBannerPlugin:start -->";
        private const string MarkerEnd = "<!-- HeroBannerPlugin:end -->";

        /// <inheritdoc />
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            // Build temporary provider to get required services during startup registration
            var serviceProvider = serviceCollection.BuildServiceProvider();
            var applicationPaths = serviceProvider.GetService<IApplicationPaths>();
            var logger = serviceProvider.GetService<ILogger<WebClientInjector>>();

            if (applicationPaths != null && logger != null)
            {
                Inject(applicationPaths, logger);
            }
        }

        /// <summary>
        /// Inserts (or refreshes) the hero banner script/style tags into index.html.
        /// Appends the current plugin assembly version as a query parameter to bust browser/Jellyfin web caches.
        /// </summary>
        internal static void Inject(IApplicationPaths applicationPaths, ILogger logger)
        {
            var indexPath = Path.Combine(applicationPaths.WebPath, "index.html");
            if (!File.Exists(indexPath))
            {
                logger.LogWarning("Hero Banner could not find index.html at {Path}", indexPath);
                return;
            }

            var version = Plugin.Instance?.Version.ToString() ?? "1.0.1.0";
            var html = File.ReadAllText(indexPath);

            var snippet = MarkerStart +
                $"<link rel=\"stylesheet\" href=\"/HeroBanner/ClientStyle.css?v={version}\">" +
                $"<script defer src=\"/HeroBanner/ClientScript.js?v={version}\"></script>" +
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
                    logger.LogInformation("Hero Banner refreshed its index.html injection with version {Version}", version);
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
            logger.LogInformation("Hero Banner injected its script into index.html with version {Version}", version);
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