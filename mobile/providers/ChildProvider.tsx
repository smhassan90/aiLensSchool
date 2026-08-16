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
  const { isAuthenticated, user } = useAuth();
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const query = useQuery({
    queryKey: ['children', user?.id],
    queryFn: fetchMyChildren,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedChildIdState(null);
      setHydrated(true);
      return;
    }
    (async () => {
      const stored = await getSelectedChildId();
      if (stored) setSelectedChildIdState(stored);
      setHydrated(true);
    })();
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !query.data?.length || !hydrated) return;
    const ids = query.data.map((link: ChildLink) => link.student.id);
    const valid = selectedChildId && ids.includes(selectedChildId);
    if (valid) return;
    const primary = query.data.find((link: ChildLink) => link.isPrimary) ?? query.data[0];
    if (primary) {
      setSelectedChildIdState(primary.student.id);
      void persistSelectedChildId(primary.student.id);
    }
  }, [query.data, selectedChildId, hydrated, isAuthenticated]);

  const selectChild = useCallback(async (studentId: string) => {
    setSelectedChildIdState(studentId);
    await persistSelectedChildId(studentId);
  }, []);

  const selectedChild = useMemo(() => {
    if (!selectedChildId || !query.data) return null;
    return query.data.find((link: ChildLink) => link.student.id === selectedChildId)?.student ?? null;
  }, [query.data, selectedChildId]);

  const value = useMemo<ChildContextValue>(
    () => ({
      children: query.data ?? [],
      selectedChild,
      selectedChildId: selectedChild ? selectedChildId : null,
      isLoading: !hydrated || (isAuthenticated && query.isLoading),
      selectChild,
      refetchChildren: async () => {
        await query.refetch();
      },
    }),
    [query, selectedChild, selectedChildId, hydrated, selectChild, isAuthenticated],
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
