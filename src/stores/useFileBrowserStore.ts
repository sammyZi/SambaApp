import {create} from 'zustand';
import {FileItem, SmbCredentials} from '../native/types';
import {SmbModule} from '../native/SmbModule';
import FileViewer from 'react-native-file-viewer';
import {useDownloadStore} from './useDownloadStore';
import {NativeEventEmitter, NativeModules} from 'react-native';

export type FileTypeFilter = 'all' | 'folder' | 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

interface FileBrowserState {
  // State
  credentials: SmbCredentials | null;
  currentPath: string;
  navigationStack: string[];
  items: FileItem[];
  filteredItems: FileItem[];
  isLoading: boolean;
  error: string | null;
  downloadingFile: string | null;
  snackbarVisible: boolean;
  snackbarMessage: string;
  snackbarType: 'success' | 'error';
  
  // Search and filter state
  searchQuery: string;
  activeFilters: FileTypeFilter[];

  // Actions
  setCredentials: (credentials: SmbCredentials) => void;
  setCurrentPath: (path: string) => void;
  pushToNavigationStack: (path: string) => void;
  popFromNavigationStack: () => string | undefined;
  clearNavigationStack: () => void;
  loadFiles: (path: string) => Promise<void>;
  navigateToFolder: (folderName: string) => void;
  navigateBack: () => boolean;
  downloadFile: (fileName: string, filePath: string) => Promise<void>;
  openFile: (fileName: string, filePath: string) => Promise<void>;
  showSnackbar: (message: string, type: 'success' | 'error') => void;
  hideSnackbar: () => void;
  setSearchQuery: (query: string) => void;
  toggleFilter: (filter: FileTypeFilter) => void;
  clearFilters: () => void;
  applyFilters: () => void;
  reset: () => void;
}

const mapErrorToMessage = (err: any): string => {
  const errorMessage = err?.message || err?.toString() || '';
  const errorCode = err?.code || '';

  if (
    errorMessage.toLowerCase().includes('auth') ||
    errorMessage.toLowerCase().includes('credential') ||
    errorCode === 'SMB_ERROR'
  ) {
    return 'Authentication failed. Please check your credentials.';
  }

  if (
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('unreachable') ||
    errorMessage.toLowerCase().includes('timeout') ||
    errorCode === 'NETWORK_ERROR'
  ) {
    return 'Cannot reach the server. Please check your network connection.';
  }

  if (errorMessage.toLowerCase().includes('not found')) {
    return 'The requested folder or file was not found.';
  }

  return `Error: ${errorMessage}`;
};

const getFileTypeFromExtension = (fileName: string): FileTypeFilter => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'];
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];
  const documentExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'log'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
  
  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (documentExts.includes(ext)) return 'document';
  if (archiveExts.includes(ext)) return 'archive';
  
  return 'other';
};

const matchesFilter = (item: FileItem, filters: FileTypeFilter[]): boolean => {
  if (filters.length === 0 || filters.includes('all')) return true;
  
  if (item.type === 'directory') {
    return filters.includes('folder');
  }
  
  const fileType = getFileTypeFromExtension(item.name);
  return filters.includes(fileType);
};

const matchesSearch = (item: FileItem, query: string): boolean => {
  if (!query.trim()) return true;
  return item.name.toLowerCase().includes(query.toLowerCase());
};

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  // Initial state
  credentials: null,
  currentPath: '',
  navigationStack: [],
  items: [],
  filteredItems: [],
  isLoading: false,
  error: null,
  downloadingFile: null,
  snackbarVisible: false,
  snackbarMessage: '',
  snackbarType: 'success',
  searchQuery: '',
  activeFilters: [],

  // Actions
  setCredentials: (credentials) => set({credentials}),

  setCurrentPath: (path) => set({currentPath: path}),

  pushToNavigationStack: (path) =>
    set((state) => ({
      navigationStack: [...state.navigationStack, path],
    })),

  popFromNavigationStack: () => {
    const {navigationStack} = get();
    if (navigationStack.length === 0) return undefined;
    const newStack = [...navigationStack];
    const poppedPath = newStack.pop();
    set({navigationStack: newStack});
    return poppedPath;
  },

  clearNavigationStack: () => set({navigationStack: []}),

  loadFiles: async (path) => {
    const {credentials, applyFilters} = get();
    if (!credentials) return;

    set({isLoading: true, error: null});

    try {
      const files = await SmbModule.listFiles(
        credentials.host,
        credentials.shareName,
        path,
        credentials.username,
        credentials.password,
        credentials.domain || null,
      );

      // Sort: directories first, then files, both alphabetical
      const sorted = files.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      set({items: sorted, isLoading: false});
      applyFilters();
    } catch (err: any) {
      const errorMessage = mapErrorToMessage(err);
      set({error: errorMessage, isLoading: false});
    }
  },

  navigateToFolder: (folderName) => {
    const {currentPath, pushToNavigationStack, setCurrentPath, loadFiles} =
      get();
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    pushToNavigationStack(currentPath);
    setCurrentPath(newPath);
    loadFiles(newPath);
  },

  navigateBack: () => {
    const {navigationStack, popFromNavigationStack, setCurrentPath, loadFiles} =
      get();
    if (navigationStack.length === 0) {
      return false; // At root, don't handle
    }
    const parentPath = popFromNavigationStack() || '';
    setCurrentPath(parentPath);
    loadFiles(parentPath);
    return true;
  },

  downloadFile: async (fileName, filePath) => {
    const {credentials, showSnackbar} = get();
    if (!credentials) return;

    // Get file size first by listing the parent directory
    const pathParts = filePath.split('/');
    const parentPath = pathParts.slice(0, -1).join('/');
    
    try {
      const files = await SmbModule.listFiles(
        credentials.host,
        credentials.shareName,
        parentPath,
        credentials.username,
        credentials.password,
        credentials.domain || null,
      );
      
      const fileInfo = files.find(f => f.path === filePath);
      const fileSize = fileInfo?.size || 0;

      // Add to download store
      const downloadId = useDownloadStore.getState().addDownload({
        fileName,
        filePath,
        localPath: '',
        totalBytes: fileSize,
      });

      // Set up progress listener
      const eventEmitter = new NativeEventEmitter(NativeModules.SmbModule);
      const subscription = eventEmitter.addListener('downloadProgress', (event) => {
        if (event.downloadId === downloadId) {
          useDownloadStore.getState().updateDownloadProgress(
            downloadId,
            event.downloadedBytes
          );
        }
      });

      try {
        const localFilePath = await SmbModule.downloadFileWithProgress(
          credentials.host,
          credentials.shareName,
          filePath,
          credentials.username,
          credentials.password,
          credentials.domain || null,
          fileName,
          downloadId,
        );
        
        useDownloadStore.getState().completeDownload(downloadId);
        showSnackbar(`Downloaded: ${fileName}`, 'success');
      } catch (err: any) {
        const errorMessage = mapErrorToMessage(err);
        useDownloadStore.getState().failDownload(downloadId, errorMessage);
        showSnackbar(errorMessage, 'error');
      } finally {
        subscription.remove();
      }
    } catch (err: any) {
      const errorMessage = mapErrorToMessage(err);
      showSnackbar(errorMessage, 'error');
    }
  },

  openFile: async (fileName, filePath) => {
    const {credentials, showSnackbar} = get();
    if (!credentials) return;

    set({downloadingFile: fileName});

    try {
      // Download to temp location first (without progress tracking for quick open)
      const localFilePath = await SmbModule.downloadFile(
        credentials.host,
        credentials.shareName,
        filePath,
        credentials.username,
        credentials.password,
        credentials.domain || null,
        fileName,
      );
      
      // Open with default app
      await FileViewer.open(localFilePath, {
        showOpenWithDialog: true,
        showAppsSuggestions: true,
      });
      
      showSnackbar('File opened successfully', 'success');
    } catch (err: any) {
      const errorMessage = mapErrorToMessage(err);
      showSnackbar(errorMessage, 'error');
    } finally {
      set({downloadingFile: null});
    }
  },

  showSnackbar: (message, type) =>
    set({
      snackbarVisible: true,
      snackbarMessage: message,
      snackbarType: type,
    }),

  hideSnackbar: () => set({snackbarVisible: false}),

  setSearchQuery: (query) => {
    set({searchQuery: query});
    get().applyFilters();
  },

  toggleFilter: (filter) => {
    const {activeFilters} = get();
    const newFilters = activeFilters.includes(filter)
      ? activeFilters.filter((f) => f !== filter)
      : [...activeFilters, filter];
    set({activeFilters: newFilters});
    get().applyFilters();
  },

  clearFilters: () => {
    set({activeFilters: [], searchQuery: ''});
    get().applyFilters();
  },

  applyFilters: () => {
    const {items, searchQuery, activeFilters} = get();
    
    const filtered = items.filter((item) => {
      const matchesSearchQuery = matchesSearch(item, searchQuery);
      const matchesFilterType = matchesFilter(item, activeFilters);
      return matchesSearchQuery && matchesFilterType;
    });

    set({filteredItems: filtered});
  },

  reset: () =>
    set({
      credentials: null,
      currentPath: '',
      navigationStack: [],
      items: [],
      filteredItems: [],
      isLoading: false,
      error: null,
      downloadingFile: null,
      snackbarVisible: false,
      snackbarMessage: '',
      snackbarType: 'success',
      searchQuery: '',
      activeFilters: [],
    }),
}));
