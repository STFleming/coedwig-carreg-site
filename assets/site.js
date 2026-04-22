(function () {
  var HOVER_DELAY = 350;
  var HIDE_DELAY = 120;

  // --- Root-relative URL helper -------------------------------------------
  var rootPrefix = "./";
  (function () {
    var link = document.getElementById("osr-previews");
    if (link) {
      var href = link.getAttribute("href") || "";
      rootPrefix = href.replace(/previews\.(?:js|json).*$/, "");
      if (!rootPrefix) rootPrefix = "./";
    }
  })();

  function resolveRootUrl(url) {
    if (!url) return url;
    if (url.charAt(0) === "/" && url.charAt(1) !== "/") {
      return rootPrefix + url.slice(1);
    }
    return url;
  }

  // --- Preview data -------------------------------------------------------
  // The previews.js script (loaded in <head>) assigns window.__osrPreviews.
  // This works for both file:// and http:// since no fetch() is involved.
  function loadPreviews() {
    return Promise.resolve(window.__osrPreviews || {});
  }

  // --- Tooltip rendering --------------------------------------------------
  var current = null; // {el, showTimer, hideTimer, targetEl}

  function buildTooltipEl(preview) {
    var div = document.createElement("div");
    div.className = "link-preview";
    var html = '<div class="link-preview-title">' + escapeHtml(preview.title) + "</div>";
    if (preview.image) {
      html += '<div class="link-preview-thumb"><img src="' +
              escapeAttr(resolveRootUrl(preview.image)) + '" alt=""></div>';
    }
    if (preview.excerpt) {
      html += '<div class="link-preview-excerpt">' + escapeHtml(preview.excerpt) + "</div>";
    }
    div.innerHTML = html;
    return div;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function positionTooltip(el, anchorRect, cursorEvent) {
    var margin = 12;
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var vpW = window.innerWidth;
    var vpH = window.innerHeight;
    var x, y;
    if (anchorRect) {
      x = anchorRect.right + margin;
      y = anchorRect.top;
      if (x + w > vpW - 8) x = Math.max(8, anchorRect.left - w - margin);
      if (y + h > vpH - 8) y = Math.max(8, vpH - h - 8);
    } else if (cursorEvent) {
      x = cursorEvent.clientX + margin;
      y = cursorEvent.clientY + margin;
      if (x + w > vpW - 8) x = Math.max(8, cursorEvent.clientX - w - margin);
      if (y + h > vpH - 8) y = Math.max(8, vpH - h - 8);
    } else {
      x = 8; y = 8;
    }
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  function showPreview(preview, opts) {
    hidePreview(true);
    var el = buildTooltipEl(preview);
    document.body.appendChild(el);
    positionTooltip(el, opts.anchorRect, opts.cursorEvent);
    // Fade in
    requestAnimationFrame(function () { el.classList.add("visible"); });
    current = { el: el };
  }

  function hidePreview(immediate) {
    if (!current) return;
    var el = current.el;
    current = null;
    if (immediate) { el.remove(); return; }
    el.classList.remove("visible");
    setTimeout(function () { el.remove(); }, 120);
  }

  function attachHoverToElement(el, slug, previews) {
    var preview = previews[slug];
    if (!preview) return;
    var showTimer = null;
    var hideTimer = null;
    el.addEventListener("mouseenter", function (e) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      showTimer = setTimeout(function () {
        showPreview(preview, {
          anchorRect: el.getBoundingClientRect(),
          cursorEvent: e,
        });
      }, HOVER_DELAY);
    });
    el.addEventListener("mouseleave", function () {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      hideTimer = setTimeout(function () { hidePreview(false); }, HIDE_DELAY);
    });
  }

  function attachHoverHandlers() {
    loadPreviews().then(function (previews) {
      // Wikilink anchors carry data-slug
      document.querySelectorAll("a[data-slug]").forEach(function (a) {
        attachHoverToElement(a, a.getAttribute("data-slug"), previews);
      });
      // Leaflet pins: the map JS registers its markers via __osrAttachPin
      window.__osrPreviews = previews;
      if (Array.isArray(window.__osrPendingPins)) {
        window.__osrPendingPins.forEach(function (fn) { fn(previews); });
        window.__osrPendingPins = [];
      }
    });
  }

  // --- Leaflet integration ------------------------------------------------
  var allMaps = [];

  function glyphFor(iconName) {
    var map = {
      "bed": "\u2615",
      "church": "\u2720",
      "building": "\u25A0",
      "map-marker": "\u25CF"
    };
    return map[iconName] || "\u25CF";
  }

  function makeIcon(marker) {
    var glyph = glyphFor(marker.iconName);
    var klass = "osr-pin";
    if (!marker.href) klass += " osr-pin-unlinked";
    var style = "border-color:" + (marker.color || "#2a1f14") + ";";
    var html =
      '<div class="' + klass + '" style="' + style + '">' +
        '<span class="osr-pin-glyph" style="color:' + (marker.color || "#2a1f14") + '">' + glyph + '</span>' +
      '</div>';
    return L.divIcon({
      html: html,
      className: "osr-pin-wrap",
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function attachPinPreview(leafletMarker, slug) {
    function bind(previews) {
      var preview = previews[slug];
      if (!preview) return;
      var hideTimer = null;
      leafletMarker.on("mouseover", function (e) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        var rect = null;
        if (e.originalEvent && e.originalEvent.target && e.originalEvent.target.getBoundingClientRect) {
          rect = e.originalEvent.target.getBoundingClientRect();
        }
        showPreview(preview, {
          anchorRect: rect,
          cursorEvent: e.originalEvent,
        });
      });
      leafletMarker.on("mouseout", function () {
        hideTimer = setTimeout(function () { hidePreview(false); }, HIDE_DELAY);
      });
    }
    if (window.__osrPreviews) {
      bind(window.__osrPreviews);
    } else {
      window.__osrPendingPins = window.__osrPendingPins || [];
      window.__osrPendingPins.push(bind);
    }
  }

  function initMap(entry) {
    var el = document.getElementById(entry.id);
    if (!el) return;
    var cfg = entry.cfg;
    var opts = { crs: L.CRS.Simple };
    if (cfg.minZoom !== null && cfg.minZoom !== undefined) opts.minZoom = cfg.minZoom;
    if (cfg.maxZoom !== null && cfg.maxZoom !== undefined) opts.maxZoom = cfg.maxZoom;
    if (cfg.zoomDelta !== null && cfg.zoomDelta !== undefined) opts.zoomDelta = cfg.zoomDelta;
    var map = L.map(el, opts);
    allMaps.push(map);
    var bounds = cfg.bounds;
    L.imageOverlay(cfg.imageUrl, bounds).addTo(map);
    map.fitBounds(bounds);
    if (cfg.center) {
      var z = (cfg.defaultZoom !== null && cfg.defaultZoom !== undefined) ? cfg.defaultZoom : map.getZoom();
      map.setView(cfg.center, z);
    } else if (cfg.defaultZoom !== null && cfg.defaultZoom !== undefined) {
      map.setZoom(cfg.defaultZoom);
    }
    (cfg.markers || []).forEach(function (m) {
      var icon = makeIcon(m);
      var marker = L.marker(m.loc, { icon: icon, interactive: !!m.href || !!m.tooltip });
      marker.addTo(map);
      var tooltip = m.tooltip || m.label;
      if (tooltip) {
        marker.bindTooltip(tooltip, { className: "osr-tooltip", direction: "top", offset: [0, -10] });
      }
      if (m.href) {
        marker.on("click", function () {
          window.location.href = m.href;
        });
      }
      if (m.slug) {
        attachPinPreview(marker, m.slug);
      }
    });
  }

  function initAllMaps() {
    if (typeof L === "undefined") return;
    var queue = window.__osrMaps || [];
    queue.forEach(initMap);
    window.__osrMaps = []; // consumed
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        allMaps.forEach(function (m) {
          try { m.invalidateSize(); } catch (e) {}
        });
      }, 120);
    });
  }

  function highlightCurrentNav() {
    var here = window.location.pathname.replace(/\/$/, "/index.html");
    if (!/\.html$/.test(here) && here.charAt(here.length - 1) !== "/") here += "/index.html";
    var links = document.querySelectorAll(".sidebar-nav a[href]");
    var match = null;
    for (var i = 0; i < links.length; i++) {
      try {
        var p = new URL(links[i].href, window.location.href).pathname;
        if (p === here) { match = links[i]; break; }
      } catch (e) { /* ignore */ }
    }
    if (!match) return;
    match.classList.add("current");
    // Open every <details> ancestor so the current entry is visible.
    var el = match.parentElement;
    while (el && el !== document.body) {
      if (el.tagName === "DETAILS") el.open = true;
      el = el.parentElement;
    }
    // Scroll into view if off-screen in the sidebar.
    try {
      match.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (e) { /* ignore */ }
  }

  function onReady() {
    initAllMaps();
    attachHoverHandlers();
    highlightCurrentNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
