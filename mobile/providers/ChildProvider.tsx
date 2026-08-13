import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSelectedChildId, setSelectedChildId as persistSelectedChildId } from '@/lib/storage';
import { fetchMyChildren } from '@/services/children.service';
import { ChildLink, Student } from '@/types/api';
import { useAuth } from '@/providers/AuthProvider';

interface ChildContextValue {
  children: ChildLink[];
  selectedChild: Student | null;
  selectedChildId: string | null;
  isLoading: boolean;
  selectChild: (studentId: string) => Promise<void>;
  refetchChildren: () => Promise<void>;
}

const ChildContext = createContext<ChildContextValue | undefined>(undefined);

export function ChildProvider({ children }: PropsWithChildren) {
  const { isAuthenticated } = useAuth();
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const query = useQuery({
    queryKey: ['children'],
    queryFn: fetchMyChildren,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    (async () => {
      const stored = await getSelectedChildId();
      if (stored) setSelectedChildIdState(stored);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!query.data?.length || selectedChildId) return;
    const primary = query.data.find((link) => link.isPrimary) ?? query.data[0];
    if (primary) {
      setSelectedChildIdState(primary.student.id);
      void persistSelectedChildId(primary.student.id);
    }
  }, [query.data, selectedChildId]);

  const selectChild = useCallback(async (studentId: string) => {
    setSelectedChildIdState(studentId);
    await persistSelectedChildId(studentId);
  }, []);

  const selectedChild = useMemo(() => {
    if (!selectedChildId || !query.data) return null;
    return query.data.find((link) => link.student.id === selectedChildId)?.student ?? null;
  }, [query.data, selectedChildId]);

  const value = useMemo<ChildContextValue>(
    () => ({
      children: query.data ?? [],
      selectedChild,
      selectedChildId,
      isLoading: !hydrated || query.isLoading,
      selectChild,
      refetchChildren: async () => {
        await query.refetch();
      },
    }),
    [query, selectedChild, selectedChildId, hydrated, selectChild],
  );

  return <ChildContext.Provider value={value}>{children}</ChildContext.Provider>;
}

export function useChild(): ChildContextValue {
  const context = useContext(ChildContext);
  if (!context) {
    throw new Error('useChild must be used within ChildProvider');
  }
  return context;
}

export function useRequiredStudentId(): string {
  const { selectedChildId } = useChild();
  if (!selectedChildId) {
    throw new Error('No child selected — studentId is required for parent API calls');
  }
  return selectedChildId;
}
