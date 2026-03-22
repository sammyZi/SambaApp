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
}

export const SmbModule: SmbModuleInterface = NativeModules.SmbModule;
