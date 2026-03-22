export interface SmbCredentials {
  host: string;
  shareName: string;
  username: string;
  password: string;
  domain?: string;
}

export interface ConnectionState {
  host: string;
  shareName: string;
  username: string;
  password: string;
  domain: string;
  isConnecting: boolean;
  error: string | null;
}

export interface FileBrowserState {
  currentPath: string;
  navigationStack: string[];
  items: Array<{
    name: string;
    type: 'file' | 'directory';
    size: number;
    path: string;
  }>;
  isLoading: boolean;
  error: string | null;
  downloadingFile: string | null;
}

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  error?: string;
}
