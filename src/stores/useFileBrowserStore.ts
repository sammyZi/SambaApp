import {create} from 'zustand';
import {FileItem, SmbCredentials} from '../native/types';
import {SmbModule} from '../native/SmbModule';
import {NativeEventEmitter, NativeModules} from 'react-native';
import {useDownloadStore} from './useDownloadStore';

export type FileTypeFilter = 'all' | 'folder' | 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

interface FileBrowserState {
  // State
  credentials: SmbCredentials | null;
  currentPath: string;
  navigationStack: string[];
  items: FileItem[];
  filteredItems: FileItem[];
  isLoading: boolean;
  /** True while a recursive subfolder scan is running for the active filter */
  isSearching: boolean;
  /** Files collected from the recursive subfolder scan (only when file filters active) */
  recursiveResults: FileItem[];
  error: string | null;
  downloadingFile: string | null;
  snackbarVisible: boolean;
  snackbarMessage: string;
  snackbarType: 'success' | 'error';

  // Search and filter
  searchQuery: string;
  activeFilters: FileTypeFilter[];

  // Selection
  selectionMode: boolean;
  selectedItems: Set<string>;

  // Actions
  setCredentials: (credentials: SmbCredentials) => void;
  setCurrentPath: (path: string) => void;
  pushToNavigationStack: (path: string) => void;
  popFromNavigationStack: () => string | undefined;
  clearNavigationStack: () => void;
  loadFiles: (path: string) => Promise<void>;
  navigateToFolder: (folderName: string) => void;
  navigateBack: () => boolean;
  downloadFile: (fileName: string, filePath: string) => Promise<string | null>;
  downloadFolder: (folderName: string, folderPath: string) => Promise<void>;
  downloadSelected: () => Promise<void>;
  openFile: (fileName: string, filePath: string) => Promise<void>;
  showSnackbar: (message: string, type: 'success' | 'error') => void;
  hideSnackbar: () => void;
  setSearchQuery: (query: string) => void;
  toggleFilter: (filter: FileTypeFilter) => void;
  clearFilters: () => void;
  applyFilters: () => void;
  /** Recursively walks the current folder tree collecting files matching active filters */
  runRecursiveFilter: () => Promise<void>;
  toggleSelectionMode: () => void;
  toggleItemSelection: (filePath: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  reset: () => void;
}

// Generation counter to cancel stale recursive scans when filters/navigation change.
let scanGeneration = 0;

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
  if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image';
  if (['mp4','mkv','avi','mov','wmv','flv','webm'].includes(ext)) return 'video';
  if (['mp3','wav','flac','aac','ogg','m4a','wma'].includes(ext)) return 'audio';
  if (['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','log'].includes(ext)) return 'document';
  if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) return 'archive';
  return 'other';
};

const matchesFilter = (item: FileItem, filters: FileTypeFilter[]): boolean => {
  if (filters.length === 0 || filters.includes('all')) return true;
  if (item.type === 'directory') return filters.includes('folder');
  return filters.includes(getFileTypeFromExtension(item.name));
};

const matchesSearch = (item: FileItem, query: string): boolean => {
  if (!query.trim()) return true;
  return item.name.toLowerCase().includes(query.toLowerCase());
};

// File-type filters trigger a recursive subfolder scan. The "folder" filter is
// applied locally to the current directory only (no recursion needed).
const FILE_TYPE_FILTERS: FileTypeFilter[] = ['image', 'video', 'audio', 'document', 'archive', 'other'];
const needsRecursiveScan = (filters: FileTypeFilter[]): boolean =>
  filters.some(f => FILE_TYPE_FILTERS.includes(f));

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  credentials: null,
  currentPath: '',
  navigationStack: [],
  items: [],
  filteredItems: [],
  isLoading: false,
  isSearching: false,
  recursiveResults: [],
  error: null,
  downloadingFile: null,
  snackbarVisible: false,
  snackbarMessage: '',
  snackbarType: 'success',
  searchQuery: '',
  activeFilters: [],
  selectionMode: false,
  selectedItems: new Set(),

  // ── Actions ────────────────────────────────────────────────────────────────
  setCredentials: (credentials) => set({credentials}),
  setCurrentPath: (path) => set({currentPath: path}),

  pushToNavigationStack: (path) =>
    set((state) => ({navigationStack: [...state.navigationStack, path]})),

  popFromNavigationStack: () => {
    const {navigationStack} = get();
    if (navigationStack.length === 0) return undefined;
    const newStack = [...navigationStack];
    const popped = newStack.pop();
    set({navigationStack: newStack});
    return popped;
  },

  clearNavigationStack: () => set({navigationStack: []}),

  loadFiles: async (path) => {
    const {credentials} = get();
    if (!credentials) return;
    // A new folder load cancels any in-flight recursive scan
    scanGeneration++;
    set({isLoading: true, error: null, isSearching: false, recursiveResults: []});
    try {
      const files = await SmbModule.listFiles(
        credentials.host, credentials.shareName, path,
        credentials.username, credentials.password, credentials.domain || null,
      );
      const sorted = files.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      set({items: sorted, isLoading: false});

      // If a file-type filter is active, scan subfolders from this new location
      if (needsRecursiveScan(get().activeFilters)) {
        get().runRecursiveFilter();
      } else {
        get().applyFilters();
      }
    } catch (err: any) {
      set({error: mapErrorToMessage(err), isLoading: false});
    }
  },

  navigateToFolder: (folderName) => {
    const {currentPath, pushToNavigationStack, setCurrentPath, loadFiles} = get();
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    pushToNavigationStack(currentPath);
    setCurrentPath(newPath);
    loadFiles(newPath);
  },

  navigateBack: () => {
    const state = get();
    if (state.selectionMode) {
      set({selectionMode: false, selectedItems: new Set()});
      return true;
    }
    if (state.navigationStack.length === 0) return false;
    const parentPath = state.popFromNavigationStack() || '';
    state.setCurrentPath(parentPath);
    state.loadFiles(parentPath);
    return true;
  },

  downloadFile: async (fileName, filePath) => {
    const {credentials, showSnackbar} = get();
    if (!credentials) return null;

    const existingDownload = useDownloadStore.getState().downloads.find(
      d => d.filePath === filePath && (d.status === 'downloading' || d.status === 'completed'),
    );
    if (existingDownload) {
      if (existingDownload.status === 'completed') {
        showSnackbar(`${fileName} already downloaded`, 'success');
        return existingDownload.localPath || null;
      }
      showSnackbar(`${fileName} is already downloading`, 'error');
      return null;
    }

    const pathParts = filePath.split('/');
    const parentPath = pathParts.slice(0, -1).join('/');
    try {
      const files = await SmbModule.listFiles(
        credentials.host, credentials.shareName, parentPath,
        credentials.username, credentials.password, credentials.domain || null,
      );
      const fileSize = files.find(f => f.path === filePath)?.size || 0;

      const downloadId = useDownloadStore.getState().addDownload({
        fileName, filePath, localPath: '', totalBytes: fileSize,
      });
      showSnackbar(`Downloading ${fileName}...`, 'success');

      const eventEmitter = new NativeEventEmitter(NativeModules.SmbModule);
      const subscription = eventEmitter.addListener('downloadProgress', (event: any) => {
        if (event.downloadId === downloadId) {
          useDownloadStore.getState().updateDownloadProgress(downloadId, event.downloadedBytes);
        }
      });

      try {
        const localFilePath = await SmbModule.downloadFileWithProgress(
          credentials.host, credentials.shareName, filePath,
          credentials.username, credentials.password, credentials.domain || null,
          fileName, downloadId,
        );
        useDownloadStore.getState().completeDownload(downloadId, localFilePath);
        showSnackbar(`Downloaded: ${fileName}`, 'success');
        return localFilePath;
      } catch (err: any) {
        const msg = mapErrorToMessage(err);
        useDownloadStore.getState().failDownload(downloadId, msg);
        showSnackbar(msg, 'error');
        return null;
      } finally {
        subscription.remove();
      }
    } catch (err: any) {
      showSnackbar(mapErrorToMessage(err), 'error');
      return null;
    }
  },

  downloadFolder: async (folderName, folderPath) => {
    const {credentials, showSnackbar} = get();
    if (!credentials) return;
    showSnackbar(`Downloading folder: ${folderName}...`, 'success');
    try {
      const files = await SmbModule.listFiles(
        credentials.host, credentials.shareName, folderPath,
        credentials.username, credentials.password, credentials.domain || null,
      );
      const filesToDownload = files.filter(f => f.type === 'file');
      if (filesToDownload.length === 0) { showSnackbar('Folder is empty', 'error'); return; }
      showSnackbar(`Downloading ${filesToDownload.length} files from ${folderName}...`, 'success');
      for (const file of filesToDownload) await get().downloadFile(file.name, file.path);
    } catch (err: any) {
      showSnackbar(mapErrorToMessage(err), 'error');
    }
  },

  downloadSelected: async () => {
    const {selectedItems, items, recursiveResults, clearSelection, showSnackbar} = get();
    if (selectedItems.size === 0) { showSnackbar('No items selected', 'error'); return; }
    showSnackbar(`Downloading ${selectedItems.size} items...`, 'success');
    // Selected items may come from the recursive results or the current folder
    const pool = [...items, ...recursiveResults];
    for (const itemPath of selectedItems) {
      const item = pool.find(i => i.path === itemPath);
      if (item) {
        if (item.type === 'directory') await get().downloadFolder(item.name, item.path);
        else await get().downloadFile(item.name, item.path);
      }
    }
    clearSelection();
  },

  openFile: async (fileName, filePath) => {
    const {credentials, showSnackbar} = get();
    if (!credentials) return;
    console.log('[FileBrowser] openFile:', fileName);
    set({downloadingFile: fileName});
    try {
      const streamUrl = await SmbModule.startStreamProxy(
        credentials.host, credentials.shareName, filePath,
        credentials.username, credentials.password, credentials.domain || null,
        fileName,
      );
      const token = streamUrl.split('/').pop() ?? '';
      // Launch via ACTION_VIEW intent — works with http:// proxy URLs
      // (FileViewer/FileProvider only supports local file paths).
      await SmbModule.openUrl(streamUrl, fileName);
      showSnackbar('Opening…', 'success');
      setTimeout(() => SmbModule.stopStreamProxy(token).catch(() => {}), 30 * 60 * 1000);
    } catch (err: any) {
      showSnackbar(mapErrorToMessage(err), 'error');
    } finally {
      set({downloadingFile: null});
    }
  },

  showSnackbar: (message, type) =>
    set({snackbarVisible: true, snackbarMessage: message, snackbarType: type}),

  hideSnackbar: () => set({snackbarVisible: false}),

  setSearchQuery: (query) => {
    // Search only re-derives the filtered list — no rescan needed
    set({searchQuery: query});
    get().applyFilters();
  },

  toggleFilter: (filter) => {
    const {activeFilters} = get();
    const newFilters = activeFilters.includes(filter)
      ? activeFilters.filter(f => f !== filter)
      : [...activeFilters, filter];
    set({activeFilters: newFilters});

    if (needsRecursiveScan(newFilters)) {
      get().runRecursiveFilter();
    } else {
      // Cancel any running scan and fall back to local filtering
      scanGeneration++;
      set({isSearching: false, recursiveResults: []});
      get().applyFilters();
    }
  },

  clearFilters: () => {
    scanGeneration++; // cancel any in-flight scan
    set({activeFilters: [], searchQuery: '', recursiveResults: [], isSearching: false});
    get().applyFilters();
  },

  applyFilters: () => {
    const {items, recursiveResults, searchQuery, activeFilters} = get();

    if (needsRecursiveScan(activeFilters)) {
      // Recursive results are already filtered by type — just apply the search text
      set({filteredItems: recursiveResults.filter(i => matchesSearch(i, searchQuery))});
    } else {
      set({
        filteredItems: items.filter(item =>
          matchesSearch(item, searchQuery) && matchesFilter(item, activeFilters),
        ),
      });
    }
  },

  runRecursiveFilter: async () => {
    const {credentials, currentPath, activeFilters} = get();
    if (!credentials || !needsRecursiveScan(activeFilters)) {
      set({isSearching: false, recursiveResults: []});
      get().applyFilters();
      return;
    }

    const myGen = ++scanGeneration;
    set({isSearching: true, recursiveResults: []});

    const results: FileItem[] = [];
    const queue: string[] = [currentPath];

    try {
      while (queue.length > 0) {
        if (myGen !== scanGeneration) return; // a newer scan/navigation superseded us

        const dir = queue.shift()!;
        let listing: FileItem[];
        try {
          listing = await SmbModule.listFiles(
            credentials.host, credentials.shareName, dir,
            credentials.username, credentials.password, credentials.domain || null,
          );
        } catch {
          continue; // skip unreadable folders
        }

        for (const item of listing) {
          if (item.type === 'directory') {
            queue.push(item.path); // descend into every subfolder
          } else if (matchesFilter(item, activeFilters)) {
            results.push(item);
          }
        }

        // Incremental update so matches appear as the scan progresses
        if (myGen === scanGeneration) {
          set({recursiveResults: [...results]});
          get().applyFilters();
        }
      }
    } finally {
      if (myGen === scanGeneration) {
        set({isSearching: false});
        get().applyFilters();
      }
    }
  },

  toggleSelectionMode: () => {
    const {selectionMode} = get();
    set({selectionMode: !selectionMode, selectedItems: new Set()});
  },

  toggleItemSelection: (filePath) => {
    const {selectedItems} = get();
    const next = new Set(selectedItems);
    if (next.has(filePath)) next.delete(filePath);
    else next.add(filePath);
    set({selectedItems: next});
  },

  clearSelection: () => set({selectedItems: new Set(), selectionMode: false}),

  selectAll: () => {
    const {filteredItems} = get();
    set({selectedItems: new Set(filteredItems.map(i => i.path))});
  },

  reset: () => {
    scanGeneration++;
    set({
      credentials: null,
      currentPath: '',
      navigationStack: [],
      items: [],
      filteredItems: [],
      isLoading: false,
      isSearching: false,
      recursiveResults: [],
      error: null,
      downloadingFile: null,
      snackbarVisible: false,
      snackbarMessage: '',
      snackbarType: 'success',
      searchQuery: '',
      activeFilters: [],
      selectionMode: false,
      selectedItems: new Set(),
    });
  },
}));
