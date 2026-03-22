import {create} from 'zustand';

export interface DownloadItem {
  id: string;
  fileName: string;
  filePath: string;
  localPath: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  startTime: number;
}

interface DownloadState {
  downloads: DownloadItem[];
  addDownload: (download: Omit<DownloadItem, 'id' | 'downloadedBytes' | 'speed' | 'eta' | 'status' | 'startTime'>) => string;
  updateDownloadProgress: (id: string, downloadedBytes: number) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  completeDownload: (id: string) => void;
  failDownload: (id: string, error: string) => void;
  clearCompleted: () => void;
  getDownload: (id: string) => DownloadItem | undefined;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: [],

  addDownload: (download) => {
    const id = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newDownload: DownloadItem = {
      ...download,
      id,
      downloadedBytes: 0,
      speed: 0,
      eta: 0,
      status: 'downloading',
      startTime: Date.now(),
    };
    
    set((state) => ({
      downloads: [newDownload, ...state.downloads],
    }));
    
    return id;
  },

  updateDownloadProgress: (id, downloadedBytes) => {
    set((state) => ({
      downloads: state.downloads.map((download) => {
        if (download.id === id && download.status === 'downloading') {
          const now = Date.now();
          const elapsedSeconds = (now - download.startTime) / 1000;
          const speed = elapsedSeconds > 0 ? downloadedBytes / elapsedSeconds : 0;
          const remainingBytes = download.totalBytes - downloadedBytes;
          const eta = speed > 0 ? remainingBytes / speed : 0;

          return {
            ...download,
            downloadedBytes,
            speed,
            eta,
          };
        }
        return download;
      }),
    }));
  },

  pauseDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === id ? {...download, status: 'paused' as const} : download
      ),
    }));
  },

  resumeDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === id 
          ? {...download, status: 'downloading' as const, startTime: Date.now()} 
          : download
      ),
    }));
  },

  cancelDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.filter((download) => download.id !== id),
    }));
  },

  completeDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === id 
          ? {...download, status: 'completed' as const, downloadedBytes: download.totalBytes} 
          : download
      ),
    }));
  },

  failDownload: (id, error) => {
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === id ? {...download, status: 'failed' as const, error} : download
      ),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      downloads: state.downloads.filter((download) => download.status !== 'completed'),
    }));
  },

  getDownload: (id) => {
    return get().downloads.find((download) => download.id === id);
  },
}));
