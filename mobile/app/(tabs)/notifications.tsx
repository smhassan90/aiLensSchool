import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { fetchNotifications, markNotificationRead } from '@/services/notifications.service';

function resolveDeepLink(deepLink?: string | null): string | null {
  if (!deepLink) return null;
  if (deepLink.startsWith('/quiz/')) return deepLink.replace('/quiz/', '/quiz/');
  if (deepLink.startsWith('/quizzes/')) return deepLink.replace('/quizzes/', '/quiz/');
  if (deepLink.startsWith('/homework/')) return deepLink;
  if (deepLink.startsWith('/announcement/')) return deepLink.replace('/announcements/', '/announcement/');
  return deepLink;
}

export default function NotificationsTabScreen() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications({ limit: 50 }),
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={<Text style={styles.title}>Notifications</Text>}
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState message="Loading notifications…" />
          ) : query.isError ? (
            <ErrorState message="Could not load notifications" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState title="No notifications" subtitle="You're all caught up." />
          )
        }
        renderItem={({ item }) => {
          const href = resolveDeepLink(item.deepLink);
          return (
            <Card
              onPress={() => {
                if (!item.readAt) markReadMutation.mutate(item.id);
                if (href) router.push(href as `/quiz/${string}`);
              }}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {!item.readAt ? <Badge label="Unread" tone="warning" /> : null}
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.slate900, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate800, flex: 1 },
  body: { color: colors.slate600, marginTop: spacing.xs, lineHeight: 20 },
  time: { color: colors.slate400, fontSize: 12, marginTop: spacing.sm },
});
