import React, {useEffect} from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import {Text, Button, Snackbar} from 'react-native-paper';
import {useRoute, useNavigation, CommonActions} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {FileItem} from '../native/types';
import {theme} from '../theme';
import {RootStackParamList} from '../navigation';
import {clearCredentials} from '../utils/credentialStore';
import {useFileBrowserStore} from '../stores/useFileBrowserStore';

type FileBrowserRouteProp = RouteProp<RootStackParamList, 'FileBrowser'>;

// Map common file extensions to icon names
const getFileIcon = (name: string, type: string): {iconName: string; color: string} => {
  if (type === 'directory') {
    return {iconName: 'folder', color: '#E8A838'};
  }
  const ext = name.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'bmp':
      return {iconName: 'image', color: '#7B68EE'};
    case 'mp4': case 'mkv': case 'avi': case 'mov': case 'wmv':
      return {iconName: 'video', color: '#E06B65'};
    case 'mp3': case 'wav': case 'flac': case 'aac': case 'ogg':
      return {iconName: 'music', color: '#3B6B9C'};
    case 'pdf':
      return {iconName: 'file-pdf-box', color: '#C0392B'};
    case 'doc': case 'docx':
      return {iconName: 'file-word', color: '#2E86C1'};
    case 'xls': case 'xlsx':
      return {iconName: 'file-excel', color: '#27AE60'};
    case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
      return {iconName: 'folder-zip', color: '#8D6E63'};
    case 'txt': case 'md': case 'log':
      return {iconName: 'file-document', color: '#7E8A96'};
    case 'apk':
      return {iconName: 'android', color: '#27AE60'};
    default:
      return {iconName: 'file', color: '#7E8A96'};
  }
};

export const FileBrowserScreen: React.FC = () => {
  const route = useRoute<FileBrowserRouteProp>();
  const navigation = useNavigation();
  const {credentials, initialPath = ''} = route.params;

  // Zustand store
  const {
    currentPath,
    navigationStack,
    items,
    isLoading,
    error,
    downloadingFile,
    snackbarVisible,
    snackbarMessage,
    snackbarType,
    setCredentials,
    setCurrentPath,
    loadFiles,
    navigateToFolder,
    navigateBack,
    downloadFile,
    hideSnackbar,
    reset,
  } = useFileBrowserStore();

  // Initialize store with credentials and path
  useEffect(() => {
    setCredentials(credentials);
    setCurrentPath(initialPath);
    loadFiles(initialPath);

    return () => {
      reset();
    };
  }, []);

  const handleRetry = () => {
    loadFiles(currentPath);
  };

  const handleSignOut = async () => {
    await clearCredentials();
    reset();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{name: 'Connection'}],
      }),
    );
  };

  const onFolderPress = (folderName: string) => {
    navigateToFolder(folderName);
  };

  const onFilePress = (fileName: string, filePath: string) => {
    downloadFile(fileName, filePath);
  };

  const onBackPress = () => {
    return navigateBack();
  };

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );

    return () => backHandler.remove();
  }, [navigationStack]);

  const renderHeader = () => {
    const canGoBack = navigationStack.length > 0;
    const pathParts = currentPath ? currentPath.split('/') : [];
    const currentFolder = pathParts.length > 0 ? pathParts[pathParts.length - 1] : credentials.shareName;

    return (
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            {canGoBack && (
              <TouchableOpacity
                onPress={onBackPress}
                style={styles.backButton}
                activeOpacity={0.7}>
                <Icon name="chevron-left" size={24} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
            <View>
              <Text style={styles.headerTitle}>{currentFolder}</Text>
              <Text style={styles.headerSubtitle}>
                {credentials.host} · {items.length} items
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutButton}
            activeOpacity={0.7}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Breadcrumb */}
        {currentPath !== '' && (
          <View style={styles.breadcrumb}>
            <Text style={styles.breadcrumbText} numberOfLines={1}>
              /{currentPath}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderItem = ({item, index}: {item: FileItem; index: number}) => {
    const {iconName, color} = getFileIcon(item.name, item.type);
    const isLast = index === items.length - 1;
    const isDownloading = downloadingFile === item.name;

    const handlePress = () => {
      if (item.type === 'directory') {
        onFolderPress(item.name);
      } else {
        onFilePress(item.name, item.path);
      }
    };

    return (
      <TouchableOpacity
        style={[styles.fileItem, !isLast && styles.fileItemBorder]}
        activeOpacity={0.6}
        onPress={handlePress}
        disabled={isDownloading}>
        <View style={[styles.fileIcon, {backgroundColor: color + '20'}]}>
          <Icon name={iconName} size={24} color={color} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>
            {item.type === 'directory' ? 'Folder' : formatFileSize(item.size)}
          </Text>
        </View>
        {item.type === 'directory' && (
          <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        )}
        {isDownloading && (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading files...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Icon name="alert-circle" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Button
            mode="contained"
            onPress={handleRetry}
            style={styles.retryButton}
            buttonColor={theme.colors.primary}
            textColor="#FFFFFF">
            Retry
          </Button>
        </View>
      );
    }

    if (items.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Icon name="folder-open" size={64} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.emptyText}>This folder is empty</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.path}-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderContent()}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={hideSnackbar}
        duration={4000}
        style={[
          styles.snackbar,
          snackbarType === 'error' && styles.snackbarError,
        ]}>
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 17,
    color: theme.colors.onSurface,
  },
  headerSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 1,
  },
  signOutButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceVariant,
  },
  signOutText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: theme.colors.error,
  },
  breadcrumb: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 6,
  },
  breadcrumbText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  listContent: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  fileItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  fileMeta: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    marginTop: 16,
  },
  errorText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    borderRadius: 10,
  },
  emptyText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  snackbar: {
    backgroundColor: theme.colors.primary,
  },
  snackbarError: {
    backgroundColor: theme.colors.error,
  },
});
