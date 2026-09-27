import { Image, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '@/lib/assets';
import { colors, fontSizes, typography } from '@/constants/theme';
import type { Student } from '@/types/api';

type StudentAvatarProps = {
  student: Pick<Student, 'firstName' | 'lastName' | 'photoUrl'>;
  size?: number;
};

export function StudentAvatar({ student, size = 44 }: StudentAvatarProps) {
  const uri = assetUrl(student.photoUrl);
  const initials = `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`;
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.photo, { width: size, height: size, borderRadius: radius }]}
        accessibilityLabel={`${student.firstName} ${student.lastName} photo`}
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.initials, { fontSize: size > 40 ? fontSizes.body : fontSizes.caption }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    backgroundColor: colors.slate100,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  fallback: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  initials: {
    fontWeight: typography.semibold,
    color: colors.primaryDark,
  },
});
