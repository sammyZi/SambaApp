import React, {useEffect, useMemo, useCallback, useState} from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  BackHandler,
  Alert,
} from 'react-native';
import {Text, ProgressBar, IconButton} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import FileViewer from 'react-native-file-viewer';
import {useDownloadStore, DownloadItem} from '../stores/useDownloadStore';
import {theme} from '../theme';
import {useNavigation} from '@react-navigation/native';

// Map file extension → icon name + colour
const getFileIcon = (fileName: string): {icon: string; color: string} => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'mp3': case 'wav': case 'flac': case 'aac': case 'ogg': case 'm4a':
      return {icon: 'music', color: '#3B6B9C'};
    case 'mp4': case 'mkv': case 'avi': case 'mov': case 'wmv':
      return {icon: 'video', color: '#E06B65'};
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'bmp':
      return {icon: 'image', color: '#7B68EE'};
    case 'pdf':
      return {icon: 'file-pdf-box', color: '#C0392B'};
    case 'doc': case 'docx':
      return {icon: 'file-word', color: '#2E86C1'};
    case 'xls': case 'xlsx':
      return {icon: 'file-excel', color: '#27AE60'};
    case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
      return {icon: 'folder-zip', color: '#8D6E63'};
    case 'txt': case 'md': case 'log':
      return {icon: 'file-document', color: '#7E8A96'};
    default:
      return {icon: 'file', color: '#7E8A96'};
  }
};

export const DownloadsScreen: React.FC = () => {
  const navigation = useNavigation();
  const {
    downloads,
    pauseDownload,
    resumeDownload,
    retryDownload,
    cancelDownload,
    deleteDownload,
    clearCompleted,
  } = useDownloadStore();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => backHandler.remove();
  }, [navigation]);

  // ─── formatters ────────────────────────────────────────────────────────────
  const formatSpeed = useCallback((bps: number): string => {
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  }, []);

  const formatSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }, []);

  const formatETA = useCallback((seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }, []);

  // ─── open a completed file ──────────────────────────────────────────────────
  const handleOpenFile = useCallback(async (item: DownloadItem) => {
    if (item.status !== 'completed' || !item.localPath) return;
    try {
      await FileViewer.open(item.localPath, {
        showOpenWithDialog: true,
        showAppsSuggestions: true,
      });
    } catch (err) {
      console.error('[Downloads] Error opening file:', err);
    }
  }, []);

  // ─── delete a single file ───────────────────────────────────────────────────
  const handleDelete = useCallback(
    (item: DownloadItem) => {
      Alert.alert(
        'Delete file',
        `Remove "${item.fileName}" from device storage?`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setDeletingId(item.id);
              await deleteDownload(item.id);
              setDeletingId(null);
            },
          },
        ],
      );
    },
    [deleteDownload],
  );

  // ─── delete all completed ───────────────────────────────────────────────────
  const handleClearCompleted = useCallback(() => {
    Alert.alert(
      'Delete all completed',
      'Remove all completed downloads from device storage?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => clearCompleted(),
        },
      ],
    );
  }, [clearCompleted]);

  // ─── render one download item ───────────────────────────────────────────────
  const renderDownloadItem = useCallback(
    ({item}: {item: DownloadItem}) => {
      const progress = item.totalBytes > 0 ? item.downloadedBytes / item.totalBytes : 0;
      const isActive = item.status === 'downloading';
      const isPaused = item.status === 'paused';
      const isCompleted = item.status === 'completed';
      const isFailed = item.status === 'failed';
      const isBeingDeleted = deletingId === item.id;
      const {icon, color} = getFileIcon(item.fileName);

      return (
        <TouchableOpacity
          style={[styles.downloadItem, isBeingDeleted && styles.downloadItemFading]}
          onPress={() => handleOpenFile(item)}
          disabled={!isCompleted || isBeingDeleted}
          activeOpacity={isCompleted ? 0.7 : 1}>
          {/* File icon */}
          <View style={[styles.fileIconContainer, {backgroundColor: color + '20'}]}>
            <Icon
              name={
                isCompleted
                  ? icon
                  : isFailed
                  ? 'alert-circle'
                  : 'file-download-outline'
              }
              size={24}
              color={isFailed ? theme.colors.error : color}
            />
          </View>

          {/* Info + actions */}
          <View style={styles.downloadBody}>
            {/* Row 1: name + action buttons */}
            <View style={styles.downloadHeader}>
              <Text style={styles.fileName} numberOfLines={1}>
                {item.fileName}
              </Text>
              <View style={styles.downloadActions}>
                {isActive && (
                  <IconButton
                    icon="pause"
                    size={18}
                    onPress={() => pauseDownload(item.id)}
                    iconColor={theme.colors.primary}
                    style={styles.actionBtn}
                  />
                )}
                {isPaused && (
                  <IconButton
                    icon="play"
                    size={18}
                    onPress={() => resumeDownload(item.id)}
                    iconColor={theme.colors.primary}
                    style={styles.actionBtn}
                  />
                )}
                {/* Active/paused: cancel (removes entry, native keeps writing but we ignore it) */}
                {(isActive || isPaused) && (
                  <IconButton
                    icon="close"
                    size={18}
                    onPress={() => cancelDownload(item.id)}
                    iconColor={theme.colors.error}
                    style={styles.actionBtn}
                  />
                )}
                {isFailed && (
                  <IconButton
                    icon="refresh"
                    size={18}
                    onPress={() => retryDownload(item.id)}
                    iconColor={theme.colors.primary}
                    style={styles.actionBtn}
                    accessibilityLabel={`Retry ${item.fileName}`}
                  />
                )}
                {(isCompleted || isFailed) && (
                  <IconButton
                    icon="trash-can-outline"
                    size={18}
                    onPress={() => handleDelete(item)}
                    iconColor={theme.colors.error}
                    style={styles.actionBtn}
                    disabled={isBeingDeleted}
                    accessibilityLabel={`Delete ${item.fileName}`}
                  />
                )}
              </View>
            </View>

            {/* Row 2: size */}
            <Text style={styles.fileSize}>
              {isCompleted
                ? formatSize(item.totalBytes)
                : `${formatSize(item.downloadedBytes)} / ${formatSize(item.totalBytes)}`}
            </Text>

            {/* Progress bar for active / paused */}
            {(isActive || isPaused) && (
              <>
                <ProgressBar
                  progress={progress}
                  color={isPaused ? theme.colors.onSurfaceVariant : theme.colors.primary}
                  style={styles.progressBar}
                />
                <View style={styles.downloadStats}>
                  <Text style={styles.statsText}>{(progress * 100).toFixed(1)}%</Text>
                  {isActive && item.speed > 0 && (
                    <>
                      <Text style={styles.statsDot}>•</Text>
                      <Text style={styles.statsText}>{formatSpeed(item.speed)}</Text>
                      <Text style={styles.statsDot}>•</Text>
                      <Text style={styles.statsText}>ETA {formatETA(item.eta)}</Text>
                    </>
                  )}
                  {isPaused && (
                    <>
                      <Text style={styles.statsDot}>•</Text>
                      <Text style={styles.statsText}>
                        Paused · resumes from {formatSize(item.downloadedBytes)}
                      </Text>
                    </>
                  )}
                </View>
              </>
            )}

            {/* Status row for completed */}
            {isCompleted && (
              <View style={styles.statusRow}>
                <Icon name="check-circle" size={13} color={theme.colors.primary} />
                <Text style={styles.completedText}>Saved · tap to open</Text>
              </View>
            )}

            {/* Status row for failed */}
            {isFailed && (
              <View style={styles.statusRow}>
                <Icon name="alert" size={13} color={theme.colors.error} />
                <Text style={styles.failedText}>{item.error ?? 'Download failed'}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [
      deletingId,
      handleOpenFile,
      handleDelete,
      pauseDownload,
      resumeDownload,
      retryDownload,
      cancelDownload,
      formatSize,
      formatSpeed,
      formatETA,
    ],
  );

  // ─── sorted lists ───────────────────────────────────────────────────────────
  const activeDownloads = useMemo(
    () => downloads.filter(d => d.status === 'downloading' || d.status === 'paused'),
    [downloads],
  );
  const completedDownloads = useMemo(
    () => downloads.filter(d => d.status === 'completed'),
    [downloads],
  );
  const failedDownloads = useMemo(
    () => downloads.filter(d => d.status === 'failed'),
    [downloads],
  );
  const sortedDownloads = useMemo(
    () => [...activeDownloads, ...failedDownloads, ...completedDownloads],
    [activeDownloads, failedDownloads, completedDownloads],
  );

  const keyExtractor = useCallback((item: DownloadItem) => item.id, []);

  // Total size of completed files on disk
  const cachedSize = useMemo(
    () => completedDownloads.reduce((acc, d) => acc + (d.totalBytes ?? 0), 0),
    [completedDownloads],
  );

  // ─── render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Downloads</Text>
            {cachedSize > 0 && (
              <Text style={styles.headerSubtitle}>
                {completedDownloads.length} file{completedDownloads.length !== 1 ? 's' : ''} · {formatSize(cachedSize)} on device
              </Text>
            )}
          </View>
        </View>
        {completedDownloads.length > 0 && (
          <TouchableOpacity onPress={handleClearCompleted} style={styles.deleteAllButton}>
            <Icon name="trash-can-outline" size={16} color={theme.colors.error} />
            <Text style={styles.deleteAllText}>Delete all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List or empty state */}
      {downloads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="download-off" size={64} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.emptyText}>No downloads yet</Text>
          <Text style={styles.emptySubText}>
            Use the download button beside a file to save it here.{'\n'}Video playback history is managed by your external player.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedDownloads}
          renderItem={renderDownloadItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={6}
          windowSize={7}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    marginRight: 14,
  },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 20,
    color: theme.colors.onSurface,
  },
  headerSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 1,
  },
  deleteAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.error + '60',
    backgroundColor: theme.colors.error + '10',
  },
  deleteAllText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: theme.colors.error,
  },
  listContent: {
    padding: 16,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  downloadItemFading: {
    opacity: 0.4,
  },
  fileIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  downloadBody: {
    flex: 1,
  },
  downloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  fileName: {
    flex: 1,
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  actionBtn: {
    margin: 0,
    width: 32,
    height: 32,
  },
  fileSize: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
  },
  progressBar: {
    height: 5,
    borderRadius: 3,
    marginBottom: 6,
  },
  downloadStats: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  statsText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  statsDot: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  completedText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.primary,
  },
  failedText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.error,
    flexShrink: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: theme.colors.onSurface,
    marginTop: 20,
  },
  emptySubText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
