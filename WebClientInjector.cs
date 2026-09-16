using System;
using System.IO;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.HeroBanner
{
    public class WebClientInjector : IPluginServiceRegistrator
    {
        private const string MarkerStart = "<!-- HeroBannerPlugin:start -->";
        private const string MarkerEnd = "<!-- HeroBannerPlugin:end -->";

        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            var serviceProvider = serviceCollection.BuildServiceProvider();
            var applicationPaths = serviceProvider.GetService<IApplicationPaths>();
            var logger = serviceProvider.GetService<ILogger<WebClientInjector>>();

            if (applicationPaths != null && logger != null)
            {
                Inject(applicationPaths, logger);
            }
        }

        internal static void Inject(IApplicationPaths applicationPaths, ILogger logger)
        {
            var indexPath = Path.Combine(applicationPaths.WebPath, "index.html");
            if (!File.Exists(indexPath))
            {
                logger.LogWarning("Hero Banner could not find index.html at {Path}", indexPath);
                return;
            }

            var version = Plugin.Instance?.Version.ToString() ?? "1.0.3.0";
            var html = File.ReadAllText(indexPath);

            // Corrected filenames to match embedded resources in .csproj
            var snippet = MarkerStart +
                $"<link rel=\"stylesheet\" href=\"/HeroBanner/heroBanner.css?v={version}\">" +
                $"<script defer src=\"/HeroBanner/heroBanner.js?v={version}\"></script>" +
                MarkerEnd;

            var startIdx = html.IndexOf(MarkerStart, StringComparison.Ordinal);
            if (startIdx >= 0)
            {
                var endIdx = html.IndexOf(MarkerEnd, StringComparison.Ordinal);
                if (endIdx > startIdx)
                {
                    endIdx += MarkerEnd.Length;
                    html = html.Remove(startIdx, endIdx - startIdx).Insert(startIdx, snippet);
                    File.WriteAllText(indexPath, html);
                    logger.LogInformation("Hero Banner refreshed index.html with version {Version}", version);
                    return;
                }
            }

            var headIdx = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            if (headIdx >= 0)
            {
                html = html.Insert(headIdx, snippet);
                File.WriteAllText(indexPath, html);
                logger.LogInformation("Hero Banner injected into index.html with version {Version}", version);
            }
        }

        public static void Remove(IApplicationPaths applicationPaths, ILogger logger)
        {
            try
            {
                var indexPath = Path.Combine(applicationPaths.WebPath, "index.html");
                if (File.Exists(indexPath))
                {
                    var html = File.ReadAllText(indexPath);
                    var startIdx = html.IndexOf(MarkerStart, StringComparison.Ordinal);
                    var endIdx = html.IndexOf(MarkerEnd, StringComparison.Ordinal);
                    if (startIdx >= 0 && endIdx > startIdx)
                    {
                        endIdx += MarkerEnd.Length;
                        html = html.Remove(startIdx, endIdx - startIdx);
                        File.WriteAllText(indexPath, html);
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Hero Banner failed to clean up index.html injection");
            }
        }
    }
}