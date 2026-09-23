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

    // Inline icons so the buttons don't depend on an icon font being present.
    // The play mark is solid, the info mark is drawn as a stroke - see
    // .heroBannerPlugin-icon-stroke in the stylesheet.
    var ICON_PLAY =
        '<svg class="heroBannerPlugin-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/>' +
        "</svg>";

    var ICON_INFO =
        '<svg class="heroBannerPlugin-icon heroBannerPlugin-icon-stroke" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<circle cx="12" cy="12" r="8.6"/>' +
        '<path d="M12 11.3v5"/>' +
        '<path d="M12 7.9h.01"/>' +
        "</svg>";

    var state = {
        slides: [],
        index: 0,
        timer: null,
        el: null,
        loading: false,
        loaded: false,
        // Which of the two stacked image layers is currently on top.
        layer: 0
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
                    // The extra fields feed the meta line under the title.
                    Fields: "Overview,ProductionYear,OfficialRating,RunTimeTicks,Genres",
                    ImageTypeLimit: 1,
                    EnableImageTypes: "Backdrop,Primary,Thumb"
                });

                return ApiClient.getJSON(url)
                    .then(function (items) {
                        return items || [];
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
            '<div class="heroBannerPlugin-stage">' +
                '<div class="heroBannerPlugin-slide"></div>' +
                '<div class="heroBannerPlugin-slide"></div>' +
            '</div>' +
            '<div class="heroBannerPlugin-scrim"></div>' +
            '<div class="heroBannerPlugin-content">' +
                '<div class="heroBannerPlugin-title"></div>' +
                '<div class="heroBannerPlugin-meta"></div>' +
                '<div class="heroBannerPlugin-overview"></div>' +
                '<div class="heroBannerPlugin-actions">' +
                    '<button type="button" class="heroBannerPlugin-play">' +
                        ICON_PLAY + '<span>Play</span>' +
                    '</button>' +
                    '<button type="button" class="heroBannerPlugin-more">' +
                        ICON_INFO + '<span>More info</span>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="heroBannerPlugin-dots"></div>';
        return el;
    }

    var preloaded = {};

    // The cross-fade only looks right if the incoming artwork is already
    // decoded, otherwise the layer fades in on an empty background.
    function preloadImage(url, cb) {
        if (!url || preloaded[url]) {
            cb();
            return;
        }

        var img = new Image();
        img.onload = function () {
            preloaded[url] = true;
            cb();
        };
        img.onerror = function () {
            // Show it anyway - the layer falls back to the banner background.
            cb();
        };
        img.src = url;
    }

    // Guards against a slow image landing after the slide has already moved on.
    var renderToken = 0;

    function applySlideImage(url) {
        var token = ++renderToken;

        preloadImage(url, function () {
            if (token !== renderToken || !state.el) {
                return;
            }

            var layers = state.el.querySelectorAll(".heroBannerPlugin-slide");
            if (layers.length < 2) {
                return;
            }

            // background-image can't be transitioned, so the new image goes on
            // the hidden layer and the two swap opacity. Clearing the inline
            // style when there is no artwork lets the stylesheet's fallback
            // gradient show through.
            var next = layers[1 - state.layer];
            var current = layers[state.layer];
            next.style.backgroundImage = url ? 'url("' + url + '")' : "";
            next.classList.add("is-active");
            current.classList.remove("is-active");
            state.layer = 1 - state.layer;
        });
    }

    // Restarts the staged text entrance. Reading offsetWidth forces a reflow -
    // without it the browser coalesces the class removal and the animation
    // never replays.
    function replayEntrance() {
        var content = state.el.querySelector(".heroBannerPlugin-content");
        if (!content) {
            return;
        }

        content.classList.remove("is-entering");
        void content.offsetWidth;
        content.classList.add("is-entering");
    }

    // "2h 9m" rather than "129 min" - the same way a streaming service states
    // it, and it keeps the meta line short.
    function runtimeLabel(ticks) {
        if (!ticks) {
            return "";
        }

        // Jellyfin reports durations in ticks, 10,000 per millisecond.
        var minutes = Math.round(ticks / 600000000);
        if (!minutes) {
            return "";
        }

        var hours = Math.floor(minutes / 60);
        var rest = minutes % 60;

        if (!hours) {
            return rest + " min";
        }

        return rest ? hours + "h " + rest + "m" : hours + "h";
    }

    // Year / rating / runtime / genres, skipping whatever the item doesn't have.
    function renderMeta(item) {
        var metaEl = state.el.querySelector(".heroBannerPlugin-meta");
        metaEl.innerHTML = "";

        var parts = [];
        if (item.ProductionYear) {
            parts.push(String(item.ProductionYear));
        }
        if (item.OfficialRating) {
            parts.push(item.OfficialRating);
        }

        var runtime = runtimeLabel(item.RunTimeTicks);
        if (runtime) {
            parts.push(runtime);
        }
        if (item.Genres && item.Genres.length) {
            parts.push(item.Genres.slice(0, 2).join(" / "));
        }

        if (!parts.length) {
            metaEl.style.display = "none";
            return;
        }

        parts.forEach(function (part, i) {
            if (i > 0) {
                var sep = document.createElement("span");
                sep.className = "heroBannerPlugin-metaSep";
                sep.setAttribute("aria-hidden", "true");
                sep.textContent = "·";
                metaEl.appendChild(sep);
            }

            var span = document.createElement("span");
            span.textContent = part;
            metaEl.appendChild(span);
        });

        metaEl.style.display = "";
    }

    // The active pill fills over the rotation interval, so the banner shows how
    // long is left on the current title.
    function renderDots() {
        var dotsEl = state.el.querySelector(".heroBannerPlugin-dots");
        dotsEl.innerHTML = "";

        if (state.slides.length < 2) {
            return;
        }

        state.slides.forEach(function (_, i) {
            var dot = document.createElement("span");
            dot.className = "heroBannerPlugin-dot" + (i === state.index ? " active" : "");
            dot.setAttribute("role", "button");
            dot.setAttribute("tabindex", "0");
            dot.setAttribute("aria-label", "Slide " + (i + 1) + " of " + state.slides.length);

            var fill = document.createElement("i");
            fill.setAttribute("aria-hidden", "true");
            if (i === state.index) {
                fill.style.animationDuration = Math.max(3, CONFIG.rotationSeconds) + "s";
            }
            dot.appendChild(fill);

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

        applySlideImage(imageUrl(item));
        replayEntrance();

        state.el.querySelector(".heroBannerPlugin-title").textContent = item.Name || "";

        renderMeta(item);

        var overviewEl = state.el.querySelector(".heroBannerPlugin-overview");
        if (CONFIG.showOverview && item.Overview) {
            overviewEl.textContent = item.Overview;
            overviewEl.style.display = "";
        } else {
            overviewEl.style.display = "none";
        }

        renderDots();

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
