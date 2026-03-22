import EncryptedStorage from 'react-native-encrypted-storage';

const CREDENTIALS_KEY = 'smb_saved_credentials';

export interface SavedCredentials {
  host: string;
  shareName: string;
  username: string;
  password: string;
  domain?: string;
}

export async function saveCredentials(credentials: SavedCredentials): Promise<void> {
  try {
    await EncryptedStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  } catch (error) {
    console.warn('Failed to save credentials:', error);
  }
}

export async function loadCredentials(): Promise<SavedCredentials | null> {
  try {
    const data = await EncryptedStorage.getItem(CREDENTIALS_KEY);
    if (data) {
      return JSON.parse(data) as SavedCredentials;
    }
  } catch (error) {
    console.warn('Failed to load credentials:', error);
  }
  return null;
}

export async function clearCredentials(): Promise<void> {
  try {
    await EncryptedStorage.removeItem(CREDENTIALS_KEY);
  } catch (error) {
    console.warn('Failed to clear credentials:', error);
  }
}
