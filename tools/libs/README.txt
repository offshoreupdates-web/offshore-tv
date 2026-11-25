Libraries built into Offshore (launcher\android\build.ps1). tools\setup_toolchain.ps1 downloads them from Maven
Central (https://repo1.maven.org/maven2/) and checks each against Maven Central's published SHA-1; NewPipe Extractor
and nanojson come from JitPack (https://jitpack.io/, built from the projects' own tags) and are checked against the
SHA-256 written in setup_toolchain.ps1. The jars aren't kept in the repository.

smbj-0.14.0.jar               SMB2/3 client (network folders)          Apache 2.0   com.hierynomus:smbj
asn-one-0.6.0.jar             used by smbj                             Apache 2.0   com.hierynomus:asn-one
mbassador-1.3.2.jar           used by smbj                             MIT          net.engio:mbassador
bcprov-jdk18on-1.80.jar       encryption (SMB3 sign-in, LocalSend TLS) MIT-style    org.bouncycastle:bcprov-jdk18on
nfs-client-1.1.0.jar          NFSv3 client (network folders)           Apache 2.0   com.emc.ecs:nfs-client
netty-3.10.6.Final.jar        used by nfs-client                       Apache 2.0   io.netty:netty
commons-lang3-3.12.0.jar      used by nfs-client                       Apache 2.0   org.apache.commons:commons-lang3
slf4j-api-1.7.36.jar          logging interface (no back-end: silent)  MIT          org.slf4j:slf4j-api
NewPipeExtractor-v0.27.1.jar  YouTube backgrounds                      GPLv3+       com.github.TeamNewPipe:NewPipeExtractor (JitPack)
nanojson-e9d656d....jar       used by NewPipe Extractor                Apache 2.0   com.github.TeamNewPipe:nanojson (JitPack)
jsoup-1.24.1.jar              used by NewPipe Extractor                MIT          org.jsoup:jsoup
rhino-1.8.1.jar               used by NewPipe Extractor                MPL 2.0      org.mozilla:rhino
protobuf-javalite-4.36.2.jar  used by NewPipe Extractor                BSD-3        com.google.protobuf:protobuf-javalite
jsr305-3.0.2.jar              used by NewPipe Extractor                Apache 2.0   com.google.code.findbugs:jsr305

Build tools in desugar\ next to libs\ (from Google's Maven repository, https://dl.google.com/dl/android/maven2/,
checked against its SHA-1): r8-9.5.33.jar (R8, the shrinker and dex compiler), desugar_jdk_libs_nio-2.1.5.jar and
desugar_jdk_libs_configuration_nio-2.1.5.jar (the Java library parts Fire OS lacks; GPLv2 with Classpath Exception,
built into the APK as its last dex file).

To update one: change its version in setup_toolchain.ps1 (and the SHA-256, for the JitPack ones), run it, rebuild, and
test on the TV: a network folder for the SMB and NFS libraries, a YouTube search and download for NewPipe Extractor.
YouTube changes its site often; when searches or downloads stop working, a newer NewPipe Extractor usually fixes it.
