import {SmbCredentials} from './native/types';

export type RootStackParamList = {
  Connection: undefined;
  FileBrowser: {
    credentials: SmbCredentials;
    initialPath?: string;
  };
};
