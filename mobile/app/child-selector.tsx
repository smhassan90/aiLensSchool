import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StudentAvatar } from '@/components/StudentAvatar';
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
              <View style={styles.row}>
                <StudentAvatar student={item.student} size={48} />
                <View style={styles.textWrap}>
                  <Text style={styles.name}>
                    {item.student.firstName} {item.student.lastName}
                  </Text>
                  <Text style={styles.meta}>
                    {enrollment
                      ? `${enrollment.grade.name} · ${enrollment.section.name}`
                      : item.student.studentCode}
                  </Text>
                  <Text style={styles.relationship}>
                    {item.relationship}{item.isPrimary ? ' · Primary' : ''}
                  </Text>
                </View>
              </View>
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
    backgroundColor: colors.accentSoft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  textWrap: { flex: 1 },
  name: { fontSize: 17, fontWeight: '600', color: colors.slate900 },
  meta: { fontSize: 13, color: colors.slate600, marginTop: 2 },
  relationship: { fontSize: 12, color: colors.slate500, marginTop: 4 },
  empty: { textAlign: 'center', color: colors.slate500, marginTop: spacing.lg },
});
