import React from 'react';
import {StyleSheet} from 'react-native';
import {List, useTheme} from 'react-native-paper';
import {FileItem as FileItemType} from '../native/types';

interface FileItemProps {
  item: FileItemType;
  onPress: (item: FileItemType) => void;
}

export const FileItem: React.FC<FileItemProps> = ({item, onPress}) => {
  const theme = useTheme();

  const isDirectory = item.type === 'directory';
  const icon = isDirectory ? 'folder' : 'file-document-outline';

  // Format file size for display (only for files)
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const description = !isDirectory ? formatSize(item.size) : undefined;

  return (
    <List.Item
      title={item.name}
      description={description}
      left={props => <List.Icon {...props} icon={icon} />}
      onPress={() => onPress(item)}
      style={[
        styles.listItem,
        {
          backgroundColor: isDirectory
            ? theme.colors.surfaceVariant
            : theme.colors.surface,
          borderColor: theme.colors.outline,
        },
      ]}
      titleStyle={[
        styles.title,
        {
          color: isDirectory
            ? theme.colors.primary
            : theme.colors.onSurface,
        },
      ]}
      descriptionStyle={[
        styles.description,
        {color: theme.colors.onSurfaceVariant},
      ]}
      rippleColor={theme.colors.primary}
    />
  );
};

const styles = StyleSheet.create({
  listItem: {
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 4,
    paddingVertical: 4,
  },
  title: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
  },
  description: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
  },
});
