Libraries built into Offshore (launcher\android\build.ps1). tools\setup_toolchain.ps1 downloads them from Maven
Central (https://repo1.maven.org/maven2/) and checks each against Maven Central's published SHA-1. The jars aren't
kept in the repository.

smbj-0.14.0.jar               SMB2/3 client (network folders)          Apache 2.0   com.hierynomus:smbj
asn-one-0.6.0.jar             used by smbj                             Apache 2.0   com.hierynomus:asn-one
mbassador-1.3.2.jar           used by smbj                             MIT          net.engio:mbassador
bcprov-jdk18on-1.80.jar       encryption (SMB3 sign-in, LocalSend TLS) MIT-style    org.bouncycastle:bcprov-jdk18on
nfs-client-1.1.0.jar          NFSv3 client (network folders)           Apache 2.0   com.emc.ecs:nfs-client
netty-3.10.6.Final.jar        used by nfs-client                       Apache 2.0   io.netty:netty
commons-lang3-3.12.0.jar      used by nfs-client                       Apache 2.0   org.apache.commons:commons-lang3
slf4j-api-1.7.36.jar          logging interface (no back-end: silent)  MIT          org.slf4j:slf4j-api

To update one: download the new jar and its .sha1 from Maven Central, compare, replace the file here, rebuild, and test
a network folder on the TV.
