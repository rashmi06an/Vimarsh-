import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { colors, radius, spacing } from '../../theme';
import { documentsApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const iconFor = (type: string): keyof typeof Ionicons.glyphMap => {
  if (type.includes('pdf')) return 'document-text-outline';
  if (type.includes('image')) return 'image-outline';
  if (type.includes('sheet')) return 'grid-outline';
  if (type.includes('presentation')) return 'easel-outline';
  return 'document-outline';
};

export function DocumentsSection({ meetingId, canUpload }: { meetingId: string; canUpload: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['documents', meetingId], queryFn: () => documentsApi.list(meetingId) });
  const [uploading, setUploading] = React.useState(false);

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: false,
        type: ['application/pdf', 'image/png', 'image/jpeg',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setUploading(true);
      await documentsApi.upload(meetingId, { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' });
      qc.invalidateQueries({ queryKey: ['documents', meetingId] });
    } catch (err) {
      Alert.alert('Upload failed', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (id: string, fileName: string) => {
    try {
      await documentsApi.download(id, fileName);
    } catch (err) {
      Alert.alert('Could not open', err instanceof ApiError ? err.message : 'Please try again.');
    }
  };

  const docs = q.data ?? [];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" color={colors.textMuted}>DOCUMENTS ({docs.length})</Text>
        {canUpload && (
          <Pressable style={styles.upload} onPress={pickAndUpload} disabled={uploading}>
            {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />}
            <Text variant="label" color={colors.primary}>Upload</Text>
          </Pressable>
        )}
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.gap} />
      ) : docs.length === 0 ? (
        <Card style={styles.empty}><Text variant="body" color={colors.textMuted}>No documents shared.</Text></Card>
      ) : (
        docs.map((d) => (
          <Card key={d.id} onPress={() => download(d.id, d.fileName)} style={styles.doc}>
            <Ionicons name={iconFor(d.contentType)} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="medium" numberOfLines={1}>{d.fileName}</Text>
              <Text variant="caption" color={colors.textMuted}>{prettySize(d.sizeBytes)} · {d.scanStatus === 'SKIPPED' ? 'not scanned' : d.scanStatus.toLowerCase()}</Text>
            </View>
            <Ionicons name="download-outline" size={20} color={colors.textMuted} />
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  upload: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gap: { marginVertical: spacing.md },
  empty: { paddingVertical: spacing.md },
  doc: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
});
