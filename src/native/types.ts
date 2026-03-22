export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size: number;
  path: string;
}

export interface SmbCredentials {
  host: string;
  shareName: string;
  username: string;
  password: string;
  domain?: string;
}
