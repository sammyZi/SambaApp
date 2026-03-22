import React from 'react';
import {View, StyleSheet, FlatList, TouchableOpacity} from 'react-native';
import {Text, ProgressBar, IconButton} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useDownloadStore, DownloadItem} from '../stores/useDownloadStore';
import {theme} from '../theme';

export const DownloadsScreen: React.FC = () => {
  const {downloads, pauseDownload, resumeDownload, cancelDownload, clearCompleted} = useDownloadStore();

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const renderDownloadItem = ({item}: {item: DownloadItem}) => {
    const progress = item.totalBytes > 0 ? item.downloadedBytes / item.totalBytes : 0;
    const isActive = item.status === 'downloading';
    const isPaused = item.status === 'paused';
    const isCompleted = item.status === 'completed';
    const isFailed = item.status === 'failed';

    return (
      <View style={styles.downloadItem}>
        <View style={styles.downloadHeader}>
          <View style={styles.fileIconContainer}>
            <Icon 
              name={isCompleted ? 'check-circle' : isFailed ? 'alert-circle' : 'file-download'} 
              size={24} 
              color={isCompleted ? theme.colors.primary : isFailed ? theme.colors.error : theme.colors.onSurfaceVariant} 
            />
          </View>
          <View style={styles.downloadInfo}>
            <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
            <Text style={styles.fileSize}>
              {formatSize(item.downloadedBytes)} / {formatSize(item.totalBytes)}
            </Text>
          </View>
          <View style={styles.downloadActions}>
            {isActive && (
              <IconButton
                icon="pause"
                size={20}
                onPress={() => pauseDownload(item.id)}
                iconColor={theme.colors.primary}
              />
            )}
            {isPaused && (
              <IconButton
                icon="play"
                size={20}
                onPress={() => resumeDownload(item.id)}
                iconColor={theme.colors.primary}
              />
            )}
            <IconButton
              icon="close"
              size={20}
              onPress={() => cancelDownload(item.id)}
              iconColor={theme.colors.error}
            />
          </View>
        </View>

        {!isCompleted && !isFailed && (
          <>
            <ProgressBar 
              progress={progress} 
              color={isPaused ? theme.colors.onSurfaceVariant : theme.colors.primary}
              style={styles.progressBar}
            />
            <View style={styles.downloadStats}>
              <Text style={styles.statsText}>
                {(progress * 100).toFixed(1)}%
              </Text>
              {isActive && (
                <>
                  <Text style={styles.statsText}>•</Text>
                  <Text style={styles.statsText}>
                    {formatSpeed(item.speed)}
                  </Text>
                  <Text style={styles.statsText}>•</Text>
                  <Text style={styles.statsText}>
                    ETA: {formatETA(item.eta)}
                  </Text>
                </>
              )}
              {isPaused && (
                <>
                  <Text style={styles.statsText}>•</Text>
                  <Text style={styles.statsText}>Paused</Text>
                </>
              )}
            </View>
          </>
        )}

        {isCompleted && (
          <View style={styles.completedContainer}>
            <Icon name="check" size={16} color={theme.colors.primary} />
            <Text style={styles.completedText}>Download completed</Text>
          </View>
        )}

        {isFailed && (
          <View style={styles.failedContainer}>
            <Icon name="alert" size={16} color={theme.colors.error} />
            <Text style={styles.failedText}>{item.error || 'Download failed'}</Text>
          </View>
        )}
      </View>
    );
  };

  const activeDownloads = downloads.filter((d: DownloadItem) => d.status === 'downloading' || d.status === 'paused');
  const completedDownloads = downloads.filter((d: DownloadItem) => d.status === 'completed');
  const failedDownloads = downloads.filter((d: DownloadItem) => d.status === 'failed');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Downloads</Text>
        {completedDownloads.length > 0 && (
          <TouchableOpacity onPress={clearCompleted} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear Completed</Text>
          </TouchableOpacity>
        )}
      </View>

      {downloads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="download-off" size={64} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.emptyText}>No downloads yet</Text>
        </View>
      ) : (
        <FlatList
          data={[...activeDownloads, ...failedDownloads, ...completedDownloads]}
          renderItem={renderDownloadItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
    paddingVertical: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 20,
    color: theme.colors.onSurface,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceVariant,
  },
  clearButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: theme.colors.primary,
  },
  listContent: {
    padding: 16,
  },
  downloadItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  downloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  downloadInfo: {
    flex: 1,
  },
  fileName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  fileSize: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 8,
  },
  downloadStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statsText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  completedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  completedText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: theme.colors.primary,
  },
  failedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  failedText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: theme.colors.error,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    marginTop: 16,
  },
});
