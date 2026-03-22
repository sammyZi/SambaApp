package com.sambafilebrowser.smb

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
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
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService

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
}
