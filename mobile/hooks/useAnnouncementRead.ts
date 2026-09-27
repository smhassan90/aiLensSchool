import { useCallback, useEffect, useState } from 'react';
import { getReadAnnouncementIds, markAnnouncementRead } from '@/lib/announcement-read';

export function useAnnouncementRead() {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const ids = await getReadAnnouncementIds();
    setReadIds(ids);
    setReady(true);
  }, []);

  useEffect(() => {
    refresh().catch(() => setReady(true));
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    await markAnnouncementRead(id);
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const isUnread = useCallback((id: string) => !readIds.has(id), [readIds]);

  return { readIds, ready, refresh, markRead, isUnread };
}
