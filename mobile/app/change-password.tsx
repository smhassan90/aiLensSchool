import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Href, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/AuthProvider';
import { changePasswordRequest, ApiError } from '@/lib/api';
import { colors, radii, spacing } from '@/constants/theme';

export default function ChangePasswordScreen() {
  const { logout, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Re-enter the new password.');
      return;
    }
    setSaving(true);
    try {
      await changePasswordRequest(currentPassword, newPassword);
      Alert.alert('Password updated', 'Sign in again with your new password.', [
        {
          text: 'Continue',
          onPress: async () => {
            await logout();
            router.replace('/login' as Href);
          },
        },
      ]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not change password';
      Alert.alert('Change password failed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Update your password</Text>
        <Text style={styles.body}>
          {user?.firstName ? `Hi ${user.firstName}. ` : ''}
          Your school gave you a temporary password. Choose a new one before continuing.
        </Text>
        <TextInput
          secureTextEntry
          placeholder="Current (temporary) password"
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
        <TextInput
          secureTextEntry
          placeholder="Confirm new password"
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <Pressable
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={saving}
        >
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save new password'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  body: { fontSize: 15, lineHeight: 22, color: colors.slate600 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.white,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
});
