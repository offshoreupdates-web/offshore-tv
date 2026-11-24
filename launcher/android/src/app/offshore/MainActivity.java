package app.offshore;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebView;
import android.widget.FrameLayout;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Offshore home screen window. The page itself (a WebView showing assets/index.html) lives in Home and is shared with
 * GuestService's overlay; this activity shows it and forwards the remote's D-pad to it.
 */
public class MainActivity extends Activity {
    static final String TAG = "Offshore";

    static final String AMAZON_HOME_PKG = "com.amazon.tv.launcher";
    static final String AMAZON_HOME_CLS = "com.amazon.tv.launcher.ui.HomeActivity_vNext";

    /**
     * Per-TV settings (app tiles, weather place), pushed by tools\push_config.ps1 from the TV's folder:
     * /sdcard/Android/data/app.offshore/files/tv.json. Same APK on every TV; only this file differs.
     */
    static final String CONFIG = "tv.json";

    /** Tiles when a TV has no tv.json: the big apps, if installed; every other installed app gets a tile too (Home.autoApps). */
    static final String[] DEFAULT_APPS = {
        "com.amazon.firebat", "com.netflix.ninja", "com.amazon.firetv.youtube",
    };

    static java.io.File configFile(Context c) {
        java.io.File dir = c.getExternalFilesDir(null);
        return dir == null ? null : new java.io.File(dir, CONFIG);
    }

    static String readConfig(Context c) {
        java.io.File f = configFile(c);
        if (f == null || !f.isFile()) return null;
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            String s = out.toString("UTF-8");
            new org.json.JSONObject(s);          // reject a broken file: the page then falls back to defaults
            return s;
        } catch (Exception e) {
            Log.w(TAG, "bad " + CONFIG, e);
            return null;
        }
    }

    /** Packages of the app tiles, in order. */
    static List<String> configApps(Context c) {
        List<String> apps = new ArrayList<>();
        String s = readConfig(c);
        if (s != null) {
            try {
                org.json.JSONArray a = new org.json.JSONObject(s).getJSONArray("apps");
                for (int i = 0; i < a.length(); i++) apps.add(a.getString(i));
                return apps;
            } catch (Exception e) {
                Log.w(TAG, "bad apps in " + CONFIG, e);
                apps.clear();
            }
        }
        for (String p : DEFAULT_APPS) apps.add(p);
        return apps;
    }

    /** The activity currently showing (or about to show) the home screen. */
    static MainActivity current;

    /** Answer to Android's location prompt (7: Bluetooth and Wi-Fi scanning) or storage prompt (8: Files). */
    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        boolean ok = results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
        Home.get(this).pageJs(code == 8 ? "window.guestFilesPerm && guestFilesPerm(" + ok + ")" : "window.guestPerm && guestPerm(" + ok + ")");
    }

    private FrameLayout root;
    private boolean resumed;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        setContentView(root);
        current = this;
        Home.get(this);                          // usually already loaded by GuestService
        showToastFrom(getIntent());
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        current = this;
        attachHome();
    }

    /** Take the home screen into this window (from GuestService's overlay if it was showing there). */
    void attachHome() {
        if (!resumed) return;
        final Home home = Home.get(this);
        home.reloadIfConfigChanged();            // a tv.json pushed while the home screen wasn't showing
        final GuestService guard = GuestService.running;
        boolean fromOverlay = home.bridging;
        if (fromOverlay && guard != null) guard.freezeBridge();   // overlay keeps a still picture during the move
        home.attach(root, this);
        home.bridging = false;
        home.web.onResume();
        home.shown();
        if (guard == null) return;
        if (!fromOverlay) { guard.hideBridge(); return; }
        // Lift the overlay once the page has drawn in this window.
        home.web.postVisualStateCallback(0, new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long id) {
                root.postDelayed(new Runnable() {
                    @Override
                    public void run() { guard.hideBridge(); }
                }, 50);
            }
        });
        root.postDelayed(new Runnable() {        // in case the callback never comes
            @Override
            public void run() { guard.hideBridge(); }
        }, 1000);
    }

    @Override
    protected void onPause() {
        resumed = false;
        Home home = Home.get(this);
        if (home.web.getParent() == root) {
            home.hidden();
            saveSnapshot(home);
            home.web.onPause();          // stops drawing; Home.hidden() freezes the page's timers a few seconds later
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        if (Home.exists() && Home.get(this).web.getParent() == root) Home.get(this).detach();
        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (Home.get(this).key(e)) return true;
        return super.dispatchKeyEvent(e);
    }

    // Result messages from GuestService ("Cache cleared", ...), and push_config.ps1's reload.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getBooleanExtra("reload", false)) Home.get(this).reload();   // show a new tv.json now
        showToastFrom(intent);
    }

    private void showToastFrom(Intent intent) {
        String msg = intent == null ? null : intent.getStringExtra("toast");
        if (msg == null) return;
        intent.removeExtra("toast");
        Home.get(this).toast(msg);
    }

    // ---- Snapshot: fallback cover, and the still picture shown while the page moves between windows ----

    static final String SNAPSHOT = "home_snapshot.jpg";

    void saveSnapshot(Home home) {
        if (!home.isReady() || android.os.Build.VERSION.SDK_INT < 26) return;
        // Taken just as an app starts: the copy is quick, and the JPEG is written at low priority so the app that's
        // opening gets the CPU first. (Kept fresh every time: it covers the screen while Home moves windows.)
        final View v = getWindow().getDecorView();
        if (v.getWidth() == 0) return;
        final Bitmap b = Bitmap.createBitmap(v.getWidth(), v.getHeight(), Bitmap.Config.ARGB_8888);
        try {
            android.view.PixelCopy.request(getWindow(), b, new android.view.PixelCopy.OnPixelCopyFinishedListener() {
                @Override
                public void onPixelCopyFinished(int result) {
                    if (result != android.view.PixelCopy.SUCCESS) { b.recycle(); return; }
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
                            java.io.File tmp = new java.io.File(getFilesDir(), SNAPSHOT + ".tmp");
                            try (java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) {
                                b.compress(Bitmap.CompressFormat.JPEG, 80, out);
                            } catch (Exception e) {
                                Log.w(TAG, "snapshot failed", e);
                                return;
                            } finally {
                                b.recycle();
                            }
                            tmp.renameTo(new java.io.File(getFilesDir(), SNAPSHOT));
                        }
                    }).start();
                }
            }, new android.os.Handler(getMainLooper()));
        } catch (Exception e) {
            b.recycle();
        }
    }
}
