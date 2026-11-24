package app.offshore;

import android.content.Context;
import android.content.SharedPreferences;

import com.emc.ecs.nfsclient.nfs.io.Nfs3File;
import com.emc.ecs.nfsclient.nfs.io.NfsFileInputStream;
import com.emc.ecs.nfsclient.nfs.io.NfsFileOutputStream;
import com.emc.ecs.nfsclient.nfs.nfs3.Nfs3;
import com.emc.ecs.nfsclient.rpc.CredentialUnix;
import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.msfscc.FileAttributes;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.SmbConfig;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Network folder (Customize > Backgrounds > Network folder): a share on the user's NAS over SMB2/3 (smbj) or NFSv3
 * (nfs-client). The NAS decides what the TV may do: SMB with the user and password typed on the TV (a read-only user,
 * plus write on one folder to keep downloads there), NFS by allowing the TV's address on the export. The settings,
 * password included, live only in this app's private preferences, never in tv.json or the page's storage.
 * Paths given to these methods are relative to the chosen folder.
 */
final class Nas {
    final String type, host, share, folder, user, pass, domain;
    final int uid, gid;
    final boolean store;                 // keep downloaded background categories on the NAS instead of the TV

    private Nas(SharedPreferences p) {
        type = p.getString("type", "smb");
        host = p.getString("host", "");
        share = p.getString("share", "");
        folder = p.getString("folder", "");
        user = p.getString("user", "");
        pass = unseal(p.getString("passEnc", ""));
        domain = p.getString("domain", "");
        uid = p.getInt("uid", 1000);
        gid = p.getInt("gid", 1000);
        store = p.getBoolean("store", false);
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("nas", Context.MODE_PRIVATE); }

    static Nas load(Context c) {
        SharedPreferences p = prefs(c);
        return p.getString("host", "").isEmpty() ? null : new Nas(p);
    }

    /** Saves the page's settings; an empty password keeps the saved one (the page never gets it back). */
    static void save(Context c, JSONObject o) {
        SharedPreferences old = prefs(c);
        SharedPreferences.Editor e = old.edit();
        // A saved password only ever goes to the server it was typed for: a new host, share, user or domain drops it.
        for (String k : new String[]{"host", "share", "user", "domain"})
            if (!old.getString(k, "").equals(o.optString(k).trim())) { e.remove("passEnc"); break; }
        e.putString("type", "nfs".equals(o.optString("type")) ? "nfs" : "smb");
        e.putString("host", o.optString("host").trim());
        e.putString("share", o.optString("share").trim());
        e.putString("folder", o.optString("folder").trim().replace('\\', '/').replaceAll("^/+|/+$", ""));
        e.putString("user", o.optString("user").trim());
        e.putString("domain", o.optString("domain").trim());
        if (!o.optString("pass").isEmpty()) e.putString("passEnc", seal(o.optString("pass")));
        if (o.optBoolean("clearPass")) e.remove("passEnc");
        e.putInt("uid", o.optInt("uid", 1000));
        e.putInt("gid", o.optInt("gid", 1000));
        // NFS has no passwords (any device can claim the allowed user id), so the TV only reads from NFS shares; saving
        // to the NAS is for SMB, which has a login and encryption.
        e.putBoolean("store", o.optBoolean("store") && !"nfs".equals(o.optString("type")));
        e.apply();
        nfs = null;
    }

    static void forget(Context c) { prefs(c).edit().clear().apply(); nfs = null; }

    // The password is encrypted (AES-GCM) with a key kept in Android's keystore, which never lets the key itself out:
    // a copy of the app's files alone doesn't reveal it.
    private static final String KEY = "offshore-nas";

    private static javax.crypto.SecretKey key() throws Exception {
        java.security.KeyStore ks = java.security.KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY)) return ((java.security.KeyStore.SecretKeyEntry) ks.getEntry(KEY, null)).getSecretKey();
        javax.crypto.KeyGenerator g = javax.crypto.KeyGenerator.getInstance(android.security.keystore.KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new android.security.keystore.KeyGenParameterSpec.Builder(KEY,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT | android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return g.generateKey();
    }

    private static String seal(String plain) {
        try {
            javax.crypto.Cipher c = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            c.init(javax.crypto.Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV(), ct = c.doFinal(plain.getBytes("UTF-8")), all = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, all, 0, iv.length);
            System.arraycopy(ct, 0, all, iv.length, ct.length);
            return android.util.Base64.encodeToString(all, android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            android.util.Log.w("Offshore", "couldn't encrypt the network folder password: " + e);
            return "";                       // not saved rather than saved in the clear
        }
    }

    private static String unseal(String sealed) {
        if (sealed.isEmpty()) return "";
        try {
            byte[] all = android.util.Base64.decode(sealed, android.util.Base64.NO_WRAP);
            javax.crypto.Cipher c = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            c.init(javax.crypto.Cipher.DECRYPT_MODE, key(), new javax.crypto.spec.GCMParameterSpec(128, all, 0, 12));
            return new String(c.doFinal(all, 12, all.length - 12), "UTF-8");
        } catch (Exception e) {
            android.util.Log.w("Offshore", "couldn't read the network folder password: " + e);
            return "";
        }
    }

    /** The settings for the page, without the password. */
    static String describe(Context c) {
        Nas n = load(c);
        JSONObject o = new JSONObject();
        try {
            if (n != null) {
                o.put("type", n.type).put("host", n.host).put("share", n.share).put("folder", n.folder).put("user", n.user)
                 .put("domain", n.domain).put("hasPass", !n.pass.isEmpty()).put("uid", n.uid).put("gid", n.gid).put("store", n.store);
            }
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    // ---- File operations (each opens its own SMB connection; NFS keeps one client) -----------------------------------

    private interface SmbOp<T> { T run(DiskShare d) throws Exception; }

    private <T> T smb(SmbOp<T> op) throws Exception {
        // Bouncy Castle for NTLM (MD4) and SMB3 signing/encryption: Android's own crypto provider lacks MD4.
        SMBClient client = new SMBClient(SmbConfig.builder().withTimeout(20, TimeUnit.SECONDS).withSoTimeout(30, TimeUnit.SECONDS)
                .withSecurityProvider(new com.hierynomus.security.bc.BCSecurityProvider()).build());
        try (Connection c = client.connect(host)) {
            AuthenticationContext ac = user.isEmpty() ? AuthenticationContext.guest() : new AuthenticationContext(user, pass.toCharArray(), domain);
            Session s = c.authenticate(ac);
            try (DiskShare d = (DiskShare) s.connectShare(share)) {
                return op.run(d);
            }
        } finally {
            client.close();
        }
    }

    private static Nfs3 nfs;               // one client for the saved settings (its connections are pooled)

    private Nfs3 nfs3() throws IOException {
        if (nfs == null) nfs = new Nfs3(host, share.startsWith("/") ? share : "/" + share, new CredentialUnix(uid, gid, null), 2);
        return nfs;
    }

    private String smbPath(String rel) { return join(folder, rel).replace('/', '\\'); }

    private String nfsPath(String rel) { return "/" + join(folder, rel); }

    private static String join(String a, String b) {
        String s = (a == null ? "" : a) + "/" + (b == null ? "" : b);
        return s.replaceAll("/+", "/").replaceAll("^/|/$", "");
    }

    /** File names (not folders) in a folder, sorted. */
    List<String> list(final String rel) throws Exception {
        final List<String> out = new ArrayList<>();
        if ("nfs".equals(type)) {
            for (Nfs3File f : new Nfs3File(nfs3(), nfsPath(rel)).listFiles()) if (f.isFile()) out.add(f.getName());
        } else {
            smb(new SmbOp<Void>() {
                @Override
                public Void run(DiskShare d) {
                    for (FileIdBothDirectoryInformation f : d.list(smbPath(rel))) {
                        String n = f.getFileName();
                        if (n.equals(".") || n.equals("..") || (f.getFileAttributes() & FileAttributes.FILE_ATTRIBUTE_DIRECTORY.getValue()) != 0) continue;
                        out.add(n);
                    }
                    return null;
                }
            });
        }
        Collections.sort(out, String.CASE_INSENSITIVE_ORDER);
        return out;
    }

    byte[] read(final String rel) throws Exception {
        if ("nfs".equals(type)) {
            try (InputStream in = new NfsFileInputStream(new Nfs3File(nfs3(), nfsPath(rel)))) { return readAll(in); }
        }
        return smb(new SmbOp<byte[]>() {
            @Override
            public byte[] run(DiskShare d) throws Exception {
                try (com.hierynomus.smbj.share.File f = d.openFile(smbPath(rel), EnumSet.of(AccessMask.GENERIC_READ), null,
                        SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null); InputStream in = f.getInputStream()) {
                    return readAll(in);
                }
            }
        });
    }

    /** Copies a file to the NAS without loading it all into memory (received videos can be large). SMB only. */
    void writeFile(final String rel, final java.io.File src) throws Exception {
        if ("nfs".equals(type)) throw new IOException("NFS shares are read-only for this TV");
        smb(new SmbOp<Void>() {
            @Override
            public Void run(DiskShare d) throws Exception {
                String p = smbPath(rel), dir = "";
                String[] parts = p.split("\\\\");
                for (int i = 0; i < parts.length - 1; i++) {
                    dir = dir.isEmpty() ? parts[i] : dir + "\\" + parts[i];
                    if (!d.folderExists(dir)) d.mkdir(dir);
                }
                try (com.hierynomus.smbj.share.File f = d.openFile(p, EnumSet.of(AccessMask.GENERIC_WRITE), null,
                        SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OVERWRITE_IF, null);
                     OutputStream o = f.getOutputStream(); InputStream in = new java.io.FileInputStream(src)) {
                    byte[] buf = new byte[1 << 16];
                    for (int n; (n = in.read(buf)) > 0; ) o.write(buf, 0, n);
                }
                return null;
            }
        });
    }

    void write(final String rel, final byte[] data) throws Exception {
        if ("nfs".equals(type)) throw new IOException("NFS shares are read-only for this TV");
        if ("nfs".equals(type)) {
            Nfs3File f = new Nfs3File(nfs3(), nfsPath(rel));
            Nfs3File parent = f.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            if (!f.exists()) f.createNewFile();
            try (OutputStream o = new NfsFileOutputStream(f)) { o.write(data); }
            return;
        }
        smb(new SmbOp<Void>() {
            @Override
            public Void run(DiskShare d) throws Exception {
                String p = smbPath(rel), dir = "";
                String[] parts = p.split("\\\\");
                for (int i = 0; i < parts.length - 1; i++) {
                    dir = dir.isEmpty() ? parts[i] : dir + "\\" + parts[i];
                    if (!d.folderExists(dir)) d.mkdir(dir);
                }
                try (com.hierynomus.smbj.share.File f = d.openFile(p, EnumSet.of(AccessMask.GENERIC_WRITE), null,
                        SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OVERWRITE_IF, null); OutputStream o = f.getOutputStream()) {
                    o.write(data);
                }
                return null;
            }
        });
    }

    /** Deletes a folder and the files in it (only folders this app made: Offshore/<category>). */
    void deleteFolder(final String rel) throws Exception {
        if ("nfs".equals(type)) {
            Nfs3File dir = new Nfs3File(nfs3(), nfsPath(rel));
            if (!dir.exists()) return;
            for (Nfs3File f : dir.listFiles()) if (f.isFile()) f.delete();
            dir.delete();
            return;
        }
        smb(new SmbOp<Void>() {
            @Override
            public Void run(DiskShare d) {
                if (d.folderExists(smbPath(rel))) d.rmdir(smbPath(rel), true);
                return null;
            }
        });
    }

    // ---- Files > Network folder: browsing and moving files (SMB reads and writes as far as the NAS allows; NFS only
    // reads, as above). Paths come from the page: "..", "." and backslashes are refused. ----

    static final class Entry { String name; boolean dir; long size, mod; }

    /** A safe relative path ("" for the top), or null. */
    static String clean(String rel) {
        if (rel == null) return null;
        StringBuilder b = new StringBuilder();
        for (String s : rel.split("/")) {
            if (s.isEmpty()) continue;
            if (s.equals("..") || s.equals(".") || s.indexOf('\\') >= 0 || s.indexOf('\0') >= 0) return null;
            if (b.length() > 0) b.append('/');
            b.append(s);
        }
        return b.toString();
    }

    boolean writable() { return !"nfs".equals(type); }

    /** Folders and files in a folder (hidden ones left out). */
    List<Entry> entries(final String rel) throws Exception {
        final List<Entry> out = new ArrayList<>();
        if ("nfs".equals(type)) {
            for (Nfs3File f : new Nfs3File(nfs3(), nfsPath(rel)).listFiles()) {
                if (f.getName().startsWith(".")) continue;
                Entry e = new Entry(); e.name = f.getName(); e.dir = f.isDirectory(); e.size = e.dir ? 0 : f.length(); e.mod = f.lastModified();
                out.add(e);
            }
            return out;
        }
        smb(new SmbOp<Void>() {
            @Override
            public Void run(DiskShare d) {
                for (FileIdBothDirectoryInformation f : d.list(smbPath(rel))) {
                    String n = f.getFileName();
                    if (n.startsWith(".")) continue;
                    Entry e = new Entry(); e.name = n;
                    e.dir = (f.getFileAttributes() & FileAttributes.FILE_ATTRIBUTE_DIRECTORY.getValue()) != 0;
                    e.size = e.dir ? 0 : f.getEndOfFile(); e.mod = f.getLastWriteTime().toEpochMillis();
                    out.add(e);
                }
                return null;
            }
        });
        return out;
    }

    /** Copies a file or folder from the NAS to the TV. done[0] counts bytes; the TV's copy keeps the NAS's date. */
    void download(final String rel, final java.io.File to, final long[] done, final Files.Progress pr) throws Exception {
        if ("nfs".equals(type)) { nfsDown(new Nfs3File(nfs3(), nfsPath(rel)), to, done, pr); return; }
        smb(new SmbOp<Void>() {
            @Override public Void run(DiskShare d) throws Exception { smbDown(d, smbPath(rel), to, done, pr); return null; }
        });
    }

    private void smbDown(DiskShare d, String p, java.io.File to, long[] done, Files.Progress pr) throws Exception {
        if (d.folderExists(p)) {
            if (!to.mkdirs()) throw new IOException("can't make " + to);
            for (FileIdBothDirectoryInformation f : d.list(p)) {
                String n = f.getFileName();
                if (n.equals(".") || n.equals("..")) continue;
                smbDown(d, p.isEmpty() ? n : p + "\\" + n, new java.io.File(to, n), done, pr);
            }
            return;
        }
        try (com.hierynomus.smbj.share.File f = d.openFile(p, EnumSet.of(AccessMask.GENERIC_READ), null,
                SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null); InputStream in = f.getInputStream()) {
            pump(in, new java.io.FileOutputStream(to), done, pr);
            to.setLastModified(f.getFileInformation().getBasicInformation().getLastWriteTime().toEpochMillis());
        }
    }

    private void nfsDown(Nfs3File f, java.io.File to, long[] done, Files.Progress pr) throws Exception {
        if (f.isDirectory()) {
            if (!to.mkdirs()) throw new IOException("can't make " + to);
            for (Nfs3File k : f.listFiles()) nfsDown(k, new java.io.File(to, k.getName()), done, pr);
            return;
        }
        try (InputStream in = new NfsFileInputStream(f)) { pump(in, new java.io.FileOutputStream(to), done, pr); }
        to.setLastModified(f.lastModified());
    }

    /** Copies a file or folder from the TV into a NAS folder as `name` (SMB only). */
    void upload(final java.io.File from, final String dirRel, final String name, final long[] done, final Files.Progress pr) throws Exception {
        if (!writable()) throw new IOException("NFS shares are read-only for this TV");
        smb(new SmbOp<Void>() {
            @Override public Void run(DiskShare d) throws Exception { smbUp(d, from, join(smbPath(dirRel).replace('\\', '/'), name).replace('/', '\\'), done, pr); return null; }
        });
    }

    private void smbUp(DiskShare d, java.io.File from, String p, long[] done, Files.Progress pr) throws Exception {
        if (from.isDirectory()) {
            d.mkdir(p);
            java.io.File[] kids = from.listFiles();
            if (kids != null) for (java.io.File k : kids) smbUp(d, k, p + "\\" + k.getName(), done, pr);
            return;
        }
        try (com.hierynomus.smbj.share.File f = d.openFile(p, EnumSet.of(AccessMask.GENERIC_WRITE), null,
                SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_CREATE, null)) {
            pump(new java.io.FileInputStream(from), f.getOutputStream(), done, pr);
        }
    }

    private static void pump(InputStream in, OutputStream out, long[] done, Files.Progress pr) throws IOException {
        try (InputStream i = in; OutputStream o = out) {
            byte[] b = new byte[256 << 10];
            for (int n; (n = i.read(b)) > 0; ) {
                o.write(b, 0, n);
                done[0] += n;
                long now = android.os.SystemClock.uptimeMillis();
                if (now - done[1] > 500) { done[1] = now; pr.at(done[0], done[2]); }
            }
        }
    }

    /** Bytes in a file or folder on the NAS (for progress and the free-space check). */
    long size(final String rel) throws Exception {
        if ("nfs".equals(type)) return nfsSize(new Nfs3File(nfs3(), nfsPath(rel)));
        return smb(new SmbOp<Long>() {
            @Override public Long run(DiskShare d) { return smbSize(d, smbPath(rel)); }
        });
    }

    private long smbSize(DiskShare d, String p) {
        if (!d.folderExists(p)) return d.getFileInformation(p).getStandardInformation().getEndOfFile();
        long s = 0;
        for (FileIdBothDirectoryInformation f : d.list(p)) {
            String n = f.getFileName();
            if (n.equals(".") || n.equals("..")) continue;
            s += (f.getFileAttributes() & FileAttributes.FILE_ATTRIBUTE_DIRECTORY.getValue()) != 0 ? smbSize(d, p.isEmpty() ? n : p + "\\" + n) : f.getEndOfFile();
        }
        return s;
    }

    private long nfsSize(Nfs3File f) throws IOException {
        if (!f.isDirectory()) return f.length();
        long s = 0;
        for (Nfs3File k : f.listFiles()) s += nfsSize(k);
        return s;
    }

    /** The first free name in a NAS folder: "name", "name (2)", … */
    String freeName(final String dirRel, final String name) throws Exception {
        if ("nfs".equals(type)) return name;
        return smb(new SmbOp<String>() {
            @Override
            public String run(DiskShare d) {
                String dir = smbPath(dirRel), t = name;
                int dot = name.lastIndexOf('.');
                String base = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
                for (int i = 2; i < 1000; i++) {
                    String p = dir.isEmpty() ? t : dir + "\\" + t;
                    if (!d.fileExists(p) && !d.folderExists(p)) return t;
                    t = base + " (" + i + ")" + ext;
                }
                return t;
            }
        });
    }

    /** Deletes a file or a folder with everything in it (SMB; the NAS decides if this user may). */
    void remove(final String rel) throws Exception {
        if (!writable()) throw new IOException("NFS shares are read-only for this TV");
        if (rel.isEmpty()) throw new IOException("not the network folder itself");
        smb(new SmbOp<Void>() {
            @Override
            public Void run(DiskShare d) {
                String p = smbPath(rel);
                if (d.folderExists(p)) d.rmdir(p, true); else d.rm(p);
                return null;
            }
        });
    }

    /** Renames or moves within the share (SMB). False when something already has that name. */
    boolean rename(final String rel, final String toRel) throws Exception {
        if (!writable()) throw new IOException("NFS shares are read-only for this TV");
        if (rel.isEmpty()) throw new IOException("not the network folder itself");
        return smb(new SmbOp<Boolean>() {
            @Override
            public Boolean run(DiskShare d) {
                String to = smbPath(toRel);
                if (d.fileExists(to) || d.folderExists(to)) return false;
                try (com.hierynomus.smbj.share.DiskEntry e = d.open(smbPath(rel), EnumSet.of(AccessMask.DELETE, AccessMask.GENERIC_READ), null,
                        SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, null)) {
                    e.rename(to, false);
                }
                return true;
            }
        });
    }

    /** "SMB · media on 192.168.1.20" style name for the place. */
    String label() { return (share.isEmpty() ? host : share.replaceAll("^/+", "") + (folder.isEmpty() ? "" : "/" + folder)) + " on " + host; }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        for (int n; (n = in.read(buf)) > 0; ) {
            b.write(buf, 0, n);
            if (b.size() > 40 << 20) throw new IOException("file too large");   // photos only
        }
        return b.toByteArray();
    }
}
