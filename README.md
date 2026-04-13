# Samba File Browser App

A React Native Android application for browsing and downloading files from Samba (SMB) network shares.

## Screenshots

<p align="center">
  <img src="ss/Screenshot_20260412_163029.jpg.jpeg" width="30%" />
  <img src="ss/Screenshot_20260412_163034.jpg.jpeg" width="30%" />
  <img src="ss/Screenshot_20260412_163052.jpg.jpeg" width="30%" />
  <img src="ss/Screenshot_20260412_163101.jpg.jpeg" width="30%" />
  <img src="ss/Screenshot_20260412_163106.jpg.jpeg" width="30%" />
</p>

## Features

- **Connect to Samba Shares:** Easily connect to network shares using SMB protocols.
- **File Browsing:** Navigate through folders and view files intuitively.
- **File Downloads:** Download files directly to your Android device from external shares.
- **Native Implementation:** Custom Android Native module built with Kotlin for fast and reliable SMB interaction via the SMBJ Library.

## Technology Stack

- **React Native 0.84.1** (bare workflow, Android-only target)
- **TypeScript** for robust typing
- **Kotlin** for native Android Modules
- **SMBJ Library** for SMB protocol support

## How It Works Under the Hood

To achieve reliable SMB connectivity, this app bypasses generic JavaScript libraries and uses a custom **React Native Bridge** connecting to the native Android layer.

1. **The Native Module (`SmbModule.kt`)**
   We created a Kotlin module extending `ReactContextBaseJavaModule`. This allows our TypeScript code to invoke Android-native functions asynchronously.
2. **The SMBJ Engine**
   Under the hood, the application relies on the [SMBJ](https://github.com/hierynomus/smbj) library—a robust, pure Java implementation of the SMB2/SMB3 protocol. 
   When the user browses a folder or downloads a file:
   - The Kotlin module spawns a background thread using `Executors.newCachedThreadPool()` to prevent blocking the UI.
   - It instantiates an `SMBClient`, connects via socket to the provided host, and authenticates using an `AuthenticationContext`.
   - It mounts the specific `DiskShare` and either iterates through `share.list(path)` for file browsing, or streams file chunks to `FileOutputStream` for downloading.
3. **The React Native Bridge (`SmbModule.ts`)**
   The Kotlin methods (`@ReactMethod`) are exposed to the TypeScript layer via `NativeModules.SmbModule`, taking care of passing arguments (host, share, credentials) and resolving Promises with the results (file lists or local download paths).

