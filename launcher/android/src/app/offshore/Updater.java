package app.offshore;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Updates from Offshore's update site (Settings > Updates & about). FEED is a small file the maintainer uploads with each release:
 *   {"version": "0.12", "notes": ["...", "..."], "apk": "https://<same site>/offshore-0.12.apk", "sha256": "<hex>"}
 * Before Fire TV's install prompt appears, the download must: come from the feed's own site over https, match the
 * sha256 in the feed, be this same app signed with this same key, and be newer than what's installed. Android checks
 * the signature again when installing. Installing always needs a person to press Install on the TV, and the TV's owner
 * to have allowed Offshore to install apps (tools\setup_tv.ps1).
 */
final class Updater {
    private static final String TAG = "Offshore";
    /** Where releases are announced. Empty: no updates from a site (the GitHub check or a computer still work). */
    static final String FEED = "https://offshoreupdates-web.github.io/offshore-tv/latest.json";   // the offshore-tv repo's GitHub Pages
    private static final int MAX_APK = 60 << 20;

    interface Progress { void at(long done, long total); }

    private Updater() { }

    static String feedHost() { return FEED.isEmpty() ? "" : Uri.parse(FEED).getHost(); }

    /** The feed as JSON (version, notes, apk, sha256), or {"error":...}. */
    static String check() {
        try {
            if (FEED.isEmpty()) return "{\"error\":\"no feed\"}";
            HttpURLConnection c = open(FEED);
            try (InputStream in = c.getInputStream()) {
                byte[] b = new byte[64 << 10]; int n, off = 0;
                while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
                JSONObject j = new JSONObject(new String(b, 0, off, "UTF-8"));
                JSONObject out = new JSONObject().put("version", j.optString("version")).put("apk", j.optString("apk")).put("sha256", j.optString("sha256"));
                JSONArray notes = j.optJSONArray("notes");
                out.put("notes", notes != null ? notes : new JSONArray());
                Log.i(TAG, "update feed: newest is " + out.optString("version"));
                return out.toString();
            } finally { c.disconnect(); }
        } catch (Exception e) {
            Log.w(TAG, "update check failed: " + e);
            return "{\"error\":\"check failed\"}";
        }
    }

    /** Downloads, verifies and opens Fire TV's installer. Returns "ok" or why not. Runs on a background thread. */
    static String install(Context c, String apkUrl, String sha256, Progress pr) {
        File dir = new File(c.getCacheDir(), "update"), apk = new File(dir, "offshore-update.apk");
        try {
            Uri u = Uri.parse(apkUrl);
            if (FEED.isEmpty() || !"https".equals(u.getScheme()) || !feedHost().equals(u.getHost())) return "not from the update site";
            if (sha256 == null || !sha256.matches("[0-9a-fA-F]{64}")) return "no fingerprint in the feed";
            if (dir.exists()) for (File f : dir.listFiles()) f.delete();
            if (!dir.mkdirs() && !dir.isDirectory()) return "no room";
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            HttpURLConnection h = open(apkUrl);
            long total = h.getContentLengthLong(), done = 0, last = 0;
            if (total > MAX_APK) return "too large";
            try (InputStream in = h.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                byte[] b = new byte[64 << 10];
                for (int n; (n = in.read(b)) > 0; ) {
                    out.write(b, 0, n); md.update(b, 0, n); done += n;
                    if (done > MAX_APK) return "too large";
                    long now = android.os.SystemClock.uptimeMillis();
                    if (now - last > 500) { last = now; pr.at(done, total); }
                }
            } finally { h.disconnect(); }
            StringBuilder hex = new StringBuilder();
            for (byte x : md.digest()) hex.append(String.format("%02x", x));
            if (!hex.toString().equalsIgnoreCase(sha256)) { apk.delete(); return "fingerprint didn't match"; }
            PackageManager pm = c.getPackageManager();
            PackageInfo got = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNATURES);
            PackageInfo mine = pm.getPackageInfo(c.getPackageName(), PackageManager.GET_SIGNATURES);
            if (got == null || !c.getPackageName().equals(got.packageName)) { apk.delete(); return "not Offshore"; }
            if (got.signatures == null || got.signatures.length == 0 || !got.signatures[0].equals(mine.signatures[0])) { apk.delete(); return "signed with another key"; }
            if (got.versionCode <= mine.versionCode) { apk.delete(); return "not newer"; }
            Intent i = new Intent(Intent.ACTION_INSTALL_PACKAGE).setData(FileShare.uri(c, apk.getAbsolutePath()))
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
            c.startActivity(i);
            Log.i(TAG, "update " + got.versionName + " verified, installer opened");
            return "ok";
        } catch (SecurityException e) {
            return "installing apps isn't allowed yet (tools\\setup_tv.ps1)";
        } catch (Exception e) {
            Log.w(TAG, "update failed: " + e);
            return "download failed";
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(false);           // a redirect could leave the update site
        c.setRequestProperty("User-Agent", "Offshore");
        if (c.getResponseCode() != 200) throw new java.io.IOException("HTTP " + c.getResponseCode());
        return c;
    }
}
