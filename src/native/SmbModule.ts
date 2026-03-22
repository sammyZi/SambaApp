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

  scanNetwork(): Promise<Array<{ip: string; hostname: string}>>;
}

export const SmbModule: SmbModuleInterface = NativeModules.SmbModule;
