package app.offshore;

import android.accessibilityservice.AccessibilityService;
import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.io.File;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;

/**
 * Reversible Home button for the guest launcher (the Amazon launcher stays installed and enabled).
 *
 * - The Amazon home screen appearing (Home, or Back out of Settings) opens Offshore instead.
 * - The "Fire TV Home" pill allows the Amazon home until another app opens, the TV sleeps, or 20 minutes pass.
 * - If Offshore crashes or fails to appear twice, redirection pauses for 10 minutes so the TV
 *   falls back to the Amazon home screen.
 * - Close Kodi asks Kodi to quit through its own JSON-RPC interface, then deletes Kodi's cache files.
 *   (Fire OS Settings ignores accessibility clicks, so Force stop / Clear cache can't be pressed for us.)
 *
 * - Right after Home, the live home screen (Home's WebView) is shown in an overlay, so the remote works at once while
 *   Android's ~5 s app-switch lock keeps MainActivity from starting. MainActivity takes the page back when it starts.
 *
 * Runs in the app's own process so it can share the one WebView. Being an accessibility service keeps that process
 * alive, so the home screen never reloads. If the app crashes, the crash handler pauses redirection (stored, so it
 * survives the restart) and opens the Amazon home.
 */
public class GuestService extends AccessibilityService {
    static final String TAG = "Offshore-guard";
    static final boolean DEBUG = false;
    static final String ACTION_CMD = "app.offshore.CMD";
    static final String PERM_CMD = "app.offshore.permission.CMD";

    static final String OUR_PKG = "app.offshore";
    static final String AMAZON_PKG = MainActivity.AMAZON_HOME_PKG;
    static final String AMAZON_HOME_PREFIX = "com.amazon.tv.launcher.ui.HomeActivity";
    static final String KODI = "org.xbmc.kodi";
    static final int KODI_JSONRPC_PORT = 9090;      // "Allow remote control from applications on this system"

    static final long PAUSE_MS = 10 * 60 * 1000L;

    private final Handler h = new Handler(Looper.getMainLooper());
    // Fire TV Home escape hatch. Only the Amazon home's ARRIVAL is allowed (a few seconds after the button):
    // apps like Plex and Netflix send no window events, so "until another app opens" can't be detected, and a
    // later appearance of the Amazon home means Home was pressed from an app.
    private boolean escapeActive;
    private long escapeArrivalUntil;
    private long pausedUntil;
    private long lastRedirect;
    private long ourWindowSeen;
    private long ignoreHomeUntil;
    private final List<Long> failures = new ArrayList<>();
    private volatile boolean busy;                   // Close Kodi running
    private TextView overlay;
    private boolean launchedFromBridge;              // a guest picked something in the overlay during the lock

    /** The connected service (same process as MainActivity), or null. */
    static GuestService running;

    /**
     * Keeps the Home button switched on once the TV's owner has set it up. Fire OS has no screen for accessibility
     * services, so tools\setup_tv.ps1 turns this one on from a computer and also grants WRITE_SECURE_SETTINGS. If the
     * service later drops out of the TV's list (a Fire OS update, a reset, another app rewriting the list), Home would
     * quietly go back to Amazon's screen; with that permission the app can put its own entry back. Only this app's
     * entry is added, others are left as they are. setup_tv.ps1 -Undo revokes the permission first, so this never
     * overrides the owner turning it off. Called at start, after boot and updates (Startup) and every minute (Home).
     * Returns true if it changed anything.
     */
    static boolean ensureOn(Context c) {
        if (c.checkSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
        android.content.ContentResolver r = c.getContentResolver();
        android.content.ComponentName me = new android.content.ComponentName(c, GuestService.class);
        String full = me.flattenToString(), brief = me.flattenToShortString();
        try {
            String list = android.provider.Settings.Secure.getString(r, android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (list == null || "null".equals(list)) list = "";
            boolean listed = false;
            for (String s : list.split(":")) if (s.equalsIgnoreCase(full) || s.equalsIgnoreCase(brief)) listed = true;
            boolean on = android.provider.Settings.Secure.getInt(r, android.provider.Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1;
            if (listed && on) return false;
            if (!listed) android.provider.Settings.Secure.putString(r, android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, list.isEmpty() ? full : list + ":" + full);
            if (!on) android.provider.Settings.Secure.putInt(r, android.provider.Settings.Secure.ACCESSIBILITY_ENABLED, 1);
            Log.i(TAG, "Home button was switched off, switched it back on" + (listed ? "" : " (re-added to the list)"));
            return true;
        } catch (Exception e) {
            Log.w(TAG, "couldn't switch the Home button back on: " + e);
            return false;
        }
    }

    /** True when the TV lists the Home button service as on (what setup_tv.ps1 sets). */
    static boolean isOn(Context c) {
        android.content.ComponentName me = new android.content.ComponentName(c, GuestService.class);
        String list = android.provider.Settings.Secure.getString(c.getContentResolver(), android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (list == null) return false;
        boolean listed = false;
        for (String s : list.split(":")) if (s.equalsIgnoreCase(me.flattenToString()) || s.equalsIgnoreCase(me.flattenToShortString())) listed = true;
        return listed && android.provider.Settings.Secure.getInt(c.getContentResolver(), android.provider.Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1;
    }

    private final BroadcastReceiver cmd = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            String what = i.getStringExtra("cmd");
            if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) {
                if (escapeActive) h.post(endEscape);
                return;
            }
            Log.i(TAG, "cmd " + what);
            if ("allow_amazon_home".equals(what)) {
                escapeActive = true;
                escapeArrivalUntil = SystemClock.uptimeMillis() + 5000;
                // Pressing Home while on the Amazon home produces no event we can see, so the escape hatch
                // also ends by itself after 20 minutes or when the TV sleeps.
                h.removeCallbacks(endEscape);
                h.postDelayed(endEscape, 20 * 60 * 1000L);
                hideBridge();                                // picked in the overlay: show the Amazon home now
            } else if ("opening_settings".equals(what)) {
                ignoreHomeUntil = SystemClock.uptimeMillis() + 3000;   // Settings may flash the Amazon home on the way
            } else if ("bridge_launch".equals(what)) {
                launchedFromBridge = true;           // the app (or Settings) opens when Android's lock ends
            } else if ("kill_kodi".equals(what)) {
                closeKodi();
            } else if ("clear_cache".equals(what)) {
                clearCache();
            }
        }
    };

    private final Runnable endEscape = new Runnable() {
        @Override
        public void run() {
            if (!escapeActive) return;
            escapeActive = false;
            AccessibilityNodeInfo root = getRootInActiveWindow();
            boolean onAmazonHome = root != null && AMAZON_PKG.contentEquals(root.getPackageName());
            Log.i(TAG, "escape hatch ended" + (onAmazonHome ? ", returning to Offshore" : ""));
            if (onAmazonHome && !paused()) openLauncher(null);
        }
    };

    @Override
    protected void onServiceConnected() {
        registerReceiver(cmd, new IntentFilter(ACTION_CMD), PERM_CMD, h);
        registerReceiver(cmd, new IntentFilter(Intent.ACTION_SCREEN_OFF), null, h);
        running = this;
        Home.get(this);                                  // load the home screen now, so the first Home is instant too
        Log.i(TAG, "connected");
        // After an update, a reboot or a crash restart, the Amazon home may already be up before this service
        // connected (no event to react to), leaving guests on Amazon's ad-filled screen. Check once.
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                AccessibilityNodeInfo root = getRootInActiveWindow();
                if (root != null && AMAZON_PKG.contentEquals(root.getPackageName()) && !paused() && !escapeActive) {
                    Log.i(TAG, "Amazon home was already showing at start, opening Offshore");
                    openLauncher(null);
                }
            }
        }, 2500);
    }

    @Override
    public void onDestroy() {
        if (running == this) running = null;
        try { unregisterReceiver(cmd); } catch (Exception ignored) { }
        removeOverlay();
        hideBridge();
        removeCover();
        hideUrgent.run();
        super.onDestroy();
    }

    @Override
    public void onInterrupt() { }

    // ---- Home key (only if Fire OS delivers it; ADB-injected keys never arrive here) ----

    @Override
    protected boolean onKeyEvent(KeyEvent e) {
        if (busy) return true;                                   // ignore the remote while closing Kodi
        if (DEBUG) Log.i(TAG, "key " + KeyEvent.keyCodeToString(e.getKeyCode()) + " action " + e.getAction());
        int k = e.getKeyCode();
        if (urgentCard != null && urgentBig && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_BACK)) {
            // OK (or Back) clears an alert card and its sound; the app underneath never sees the press.
            if (e.getAction() == KeyEvent.ACTION_UP) dismissUrgent();
            return true;
        }
        if (k != KeyEvent.KEYCODE_HOME) return false;
        if (paused()) return false;                              // launcher unhealthy: let Amazon handle Home
        if (e.getAction() == KeyEvent.ACTION_UP) {
            escapeActive = false;
            openLauncher(null);
        }
        return true;
    }

    // Fox One's show name (owner, 24 November 2026: "try reading fox one"). Fox One tells Fire TV nothing about what
    // it plays, but its player screen carries the programme's name. With Settings › Home screen › Keep watching › Fox One show names on
    // (off by default; Home.screenTitlesOn), this reads that one line every 30 s while Fox One is in front, and stops
    // when it isn't. Only Fox One, only the name; it goes to the Keep watching card and nowhere else.
    static final String FOX = "com.fox.foxone";
    private boolean foxWatching;
    private final Runnable foxPoll = new Runnable() {
        @Override public void run() {
            AccessibilityNodeInfo root = Home.screenTitlesOn(GuestService.this) ? getRootInActiveWindow() : null;
            if (root == null || !FOX.contentEquals(root.getPackageName())) { foxWatching = false; return; }
            String t = foxTitle(root);
            if (t != null) Home.screenTitle(GuestService.this, FOX, t);
            h.postDelayed(this, 30000);
        }
    };

    /** The programme's name on Fox One's screen: the first real line of text (not a button, time or message). */
    private static String foxTitle(AccessibilityNodeInfo root) {
        java.util.ArrayDeque<AccessibilityNodeInfo> q = new java.util.ArrayDeque<>();
        q.add(root);
        int n = 0;
        while (!q.isEmpty() && n < 300) {
            AccessibilityNodeInfo x = q.poll(); n++;
            if (x == null) continue;
            CharSequence c = x.getText();
            if (c != null) {
                String t = c.toString().trim();
                if (t.length() >= 3 && t.length() <= 80 && t.matches(".*[A-Za-z].*") && !t.contains("?") && !t.endsWith("!")
                        && !t.matches("(?i)(back|live|no|yes.*|exit|ok|cancel|retry|sign in|watch|resume|play|pause|more|settings|search|home|guide|close|start over|.*\\d{1,2}:\\d{2}.*|sorry.*|error.*|loading.*)"))
                    return t;
            }
            for (int i = 0; i < x.getChildCount(); i++) q.add(x.getChild(i));
        }
        return null;
    }

    // ---- Window changes ----------------------------------------------------------

    @Override
    public void onAccessibilityEvent(AccessibilityEvent ev) {
        if (ev.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        String pkg = ev.getPackageName() == null ? "" : ev.getPackageName().toString();
        String cls = ev.getClassName() == null ? "" : ev.getClassName().toString();
        if (DEBUG) Log.i(TAG, "window " + pkg + " / " + cls);

        if (OUR_PKG.equals(pkg)) {
            if (!cls.equals(MainActivity.class.getName())) return;   // our own cover/overlay windows don't count
            ourWindowSeen = SystemClock.uptimeMillis();
            escapeActive = false;                                // back on Offshore: escape hatch is over
            h.postDelayed(new Runnable() {                       // let the real screen draw, then lift the cover
                @Override
                public void run() { removeCover(); }             // (MainActivity lifts the live overlay itself)
            }, 400);
            return;
        }
        boolean amazonHome = AMAZON_PKG.equals(pkg) && cls.startsWith(AMAZON_HOME_PREFIX);
        boolean otherScreen = AMAZON_PKG.equals(pkg) ? cls.contains("Settings") : !pkg.isEmpty() && !"android".equals(pkg);
        if (bridge != null && otherScreen) hideBridge();     // another app or Settings came up
        if (busy) return;
        if (FOX.equals(pkg) && !foxWatching && Home.screenTitlesOn(this)) { foxWatching = true; h.postDelayed(foxPoll, 3000); }

        if (amazonHome) {
            long now = SystemClock.uptimeMillis();
            if (now < escapeArrivalUntil) return;                // the Fire TV Home button's own arrival
            escapeActive = false;
            if (!paused() && now > ignoreHomeUntil) redirect();
        }
    }

    private void redirect() {
        long now = SystemClock.uptimeMillis();
        if (now - lastRedirect < 1500) return;
        lastRedirect = now;
        Log.i(TAG, "Amazon home appeared, opening Offshore");
        launchedFromBridge = false;
        if (!showBridge()) showCover();
        openLauncher(null);
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                removeCover();
                hideBridge();
                if (ourWindowSeen >= lastRedirect || launchedFromBridge) return;   // it came up fine
                long t = SystemClock.uptimeMillis();
                failures.add(t);
                while (!failures.isEmpty() && t - failures.get(0) > 2 * 60 * 1000L) failures.remove(0);
                Log.w(TAG, "Offshore did not appear (" + failures.size() + " recent failures)");
                if (failures.size() >= 2) pause("launcher did not appear twice");
            }
        }, 9000);   // the app-switch lock alone can take ~5 s
    }

    // ---- Live overlay: the real home screen, usable at once while Android's app-switch lock runs out ----

    private FrameLayout bridge;
    private volatile android.graphics.Bitmap frozen;     // last snapshot, shown while the page moves to MainActivity

    private boolean showBridge() {
        if (bridge != null) return true;
        if (!Home.exists() || !Home.get(this).isReady()) return false;
        final Home home = Home.get(this);
        bridge = new FrameLayout(this) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent e) {
                return home.key(e) || super.dispatchKeyEvent(e);
            }
        };
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT);
        try {
            ((WindowManager) getSystemService(WINDOW_SERVICE)).addView(bridge, lp);
        } catch (Exception e) {
            Log.w(TAG, "overlay failed", e);
            bridge = null;
            return false;
        }
        home.attach(bridge, this);
        home.bridging = true;
        home.web.onResume();
        home.shown();
        new Thread(new Runnable() {                      // ready for freezeBridge()
            @Override
            public void run() {
                File f = new File(getFilesDir(), MainActivity.SNAPSHOT);
                if (f.exists()) frozen = android.graphics.BitmapFactory.decodeFile(f.getPath());
            }
        }).start();
        h.postDelayed(watchApps, 300);
        return true;
    }

    /** MainActivity is taking the page: keep a still picture in the overlay so nothing flickers underneath. */
    void freezeBridge() {
        if (bridge != null && frozen != null) bridge.setBackground(new android.graphics.drawable.BitmapDrawable(getResources(), frozen));
    }

    void hideBridge() {
        if (bridge == null) return;
        h.removeCallbacks(watchApps);
        Home home = Home.exists() ? Home.get(this) : null;
        if (home != null && home.web.getParent() == bridge) {
            home.hidden();
            home.detach();
            home.bridging = false;
            home.web.onPause();
        }
        try { ((WindowManager) getSystemService(WINDOW_SERVICE)).removeView(bridge); } catch (Exception ignored) { }
        bridge = null;
        frozen = null;
    }

    /**
     * Apps like Plex and Netflix send no window events, so while the overlay is up, look at the window list: if
     * another app's window is showing (one a guest picked, or one opened by voice), get out of its way.
     */
    private final Runnable watchApps = new Runnable() {
        @Override
        public void run() {
            if (bridge == null) return;
            try {
                for (android.view.accessibility.AccessibilityWindowInfo w : getWindows()) {
                    if (w.getType() != android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                    AccessibilityNodeInfo r = w.getRoot();
                    CharSequence p = r == null ? null : r.getPackageName();
                    if (p != null && !AMAZON_PKG.contentEquals(p) && !OUR_PKG.contentEquals(p)) {
                        Log.i(TAG, p + " is showing, hiding the overlay");
                        hideBridge();
                        return;
                    }
                }
            } catch (Exception ignored) { }
            h.postDelayed(this, 200);
        }
    };

    // ---- Urgent alerts over whatever is playing (doorbell, smoke alarm, tornado warning...) ----------

    // Drawn like the home screen's own notification banner (.nbanner in the page): dark glass with a hairline edge
    // (red for urgent), a coloured dot with a symbol, title, softer message, then source and time. Sizes are the page's,
    // in 1920-wide pixels. There's no blur over video, so the glass is a little more opaque than the page's frost.
    private android.widget.LinearLayout urgentCard;
    private TextView urgentTitle, urgentText, urgentFoot, urgentKick;

    private void dismissUrgent() {
        Log.i(TAG, "alert card dismissed with the remote");
        h.removeCallbacks(hideUrgent);
        hideUrgent.run();
        if (Home.exists()) Home.get(this).stopAlert();
    }

    /** The small label over a serious alert, from the National Weather Service's event name. */
    static String alertKind(String event) {
        String e = event == null ? "" : event;
        if (e.contains("Child Abduction")) return "AMBER ALERT";
        if (e.contains("Evacuation")) return "EVACUATE NOW";
        if (e.contains("Shelter In Place")) return "SHELTER IN PLACE";
        if (e.matches(".*(Civil|Law Enforcement|Hazardous Materials|Nuclear|Radiological|Local Area|Fire Warning).*")) return "EMERGENCY ALERT";
        return "WEATHER WARNING";
    }
    private boolean urgentBig;
    private final Runnable hideUrgent = new Runnable() {
        @Override
        public void run() {
            final android.view.View card = urgentCard;
            if (card == null) return;
            urgentCard = null;
            card.animate().alpha(0f).translationY(-card.getHeight() * 0.25f).setDuration(350).withEndAction(new Runnable() {
                @Override
                public void run() { try { ((WindowManager) getSystemService(WINDOW_SERVICE)).removeView(card); } catch (Exception ignored) { } }
            }).start();
        }
    };

    /**
     * A card over whatever app is open. It never takes focus, so the remote keeps controlling the app.
     * Life-threatening weather (source "Weather"): larger, always top centre, for a full minute, impossible to miss in a
     * movie. Everything else (a phone sharing, the LocalSend code, smart-home alerts): banner size for 10 s, where
     * Settings > Notifications > Pop-up position puts the home screen's own (Home.Bridge.notifPos).
     */
    void showUrgent(String title, String message, String source) {
        boolean big = "Weather".equals(source);
        if (urgentCard != null && urgentBig != big) {               // a different kind is showing: replace it at once
            try { ((WindowManager) getSystemService(WINDOW_SERVICE)).removeView(urgentCard); } catch (Exception ignored) { }
            urgentCard = null;
        }
        boolean fresh = urgentCard == null;
        if (fresh) {
            urgentBig = big;
            int w = getResources().getDisplayMetrics().widthPixels;
            float s = w / 1920f;                                    // page pixels -> screen pixels
            android.widget.LinearLayout card = new android.widget.LinearLayout(this);
            card.setOrientation(android.widget.LinearLayout.HORIZONTAL);
            card.setGravity(Gravity.CENTER_VERTICAL);
            card.setPadding((int) ((big ? 34 : 26) * s), (int) ((big ? 26 : 18) * s), (int) ((big ? 38 : 30) * s), (int) ((big ? 26 : 18) * s));
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xF03A3A3C, 0xF01C1C1E});
            bg.setCornerRadius((big ? 38 : 32) * s);
            bg.setStroke((int) Math.max(1, 2 * s), 0xFFFF453A);      // .nbanner.urgent: Apple red edge
            card.setBackground(bg);

            TextView dot = new TextView(this);                      // .nr .dot: red circle with the warning mark
            int d = (int) ((big ? 64 : 46) * s);
            android.graphics.drawable.GradientDrawable circle = new android.graphics.drawable.GradientDrawable();
            circle.setShape(android.graphics.drawable.GradientDrawable.OVAL);
            circle.setColor(0xFFFF453A);
            dot.setBackground(circle);
            dot.setText("!");
            dot.setGravity(Gravity.CENTER);
            dot.setTextColor(0xFFFFFFFF);
            dot.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            dot.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, (big ? 36 : 26) * s);
            android.widget.LinearLayout.LayoutParams dlp = new android.widget.LinearLayout.LayoutParams(d, d);
            dlp.rightMargin = (int) ((big ? 26 : 18) * s);
            if (big) dlp.gravity = Gravity.TOP;
            card.addView(dot, dlp);

            android.widget.LinearLayout col = new android.widget.LinearLayout(this);
            col.setOrientation(android.widget.LinearLayout.VERTICAL);
            if (big) {                                              // like the screensaver's "Weather warning" label
                TextView k = urgentKick = new TextView(this);
                k.setTextColor(0xFFFF6961);
                k.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                k.setLetterSpacing(0.14f);
                k.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, 17 * s);
                col.addView(k);
            }
            urgentTitle = new TextView(this);
            urgentTitle.setTextColor(0xFFFFFFFF);
            urgentTitle.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
            urgentTitle.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, (big ? 40 : 27) * s);
            urgentTitle.setSingleLine(true);
            urgentTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
            urgentText = new TextView(this);
            urgentText.setTextColor(0xC7FFFFFF);                    // --text-2
            urgentText.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, (big ? 24 : 22) * s);
            urgentText.setLineSpacing(0, 1.15f);
            urgentText.setMaxLines(big ? 4 : 2);
            urgentText.setEllipsize(android.text.TextUtils.TruncateAt.END);
            urgentText.setPadding(0, (int) (4 * s), 0, 0);
            urgentFoot = new TextView(this);
            urgentFoot.setTextColor(0x80FFFFFF);
            urgentFoot.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, (big ? 19 : 18) * s);
            urgentFoot.setPadding(0, (int) ((big ? 10 : 6) * s), 0, 0);
            col.addView(urgentTitle);
            col.addView(urgentText);
            col.addView(urgentFoot);
            card.addView(col, new android.widget.LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

            String pos = big ? "tc" : getSharedPreferences(Home.PREFS, MODE_PRIVATE).getString("notif_pos", "tc");
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                (int) ((big ? 1060 : 780) * s), WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
            lp.gravity = (pos.startsWith("b") ? Gravity.BOTTOM : Gravity.TOP)
                | (pos.endsWith("l") ? Gravity.START : pos.endsWith("r") ? Gravity.END : Gravity.CENTER_HORIZONTAL);
            lp.x = pos.endsWith("c") ? 0 : (int) (100 * s);           // the page's safe margin
            lp.y = (int) ((pos.startsWith("b") ? 116 : 34) * s);
            card.setAlpha(0f);
            card.setTranslationY((pos.startsWith("b") ? 1 : -1) * 40 * s);
            try {
                ((WindowManager) getSystemService(WINDOW_SERVICE)).addView(card, lp);
            } catch (Exception e) {
                Log.w(TAG, "urgent card failed", e);
                return;
            }
            urgentCard = card;
            card.animate().alpha(1f).translationY(0).setDuration(450)
                .setInterpolator(new android.view.animation.DecelerateInterpolator(2f)).start();
        }
        urgentTitle.setText(title);
        if (big && urgentKick != null) urgentKick.setText(alertKind(title));
        boolean hasMsg = message != null && !message.isEmpty();
        urgentText.setText(hasMsg ? message : "");
        urgentText.setVisibility(hasMsg ? android.view.View.VISIBLE : android.view.View.GONE);
        String when = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(new java.util.Date());
        String from = !big ? (source == null ? "" : source)
            : "WEATHER WARNING".equals(alertKind(title)) ? "National Weather Service" : "Official alert · via the National Weather Service";
        Log.i(TAG, "urgent card shown: " + title);
        // Serious alerts are heard too (Settings can change the sound); what's playing pauses so the sound can be heard.
        boolean paused = big && Home.exists() && Home.get(this).playAlert(true);
        urgentFoot.setText((from.isEmpty() ? when : from + "  ·  " + when)
            + (paused ? "\nPaused so you can hear it  ·  Press OK to close and keep watching" : big ? "\nPress OK to close" : ""));
        h.removeCallbacks(hideUrgent);
        h.postDelayed(hideUrgent, big ? 60000 : 10000);              // a life-threatening warning stays a full minute
    }

    // ---- Fallback cover: snapshot of Offshore, if the live page isn't loaded yet ----

    private android.widget.ImageView cover;

    private void showCover() {
        if (cover != null) return;
        File f = new File(getFilesDir(), MainActivity.SNAPSHOT);
        android.graphics.Bitmap b = f.exists() ? android.graphics.BitmapFactory.decodeFile(f.getPath()) : null;
        cover = new android.widget.ImageView(this) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent e) { return true; }   // swallow the remote under the cover
        };
        cover.setScaleType(android.widget.ImageView.ScaleType.FIT_XY);
        cover.setBackgroundColor(0xFF000000);
        if (b != null) cover.setImageBitmap(b);
        cover.setFocusable(true);
        cover.setFocusableInTouchMode(true);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_FULLSCREEN,
            PixelFormat.OPAQUE);
        try {
            ((WindowManager) getSystemService(WINDOW_SERVICE)).addView(cover, lp);
            cover.requestFocus();
        } catch (Exception e) {
            Log.w(TAG, "cover failed", e);
            cover = null;
        }
    }

    private void removeCover() {
        if (cover == null) return;
        try { ((WindowManager) getSystemService(WINDOW_SERVICE)).removeView(cover); } catch (Exception ignored) { }
        cover = null;
    }

    private void pause(String why) {
        pausedUntil = SystemClock.uptimeMillis() + PAUSE_MS;
        failures.clear();
        Log.w(TAG, "pausing Home redirect for 10 min: " + why);
    }

    private boolean paused() {
        if (SystemClock.uptimeMillis() < pausedUntil) return true;
        // Set by Home's crash handler (the crash restarts this process, so it can't be kept in memory).
        long crashedPause = getSharedPreferences(Home.PREFS, MODE_PRIVATE).getLong(Home.PREF_PAUSED_UNTIL, 0);
        return System.currentTimeMillis() < crashedPause;
    }

    private void openLauncher(String toast) {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (toast != null) i.putExtra("toast", toast);
        try { startActivity(i); } catch (Exception e) { Log.e(TAG, "cannot open launcher", e); }
    }

    // ---- Close Kodi -------------------------------------------------------------------

    private void closeKodi() {
        if (busy) return;
        busy = true;
        showOverlay("Closing Kodi…");
        new Thread(new Runnable() {
            @Override
            public void run() {
                String msg;
                boolean wasRunning = kodiListening();
                boolean quit = false;
                if (wasRunning) {
                    sendKodi("{\"jsonrpc\":\"2.0\",\"method\":\"Application.Quit\",\"id\":1}");
                    for (int i = 0; i < 40 && !quit; i++) {      // up to 10 s for Kodi to save and exit
                        SystemClock.sleep(250);
                        quit = !kodiListening();
                    }
                    SystemClock.sleep(1000);                     // let it finish writing its databases
                }
                try { ((ActivityManager) getSystemService(ACTIVITY_SERVICE)).killBackgroundProcesses(KODI); } catch (Exception ignored) { }

                long freed = clearKodiCache(quit || !wasRunning);
                String size = freed > 1024 * 1024 ? (freed / (1024 * 1024)) + " MB" : (freed / 1024) + " KB";
                if (wasRunning && quit) msg = "Kodi closed. Cleared " + size + " of cache.";
                else if (wasRunning) msg = "Kodi didn't close. Cleared " + size + " of temporary files.";
                else msg = "Kodi wasn't running. Cleared " + size + " of cache.";
                Log.i(TAG, "close kodi: running=" + wasRunning + " quit=" + quit + " freed=" + freed);

                final String done = msg;
                h.post(new Runnable() {
                    @Override
                    public void run() {
                        removeOverlay();
                        busy = false;
                        openLauncher(done);
                    }
                });
            }
        }).start();
    }

    // ---- Clear Cache (for when the TV feels slow) ----------------------------------------

    /**
     * Asks Android for as much free space as it can make (StorageManager.allocateBytes). For a normal app Android only
     * trims caches that are over their quota, so this is not a full clear (clear_caches.ps1 over ADB is). Then closes
     * background apps: only installed apps and the guest apps, never Amazon system services (Alexa, TV control).
     */
    private void clearCache() {
        if (busy) return;
        busy = true;
        showOverlay("Clearing cache…");
        new Thread(new Runnable() {
            @Override
            public void run() {
                File data = Environment.getDataDirectory();
                long before = data.getUsableSpace();
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    try {
                        android.os.storage.StorageManager sm = (android.os.storage.StorageManager) getSystemService(STORAGE_SERVICE);
                        java.util.UUID u = android.os.storage.StorageManager.UUID_DEFAULT;
                        sm.allocateBytes(u, sm.getAllocatableBytes(u));
                    } catch (Exception e) {
                        Log.w(TAG, "cache trim failed", e);
                    }
                }
                ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
                List<String> targets = new ArrayList<>();
                targets.addAll(MainActivity.configApps(GuestService.this));
                for (android.content.pm.ApplicationInfo ai : getPackageManager().getInstalledApplications(0)) {
                    if ((ai.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0 && !OUR_PKG.equals(ai.packageName)) targets.add(ai.packageName);
                }
                for (String p : targets) {
                    try { am.killBackgroundProcesses(p); } catch (Exception ignored) { }
                }
                long freed = Math.max(0, data.getUsableSpace() - before);
                Log.i(TAG, "clear cache: freed " + freed + " bytes, closed background apps: " + targets.size());
                final String done = freed > 1024 * 1024 ? "Done. Closed background apps and freed " + (freed / (1024 * 1024)) + " MB." : "Done. Closed background apps.";
                h.post(new Runnable() {
                    @Override
                    public void run() {
                        removeOverlay();
                        busy = false;
                        openLauncher(done);
                    }
                });
            }
        }).start();
    }

    private static boolean kodiListening() {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", KODI_JSONRPC_PORT), 500);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static void sendKodi(String json) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", KODI_JSONRPC_PORT), 1000);
            OutputStream out = s.getOutputStream();
            out.write(json.getBytes("UTF-8"));
            out.flush();
            SystemClock.sleep(300);
        } catch (Exception e) {
            Log.w(TAG, "kodi json-rpc failed", e);
        }
    }

    /**
     * Kodi's cache lives on shared storage. temp/, addon package zips and Android's cache dir are always safe.
     * Thumbnails (and Textures13.db, which indexes them) are only removed once Kodi has stopped.
     */
    private static long clearKodiCache(boolean kodiStopped) {
        File base = new File(Environment.getExternalStorageDirectory(), "Android/data/" + KODI);
        File kodi = new File(base, "files/.kodi");
        long freed = 0;
        freed += deleteContents(new File(kodi, "temp"));
        freed += deleteContents(new File(kodi, "addons/packages"));
        freed += deleteContents(new File(base, "cache"));
        if (kodiStopped) {
            freed += deleteContents(new File(kodi, "userdata/Thumbnails"));
            File db = new File(kodi, "userdata/Database");
            File[] textures = db.listFiles();
            if (textures != null) for (File f : textures) {
                if (f.getName().startsWith("Textures") && f.getName().endsWith(".db")) { freed += f.length(); f.delete(); }
            }
        }
        return freed;
    }

    private static long deleteContents(File dir) {
        long n = 0;
        File[] files = dir.listFiles();
        if (files == null) return 0;
        for (File f : files) {
            if (f.isDirectory()) { n += deleteContents(f); f.delete(); }
            else { n += f.length(); f.delete(); }
        }
        return n;
    }

    private void showOverlay(String text) {
        if (overlay != null) return;
        overlay = new TextView(this);
        overlay.setText(text);
        overlay.setTextSize(36);
        overlay.setTextColor(0xFFFFFFFF);
        overlay.setBackgroundColor(0xF0000000);
        overlay.setGravity(Gravity.CENTER);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT);
        try {
            ((WindowManager) getSystemService(WINDOW_SERVICE)).addView(overlay, lp);
        } catch (Exception e) {
            overlay = null;
        }
    }

    private void removeOverlay() {
        if (overlay == null) return;
        try { ((WindowManager) getSystemService(WINDOW_SERVICE)).removeView(overlay); } catch (Exception ignored) { }
        overlay = null;
    }
}
