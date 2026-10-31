/*! Udyaibase widget loader (events and careers) */
(function () {
  "use strict";

  // Loaded twice (e.g. a SPA re-inserting the script)? Just rescan with the live instance.
  if (window.Udyaibase && window.Udyaibase.__live) {
    window.Udyaibase.refresh();
    return;
  }

  var SELECTOR = "[data-udyaibase-widget],[data-udyaibase-jobs]";
  var currentScript = document.currentScript ||
    document.querySelector('script[src*="/embed/loader.js"]');
  var ORIGIN = "https://udyaibase.com";
  try {
    if (currentScript && currentScript.src) ORIGIN = new URL(currentScript.src, location.href).origin;
  } catch (e) {}

  var bootCache = {};      // "kind:widgetId" -> Promise<boot config>, shared by every mount
  var schemaDone = {};     // "kind:widgetId" -> true once JSON-LD is in <head>
  var mounts = [];         // { el, iframe, io }

  function log(msg) {
    if (window.console && console.warn) console.warn("[Udyaibase widget] " + msg);
  }

  function isLocal(host) {
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" ||
      /\.localhost$/.test(host) || /\.test$/.test(host);
  }

  function hostAllowed(domains) {
    if (!domains || domains.length === 0) return true;
    var host = location.hostname.toLowerCase();
    if (isLocal(host)) return true;
    for (var i = 0; i < domains.length; i++) {
      var d = domains[i];
      if (d.indexOf("*.") === 0) {
        var base = d.slice(2);
        if (host === base || host.slice(-(base.length + 1)) === "." + base) return true;
      } else if (host === d) {
        return true;
      }
    }
    return false;
  }

  function basePath(kind) {
    return kind === "jobs" ? "/jobs/" : "/";
  }

  function boot(kind, widgetId) {
    var key = kind + ":" + widgetId;
    if (!bootCache[key]) {
      bootCache[key] = fetch(ORIGIN + "/api/embed" + basePath(kind) + encodeURIComponent(widgetId) + "/schema")
        .then(function (res) { return res.json(); })
        .catch(function () {
          delete bootCache[key]; // network blip: allow a retry on the next mount
          return { active: true, allowedDomains: [], events: [] };
        });
    }
    return bootCache[key];
  }

  function injectSchema(kind, widgetId, events) {
    var key = kind + ":" + widgetId;
    if (schemaDone[key] || !events || events.length === 0) return;
    schemaDone[key] = true;
    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-udyaibase-schema", widgetId);
    script.textContent = JSON.stringify(events); // never innerHTML: titles are organizer-controlled
    document.head.appendChild(script);
  }

  // Lets the widget's "Auto" theme match the background it actually sits on.
  function hostTheme(el) {
    for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
      var m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || parseFloat(m[3]) > 0.5)) {
        var lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
        return lum < 0.5 ? "dark" : "light";
      }
    }
    return "";
  }

  function widgetIdOf(el) {
    return el.getAttribute("data-udyaibase-jobs") || el.getAttribute("data-udyaibase-widget") || el.getAttribute("widget-id") || "";
  }

  // "jobs" = careers widget (data-udyaibase-jobs, or kind="jobs" on the tag); otherwise events.
  function kindOf(el) {
    return el.hasAttribute("data-udyaibase-jobs") || el.getAttribute("kind") === "jobs" ? "jobs" : "events";
  }

  function findMount(el) {
    for (var i = 0; i < mounts.length; i++) if (mounts[i].el === el) return mounts[i];
    return null;
  }

  function mount(target, auto) {
    var el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el || el.nodeType !== 1) return;
    if (auto && el.hasAttribute("data-udyaibase-off")) return; // developer unmounted it manually
    el.removeAttribute("data-udyaibase-off");
    var widgetId = widgetIdOf(el);
    var kind = kindOf(el);
    if (!widgetId) return log("Missing widget id on the container.");

    var existing = findMount(el);
    if (existing && existing.widgetId === widgetId && existing.kind === kind) return; // re-render of the same element
    if (existing) unmount(el);

    var record = { el: el, widgetId: widgetId, kind: kind, iframe: null, io: null, cancelled: false };
    mounts.push(record);
    el.setAttribute("data-udyaibase-loaded", "1");

    boot(kind, widgetId).then(function (cfg) {
      if (record.cancelled) return;
      if (!cfg || !cfg.active) return log("This widget is paused or no longer exists, so nothing is shown.");
      if (!hostAllowed(cfg.allowedDomains)) {
        return log(location.hostname + " isn't in this widget's allowed sites. Add it in your Udyaibase widget settings under Allowed sites.");
      }
      injectSchema(kind, widgetId, cfg.events);
      if ("IntersectionObserver" in window) {
        record.io = new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) return;
          record.io.disconnect();
          record.io = null;
          createIframe(record);
        }, { rootMargin: "300px" });
        record.io.observe(el);
      } else {
        createIframe(record);
      }
    });
  }

  function createIframe(record) {
    if (record.cancelled || record.iframe) return;
    var params = new URLSearchParams(location.search);
    var hash = "ref=" + encodeURIComponent(location.origin + location.pathname);
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) {
      var v = params.get(k);
      if (v) hash += "&" + k + "=" + encodeURIComponent(v);
    });
    var theme = hostTheme(record.el);
    if (theme) hash += "&theme=" + theme;

    var iframe = document.createElement("iframe");
    iframe.src = ORIGIN + "/embed" + basePath(record.kind) + encodeURIComponent(record.widgetId) + "#" + hash;
    iframe.title = record.kind === "jobs" ? "Open roles" : "Upcoming events";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("data-widget-id", record.widgetId);
    iframe.setAttribute("allow", "clipboard-write");
    iframe.style.cssText = "display:block;width:100%;border:0;overflow:hidden;height:0;color-scheme:normal";
    record.iframe = iframe;
    record.el.appendChild(iframe);
  }

  function unmount(target) {
    var el = typeof target === "string" ? document.querySelector(target) : target;
    var record = el && findMount(el);
    if (!record) return;
    record.cancelled = true;
    if (record.io) record.io.disconnect();
    if (record.iframe && record.iframe.parentNode) record.iframe.parentNode.removeChild(record.iframe);
    el.removeAttribute("data-udyaibase-loaded");
    mounts.splice(mounts.indexOf(record), 1);
  }

  function refresh() {
    // Drop mounts whose containers left the page (SPA route change), then mount new ones.
    for (var i = mounts.length - 1; i >= 0; i--) {
      if (!document.documentElement.contains(mounts[i].el)) unmount(mounts[i].el);
    }
    var found = document.querySelectorAll(SELECTOR);
    for (var j = 0; j < found.length; j++) mount(found[j], true);
  }

  // Batch DOM changes into one rescan per frame, so busy SPAs pay almost nothing.
  var scheduled = false;
  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      scheduled = false;
      refresh();
    });
  }

  function relevant(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType !== 1) continue;
      if (n.matches && (n.matches(SELECTOR) || n.querySelector(SELECTOR))) return true;
      if (findMountWithin(n)) return true;
    }
    return false;
  }

  function findMountWithin(node) {
    for (var i = 0; i < mounts.length; i++) {
      if (node === mounts[i].el || node.contains(mounts[i].el)) return true;
    }
    return false;
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== ORIGIN) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    for (var i = 0; i < mounts.length; i++) {
      var iframe = mounts[i].iframe;
      if (!iframe || iframe.contentWindow !== event.source) continue;
      if (data.type === "udyaibase:resize" && typeof data.height === "number") {
        iframe.style.height = Math.max(0, Math.ceil(data.height)) + "px";
      } else if (data.type === "udyaibase:scroll-top") {
        var top = iframe.getBoundingClientRect().top;
        if (top < 0) window.scrollBy({ top: top - 16, behavior: "smooth" });
      }
      break;
    }
  });

  // <udyaibase-widget widget-id="..." [kind="jobs"]></udyaibase-widget> for frameworks that prefer a tag.
  if (window.customElements && !customElements.get("udyaibase-widget")) {
    var Proto = function () { return Reflect.construct(HTMLElement, [], Proto); };
    Proto.prototype = Object.create(HTMLElement.prototype);
    Proto.prototype.connectedCallback = function () {
      if (!this.style.display) this.style.display = "block";
      mount(this);
    };
    Proto.prototype.disconnectedCallback = function () { unmount(this); };
    Object.setPrototypeOf(Proto, HTMLElement);
    try { customElements.define("udyaibase-widget", Proto); } catch (e) {}
  }

  window.Udyaibase = {
    __live: true,
    mount: function (target) { mount(target); },
    unmount: function (target) {
      var el = typeof target === "string" ? document.querySelector(target) : target;
      if (el && el.setAttribute) el.setAttribute("data-udyaibase-off", "");
      unmount(el);
    },
    refresh: refresh,
  };

  function start() {
    var found = document.querySelectorAll(SELECTOR);
    // Site builders that move scripts: fall back to <script data-widget-id="..."> placement.
    if (found.length === 0 && currentScript && currentScript.getAttribute("data-widget-id") && currentScript.parentNode) {
      var div = document.createElement("div");
      div.setAttribute(currentScript.getAttribute("data-kind") === "jobs" ? "data-udyaibase-jobs" : "data-udyaibase-widget", currentScript.getAttribute("data-widget-id"));
      currentScript.parentNode.insertBefore(div, currentScript.nextSibling);
    }
    refresh();
    if ("MutationObserver" in window) {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (relevant(records[i].addedNodes) || relevant(records[i].removedNodes)) return scheduleRefresh();
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
