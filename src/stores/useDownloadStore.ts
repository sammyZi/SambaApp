import {NativeEventEmitter, NativeModules} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import {create} from 'zustand';
import {createJSONStorage, persist, StateStorage} from 'zustand/middleware';
import {SmbModule} from '../native/SmbModule';

const encryptedStorageAdapter: StateStorage = {
  getItem: async name => EncryptedStorage.getItem(name),
  setItem: async (name, value) => EncryptedStorage.setItem(name, value),
  removeItem: async name => EncryptedStorage.removeItem(name),
};

export interface DownloadConnection {
  host: string;
  shareName: string;
  username: string;
  password: string;
  domain: string | null;
}

export type DownloadStatus =
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DownloadItem {
  id: string;
  fileName: string;
  filePath: string;
  localPath: string;
  partialPath?: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status: DownloadStatus;
  error?: string;
  startTime: number;
  lastUpdateTime?: number;
  sampleBytes: number;
  connection: DownloadConnection;
}

type NewDownload = Pick<
  DownloadItem,
  'fileName' | 'filePath' | 'localPath' | 'totalBytes' | 'connection'
>;

interface DownloadState {
  downloads: DownloadItem[];
  addDownload: (download: NewDownload) => string;
  startDownload: (id: string) => Promise<string | undefined>;
  updateDownloadProgress: (id: string, downloadedBytes: number, totalBytes?: number) => void;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  completeDownload: (id: string, localPath?: string) => void;
  failDownload: (id: string, error: string) => void;
  deleteDownload: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  getDownload: (id: string) => DownloadItem | undefined;
  clearInProgressDownloads: () => void;
}

const emitter = new NativeEventEmitter(NativeModules.SmbModule);
let progressSubscription: {remove: () => void} | undefined;

function ensureProgressListener() {
  if (progressSubscription) {
    return;
  }
  progressSubscription = emitter.addListener('downloadProgress', event => {
    useDownloadStore
      .getState()
      .updateDownloadProgress(event.downloadId, event.downloadedBytes, event.totalBytes);
  });
}

function errorCode(error: unknown) {
  return (error as {code?: string})?.code || '';
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloads: [],

      addDownload: download => {
        const duplicate = get().downloads.find(
          item =>
            item.filePath === download.filePath &&
            item.connection.host === download.connection.host &&
            item.connection.shareName === download.connection.shareName &&
            item.status !== 'cancelled',
        );
        if (duplicate) {
          if (duplicate.status === 'failed' || duplicate.status === 'paused') {
            get().resumeDownload(duplicate.id).catch(() => undefined);
          }
          return duplicate.id;
        }

        const id = `download_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const now = Date.now();
        set(state => ({
          downloads: [
            {
              ...download,
              id,
              downloadedBytes: 0,
              speed: 0,
              eta: 0,
              status: 'downloading',
              startTime: now,
              lastUpdateTime: now,
              sampleBytes: 0,
            },
            ...state.downloads,
          ],
        }));
        get().startDownload(id).catch(() => undefined);
        return id;
      },

      startDownload: async id => {
        ensureProgressListener();
        const item = get().downloads.find(download => download.id === id);
        if (!item || item.status === 'completed') {
          return item?.localPath;
        }
        const partial = await SmbModule.getPartialDownloadInfo(id, item.fileName);
        const now = Date.now();
        set(state => ({
          downloads: state.downloads.map(download =>
            download.id === id
              ? {
                  ...download,
                  status: 'downloading',
                  error: undefined,
                  partialPath: partial.path,
                  downloadedBytes: partial.bytes,
                  sampleBytes: partial.bytes,
                  speed: 0,
                  eta: 0,
                  startTime: now,
                  lastUpdateTime: now,
                }
              : download,
          ),
        }));

        try {
          const {connection} = item;
          const localPath = await SmbModule.downloadFileWithProgress(
            connection.host,
            connection.shareName,
            item.filePath,
            connection.username,
            connection.password,
            connection.domain,
            item.fileName,
            id,
          );
          get().completeDownload(id, localPath);
          return localPath;
        } catch (error: any) {
          const code = errorCode(error);
          if (code === 'DOWNLOAD_PAUSED' || code === 'DOWNLOAD_CANCELLED') {
            return undefined;
          }
          get().failDownload(id, error?.message || 'Download interrupted');
          return undefined;
        }
      },

      updateDownloadProgress: (id, downloadedBytes, totalBytes) => {
        const now = Date.now();
        set(state => ({
          downloads: state.downloads.map(download => {
            if (download.id !== id || download.status !== 'downloading') {
              return download;
            }
            const elapsed = Math.max((now - (download.lastUpdateTime || now)) / 1000, 0.001);
            const instantSpeed = Math.max(downloadedBytes - download.sampleBytes, 0) / elapsed;
            const speed = download.speed > 0 ? download.speed * 0.65 + instantSpeed * 0.35 : instantSpeed;
            const size = totalBytes || download.totalBytes;
            return {
              ...download,
              downloadedBytes,
              totalBytes: size,
              sampleBytes: downloadedBytes,
              speed,
              eta: speed > 0 ? Math.max(size - downloadedBytes, 0) / speed : 0,
              lastUpdateTime: now,
            };
          }),
        }));
      },

      pauseDownload: async id => {
        await SmbModule.pauseDownload(id);
        const item = get().downloads.find(download => download.id === id);
        const partial = item
          ? await SmbModule.getPartialDownloadInfo(id, item.fileName)
          : undefined;
        set(state => ({
          downloads: state.downloads.map(download =>
            download.id === id
              ? {
                  ...download,
                  status: 'paused',
                  speed: 0,
                  eta: 0,
                  downloadedBytes: partial?.bytes ?? download.downloadedBytes,
                  partialPath: partial?.path ?? download.partialPath,
                }
              : download,
          ),
        }));
      },

      resumeDownload: async id => {
        await get().startDownload(id);
      },

      retryDownload: async id => {
        await get().startDownload(id);
      },

      cancelDownload: async id => {
        const item = get().downloads.find(download => download.id === id);
        if (!item) {
          return;
        }
        await SmbModule.cancelDownload(id, item.fileName);
        set(state => ({downloads: state.downloads.filter(download => download.id !== id)}));
      },

      completeDownload: (id, localPath) =>
        set(state => ({
          downloads: state.downloads.map(download =>
            download.id === id
              ? {
                  ...download,
                  status: 'completed',
                  downloadedBytes: download.totalBytes,
                  localPath: localPath || download.localPath,
                  partialPath: undefined,
                  speed: 0,
                  eta: 0,
                  error: undefined,
                }
              : download,
          ),
        })),

      failDownload: (id, error) =>
        set(state => ({
          downloads: state.downloads.map(download =>
            download.id === id
              ? {...download, status: 'failed', speed: 0, eta: 0, error}
              : download,
          ),
        })),

      deleteDownload: async id => {
        const item = get().downloads.find(download => download.id === id);
        if (!item) {
          return;
        }
        if (item.status === 'downloading') {
          await SmbModule.cancelDownload(id, item.fileName);
        }
        if (item.localPath) {
          await SmbModule.deleteFile(item.localPath).catch(() => false);
        }
        await SmbModule.deletePartialDownload(id, item.fileName).catch(() => false);
        set(state => ({downloads: state.downloads.filter(download => download.id !== id)}));
      },

      clearCompleted: async () => {
        const completed = get().downloads.filter(download => download.status === 'completed');
        await Promise.allSettled(
          completed.map(download =>
            download.localPath
              ? SmbModule.deleteFile(download.localPath)
              : Promise.resolve(true),
          ),
        );
        set(state => ({
          downloads: state.downloads.filter(download => download.status !== 'completed'),
        }));
      },

      getDownload: id => get().downloads.find(download => download.id === id),

      clearInProgressDownloads: () =>
        set(state => ({
          downloads: state.downloads.map(download =>
            download.status === 'downloading'
              ? {
                  ...download,
                  status: 'paused',
                  error: 'Interrupted — ready to resume',
                  speed: 0,
                  eta: 0,
                }
              : download,
          ),
        })),
    }),
    {
      name: 'download-storage-v2',
      storage: createJSONStorage(() => encryptedStorageAdapter),
      partialize: state => ({downloads: state.downloads}),
      onRehydrateStorage: () => state => state?.clearInProgressDownloads(),
    },
  ),
);
