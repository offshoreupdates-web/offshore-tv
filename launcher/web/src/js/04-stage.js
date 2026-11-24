  // Scale the 1920x1080 stage to the screen.
  // In an Android WebView the first size reading can be wrong, so this also runs on load and when the app asks.
  function fit() {
    var w = document.documentElement.clientWidth || window.innerWidth, h = document.documentElement.clientHeight || window.innerHeight;
    if (!w || !h) return;
    var s = Math.min(w / 1920, h / 1080), sw = Math.max(1920, Math.round(w / s)), sh = Math.max(1080, Math.round(h / s));
    // zoom, not transform: a scaled transform makes the GPU rasterize at 1920 CSS px x DPR and shrink it (~4x the pixels).
    stage.style.zoom = s;
    stage.style.width = sw + "px";
    stage.style.height = sh + "px";
    document.getElementById("frame").style.top = Math.round((sh - 1080) / 2) + "px";
    var vis = 6 + Math.floor((sw - 1920) / TILE_STEP);    // ultrawide: more tiles in view
    if (vis !== TILE_VIS) { TILE_VIS = vis; if (els && els.length && ROWS && ROWS.length) render(); }
  }
  window.guestFit = fit;
  window.addEventListener("resize", fit);
  window.addEventListener("load", fit);
  fit();

