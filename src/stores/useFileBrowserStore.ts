import {create} from 'zustand';
import {FileItem, SmbCredentials} from '../native/types';
import {SmbModule} from '../native/SmbModule';

interface FileBrowserState {
  // State
  credentials: SmbCredentials | null;
  currentPath: string;
  navigationStack: string[];
  items: FileItem[];
  isLoading: boolean;
  error: string | null;
  downloadingFile: string | null;
  snackbarVisible: boolean;
  snackbarMessage: string;
  snackbarType: 'success' | 'error';

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
  showSnackbar: (message: string, type: 'success' | 'error') => void;
  hideSnackbar: () => void;
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

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  // Initial state
  credentials: null,
  currentPath: '',
  navigationStack: [],
  items: [],
  isLoading: false,
  error: null,
  downloadingFile: null,
  snackbarVisible: false,
  snackbarMessage: '',
  snackbarType: 'success',

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
    const {credentials} = get();
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

    set({downloadingFile: fileName});

    try {
      const localFilePath = await SmbModule.downloadFile(
        credentials.host,
        credentials.shareName,
        filePath,
        credentials.username,
        credentials.password,
        credentials.domain || null,
        fileName,
      );
      showSnackbar(`Downloaded to: ${localFilePath}`, 'success');
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

  reset: () =>
    set({
      credentials: null,
      currentPath: '',
      navigationStack: [],
      items: [],
      isLoading: false,
      error: null,
      downloadingFile: null,
      snackbarVisible: false,
      snackbarMessage: '',
      snackbarType: 'success',
    }),
}));
