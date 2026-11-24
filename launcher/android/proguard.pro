# R8 rules for build.ps1. The app's own code and the SMB / NFS / event libraries stay whole (they use reflection and
# annotations); R8 drops what nothing uses from Bouncy Castle and commons-lang3, which is most of their size.
# No renaming or optimizing: stack traces in logcat stay readable, and nothing is rewritten behind the libraries' backs.
-dontobfuscate
-dontoptimize
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions
-keep class app.offshore.** { *; }
-keep class com.hierynomus.** { *; }
-keep class net.engio.** { *; }
-keep class com.emc.ecs.nfsclient.** { *; }
-keep class org.jboss.netty.** { *; }
-keep class org.slf4j.** { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
# Optional parts the libraries reference but never need here (servlets, JMX, logging back-ends, javax.*).
-dontwarn **
