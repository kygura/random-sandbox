// Runs before first paint so a saved theme never flashes the other one.
(function () {
  var KEY = "iceberg-sounder.theme";
  function apply(choice) {
    var root = document.documentElement;
    if (choice === "light" || choice === "dark") root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
    document.querySelectorAll("[data-theme-choice]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-choice") === (choice || "auto")));
    });
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  apply(saved);
  document.addEventListener("DOMContentLoaded", function () {
    apply(saved);
    document.querySelectorAll("[data-theme-choice]").forEach(function (b) {
      b.addEventListener("click", function () {
        saved = b.getAttribute("data-theme-choice");
        try { if (saved === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved); } catch (e) {}
        apply(saved);
      });
    });
  });
})();
