import {create} from 'zustand';
import {persist, createJSONStorage, StateStorage} from 'zustand/middleware';
import EncryptedStorage from 'react-native-encrypted-storage';

// Create a storage adapter for EncryptedStorage
const encryptedStorageAdapter: StateStorage = {
  getItem: async (name: string) => {
    try {
      const value = await EncryptedStorage.getItem(name);
      return value;
    } catch (error) {
      console.error('Error reading from encrypted storage:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await EncryptedStorage.setItem(name, value);
    } catch (error) {
      console.error('Error writing to encrypted storage:', error);
    }
  },
  removeItem: async (name: string) => {
    try {
      await EncryptedStorage.removeItem(name);
    } catch (error) {
      console.error('Error removing from encrypted storage:', error);
    }
  },
};

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
  lastUpdateTime?: number; // For throttling updates
}

interface DownloadState {
  downloads: DownloadItem[];
  addDownload: (download: Omit<DownloadItem, 'id' | 'downloadedBytes' | 'speed' | 'eta' | 'status' | 'startTime'>) => string;
  updateDownloadProgress: (id: string, downloadedBytes: number) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  completeDownload: (id: string, localPath?: string) => void;
  failDownload: (id: string, error: string) => void;
  clearCompleted: () => void;
  getDownload: (id: string) => DownloadItem | undefined;
  clearInProgressDownloads: () => void;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloads: [],

      addDownload: (download) => {
        const id = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();
        const newDownload: DownloadItem = {
          ...download,
          id,
          downloadedBytes: 0,
          speed: 0,
          eta: 0,
          status: 'downloading',
          startTime: now,
          lastUpdateTime: now,
        };
        
        set((state) => ({
          downloads: [newDownload, ...state.downloads],
        }));
        
        return id;
      },

      updateDownloadProgress: (id, downloadedBytes) => {
        const now = Date.now();
        const state = get();
        const download = state.downloads.find(d => d.id === id);
        
        // Throttle updates to max once per 500ms to prevent lag
        if (download && download.lastUpdateTime && (now - download.lastUpdateTime) < 500) {
          return;
        }

        set((state) => ({
          downloads: state.downloads.map((download) => {
            if (download.id === id && download.status === 'downloading') {
              const elapsedSeconds = (now - download.startTime) / 1000;
              const speed = elapsedSeconds > 0 ? downloadedBytes / elapsedSeconds : 0;
              const remainingBytes = download.totalBytes - downloadedBytes;
              const eta = speed > 0 ? remainingBytes / speed : 0;

              return {
                ...download,
                downloadedBytes,
                speed,
                eta,
                lastUpdateTime: now,
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

      completeDownload: (id, localPath?: string) => {
        set((state) => ({
          downloads: state.downloads.map((download) => {
            if (download.id === id) {
              return {
                ...download, 
                status: 'completed' as const, 
                downloadedBytes: download.totalBytes,
                localPath: localPath || download.localPath
              };
            }
            return download;
          }),
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

      clearInProgressDownloads: () => {
        set((state) => ({
          downloads: state.downloads.map((download) => {
            if (download.status === 'downloading' || download.status === 'paused') {
              return {...download, status: 'failed' as const, error: 'App was closed'};
            }
            return download;
          }),
        }));
      },
    }),
    {
      name: 'download-storage',
      storage: createJSONStorage(() => encryptedStorageAdapter),
      partialize: (state) => ({
        downloads: state.downloads.filter(d => d.status === 'completed' || d.status === 'failed'),
      }),
    }
  )
);
