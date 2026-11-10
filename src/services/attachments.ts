import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { generateId } from '../utils/id';

/** The most photos one entry keeps; their paths have to fit the synced record. */
export const MAX_ATTACHMENTS = 10;

const KEPT = /\/receipts\/receipt_[^/]+$/;

/**
 * Photos arrive in the cache folder, which Android empties when storage runs
 * low (and "Clear cache" always does). Those attached to a saved entry are
 * copied into the app's own documents first, so they last as long as the entry.
 */
export function keepAttachments(uris: string[]): Promise<string[]> {
  if (Platform.OS === 'web') return Promise.resolve(uris);
  const folder = new Directory(Paths.document, 'receipts');
  return Promise.all(
    uris.map(async (uri) => {
      if (KEPT.test(uri)) return uri;
      try {
        folder.create({ idempotent: true });
        const extension = /\.[a-z0-9]{2,5}$/i.exec(uri)?.[0] ?? '.jpg';
        const kept = new File(folder, generateId('receipt') + extension);
        await new File(uri).copy(kept);
        return kept.uri;
      } catch {
        // A photo that can't be copied is still better attached where it is
        // than dropped.
        return uri;
      }
    })
  );
}
