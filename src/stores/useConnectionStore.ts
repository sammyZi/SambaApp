import {create} from 'zustand';
import {SmbModule} from '../native/SmbModule';

interface ConnectionState {
  // State
  host: string;
  shareName: string;
  username: string;
  password: string;
  domain: string;
  isConnecting: boolean;
  error: string | null;

  // Actions
  setHost: (host: string) => void;
  setShareName: (shareName: string) => void;
  setUsername: (username: string) => void;
  setPassword: (password: string) => void;
  setDomain: (domain: string) => void;
  setError: (error: string | null) => void;
  validateAndConnect: () => Promise<boolean>;
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
    return 'Incorrect username or password';
  }

  if (
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('unreachable') ||
    errorMessage.toLowerCase().includes('timeout') ||
    errorCode === 'NETWORK_ERROR'
  ) {
    return 'Cannot reach the server';
  }

  return `Connection failed: ${errorMessage}`;
};

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // Initial state
  host: '',
  shareName: '',
  username: '',
  password: '',
  domain: '',
  isConnecting: false,
  error: null,

  // Actions
  setHost: (host) => set({host, error: null}),
  setShareName: (shareName) => set({shareName, error: null}),
  setUsername: (username) => set({username, error: null}),
  setPassword: (password) => set({password, error: null}),
  setDomain: (domain) => set({domain, error: null}),
  setError: (error) => set({error}),

  validateAndConnect: async () => {
    const {host, shareName, username, password, domain} = get();

    // Validate required fields
    if (!host.trim() || !shareName.trim()) {
      set({error: 'Host and Share Name are required'});
      return false;
    }

    set({isConnecting: true, error: null});

    try {
      // Test connection by listing root directory
      await SmbModule.listFiles(
        host,
        shareName,
        '',
        username,
        password,
        domain || null,
      );
      set({isConnecting: false});
      return true;
    } catch (err: any) {
      const errorMessage = mapErrorToMessage(err);
      set({error: errorMessage, isConnecting: false});
      return false;
    }
  },

  reset: () =>
    set({
      host: '',
      shareName: '',
      username: '',
      password: '',
      domain: '',
      isConnecting: false,
      error: null,
    }),
}));
