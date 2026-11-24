import Constants from 'expo-constants';

/**
 * Resolves the backend base URL.
 * Priority:
 *   1. EXPO_PUBLIC_API_URL (explicit; set this for real deployments / tunnels).
 *   2. Auto-derived from the Expo dev server host (so a physical device on the same
 *      Wi-Fi reaches the Mac automatically, e.g. http://192.168.x.x:4000).
 *   3. http://localhost:4000 (iOS simulator / web).
 */
const API_PORT = 4000;

function deriveFromDevHost(): string | null {
  // e.g. "192.168.1.5:8081" from the running Metro bundler.
  const anyConstants = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
  };
  const hostUri =
    anyConstants.expoConfig?.hostUri ??
    anyConstants.manifest?.debuggerHost ??
    anyConstants.manifest2?.extra?.expoGo?.debuggerHost ??
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split(':')[0];
  if (!host) return null;
  return `http://${host}:${API_PORT}`;
}

const explicit = process.env.EXPO_PUBLIC_API_URL;

export const API_BASE_URL = explicit && explicit.length > 0
  ? explicit
  : deriveFromDevHost() ?? `http://localhost:${API_PORT}`;

export const WS_BASE_URL = API_BASE_URL;

// Human-visible build marker so it's unambiguous which APK is installed. Bump on every release.
export const BUILD_TAG = 'v1.0.5 · build 12';
