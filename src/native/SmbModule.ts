import { NativeModules } from 'react-native';

export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size: number;
  path: string;
}

interface SmbModuleInterface {
  listFiles(
    host: string,
    shareName: string,
    folderPath: string,
    username: string,
    password: string,
    domain: string | null
  ): Promise<FileItem[]>;
  
  downloadFile(
    host: string,
    shareName: string,
    remotePath: string,
    username: string,
    password: string,
    domain: string | null,
    localFileName: string
  ): Promise<string>;
}

export const SmbModule: SmbModuleInterface = NativeModules.SmbModule;
