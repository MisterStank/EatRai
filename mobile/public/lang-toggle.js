/* Shared EN/ไทย toggle for the hand-maintained pages (/support, /privacy, /terms).
   The <head> of each page already set html[data-lang] synchronously; this only
   wires the buttons and keeps the choice in one shared localStorage key. */
(function () {
  var KEY = "eatrai-lang";

  function apply(l) {
    document.documentElement.setAttribute("data-lang", l);
    var btns = document.querySelectorAll("[data-lang-btn]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-lang-btn") === l ? "true" : "false");
    }
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
  }

  function init() {
    var cur = document.documentElement.getAttribute("data-lang") || "en";
    apply(cur);
    var btns = document.querySelectorAll("[data-lang-btn]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        apply(this.getAttribute("data-lang-btn"));
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
