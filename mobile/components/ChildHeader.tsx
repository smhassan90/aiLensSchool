import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useChild } from '@/providers/ChildProvider';
import { colors, radii, spacing } from '@/constants/theme';

export function ChildHeader() {
  const { selectedChild, children } = useChild();

  if (!selectedChild) return null;

  const enrollment = selectedChild.enrollments?.[0];
  const subtitle = enrollment
    ? `${enrollment.grade.name} · ${enrollment.section.name}`
    : selectedChild.studentCode;

  return (
    <Pressable style={styles.container} onPress={() => router.push('/child-selector')}>
      <View>
        <Text style={styles.label}>Viewing</Text>
        <Text style={styles.name}>
          {selectedChild.firstName} {selectedChild.lastName}
        </Text>
        <Text style={styles.meta}>{subtitle}</Text>
      </View>
      {children.length > 1 ? (
        <Text style={styles.switch}>Switch</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  label: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  name: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  meta: {
    color: '#ccfbf1',
    fontSize: 13,
    marginTop: 2,
  },
  switch: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
});
