(function () {
    "use strict";

    // NOTE: Jellyfin's web client DOM structure isn't a documented, stable API,
    // and can shift between versions/skins. findHomeTab() below looks only for
    // the home page's own tab container, which is where the banner belongs. If
    // the banner doesn't appear on your version, inspect the home page in your
    // browser dev tools and update that function.

    var CONFIG = {
        rotationSeconds: 8,
        itemsPerLibrary: 1,
        includedLibraryNames: "",
        excludedLibraryNames: "",
        showOverview: true
    };

    var state = {
        slides: [],
        index: 0,
        timer: null,
        el: null,
        loading: false,
        loaded: false
    };

    function normalizeConfig() {
        CONFIG.rotationSeconds = Math.min(60, Math.max(3, parseInt(CONFIG.rotationSeconds, 10) || 8));
        CONFIG.itemsPerLibrary = Math.min(20, Math.max(1, parseInt(CONFIG.itemsPerLibrary, 10) || 1));
        CONFIG.showOverview = !!CONFIG.showOverview;
    }

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift("[HeroBanner]");
        console.log.apply(console, args);
    }

    // Reads the plugin settings from the server. This goes through ApiClient
    // rather than a plain fetch so the request carries the access token - the
    // endpoint is only served to signed-in users. Called once ApiClient is
    // ready; anything that goes wrong leaves the defaults in place.
    function fetchConfig() {
        if (!window.ApiClient || typeof ApiClient.getJSON !== "function") {
            normalizeConfig();
            return Promise.resolve();
        }

        return ApiClient.getJSON(ApiClient.getUrl("HeroBanner/Settings"))
            .then(function (json) {
                if (json) {
                    Object.assign(CONFIG, json);
                }
                normalizeConfig();
            })
            .catch(function () {
                normalizeConfig();
            });
    }

    // Runs cb once ApiClient has a signed-in user. onGiveUp runs instead if it
    // never does, so the caller can clear its "loading" flag and try again on
    // the next refresh rather than staying stuck forever.
    function waitForApiClient(cb, onGiveUp) {
        var attempts = 0;

        function poll() {
            if (window.ApiClient && window.ApiClient.getCurrentUserId && window.ApiClient.getCurrentUserId()) {
                cb();
                return;
            }

            if (++attempts > 40) {
                log("ApiClient never became available - skipping the banner refresh.");
                if (onGiveUp) {
                    onGiveUp();
                }
                return;
            }

            setTimeout(poll, 500);
        }

        poll();
    }

    function splitNames(str) {
        return (str || "")
            .split(",")
            .map(function (s) {
                return s.trim().toLowerCase();
            })
            .filter(Boolean);
    }

    function getLatestPerLibrary() {
        var userId = ApiClient.getCurrentUserId();
        var included = splitNames(CONFIG.includedLibraryNames);
        var excluded = splitNames(CONFIG.excludedLibraryNames);

        return ApiClient.getUserViews({}, userId).then(function (result) {
            var views = (result.Items || []).filter(function (v) {
                var name = (v.Name || "").toLowerCase();
                if (included.length > 0 && included.indexOf(name) === -1) {
                    return false;
                }

                if (excluded.indexOf(name) !== -1) {
                    return false;
                }

                return true;
            });

            var requests = views.map(function (view) {
                var url = ApiClient.getUrl("Users/" + userId + "/Items/Latest", {
                    ParentId: view.Id,
                    Limit: CONFIG.itemsPerLibrary,
                    Fields: "Overview",
                    ImageTypeLimit: 1,
                    EnableImageTypes: "Backdrop,Primary,Thumb"
                });

                return ApiClient.getJSON(url)
                    .then(function (items) {
                        return (items || []).map(function (item) {
                            item.__libraryName = view.Name;
                            return item;
                        });
                    })
                    .catch(function () {
                        return [];
                    });
            });

            return Promise.all(requests).then(function (lists) {
                return lists.reduce(function (acc, l) {
                    return acc.concat(l);
                }, []);
            });
        });
    }

    function imageUrl(item) {
        var id = item.Id;

        if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
            return ApiClient.getScaledImageUrl(id, {
                type: "Backdrop",
                tag: item.BackdropImageTags[0],
                maxWidth: 1920,
                quality: 90
            });
        }

        if (item.ImageTags && item.ImageTags.Thumb) {
            return ApiClient.getScaledImageUrl(id, {
                type: "Thumb",
                tag: item.ImageTags.Thumb,
                maxWidth: 1920,
                quality: 90
            });
        }

        if (item.ImageTags && item.ImageTags.Primary) {
            return ApiClient.getScaledImageUrl(id, {
                type: "Primary",
                tag: item.ImageTags.Primary,
                maxWidth: 1920,
                quality: 90
            });
        }

        return "";
    }

    function buildBanner() {
        var el = document.createElement("div");
        el.id = "heroBannerPlugin";
        el.className = "heroBannerPlugin";
        el.innerHTML =
            '<div class="heroBannerPlugin-slides"></div>' +
            '<div class="heroBannerPlugin-scrim"></div>' +
            '<div class="heroBannerPlugin-content">' +
                '<div class="heroBannerPlugin-eyebrow"></div>' +
                '<div class="heroBannerPlugin-title"></div>' +
                '<div class="heroBannerPlugin-overview"></div>' +
                '<div class="heroBannerPlugin-actions">' +
                    '<button type="button" class="heroBannerPlugin-play">Play</button>' +
                    '<button type="button" class="heroBannerPlugin-more">More info</button>' +
                '</div>' +
            '</div>' +
            '<div class="heroBannerPlugin-dots"></div>';
        return el;
    }

    function render() {
        if (!state.el) {
            return;
        }

        // With nothing to show (every library filtered out, or an empty
        // server) take the banner out of the way instead of leaving an empty
        // dark box above the home screen sections.
        state.el.style.display = state.slides.length ? "" : "none";

        var item = state.slides[state.index];
        if (!item) {
            return;
        }

        var slidesEl = state.el.querySelector(".heroBannerPlugin-slides");
        var url = imageUrl(item);
        slidesEl.style.backgroundImage = url ? 'url("' + url + '")' : "none";

        state.el.querySelector(".heroBannerPlugin-eyebrow").textContent = item.__libraryName || "";
        state.el.querySelector(".heroBannerPlugin-title").textContent = item.Name || "";

        var overviewEl = state.el.querySelector(".heroBannerPlugin-overview");
        if (CONFIG.showOverview && item.Overview) {
            overviewEl.textContent = item.Overview;
            overviewEl.style.display = "";
        } else {
            overviewEl.style.display = "none";
        }

        var dotsEl = state.el.querySelector(".heroBannerPlugin-dots");
        dotsEl.innerHTML = "";
        if (state.slides.length > 1) {
            state.slides.forEach(function (_, i) {
                var dot = document.createElement("span");
                dot.className = "heroBannerPlugin-dot" + (i === state.index ? " active" : "");
                dot.setAttribute("role", "button");
                dot.setAttribute("tabindex", "0");
                dot.setAttribute("aria-label", "Show slide " + (i + 1));
                dot.addEventListener("click", function () {
                    goTo(i);
                });
                dot.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goTo(i);
                    }
                });
                dotsEl.appendChild(dot);
            });
        }

        state.el.querySelector(".heroBannerPlugin-play").onclick = function () {
            location.hash = "#!/details?id=" + item.Id + "&autoplay=true";
        };
        state.el.querySelector(".heroBannerPlugin-more").onclick = function () {
            location.hash = "#!/details?id=" + item.Id;
        };
    }

    function goTo(i) {
        if (!state.slides.length) {
            return;
        }

        state.index = (i + state.slides.length) % state.slides.length;
        render();
        restartTimer();
    }

    function next() {
        goTo(state.index + 1);
    }

    function restartTimer() {
        if (state.timer) {
            clearInterval(state.timer);
            state.timer = null;
        }

        if (state.slides.length > 1) {
            state.timer = setInterval(next, Math.max(3, CONFIG.rotationSeconds) * 1000);
        }
    }

    // The home page element, or null when the home page isn't on screen.
    //
    // Two things make this less obvious than it looks. Jellyfin hides the
    // inactive pages with the "hide" class instead of removing them, and when
    // you come back to the home screen it builds a second one rather than
    // reusing the first - so more than one element can match, and only the one
    // without "hide" is live. Picking the first match would target a cached,
    // hidden home page and the banner would never come back.
    function homePage() {
        var pages = document.querySelectorAll("#indexPage.homePage, .homePage");
        for (var i = 0; i < pages.length; i++) {
            if (!pages[i].classList.contains("hide")) {
                return pages[i];
            }
        }

        return null;
    }

    // Returns the container the banner belongs in, or null when the home page
    // isn't on screen. Scoping to the Home tab keeps the banner off the
    // Favorites tab (jellyfin hides the inactive tab with display:none) and off
    // every other page, including the login screen.
    function findHomeTab() {
        var page = homePage();
        if (!page) {
            return null;
        }

        return page.querySelector("#homeTab") || page;
    }

    function loadBannerData() {
        if (state.loading) {
            return;
        }

        state.loading = true;

        // The settings request is authenticated, so it has to wait for ApiClient
        // just like the item lookup below.
        waitForApiClient(function () {
            fetchConfig().then(function () {
                getLatestPerLibrary()
                    .then(function (items) {
                        state.slides = items;
                        state.index = 0;
                        state.loaded = true;
                        state.loading = false;

                        if (!items.length) {
                            log("No items found across your libraries - nothing to show.");
                        }

                        if (state.el) {
                            render();
                            restartTimer();
                        }
                    })
                    .catch(function (err) {
                        state.loading = false;
                        log("Failed to load items for the banner", err);
                    });
            });
        }, function () {
            state.loading = false;
        });
    }

    function mount(target) {
        if (!state.el) {
            state.el = buildBanner();
        }

        var inserted = state.el.parentElement !== target || target.firstElementChild !== state.el;
        if (inserted) {
            target.insertBefore(state.el, target.firstChild);
            render();
            restartTimer();
        }

        if (!state.loaded && !state.loading) {
            loadBannerData();
        }
    }

    function unmount() {
        if (state.el && state.el.parentElement) {
            state.el.parentElement.removeChild(state.el);
        }

        if (state.timer) {
            clearInterval(state.timer);
            state.timer = null;
        }
    }

    function syncBanner() {
        var target = findHomeTab();
        if (target) {
            mount(target);
        } else {
            unmount();
        }
    }

    // Coalesce the burst of mutations a route change produces into one pass.
    var syncTimer = null;
    function scheduleSync() {
        if (syncTimer) {
            return;
        }

        syncTimer = setTimeout(function () {
            syncTimer = null;
            syncBanner();
        }, 150);
    }

    window.addEventListener("heroBanner-config-updated", function () {
        state.loaded = false;
        state.loading = false;
        if (findHomeTab()) {
            loadBannerData();
        }
    });

    function init() {
        // jellyfin-web routes with the History API, so "hashchange" alone is not
        // enough - these are the events it actually dispatches on view changes.
        // They bubble, which is why they are bound on document.
        window.addEventListener("hashchange", scheduleSync);
        document.addEventListener("viewshow", scheduleSync);
        document.addEventListener("viewhide", scheduleSync);
        document.addEventListener("pageshow", scheduleSync);

        // Catches the view markup being inserted or hidden without an event.
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var target = mutations[i].target;
                // Ignore the mutations the banner itself makes while rendering.
                if (state.el && target && state.el.contains(target)) {
                    continue;
                }

                scheduleSync();
                return;
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
        });

        syncBanner();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
