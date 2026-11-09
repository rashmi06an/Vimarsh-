import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme';

interface Props { children: React.ReactNode; onLeave: () => void }
interface State { error: Error | null }

/**
 * Catches failures loading the native WebRTC room (e.g. when running in Expo Go, which
 * cannot load LiveKit native modules) and shows an honest message instead of crashing.
 */
export class RoomErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      const isNative = /webrtc|native|registerGlobals|TurboModule|requireNativeComponent/i.test(this.state.error.message);
      return (
        <SafeAreaView style={styles.root}>
          <View style={styles.center}>
            <Text variant="title" color={colors.roomText} center>Live video unavailable</Text>
            <Text variant="body" color="rgba(255,255,255,0.75)" center style={styles.msg}>
              {isNative
                ? 'The meeting room needs a development build (Expo Go cannot load WebRTC). Run “npx expo run:android” or “npx expo run:ios”.'
                : this.state.error.message}
            </Text>
            <Button title="Back" variant="outline" fullWidth={false} onPress={this.props.onLeave} />
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.roomBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  msg: { maxWidth: 340 },
});
