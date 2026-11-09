import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/env';
import { tokenStore } from '../auth/storage';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean; // attach access token (default true)
  _retry?: boolean; // internal: prevent infinite refresh loops
}

// Called when the session can no longer be refreshed (forces logout in AuthContext).
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

function toMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string') return m;
  }
  return fallback;
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = await tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    await tokenStore.save(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

/** Multipart upload (documents). Sends a file URI as FormData with the access token. */
export async function uploadFile<T>(path: string, file: { uri: string; name: string; type: string }): Promise<T> {
  const token = await tokenStore.getAccess();
  const form = new FormData();
  // React Native FormData file shape.
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
  } catch {
    throw new ApiError(0, 'Network error during upload.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, toMessage(data, 'Upload failed.'));
  return data as T;
}

/**
 * Download a document. Documents are encrypted at rest on the server, so there is no presigned
 * URL to the raw object — the backend decrypts after the access check and streams the bytes.
 * We fetch that stream WITH the access token: on native, save to the cache and open the OS share
 * sheet; on web, trigger a browser download of the blob.
 */
export async function downloadDocument(documentId: string, fileName: string): Promise<void> {
  const token = await tokenStore.getAccess();
  const url = `${API_BASE_URL}/documents/${documentId}/download`;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new ApiError(res.status, 'Download failed.');
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(href);
    return;
  }

  // Native: load the file-system / sharing modules lazily so the web bundle never needs them.
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const dest = new File(Paths.cache, `${documentId}-${fileName}`);
  try {
    if (dest.exists) dest.delete();
  } catch {
    // ignore: a stale cache file is non-fatal
  }
  const saved = await File.downloadFileAsync(url, dest, { headers });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(saved.uri);
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, _retry = false } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await tokenStore.getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and that the server is reachable.');
  }

  // Transparent single refresh-and-retry on 401 for authed requests.
  if (res.status === 401 && auth && !_retry) {
    const ok = await refreshAccessToken();
    if (ok) return apiRequest<T>(path, { ...opts, _retry: true });
    await tokenStore.clear();
    onSessionExpired?.();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, toMessage(data, 'Request failed. Please try again.'));
  }
  return data as T;
}
