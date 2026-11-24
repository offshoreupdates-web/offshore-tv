package app.offshore;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.MutableContextWrapper;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayOutputStream;

/**
 * The home screen itself: one WebView for the whole app, created once and kept running. The Home-button service lives
 * in this process, so Android keeps it alive while guests use other apps, and coming back never reloads the page.
 *
 * The same WebView is shown in MainActivity and, right after Home is pressed, in GuestService's overlay: Android
 * blocks other apps' activities for ~5 s after Home, but the overlay can show the live home screen at once, so the
 * remote works immediately instead of after the lock. MainActivity takes it back when it comes up.
 */
final class Home {
    static final String TAG = MainActivity.TAG;
    static final String PREFS = "offshore";
    static final String PREF_PAUSED_UNTIL = "paused_until";   // wall clock; set when the app crashes

    private static Home instance;

    final Context app;
    final WebView web;
    private final MutableContextWrapper ctx;
    private boolean pageReady;
    private String pendingToast;
    /** Shown in GuestService's overlay (app launches are queued by Android until the Home lock ends). */
    boolean bridging;

    static Home get(Context c) {
        if (instance == null) instance = new Home(c.getApplicationContext());
        return instance;
    }

    static boolean exists() { return instance != null; }

    private Home(Context app) {
        this.app = app;
        installCrashFallback(app);
        ctx = new MutableContextWrapper(app);
        web = new WebView(ctx);
        web.setBackgroundColor(0xFF000000);
        web.setFocusable(false);                 // keys are routed by whichever window shows it
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // weather cache
        s.setAllowFileAccess(true);              // the page itself and saved background photos
        s.setAllowFileAccessFromFileURLs(false); // but scripts can't read files
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setSaveFormData(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.addJavascriptInterface(new Bridge(), "Offshore");
        web.setWebViewClient(new WebViewClient() {
            // The bridge (Offshore) is only for our own page: the WebView never navigates anywhere else.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest req) {
                return !req.getUrl().toString().startsWith("file:///android_asset/");
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) { return !url.startsWith("file:///android_asset/"); }

            @Override
            public void onPageFinished(WebView view, String url) {
                web.evaluateJavascript("guestFit && guestFit()", null);
                sendBanners();
                musicArtSent = null;                 // a fresh page has no cover yet
                pageReady = true;
                if (!visible && !frozenTimers) {     // loaded behind an app (after an update or a restart): out of its way
                    main.removeCallbacks(freeze); main.postDelayed(freeze, 8000);
                }
                if (pendingToast != null) { toast(pendingToast); pendingToast = null; }
                web.evaluateJavascript("window.guestNet && guestNet(" + netState + ", true)", null);
                for (String js : pendingNotices) web.evaluateJavascript(js, null);
                pendingNotices.clear();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's renderer died: start a fresh home screen instead of letting the whole app crash.
                Log.w(TAG, "web renderer gone, recreating the home screen");
                shutdown();
                web.destroy();
                instance = null;
                MainActivity a = MainActivity.current;
                if (a != null) a.attachHome();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.i(TAG, "page: " + m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        configStamp = configStamp();
        web.loadUrl("file:///android_asset/index.html");
        watchNetwork();
        watchApps();
        systemUpdated();
        loadSounds();
        Alerts.restart(app);
        GuestService.ensureOn(app);                        // the Home button, if the user set it up and it was dropped
        main.postDelayed(new Runnable() {                  // a tv.json pushed while nobody uses the TV: apply it within a minute
            @Override
            public void run() { if (gone) return; reloadIfConfigChanged(); GuestService.ensureOn(app); main.postDelayed(this, 60000); }
        }, 60000);
    }

    // The page stays loaded for days, so a newly pushed tv.json is noticed by its timestamp.
    private long configStamp;

    private long configStamp() {
        java.io.File f = MainActivity.configFile(app);
        return f == null ? 0 : f.lastModified();
    }

    /** Reload the page if tv.json changed since it was loaded. */
    boolean reloadIfConfigChanged() {
        if (configStamp() == configStamp) return false;
        reload();
        return true;
    }

    boolean isReady() { return pageReady; }

    /** Show the home screen in `parent` (MainActivity's layout or the service overlay). */
    void attach(ViewGroup parent, Context base) {
        ViewParent p = web.getParent();
        if (p == parent) return;
        if (p != null) ((ViewGroup) p).removeView(web);
        ctx.setBaseContext(base);
        parent.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    /** This Home is being replaced (its renderer died): let go of everything registered with Android, so the next one
     *  doesn't run alongside a second copy of the watchers, sounds and loops. */
    private boolean gone;

    private void shutdown() {
        gone = true;
        thaw();                                  // pauseTimers is process-wide: the next page must start thawed
        detach();
        try { if (cm != null && netCb != null) cm.unregisterNetworkCallback(netCb); } catch (Exception ignored) { }
        try { if (appsRcv != null) app.unregisterReceiver(appsRcv); } catch (Exception ignored) { }
        try {
            ((android.media.session.MediaSessionManager) app.getSystemService(Context.MEDIA_SESSION_SERVICE)).removeOnActiveSessionsChangedListener(sessionsCb);
        } catch (Exception ignored) { }
        if (music != null) { music.unregisterCallback(musicCb); music = null; }
        for (String pkg : new java.util.ArrayList<>(shows.keySet())) forgetShow(pkg);
        if (devicesImpl != null) devicesImpl.stop();
        if (soundPool != null) soundPool.release();
        main.removeCallbacks(sleeper);
    }

    void detach() {
        nativeVideoStop();                       // the 4K layer only lives behind the home screen's own window
        ViewParent p = web.getParent();
        if (p != null) ((ViewGroup) p).removeView(web);
        ctx.setBaseContext(app);
    }

    // ---- Live background in 4K: Android's own player on a layer behind the (then transparent) page. The page itself is
    // drawn at 1920x1080 on Fire TV, so a video inside it can't be sharper than that; a SurfaceView behind it goes to the
    // TV's video plane at the clip's own resolution. Muted, never takes audio focus (music in another app keeps playing),
    // only in MainActivity's window. Tells the page guestNativeVid(event, width, height).
    // Drawn through a TextureView (the normal graphics path), not a SurfaceView: on this TV the SurfaceView's hardware
    // video plane showed the clips upside down. The frames' own transform is applied by SurfaceTexture, and the picture
    // is scaled to cover the screen. MediaPlayer itself never takes audio focus, so music in other apps keeps playing.
    private android.view.TextureView tex;
    private android.media.MediaPlayer player;
    private String vidUrl;

    private void nativeVideoPlay(final String url) {
        ViewParent p = web.getParent();
        if (!(p instanceof ViewGroup) || MainActivity.current == null || ((ViewGroup) p).getContext() != MainActivity.current) {
            js("window.guestNativeVid && guestNativeVid('unavailable',0,0)");
            return;
        }
        ViewGroup parent = (ViewGroup) p;
        vidUrl = url;
        if (tex == null) {
            tex = new android.view.TextureView(MainActivity.current);
            tex.setSurfaceTextureListener(new android.view.TextureView.SurfaceTextureListener() {
                @Override public void onSurfaceTextureAvailable(android.graphics.SurfaceTexture st, int w, int h) { if (vidUrl != null) startPlayer(vidUrl); }
                @Override public void onSurfaceTextureSizeChanged(android.graphics.SurfaceTexture st, int w, int h) { coverScreen(); }
                @Override public boolean onSurfaceTextureDestroyed(android.graphics.SurfaceTexture st) { releasePlayer(); return true; }
                @Override public void onSurfaceTextureUpdated(android.graphics.SurfaceTexture st) { }
            });
        }
        if (tex.getParent() != parent) {
            if (tex.getParent() != null) ((ViewGroup) tex.getParent()).removeView(tex);
            parent.addView(tex, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));   // behind the page
        }
        web.setBackgroundColor(0x00000000);
        if (tex.isAvailable()) startPlayer(url);                          // otherwise when its surface is ready
    }

    private void startPlayer(String url) {
        releasePlayer();
        try {
            final android.media.MediaPlayer mp = new android.media.MediaPlayer();
            player = mp;
            // Wikimedia asks every app to say who it is (its User-Agent policy) and turns away requests that don't;
            // Android's player on its own sends only a generic name, so the clips stopped loading on the TV.
            java.util.Map<String, String> h = new java.util.HashMap<>();
            if (url.startsWith("https://")) h.put("User-Agent", "Offshore (TV home screen; https://offshoreupdates-web.github.io/offshore/)");
            mp.setDataSource(app, Uri.parse(url), h);
            mp.setSurface(new android.view.Surface(tex.getSurfaceTexture()));
            mp.setVolume(0f, 0f);
            // Loops in the player itself: the clip starts over with no gap. (It used to stop at the end and the page
            // started it again, which rebuilt the player and fetched the clip again: a short clip blinked every few
            // seconds.) The page moves to the next clip on its own timer, or never when one clip was chosen.
            mp.setLooping(true);
            mp.setOnPreparedListener(new android.media.MediaPlayer.OnPreparedListener() {
                @Override public void onPrepared(android.media.MediaPlayer m) {
                    if (m != player) return;
                    m.start();
                    js("window.guestNativeVid && guestNativeVid('playing'," + m.getVideoWidth() + "," + m.getVideoHeight() + ")");
                }
            });
            mp.setOnVideoSizeChangedListener(new android.media.MediaPlayer.OnVideoSizeChangedListener() {
                @Override public void onVideoSizeChanged(android.media.MediaPlayer m, int w, int h) { coverScreen(); }
            });
            mp.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() {
                @Override public void onCompletion(android.media.MediaPlayer m) { if (m == player) js("window.guestNativeVid && guestNativeVid('ended',0,0)"); }
            });
            mp.setOnErrorListener(new android.media.MediaPlayer.OnErrorListener() {
                @Override public boolean onError(android.media.MediaPlayer m, int what, int extra) {
                    Log.w(TAG, "live background: player error " + what + "/" + extra);
                    if (m == player) js("window.guestNativeVid && guestNativeVid('error'," + what + "," + extra + ")");
                    return true;
                }
            });
            mp.prepareAsync();
        } catch (Exception e) {
            Log.w(TAG, "live background: " + e);
            js("window.guestNativeVid && guestNativeVid('error',0,0)");
        }
    }

    /** Scale the video to fill the screen without stretching (the edges of a non-16:9 clip are cropped). */
    private void coverScreen() {
        if (tex == null || player == null) return;
        float vw = player.getVideoWidth(), vh = player.getVideoHeight(), w = tex.getWidth(), h = tex.getHeight();
        if (vw <= 0 || vh <= 0 || w <= 0 || h <= 0) return;
        float s = Math.max(w / vw, h / vh);
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setScale(vw * s / w, vh * s / h, w / 2f, h / 2f);
        tex.setTransform(m);
    }

    private void releasePlayer() {
        if (player == null) return;
        try { player.release(); } catch (Exception ignored) { }
        player = null;
    }

    void nativeVideoStop() {
        vidUrl = null;
        releasePlayer();
        if (tex != null && tex.getParent() != null) ((ViewGroup) tex.getParent()).removeView(tex);
        tex = null;
        web.setBackgroundColor(0xFF000000);
    }

    void reload() {
        configStamp = configStamp();
        Alerts.restart(app);                     // tv.json may have new alert settings
        nativeVideoStop();                       // the new page starts its own background
        if (frozenTimers) { web.resumeTimers(); frozenTimers = false; }   // a frozen page can't load
        main.removeCallbacks(freeze); main.removeCallbacks(alertsTick);
        if (!visible) main.postDelayed(freeze, 8000);                       // and freeze again once it has
        pageReady = false;
        web.reload();
    }

    /** Remote keys -> page. Returns false for keys the page doesn't use (volume etc. pass through). */
    /** When OK was last pressed on the real remote: risky bridge calls must follow one (a script can't press keys). */
    private volatile long lastOkAt;

    private boolean justPressedOk() { return android.os.SystemClock.uptimeMillis() - lastOkAt < 2000; }

    boolean key(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN && (e.getKeyCode() == KeyEvent.KEYCODE_DPAD_CENTER || e.getKeyCode() == KeyEvent.KEYCODE_ENTER))
            lastOkAt = android.os.SystemClock.uptimeMillis();
        String action;
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_LEFT:  action = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: action = "right"; break;
            case KeyEvent.KEYCODE_DPAD_UP:    action = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN:  action = "down"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A:   action = "ok"; break;
            case KeyEvent.KEYCODE_BACK:       action = "back"; break;   // closes the System panel; otherwise nothing
            case KeyEvent.KEYCODE_MENU:       action = "menu"; break;   // ☰: move the focused tile (as on Fire TV's home)
            default: return false;
        }
        if ("menu".equals(action)) {                   // pressed or held: once
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) web.evaluateJavascript("guestNav('menu')", null);
            return true;
        }
        // Holding OK on a tile opens its menu (Open, Hide tile, Remove app): one "hold" once the key has repeated a while.
        if ("ok".equals(action) && e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 8) {
            web.evaluateJavascript("guestNav('hold')", null);
            return true;
        }
        boolean repeatOk = e.getRepeatCount() > 0 && "ok".equals(action);
        if (e.getAction() == KeyEvent.ACTION_DOWN && !repeatOk) web.evaluateJavascript("guestNav('" + action + "')", null);
        return true;
    }

    /** The home screen is on screen again: start its idle clock (ambient mode) from zero. */
    void shown() {
        visible = true;
        thaw();                                     // timers first, so guestShown's catch-up can run
        if (pageReady) web.evaluateJavascript("window.guestShown && guestShown()", null);
        if (cm != null) postNet();                  // Wi-Fi bars aren't polled while hidden
        if (musicStale) { musicStale = false; sendMusic(); }
        for (android.media.session.MediaController c : new java.util.ArrayList<>(shows.values())) noteShow(c);   // where you stopped
        flushShows();
    }

    /** True while the home screen is on screen (MainActivity or the overlay after Home). */
    boolean visible;

    // ---- Notices: alerts from Alerts (webhook, ntfy), VPN changes, urgent weather ----------------

    private final java.util.List<String> pendingNotices = new java.util.ArrayList<>();

    /** Show a notice on the home screen; urgent ones also appear over whatever app is open. */
    /** Runs JavaScript in the page now, or once it has loaded (from any thread). */
    void pageJs(final String code) {
        main.post(new Runnable() {
            @Override
            public void run() { if (pageReady) web.evaluateJavascript(code, null); else pendingNotices.add(code); }
        });
    }

    // ---- Music in the dock: what's playing in any app (MediaSession), with play/pause/skip. Needs MediaListener
    // enabled (see MediaListener.java); without it the page explains how. Also which Bluetooth audio device is connected.
    private android.media.session.MediaController music;
    private boolean musicAllowed;
    private String musicArtKey = "", musicArt = "";
    private final android.media.session.MediaController.Callback musicCb = new android.media.session.MediaController.Callback() {
        @Override public void onPlaybackStateChanged(android.media.session.PlaybackState s) { sendMusic(); }
        @Override public void onMetadataChanged(android.media.MediaMetadata m) { sendMusic(); }
        @Override public void onSessionDestroyed() { watchMusic(); }
    };
    private final android.media.session.MediaSessionManager.OnActiveSessionsChangedListener sessionsCb =
            new android.media.session.MediaSessionManager.OnActiveSessionsChangedListener() {
        @Override public void onActiveSessionsChanged(java.util.List<android.media.session.MediaController> list) { pickMusic(list); trackShows(list); }
    };

    /** Downloads a sound off the main thread; preview plays it from the cache, a slot keeps it in files/sounds. */
    private void soundJob(final String id, final String url, final String slot) {
        NAS_IO.execute(new Runnable() {
            @Override
            public void run() {
                boolean ok = false;
                try {
                    java.io.File dir = slot == null ? new java.io.File(app.getCacheDir(), "sound-preview") : new java.io.File(app.getFilesDir(), "sounds");
                    dir.mkdirs();
                    java.io.File[] old = dir.listFiles();
                    if (old != null) for (java.io.File f : old) if (slot == null || f.getName().startsWith(slot + ".")) f.delete();
                    final java.io.File f = fetchSound(url, new java.io.File(dir, slot == null ? "preview" : slot));
                    if (f != null) {
                        ok = true;
                        main.post(new Runnable() {
                            @Override
                            public void run() {
                                if (slot != null) { Integer prev = custom.remove(slot); if (prev != null) soundPool.unload(prev); }
                                final int sid = soundPool.load(f.getPath(), 1);
                                if (slot != null) custom.put(slot, sid);
                                else soundPool.setOnLoadCompleteListener(new android.media.SoundPool.OnLoadCompleteListener() {
                                    @Override public void onLoadComplete(android.media.SoundPool p, int s, int status) { if (s == sid && status == 0) play(s, true, 4000, 0.6f); }
                                });
                            }
                        });
                    }
                } catch (Throwable e) {
                    Log.w(TAG, "sound download: " + e);
                }
                pageJs("window.guestSound && guestSound(" + org.json.JSONObject.quote(id) + "," + ok + ")");
            }
        });
    }

    private volatile long sleepAt;
    private volatile CalendarLink calLink;   // the "add a calendar from your phone" form while its screen is open
    private volatile CalendarLink liveLink;  // the same form in playlist mode (Settings > Live TV > Add from your phone)

    /** Downloads for the page (feeds, quotes, calendars, air quality): a few at a time, never a thread per request. */
    /** Offshore's downloads and file work run below the app on screen, so Plex and the like always get the CPU first. */
    static final java.util.concurrent.ThreadFactory LOW = new java.util.concurrent.ThreadFactory() {
        @Override
        public Thread newThread(final Runnable r) {
            return new Thread(new Runnable() {
                @Override
                public void run() { android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND); r.run(); }
            }, "offshore-bg");
        }
    };
    private static final java.util.concurrent.ExecutorService NET = java.util.concurrent.Executors.newFixedThreadPool(4, LOW);

    /** The site part of a host name: example.com for www.example.com, bbc.co.uk for feeds.bbc.co.uk. */
    static String site(String host) {
        String[] p = host.toLowerCase(java.util.Locale.US).split("\\.");
        int keep = p.length >= 3 && p[p.length - 1].length() == 2 && p[p.length - 2].length() <= 3 ? 3 : 2;
        StringBuilder b = new StringBuilder();
        for (int i = Math.max(0, p.length - keep); i < p.length; i++) b.append(b.length() > 0 ? "." : "").append(p[i]);
        return b.toString();
    }

    /** GET over HTTPS: the body, or null if it failed, wasn't 200, or was bigger than cap (a cut-off body is useless). */
    static String httpGet(String url, String accept, int cap) {
        java.net.HttpURLConnection c = null;
        try {
            c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent", "Offshore");
            if (accept != null) c.setRequestProperty("Accept", accept);
            // The FCC's station search answers 403 to anyone asking for compressed data, which Android does by default.
            if (url.startsWith("https://transition.fcc.gov/")) c.setRequestProperty("Accept-Encoding", "identity");
            if (c.getResponseCode() != 200) return null;
            // A redirect may only land on the same site (www. ↔ bare, feeds. ↔ www.) or another allowed calendar link,
            // so an open redirect on an allowed host can't take a request anywhere else.
            String from = new java.net.URL(url).getHost(), to = c.getURL().getHost();
            if (!site(from).equalsIgnoreCase(site(to)) && !Calendars.allowed(c.getURL().toString())) {
                Log.w(TAG, "fetch " + from + ": redirected off-site to " + to);
                return null;
            }
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            try (java.io.InputStream in = c.getInputStream()) {
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) { b.write(buf, 0, n); if (b.size() > cap) return null; }
            }
            return b.toString("UTF-8");
        } catch (Exception e) {
            Log.w(TAG, "fetch " + Uri.parse(url).getHost() + " failed: " + e);
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** News feeds carry whole articles; the page only shows titles, sources and times, so the rest stays here. */
    static String slimFeed(String s) {
        if (s == null || !(s.contains("<rss") || s.contains("<feed") || s.contains("<rdf"))) return s;
        return s.replaceAll("(?s)<content:encoded>.*?</content:encoded>", "").replaceAll("(?s)<description>.*?</description>", "")
                .replaceAll("(?s)<summary[^>]*>.*?</summary>", "").replaceAll("(?s)<content[ >][^<]*(?:<(?!/content>)[^<]*)*</content>", "")
                .replaceAll("(?s)<media:[^>]*?/>", "").replaceAll("(?s)<media:(\\w+)[^>]*>.*?</media:\\1>", "");
    }
    /** CISA's Known Exploited Vulnerabilities catalogue is ~1.8 MB of every CVE ever added; the page shows the newest few. */
    static String slimKev(String s) {
        if (s == null) return null;
        try {
            org.json.JSONArray all = new org.json.JSONObject(s).getJSONArray("vulnerabilities");
            java.util.List<org.json.JSONObject> list = new java.util.ArrayList<>();
            for (int i = 0; i < all.length(); i++) list.add(all.getJSONObject(i));
            java.util.Collections.sort(list, new java.util.Comparator<org.json.JSONObject>() {
                @Override public int compare(org.json.JSONObject a, org.json.JSONObject b) { return b.optString("dateAdded").compareTo(a.optString("dateAdded")); }
            });
            org.json.JSONArray out = new org.json.JSONArray();
            for (int i = 0; i < Math.min(10, list.size()); i++) {
                org.json.JSONObject v = list.get(i);
                out.put(new org.json.JSONObject().put("cveID", v.optString("cveID")).put("vulnerabilityName", v.optString("vulnerabilityName"))
                        .put("vendorProject", v.optString("vendorProject")).put("product", v.optString("product")).put("dateAdded", v.optString("dateAdded")));
            }
            return new org.json.JSONObject().put("vulnerabilities", out).toString();
        } catch (Exception e) {
            return null;
        }
    }
    private volatile String airText;     // the AirNow reporting-area file, kept for 30 minutes (Bridge.airQuality)
    private volatile long airAt;
    private final Runnable sleeper = new Runnable() {
        @Override
        public void run() {
            sleepAt = 0;
            GuestService s = GuestService.running;
            boolean ok = s != null && s.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN);
            Log.i(TAG, "sleep timer ended: " + ok);
            pageJs("window.guestSleepDone && guestSleepDone(" + ok + ")");
        }
    };

    private Devices devicesImpl;
    private Devices devices() { if (devicesImpl == null) devicesImpl = new Devices(app, this); return devicesImpl; }

    /** Music apps the Music card offers when nothing is playing (Fire TV / Android TV packages), in this order. */
    /** Music apps for the Now playing card's "Open a music app": these when installed, plus any app that tells Android
     *  it's an audio app (so new ones show up by themselves). Video players that can also play music aren't offered. */
    static final String[] MUSIC_APPS = {
        "com.spotify.tv.android", "com.apple.android.music", "com.amazon.bueller.music", "com.pandora.android.atv",
        "com.clearchannel.iheartradio.controller", "com.sirius", "com.aspiro.tidal", "com.deezer.android.tv",
        "com.soundcloud.android", "com.google.android.youtube.tvmusic", "tv.plex.labs.plexamp", "tunein.player",
        "com.qobuz.music", "com.audiomack", "com.napster.android"
    };
    static final java.util.List<String> NOT_MUSIC = java.util.Arrays.asList("org.xbmc.kodi", "com.plexapp.android",
        "org.jellyfin.androidtv", "org.videolan.vlc", "com.mxtech.videoplayer.ad", "com.amazon.avod", "com.amazon.firebat");

    java.util.List<String> musicAppsInstalled() {
        PackageManager pm = app.getPackageManager();
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        for (String p : MUSIC_APPS) if (launchable(pm, p)) out.add(p);
        try {
            for (android.content.pm.ApplicationInfo ai : pm.getInstalledApplications(0))
                if (ai.category == android.content.pm.ApplicationInfo.CATEGORY_AUDIO && !NOT_MUSIC.contains(ai.packageName) && launchable(pm, ai.packageName))
                    out.add(ai.packageName);
        } catch (Exception ignored) { }
        return new java.util.ArrayList<>(out);
    }

    private static boolean launchable(PackageManager pm, String p) {
        try { pm.getPackageInfo(p, 0); } catch (Exception e) { return false; }
        return pm.getLeanbackLaunchIntentForPackage(p) != null || pm.getLaunchIntentForPackage(p) != null;
    }

    static void musicPermissionChanged(Context c) {
        final Home h = get(c);
        h.main.post(new Runnable() { @Override public void run() { h.watchMusic(); } });
    }

    void watchMusic() {
        android.media.session.MediaSessionManager m = (android.media.session.MediaSessionManager) app.getSystemService(Context.MEDIA_SESSION_SERVICE);
        ComponentName me = new ComponentName(app, MediaListener.class);
        try {
            m.removeOnActiveSessionsChangedListener(sessionsCb);
            m.addOnActiveSessionsChangedListener(sessionsCb, me);
            musicAllowed = true;
            java.util.List<android.media.session.MediaController> list = m.getActiveSessions(me);
            pickMusic(list);
            trackShows(list);
        } catch (SecurityException e) {
            musicAllowed = false;
            sendMusic();
        }
    }

    private void pickMusic(java.util.List<android.media.session.MediaController> list) {
        // A music app playing first, then anything playing, then a music app that's paused, then anything paused: a
        // paused Plex film shouldn't push a song off the card (shows are Keep watching's, trackShows).
        android.media.session.MediaController best = null;
        int bestRank = 0;
        for (android.media.session.MediaController c : list) {
            android.media.session.PlaybackState s = c.getPlaybackState();
            boolean playing = s != null && s.getState() == android.media.session.PlaybackState.STATE_PLAYING;
            int rank = (playing ? 4 : c.getMetadata() != null ? 2 : 0) + (playing || c.getMetadata() != null ? (isVideoApp(c.getPackageName()) ? 0 : 1) : 0);
            if (rank > bestRank) { best = c; bestRank = rank; }
        }
        if (music != null) music.unregisterCallback(musicCb);
        music = best;
        if (music != null) music.registerCallback(musicCb, new android.os.Handler(android.os.Looper.getMainLooper()));
        sendMusic();
    }

    // ---- Keep watching from your own apps. Fire OS keeps
    // apps' Continue watching lists private, but a video app that plays something tells Android what (title, artwork,
    // where you are) through its media session, the same thing the Music card reads. Offshore notes the latest show per
    // app while it plays and hands it to the page (guestWatch) once the home screen is back. Nothing leaves the TV.
    private final java.util.Map<String, android.media.session.MediaController> shows = new java.util.HashMap<>();
    private final java.util.Map<String, android.media.session.MediaController.Callback> showCbs = new java.util.HashMap<>();
    private final java.util.Map<String, org.json.JSONObject> showPending = new java.util.LinkedHashMap<>();
    private final java.util.Map<String, String> showArtKey = new java.util.HashMap<>();
    private static final java.util.Map<String, android.app.PendingIntent> showActs = new java.util.HashMap<>();
    private static final java.util.Map<String, String> screenTitles = new java.util.HashMap<>();
    private static final java.util.Map<String, Long> screenTitleAt = new java.util.HashMap<>();

    /** Settings › Home screen › Keep watching › Fox One show names (GuestService reads Fox One's screen only while this is on). */
    static boolean screenTitlesOn(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("screen_titles", false); }

    // ---- Which Fox One channel a show is on. Fox One's screen names the show, never the channel. TVmaze (a public TV
    // listings database) is asked once per show name; its answer counts only if its show's name is the same as the one
    // on screen and its channel is one of Fox One's. Live sports and specials TVmaze doesn't list are named only where
    // the title itself says the channel; otherwise there's no channel (the card keeps Fox One's look). Kept on the TV.
    private static final String[][] FOX_CHANNELS = {
        {"foxnewschannel", "foxnews"}, {"foxnews", "foxnews"}, {"foxbusinessnetwork", "foxbusiness"}, {"foxbusiness", "foxbusiness"},
        {"fox", "fox"}, {"foxbroadcastingcompany", "fox"}, {"fs1", "fs1"}, {"foxsports1", "fs1"}, {"fs2", "fs2"}, {"foxsports2", "fs2"},
        {"bigtennetwork", "btn"}, {"btn", "btn"}, {"foxweather", "foxweather"}, {"foxdeportes", "foxdeportes"}, {"foxnation", "foxnation"},
        {"foxsoul", "foxsoul"}, {"livenowfromfox", "livenow"}, {"livenow", "livenow"}
    };
    static final java.util.Map<String, String> showChannel = new java.util.HashMap<>();

    private static String norm(String t) { return t.toLowerCase(java.util.Locale.US).replaceAll("^the\\s+", "").replaceAll("[^a-z0-9]", ""); }

    private static String foxChannelOf(String network) {
        String n = norm(network);
        for (String[] c : FOX_CHANNELS) if (c[0].equals(n)) return c[1];
        return "";
    }

    /** Only where the title says it outright: "Fox Weather …", "B1G …", "Fox News …", "Fox Business …". */
    private static String channelFromTitle(String t) {
        if (t.matches("(?i)^fox weather\\b.*")) return "foxweather";
        if (t.matches("(?i)^(b1g|big ten network)\\b.*")) return "btn";
        if (t.matches("(?i)^fox news\\b.*")) return "foxnews";
        if (t.matches("(?i)^fox business\\b.*")) return "foxbusiness";
        return "";
    }

    void findChannel(final String title) {
        final android.content.SharedPreferences sp = app.getSharedPreferences("channels", Context.MODE_PRIVATE);
        String known = sp.getString(norm(title), null);
        if (known != null) { showChannel.put(title, known); return; }
        PLEX_IO.execute(new Runnable() {
            @Override public void run() {
                String ch = "";
                boolean answered = false;                                         // no answer (offline): ask again next time
                try {
                    String body = httpGet("https://api.tvmaze.com/singlesearch/shows?q=" + java.net.URLEncoder.encode(title, "UTF-8"), "application/json", 1 << 20);
                    if (body != null) {
                        answered = true;
                        org.json.JSONObject j = new org.json.JSONObject(body);
                        if (norm(j.optString("name")).equals(norm(title))) {        // the same show, not just a close one
                            org.json.JSONObject net = j.optJSONObject("network");
                            if (net == null) net = j.optJSONObject("webChannel");
                            if (net != null) ch = foxChannelOf(net.optString("name"));
                        }
                    }
                } catch (Exception e) { Log.w(TAG, "channel lookup: " + e.getClass().getSimpleName()); }
                if (ch.isEmpty()) ch = channelFromTitle(title);
                final String found = ch;
                if (answered || !found.isEmpty()) {
                    if (sp.getAll().size() > 300) sp.edit().clear().apply();          // a few hundred show names at most
                    sp.edit().putString(norm(title), found).apply();
                }
                main.post(new Runnable() {
                    @Override public void run() {
                        showChannel.put(title, found);
                        Log.i(TAG, "channel for the Fox One show: " + (found.isEmpty() ? "not sure" : found));
                        android.media.session.MediaController mc = shows.get(GuestService.FOX);
                        if (mc != null) noteShow(mc);
                    }
                });
            }
        });
    }

    /** A show's name read off an app's screen (GuestService.foxPoll): used while the app's own session gives none. */
    static void screenTitle(Context c, final String pkg, final String title) {
        final Home h = get(c);
        h.main.post(new Runnable() {
            @Override public void run() {
                boolean changed = !title.equals(screenTitles.get(pkg));
                screenTitles.put(pkg, title); screenTitleAt.put(pkg, System.currentTimeMillis());
                android.media.session.MediaController mc = h.shows.get(pkg);
                if (changed && mc != null) h.noteShow(mc);
                if (changed) h.findChannel(title);
            }
        });
    }

    /** Opens what was playing in that app: Fox One's channel by its link; else the app's own player screen while Android
     *  still has it (the session's activity); else the app. Only from a real OK press (Bridge.showOpen). */
    void openShow(String pkg, String mid) {
        if (!isVideoApp(pkg)) return;
        if ("com.fox.foxone".equals(pkg) && mid != null && mid.matches("[A-Za-z0-9_-]{4,80}")) {
            Intent f = new Intent(Intent.ACTION_VIEW, Uri.parse("foxone://channel/" + mid)).setPackage(pkg);
            if (f.resolveActivity(app.getPackageManager()) != null) {
                Log.i(TAG, "open " + pkg + " at its channel");
                if (bridging) { toast("Opening " + label(pkg) + "…"); sendCmd(app, "bridge_launch"); }
                start(f, pkg);
                return;
            }
        }
        android.app.PendingIntent pi = showActs.get(pkg);
        if (pi != null) {
            try {
                if (bridging) sendCmd(app, "bridge_launch");
                pi.send();
                Log.i(TAG, "open " + pkg + " at its player");
                return;
            } catch (Exception e) { showActs.remove(pkg); }
        }
        handle(pkg);
    }

    /** Amazon-made video apps (YouTube on Fire TV is Amazon's own build), which Keep watching counts like any other. */
    static final java.util.List<String> AMAZON_VIDEO = java.util.Arrays.asList("com.amazon.avod", "com.amazon.firebat",
        "com.amazon.avod.thirdpartyclient", "com.amazon.firetv.youtube", "com.amazon.firetv.youtube.kids", "com.amazon.imdb.tv.android.app");

    /** True for an app whose playback belongs on Keep watching: not a music app, not part of Fire OS, not Offshore. */
    boolean isVideoApp(String pkg) {
        if (pkg == null || pkg.equals(app.getPackageName()) || pkg.startsWith("com.android.") || pkg.equals("android")) return false;
        if (pkg.startsWith("com.amazon.") && !AMAZON_VIDEO.contains(pkg)) return false;   // Fire OS itself, but not Amazon's video apps
        if (java.util.Arrays.asList(MUSIC_APPS).contains(pkg)) return false;
        if (NOT_MUSIC.contains(pkg)) return true;
        try { if (app.getPackageManager().getApplicationInfo(pkg, 0).category == android.content.pm.ApplicationInfo.CATEGORY_AUDIO) return false; }
        catch (Exception e) { return false; }
        return true;
    }

    private void trackShows(java.util.List<android.media.session.MediaController> list) {
        java.util.Set<String> now = new java.util.HashSet<>();
        for (final android.media.session.MediaController c : list) {
            final String pkg = c.getPackageName();
            if (!isVideoApp(pkg) || now.contains(pkg)) continue;
            now.add(pkg);
            if (shows.get(pkg) != null && shows.get(pkg).getSessionToken().equals(c.getSessionToken())) continue;
            forgetShow(pkg);
            android.media.session.MediaController.Callback cb = new android.media.session.MediaController.Callback() {
                @Override public void onPlaybackStateChanged(android.media.session.PlaybackState s) { noteShow(c); }
                @Override public void onMetadataChanged(android.media.MediaMetadata m) { noteShow(c); }
                @Override public void onSessionDestroyed() { forgetShow(pkg); }
            };
            c.registerCallback(cb, new android.os.Handler(android.os.Looper.getMainLooper()));
            shows.put(pkg, c); showCbs.put(pkg, cb);
            noteShow(c);
        }
        for (String pkg : new java.util.ArrayList<>(shows.keySet())) if (!now.contains(pkg)) forgetShow(pkg);
    }

    private void forgetShow(String pkg) {
        android.media.session.MediaController c = shows.remove(pkg);
        android.media.session.MediaController.Callback cb = showCbs.remove(pkg);
        if (c != null && cb != null) try { c.unregisterCallback(cb); } catch (Exception ignored) { }
    }

    private static String firstText(android.media.MediaMetadata md, String... keys) {
        for (String k : keys) { CharSequence v = md.getText(k); if (v != null && v.toString().trim().length() > 0) return v.toString().trim(); }
        return "";
    }

    /** Notes where a video app is, but only while it's playing or paused on something (an idle session says nothing). */
    private void noteShow(android.media.session.MediaController c) {
        try {
            android.media.session.PlaybackState s = c.getPlaybackState();
            int st = s == null ? 0 : s.getState();
            boolean playing = st == android.media.session.PlaybackState.STATE_PLAYING;
            if (!playing && st != android.media.session.PlaybackState.STATE_PAUSED) return;
            String pkg = c.getPackageName();
            org.json.JSONObject o = showPending.get(pkg);
            if (o == null && !playing) return;                      // a session that's only ever been paused: nothing watched
            if (o == null) o = new org.json.JSONObject();
            android.media.MediaMetadata md = c.getMetadata();
            String title = "", sub = "", mid = "";
            long dur = 0;
            if (md != null) {
                mid = firstText(md, android.media.MediaMetadata.METADATA_KEY_MEDIA_ID);
                title = firstText(md, android.media.MediaMetadata.METADATA_KEY_DISPLAY_TITLE, android.media.MediaMetadata.METADATA_KEY_TITLE);
                sub = firstText(md, android.media.MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, android.media.MediaMetadata.METADATA_KEY_ARTIST,
                        android.media.MediaMetadata.METADATA_KEY_ALBUM, android.media.MediaMetadata.METADATA_KEY_DISPLAY_DESCRIPTION);
                dur = md.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION);
            }
            // Live apps (Fox One) may leave the metadata empty and name what's on in their queue instead.
            android.graphics.Bitmap qArt = null; String qArtUri = "";
            if (title.isEmpty() || mid.isEmpty()) {
                java.util.List<android.media.session.MediaSession.QueueItem> q = c.getQueue();
                if (q != null && !q.isEmpty()) {
                    android.media.session.MediaSession.QueueItem pick = q.get(0);
                    for (android.media.session.MediaSession.QueueItem it : q) if (it.getQueueId() == s.getActiveQueueItemId()) pick = it;
                    android.media.MediaDescription d = pick.getDescription();
                    if (d != null && mid.isEmpty() && d.getMediaId() != null) mid = d.getMediaId().trim();
                    if (d != null && title.isEmpty()) {
                        if (d.getTitle() != null) title = d.getTitle().toString().trim();
                        if (sub.isEmpty() && d.getSubtitle() != null) sub = d.getSubtitle().toString().trim();
                        qArt = d.getIconBitmap();
                        if (d.getIconUri() != null) qArtUri = d.getIconUri().toString();
                    }
                }
            }
            if (title.isEmpty() && screenTitles.containsKey(pkg) && System.currentTimeMillis() - screenTitleAt.get(pkg) < 3 * 3600000L)
                title = screenTitles.get(pkg);                      // read off its screen (Fox One show names)
            long pos = s.getPosition();
            if (playing && s.getLastPositionUpdateTime() > 0)
                pos += (long) ((android.os.SystemClock.elapsedRealtime() - s.getLastPositionUpdateTime()) * s.getPlaybackSpeed());
            // The app's own id for what's on (Fox One: its channel's id, which its foxone://channel/ links take), kept only if
            // it looks like an id, and the session's own "open the player" intent while it lasts (showOpen).
            if (!mid.matches("[A-Za-z0-9._:-]{1,120}")) mid = "";
            if (!o.has("mid") || !mid.equals(o.optString("mid")) || title.isEmpty() != o.optString("title").isEmpty())
                Log.i(TAG, "show " + pkg + ": " + (title.isEmpty() ? "no title" : "titled") + ", id " + (mid.isEmpty() ? "none" : mid) + ", state " + st);
            if (c.getSessionActivity() != null) showActs.put(pkg, c.getSessionActivity());
            o.put("mid", mid);
            String ch = showChannel.get(title);
            o.put("ch", ch == null ? "" : ch);
            o.put("pkg", pkg).put("app", label(pkg)).put("title", title).put("sub", sub.equals(title) ? "" : sub)
             .put("pos", Math.max(0, pos)).put("dur", Math.max(0, dur)).put("t", System.currentTimeMillis());
            String key = title + "|" + sub;
            if ((md != null || qArt != null || !qArtUri.isEmpty()) && !key.equals(showArtKey.get(pkg))) {   // artwork once per title: a small JPEG, or the app's https link
                showArtKey.put(pkg, key);
                String art = "";
                Bitmap b = qArt;
                if (b == null && md != null) b = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ART);
                if (b == null && md != null) b = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_DISPLAY_ICON);
                if (b == null && md != null) b = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART);
                if (b != null && b.getWidth() > 8) {
                    Bitmap small = Bitmap.createScaledBitmap(b, 384, Math.max(1, 384 * b.getHeight() / b.getWidth()), true);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    small.compress(Bitmap.CompressFormat.JPEG, 78, bo);
                    art = "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                } else if (qArtUri.startsWith("https://") && qArtUri.length() < 2000) {
                    art = qArtUri;
                } else if (md != null) {
                    String u = firstText(md, android.media.MediaMetadata.METADATA_KEY_ART_URI, android.media.MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI,
                            android.media.MediaMetadata.METADATA_KEY_ALBUM_ART_URI);
                    if (u.startsWith("https://") && u.length() < 2000) art = u;
                }
                o.put("art", art);
            }
            showPending.put(pkg, o);
            if (visible && pageReady) flushShows();
        } catch (Exception e) {
            Log.w(TAG, "show: " + e);
        }
    }

    /** Hands what was watched to the page (on the home screen, or as it comes back). */
    private void flushShows() {
        for (org.json.JSONObject o : showPending.values()) pageJs("window.guestWatch && guestWatch(" + o + ")");
        showPending.clear();
    }

    // While an app is on screen, music changes are only noted; the latest is sent once the home screen is back (shown()).
    private boolean musicStale;
    private String musicArtSent;

    private void sendMusic() {
        if (!visible && pageReady) { musicStale = true; return; }
        org.json.JSONObject o = new org.json.JSONObject();
        try {
            o.put("allowed", musicAllowed).put("bt", bluetoothAudio()).put("out", musicOutput());
            android.media.session.MediaController c = music;
            android.media.MediaMetadata md = c == null ? null : c.getMetadata();
            if (c != null && md != null) {
                android.media.session.PlaybackState s = c.getPlaybackState();
                String title = md.getString(android.media.MediaMetadata.METADATA_KEY_TITLE);
                String artist = md.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST);
                if (artist == null) artist = md.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                String album = md.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM);
                o.put("album", album == null ? "" : album);
                o.put("app", label(c.getPackageName())).put("pkg", c.getPackageName()).put("title", title == null ? "" : title).put("artist", artist == null ? "" : artist)
                 .put("playing", s != null && s.getState() == android.media.session.PlaybackState.STATE_PLAYING);
                // Progress (the page moves the bar between updates), what the app allows, its own buttons, and volume.
                o.put("duration", md.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION));
                if (s != null) {
                    o.put("position", s.getPosition()).put("speed", s.getPlaybackSpeed()).put("at", s.getLastPositionUpdateTime())
                     .put("now", android.os.SystemClock.elapsedRealtime()).put("actions", s.getActions());
                    org.json.JSONArray custom = new org.json.JSONArray();
                    for (android.media.session.PlaybackState.CustomAction a : s.getCustomActions()) {
                        if (custom.length() < 4) custom.put(new org.json.JSONObject().put("id", a.getAction()).put("name", String.valueOf(a.getName())));
                    }
                    o.put("custom", custom);
                }
                android.media.session.MediaController.PlaybackInfo pi = c.getPlaybackInfo();
                if (pi != null && pi.getVolumeControl() != android.media.VolumeProvider.VOLUME_CONTROL_FIXED) {
                    o.put("volume", pi.getCurrentVolume()).put("volumeMax", pi.getMaxVolume());
                }
                String key = c.getPackageName() + title + artist;
                if (!key.equals(musicArtKey)) {                     // artwork: small JPEG, encoded once per track
                    musicArtKey = key;
                    musicArt = "";
                    Bitmap art = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART);
                    if (art == null) art = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ART);
                    if (art != null) {
                        Bitmap small = Bitmap.createScaledBitmap(art, 200, Math.max(1, 200 * art.getHeight() / Math.max(1, art.getWidth())), true);
                        ByteArrayOutputStream b = new ByteArrayOutputStream();
                        small.compress(Bitmap.CompressFormat.JPEG, 85, b);
                        musicArt = "data:image/jpeg;base64," + Base64.encodeToString(b.toByteArray(), Base64.NO_WRAP);
                    }
                }
                if (!musicArt.equals(musicArtSent)) { o.put("art", musicArt); musicArtSent = musicArt; }   // the page keeps the last one
            }
        } catch (Exception e) {
            Log.w(TAG, "music: " + e);
        }
        pageJs("window.guestMusic && guestMusic(" + o + ")");
    }

    /** The app's name for a package (for "Playing in Spotify"). */
    private String label(String pkg) {
        try { return app.getPackageManager().getApplicationLabel(app.getPackageManager().getApplicationInfo(pkg, 0)).toString(); }
        catch (Exception e) { return pkg; }
    }

    /** Name of the connected Bluetooth headphones or speaker, or "". */
    private String bluetoothAudio() {
        try {
            android.bluetooth.BluetoothAdapter a = android.bluetooth.BluetoothAdapter.getDefaultAdapter();
            if (a == null || !a.isEnabled()) return "";
            if (a.getProfileConnectionState(android.bluetooth.BluetoothProfile.A2DP) != android.bluetooth.BluetoothProfile.STATE_CONNECTED) return "";
            for (android.bluetooth.BluetoothDevice d : a.getBondedDevices()) {
                android.bluetooth.BluetoothClass k = d.getBluetoothClass();
                if (k != null && k.getMajorDeviceClass() == android.bluetooth.BluetoothClass.Device.Major.AUDIO_VIDEO
                        && isConnected(d)) return d.getName() == null ? "Bluetooth audio" : d.getName();
            }
            return "Bluetooth audio";
        } catch (Exception e) {
            return "";
        }
    }

    private static boolean isConnected(android.bluetooth.BluetoothDevice d) {
        try { return (Boolean) d.getClass().getMethod("isConnected").invoke(d); } catch (Exception e) { return true; }
    }

    // Receive from phones (LocalSend.java). One receiver for the app's life, so the port isn't bound twice if the page
    // is recreated. The page asks, shows codes and results; while an app is on screen a corner card says to press Home.
    private static LocalSend share;

    private static LocalSend share(final Context c) {
        if (share == null) share = new LocalSend(c, new LocalSend.Ui() {
            @Override
            public void ask(String id, org.json.JSONObject r) {
                Home h = get(c);
                if (!h.visible && GuestService.running != null) {
                    GuestService.running.showUrgent(r.optString("from") + " wants to send files", "Press Home to accept or decline", "Receive from phones");
                }
                h.pageJs("window.guestShare && guestShare(" + org.json.JSONObject.quote(id) + "," + r + ")");
            }

            @Override
            public void showPin(String pin, String from) {
                Home h = get(c);
                if (!h.visible && GuestService.running != null) {             // over the app on screen, so it can be read
                    GuestService.running.showUrgent("LocalSend code: " + pin.substring(0, 3) + " " + pin.substring(3),
                            "Enter it on the phone or computer sending", "Receive from phones");
                }
                h.pageJs("window.guestSharePin && guestSharePin(" + org.json.JSONObject.quote(pin) + "," + org.json.JSONObject.quote(from) + ")");
            }

            @Override
            public void done(String id, org.json.JSONObject result) {
                get(c).pageJs("window.guestShareDone && guestShareDone(" + result + ")");
            }

            @Override
            public void message(String text) {
                get(c).pageJs("window.guestToast && guestToast(" + org.json.JSONObject.quote(text) + ")");
            }
        });
        return share;
    }

    static void notice(Context c, org.json.JSONObject n) {
        Home h = get(c);
        if ("urgent".equals(n.optString("level")) && !h.visible && !h.notifyPaused() && GuestService.running != null) {
            GuestService.running.showUrgent(n.optString("title"), n.optString("message"), n.optString("source"));
        }
        String js = "window.guestNotice && guestNotice(" + n + ")";
        if (h.pageReady) h.web.evaluateJavascript(js, null); else h.pendingNotices.add(js);
    }

    // ---- Network status for the status box: Wi-Fi / Ethernet / offline, signal bars, VPN ------------------

    private android.net.ConnectivityManager cm;
    private String netState = "";

    // Pause notifications (set from the page): no urgent cards over apps until then; -1 = until turned back on.
    // Life-threatening weather warnings (Bridge.urgent) still come through.
    boolean notifyPaused() {
        long until = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("notify_paused_until", 0);
        return until == -1 || until > System.currentTimeMillis();
    }

    private android.net.ConnectivityManager.NetworkCallback netCb;

    private void watchNetwork() {
        cm = (android.net.ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        android.net.ConnectivityManager.NetworkCallback cb = netCb = new android.net.ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(android.net.Network n) { postNet(); }
            @Override public void onLost(android.net.Network n) { postNet(); }
            @Override public void onCapabilitiesChanged(android.net.Network n, android.net.NetworkCapabilities c) { postNet(); }
        };
        try {
            cm.registerNetworkCallback(new android.net.NetworkRequest.Builder()
                .removeCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(), cb);   // all networks, VPNs too
        } catch (Exception e) {
            Log.w(TAG, "can't watch the network", e);
        }
        netState = readNet();
        main.postDelayed(new Runnable() {                  // Wi-Fi signal has no callback on Android 9: look every 30 s
            @Override
            public void run() { if (gone) return; if (visible) postNet(); main.postDelayed(this, 30000); }
        }, 30000);
    }

    private String readNet() {
        boolean vpn = false, online = false;
        String type = "none";
        try {
            for (android.net.Network n : cm.getAllNetworks()) {
                android.net.NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc == null) continue;
                if (nc.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN)) { vpn = true; continue; }
                if (!nc.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
                if (nc.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET)) type = "ethernet";
                else if (nc.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) && !"ethernet".equals(type)) type = "wifi";
                if (nc.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)) online = true;
            }
        } catch (Exception ignored) { }
        int bars = 0;
        if ("wifi".equals(type)) {
            try {
                android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) app.getSystemService(Context.WIFI_SERVICE);
                bars = android.net.wifi.WifiManager.calculateSignalLevel(wm.getConnectionInfo().getRssi(), 5);
            } catch (Exception ignored) { }
        }
        return "{\"type\":\"" + type + "\",\"online\":" + online + ",\"bars\":" + bars + ",\"vpn\":" + vpn + "}";
    }

    private void postNet() {
        main.post(new Runnable() {
            @Override
            public void run() {
                String s = readNet();
                if (s.equals(netState)) return;
                netState = s;
                if (pageReady) web.evaluateJavascript("window.guestNet && guestNet(" + s + ", false)", null);
            }
        });
    }

    // UI sounds (res/raw, made for this app): low-latency SoundPool, interface-sound audio usage.
    private android.media.SoundPool soundPool;
    private final java.util.Map<String, Integer> sounds = new java.util.HashMap<>();

    private void loadSounds() {
        soundPool = new android.media.SoundPool.Builder().setMaxStreams(3).setAudioAttributes(new android.media.AudioAttributes.Builder()
            .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
        // Sound sets (Customize > Music & sound): soft = ui_*, and crisp / glass / wood (tools/make_sounds.ps1).
        String[][] sets = {{"soft", "ui"}, {"crisp", "crisp"}, {"glass", "glass"}, {"wood", "wood"}};
        for (String[] s : sets) for (String n : new String[]{"move", "select", "back"}) {
            int res = app.getResources().getIdentifier(s[1] + "_" + n, "raw", app.getPackageName());
            if (res != 0) sounds.put(s[0] + "_" + n, soundPool.load(app, res, 1));
        }
        for (String n : new String[]{"chime", "glass", "bell"}) {
            int res = app.getResources().getIdentifier("notif_" + n, "raw", app.getPackageName());
            if (res != 0) sounds.put("notif_" + n, soundPool.load(app, res, 1));
        }
        java.io.File[] mine = new java.io.File(app.getFilesDir(), "sounds").listFiles();   // sounds chosen from the internet
        if (mine != null) for (java.io.File f : mine) custom.put(f.getName().replaceAll("\\..*$", ""), soundPool.load(f.getPath(), 1));
    }

    private String soundSet = "soft", notifySound = "off";
    private final java.util.Map<String, Integer> custom = new java.util.HashMap<>();   // slot (move/select/back/notify) -> sound
    private static final java.util.List<String> SLOTS = java.util.Arrays.asList("move", "select", "back", "notify");

    /**
     * The sound for a serious alert over an app (GuestService.showUrgent): Settings > Notifications > Emergency alert
     * sound, kept in prefs so it works before the page has loaded. "tone" is made here: three rising two-note chirps,
     * twice (about 3 s). It is deliberately not the Emergency Alert System's own tone, which only broadcasters may use.
     * It plays as an alarm and asks the app on screen to lower its sound meanwhile (a movie ducks, then comes back).
     */
    boolean playAlert() { return playAlert(false); }

    /**
     * With pauseFirst, whatever is playing is paused first (a media Pause key to the app that's playing): a movie with
     * surround sound goes to the TV or soundbar untouched ("passthrough"), and Android can't mix anything into it, so
     * the tone would be silent (found over Plex). Like a broadcast emergency, the movie stays paused under the
     * card; Play carries on. Returns true when something was paused.
     */
    boolean playAlert(boolean pauseFirst) {
        final String v = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("alert_sound", "tone");
        if ("off".equals(v)) return false;
        android.media.AudioManager am = (android.media.AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        boolean paused = false;
        if (pauseFirst && am != null && am.isMusicActive()) {
            long t = android.os.SystemClock.uptimeMillis();
            am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PAUSE, 0));
            am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PAUSE, 0));
            paused = true;
            Log.i(TAG, "paused what was playing for a serious alert");
        }
        alertPaused = paused;                                        // this alert's own pause, never an older one's
        main.removeCallbacks(pendingAlert);
        pendingAlert = new Runnable() {                              // the soundbar needs a moment to leave passthrough
            @Override
            public void run() { alertSound(v); }
        };
        main.postDelayed(pendingAlert, paused ? 1500 : 0);
        return paused;
    }

    private Runnable pendingAlert;
    private volatile android.media.AudioTrack alertTrack;

    private boolean alertPaused;

    /**
     * OK or Back on the alert card (GuestService): silence the tone now (or before it starts) and, if the alert paused
     * a movie, carry on playing it once the tone has let go of the sound. (When the card times out instead, the movie
     * stays paused: nobody misses part of it while they deal with the warning.)
     */
    void stopAlert() {
        if (pendingAlert != null) main.removeCallbacks(pendingAlert);
        android.media.AudioTrack t = alertTrack;
        if (t != null) try { t.pause(); t.flush(); } catch (Exception ignored) { }
        if (!alertPaused) return;
        alertPaused = false;
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                android.media.AudioManager am = (android.media.AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
                if (am == null) return;
                long now = android.os.SystemClock.uptimeMillis();
                am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY, 0));
                am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY, 0));
                Log.i(TAG, "alert closed: playback resumed");
            }
        }, 400);
    }

    private void alertSound(String v) {
        if (!"tone".equals(v)) { play(sounds.get("notif_" + v), false, 0, 1f); return; }
        new Thread(new Runnable() {
            @Override
            public void run() {
                android.media.AudioManager am = (android.media.AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
                android.media.AudioAttributes aa = new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
                android.media.AudioFocusRequest focus = new android.media.AudioFocusRequest.Builder(
                    android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(aa).build();
                int rate = 44100;
                double[][] notes = {{784, 1047}, {880, 1175}, {988, 1319}};   // G5-C6, A5-D6, B5-E6: rising, bright
                java.io.ByteArrayOutputStream pcm = new java.io.ByteArrayOutputStream();
                for (int rep = 0; rep < 2; rep++) {
                    for (double[] n : notes) {
                        tone(pcm, rate, n[0], 0.11); tone(pcm, rate, n[1], 0.16); silence(pcm, rate, 0.09);
                    }
                    silence(pcm, rate, 0.35);
                }
                byte[] b = pcm.toByteArray();
                android.media.AudioTrack t = null;
                try {
                    am.requestAudioFocus(focus);
                    t = new android.media.AudioTrack.Builder().setAudioAttributes(aa)
                        .setAudioFormat(new android.media.AudioFormat.Builder().setSampleRate(rate)
                            .setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(android.media.AudioFormat.CHANNEL_OUT_MONO).build())
                        .setTransferMode(android.media.AudioTrack.MODE_STATIC).setBufferSizeInBytes(b.length).build();
                    t.write(b, 0, b.length);
                    alertTrack = t;
                    t.play();
                    long end = android.os.SystemClock.uptimeMillis() + b.length / 2 * 1000L / rate + 150;
                    while (android.os.SystemClock.uptimeMillis() < end && t.getPlayState() == android.media.AudioTrack.PLAYSTATE_PLAYING) Thread.sleep(100);
                } catch (Exception e) {
                    Log.w(TAG, "alert tone: " + e);
                } finally {
                    if (alertTrack == t) alertTrack = null;
                    if (t != null) t.release();
                    am.abandonAudioFocusRequest(focus);
                }
            }
        }, "alert-tone").start();
    }

    /** One note into 16-bit mono PCM, with soft edges (no clicks) and a gentle fade, like a chime rather than a beep. */
    private static void tone(java.io.ByteArrayOutputStream out, int rate, double hz, double sec) {
        int n = (int) (rate * sec), edge = rate / 200;
        for (int i = 0; i < n; i++) {
            double env = Math.min(1, Math.min(i, n - i) / (double) edge) * (1 - 0.35 * i / n);
            double v = (Math.sin(2 * Math.PI * hz * i / rate) + 0.25 * Math.sin(4 * Math.PI * hz * i / rate)) * env * 0.55;
            short s = (short) (Math.max(-1, Math.min(1, v)) * 32767);
            out.write(s & 0xff); out.write((s >> 8) & 0xff);
        }
    }

    private static void silence(java.io.ByteArrayOutputStream out, int rate, double sec) {
        for (int i = 0, n = (int) (rate * sec) * 2; i < n; i++) out.write(0);
    }

    /** Plays a sound; a sound from the internet is cut off after a moment, so a long clip never drones on. */
    private void play(Integer id, boolean mine, long maxMs, float vol) {
        if (id == null || soundPool == null) return;
        final int stream = soundPool.play(id, vol, vol, 1, 0, 1f);
        if (mine && stream != 0) main.postDelayed(new Runnable() { @Override public void run() { soundPool.stop(stream); } }, maxMs);
    }

    /** Downloads a sound (Wikimedia Commons only, up to 2 MB, ogg / oga / wav / mp3 / flac) to a file; null if refused. */
    private java.io.File fetchSound(String url, java.io.File to) throws Exception {
        Uri u = Uri.parse(url);
        String ext = u.getLastPathSegment() == null ? "" : u.getLastPathSegment().replaceAll("^.*\\.", "").toLowerCase(java.util.Locale.US);
        if (!"https".equals(u.getScheme()) || !"upload.wikimedia.org".equals(u.getHost()) || !ext.matches("ogg|oga|wav|mp3|flac")) return null;
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "Offshore/2.30 (personal TV launcher)");
        if (c.getContentLength() > 2 << 20) return null;
        java.io.File f = new java.io.File(to.getPath() + "." + ext);
        try (java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream o = new java.io.FileOutputStream(f)) {
            byte[] buf = new byte[16384];
            long n = 0;
            for (int r; (r = in.read(buf)) > 0; ) { n += r; if (n > 2 << 20) throw new java.io.IOException("too large"); o.write(buf, 0, r); }
        } catch (Exception e) { f.delete(); throw e; }
        return f;
    }

    // US Census ZIP table (assets/zips.txt: "zip,lat,lon", sorted), loaded on first use.
    private int[] zipCodes;
    private float[] zipLat, zipLon;

    private synchronized void loadZips() {
        if (zipCodes != null) return;
        java.util.ArrayList<String> rows = new java.util.ArrayList<>();
        try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(app.getAssets().open("zips.txt"), "UTF-8"))) {
            for (String l; (l = r.readLine()) != null; ) if (!l.isEmpty() && l.charAt(0) != '#') rows.add(l);
        } catch (Exception e) {
            Log.w(TAG, "zips.txt", e);
        }
        int[] z = new int[rows.size()];
        float[] la = new float[rows.size()], lo = new float[rows.size()];
        int n = 0;
        for (String l : rows) {
            String[] p = l.split(",");
            try { z[n] = Integer.parseInt(p[0]); la[n] = Float.parseFloat(p[1]); lo[n] = Float.parseFloat(p[2]); n++; } catch (Exception ignored) { }
        }
        zipCodes = java.util.Arrays.copyOf(z, n);
        zipLat = java.util.Arrays.copyOf(la, n);
        zipLon = java.util.Arrays.copyOf(lo, n);
    }

    /** Device details for the System panel. */
    String systemInfo() {
        org.json.JSONObject j = new org.json.JSONObject();
        try {
            String m = android.os.Build.MODEL;
            String[][] names = { {"AFTGAZL", "Fire TV Cube (3rd gen)"}, {"AFTR", "Fire TV Cube (2nd gen)"}, {"AFTKA", "Fire TV Stick 4K Max"},
                {"AFTKM", "Fire TV Stick 4K Max (2nd gen)"}, {"AFTMM", "Fire TV Stick 4K"}, {"AFTKRT", "Fire TV Stick 4K (2nd gen)"},
                {"AFTSSS", "Fire TV Stick (3rd gen)"}, {"AFTSS", "Fire TV Stick Lite"} };
            for (String[] n : names) if (n[0].equals(m)) m = n[1];
            j.put("model", m);
            String fos = sysprop("ro.build.version.name");
            j.put("os", (fos.isEmpty() ? "Android " + android.os.Build.VERSION.RELEASE : fos.replaceAll("\\s*\\(.*", "")));
            j.put("app", app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName);
            android.os.StatFs st = new android.os.StatFs(android.os.Environment.getDataDirectory().getPath());
            j.put("storageFree", st.getAvailableBytes());
            j.put("storageTotal", st.getTotalBytes());
            android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
            ((android.app.ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(mi);
            j.put("memFree", mi.availMem);
            j.put("memTotal", mi.totalMem);
            j.put("uptime", android.os.SystemClock.elapsedRealtime());
            j.put("lowMem", mi.lowMemory);
            android.os.Debug.MemoryInfo self = new android.os.Debug.MemoryInfo();
            android.os.Debug.getMemoryInfo(self);
            j.put("selfMem", self.getTotalPss() * 1024L);                  // this app, including its web page
            for (int z = 0; z < 4; z++) {                                     // the chip's temperature, where Fire OS lets apps read it
                java.io.File tf = new java.io.File("/sys/class/thermal/thermal_zone" + z + "/temp");
                if (!tf.canRead()) continue;
                try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader(tf))) {
                    long v = Long.parseLong(r.readLine().trim());
                    double c = v > 1000 ? v / 1000.0 : v;
                    if (c > 10 && c < 120) { j.put("tempC", Math.round(c)); break; }
                } catch (Exception ignored) { }
            }
            android.util.DisplayMetrics dm = app.getResources().getDisplayMetrics();
            String screen = dm.widthPixels + " × " + dm.heightPixels;
            android.view.Display d = ((android.view.WindowManager) app.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay();
            android.view.Display.Mode mode = d.getMode();
            if (mode.getPhysicalWidth() > dm.widthPixels) screen += " (TV " + mode.getPhysicalWidth() + " × " + mode.getPhysicalHeight() + ")";
            j.put("screen", screen);
            j.put("sound", soundInfo());
            if (cm != null) {
                for (android.net.Network n : cm.getAllNetworks()) {
                    android.net.LinkProperties lp = cm.getLinkProperties(n);
                    if (lp == null) continue;
                    for (android.net.LinkAddress la : lp.getLinkAddresses()) {
                        java.net.InetAddress a = la.getAddress();
                        if (a instanceof java.net.Inet4Address && !a.isLoopbackAddress()) { j.put("ip", a.getHostAddress()); break; }
                    }
                    if (j.has("ip")) break;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "system info", e);
        }
        return j.toString();
    }

    /**
     * Where sound goes and what it sends, e.g. "HDMI · Stereo", "HDMI ARC · Dolby Digital Plus" or "Bluetooth · AirPods".
     * From Android's audio outputs: Bluetooth wins if connected (Android plays there), else USB, else HDMI (TV, soundbar
     * or receiver). For HDMI, Fire TV's own sound settings decide (see below).
     */
    /**
     * Where music is going and at what rate, for the Now playing card ("HDMI ARC · Soundbar · 48 kHz",
     * "Bluetooth · AirPods"). Music apps don't tell Android their stream quality, so this is the TV's real output.
     */
    private String musicOutput() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
            String bt = bluetoothAudio();
            if (!bt.isEmpty()) return "Bluetooth · " + bt;
            String where = soundInfo().split(" · Dolby| · Surround| · Stereo")[0];
            String rate = am.getProperty(android.media.AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE);
            int hz = rate == null ? 0 : Integer.parseInt(rate.trim());
            return where + (hz > 0 ? " · " + (hz % 1000 == 0 ? hz / 1000 + "" : String.format(java.util.Locale.US, "%.1f", hz / 1000.0)) + " kHz" : "");
        } catch (Exception e) { return ""; }
    }

    private String soundInfo() {
        android.media.AudioManager am = (android.media.AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        android.media.AudioDeviceInfo bt = null, usb = null, hdmi = null;
        for (android.media.AudioDeviceInfo d : am.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS)) {
            switch (d.getType()) {
                case android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP: bt = d; break;
                case android.media.AudioDeviceInfo.TYPE_USB_DEVICE:
                case android.media.AudioDeviceInfo.TYPE_USB_HEADSET: usb = d; break;
                case android.media.AudioDeviceInfo.TYPE_HDMI:
                case android.media.AudioDeviceInfo.TYPE_HDMI_ARC: if (hdmi == null || d.getType() == android.media.AudioDeviceInfo.TYPE_HDMI_ARC) hdmi = d; break;
                default: break;
            }
        }
        android.media.AudioDeviceInfo d = bt != null ? bt : usb != null ? usb : hdmi;
        if (d == null) return "TV speakers";
        StringBuilder s = new StringBuilder(d == bt ? "Bluetooth" : d == usb ? "USB audio" : d.getType() == android.media.AudioDeviceInfo.TYPE_HDMI_ARC ? "HDMI ARC" : "HDMI");
        String name = d.getProductName() == null ? "" : d.getProductName().toString().trim();
        if (!name.isEmpty() && !name.equalsIgnoreCase(android.os.Build.MODEL)) s.append(" · ").append(name);
        if (d == hdmi) {
            // Fire OS lists the same formats and channel layouts (up to 7.1) for HDMI whatever is plugged in, so those
            // alone said "7.1" on every TV. What Fire TV really sends follows its own sound settings: surround off
            // means stereo; on, the formats the box can send, with Atmos only when Fire TV has it switched on.
            android.content.ContentResolver cr = app.getContentResolver();
            boolean surround = Settings.Global.getInt(cr, "external_surround_sound_enabled", 0) == 1
                    || Settings.Global.getInt(cr, "encoded_surround_output", 0) == 2;               // Always
            if (!surround) s.append(" · Stereo");
            else {
                java.util.Set<Integer> enc = new java.util.HashSet<>();
                for (int e : d.getEncodings()) enc.add(e);
                String caps = Settings.Global.getString(cr, "audio_platform_capabilities");
                boolean atmos = false;
                try { atmos = caps != null && new org.json.JSONObject(caps).getJSONObject("audiocaps").getJSONObject("atmos").optBoolean("enabled"); } catch (Exception ignored) { }
                if (atmos && enc.contains(18)) s.append(" · Dolby Atmos");                // ENCODING_E_AC3_JOC
                else if (enc.contains(android.media.AudioFormat.ENCODING_E_AC3)) s.append(" · Dolby Digital Plus");
                else if (enc.contains(android.media.AudioFormat.ENCODING_AC3)) s.append(" · Dolby Digital");
                else s.append(" · Surround");
            }
        }
        return s.toString();
    }

    private static String sysprop(String key) {
        try {
            Class<?> c = Class.forName("android.os.SystemProperties");
            return (String) c.getMethod("get", String.class).invoke(null, key);
        } catch (Exception e) {
            return "";
        }
    }

    /** An app now covers the home screen: the page may re-order its tiles without anyone seeing it move. */
    void hidden() {
        visible = false;
        main.removeCallbacks(freeze); main.removeCallbacks(alertsTick);
        main.postDelayed(freeze, 8000);           // after the page's own tidy-up (tile order, a reload) has run
        if (reloadIfConfigChanged()) return;
        if (pageReady) web.evaluateJavascript("window.guestHidden && guestHidden()", null);
    }

    // ---- Out of the way while an app is on screen (owner: Plex and the like must not feel Offshore) --------------
    // WebView.onPause() alone leaves the page's JavaScript timers running. Once an app has been up a few seconds they
    // are frozen (pauseTimers: the page stays loaded, so Home is still instant). Every 5 minutes they thaw for 25 s so
    // the weather alert check runs and a warning can still come up over the app; shown() thaws them for good.
    // Everything here is posted to the main thread, never through the WebView: a view that is not in a window (behind an
    // app, after the overlay, after a restart) holds its posts back until it is attached again. That once kept urgent
    // weather warnings from appearing over a movie (found with alert_test.json).
    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean frozenTimers;
    private final Runnable freeze = new Runnable() {
        @Override
        public void run() {
            if (visible || gone) return;
            if (!pageReady) { main.postDelayed(this, 5000); return; }   // let a reload finish first
            web.pauseTimers(); frozenTimers = true;
            Log.i(TAG, "an app is on screen: page timers frozen");
            main.postDelayed(alertsTick, 5 * 60000L);
        }
    };
    private final Runnable alertsTick = new Runnable() {
        @Override
        public void run() {
            if (visible || gone) return;
            web.resumeTimers(); frozenTimers = false;
            web.evaluateJavascript("window.guestAlertsTick && guestAlertsTick()", null);
            main.postDelayed(freeze, 25000);
        }
    };

    private void thaw() {
        main.removeCallbacks(freeze); main.removeCallbacks(alertsTick);
        if (frozenTimers) { web.resumeTimers(); frozenTimers = false; Log.i(TAG, "home screen back: page timers running"); }
    }

    void toast(String msg) {
        if (!pageReady) { pendingToast = msg; return; }
        web.evaluateJavascript("guestToast(" + org.json.JSONObject.quote(msg) + ")", null);
    }

    // ---- Called from the page ------------------------------------------------

    private static final java.util.concurrent.ExecutorService BG_SAVER = java.util.concurrent.Executors.newSingleThreadExecutor(LOW);
    private static final java.util.concurrent.ExecutorService PLEX_IO = java.util.concurrent.Executors.newSingleThreadExecutor(LOW);
    private void plexSend(String kind, String data) { pageJs("window.guestPlex && guestPlex(" + org.json.JSONObject.quote(kind) + "," + data + ")"); }
    private static final java.util.concurrent.ExecutorService NAS_IO = java.util.concurrent.Executors.newSingleThreadExecutor(LOW);
    // Files' network folder: listing and opening never wait behind a long copy on NAS_IO.
    private static final java.util.concurrent.ExecutorService NAS_LIST = java.util.concurrent.Executors.newSingleThreadExecutor(LOW);

    // ---- Radio (the page's Radio panel) ---------------------------------------------------------------------------
    // One station at a time in Android's own player (MP3, AAC and HLS streams). It takes audio focus like any music
    // app, so starting music or a video elsewhere stops it, and it stops when another app asks for focus. https only:
    // the app doesn't allow plain-http traffic, and the page upgrades http station links to https first.
    // Tells the page guestRadio(event): "playing", "buffering", "error" or "stopped".
    private android.media.MediaPlayer radio;
    private android.media.AudioFocusRequest radioFocus;
    private volatile String radioUrl = "";                // the station playing or starting, "" = none (for a reloaded page)

    void radioStart(final String url) {
        radioStop(false);
        try {
            final android.media.MediaPlayer mp = new android.media.MediaPlayer();
            radio = mp;
            radioUrl = url;
            mp.setAudioAttributes(new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build());
            java.util.Map<String, String> h = new java.util.HashMap<String, String>();
            h.put("User-Agent", "Offshore (TV home screen)");
            mp.setDataSource(app, Uri.parse(url), h);
            mp.setOnPreparedListener(new android.media.MediaPlayer.OnPreparedListener() {
                @Override public void onPrepared(android.media.MediaPlayer m) {
                    if (m != radio) return;
                    android.media.AudioManager am = (android.media.AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
                    radioFocus = new android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build())
                        .setOnAudioFocusChangeListener(new android.media.AudioManager.OnAudioFocusChangeListener() {
                            @Override public void onAudioFocusChange(int f) {
                                if (f == android.media.AudioManager.AUDIOFOCUS_LOSS) radioStop(true);
                                else if (f == android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK && radio != null) radio.setVolume(0.3f, 0.3f);
                                else if (f == android.media.AudioManager.AUDIOFOCUS_GAIN && radio != null) radio.setVolume(1f, 1f);
                            }
                        }, main).build();
                    if (am.requestAudioFocus(radioFocus) == android.media.AudioManager.AUDIOFOCUS_REQUEST_FAILED) { radioStop(true); return; }
                    m.start();
                    js("window.guestRadio && guestRadio('playing')");
                }
            });
            mp.setOnInfoListener(new android.media.MediaPlayer.OnInfoListener() {
                @Override public boolean onInfo(android.media.MediaPlayer m, int what, int extra) {
                    if (m != radio) return false;
                    if (what == android.media.MediaPlayer.MEDIA_INFO_BUFFERING_START) js("window.guestRadio && guestRadio('buffering')");
                    else if (what == android.media.MediaPlayer.MEDIA_INFO_BUFFERING_END) js("window.guestRadio && guestRadio('playing')");
                    return false;
                }
            });
            mp.setOnErrorListener(new android.media.MediaPlayer.OnErrorListener() {
                @Override public boolean onError(android.media.MediaPlayer m, int what, int extra) {
                    if (m == radio) { radioStop(false); js("window.guestRadio && guestRadio('error')"); }
                    return true;
                }
            });
            mp.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() {   // a live stream ended (the station went off the air)
                @Override public void onCompletion(android.media.MediaPlayer m) { if (m == radio) radioStop(true); }
            });
            mp.prepareAsync();
            js("window.guestRadio && guestRadio('buffering')");
        } catch (Exception e) {
            radioStop(false);
            js("window.guestRadio && guestRadio('error')");
        }
    }

    void radioStop(boolean tell) {
        android.media.MediaPlayer mp = radio;
        radio = null;
        radioUrl = "";
        if (mp != null) { try { mp.reset(); } catch (Exception ignored) { } try { mp.release(); } catch (Exception ignored) { } }
        if (radioFocus != null) {
            ((android.media.AudioManager) app.getSystemService(Context.AUDIO_SERVICE)).abandonAudioFocusRequest(radioFocus);
            radioFocus = null;
        }
        if (tell && mp != null) js("window.guestRadio && guestRadio('stopped')");
    }

    /** Runs JavaScript in the page (from any thread). */
    private void js(final String code) {
        main.post(new Runnable() {
            @Override
            public void run() { web.evaluateJavascript(code, null); }
        });
    }

    private interface NasJob { String run(Nas nas) throws Exception; }

    /** A network folder job off the main thread; answers guestNas(id, ok, text) with a plain-words error if it fails. */
    private void nasRun(final String id, final NasJob job) {
        NAS_IO.execute(new Runnable() {
            @Override
            public void run() {
                boolean ok = false;
                String text;
                Nas nas = Nas.load(ctx);
                try {
                    if (nas == null) throw new java.io.IOException("No network folder set up");
                    text = job.run(nas);
                    ok = true;
                } catch (Throwable e) {
                    Log.w(TAG, "network folder: " + e);
                    String m = String.valueOf(e.getMessage()), all = e + " " + m;
                    text = all.contains("LOGON_FAILURE") || all.contains("ACCESS_DENIED") || all.contains("NFS3ERR_ACCES") || all.contains("NFS3ERR_PERM") ? "The NAS said no: check the user, password or share permissions"
                         : all.contains("BAD_NETWORK_NAME") || all.contains("NFS3ERR_NOENT") || all.contains("OBJECT_NAME_NOT_FOUND") || all.contains("OBJECT_PATH_NOT_FOUND") ? "Share or folder not found"
                         : e instanceof java.net.UnknownHostException ? "NAS address not found"
                         : e instanceof java.net.ConnectException || e instanceof java.net.SocketTimeoutException || all.contains("Timeout") ? "Couldn't reach the NAS (is it on, and is SMB/NFS turned on?)"
                         : m.length() > 0 && m.length() < 90 && !"null".equals(m) ? m : "Couldn't open the network folder";
                }
                js("window.guestNas && guestNas(" + org.json.JSONObject.quote(id) + "," + ok + "," + org.json.JSONObject.quote(text) + ")");
            }
        });
    }

    /**
     * Any photo -> a 1920x1080 JPEG background: decoded at the smallest size that still covers the screen, cropped to
     * fill it, with the same readability shading as the built-in photos (tools/make_backgrounds.ps1), quality 82.
     */
    static byte[] backdrop(byte[] data) throws java.io.IOException {
        android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        android.graphics.BitmapFactory.decodeByteArray(data, 0, data.length, o);
        o.inJustDecodeBounds = false;
        o.inSampleSize = 1;
        while (o.outWidth / (o.inSampleSize * 2) >= 1920 && o.outHeight / (o.inSampleSize * 2) >= 1080) o.inSampleSize *= 2;
        Bitmap src = android.graphics.BitmapFactory.decodeByteArray(data, 0, data.length, o);
        if (src == null) throw new java.io.IOException("not an image");
        Bitmap bmp = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(bmp);
        float s = Math.max(1920f / src.getWidth(), 1080f / src.getHeight());
        float w = src.getWidth() * s, h = src.getHeight() * s;
        g.drawBitmap(src, null, new android.graphics.RectF((1920 - w) / 2, (1080 - h) / 2, (1920 + w) / 2, (1080 + h) / 2),
                new android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG));
        src.recycle();
        shade(g, 0, 1081, 0, -1, new float[]{0, .22f, .45f, .62f, 1}, new float[]{.66f, .38f, .10f, 0, 0});   // bottom
        shade(g, -1, 0, 1921, 0, new float[]{0, .40f, .70f, 1}, new float[]{.42f, .20f, 0, 0});              // left
        shade(g, 1921, 0, -1, 0, new float[]{0, .28f, 1}, new float[]{.30f, 0, 0});                           // right
        shade(g, 0, -1, 0, 1081, new float[]{0, .20f, 1}, new float[]{.22f, 0, 0});                           // top
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 82, out);
        bmp.recycle();
        return out.toByteArray();
    }

    /** A black gradient (stops / alphas) over the whole 1920x1080 canvas, as in tools/make_backgrounds.ps1. */
    private static void shade(Canvas g, int x1, int y1, int x2, int y2, float[] stops, float[] alphas) {
        int[] colors = new int[alphas.length];
        for (int i = 0; i < alphas.length; i++) colors[i] = android.graphics.Color.argb(Math.round(255 * alphas[i]), 0, 0, 0);
        android.graphics.Paint p = new android.graphics.Paint();
        p.setShader(new android.graphics.LinearGradient(x1, y1, x2, y2, colors, stops, android.graphics.Shader.TileMode.CLAMP));
        g.drawRect(0, 0, 1920, 1080, p);
    }

    class Bridge {
        /** Radio: plays one station's stream (https, a public internet address only). "" stops it. */
        @JavascriptInterface
        public boolean radioPlay(final String url) {
            final Uri u = Uri.parse(url == null ? "" : url);
            final String h = u.getHost() == null ? "" : u.getHost().toLowerCase(java.util.Locale.US);
            boolean ok = RadioRelay.mine(url) || "https".equals(u.getScheme()) && h.contains(".") && u.getUserInfo() == null && !h.equals("localhost") && !h.endsWith(".local")
                && !h.matches("(127|10|0)\\..*|192\\.168\\..*|169\\.254\\..*|172\\.(1[6-9]|2\\d|3[01])\\..*|\\[.*\\]");   // not this TV or the home network
            main.post(new Runnable() {
                @Override public void run() { if (ok) radioStart(url); else radioStop(true); }
            });
            return ok;
        }

        /** An unencrypted (http://) station, passed on through RadioRelay: returns the local address to play, or "" if
         *  it isn't allowed. "" stops the relay. */
        @JavascriptInterface
        public String radioRelay(String url) {
            if (url == null || url.isEmpty()) { RadioRelay.stop(); return ""; }
            return RadioRelay.relay(url);
        }

        /** The station address playing (or starting) now, "" if none: a page that reloaded picks up where it was. */
        @JavascriptInterface
        public String radioNow() { return radioUrl; }

        @JavascriptInterface
        public void launch(final String id) {
            main.post(new Runnable() {
                @Override
                public void run() { handle(id); }
            });
        }

        /** This TV's tv.json, or "" (the page then uses the defaults). */
        @JavascriptInterface
        public String config() {
            String s = MainActivity.readConfig(app);
            return s == null ? "" : s;
        }

        /** An installed app's version name ("" if not installed); this app's own with our package name. */
        @JavascriptInterface
        public String pkgVersion(String pkg) {
            try { String v = app.getPackageManager().getPackageInfo(pkg, 0).versionName; return v == null ? "" : v; }
            catch (Exception e) { return ""; }
        }

        /** Apps installed from the Appstore that get a tile automatically (see autoApps), as a JSON list. */
        @JavascriptInterface
        public String autoApps() { return new org.json.JSONArray(Home.autoApps(app)).toString(); }

        /** Tiles for apps that aren't installed are left out. */
        @JavascriptInterface
        public boolean installed(String pkg) {
            try { app.getPackageManager().getApplicationInfo(pkg, 0); return true; }
            catch (PackageManager.NameNotFoundException e) { return false; }
        }

        /** Current tile order (package names), saved next to tv.json so tools\audit.ps1 knows which tile is which. */
        @JavascriptInterface
        public void order(String csv) {
            java.io.File f = MainActivity.configFile(app);
            if (f == null) return;
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(f.getParentFile(), "order.txt"))) {
                out.write(csv.getBytes("UTF-8"));
            } catch (Exception e) {
                Log.w(TAG, "order.txt", e);
            }
        }

        /** Pause notifications until this time (ms since 1970), "-1" = until turned back on, "0" = off. */
        @JavascriptInterface
        public void setNotifyPause(String until) {
            long u = 0;
            try { u = (long) Double.parseDouble(until); } catch (Exception ignored) { }
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("notify_paused_until", u).apply();
            Log.i(TAG, "notifications " + (u == 0 ? "on" : "paused until " + (u == -1 ? "turned back on" : new java.util.Date(u))));
        }

        /**
         * Team list for the Favorite teams picker. ESPN's teams endpoint doesn't allow pages to read it directly (no
         * CORS header), so the app fetches it and calls guestTeams(league, [{id, abbr, name, logo}]). Leagues are an allowlist.
         */
        @JavascriptInterface
        public void fetchTeams(final String league) {
            final String path;
            switch (league) {
                case "nfl": path = "football/nfl/teams"; break;
                case "cfb": path = "football/college-football/teams?groups=80&limit=200"; break;
                case "nba": path = "basketball/nba/teams"; break;
                case "cbb": path = "basketball/mens-college-basketball/teams?groups=50&limit=400"; break;
                case "mlb": path = "baseball/mlb/teams"; break;
                case "nhl": path = "hockey/nhl/teams"; break;
                case "mls": path = "soccer/usa.1/teams"; break;
                case "epl": path = "soccer/eng.1/teams"; break;
                default: return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    org.json.JSONArray out = new org.json.JSONArray();
                    try {
                        java.net.HttpURLConnection c = (java.net.HttpURLConnection)
                            new java.net.URL("https://site.api.espn.com/apis/site/v2/sports/" + path).openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(20000);
                        java.io.InputStream in = c.getInputStream();
                        ByteArrayOutputStream b = new ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
                        in.close();
                        org.json.JSONArray teams = new org.json.JSONObject(b.toString("UTF-8")).getJSONArray("sports")
                            .getJSONObject(0).getJSONArray("leagues").getJSONObject(0).getJSONArray("teams");
                        for (int i = 0; i < teams.length(); i++) {
                            org.json.JSONObject t = teams.getJSONObject(i).getJSONObject("team");
                            org.json.JSONArray logos = t.optJSONArray("logos");
                            out.put(new org.json.JSONObject().put("id", t.optString("id")).put("abbr", t.optString("abbreviation"))
                                .put("name", t.optString("displayName"))
                                .put("logo", logos != null && logos.length() > 0 ? logos.getJSONObject(0).optString("href") : ""));
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "teams for " + league + " failed", e);
                    }
                    final String js = "window.guestTeams && guestTeams(" + org.json.JSONObject.quote(league) + "," + out + ")";
                    main.post(new Runnable() {
                        @Override
                        public void run() { web.evaluateJavascript(js, null); }
                    });
                }
            }).start();
        }

        /** ZIP code -> "lat,lon" from the US Census ZIP table (assets/zips.txt), or "" if unknown. */
        @JavascriptInterface
        public String zipLookup(String zip) {
            loadZips();
            int z;
            try { z = Integer.parseInt(zip.trim()); } catch (Exception e) { return ""; }
            int i = java.util.Arrays.binarySearch(zipCodes, z);
            return i >= 0 ? zipLat[i] + "," + zipLon[i] : "";
        }

        /** Nearest ZIP code to a point (for UV, which EPA publishes by ZIP). */
        @JavascriptInterface
        public String zipNearest(double lat, double lon) {
            loadZips();
            int best = -1;
            double bd = Double.MAX_VALUE, k = Math.cos(Math.toRadians(lat));
            for (int i = 0; i < zipCodes.length; i++) {
                double dy = zipLat[i] - lat, dx = (zipLon[i] - lon) * k, d = dx * dx + dy * dy;
                if (d < bd) { bd = d; best = i; }
            }
            return best < 0 ? "" : String.format(java.util.Locale.US, "%05d", zipCodes[best]);
        }

        /**
         * Text from sources pages can't read directly (no CORS header): NOAA's buoy center, EPA's UV index, the NHL's
         * official API and ESPN team schedules. Answers with guestFetched(id, ok, text). Only these hosts are allowed.
         */
        @JavascriptInterface
        public void fetchUrl(final String id, final String url) {
            final String host = Uri.parse(url).getHost();
            java.util.List<String> allowed = java.util.Arrays.asList("www.ndbc.noaa.gov", "data.epa.gov", "api-web.nhle.com", "site.api.espn.com",
                    "itunes.apple.com",                     // album covers (Apple's catalogue search)
                    "mirrors.kodi.tv",                      // Kodi's official release server (stable versions)
                    "api.github.com",                       // Offshore's own releases ("latest" = stable only)
                    "api.exchange.coinbase.com",            // screensaver crypto prices (Coinbase market data)
                    "api.nasdaq.com",                       // screensaver stock and fund quotes (Nasdaq)
                    "feeds.npr.org", "feeds.bbci.co.uk", "www.pbs.org",                        // national and world news
                    "news.google.com",                                                          // local news for this TV's location
                    "www.whitehouse.gov", "www.war.gov", "www.fbi.gov", "www.justice.gov",      // official government news
                    "www.cisa.gov", "krebsonsecurity.com", "www.bleepingcomputer.com", "feeds.feedburner.com",
                    "therecord.media", "www.securityweek.com",                                  // cybersecurity
                    "feeds.arstechnica.com", "www.theverge.com", "www.wired.com",               // technology
                    "www.nasa.gov",                                                              // space and science
                    "transition.fcc.gov");                  // Live TV's Local group: the FCC's list of TV stations near this TV
            if (!"https".equals(Uri.parse(url).getScheme()) || !allowed.contains(host)) { answer(id, null); return; }
            NET.execute(new Runnable() {
                @Override
                public void run() {
                    String s = httpGet(url, "application/json, application/rss+xml, text/xml, */*", 3 << 20);
                    answer(id, url.endsWith("/known_exploited_vulnerabilities.json") ? slimKev(s) : slimFeed(s));
                }
            });
        }

        /** Hands a download to the page (guestFetched); null = failed. */
        private void answer(String id, String text) {
            final String js = "window.guestFetched && guestFetched(" + org.json.JSONObject.quote(id) + "," + (text != null) + "," + org.json.JSONObject.quote(text == null ? "" : text) + ")";
            main.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
        }

        /**
         * Background photo from Wikimedia Commons (Customize > Backgrounds): downloaded once, cropped to 1920x1080 with the
         * same readability shading as the built-in photos (see backdrop()), saved as JPEG in the app's files
         * (bg/<dir>/<name>.jpg), or on the network folder (Offshore/<dir>/<name>.jpg, answered as "nas:<path>") when
         * Network folder > Keep downloads there is on. One at a time. Answers guestBgSaved(id, ok, url).
         */
        /** Where background photos may come from: Wikimedia Commons, NASA, The Met, the Art Institute of Chicago, the Library of Congress. */
        final java.util.List<String> BG_PHOTO_HOSTS = java.util.Arrays.asList("upload.wikimedia.org", "thumb.wikimedia.org",
                "images-assets.nasa.gov", "images.metmuseum.org", "www.artic.edu", "tile.loc.gov");
        /** Where live background videos may come from: Wikimedia Commons (WebM, MP4, Ogg) and NASA (MP4). */
        boolean bgVideoUrl(Uri u) {
            String p = u.getPath() == null ? "" : u.getPath();
            if (!"https".equals(u.getScheme())) return false;
            if ("upload.wikimedia.org".equals(u.getHost())) return p.matches(".*\\.(webm|mp4|ogv)");
            return "images-assets.nasa.gov".equals(u.getHost()) && p.matches("/video/.*\\.mp4");
        }

        @JavascriptInterface
        public void saveBg(final String id, final String url, final String dir, final String name) {
            final Uri u = Uri.parse(url);
            if (!"https".equals(u.getScheme()) || !BG_PHOTO_HOSTS.contains(u.getHost()) || !dir.matches("[a-z0-9_-]{1,40}") || !name.matches("[a-z0-9_-]{1,40}")) return;
            BG_SAVER.execute(new Runnable() {
                @Override
                public void run() {
                    String out = "";
                    try {
                        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(30000);
                        c.setRequestProperty("User-Agent", "Offshore/2.19 (personal TV launcher)");   // Wikimedia asks for one
                        java.io.InputStream in = c.getInputStream();
                        ByteArrayOutputStream b = new ByteArrayOutputStream();
                        byte[] buf = new byte[16384];
                        for (int n; (n = in.read(buf)) > 0 && b.size() < 12 << 20; ) b.write(buf, 0, n);
                        in.close();
                        byte[] jpg = backdrop(b.toByteArray());
                        Nas nas = Nas.load(ctx);
                        if (nas != null && nas.store) {
                            String rel = "Offshore/" + dir + "/" + name + ".jpg";
                            nas.write(rel, jpg);
                            out = "nas:" + rel;
                        } else {
                            java.io.File folder = new java.io.File(ctx.getFilesDir(), "bg/" + dir);
                            folder.mkdirs();
                            java.io.File f = new java.io.File(folder, name + ".jpg");
                            java.io.FileOutputStream fo = new java.io.FileOutputStream(f);
                            fo.write(jpg);
                            fo.close();
                            out = Uri.fromFile(f).toString();
                        }
                    } catch (Throwable e) {
                        Log.w(TAG, "background photo failed: " + e);
                    }
                    js("window.guestBgSaved && guestBgSaved(" + org.json.JSONObject.quote(id) + "," + !out.isEmpty() + "," + org.json.JSONObject.quote(out) + ")");
                }
            });
        }

        /**
         * Live backgrounds with "Keep videos on the TV": one video copy (WebM or MP4 on upload.wikimedia.org, or
         * NASA's MP4 on images-assets.nasa.gov; see bgVideoUrl) streamed to files/bg/<dir>/<name>.<ext>, at most 120 MB, only with 600 MB free.
         * One at a time on the background saver. Answers guestVidSaved(id, ok, url).
         */
        @JavascriptInterface
        public void saveVideo(final String id, final String url, final String dir, final String name) {
            final Uri u = Uri.parse(url);
            final String path = u.getPath() == null ? "" : u.getPath();
            if (!bgVideoUrl(u) || path.endsWith(".ogv") || !dir.matches("[a-z0-9_-]{1,40}") || !name.matches("[a-z0-9_-]{1,40}")) return;
            BG_SAVER.execute(new Runnable() {
                @Override
                public void run() {
                    String out = "";
                    java.io.File f = null;
                    try {
                        java.io.File folder = new java.io.File(ctx.getFilesDir(), "bg/" + dir);
                        folder.mkdirs();
                        if (folder.getUsableSpace() < (600L << 20)) throw new java.io.IOException("not enough free space");
                        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(30000);
                        c.setRequestProperty("User-Agent", "Offshore (TV home screen)");   // Wikimedia asks for one
                        if (c.getResponseCode() != 200 || !u.getHost().equals(c.getURL().getHost())) throw new java.io.IOException("HTTP " + c.getResponseCode());
                        f = new java.io.File(folder, name + path.substring(path.lastIndexOf('.')));
                        try (java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream fo = new java.io.FileOutputStream(f)) {
                            byte[] buf = new byte[65536];
                            long total = 0;
                            for (int n; (n = in.read(buf)) > 0; ) {
                                total += n;
                                if (total > (120L << 20)) throw new java.io.IOException("video too large");
                                fo.write(buf, 0, n);
                            }
                        } finally { c.disconnect(); }
                        out = Uri.fromFile(f).toString();
                    } catch (Throwable e) {
                        Log.w(TAG, "live background video failed: " + e);
                        if (f != null) f.delete();
                    }
                    js("window.guestVidSaved && guestVidSaved(" + org.json.JSONObject.quote(id) + "," + !out.isEmpty() + "," + org.json.JSONObject.quote(out) + ")");
                }
            });
        }

        /**
         * Live background in the TV's own player (see nativeVideoPlay): a Wikimedia Commons file, or a video in this
         * app's own folders (kept clips, videos sent from phones). "" stops it.
         */
        @JavascriptInterface
        public void nativeVideo(final String url) {
            final Uri u = Uri.parse(url == null ? "" : url);
            boolean remote = bgVideoUrl(u);
            boolean local = false;
            if ("file".equals(u.getScheme()) && u.getPath() != null) {
                try {
                    String p = new java.io.File(u.getPath()).getCanonicalPath();
                    local = p.startsWith(app.getFilesDir().getCanonicalPath() + "/") || p.startsWith(app.getCacheDir().getCanonicalPath() + "/");
                } catch (java.io.IOException ignored) { }
            }
            final boolean ok = remote || local;
            main.post(new Runnable() {
                @Override public void run() { if (ok) nativeVideoPlay(url); else nativeVideoStop(); }
            });
        }

        /** Whether the TV is sending a 4K picture (the HDMI mode, not the 1920x1080 the apps are drawn at). */
        @JavascriptInterface
        public boolean tvIs4k() {
            try {
                android.view.Display d = ((android.view.WindowManager) app.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay();
                if (android.os.Build.VERSION.SDK_INT >= 23) {
                    for (android.view.Display.Mode m : d.getSupportedModes())
                        if (m.getModeId() == d.getMode().getModeId()) return Math.max(m.getPhysicalWidth(), m.getPhysicalHeight()) >= 3840;
                }
            } catch (Exception e) { Log.w(TAG, "display mode: " + e); }
            return false;
        }

        /** Deletes one downloaded background category (bg/<dir> on the TV, and Offshore/<dir> on the network folder). */
        @JavascriptInterface
        public void deleteBg(final String dir) {
            if (!dir.matches("[a-z0-9_-]{1,40}")) return;
            java.io.File[] files = new java.io.File(ctx.getFilesDir(), "bg/" + dir).listFiles();
            if (files != null) for (java.io.File f : files) f.delete();
            new java.io.File(ctx.getFilesDir(), "bg/" + dir).delete();
            final Nas nas = Nas.load(ctx);
            if (nas != null) NAS_IO.execute(new Runnable() {
                @Override
                public void run() {
                    try { nas.deleteFolder("Offshore/" + dir); } catch (Throwable e) { Log.w(TAG, "network folder delete failed: " + e); }
                }
            });
        }

        // ---- Dock: music, and Customize > Security ---------------------------------------------------------------

        /** Asks for the current music state (answered with guestMusic). */
        @JavascriptInterface
        public void musicState() { main.post(new Runnable() { @Override public void run() { watchMusic(); } }); }

        /** play, pause, next, previous, back15, fwd15, volup, voldown, custom:<the app's own action id> */
        @JavascriptInterface
        public void musicCmd(final String cmd) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    android.media.session.MediaController c = music;
                    if (c == null) return;
                    android.media.session.MediaController.TransportControls t = c.getTransportControls();
                    android.media.session.PlaybackState s = c.getPlaybackState();
                    if ("play".equals(cmd)) t.play(); else if ("pause".equals(cmd)) t.pause();
                    else if ("next".equals(cmd)) t.skipToNext(); else if ("previous".equals(cmd)) t.skipToPrevious();
                    else if (("back15".equals(cmd) || "fwd15".equals(cmd)) && s != null) {
                        long pos = s.getPosition();
                        if (s.getState() == android.media.session.PlaybackState.STATE_PLAYING) {
                            pos += (long) ((android.os.SystemClock.elapsedRealtime() - s.getLastPositionUpdateTime()) * s.getPlaybackSpeed());
                        }
                        long dur = c.getMetadata() == null ? 0 : c.getMetadata().getLong(android.media.MediaMetadata.METADATA_KEY_DURATION);
                        long to = Math.max(0, pos + ("fwd15".equals(cmd) ? 15000 : -15000));
                        if (dur > 0) to = Math.min(to, dur - 1000);
                        t.seekTo(to);
                    }
                    else if ("volup".equals(cmd) || "voldown".equals(cmd)) {
                        c.adjustVolume("volup".equals(cmd) ? android.media.AudioManager.ADJUST_RAISE : android.media.AudioManager.ADJUST_LOWER,
                                android.media.AudioManager.FLAG_SHOW_UI);
                        sendMusic();
                    }
                    else if (cmd.startsWith("custom:") && s != null) {        // only actions the app itself offered
                        for (android.media.session.PlaybackState.CustomAction a : s.getCustomActions()) {
                            if (a.getAction().equals(cmd.substring(7))) { t.sendCustomAction(a.getAction(), null); break; }
                        }
                    }
                }
            });
        }

        // ---- Plex (Plex.java): link with a plex.tv/link code, then Continue watching on Keep watching. The token never
        // reaches the page. Link, unlink and open need a real OK press. Answers come back as guestPlex(kind, data).
        @JavascriptInterface
        public boolean plexLinked() { return Plex.linked(app); }

        @JavascriptInterface
        public void plexLink() {
            if (!justPressedOk()) return;
            PLEX_IO.execute(new Runnable() { @Override public void run() { plexSend("code", Plex.startLink(app)); } });
        }

        @JavascriptInterface
        public void plexCheck() {
            PLEX_IO.execute(new Runnable() { @Override public void run() { plexSend("link", org.json.JSONObject.quote(Plex.checkLink(app))); } });
        }

        @JavascriptInterface
        public boolean plexUnlink() {
            if (!justPressedOk()) return false;
            Plex.unlink(app);
            return true;
        }

        @JavascriptInterface
        public void plexRefresh() {
            if (!Plex.linked(app)) return;
            PLEX_IO.execute(new Runnable() {
                @Override public void run() {
                    String r = Plex.continueWatching(app);
                    plexSend("deck", r.equals("error") ? "null" : r);
                }
            });
        }

        @JavascriptInterface
        public boolean plexOpen(final String server, final String key) {
            if (!justPressedOk() || server == null || key == null) return false;
            final Intent i = Plex.openIntent(app, server, key);
            main.post(new Runnable() {
                @Override public void run() {
                    if (i == null) { handle("com.plexapp.android"); return; }
                    if (bridging) { toast("Opening Plex…"); sendCmd(app, "bridge_launch"); }
                    start(i, "Plex");
                }
            });
            return true;
        }

        /** Settings › Home screen › Keep watching › Fox One show names. Turning it on needs a real OK press. */
        @JavascriptInterface
        public boolean screenTitles(boolean on) {
            if (on == screenTitlesOn(app)) return true;
            if (on && !justPressedOk()) return false;
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("screen_titles", on).apply();
            if (!on) {                                                    // off forgets the show names it read
                screenTitles.clear(); screenTitleAt.clear(); showChannel.clear();
                app.getSharedPreferences("channels", Context.MODE_PRIVATE).edit().clear().apply();
            }
            return true;
        }

        /** Keep watching › OK on a show from another app (Home.openShow). */
        @JavascriptInterface
        public boolean showOpen(final String pkg, final String mid) {
            if (!justPressedOk() || pkg == null) return false;
            main.post(new Runnable() { @Override public void run() { openShow(pkg, mid); } });
            return true;
        }

        /** True for a video app (Keep watching notes opening one that doesn't say what it plays). */
        @JavascriptInterface
        public boolean videoApp(String pkg) { return isVideoApp(pkg); }

        /** Music apps installed on this TV (known list), for the Music card when nothing is playing: [{pkg, name}]. */
        @JavascriptInterface
        public String musicApps() {
            org.json.JSONArray a = new org.json.JSONArray();
            for (String p : musicAppsInstalled()) {
                try { a.put(new org.json.JSONObject().put("pkg", p).put("name", label(p))); } catch (Exception ignored) { }
            }
            return a.toString();
        }

        /** Opens one of those music apps (only these; tiles stay limited to tv.json). */
        @JavascriptInterface
        public void openMusicApp(final String pkg) {
            if (!musicAppsInstalled().contains(pkg)) return;
            main.post(new Runnable() {
                @Override
                public void run() {
                    Intent i = app.getPackageManager().getLeanbackLaunchIntentForPackage(pkg);
                    if (i == null) i = app.getPackageManager().getLaunchIntentForPackage(pkg);
                    if (i != null) start(i, pkg); else toast("Couldn't open that app");
                }
            });
        }

        // ---- Bluetooth, Wi-Fi, sleep, removing apps (Devices.java; owner: "use Fire TV's screens as little as possible") ----

        @JavascriptInterface
        public boolean locPermission() { return app.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED; }

        /** Android's own one-time prompt (scanning for Bluetooth devices and Wi-Fi networks needs it). Answers guestPerm(ok). */
        @JavascriptInterface
        public void askLocPermission() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    MainActivity a = MainActivity.current;
                    if (a != null) a.requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION}, 7);
                    else pageJs("window.guestPerm && guestPerm(false)");
                }
            });
        }

        @JavascriptInterface public String btState() { return devices().btState(); }
        @JavascriptInterface public void btScan() { devices().btScan(); }
        @JavascriptInterface public void btPair(String addr) { devices().btPair(addr); }
        @JavascriptInterface public boolean btConnect(String addr) { return devices().btConnect(addr); }
        @JavascriptInterface public boolean btForget(String addr) { return devices().btForget(addr); }
        @JavascriptInterface public String wifiState() { return devices().wifiState(); }
        @JavascriptInterface public void wifiScan() { devices().wifiScan(); }
        @JavascriptInterface public void devicesIdle() { if (devicesImpl != null) devicesImpl.stop(); }

        /** Join a Wi-Fi network: "ok", "short" (password under 8 characters) or "failed". */
        @JavascriptInterface
        public String wifiJoin(String ssid, String password) { return devices().wifiJoin(ssid, password); }

        /** Sleep timer / Sleep now: the screen off through the Home-button service (Android 9's lock-screen action). */
        @JavascriptInterface
        public boolean sleepNow() {
            GuestService s = GuestService.running;
            boolean ok = s != null && s.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN);
            Log.i(TAG, "sleep now: " + ok);
            return ok;
        }

        /** Sleep timer: in N minutes (0 cancels). Runs in the app, so it works while another app is on screen. */
        @JavascriptInterface
        public void sleepIn(final int minutes) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    main.removeCallbacks(sleeper);
                    sleepAt = minutes > 0 ? System.currentTimeMillis() + minutes * 60000L : 0;
                    if (minutes > 0) main.postDelayed(sleeper, minutes * 60000L);
                    Log.i(TAG, minutes > 0 ? "sleep timer: " + minutes + " min" : "sleep timer off");
                }
            });
        }

        /** Milliseconds until the sleep timer ends, or 0. */
        @JavascriptInterface
        public long sleepLeft() { return sleepAt > 0 ? Math.max(0, sleepAt - System.currentTimeMillis()) : 0; }

        /** Remove an app the user installed: Android shows its own confirmation. Fire OS's apps and this one can't be removed. */
        @JavascriptInterface
        public boolean uninstall(final String pkg) {
            try {
                android.content.pm.ApplicationInfo ai = app.getPackageManager().getApplicationInfo(pkg, 0);
                if ((ai.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0 || pkg.equals(app.getPackageName())) return false;
            } catch (Exception e) { return false; }
            main.post(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg));
                    start(i, "remove " + pkg);
                }
            });
            return true;
        }

        /** {on, canChange}: Developer access (ADB). Changing it needs WRITE_SECURE_SETTINGS, granted by the user once. */
        @JavascriptInterface
        public String adbGet() {
            boolean on = Settings.Global.getInt(app.getContentResolver(), Settings.Global.ADB_ENABLED, 0) == 1;
            boolean can = app.checkSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED;
            return "{\"on\":" + on + ",\"canChange\":" + can + "}";
        }

        @JavascriptInterface
        public boolean adbSet(boolean on) {
            if (on && !justPressedOk()) { Log.w(TAG, "developer access: turning on needs OK on the remote"); return false; }
            try {
                Settings.Global.putInt(app.getContentResolver(), Settings.Global.ADB_ENABLED, on ? 1 : 0);
                Log.i(TAG, "developer access (adb) " + (on ? "on" : "off") + " from Customize");
                return true;
            } catch (SecurityException e) {
                return false;
            }
        }

        // ---- Tidy up Fire TV (Settings > Fire TV > Tidy up Fire TV) -----------------------------------------------
        // Fire OS lets no app switch other apps off, so the TV only keeps the user's choice (tidy.json, in this app's
        // folder, read by tools\setup_tv.ps1 through ConfigDrop) and setup_tv.ps1 applies it with pm disable-user / enable,
        // touching only packages in assets/debloat.json. It records what it switched off in tidy_done.json.

        /** {groups, items: the catalog's extras installed on this TV, each with on (enabled now), choice, done}. */
        @JavascriptInterface
        public String tidyStatus() {
            org.json.JSONObject out = new org.json.JSONObject();
            try {
                org.json.JSONObject cat = new org.json.JSONObject(asset("debloat.json"));
                PackageManager pm = app.getPackageManager();
                org.json.JSONArray all = cat.getJSONArray("items"), items = new org.json.JSONArray();
                for (int i = 0; i < all.length(); i++) {
                    org.json.JSONObject it = all.getJSONObject(i);
                    String pkg = it.getString("pkg");
                    try {
                        android.content.pm.ApplicationInfo ai = pm.getApplicationInfo(pkg, PackageManager.GET_DISABLED_COMPONENTS);
                        int st = pm.getApplicationEnabledSetting(pkg);
                        boolean on = st == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT ? ai.enabled : st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
                        items.put(new org.json.JSONObject(it.toString()).put("on", on));
                    } catch (PackageManager.NameNotFoundException notHere) { /* not on this model: not shown */ }
                }
                out.put("groups", cat.getJSONArray("groups")).put("items", items);
                out.put("choice", readOwnJson("tidy.json")).put("done", readOwnJson("tidy_done.json"));
            } catch (Exception e) { Log.w(TAG, "tidy status: " + e); }
            return out.toString();
        }

        /** Keep the user's choice {off: [...], on: [...]} for setup_tv.ps1; only catalog packages are kept. */
        @JavascriptInterface
        public boolean tidySave(String json) {
            try {
                org.json.JSONObject in = new org.json.JSONObject(json), cat = new org.json.JSONObject(asset("debloat.json"));
                java.util.Set<String> known = new java.util.HashSet<>();
                org.json.JSONArray all = cat.getJSONArray("items");
                for (int i = 0; i < all.length(); i++) known.add(all.getJSONObject(i).getString("pkg"));
                org.json.JSONObject keep = new org.json.JSONObject().put("v", 1).put("at", System.currentTimeMillis());
                for (String k : new String[] {"off", "on"}) {
                    org.json.JSONArray a = in.optJSONArray(k), b = new org.json.JSONArray();
                    if (a != null) for (int i = 0; i < a.length(); i++) if (known.contains(a.optString(i))) b.put(a.optString(i));
                    keep.put(k, b);
                }
                java.io.File dir = app.getExternalFilesDir(null);
                if (dir == null) return false;
                try (java.io.FileOutputStream o = new java.io.FileOutputStream(new java.io.File(dir, "tidy.json"))) { o.write(keep.toString().getBytes("UTF-8")); }
                return true;
            } catch (Exception e) { Log.w(TAG, "tidy save: " + e); return false; }
        }

        /** {on, canChange}: Amazon's own screensaver (the one with ads). Changing it needs WRITE_SECURE_SETTINGS (setup_tv.ps1). */
        @JavascriptInterface
        public String amazonSaverGet() {
            boolean on = Settings.Secure.getInt(app.getContentResolver(), "screensaver_enabled", 1) == 1;
            boolean can = app.checkSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED;
            return "{\"on\":" + on + ",\"canChange\":" + can + "}";
        }

        @JavascriptInterface
        public boolean amazonSaverSet(boolean on) {
            try {
                Settings.Secure.putInt(app.getContentResolver(), "screensaver_enabled", on ? 1 : 0);
                Log.i(TAG, "Amazon screensaver " + (on ? "on" : "off") + " from Settings");
                return true;
            } catch (SecurityException e) { return false; }
        }

        private String asset(String name) throws java.io.IOException {
            try (java.io.InputStream in = app.getAssets().open(name)) {
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
                return b.toString("UTF-8");
            }
        }

        private Object readOwnJson(String name) {                // a small JSON file in this app's folder, or null
            try {
                java.io.File f = new java.io.File(app.getExternalFilesDir(null), name);
                if (!f.isFile() || f.length() > 65536) return org.json.JSONObject.NULL;
                try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
                    java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
                    return new org.json.JSONObject(b.toString("UTF-8"));
                }
            } catch (Exception e) { return org.json.JSONObject.NULL; }
        }

        // ---- Files (bottom bar): storage by kind and the TV's folders, USB drives and received files (Files.java) ----

        @JavascriptInterface public String filesStorage() { return Files.storage(app); }
        @JavascriptInterface public String filesList(String path) { return Files.list(app, path); }
        @JavascriptInterface public String filesOpen(String path) { return Files.open(app, path); }

        // Changing files only right after a real press of OK on the remote (a script can't press keys).
        @JavascriptInterface
        public String filesRename(String path, String name) { return justPressedOk() ? Files.rename(app, path, name) : ""; }

        @JavascriptInterface
        public int filesDelete(String path) {
            if (!justPressedOk()) return -1;
            int n = Files.delete(app, path);
            Log.i(TAG, "files: deleted " + n + " item(s)");
            return n;
        }

        /**
         * The network folder in Files, in the background (it's on the network): op "list" (answers guestFilesListed),
         * "fetch" (copy to the TV's cache to show or open; guestFilesProgress, then guestFilesFetched), "delete" and
         * "rename" (to `arg`; both answer guestFilesNasDone). Deleting and renaming need a real OK press.
         */
        @JavascriptInterface
        public void filesNas(final String op, final String path, final String arg) {
            if ((op.equals("delete") || op.equals("rename")) && !justPressedOk()) return;
            NAS_LIST.execute(new Runnable() {
                @Override
                public void run() {
                    if (op.equals("list")) { pageJs("window.guestFilesListed && guestFilesListed(" + Files.nasList(app, path) + ")"); return; }
                    if (op.equals("fetch")) {
                        org.json.JSONObject r = Files.nasFetch(app, path, new Files.Progress() {
                            @Override public void at(long done, long total) { pageJs("window.guestFilesProgress && guestFilesProgress(" + done + "," + total + ")"); }
                        });
                        pageJs("window.guestFilesFetched && guestFilesFetched(" + r + ")");
                        return;
                    }
                    org.json.JSONObject r = new org.json.JSONObject();
                    try {
                        Nas n = Nas.load(app);
                        String rel = Files.nasRel(path);
                        r.put("op", op);
                        if (n == null || rel == null || rel.isEmpty()) r.put("ok", false);
                        else if (!n.writable()) r.put("ok", false).put("error", "nfs");
                        else if (op.equals("delete")) { n.remove(rel); r.put("ok", true); }
                        else if (op.equals("rename") && Files.goodName(arg)) {
                            String to = (rel.contains("/") ? rel.substring(0, rel.lastIndexOf('/') + 1) : "") + arg.trim();
                            boolean ok = n.rename(rel, to);
                            r.put("ok", ok).put("name", arg.trim());
                            if (!ok) r.put("error", "exists");
                        } else r.put("ok", false);
                    } catch (Exception e) {
                        Log.w(TAG, "network folder " + op + " failed: " + e);
                        try { r.put("ok", false).put("error", "denied"); } catch (Exception ignored) { }
                    }
                    Log.i(TAG, "files: network " + op + " " + r);
                    pageJs("window.guestFilesNasDone && guestFilesNasDone(" + r + ")");
                }
            });
        }

        /** Copy or move in the background: guestFilesProgress(done, total) now and then, then guestFilesDone(result). */
        @JavascriptInterface
        public boolean filesCopy(final String src, final String dstDir, final boolean move) {
            if (!justPressedOk()) return false;
            NAS_IO.execute(new Runnable() {
                @Override
                public void run() {
                    org.json.JSONObject r = Files.copy(app, src, dstDir, move, new Files.Progress() {
                        @Override public void at(long done, long total) { pageJs("window.guestFilesProgress && guestFilesProgress(" + done + "," + total + ")"); }
                    });
                    try { r.put("move", move); } catch (Exception ignored) { }
                    Log.i(TAG, "files: " + (move ? "move" : "copy") + " " + r);
                    pageJs("window.guestFilesDone && guestFilesDone(" + r + ")");
                }
            });
            return true;
        }

        /** Android's own one-time prompt to read the TV's storage. Answers guestFilesPerm(ok). */
        @JavascriptInterface
        public void filesAsk() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    MainActivity a = MainActivity.current;
                    if (a != null) a.requestPermissions(new String[]{android.Manifest.permission.READ_EXTERNAL_STORAGE, android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 8);
                    else pageJs("window.guestFilesPerm && guestFilesPerm(false)");
                }
            });
        }

        /** Customize > Storage: free space on the TV and what this app keeps (bytes). */
        @JavascriptInterface
        public String storageInfo() {
            java.io.File files = app.getFilesDir();
            return "{\"free\":" + files.getUsableSpace() + ",\"total\":" + files.getTotalSpace()
                    + ",\"photos\":" + LocalSend.size(new java.io.File(files, "bg"))
                    + ",\"received\":" + (LocalSend.size(new java.io.File(files, "received")) + LocalSend.size(new java.io.File(app.getCacheDir(), "received-view"))) + "}";
        }

        @JavascriptInterface
        public boolean webhookGet() { return Alerts.webhookOn(app); }

        @JavascriptInterface
        public void webhookSet(boolean on) { if (!on || justPressedOk()) Alerts.setWebhook(app, on); }

        // ---- Receive from phones (see LocalSend.java) -------------------------------------------------------------

        /** {on, pin, alias} from Customize; starts or stops the receiver. */
        @JavascriptInterface
        public void shareConfig(String json) {
            try {
                org.json.JSONObject o = new org.json.JSONObject(json);
                share(app).configure(o.optBoolean("on"), o.optBoolean("pin"), o.optString("alias"));
            } catch (Exception e) {
                Log.w(TAG, "receive from phones: " + e);
            }
        }

        @JavascriptInterface
        public void shareAnswer(String id, boolean ok) { share(app).answer(id, ok); }

        /** The code phones type when Receive from phones is set to "code" ("" otherwise). */
        @JavascriptInterface
        public String sharePin() { return share(app).currentPin(); }

        /** The TV's Bluetooth name, from Customize > This TV > Room (see NameReceiver). */
        @JavascriptInterface
        public void setDeviceName(String name) { NameReceiver.apply(app, name); }

        @JavascriptInterface
        public void shareDelete() { LocalSend.deleteReceived(app); }

        // ---- Network folder (see Nas.java). Answers guestNas(id, ok, text): text is JSON or an error in plain words. ----

        @JavascriptInterface
        public String nasGet() { return Nas.describe(ctx); }

        @JavascriptInterface
        public void nasSet(String json) {
            try { Nas.save(ctx, new org.json.JSONObject(json)); } catch (Exception e) { Log.w(TAG, "network folder settings: " + e); }
        }

        @JavascriptInterface
        public void nasForget() { Nas.forget(ctx); }

        /** Photos in the network folder (jpg, jpeg, png, webp; up to 500), as a JSON list of names. Also the connection test. */
        @JavascriptInterface
        public void nasList(final String id) {
            nasRun(id, new NasJob() {
                @Override
                public String run(Nas nas) throws Exception {
                    org.json.JSONArray a = new org.json.JSONArray();
                    for (String n : nas.list("")) if (n.toLowerCase(java.util.Locale.US).matches(".+\\.(jpe?g|png|webp)") && a.length() < 500) a.put(n);
                    return a.toString();
                }
            });
        }

        /**
         * One photo from the network folder, ready to show: the user's photos are cropped and shaded like the others;
         * downloads kept there (Offshore/...) already are. Only the last few are kept on the TV (cache/nas), so the network
         * folder uses next to no storage here. Answers with the photo's file URL.
         */
        @JavascriptInterface
        public void nasPhoto(final String id, final String rel) {
            if (rel.contains("..")) return;
            nasRun(id, new NasJob() {
                @Override
                public String run(Nas nas) throws Exception {
                    byte[] data = nas.read(rel);
                    byte[] jpg = rel.startsWith("Offshore/") ? data : backdrop(data);
                    java.io.File dir = new java.io.File(ctx.getCacheDir(), "nas");
                    dir.mkdirs();
                    java.io.File f = new java.io.File(dir, Integer.toHexString(rel.hashCode()) + "-" + System.currentTimeMillis() + ".jpg");
                    java.io.FileOutputStream fo = new java.io.FileOutputStream(f);
                    fo.write(jpg);
                    fo.close();
                    java.io.File[] old = dir.listFiles();                    // keep the newest 3 (on screen, fading out, next)
                    if (old != null && old.length > 3) {
                        java.util.Arrays.sort(old, new java.util.Comparator<java.io.File>() {
                            @Override
                            public int compare(java.io.File a, java.io.File b) { return Long.compare(b.lastModified(), a.lastModified()); }
                        });
                        for (int i = 3; i < old.length; i++) old[i].delete();
                    }
                    return Uri.fromFile(f).toString();
                }
            });
        }

        /** UI sound (move, select, back); the page only calls this when Customize > UI sounds is on. */
        @JavascriptInterface
        public void sound(String name) {
            if ("custom".equals(soundSet) && custom.containsKey(name)) play(custom.get(name), true, 1500, 0.55f);
            else play(sounds.get(("custom".equals(soundSet) ? "soft" : soundSet) + "_" + name), false, 0, 0.55f);
        }

        /** Customize > Music & sound: soft / crisp / glass / wood / custom, and the notification sound (off / chime / glass / bell / custom). */
        @JavascriptInterface
        public void setSounds(String set, String notify) { soundSet = set == null ? "soft" : set; notifySound = notify == null ? "off" : notify; }

        /** The notification sound (the page decides when: not for quiet notices, not while paused). */
        @JavascriptInterface
        public void playNotify() {
            if ("off".equals(notifySound)) return;
            if ("custom".equals(notifySound) && custom.containsKey("notify")) play(custom.get("notify"), true, 4000, 0.7f);
            else play(sounds.get("notif_" + ("custom".equals(notifySound) ? "chime" : notifySound)), false, 0, 0.7f);
        }

        /** Plays a built-in sound once (previews while choosing): e.g. "glass_select", "notif_bell". */
        @JavascriptInterface
        public void previewBuiltin(String key) { play(sounds.get(key), false, 0, 0.6f); }

        /** Downloads and plays a sound from the internet (cache only) to hear it first. Answers guestSound(id, ok). */
        @JavascriptInterface
        public void previewSound(final String id, final String url) { soundJob(id, url, null); }

        /** Keeps a sound from the internet for a slot (move / select / back / notify). Answers guestSound(id, ok). */
        @JavascriptInterface
        public void saveSound(final String id, final String url, final String slot) { if (SLOTS.contains(slot)) soundJob(id, url, slot); }

        @JavascriptInterface
        public void removeSound(String slot) {
            if (!SLOTS.contains(slot)) return;
            Integer old = custom.remove(slot);
            if (old != null && soundPool != null) soundPool.unload(old);
            java.io.File[] fs = new java.io.File(app.getFilesDir(), "sounds").listFiles();
            if (fs != null) for (java.io.File f : fs) if (f.getName().startsWith(slot + ".")) f.delete();
        }

        /** Device details for the System panel (JSON). */
        @JavascriptInterface
        public String systemInfo() { return Home.this.systemInfo(); }

        /**
         * Task manager (Customize > Task manager): apps used in the last day, newest first, with when and for how long.
         * Needs usage access, which the user grants once (adb shell appops set <package> GET_USAGE_STATS allow);
         * without it "allowed" is false and the list is empty.
         */
        @JavascriptInterface
        public String taskApps() {
            org.json.JSONObject out = new org.json.JSONObject();
            try {
                android.app.AppOpsManager ops = (android.app.AppOpsManager) app.getSystemService(Context.APP_OPS_SERVICE);
                boolean allowed = ops.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), app.getPackageName())
                        == android.app.AppOpsManager.MODE_ALLOWED;
                out.put("allowed", allowed);
                org.json.JSONArray list = new org.json.JSONArray();
                if (allowed) {
                    android.app.usage.UsageStatsManager us = (android.app.usage.UsageStatsManager) app.getSystemService(Context.USAGE_STATS_SERVICE);
                    long now = System.currentTimeMillis();
                    java.util.Map<String, android.app.usage.UsageStats> m = us.queryAndAggregateUsageStats(now - 86400000L, now);
                    java.util.List<android.app.usage.UsageStats> stats = new java.util.ArrayList<>(m.values());
                    java.util.Collections.sort(stats, new java.util.Comparator<android.app.usage.UsageStats>() {
                        public int compare(android.app.usage.UsageStats a, android.app.usage.UsageStats b) { return Long.compare(b.getLastTimeUsed(), a.getLastTimeUsed()); }
                    });
                    PackageManager pm = app.getPackageManager();
                    for (android.app.usage.UsageStats s : stats) {
                        String pkg = s.getPackageName();
                        if (pkg.equals(app.getPackageName()) || s.getTotalTimeInForeground() < 1000) continue;
                        if (pm.getLeanbackLaunchIntentForPackage(pkg) == null && pm.getLaunchIntentForPackage(pkg) == null) continue;   // apps people open, not system parts
                        org.json.JSONObject a = new org.json.JSONObject();
                        a.put("pkg", pkg);
                        a.put("label", pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString());
                        a.put("last", s.getLastTimeUsed());
                        a.put("fg", s.getTotalTimeInForeground());
                        list.put(a);
                        if (list.length() >= 15) break;
                    }
                }
                out.put("apps", list);
            } catch (Exception e) { Log.w(TAG, "task list failed: " + e); }
            return out.toString();
        }

        /**
         * Air quality now: the EPA's AirNow reporting-area file (official measurements, no key; about 1.7 MB), nearest
         * area to this TV within 80 km, its primary pollutant's AQI. Kept for 30 minutes. The answer goes to
         * window.guestAir(json) ({} when there's no area near enough).
         */
        @JavascriptInterface
        public void airQuality(final double lat, final double lon) {
            NET.execute(new Runnable() {
                @Override
                public void run() {
                    String out = "{}";
                    try {
                        if (airText == null || System.currentTimeMillis() - airAt > 25 * 60000L) {   // a little under the page's 30 min
                            String t = httpGet("https://files.airnowtech.org/airnow/today/reportingarea.dat", null, 6 << 20);
                            if (t != null) {                             // keep only today's primary readings (~1.7 MB -> a few hundred KB)
                                StringBuilder keep = new StringBuilder();
                                for (String line : t.split("\n")) if (line.contains("|O|Y|")) keep.append(line).append('\n');
                                airText = keep.toString(); airAt = System.currentTimeMillis();
                            }
                        }
                        double best = 80, k = Math.cos(Math.toRadians(lat)); String[] pick = null;
                        if (airText != null) for (String line : airText.split("\n")) {
                            String[] f = line.split("\\|", -1);           // date|date|time|tz|offset|O/F/Y|primary|area|state|lat|lon|param|AQI|category|...|agency
                            if (f.length < 17 || !"O".equals(f[5]) || !"Y".equals(f[6]) || f[12].isEmpty()) continue;
                            try {                                        // one odd line mustn't lose the rest
                                double la = Double.parseDouble(f[9]), lo = Double.parseDouble(f[10]);
                                double km = Math.sqrt(Math.pow((la - lat) * 111.2, 2) + Math.pow((lo - lon) * 111.2 * k, 2));
                                if (km < best) { Integer.parseInt(f[12].trim()); best = km; pick = f; }
                            } catch (NumberFormatException ignored) { }
                        }
                        if (pick != null) out = new org.json.JSONObject().put("area", pick[7] + ", " + pick[8]).put("aqi", Integer.parseInt(pick[12].trim()))
                                .put("cat", pick[13]).put("param", pick[11]).put("time", pick[2] + " " + pick[3]).put("agency", pick[16]).put("km", Math.round(best)).toString();
                    } catch (Exception e) { Log.w(TAG, "air quality failed: " + e); }
                    final String js = "window.guestAir && guestAir(" + org.json.JSONObject.quote(out) + ")";
                    main.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
                }
            });
        }

        /** Settings backup (the page's saved settings as JSON) in the app's folder on the TV's storage. */
        @JavascriptInterface
        public void backupWrite(String json) {
            if (json == null || json.length() > 4 << 20) return;
            try {
                java.io.File dir = app.getExternalFilesDir(null), tmp = new java.io.File(dir, "backup.json.tmp");
                try (java.io.FileOutputStream o = new java.io.FileOutputStream(tmp)) { o.write(json.getBytes("UTF-8")); }
                if (!tmp.renameTo(new java.io.File(dir, "backup.json"))) Log.w(TAG, "backup rename failed");
            } catch (Exception e) { Log.w(TAG, "backup failed: " + e); }
        }

        @JavascriptInterface
        public String backupRead() {
            try {
                java.io.File f = new java.io.File(app.getExternalFilesDir(null), "backup.json");
                if (!f.exists() || f.length() > 4 << 20) return "";
                byte[] b = new byte[(int) f.length()];
                try (java.io.FileInputStream in = new java.io.FileInputStream(f)) { int off = 0; for (int n; off < b.length && (n = in.read(b, off, b.length - off)) > 0; ) off += n; }
                return new String(b, "UTF-8");
            } catch (Exception e) { return ""; }
        }

        // ---- Updates from Offshore's update site (Updater.java) ----

        /** The update site's host, or "" when this build has none. */
        @JavascriptInterface public String updateSite() { return Updater.feedHost(); }

        /** Reads the site's latest.json in the background; answers guestUpdateFeed(json). */
        @JavascriptInterface
        public void updateCheck() {
            Log.i(TAG, "update check: " + Updater.FEED);
            NET.execute(new Runnable() {
                @Override public void run() { pageJs("window.guestUpdateFeed && guestUpdateFeed(" + Updater.check() + ")"); }
            });
        }

        /** Download, verify, open Fire TV's installer: guestUpdateProgress(done, total), then guestUpdateDone(result). Needs OK. */
        @JavascriptInterface
        public boolean updateInstall(final String apk, final String sha256) {
            if (!justPressedOk()) return false;
            NAS_IO.execute(new Runnable() {
                @Override
                public void run() {
                    String r = Updater.install(app, apk, sha256, new Updater.Progress() {
                        @Override public void at(long done, long total) { pageJs("window.guestUpdateProgress && guestUpdateProgress(" + done + "," + total + ")"); }
                    });
                    pageJs("window.guestUpdateDone && guestUpdateDone(" + org.json.JSONObject.quote(r) + ")");
                }
            });
            return true;
        }

        /** The main TV's settings, put in the app's folder by tools\sync_tvs.ps1 (same shape as backup.json). */
        @JavascriptInterface
        public String syncRead() {
            try {
                java.io.File f = new java.io.File(app.getExternalFilesDir(null), "sync.json");
                if (!f.exists() || f.length() > 4 << 20) return "";
                byte[] b = new byte[(int) f.length()];
                try (java.io.FileInputStream in = new java.io.FileInputStream(f)) { int off = 0; for (int n; off < b.length && (n = in.read(b, off, b.length - off)) > 0; ) off += n; }
                return new String(b, "UTF-8");
            } catch (Exception e) { return ""; }
        }

        /** A calendar's iCal (ICS) link, from a known calendar service only (Calendars.allowed); answers guestFetched. */
        @JavascriptInterface
        public void fetchCalendar(final String id, String link) {
            final String url = link != null && link.startsWith("webcal://") ? "https://" + link.substring(9) : link;
            if (!Calendars.allowed(url)) { answer(id, null); return; }
            NET.execute(new Runnable() {
                @Override
                public void run() {
                    String t = httpGet(url, "text/calendar, */*", 4 << 20);
                    answer(id, t != null && t.contains("BEGIN:VCALENDAR") ? slimCalendar(t) : null);
                }
            });
        }

        /** Calendars repeat a lot the page never uses (alarms, descriptions, attendees): only events' basics cross over. */
        private String slimCalendar(String t) {
            StringBuilder sb = new StringBuilder(t.length() / 3);
            boolean alarm = false;
            for (String line : t.replace("\r\n ", "").replace("\r\n\t", "").replace("\n ", "").split("\r?\n")) {
                if (line.startsWith("BEGIN:VALARM")) { alarm = true; continue; }
                if (line.startsWith("END:VALARM")) { alarm = false; continue; }
                if (alarm) continue;
                if (line.startsWith("BEGIN:") || line.startsWith("END:") || line.startsWith("DTSTART") || line.startsWith("DTEND")
                        || line.startsWith("DURATION") || line.startsWith("SUMMARY") || line.startsWith("LOCATION") || line.startsWith("RRULE")
                        || line.startsWith("EXDATE") || line.startsWith("RECURRENCE-ID") || line.startsWith("UID") || line.startsWith("STATUS"))
                    sb.append(line).append('\n');
            }
            return sb.toString();
        }

        /** Customize > Calendar > Add from your phone: starts the one-page form (CalendarLink); returns {url, code}. */
        @JavascriptInterface
        public String calPhoneStart() {
            if (calLink != null) calLink.stop();
            final CalendarLink[] me = new CalendarLink[1];
            calLink = me[0] = new CalendarLink(new CalendarLink.Listener() {
                @Override public void added(String name, String url) {
                    final String js = "window.guestCalAdd && guestCalAdd(" + org.json.JSONObject.quote(name) + "," + org.json.JSONObject.quote(url) + ")";
                    main.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
                }
                @Override public void ended() {
                    if (calLink != me[0]) return;          // an older form closing late: not the one on screen
                    main.post(new Runnable() { @Override public void run() { web.evaluateJavascript("window.guestCalEnded && guestCalEnded()", null); } });
                }
            });
            String ip = "";
            try { ip = new org.json.JSONObject(Home.this.systemInfo()).optString("ip", ""); } catch (Exception ignored) { }
            try { return new org.json.JSONObject().put("url", ip.isEmpty() ? "" : "http://" + ip + ":" + CalendarLink.PORT).put("code", calLink.code()).toString(); }
            catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public void calPhoneStop() { if (calLink != null) { calLink.stop(); calLink = null; } }

        // ---- Live TV (LiveTv): the user's own playlists, played in VLC. The page never sees a link or stream address.
        private final LiveTv.Done liveDone = new LiveTv.Done() {
            @Override public void done(String id, String error, int count) {
                final String js = "window.guestLiveTv && guestLiveTv(" + org.json.JSONObject.quote(id) + "," + org.json.JSONObject.quote(error) + "," + count + ")";
                main.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
            }
        };

        private final LiveTv.Done guideDone = new LiveTv.Done() {
            @Override public void done(String id, String error, int count) {
                final String js = "window.guestLiveTvGuide && guestLiveTvGuide(" + org.json.JSONObject.quote(id) + "," + org.json.JSONObject.quote(error) + "," + count + ")";
                main.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
            }
        };

        @JavascriptInterface
        public String liveTvState() { return LiveTv.state(app); }

        /** What's on now and next for the channels on screen ("3,4,5" positions in that playlist). */
        @JavascriptInterface
        public String liveTvGuide(String id, String positions) { return LiveTv.guide(app, id, positions == null ? "" : positions); }

        @JavascriptInterface
        public void liveTvGuideRefresh(String id) { LiveTv.guideRefresh(app, id, guideDone); }

        /** Each channel's main programme category from the guide, for filing channels: {"position": "sports event"}. */
        @JavascriptInterface
        public String liveTvCategories(String id) { return LiveTv.guideCategories(app, id); }

        @JavascriptInterface
        public String liveTvChannels() { return LiveTv.channels(app); }

        @JavascriptInterface
        public void liveTvRefresh(String id) { LiveTv.refresh(app, id, liveDone, guideDone); }

        @JavascriptInterface
        public void liveTvRemove(String id) { LiveTv.remove(app, id); }

        /** "ok", "novlc" (VLC isn't installed) or "gone" (that channel isn't in the playlist any more). */
        @JavascriptInterface
        public String liveTvPlay(String id, int pos, String title) {
            String url = LiveTv.streamUrl(app, id, pos);
            if (url == null) return "gone";
            Intent v = new Intent(Intent.ACTION_VIEW);
            v.setDataAndType(Uri.parse(url), "video/*");
            v.setPackage(LiveTv.VLC);
            v.putExtra("title", title == null ? "" : title.length() > 80 ? title.substring(0, 80) : title);
            if (app.getPackageManager().resolveActivity(v, 0) == null) return "novlc";
            start(v, "VLC");
            return "ok";
        }

        /** Your cards (a web link card): opens the page in the TV's browser, only right after a real OK press, and only a
         *  public http(s) address. "ok", "nobrowser" or "" (not allowed). */
        @JavascriptInterface
        public String openLink(String url) {
            if (!justPressedOk() || url == null) return "";
            Uri u = Uri.parse(url);
            String h = u.getHost() == null ? "" : u.getHost().toLowerCase(java.util.Locale.US);
            if (!("https".equals(u.getScheme()) || "http".equals(u.getScheme())) || !h.contains(".") || u.getUserInfo() != null) return "";
            Intent v = new Intent(Intent.ACTION_VIEW, u);
            v.addCategory(Intent.CATEGORY_BROWSABLE);
            if (app.getPackageManager().resolveActivity(v, 0) == null) return "nobrowser";
            start(v, "browser");
            return "ok";
        }

        /** Settings > Live TV > Add from your phone: the phone form in playlist mode; returns {url, code}. */
        @JavascriptInterface
        public String liveTvPhoneStart() {
            if (calLink != null) { calLink.stop(); calLink = null; }      // one form at a time (they share the port)
            if (liveLink != null) liveLink.stop();
            final CalendarLink[] me = new CalendarLink[1];
            liveLink = me[0] = new CalendarLink(new CalendarLink.Listener() {
                @Override public void added(String name, String url) {
                    LiveTv.add(app, name, url, me[0].guide, liveDone, guideDone);
                    main.post(new Runnable() { @Override public void run() { web.evaluateJavascript("window.guestLiveTvAdded && guestLiveTvAdded()", null); } });
                }
                @Override public void ended() {
                    if (liveLink != me[0]) return;
                    main.post(new Runnable() { @Override public void run() { web.evaluateJavascript("window.guestLiveTvPhoneEnded && guestLiveTvPhoneEnded()", null); } });
                }
            }, true);
            String ip = "";
            try { ip = new org.json.JSONObject(Home.this.systemInfo()).optString("ip", ""); } catch (Exception ignored) { }
            try { return new org.json.JSONObject().put("url", ip.isEmpty() ? "" : "http://" + ip + ":" + CalendarLink.PORT).put("code", liveLink.code()).toString(); }
            catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public void liveTvPhoneStop() { if (liveLink != null) { liveLink.stop(); liveLink = null; } }

        /** Which of this app's optional permissions are on (Customize > Security & privacy > Permissions & setup). */
        @JavascriptInterface
        public String permStatus() {
            org.json.JSONObject j = new org.json.JSONObject();
            try {
                String me = app.getPackageName();
                android.app.AppOpsManager ops = (android.app.AppOpsManager) app.getSystemService(Context.APP_OPS_SERVICE);
                j.put("usage", ops.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), me) == android.app.AppOpsManager.MODE_ALLOWED);
                String listeners = Settings.Secure.getString(app.getContentResolver(), "enabled_notification_listeners");
                j.put("music", listeners != null && listeners.contains(me + "/"));
                j.put("secure", app.checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") == PackageManager.PERMISSION_GRANTED);
                j.put("home", GuestService.isOn(app));    // listed and accessibility on, as setup_tv.ps1 sets it
            } catch (Exception e) { Log.w(TAG, "permission status failed: " + e); }
            return j.toString();
        }

        /**
         * Task manager > Uninstall apps: every app the user installed (never Fire OS's own, never this one), with its
         * size and when it was last used (both need usage access; without it the size is the app's installer file and
         * "last" is 0). Least used first.
         */
        @JavascriptInterface
        public String removableApps() {
            org.json.JSONObject out = new org.json.JSONObject();
            try {
                android.app.AppOpsManager ops = (android.app.AppOpsManager) app.getSystemService(Context.APP_OPS_SERVICE);
                boolean allowed = ops.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), app.getPackageName())
                        == android.app.AppOpsManager.MODE_ALLOWED;
                java.util.Map<String, android.app.usage.UsageStats> used = new java.util.HashMap<>();
                android.app.usage.StorageStatsManager ss = null;
                if (allowed) {
                    long now = System.currentTimeMillis();
                    used = ((android.app.usage.UsageStatsManager) app.getSystemService(Context.USAGE_STATS_SERVICE)).queryAndAggregateUsageStats(now - 90 * 86400000L, now);
                    ss = (android.app.usage.StorageStatsManager) app.getSystemService(Context.STORAGE_STATS_SERVICE);
                }
                PackageManager pm = app.getPackageManager();
                java.util.List<org.json.JSONObject> list = new java.util.ArrayList<>();
                for (android.content.pm.PackageInfo p : pm.getInstalledPackages(0)) {
                    android.content.pm.ApplicationInfo ai = p.applicationInfo;
                    if (ai == null || (ai.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0 || p.packageName.equals(app.getPackageName())) continue;
                    long size = new java.io.File(ai.sourceDir).length();
                    if (ss != null) try {
                        android.app.usage.StorageStats st = ss.queryStatsForPackage(android.os.storage.StorageManager.UUID_DEFAULT, p.packageName, android.os.Process.myUserHandle());
                        size = st.getAppBytes() + st.getDataBytes() + st.getCacheBytes();
                    } catch (Exception ignored) { }
                    android.app.usage.UsageStats u = used.get(p.packageName);
                    list.add(new org.json.JSONObject().put("pkg", p.packageName).put("label", pm.getApplicationLabel(ai).toString())
                            .put("size", size).put("installed", p.firstInstallTime).put("last", u != null ? u.getLastTimeUsed() : 0));
                }
                java.util.Collections.sort(list, new java.util.Comparator<org.json.JSONObject>() {
                    public int compare(org.json.JSONObject a, org.json.JSONObject b) { return Long.compare(a.optLong("last"), b.optLong("last")); }
                });
                out.put("allowed", allowed).put("apps", new org.json.JSONArray(list));
            } catch (Exception e) { Log.w(TAG, "removable apps failed: " + e); }
            return out.toString();
        }

        /** Ends an app's background processes (what Android itself does when memory runs low). Never this app. */
        @JavascriptInterface
        public boolean closeApp(String pkg) {
            if (pkg == null || pkg.equals(app.getPackageName()) || !justPressedOk()) return false;
            try { ((android.app.ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE)).killBackgroundProcesses(pkg); return true; }
            catch (Exception e) { Log.w(TAG, "close " + pkg + " failed: " + e); return false; }
        }

        /** Fire TV's own page for an app (Force stop, Clear cache, Clear data, Uninstall). */
        @JavascriptInterface
        public boolean appInfo(String pkg) {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                app.startActivity(i);
                return true;
            } catch (Exception e) { Log.w(TAG, "app info " + pkg + " failed: " + e); return false; }
        }

        /** Urgent weather warning from the page: over the open app if the home screen isn't showing. */
        @JavascriptInterface
        public void urgent(final String title, final String message) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    Log.i(TAG, "urgent weather: " + title + (visible ? " (home screen showing)" : " (shown over the app)"));
                    if (!visible && GuestService.running != null) GuestService.running.showUrgent(title, message, "Weather");
                }
            });
        }

        /** Settings > Notifications > Emergency alert sound (tone / chime / bell / glass / off); sample plays it once. */
        @JavascriptInterface
        public void alertSound(String v, boolean sample) {
            if (v == null || !v.matches("tone|chime|bell|glass|off")) return;
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("alert_sound", v).apply();
            if (sample) main.post(new Runnable() { @Override public void run() { playAlert(); } });
        }

        /** Settings > Notifications > Pop-up position, so cards over apps (GuestService.showUrgent) sit in the same place. */
        @JavascriptInterface
        public void notifPos(String pos) {
            if (pos == null || !pos.matches("t[clr]|b[clr]")) return;
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("notif_pos", pos).apply();
        }

        /**
         * A practice weather warning, for checking that warnings reach the screen over a movie. Only from a computer:
         * adb pushes alert_test.json into this app's folder; the next alert check reads it once and deletes it.
         * {"event": "Tornado Warning"} -> the page shows "TEST: Tornado Warning", gone in 10 minutes.
         */
        @JavascriptInterface
        public String alertTest() {
            java.io.File dir = app.getExternalFilesDir(null), f = dir == null ? null : new java.io.File(dir, "alert_test.json");
            if (f == null || !f.isFile() || f.length() > 4096) return null;
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
                byte[] b = new byte[(int) f.length()];
                int n = in.read(b);
                String s = new String(b, 0, Math.max(0, n), "UTF-8");
                new org.json.JSONObject(s);
                Log.i(TAG, "practice weather warning read from alert_test.json");
                return s;
            } catch (Exception e) {
                return null;
            } finally {
                f.delete();
            }
        }

        /** App name, for apps the page has no description of. */
        @JavascriptInterface
        public String label(String pkg) {
            try {
                PackageManager pm = app.getPackageManager();
                return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
            } catch (Exception e) { return pkg; }
        }
    }

    void handle(String id) {
        Log.i(TAG, "open " + id + (bridging ? " (from overlay)" : ""));
        if ("settings".equals(id)) {
            // Open Fire TV settings directly. ACTION_SETTINGS can go through a stub that flashes the Amazon home
            // first, which the Home-button service would redirect (cancelling Settings).
            sendCmd(app, "opening_settings");
            if (bridging) { toast("Opening Settings…"); sendCmd(app, "bridge_launch"); }
            Intent s = new Intent("amazon.intent.action.MAINSETTINGS");
            s.setComponent(new ComponentName(MainActivity.AMAZON_HOME_PKG, "com.amazon.tv.launcher.ui.MainSettingsActivity"));
            try {
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                app.startActivity(s);
            } catch (Exception ex) {
                start(new Intent(Settings.ACTION_SETTINGS), "Settings");
            }
        } else if ("network".equals(id)) {
            // Fire TV's own Network settings (Wi-Fi, Ethernet). Back returns here.
            sendCmd(app, "opening_settings");
            start(new Intent("android.settings.WIFI_SETTINGS"), "Network settings");
        } else if ("fireupdates".equals(id)) {
            // Fire TV's own My Fire TV > About screen, with "Check for Updates" (Amazon updates Fire OS itself).
            sendCmd(app, "opening_settings");
            start(new Intent("com.amazon.device.settings.about.action.CHECK_FOR_UPDATES"), "Fire TV updates");
        } else if ("getvlc".equals(id)) {
            // Live TV plays in VLC: its page in the Amazon Appstore, where the user installs it.
            Intent g = new Intent(Intent.ACTION_VIEW, Uri.parse("amzn://apps/android?p=" + LiveTv.VLC));
            if (g.resolveActivity(app.getPackageManager()) != null) start(g, "VLC in the Appstore");
            else handle("appstore");
        } else if ("appstore".equals(id)) {
            // Apps from the Amazon Appstore are updated by the Appstore.
            Intent a = app.getPackageManager().getLeanbackLaunchIntentForPackage("com.amazon.venezia");
            if (a == null) a = app.getPackageManager().getLaunchIntentForPackage("com.amazon.venezia");
            if (a != null) start(a, "Appstore"); else toast("Couldn't open the Appstore");
        } else if ("bluetooth".equals(id)) {
            // Fire TV's "Controllers & Bluetooth Devices" (pair headphones, speakers, game controllers). Back returns here.
            sendCmd(app, "opening_settings");
            start(new Intent("android.settings.CONTROLLERS_SETTINGS"), "Bluetooth settings");
        } else if ("mirroring".equals(id)) {
            // Fire TV's own Miracast receiver ("Display Mirroring"): exported with no permission, so any app may open it.
            Intent m = new Intent().setComponent(new ComponentName("com.amazon.cast.sink", "com.amazon.cast.sink.DisplayMirroringSinkActivity"));
            try {
                m.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                app.startActivity(m);
            } catch (Exception ex) {
                Log.w(TAG, "cannot open mirroring", ex);
                toast("Hold the Home button, then choose Mirroring");
            }
        } else if ("firetv".equals(id)) {
            sendCmd(app, "allow_amazon_home");    // escape hatch: the Home-button service lets it stay
            openAmazonHome(app);
        } else if ("kill_kodi".equals(id) || "clear_cache".equals(id)) {
            sendCmd(app, id);                     // handled by GuestService (Kodi JSON-RPC quit / system cache trim)
        } else {
            String pkg = id;                      // app tiles are identified by package name
            if (!tileApps(app).contains(pkg)) return;   // only apps that have a tile
            PackageManager pm = app.getPackageManager();
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) { toast("That app isn't installed."); return; }
            if (bridging) {                       // Android holds the launch until its Home lock ends
                toast("Opening " + new Bridge().label(pkg) + "…");
                sendCmd(app, "bridge_launch");
            }
            start(i, id);
        }
    }

    private void start(Intent i, String what) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            app.startActivity(i);
        } catch (ActivityNotFoundException ex) {
            Log.w(TAG, "cannot open " + what, ex);
            toast("Couldn't open that. Try again.");
        }
    }

    static void openAmazonHome(Context c) {
        Intent i = new Intent(Intent.ACTION_MAIN);
        i.addCategory(Intent.CATEGORY_HOME);
        i.setComponent(new ComponentName(MainActivity.AMAZON_HOME_PKG, MainActivity.AMAZON_HOME_CLS));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        c.startActivity(i);
    }

    static void sendCmd(Context c, String what) {
        Intent i = new Intent(GuestService.ACTION_CMD);
        i.setPackage(c.getPackageName());
        i.putExtra("cmd", what);
        c.sendBroadcast(i, GuestService.PERM_CMD);
    }

    /**
     * If anything in this app crashes, open the Amazon home screen so the TV is never stuck, and tell the Home-button
     * service (same process, so it restarts with the app) to leave the Amazon home alone for 10 minutes.
     */
    private static void installCrashFallback(final Context app) {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                Log.e(TAG, "crash, falling back to Amazon home", e);
                try {
                    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                        .putLong(PREF_PAUSED_UNTIL, System.currentTimeMillis() + GuestService.PAUSE_MS).commit();
                    openAmazonHome(app);
                } catch (Throwable ignored) { }
                if (previous != null) previous.uncaughtException(t, e);
            }
        });
    }

    // ---- Real app banners for the tiles ----------------------------------------

    private void sendBanners() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                final StringBuilder json = new StringBuilder("{");
                PackageManager pm = app.getPackageManager();
                for (String pkg : tileApps(app)) {
                    String data = bannerFor(pm, pkg);
                    if (data == null) continue;
                    if (json.length() > 1) json.append(',');
                    json.append(org.json.JSONObject.quote(pkg)).append(":\"").append(data).append('"');
                }
                json.append('}');
                main.post(new Runnable() {
                    @Override
                    public void run() { web.evaluateJavascript("setBanners(" + json + ")", null); }
                });
            }
        }).start();
    }

    private static String bannerFor(PackageManager pm, String pkg) {
        try {
            Drawable d = null;
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i != null) d = pm.getActivityBanner(i);
            if (d == null) d = pm.getApplicationBanner(pkg);
            if (d == null) return iconTile(pm, pkg);
            int w = d.getIntrinsicWidth(), h = d.getIntrinsicHeight();
            if (w <= 0 || h <= 0) { w = 320; h = 180; }
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, w, h);
            d.draw(c);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            b.recycle();
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            Log.w(TAG, "no banner for " + pkg + ": " + (e instanceof android.content.pm.PackageManager.NameNotFoundException ? "not installed" : e.toString()));
            return null;
        }
    }

    /**
     * A tile for an app without a TV banner, made to sit with the others: its icon centred on a soft gradient of the
     * icon's own colour, its name underneath, 16:9 like every tile.
     */
    private static String iconTile(PackageManager pm, String pkg) {
        try {
            Drawable icon = pm.getApplicationIcon(pkg);
            String name = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
            int w = 512, h = 288, s = 132;
            Bitmap ib = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
            Canvas ic = new Canvas(ib);
            icon.setBounds(0, 0, s, s);
            icon.draw(ic);
            long r = 0, g = 0, bl = 0, n = 0;                     // the icon's average colour (opaque pixels)
            for (int y = 0; y < s; y += 4) for (int x = 0; x < s; x += 4) {
                int p = ib.getPixel(x, y);
                if ((p >>> 24) < 200) continue;
                r += (p >> 16) & 255; g += (p >> 8) & 255; bl += p & 255; n++;
            }
            int cr = n > 0 ? (int) (r / n) : 60, cg = n > 0 ? (int) (g / n) : 70, cb = n > 0 ? (int) (bl / n) : 90;
            int top = android.graphics.Color.rgb(cr * 7 / 10, cg * 7 / 10, cb * 7 / 10), bottom = android.graphics.Color.rgb(cr * 3 / 10, cg * 3 / 10, cb * 3 / 10);
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            android.graphics.Paint bg = new android.graphics.Paint();
            bg.setShader(new android.graphics.LinearGradient(0, 0, w, h, top, bottom, android.graphics.Shader.TileMode.CLAMP));
            c.drawRect(0, 0, w, h, bg);
            c.drawBitmap(ib, (w - s) / 2f, 46, new android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG));
            ib.recycle();
            android.graphics.Paint t = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
            t.setColor(0xF2FFFFFF);
            t.setTextSize(34);
            t.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
            t.setTextAlign(android.graphics.Paint.Align.CENTER);
            if (name.length() > 22) name = name.substring(0, 21) + "…";
            c.drawText(name, w / 2f, 236, t);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            b.recycle();
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- Tiles: tv.json's apps, plus every app installed from the Appstore (2.23) ----------------------------------

    /**
     * Apps installed from now on (not part of Fire OS) that have a TV launcher entry, except this app and tv.json "hide".
     * Apps that were already there keep the user's chosen lineup (tv.json "apps"): only installs since the first run of
     * this version, less 12 hours (so that day's installs count), get a tile by themselves.
     */
    static java.util.List<String> autoApps(Context c) {
        android.content.SharedPreferences tp = c.getSharedPreferences("tiles", Context.MODE_PRIVATE);
        long since = tp.getLong("since", 0);
        if (since == 0) { since = System.currentTimeMillis() - 12 * 3600000L; tp.edit().putLong("since", since).apply(); }
        if (MainActivity.readConfig(c) == null) since = 0;   // no tv.json (a normal install): every installed app gets a tile
        java.util.List<String> out = new java.util.ArrayList<>();
        java.util.List<String> hide = new java.util.ArrayList<>();
        try {
            String cfg = MainActivity.readConfig(c);
            org.json.JSONArray h = cfg == null ? null : new org.json.JSONObject(cfg).optJSONArray("hide");
            for (int i = 0; h != null && i < h.length(); i++) hide.add(h.getString(i));
        } catch (Exception ignored) { }
        PackageManager pm = c.getPackageManager();
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        for (android.content.pm.ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
            android.content.pm.ApplicationInfo ai = ri.activityInfo.applicationInfo;
            boolean system = (ai.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0;
            if (system || ai.packageName.equals(c.getPackageName()) || hide.contains(ai.packageName) || out.contains(ai.packageName)) continue;
            try { if (pm.getPackageInfo(ai.packageName, 0).firstInstallTime < since) continue; } catch (Exception e) { continue; }
            out.add(ai.packageName);
        }
        return out;
    }

    /** Every app that has a tile (and may be opened from one). */
    static java.util.List<String> tileApps(Context c) {
        java.util.List<String> all = new java.util.ArrayList<>(MainActivity.configApps(c));
        for (String p : autoApps(c)) if (!all.contains(p)) all.add(p);
        return all;
    }

    // ---- Quiet update notices (Customize > Notifications > App and system updates) --------------------------------

    /** An app was updated: a quiet notice, for apps on the home screen or that the user installed (not Fire OS's own). */
    private void appUpdated(String pkg) {
        try {
            android.content.pm.PackageInfo pi = app.getPackageManager().getPackageInfo(pkg, 0);
            boolean system = (pi.applicationInfo.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0;
            if (system && !tileApps(app).contains(pkg)) return;
            updateNotice(String.valueOf(app.getPackageManager().getApplicationLabel(pi.applicationInfo)) + " updated",
                    pi.versionName == null ? "" : "Version " + pi.versionName);
        } catch (Exception ignored) { }
    }

    /** At start: did Fire OS, its security patch, or this app change since last time? (Nothing on the very first run.) */
    private void systemUpdated() {
        android.content.SharedPreferences p = app.getSharedPreferences("versions", Context.MODE_PRIVATE);
        String os = sysprop("ro.build.version.name").replaceAll("\\s*\\(.*", "");
        if (os.isEmpty()) os = "Android " + android.os.Build.VERSION.RELEASE;
        String build = android.os.Build.VERSION.INCREMENTAL, patch = android.os.Build.VERSION.SECURITY_PATCH, self = "";
        try { self = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName; } catch (Exception ignored) { }
        if (p.contains("build")) {
            if (!build.equals(p.getString("build", ""))) updateNotice(os + " installed", "Fire TV system update");
            if (!patch.equals(p.getString("patch", ""))) updateNotice("Security patch " + patch, "Installed by Fire TV");
        }
        p.edit().putString("build", build).putString("patch", patch).putString("self", self).apply();
        refreshTile(p, self);
    }

    /** After an update, take the app's tile out of the Amazon menus for a moment and put it back, so they pick up the
     *  current name and banner (they keep their own copy otherwise; a PC can't do this, Fire OS only lets the app). */
    private void refreshTile(final android.content.SharedPreferences p, final String self) {
        final android.content.pm.PackageManager pm = app.getPackageManager();
        final android.content.ComponentName entry = new android.content.ComponentName(app, app.getPackageName() + ".Entry");
        try {                                       // never leave the tile hidden (say the app stopped mid-refresh last time)
            if (pm.getComponentEnabledSetting(entry) == android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED)
                pm.setComponentEnabledSetting(entry, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DEFAULT, android.content.pm.PackageManager.DONT_KILL_APP);
        } catch (Exception e) { Log.w(TAG, "tile check failed: " + e); }
        if (self.equals(p.getString("tile", ""))) return;
        try {
            pm.setComponentEnabledSetting(entry, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    android.content.pm.PackageManager.DONT_KILL_APP);
        } catch (Exception e) { Log.w(TAG, "tile refresh failed: " + e); return; }
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() { public void run() {
            try {
                pm.setComponentEnabledSetting(entry, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
                        android.content.pm.PackageManager.DONT_KILL_APP);
                p.edit().putString("tile", self).apply();   // only once it's back
            } catch (Exception e) { Log.w(TAG, "tile restore failed: " + e); }
        } }, 800);                                       // short: opening the app in this moment would fail
    }

    private void updateNotice(String title, String message) {
        try {
            org.json.JSONObject n = new org.json.JSONObject().put("title", title).put("message", message).put("level", "info").put("source", "Updates");
            pageJs("window.guestUpdated && guestUpdated(" + n + ")");
        } catch (Exception ignored) { }
    }

    /** New or removed apps: rebuild the tiles (the page reloads only while it isn't being looked at). */
    private android.content.BroadcastReceiver appsRcv;

    private void watchApps() {
        android.content.IntentFilter f = new android.content.IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addDataScheme("package");
        app.registerReceiver(appsRcv = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent i) {
                if (i.getBooleanExtra(Intent.EXTRA_REPLACING, false)) {      // an update, same app
                    if (Intent.ACTION_PACKAGE_ADDED.equals(i.getAction()) && i.getData() != null) appUpdated(i.getData().getSchemeSpecificPart());
                    return;
                }
                Log.i(TAG, "apps changed (" + i.getAction() + "), refreshing tiles");
                pageJs("window.guestAppsChanged && guestAppsChanged()");
            }
        }, f);
    }
}
