package app.offshore;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Files > Open: hands one file to the app that opens it (a video player, a PDF reader). Not exported; an app can only
 * read a file Offshore granted it when opening it, read-only, and only inside Files' places (Files.inside).
 */
public class FileShare extends ContentProvider {

    static Uri uri(Context c, String path) {
        return new Uri.Builder().scheme("content").authority(c.getPackageName() + ".files").appendPath("f").appendPath(path).build();
    }

    private File file(Uri u) throws FileNotFoundException {
        String p = Files.viewable(getContext(), u.getLastPathSegment());
        if (p == null || !new File(p).isFile() || (Files.installer(p) && !Files.isUpdate(getContext(), p))) throw new FileNotFoundException();
        return new File(p);
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(u), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri u) {
        String m = Files.mime(u.getLastPathSegment() == null ? "" : u.getLastPathSegment());
        return m.isEmpty() ? "application/octet-stream" : m;
    }

    @Override
    public Cursor query(Uri u, String[] proj, String sel, String[] args, String sort) {
        try {
            File f = file(u);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (FileNotFoundException e) { return null; }
    }

    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
