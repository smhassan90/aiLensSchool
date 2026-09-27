import * as SecureStore from 'expo-secure-store';

const KEY = 'sms_read_announcement_ids';

async function loadIds(): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function saveIds(ids: Set<string>): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify([...ids]));
}

export async function markAnnouncementRead(id: string): Promise<void> {
  const ids = await loadIds();
  if (ids.has(id)) return;
  ids.add(id);
  await saveIds(ids);
}

export async function getReadAnnouncementIds(): Promise<Set<string>> {
  return loadIds();
}
