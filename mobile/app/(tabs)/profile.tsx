import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { useAuth } from '@/providers/AuthProvider';
import { getDisplayName } from '@/lib/auth';
import { changePasswordRequest, ApiError } from '@/lib/api';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function ProfileTabScreen() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const onChangePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      const result = await changePasswordRequest(currentPassword, newPassword);
      Alert.alert('Password updated', result.message, [
        {
          text: 'Sign in again',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]);
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not change password';
      Alert.alert('Change password failed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
        <Text style={styles.title}>{getDisplayName(user)}</Text>
        <Text style={styles.email}>{user?.username ?? user?.email}</Text>
        {user?.school ? <Text style={styles.meta}>{user.school.name}</Text> : null}

        <ChildHeader />

        <Text style={styles.sectionLabel}>Family tools</Text>
        <View style={styles.quickGrid}>
          <QuickLink icon="wallet-outline" label="Fees" onPress={() => router.push('/fees')} />
          <QuickLink icon="calendar-outline" label="Day off" onPress={() => router.push('/day-off')} />
          <QuickLink icon="camera-outline" label="Student photo" onPress={() => router.push('/student-photo')} />
          <QuickLink icon="ribbon-outline" label="Report cards" onPress={() => router.push('/report-cards')} />
          <QuickLink icon="notifications-outline" label="Alerts" onPress={() => router.push('/(tabs)/notifications')} />
          <QuickLink icon="megaphone-outline" label="News" onPress={() => router.push('/announcements')} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change password</Text>
          <Text style={styles.cardHint}>
            After the school creates your login, you can replace the temporary password here.
          </Text>
          <TextInput
            secureTextEntry
            placeholder="Current password"
            placeholderTextColor={colors.slate400}
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <TextInput
            secureTextEntry
            placeholder="New password"
            placeholderTextColor={colors.slate400}
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <Pressable
            style={[styles.save, saving && styles.saveDisabled]}
            onPress={onChangePassword}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Update password'}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.linkRow} onPress={() => router.push('/settings')}>
          <Text style={styles.link}>Settings</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/child-selector')}>
          <Text style={styles.link}>Switch child</Text>
        </Pressable>

        <Pressable
          style={styles.logout}
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickLink({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quick} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: 110 },
  eyebrow: {
    fontFamily: typography.family,
    fontSize: 11,
    fontWeight: typography.medium,
    letterSpacing: 1.1,
    color: colors.primary,
  },
  title: {
    fontFamily: typography.family,
    fontSize: 26,
    fontWeight: typography.semibold,
    color: colors.slate900,
    marginTop: 4,
  },
  email: { fontFamily: typography.family, color: colors.slate600, marginTop: spacing.xs },
  meta: { fontFamily: typography.family, color: colors.slate500, marginTop: spacing.sm },
  sectionLabel: {
    fontFamily: typography.family,
    fontSize: 15,
    fontWeight: typography.semibold,
    color: colors.slate700,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: {
    width: '31%',
    minWidth: 100,
    flexGrow: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 6,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: {
    fontFamily: typography.family,
    color: colors.slate700,
    fontWeight: typography.medium,
    fontSize: 12,
    textAlign: 'center',
  },
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  cardTitle: {
    fontFamily: typography.family,
    fontSize: 16,
    fontWeight: typography.semibold,
    color: colors.slate900,
  },
  cardHint: {
    fontFamily: typography.family,
    color: colors.slate500,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  input: {
    fontFamily: typography.family,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
    backgroundColor: colors.slate50,
    color: colors.slate800,
  },
  save: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  saveDisabled: { opacity: 0.7 },
  saveText: { fontFamily: typography.family, color: colors.white, fontWeight: typography.semibold },
  linkRow: { marginTop: spacing.md, paddingVertical: spacing.sm },
  link: { fontFamily: typography.family, color: colors.primary, fontWeight: typography.medium, fontSize: 16 },
  logout: {
    marginTop: spacing.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  logoutText: { fontFamily: typography.family, color: colors.error, fontWeight: typography.semibold },
});
