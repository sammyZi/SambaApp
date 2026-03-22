package com.sambafilebrowser.smb

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
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

/**
 * Native module for SMB operations using SMBJ library
 * Provides listFiles and downloadFile methods for React Native
 */
class SmbModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private val executor: ExecutorService = Executors.newCachedThreadPool()
    
    override fun getName(): String {
        return "SmbModule"
    }
    
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
                // Construct SMB path
                val smbPath = if (folderPath.isEmpty()) "" else folderPath
                
                // Create SMB client and connect
                val client = SMBClient()
                connection = client.connect(host)
                
                // Authenticate
                val authContext = if (domain != null && domain.isNotEmpty()) {
                    AuthenticationContext(username, password.toCharArray(), domain)
                } else {
                    AuthenticationContext(username, password.toCharArray(), null)
                }
                session = connection.authenticate(authContext)
                
                // Connect to share
                share = session.connectShare(shareName) as DiskShare
                
                // List directory contents
                val fileList = share.list(smbPath)
                
                // Build result array
                val result: WritableArray = Arguments.createArray()
                
                for (fileInfo in fileList) {
                    val fileName = fileInfo.fileName
                    
                    // Filter out "." and ".." entries
                    if (fileName == "." || fileName == "..") {
                        continue
                    }
                    
                    val fileItem: WritableMap = Arguments.createMap()
                    fileItem.putString("name", fileName)
                    
                    // Check if it's a directory using FileAttributes
                    val isDirectory = EnumWithValue.EnumUtils.isSet(
                        fileInfo.fileAttributes,
                        FileAttributes.FILE_ATTRIBUTE_DIRECTORY
                    )
                    fileItem.putString("type", if (isDirectory) "directory" else "file")
                    fileItem.putDouble("size", fileInfo.endOfFile.toDouble())
                    
                    // Construct full path
                    val fullPath = if (smbPath.isEmpty()) {
                        fileName
                    } else {
                        "$smbPath/$fileName"
                    }
                    fileItem.putString("path", fullPath)
                    
                    result.pushMap(fileItem)
                }
                
                promise.resolve(result)
                
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: com.hierynomus.smbj.common.SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try {
                    share?.close()
                    session?.close()
                    connection?.close()
                } catch (e: Exception) {
                    // Ignore cleanup errors
                }
            }
        }
    }
    
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
                // Get app-specific storage directory
                val storageDir = reactApplicationContext.getExternalFilesDir(null)
                    ?: reactApplicationContext.filesDir
                
                // Create storage directory if it doesn't exist
                if (!storageDir.exists()) {
                    storageDir.mkdirs()
                }
                
                // Check for file name conflicts and generate unique name if needed
                var finalFileName = localFileName
                var localFile = File(storageDir, finalFileName)
                var counter = 1
                
                while (localFile.exists()) {
                    val nameParts = localFileName.split(".")
                    finalFileName = if (nameParts.size > 1) {
                        val name = nameParts.dropLast(1).joinToString(".")
                        val extension = nameParts.last()
                        "${name}_${counter}.${extension}"
                    } else {
                        "${localFileName}_${counter}"
                    }
                    localFile = File(storageDir, finalFileName)
                    counter++
                }
                
                // Create SMB client and connect
                val client = SMBClient()
                connection = client.connect(host)
                
                // Authenticate
                val authContext = if (domain != null && domain.isNotEmpty()) {
                    AuthenticationContext(username, password.toCharArray(), domain)
                } else {
                    AuthenticationContext(username, password.toCharArray(), null)
                }
                session = connection.authenticate(authContext)
                
                // Connect to share
                share = session.connectShare(shareName) as DiskShare
                
                // Open remote file and stream to local storage
                val smbFile = share.openFile(
                    remotePath,
                    EnumSet.of(AccessMask.GENERIC_READ),
                    null,
                    EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                    SMB2CreateDisposition.FILE_OPEN,
                    null
                )
                
                // Stream file data in 8KB chunks
                val inputStream = smbFile.inputStream
                val outputStream = FileOutputStream(localFile)
                val buffer = ByteArray(8192)
                var bytesRead: Int
                
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
                
                outputStream.close()
                inputStream.close()
                smbFile.close()
                
                // Return absolute local file path
                promise.resolve(localFile.absolutePath)
                
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: com.hierynomus.smbj.common.SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try {
                    share?.close()
                    session?.close()
                    connection?.close()
                } catch (e: Exception) {
                    // Ignore cleanup errors
                }
            }
        }
    }

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
                
                // Create parent directory if it doesn't exist
                localFile.parentFile?.let { parentDir ->
                    if (!parentDir.exists()) {
                        parentDir.mkdirs()
                    }
                }
                
                // Create SMB client and connect
                val client = SMBClient()
                connection = client.connect(host)
                
                // Authenticate
                val authContext = if (domain != null && domain.isNotEmpty()) {
                    AuthenticationContext(username, password.toCharArray(), domain)
                } else {
                    AuthenticationContext(username, password.toCharArray(), null)
                }
                session = connection.authenticate(authContext)
                
                // Connect to share
                share = session.connectShare(shareName) as DiskShare
                
                // Open remote file and stream to local storage
                val smbFile = share.openFile(
                    remotePath,
                    EnumSet.of(AccessMask.GENERIC_READ),
                    null,
                    EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                    SMB2CreateDisposition.FILE_OPEN,
                    null
                )
                
                // Stream file data in 8KB chunks
                val inputStream = smbFile.inputStream
                val outputStream = FileOutputStream(localFile)
                val buffer = ByteArray(8192)
                var bytesRead: Int
                
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
                
                outputStream.close()
                inputStream.close()
                smbFile.close()
                
                // Return absolute local file path
                promise.resolve(localFile.absolutePath)
                
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: com.hierynomus.smbj.common.SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try {
                    share?.close()
                    session?.close()
                    connection?.close()
                } catch (e: Exception) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    @ReactMethod
    fun scanNetwork(promise: Promise) {
        executor.execute {
            try {
                // Find the device's local IP to determine the subnet
                val subnet = getLocalSubnet()
                if (subnet == null) {
                    promise.reject("NETWORK_ERROR", "Could not determine local network subnet")
                    return@execute
                }

                val foundServers = CopyOnWriteArrayList<WritableMap>()
                val scanPool = Executors.newFixedThreadPool(50)
                val latch = CountDownLatch(254)

                // Scan all IPs in the /24 subnet for port 445 (SMB)
                for (i in 1..254) {
                    val targetIp = "$subnet.$i"
                    scanPool.execute {
                        try {
                            val socket = Socket()
                            socket.connect(InetSocketAddress(targetIp, 445), 300)
                            socket.close()

                            // Port 445 is open — this is an SMB server
                            val serverInfo: WritableMap = Arguments.createMap()
                            serverInfo.putString("ip", targetIp)

                            // Try to resolve hostname
                            try {
                                val addr = InetAddress.getByName(targetIp)
                                val hostname = addr.canonicalHostName
                                if (hostname != targetIp) {
                                    serverInfo.putString("hostname", hostname)
                                } else {
                                    serverInfo.putString("hostname", "")
                                }
                            } catch (e: Exception) {
                                serverInfo.putString("hostname", "")
                            }

                            foundServers.add(serverInfo)
                        } catch (e: Exception) {
                            // Port not open or host unreachable — skip
                        } finally {
                            latch.countDown()
                        }
                    }
                }

                // Wait for all scans to complete (max 10 seconds)
                latch.await(10, TimeUnit.SECONDS)
                scanPool.shutdownNow()

                val result: WritableArray = Arguments.createArray()
                for (server in foundServers) {
                    result.pushMap(server)
                }

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

                    // Only consider IPv4 addresses, skip loopback
                    if (hostAddress.contains(":") || hostAddress.startsWith("127.")) continue

                    // Return the first 3 octets as the subnet
                    val parts = hostAddress.split(".")
                    if (parts.size == 4) {
                        return "${parts[0]}.${parts[1]}.${parts[2]}"
                    }
                }
            }
        } catch (e: Exception) {
            // Ignore
        }
        return null
    }

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
                // Get app-specific storage directory
                val storageDir = reactApplicationContext.getExternalFilesDir(null)
                    ?: reactApplicationContext.filesDir
                
                // Create storage directory if it doesn't exist
                if (!storageDir.exists()) {
                    storageDir.mkdirs()
                }
                
                // Check for file name conflicts and generate unique name if needed
                var finalFileName = localFileName
                var localFile = File(storageDir, finalFileName)
                var counter = 1
                
                while (localFile.exists()) {
                    val nameParts = localFileName.split(".")
                    finalFileName = if (nameParts.size > 1) {
                        val name = nameParts.dropLast(1).joinToString(".")
                        val extension = nameParts.last()
                        "${name}_${counter}.${extension}"
                    } else {
                        "${localFileName}_${counter}"
                    }
                    localFile = File(storageDir, finalFileName)
                    counter++
                }
                
                // Create SMB client and connect
                val client = SMBClient()
                connection = client.connect(host)
                
                // Authenticate
                val authContext = if (domain != null && domain.isNotEmpty()) {
                    AuthenticationContext(username, password.toCharArray(), domain)
                } else {
                    AuthenticationContext(username, password.toCharArray(), null)
                }
                session = connection.authenticate(authContext)
                
                // Connect to share
                share = session.connectShare(shareName) as DiskShare
                
                // Open remote file and stream to local storage
                val smbFile = share.openFile(
                    remotePath,
                    EnumSet.of(AccessMask.GENERIC_READ),
                    null,
                    EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                    SMB2CreateDisposition.FILE_OPEN,
                    null
                )
                
                // Get file size
                val fileSize = smbFile.fileInformation.standardInformation.endOfFile
                
                // Stream file data in 8KB chunks with progress updates
                val inputStream = smbFile.inputStream
                val outputStream = FileOutputStream(localFile)
                val buffer = ByteArray(8192)
                var bytesRead: Int
                var totalBytesRead: Long = 0
                
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    totalBytesRead += bytesRead
                    
                    // Send progress event
                    val params = Arguments.createMap()
                    params.putString("downloadId", downloadId)
                    params.putDouble("downloadedBytes", totalBytesRead.toDouble())
                    params.putDouble("totalBytes", fileSize.toDouble())
                    
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("downloadProgress", params)
                }
                
                outputStream.close()
                inputStream.close()
                smbFile.close()
                
                // Return absolute local file path
                promise.resolve(localFile.absolutePath)
                
            } catch (e: com.hierynomus.mssmb2.SMBApiException) {
                promise.reject("SMB_ERROR", "SMB operation failed: ${e.message}", e)
            } catch (e: com.hierynomus.smbj.common.SMBRuntimeException) {
                promise.reject("SMB_ERROR", "Authentication failed: ${e.message}", e)
            } catch (e: java.io.IOException) {
                promise.reject("NETWORK_ERROR", "Network error: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("UNKNOWN_ERROR", "Operation failed: ${e.message}", e)
            } finally {
                try {
                    share?.close()
                    session?.close()
                    connection?.close()
                } catch (e: Exception) {
                    // Ignore cleanup errors
                }
            }
        }
    }
}
