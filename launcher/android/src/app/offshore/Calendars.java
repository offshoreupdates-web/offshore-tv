package app.offshore;

import android.net.Uri;

/**
 * Calendar links (Customize > Calendar): which services' iCal (ICS) links the TV will read. Every host the app contacts
 * is on a fixed list; calendars are the one place where the exact host varies (iCloud uses p01..p99-caldav.icloud.com),
 * so this matches by service domain.
 */
final class Calendars {
    private static final String[] SERVICES = {
        "calendar.google.com",                                  // Google Calendar ("Secret address in iCal format", public calendars)
        "icloud.com",                                           // Apple iCloud public calendars (pNN-caldav.icloud.com)
        "outlook.live.com", "outlook.office365.com", "outlook.office.com",   // Outlook.com and Microsoft 365 published calendars
        "calendar.proton.me",                                   // Proton Calendar share links
        "calendar.yahoo.com", "export.calendar.yahoo.com",      // Yahoo
        "fastmail.com", "user.fm",                              // Fastmail
        "calendar.zoho.com",                                    // Zoho
        "ics.teamup.com", "teamsnap.com", "sportsengine.com"    // team and family calendars that publish iCal links
    };

    private Calendars() { }

    static boolean allowed(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost();
            if (!"https".equals(u.getScheme()) || host == null || url.length() > 2000) return false;
            host = host.toLowerCase(java.util.Locale.US);
            for (String s : SERVICES) if (host.equals(s) || host.endsWith("." + s)) return true;
        } catch (Exception ignored) { }
        return false;
    }
}
