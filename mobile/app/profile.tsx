import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/AuthProvider';
import { getDisplayName } from '@/lib/auth';
import { changePasswordRequest, ApiError } from '@/lib/api';
import { colors, spacing } from '@/constants/theme';

export default function ProfileScreen() {
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
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{getDisplayName(user)}</Text>
        <Text style={styles.email}>{user?.username ?? user?.email}</Text>
        {user?.school ? <Text style={styles.meta}>{user.school.name}</Text> : null}
        <Text style={styles.roles}>{user?.roles.join(', ')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change password</Text>
          <Text style={styles.cardHint}>
            After the school creates your login, you can replace the temporary password here.
          </Text>
          <TextInput
            secureTextEntry
            placeholder="Current password"
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <TextInput
            secureTextEntry
            placeholder="New password"
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg },
  title: { fontSize: 28, fontWeight: '800', color: colors.slate900 },
  email: { color: colors.slate600, marginTop: spacing.xs },
  meta: { color: colors.slate500, marginTop: spacing.sm },
  roles: { color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate900 },
  cardHint: { color: colors.slate500, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
    backgroundColor: colors.slate50,
  },
  save: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  saveDisabled: { opacity: 0.7 },
  saveText: { color: colors.white, fontWeight: '700' },
  linkRow: { marginTop: spacing.lg, paddingVertical: spacing.sm },
  link: { color: colors.primary, fontWeight: '600', fontSize: 16 },
  logout: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: 'center',
  },
  logoutText: { color: colors.error, fontWeight: '700' },
});
