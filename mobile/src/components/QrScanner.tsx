import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Text } from './Text';
import { Button } from './Button';
import { colors, spacing } from '../theme';
import { t } from '../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
}

/**
 * Full-screen QR scanner used during invite-based registration. Camera permission is
 * requested lazily; if it is denied the member can still close and type the code by hand.
 */
export function QrScanner({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);

  const handle = (data: string) => {
    if (handled || !data) return;
    setHandled(true);
    onScanned(data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => setHandled(false)}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => handle(data)}
          />
        ) : null}

        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          <View style={styles.top}>
            <Text variant="title" color="#FFFFFF">{t('scan.title')}</Text>
            <Text variant="body" color="rgba(255,255,255,0.85)" style={styles.prompt}>
              {permission?.granted ? t('scan.prompt') : t('scan.permission')}
            </Text>
          </View>

          <View style={styles.frame} pointerEvents="none" />

          <View style={styles.bottom}>
            {!permission?.granted && (
              <Button title={t('scan.grant')} variant="accent" onPress={requestPermission} />
            )}
            <Button title={t('scan.manual')} variant="ghost" onPress={onClose} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between', padding: spacing.lg },
  top: { marginTop: spacing.lg },
  prompt: { marginTop: spacing.sm },
  frame: {
    alignSelf: 'center',
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  bottom: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 16,
  },
});
