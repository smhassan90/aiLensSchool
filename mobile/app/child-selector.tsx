import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChild } from '@/providers/ChildProvider';
import { colors, radii, spacing } from '@/constants/theme';
import { LoadingState } from '@/components/ui';

export default function ChildSelectorScreen() {
  const { children, selectedChildId, selectChild, isLoading } = useChild();

  if (isLoading) return <LoadingState message="Loading children…" />;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={children}
        keyExtractor={(item) => item.student.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const active = item.student.id === selectedChildId;
          const enrollment = item.student.enrollments?.[0];
          return (
            <Pressable
              style={[styles.card, active && styles.cardActive]}
              onPress={async () => {
                await selectChild(item.student.id);
                router.back();
              }}
            >
              <Text style={styles.name}>
                {item.student.firstName} {item.student.lastName}
              </Text>
              <Text style={styles.meta}>
                {enrollment
                  ? `${enrollment.grade.name} · ${enrollment.section.name}`
                  : item.student.studentCode}
              </Text>
              <Text style={styles.relationship}>{item.relationship}{item.isPrimary ? ' · Primary' : ''}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No linked children found.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  cardActive: {
    borderColor: colors.primary,
    backgroundColor: '#f0fdfa',
  },
  name: { fontSize: 18, fontWeight: '700', color: colors.slate800 },
  meta: { color: colors.slate500, marginTop: 4 },
  relationship: { color: colors.primary, marginTop: spacing.sm, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.slate500, marginTop: spacing.lg },
});
