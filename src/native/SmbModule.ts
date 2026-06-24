import {NativeModules} from 'react-native';
import {FileItem} from './types';

interface SmbModuleInterface {
  listFiles(
    host: string,
    shareName: string,
    folderPath: string,
    username: string,
    password: string,
    domain: string | null,
  ): Promise<FileItem[]>;

  downloadFile(
    host: string,
    shareName: string,
    remotePath: string,
    username: string,
    password: string,
    domain: string | null,
    localFileName: string,
  ): Promise<string>;

  downloadFileToPath(
    host: string,
    shareName: string,
    remotePath: string,
    username: string,
    password: string,
    domain: string | null,
    localFilePath: string,
  ): Promise<string>;

  downloadFileWithProgress(
    host: string,
    shareName: string,
    remotePath: string,
    username: string,
    password: string,
    domain: string | null,
    localFileName: string,
    downloadId: string,
  ): Promise<string>;

  /**
   * Starts an in-process HTTP proxy server and returns an http://127.0.0.1 URL
   * immediately. The media player opens the URL and the proxy handles all
   * byte-range reads from SMB on demand — no local file is written, seeking
   * works perfectly for videos of any size.
   *
   * Returns: "http://127.0.0.1:PORT/TOKEN"
   */
  startStreamProxy(
    host: string,
    shareName: string,
    remotePath: string,
    username: string,
    password: string,
    domain: string | null,
    fileName: string,
  ): Promise<string>;

  /** Remove the proxy session when the user closes the player. */
  stopStreamProxy(token: string): Promise<boolean>;

  /**
   * Opens an http:// streaming URL in an external app via an ACTION_VIEW intent.
   * Use this for proxy URLs — FileViewer only handles local file paths.
   */
  openUrl(url: string, fileName: string): Promise<boolean>;

  /** Delete a local file from device storage by its absolute path. */
  deleteFile(localFilePath: string): Promise<boolean>;

  scanNetwork(): Promise<Array<{ip: string; hostname: string}>>;
}

export const SmbModule: SmbModuleInterface = NativeModules.SmbModule;
