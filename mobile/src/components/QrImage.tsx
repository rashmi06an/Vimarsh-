import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../theme';

/** Thin wrapper around the QR renderer so the library import lives in one place. */
export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
      <QRCode value={value} size={size} backgroundColor="#FFFFFF" color={colors.primary} />
    </View>
  );
}
