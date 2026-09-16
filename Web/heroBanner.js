(function () {
    "use strict";

    // NOTE: Jellyfin's web client DOM structure isn't a documented, stable API,
    // and can shift between versions/skins. findHomeContentTarget() below tries a
    // few selectors in order of preference. If the banner doesn't appear on your
    // version, inspect the home page in your browser dev tools and add the right
    // selector to that list.

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
        el: null
    };

    function normalizeConfig() {
        CONFIG.rotationSeconds = Math.max(3, parseInt(CONFIG.rotationSeconds, 10) || 8);
        CONFIG.itemsPerLibrary = Math.min(20, Math.max(1, parseInt(CONFIG.itemsPerLibrary, 10) || 1));
        CONFIG.showOverview = !!CONFIG.showOverview;
    }

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift("[HeroBanner]");
        console.log.apply(console, args);
    }

    function fetchConfig() {
        return fetch("/HeroBanner/Settings")
            .then(function (r) {
                return r.ok ? r.json() : null;
            })
            .then(function (json) {
                if (json) {
                    Object.assign(CONFIG, json);
                    normalizeConfig();
                }
            })
            .catch(function () {
                // Use defaults if the settings endpoint isn't reachable yet.
                normalizeConfig();
            });
    }

    function waitForApiClient(cb) {
        if (window.ApiClient && window.ApiClient.getCurrentUserId && window.ApiClient.getCurrentUserId()) {
            cb();
            return;
        }

        setTimeout(function () {
            waitForApiClient(cb);
        }, 500);
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
        var item = state.slides[state.index];
        if (!item || !state.el) {
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

        var playBtn = state.el.querySelector(".heroBannerPlugin-play");
        var moreBtn = state.el.querySelector(".heroBannerPlugin-more");
        playBtn.onclick = function () {
            location.hash = "#!/details?id=" + item.Id + "&autoplay=true";
        };
        moreBtn.onclick = function () {
            location.hash = "#!/details?id=" + item.Id;
        };
    }

    function goTo(i) {
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
        }

        if (state.slides.length > 1) {
            state.timer = setInterval(next, Math.max(3, CONFIG.rotationSeconds) * 1000);
        }
    }

    function findHomeContentTarget() {
        var selectors = [
            "#homePage:not(.hide) .homeSectionsContainer",
            "#indexPage:not(.hide) .homeSectionsContainer",
            ".homePage:not(.hide) .homeSectionsContainer",
            ".homePage:not(.hide)",
            "div[data-role='page']:not(.hide) .content-primary",
            ".mainAnimatedPages > div:not(.hide)"
        ];

        for (var i = 0; i < selectors.length; i++) {
            var found = document.querySelector(selectors[i]);
            if (found) {
                return found;
            }
        }

        return null;
    }

    function isHomeRoute() {
        var hash = location.hash || "";
        return (
            hash.indexOf("/home") !== -1 ||
            hash === "" ||
            hash === "#!/" ||
            hash === "#/"
        );
    }

    function mount() {
        var target = findHomeContentTarget();
        if (!target) {
            return;
        }

        if (!state.el) {
            state.el = buildBanner();
        }

        if (target.firstElementChild !== state.el) {
            target.insertBefore(state.el, target.firstChild);
        }

        loadBannerData();
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

    function checkRoute() {
        if (isHomeRoute()) {
            mount();
        } else {
            unmount();
        }
    }

    function loadBannerData() {
        fetchConfig().then(function () {
            waitForApiClient(function () {
                getLatestPerLibrary()
                    .then(function (items) {
                        if (!items.length) {
                            log("No items found across your libraries - nothing to show.");
                            state.slides = [];
                            state.index = 0;
                            if (state.el) {
                                render();
                            }
                            return;
                        }

                        state.slides = items;
                        state.index = 0;

                        if (state.el) {
                            render();
                            restartTimer();
                        }
                    })
                    .catch(function (err) {
                        log("Failed to load items for the banner", err);
                    });
            });
        });
    }

    function init() {
        window.addEventListener("hashchange", checkRoute);

        var observer = new MutationObserver(function () {
            if (isHomeRoute() && !document.getElementById("heroBannerPlugin")) {
                mount();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        checkRoute();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
