package com.sambafilebrowser.smb

import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.hierynomus.smbj.SMBClient
import com.hierynomus.smbj.auth.AuthenticationContext
import com.hierynomus.smbj.connection.Connection
import com.hierynomus.smbj.session.Session
import com.hierynomus.smbj.share.DiskShare
import com.hierynomus.msfscc.FileAttributes
import com.hierynomus.mssmb2.SMB2ShareAccess
import com.hierynomus.mssmb2.SMB2CreateDisposition
import com.hierynomus.smbj.common.SMBRuntimeException
import com.hierynomus.protocol.commons.EnumWithValue
import com.hierynomus.msdtyp.AccessMask
import java.util.EnumSet
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Native module for SMB operations using SMBJ library.
 *
 * Key feature: startStreamProxy() spins up a local HTTP/1.1 server that proxies
 * SMB byte-range reads on demand. Media players receive an http://127.0.0.1 URL,
 * open instantly, and seek freely — no local file write needed.
 */
class SmbModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val executor: ExecutorService = Executors.newCachedThreadPool()

    // ── HTTP proxy state ─────────────────────────────────────────────────────
    data class ProxySession(
        val host: String,
        val shareName: String,
        val remotePath: String,
        val username: String,
        val password: String,
        val domain: String?,
        val fileSize: Long,
        val mimeType: String,
    )

    private val proxySessions = ConcurrentHashMap<String, ProxySession>()
    private var proxyServer: SmbProxyServer? = null

    // ── MIME helper ──────────────────────────────────────────────────────────
    private fun mimeForName(name: String): String {
        return when (name.substringAfterLast('.', "").lowercase()) {
            "mp4", "m4v"  -> "video/mp4"
            "mkv"         -> "video/x-matroska"
            "avi"         -> "video/x-msvideo"
            "mov"         -> "video/quicktime"
            "wmv"         -> "video/x-ms-wmv"
            "flv"         -> "video/x-flv"
            "webm"        -> "video/webm"
            "mp3"         -> "audio/mpeg"
            "m4a"         -> "audio/mp4"
            "aac"         -> "audio/aac"
            "ogg"         -> "audio/ogg"
            "flac"        -> "audio/flac"
            "wav"         -> "audio/wav"
            "wma"         -> "audio/x-ms-wma"
            "pdf"         -> "application/pdf"
            "jpg", "jpeg" -> "image/jpeg"
            "png"         -> "image/png"
            "gif"         -> "image/gif"
            "webp"        -> "image/webp"
            else          -> "application/octet-stream"
        }
    }

    // ── Inner HTTP proxy server ──────────────────────────────────────────────
    // Listens on a loopback port. Each incoming GET/HEAD request:
    //   1. Looks up the ProxySession by URL token
    //   2. Opens a fresh SMB connection
    //   3. Seeks to Range start via smbFile.getInputStream(offset)
    //   4. Pipes exactly `length` bytes back to the HTTP client
    // Multiple concurrent range requests work fine because each gets its own
    // SMB connection. This is how ExoPlayer/MX Player prefetch + seek works.
    // ────────────────────────────────────────────────────────────────────────
    inner class SmbProxyServer(port: Int) {
        private val serverSocket = ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"))
        val boundPort: Int get() = serverSocket.localPort
        @Volatile private var running = true

        init { executor.execute { acceptLoop() } }

        private fun acceptLoop() {
            while (running) {
                try {
                    val client = serverSocket.accept()
                    executor.execute { handleClient(client) }
                } catch (_: Exception) { }
            }
        }

        private fun handleClient(socket: Socket) {
            socket.soTimeout = 60_000
            try {
                val input  = BufferedReader(InputStreamReader(socket.getInputStream()))
                val output = socket.getOutputStream()

                val requestLine = input.readLine() ?: return
                val parts = requestLine.trim().split(" ")
                if (parts.size < 2) return
                val method = parts[0].uppercase()
                val token  = parts[1].trimStart('/')

                // Drain remaining headers
                val headers = mutableMapOf<String, String>()
                var line = input.readLine()
                while (line != null && line.isNotEmpty()) {
                    val idx = line.indexOf(':')
                    if (idx > 0) headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
                    line = input.readLine()
                }

                val session = proxySessions[token]
                if (session == null) { send404(output); return }

                val (rangeStart, rangeEnd) = parseRange(headers["range"], session.fileSize)

                if (method == "HEAD") {
                    writeHeaders(output, session, rangeStart, rangeEnd)
                    return
                }

                // Fresh SMB connection for this range request
                var conn:  Connection? = null
                var sess:  Session?    = null
                var share: DiskShare?  = null
                try {
                    val client2 = SMBClient()
                    conn  = client2.connect(session.host)
                    val auth = if (!session.domain.isNullOrEmpty())
                        AuthenticationContext(session.username, session.password.toCharArray(), session.domain)
                    else
                        AuthenticationContext(session.username, session.password.toCharArray(), null)
                    sess  = conn.authenticate(auth)
                    share = sess.connectShare(session.shareName) as DiskShare

                    val smbFile = share.openFile(
                        session.remotePath,
                        EnumSet.of(AccessMask.GENERIC_READ),
                        null,
                        EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                        SMB2CreateDisposition.FILE_OPEN,
                        null
                    )

                    writeHeaders(output, session, rangeStart, rangeEnd)

                    // SMBJ File.read(buffer, fileOffset, bufferOffset, length) reads
                    // from an arbitrary byte offset — this is what enables seeking.
                    val buf = ByteArray(131072) // 128 KB pipe buffer
                    var fileOffset = rangeStart
                    var remaining = rangeEnd - rangeStart + 1
                    while (remaining > 0) {
                        val toRead = minOf(buf.size.toLong(), remaining).toInt()
                        val read = smbFile.read(buf, fileOffset, 0, toRead)
                        if (read == -1) break
                        output.write(buf, 0, read)
                        fileOffset += read
                        remaining  -= read
                    }
                    output.flush()
                    smbFile.close()
                } finally {
                    try { share?.close(); sess?.close(); conn?.close() } catch (_: Exception) { }
                }
            } catch (_: Exception) {
                // Client disconnected or seek error — not fatal
            } finally {
                try { socket.close() } catch (_: Exception) { }
            }
        }

        private fun parseRange(header: String?, fileSize: Long): Pair<Long, Long> {
            if (header != null && header.startsWith("bytes=")) {
                val r   = header.removePrefix("bytes=").split("-")
                val s   = r[0].toLongOrNull() ?: 0L
                val e   = if (r.size > 1 && r[1].isNotEmpty()) r[1].toLongOrNull() ?: (fileSize - 1) else (fileSize - 1)
                return Pair(s.coerceIn(0, fileSize - 1), e.coerceIn(0, fileSize - 1))
            }
            return Pair(0L, fileSize - 1)
        }

        private fun writeHeaders(output: OutputStream, session: ProxySession, start: Long, end: Long) {
            val len       = end - start + 1
            val partial   = start > 0 || end < session.fileSize - 1
            val status    = if (partial) "HTTP/1.1 206 Partial Content" else "HTTP/1.1 200 OK"
            val sb = StringBuilder()
            sb.append("$status\r\n")
            sb.append("Content-Type: ${session.mimeType}\r\n")
            sb.append("Content-Length: $len\r\n")
            sb.append("Accept-Ranges: bytes\r\n")
            sb.append("Content-Range: bytes $start-$end/${session.fileSize}\r\n")
            sb.append("Connection: close\r\n")
            sb.append("\r\n")
            output.write(sb.toString().toByteArray(Charsets.US_ASCII))
            output.flush()
        }

        private fun send404(output: OutputStream) {
            output.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            output.flush()
        }

        fun stop() {
            running = false
            try { serverSocket.close() } catch (_: Exception) { }
        }
    }

    @Synchronized
    private fun ensureProxyServer(): Int {
        val existing = proxyServer
        if (existing != null) return existing.boundPort
        val server = SmbProxyServer(0) // OS picks a free port
        proxyServer = server
        return server.boundPort
    }

    override fun getName(): String = "SmbModule"

    // ── startStreamProxy ────────────────────────────────────────────────────
    /**
     * Resolves immediately with "http://127.0.0.1:PORT/TOKEN".
     * Pass this URL directly to FileViewer / Intent. The proxy handles
     * all byte-range requests from the media player on demand.
     * No local file is written. Seeking works instantly.
     */
    @ReactMethod
    fun startStreamProxy(
        host: String,
        shareName: String,
        remotePath: String,
        username: String,
        password: String,
        domain: String?,
        fileName: String,
        promise: Promise
    ) {
        executor.execute {
            try {
                // Quick connection just to read file size
                val client = SMBClient()
                val conn   = client.connect(host)
                val auth   = if (!domain.isNullOrEmpty())
                    AuthenticationContext(username, password.toCharArray(), domain)
                else
                    AuthenticationContext(username, password.toCharArray(), null)
                val sess   = conn.authenticate(auth)
                val share  = sess.connectShare(shareName) as DiskShare
                val f      = share.openFile(
                    remotePath,
                    EnumSet.of(AccessMask.GENERIC_READ),
                    null,
                    EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                    SMB2CreateDisposition.FILE_OPEN,
                    null
                )
                val fileSize = f.fileInformation.standardInformation.endOfFile
                f.close(); share.close(); sess.close(); conn.close()

                val port  = ensureProxyServer()
                val token = "t${System.currentTimeMillis()}_${Math.abs(remotePath.hashCode())}"
                proxySessions[token] = ProxySession(
                    host, shareName, remotePath, username, password, domain,
                    fileSize, mimeForName(fileName)
                )
                promise.resolve("http://127.0.0.1:$port/$token")
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB error: ${e.message}", e)
            } catch (e: SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Auth failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Error: ${e.message}", e)
            }
        }
    }

    /** Call when the user closes the player to clean up the proxy session. */
    @ReactMethod
    fun stopStreamProxy(token: String, promise: Promise) {
        proxySessions.remove(token)
        promise.resolve(true)
    }

    /**
     * Opens an http:// (proxy) URL in an external app via ACTION_VIEW.
     * FileProvider-based openers (react-native-file-viewer) only handle local
     * file paths, so streaming URLs must be launched through an intent.
     */
    @ReactMethod
    fun openUrl(url: String, fileName: String, promise: Promise) {
        try {
            val mime = mimeForName(fileName)
            val view = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(url), mime)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(view, "Open with").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_ERROR", "No app found to open this file: ${e.message}", e)
        }
    }

    // ── listFiles ────────────────────────────────────────────────────────────
    @ReactMethod
    fun listFiles(
        host: String,
        shareName: String,
        folderPath: String,
        username: String,
        password: String,
        domain: String?,
        promise: Promise
    ) {
        executor.execute {
            var connection: Connection? = null
            var session: Session? = null
            var share: DiskShare? = null
            try {
                val smbPath = if (folderPath.isEmpty()) "" else folderPath
                val client = SMBClient()
                connection = client.connect(host)
                val authContext = if (domain != null && domain.isNotEmpty())
                    AuthenticationContext(username, password.toCharArray(), domain)
                else
                    AuthenticationContext(username, password.toCharArray(), null)
                session = connection.authenticate(authContext)
                share = session.connectShare(shareName) as DiskShare

                val fileList = share.list(smbPath)
                val result: WritableArray = Arguments.createArray()
                for (fileInfo in fileList) {
                    val fileName = fileInfo.fileName
                    if (fileName == "." || fileName == "..") continue
                    val fileItem: WritableMap = Arguments.createMap()
                    fileItem.putString("name", fileName)
                    val isDirectory = EnumWithValue.EnumUtils.isSet(fileInfo.fileAttributes, FileAttributes.FILE_ATTRIBUTE_DIRECTORY)
                    fileItem.putString("type", if (isDirectory) "directory" else "file")
                    fileItem.putDouble("size", fileInfo.endOfFile.toDouble())
                    val fullPath = if (smbPath.isEmpty()) fileName else "$smbPath/$fileName"
                    fileItem.putString("path", fullPath)
                    result.pushMap(fileItem)
                }
                promise.resolve(result)
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try { share?.close(); session?.close(); connection?.close() } catch (_: Exception) { }
            }
        }
    }

    // ── downloadFile ─────────────────────────────────────────────────────────
    @ReactMethod
    fun downloadFile(
        host: String,
        shareName: String,
        remotePath: String,
        username: String,
        password: String,
        domain: String?,
        localFileName: String,
        promise: Promise
    ) {
        executor.execute {
            var connection: Connection? = null
            var session: Session? = null
            var share: DiskShare? = null
            try {
                val storageDir = reactApplicationContext.getExternalFilesDir(null) ?: reactApplicationContext.filesDir
                if (!storageDir.exists()) storageDir.mkdirs()

                var finalFileName = localFileName
                var localFile = File(storageDir, finalFileName)
                var counter = 1
                while (localFile.exists()) {
                    val nameParts = localFileName.split(".")
                    finalFileName = if (nameParts.size > 1)
                        "${nameParts.dropLast(1).joinToString(".")}_$counter.${nameParts.last()}"
                    else "${localFileName}_$counter"
                    localFile = File(storageDir, finalFileName)
                    counter++
                }

                val client = SMBClient()
                connection = client.connect(host)
                val authContext = if (domain != null && domain.isNotEmpty())
                    AuthenticationContext(username, password.toCharArray(), domain)
                else
                    AuthenticationContext(username, password.toCharArray(), null)
                session = connection.authenticate(authContext)
                share = session.connectShare(shareName) as DiskShare

                val smbFile = share.openFile(remotePath, EnumSet.of(AccessMask.GENERIC_READ), null,
                    EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ), SMB2CreateDisposition.FILE_OPEN, null)
                val inputStream = smbFile.inputStream
                val outputStream = FileOutputStream(localFile)
                val buffer = ByteArray(65536)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) outputStream.write(buffer, 0, bytesRead)
                outputStream.close(); inputStream.close(); smbFile.close()
                promise.resolve(localFile.absolutePath)
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try { share?.close(); session?.close(); connection?.close() } catch (_: Exception) { }
            }
        }
    }

    // ── downloadFileToPath ───────────────────────────────────────────────────
    @ReactMethod
    fun downloadFileToPath(
        host: String,
        shareName: String,
        remotePath: String,
        username: String,
        password: String,
        domain: String?,
        localFilePath: String,
        promise: Promise
    ) {
        executor.execute {
            var connection: Connection? = null
            var session: Session? = null
            var share: DiskShare? = null
            try {
                val localFile = File(localFilePath)
                localFile.parentFile?.let { if (!it.exists()) it.mkdirs() }

                val client = SMBClient()
                connection = client.connect(host)
                val authContext = if (domain != null && domain.isNotEmpty())
                    AuthenticationContext(username, password.toCharArray(), domain)
                else
                    AuthenticationContext(username, password.toCharArray(), null)
                session = connection.authenticate(authContext)
                share = session.connectShare(shareName) as DiskShare

                val smbFile = share.openFile(remotePath, EnumSet.of(AccessMask.GENERIC_READ), null,
                    EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ), SMB2CreateDisposition.FILE_OPEN, null)
                val inputStream = smbFile.inputStream
                val outputStream = FileOutputStream(localFile)
                val buffer = ByteArray(65536)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) outputStream.write(buffer, 0, bytesRead)
                outputStream.close(); inputStream.close(); smbFile.close()
                promise.resolve(localFile.absolutePath)
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try { share?.close(); session?.close(); connection?.close() } catch (_: Exception) { }
            }
        }
    }

    // ── downloadFileWithProgress ─────────────────────────────────────────────
    @ReactMethod
    fun downloadFileWithProgress(
        host: String,
        shareName: String,
        remotePath: String,
        username: String,
        password: String,
        domain: String?,
        localFileName: String,
        downloadId: String,
        promise: Promise
    ) {
        executor.execute {
            var connection: Connection? = null
            var session: Session? = null
            var share: DiskShare? = null
            try {
                val storageDir = reactApplicationContext.getExternalFilesDir(null) ?: reactApplicationContext.filesDir
                if (!storageDir.exists()) storageDir.mkdirs()

                var finalFileName = localFileName
                var localFile = File(storageDir, finalFileName)
                var counter = 1
                while (localFile.exists()) {
                    val nameParts = localFileName.split(".")
                    finalFileName = if (nameParts.size > 1)
                        "${nameParts.dropLast(1).joinToString(".")}_$counter.${nameParts.last()}"
                    else "${localFileName}_$counter"
                    localFile = File(storageDir, finalFileName)
                    counter++
                }

                val client = SMBClient()
                connection = client.connect(host)
                val authContext = if (domain != null && domain.isNotEmpty())
                    AuthenticationContext(username, password.toCharArray(), domain)
                else
                    AuthenticationContext(username, password.toCharArray(), null)
                session = connection.authenticate(authContext)
                share = session.connectShare(shareName) as DiskShare

                val smbFile = share.openFile(remotePath, EnumSet.of(AccessMask.GENERIC_READ), null,
                    EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ), SMB2CreateDisposition.FILE_OPEN, null)
                val fileSize = smbFile.fileInformation.standardInformation.endOfFile
                val inputStream = smbFile.inputStream
                val outputStream = FileOutputStream(localFile)
                val buffer = ByteArray(65536)
                var bytesRead: Int
                var totalBytesRead: Long = 0
                var lastEmitTime: Long = 0

                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    totalBytesRead += bytesRead
                    val now = System.currentTimeMillis()
                    if (now - lastEmitTime >= 200) {
                        lastEmitTime = now
                        val params = Arguments.createMap()
                        params.putString("downloadId", downloadId)
                        params.putDouble("downloadedBytes", totalBytesRead.toDouble())
                        params.putDouble("totalBytes", fileSize.toDouble())
                        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("downloadProgress", params)
                    }
                }
                outputStream.flush(); outputStream.close(); inputStream.close(); smbFile.close()

                val finalParams = Arguments.createMap()
                finalParams.putString("downloadId", downloadId)
                finalParams.putDouble("downloadedBytes", totalBytesRead.toDouble())
                finalParams.putDouble("totalBytes", fileSize.toDouble())
                reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("downloadProgress", finalParams)

                promise.resolve(localFile.absolutePath)
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try { share?.close(); session?.close(); connection?.close() } catch (_: Exception) { }
            }
        }
    }

    // ── deleteFile ───────────────────────────────────────────────────────────
    @ReactMethod
    fun deleteFile(localFilePath: String, promise: Promise) {
        executor.execute {
            try {
                val file = File(localFilePath)
                if (file.exists()) file.delete()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("DELETE_ERROR", "Failed to delete file: ${e.message}", e)
            }
        }
    }

    // ── scanNetwork ──────────────────────────────────────────────────────────
    @ReactMethod
    fun scanNetwork(promise: Promise) {
        executor.execute {
            try {
                val subnet = getLocalSubnet()
                if (subnet == null) {
                    promise.reject("NETWORK_ERROR", "Could not determine local network subnet")
                    return@execute
                }
                val foundServers = CopyOnWriteArrayList<WritableMap>()
                val scanPool = Executors.newFixedThreadPool(50)
                val latch = CountDownLatch(254)
                for (i in 1..254) {
                    val targetIp = "$subnet.$i"
                    scanPool.execute {
                        try {
                            val socket = Socket()
                            socket.connect(InetSocketAddress(targetIp, 445), 300)
                            socket.close()
                            val serverInfo: WritableMap = Arguments.createMap()
                            serverInfo.putString("ip", targetIp)
                            try {
                                val addr = InetAddress.getByName(targetIp)
                                val hostname = addr.canonicalHostName
                                serverInfo.putString("hostname", if (hostname != targetIp) hostname else "")
                            } catch (_: Exception) {
                                serverInfo.putString("hostname", "")
                            }
                            foundServers.add(serverInfo)
                        } catch (_: Exception) {
                        } finally {
                            latch.countDown()
                        }
                    }
                }
                latch.await(10, TimeUnit.SECONDS)
                scanPool.shutdownNow()
                val result: WritableArray = Arguments.createArray()
                for (server in foundServers) result.pushMap(server)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("SCAN_ERROR", "Network scan failed: ${e.message}", e)
            }
        }
    }

    private fun getLocalSubnet(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                if (networkInterface.isLoopback || !networkInterface.isUp) continue
                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    val hostAddress = addr.hostAddress ?: continue
                    if (hostAddress.contains(":") || hostAddress.startsWith("127.")) continue
                    val parts = hostAddress.split(".")
                    if (parts.size == 4) return "${parts[0]}.${parts[1]}.${parts[2]}"
                }
            }
        } catch (_: Exception) { }
        return null
    }
}
