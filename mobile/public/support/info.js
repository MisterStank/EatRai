/* Opens the "Who you're supporting" dialog from the info button. Without
   <dialog> support the button stays inert and the page still works. */
(function () {
  "use strict";
  var dlg = document.getElementById("about");
  var open = document.getElementById("infobtn");
  var close = document.getElementById("aboutclose");
  if (!dlg || !open || typeof dlg.showModal !== "function") {
    if (open) open.hidden = true;
    return;
  }
  open.addEventListener("click", function () { dlg.showModal(); });
  if (close) close.addEventListener("click", function () { dlg.close(); });
  // a tap on the dimmed backdrop lands on the <dialog> element itself
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
})();
