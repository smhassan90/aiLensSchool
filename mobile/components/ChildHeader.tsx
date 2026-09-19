import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useChild } from '@/providers/ChildProvider';
import { colors, radii, spacing, typography } from '@/constants/theme';

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
    fontFamily: typography.family,
    fontSize: 12,
    fontWeight: typography.medium,
    textTransform: 'uppercase',
  },
  name: {
    color: colors.white,
    fontFamily: typography.family,
    fontSize: 18,
    fontWeight: typography.semibold,
    marginTop: 2,
  },
  meta: {
    color: '#ccfbf1',
    fontFamily: typography.family,
    fontSize: 13,
    marginTop: 2,
  },
  switch: {
    color: colors.white,
    fontFamily: typography.family,
    fontWeight: typography.medium,
    fontSize: 14,
  },
});
