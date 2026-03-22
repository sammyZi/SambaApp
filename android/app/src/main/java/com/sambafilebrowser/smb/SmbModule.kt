package com.sambafilebrowser.smb

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * Native module for SMB operations using SMBJ library
 * This module will be implemented in subsequent tasks
 */
class SmbModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
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
        // TODO: Implement in subsequent tasks
        promise.reject("NOT_IMPLEMENTED", "listFiles not yet implemented")
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
        // TODO: Implement in subsequent tasks
        promise.reject("NOT_IMPLEMENTED", "downloadFile not yet implemented")
    }
}
