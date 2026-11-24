package app.offshore;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * How a computer hands this TV its files on Fire OS 8 (Android 11), where adb can no longer write into the app's folder
 * (tools\push_config.ps1 does this for tv.json):
 *   adb push tv.json /data/local/tmp/x && adb shell "content write --uri content://<package>.config/tv.json < /data/local/tmp/x"
 * Only these names are accepted (tv.json, sync.json, alert_test.json, tidy.json, tidy_done.json), in the app's own folder.
 * Guarded by android.permission.DUMP, which only the adb shell and the system hold, so other apps can't use it.
 */
public class ConfigDrop extends ContentProvider {
    // tidy.json: the owner's Tidy up choice (setup_tv.ps1 reads it); tidy_done.json: what setup_tv.ps1 switched off.
    private static final String[] NAMES = {"tv.json", "sync.json", "alert_test.json", "tidy.json", "tidy_done.json"};

    private File file(Uri u) throws FileNotFoundException {
        String n = u.getLastPathSegment();
        for (String ok : NAMES) if (ok.equals(n)) return new File(getContext().getExternalFilesDir(null), n);
        throw new FileNotFoundException("not accepted: " + n);
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        File f = file(u);
        if (mode.contains("w")) {
            android.util.Log.i("Offshore", "config from the computer: " + f.getName());
            return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE);
        }
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri u) { return "application/json"; }
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
