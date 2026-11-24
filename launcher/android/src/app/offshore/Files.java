package app.offshore;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Environment;
import android.os.StatFs;
import android.util.Log;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

/**
 * Files (the Files button on the bottom bar): how the TV's storage is used, and its folders, USB drives and files
 * received from phones, read-only for now. The TV's folders and USB drives need Android's storage permission. Every path the page asks for must be inside one of places()' roots, checked
 * on the canonical path, so "..", links and the app's own private files are out of reach. Hidden files are left out.
 */
final class Files {
    private static final String TAG = "Offshore";
    private static final int MAX_ITEMS = 3000;

    private Files() { }

    static boolean allowed(Context c) {
        return c.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    /** The roots the page may browse: [label, canonical path, kind]. Kind: tv, folder, usb, received. */
    static String[][] roots(Context c) {
        String[][] r = rawRoots(c);
        for (String[] x : r) try { x[1] = new File(x[1]).getCanonicalPath(); } catch (Exception ignored) { }   // /data/user/0 is a link
        return r;
    }

    private static String[][] rawRoots(Context c) {
        java.util.List<String[]> out = new java.util.ArrayList<>();
        File tv = Environment.getExternalStorageDirectory();
        out.add(new String[]{"This TV", tv.getAbsolutePath(), "tv"});
        for (String[] f : new String[][]{{"Downloads", Environment.DIRECTORY_DOWNLOADS}, {"Pictures", Environment.DIRECTORY_PICTURES},
                {"Movies", Environment.DIRECTORY_MOVIES}, {"Music", Environment.DIRECTORY_MUSIC}}) {
            File d = new File(tv, f[1]);
            if (d.isDirectory()) out.add(new String[]{f[0], d.getAbsolutePath(), "folder"});
        }
        File recv = new File(c.getFilesDir(), "received");
        out.add(new String[]{"From phones", recv.getAbsolutePath(), "received"});
        android.os.storage.StorageManager sm = (android.os.storage.StorageManager) c.getSystemService(Context.STORAGE_SERVICE);
        File[] vols = new File("/storage").listFiles();               // USB drives show up as /storage/<uuid>
        if (vols != null) for (File v : vols) {
            String n = v.getName();
            if (n.equals("emulated") || n.equals("self") || !v.isDirectory() || !v.canRead()) continue;
            String label = "USB drive";
            try {
                for (android.os.storage.StorageVolume sv : sm.getStorageVolumes())
                    if (n.equals(sv.getUuid())) { label = sv.getDescription(c); break; }
            } catch (Exception ignored) { }
            out.add(new String[]{label, v.getAbsolutePath(), "usb"});
        }
        return out.toArray(new String[0][]);
    }

    /** The canonical path when it's inside a root, else null. */
    static String inside(Context c, String path) {
        if (path == null || path.isEmpty()) return null;
        try {
            String p = new File(path).getCanonicalPath();
            for (String[] r : roots(c)) if (p.equals(r[1]) || p.startsWith(r[1] + "/")) return p;
        } catch (Exception ignored) { }
        return null;
    }

    /** {allowed, total, free, apps, images, video, audio, files, places:[{label, path, kind, total, free}]} in bytes. */
    static String storage(Context c) {
        JSONObject j = new JSONObject();
        try {
            j.put("allowed", allowed(c));
            File data = Environment.getDataDirectory();
            long total = data.getTotalSpace(), free = data.getUsableSpace();
            j.put("total", total).put("free", free);
            android.app.AppOpsManager ops = (android.app.AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
            boolean usage = ops.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), c.getPackageName())
                    == android.app.AppOpsManager.MODE_ALLOWED;
            if (usage) try {                                          // by kind, as Fire TV's own Storage screen counts it
                android.app.usage.StorageStatsManager ss = (android.app.usage.StorageStatsManager) c.getSystemService(Context.STORAGE_STATS_SERVICE);
                android.os.UserHandle me = android.os.Process.myUserHandle();
                android.app.usage.StorageStats st = ss.queryStatsForUser(android.os.storage.StorageManager.UUID_DEFAULT, me);
                android.app.usage.ExternalStorageStats ex = ss.queryExternalStatsForUser(android.os.storage.StorageManager.UUID_DEFAULT, me);
                j.put("apps", st.getAppBytes() + st.getDataBytes() + st.getCacheBytes());
                j.put("images", ex.getImageBytes()).put("video", ex.getVideoBytes()).put("audio", ex.getAudioBytes());
                j.put("files", Math.max(0, ex.getTotalBytes() - ex.getImageBytes() - ex.getVideoBytes() - ex.getAudioBytes()));
            } catch (Exception e) { Log.w(TAG, "storage by kind failed: " + e); }
            JSONArray places = new JSONArray();
            for (String[] r : roots(c)) {
                JSONObject p = new JSONObject().put("label", r[0]).put("path", r[1]).put("kind", r[2]);
                if (r[2].equals("usb")) try { StatFs fs = new StatFs(r[1]); p.put("total", fs.getTotalBytes()).put("free", fs.getAvailableBytes()); } catch (Exception ignored) { }
                if (r[2].equals("received")) p.put("size", LocalSend.size(new File(r[1])));
                places.put(p);
            }
            Nas n = Nas.load(c);                                      // the network folder from Settings, or a way to add one
            places.put(n != null ? new JSONObject().put("label", n.label()).put("path", NAS).put("kind", "nas").put("type", n.type).put("writable", n.writable())
                                 : new JSONObject().put("label", "Network folder").put("path", "").put("kind", "nasSetup"));
            j.put("places", places);
        } catch (Exception e) { Log.w(TAG, "storage failed: " + e); }
        return j.toString();
    }

    /** {ok, path, items:[{name, path, dir, size, mod, n, mime}]}; ok is false outside the roots or without access. */
    static String list(Context c, String path) {
        JSONObject j = new JSONObject();
        try {
            String p = inside(c, path);
            boolean own = p != null && p.startsWith(new File(c.getFilesDir(), "received").getCanonicalPath());
            if (p == null || (!own && !allowed(c))) return j.put("ok", false).toString();
            File[] kids = new File(p).listFiles();
            JSONArray items = new JSONArray();
            if (kids != null) for (File f : kids) {
                if (f.getName().startsWith(".")) continue;
                boolean dir = f.isDirectory();
                JSONObject it = new JSONObject().put("name", f.getName()).put("path", f.getAbsolutePath()).put("dir", dir).put("mod", f.lastModified());
                if (dir) { String[] n = f.list(); it.put("n", n == null ? 0 : n.length); }
                else it.put("size", f.length()).put("mime", mime(f.getName()));
                items.put(it);
                if (items.length() >= MAX_ITEMS) break;
            }
            j.put("ok", true).put("path", p).put("items", items).put("more", kids != null && kids.length > MAX_ITEMS);
        } catch (Exception e) { Log.w(TAG, "list failed: " + e); }
        return j.toString();
    }

    // ---- The network folder (phase 3): paths "nas:<folder/inside/it>" (Nas.clean checks them). Everything here
    // talks to the NAS, so it runs on a background thread (Home). ----

    static final String NAS = "nas:";

    static boolean isNas(String p) { return p != null && p.startsWith(NAS); }

    /** The path inside the network folder, or null when it isn't one (or isn't safe). */
    static String nasRel(String p) { return isNas(p) ? Nas.clean(p.substring(NAS.length())) : null; }

    static String nasList(Context c, String path) {
        JSONObject j = new JSONObject();
        try {
            Nas n = Nas.load(c);
            String rel = nasRel(path);
            if (n == null || rel == null) return j.put("ok", false).put("path", path).toString();
            JSONArray items = new JSONArray();
            for (Nas.Entry e : n.entries(rel)) {
                JSONObject it = new JSONObject().put("name", e.name).put("path", NAS + (rel.isEmpty() ? "" : rel + "/") + e.name).put("dir", e.dir).put("mod", e.mod);
                if (!e.dir) it.put("size", e.size).put("mime", mime(e.name));
                items.put(it);
                if (items.length() >= MAX_ITEMS) break;
            }
            j.put("ok", true).put("path", path).put("items", items);
        } catch (Exception e) {
            Log.w(TAG, "network folder list failed: " + e);
            try { j.put("ok", false).put("path", path).put("error", "Couldn't reach the network folder"); } catch (Exception ignored) { }
        }
        return j.toString();
    }

    /** Copies a network file to the TV's cache to show or hand to an app (only the latest one is kept). */
    static JSONObject nasFetch(Context c, String path, Progress pr) {
        JSONObject r = new JSONObject();
        try {
            Nas n = Nas.load(c);
            String rel = nasRel(path);
            if (n == null || rel == null || rel.isEmpty()) return r.put("ok", false);
            File dir = new File(c.getCacheDir(), "nas-view");
            int[] gone = {0};
            if (dir.exists()) wipe(dir, gone);
            if (!dir.mkdirs()) return r.put("ok", false);
            File to = new File(dir, rel.substring(rel.lastIndexOf('/') + 1));
            long[] done = {0, 0, n.size(rel)};
            if (done[2] > dir.getUsableSpace() - (200L << 20)) return r.put("ok", false).put("error", "space");
            n.download(rel, to, done, pr);
            return r.put("ok", true).put("path", to.getAbsolutePath()).put("name", to.getName()).put("mime", mime(to.getName()));
        } catch (Exception e) {
            Log.w(TAG, "network fetch failed: " + e);
            try { return r.put("ok", false); } catch (Exception ignored) { return r; }
        }
    }

    /** Where Files may hand a file to another app: inside a place, the copy fetched from the network folder, or the
     *  verified update (Updater) for Fire TV's installer. */
    static String viewable(Context c, String path) {
        String p = inside(c, path);
        if (p != null) return p;
        try {
            String q = new File(path).getCanonicalPath(), v = new File(c.getCacheDir(), "nas-view").getCanonicalPath();
            if (q.startsWith(v + "/")) return q;
            return isUpdate(c, q) ? q : null;
        } catch (Exception e) { return null; }
    }

    /** The one update file Updater verified (same app, same key, newer, matching fingerprint). */
    static boolean isUpdate(Context c, String path) {
        try { return new File(path).getCanonicalPath().equals(new File(new File(c.getCacheDir(), "update"), "offshore-update.apk").getCanonicalPath()); }
        catch (Exception e) { return false; }
    }

    /** Copies or moves when either side is the network folder. Same result as copy(). */
    static JSONObject copyNas(Context c, String src, String dstDir, boolean move, Progress pr) throws Exception {
        JSONObject r = new JSONObject();
        Nas n = Nas.load(c);
        if (n == null) return r.put("ok", false).put("error", "failed");
        String sRel = nasRel(src), dRel = nasRel(dstDir);
        if (isNas(src) && isNas(dstDir)) {                         // inside the share: a move is a rename; copies need a computer
            if (sRel == null || dRel == null || sRel.isEmpty()) return r.put("ok", false).put("error", "failed");
            if (!move) return r.put("ok", false).put("error", "nascopy");
            if (dRel.equals(sRel) || dRel.startsWith(sRel + "/")) return r.put("ok", false).put("error", "same");
            String name = sRel.substring(sRel.lastIndexOf('/') + 1), free = n.freeName(dRel, name);
            return r.put("ok", n.rename(sRel, dRel.isEmpty() ? free : dRel + "/" + free)).put("name", free);
        }
        if (isNas(src)) {                                          // network folder -> TV
            String d = inside(c, dstDir);
            if (sRel == null || sRel.isEmpty() || d == null) return r.put("ok", false).put("error", "failed");
            if (move && !n.writable()) return r.put("ok", false).put("error", "nfs");
            File to = free(new File(d), sRel.substring(sRel.lastIndexOf('/') + 1));
            r.put("name", to.getName());
            long[] done = {0, 0, n.size(sRel)};
            if (done[2] > new File(d).getUsableSpace()) return r.put("ok", false).put("error", "space");
            if (!new File(d).canWrite()) return r.put("ok", false).put("error", "readonly");
            try { n.download(sRel, to, done, pr); }
            catch (Exception e) { int[] k = {0}; wipe(to, k); throw e; }
            if (move) n.remove(sRel);
            return r.put("ok", true);
        }
        String s = inside(c, src);                                 // TV -> network folder
        if (s == null || dRel == null || (move && isRoot(c, s))) return r.put("ok", false).put("error", "failed");
        if (!n.writable()) return r.put("ok", false).put("error", "nfs");
        File from = new File(s);
        String name = n.freeName(dRel, from.getName());
        r.put("name", name);
        long[] done = {0, 0, size(from)};
        try { n.upload(from, dRel, name, done, pr); }
        catch (Exception e) { try { n.remove(dRel.isEmpty() ? name : dRel + "/" + name); } catch (Exception ignored) { } throw e; }   // no half copy left
        if (move) { int[] k = {0}; wipe(from, k); }
        return r.put("ok", true);
    }

    // ---- Managing files (phase 2). Every path is checked with inside(); a place itself is never renamed, moved or
    // deleted. App installers are never opened. ----

    static boolean isRoot(Context c, String p) {
        for (String[] r : roots(c)) if (r[1].equals(p)) return true;
        return false;
    }

    static boolean installer(String name) { return name.toLowerCase(java.util.Locale.US).matches(".*\\.(apk|apks|xapk|apkm)$"); }

    /** A name a person typed: no slashes, not hidden, not "." or "..", at most 120 characters. */
    static boolean goodName(String n) {
        return n != null && !n.trim().isEmpty() && n.length() <= 120 && n.indexOf('/') < 0 && n.indexOf('\0') < 0 && !n.startsWith(".");
    }

    /** "ok", "noapp" (nothing installed opens it), "installer" or "no". Another app gets read access to this one file. */
    static String open(Context c, String path) {
        String p = viewable(c, path);
        if (p == null || !new File(p).isFile()) return "no";
        if (installer(p)) return "installer";
        String m = mime(p);
        android.net.Uri u = FileShare.uri(c, p);
        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW).setDataAndType(u, m.isEmpty() ? "*/*" : m)
                .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        if (i.resolveActivity(c.getPackageManager()) == null) return "noapp";
        try { c.startActivity(i); Log.i(TAG, "files: opened " + new File(p).getName() + " (" + m + ")"); return "ok"; }
        catch (Exception e) { Log.w(TAG, "open failed: " + e); return "noapp"; }
    }

    /** The new path, or "" when it can't be renamed (or "exists"). */
    static String rename(Context c, String path, String name) {
        String p = inside(c, path);
        if (p == null || isRoot(c, p) || !goodName(name)) return "";
        File f = new File(p), to = new File(f.getParentFile(), name.trim());
        if (to.exists()) return "exists";
        if (inside(c, to.getAbsolutePath()) == null) return "";
        return f.renameTo(to) ? to.getAbsolutePath() : "";
    }

    /** How many files and folders were deleted, or -1. */
    static int delete(Context c, String path) {
        String p = inside(c, path);
        if (p == null || isRoot(c, p)) return -1;
        int[] n = {0};
        return wipe(new File(p), n) ? n[0] : (n[0] > 0 ? n[0] : -1);
    }

    private static boolean wipe(File f, int[] n) {
        boolean ok = true;
        if (f.isDirectory() && !isLink(f)) {                       // never follow a link out of the folder
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) ok &= wipe(k, n);
        }
        if (f.delete()) n[0]++; else ok = false;
        return ok;
    }

    private static boolean isLink(File f) {
        try { return !f.getCanonicalPath().equals(f.getAbsolutePath()); } catch (Exception e) { return true; }
    }

    interface Progress { void at(long done, long total); }

    /** Bytes in a file or folder (for progress). */
    static long size(File f) {
        if (!f.isDirectory()) return f.length();
        long s = 0; File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) if (!isLink(k)) s += size(k);
        return s;
    }

    /** "name", "name (2)", … : the first free one in the folder. */
    static File free(File dir, String name) {
        File t = new File(dir, name);
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; t.exists() && i < 1000; i++) t = new File(dir, base + " (" + i + ")" + ext);
        return t;
    }

    /**
     * Copies (or moves) a file or folder into a folder. Returns {ok, name, error}; error is "same" (into itself),
     * "space", "readonly" (USB drives are read-only to apps on Fire TV) or "failed". Runs on a background thread.
     */
    static JSONObject copy(Context c, String src, String dstDir, boolean move, Progress pr) {
        JSONObject r = new JSONObject();
        try {
            if (isNas(src) || isNas(dstDir)) return copyNas(c, src, dstDir, move, pr);
            String s = inside(c, src), d = inside(c, dstDir);
            if (s == null || d == null || !new File(d).isDirectory() || (move && isRoot(c, s))) return r.put("ok", false).put("error", "failed");
            if (d.equals(s) || d.startsWith(s + "/")) return r.put("ok", false).put("error", "same");
            File from = new File(s);
            if (move && from.getParent().equals(d)) return r.put("ok", true).put("name", from.getName());   // already there
            File to = free(new File(d), from.getName());
            r.put("name", to.getName());
            if (move && from.renameTo(to)) return r.put("ok", true);  // same drive: instant
            long total = size(from);
            if (total > new File(d).getUsableSpace()) return r.put("ok", false).put("error", "space");
            if (!new File(d).canWrite()) return r.put("ok", false).put("error", "readonly");
            long[] done = {0, 0};
            if (!copyTree(from, to, done, total, pr)) { int[] n = {0}; wipe(to, n); return r.put("ok", false).put("error", "failed"); }
            if (move) { int[] n = {0}; wipe(from, n); }
            return r.put("ok", true);
        } catch (Exception e) {
            Log.w(TAG, "copy failed: " + e);
            try { return r.put("ok", false).put("error", "failed"); } catch (Exception ignored) { return r; }
        }
    }

    private static boolean copyTree(File from, File to, long[] done, long total, Progress pr) {
        if (from.isDirectory()) {
            if (isLink(from) || !to.mkdirs()) return false;
            File[] kids = from.listFiles();
            if (kids != null) for (File k : kids) if (!copyTree(k, new File(to, k.getName()), done, total, pr)) return false;
            return true;
        }
        try (java.io.InputStream in = new java.io.FileInputStream(from); java.io.OutputStream out = new java.io.FileOutputStream(to)) {
            byte[] b = new byte[256 << 10];
            for (int n; (n = in.read(b)) > 0; ) {
                out.write(b, 0, n);
                done[0] += n;
                long now = android.os.SystemClock.uptimeMillis();
                if (now - done[1] > 500) { done[1] = now; pr.at(done[0], total); }
            }
        } catch (Exception e) { Log.w(TAG, "copy " + from.getName() + " failed: " + e); return false; }
        to.setLastModified(from.lastModified());                 // a copy keeps its date
        return true;
    }

    static String mime(String name) {
        int dot = name.lastIndexOf('.');
        String m = dot < 0 ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(java.util.Locale.US));
        return m == null ? "" : m;
    }
}
