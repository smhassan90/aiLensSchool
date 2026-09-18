import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Card, EmptyState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing, typography } from '@/constants/theme';
import { fetchStudentPhotoAssets, uploadStudentPhoto } from '@/services/parent-records.service';

export default function StudentPhotoScreen() {
  const { selectedChildId } = useChild();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const assetsQuery = useQuery({
    queryKey: ['student-photo-assets', selectedChildId],
    queryFn: () => fetchStudentPhotoAssets(selectedChildId!),
    enabled: Boolean(selectedChildId),
  });
  const upload = useMutation({
    mutationFn: () =>
      uploadStudentPhoto(selectedChildId!, {
        uri: asset!.uri,
        fileName: asset!.fileName,
        mimeType: asset!.mimeType,
      }),
    onSuccess: () => {
      assetsQuery.refetch();
      Alert.alert('Photo submitted', 'The school will review the photo before using it.');
    },
    onError: (error) => Alert.alert('Upload failed', error instanceof Error ? error.message : 'Try again.'),
  });

  if (!selectedChildId) return <EmptyState title="Select a child" />;

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose a student picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled) setAsset(result.assets[0]);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a student picture.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled) setAsset(result.assets[0]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <ChildHeader />
        <Text style={styles.title}>Student picture</Text>
        <Text style={styles.hint}>Choose a clear, recent photo. The school can accept or discard it before using it on cards and reports.</Text>
        <Card>
          {asset ? <Image source={{ uri: asset.uri }} style={styles.preview} /> : null}
          <View style={styles.actions}>
            <Pressable style={styles.button} onPress={choosePhoto}>
              <Text style={styles.buttonText}>{asset ? 'Choose another photo' : 'Choose photo'}</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={takePhoto}>
              <Text style={styles.buttonText}>Take photo</Text>
            </Pressable>
          </View>
          {asset ? (
            <Pressable
              style={[styles.button, styles.submit, upload.isPending && styles.disabled]}
              disabled={upload.isPending}
              onPress={() => upload.mutate()}
            >
              <Text style={styles.buttonText}>{upload.isPending ? 'Uploading…' : 'Submit for review'}</Text>
            </Pressable>
          ) : null}
        </Card>
        <Text style={styles.sectionTitle}>Submission history</Text>
        {assetsQuery.data?.map((item) => (
          <Card key={item.id}>
            <View style={styles.statusRow}>
              <Text style={styles.status}>{item.status}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
            {item.reviewNote ? <Text style={styles.note}>{item.reviewNote}</Text> : null}
          </Card>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.slate50, flex: 1 },
  content: { padding: spacing.md },
  title: { color: colors.slate900, fontFamily: typography.family, fontSize: 26, fontWeight: typography.semibold, marginTop: spacing.md },
  hint: { color: colors.slate600, fontFamily: typography.family, fontSize: 14, lineHeight: 21, marginVertical: spacing.sm },
  preview: { alignSelf: 'center', borderRadius: 12, height: 260, marginBottom: spacing.md, width: 195 },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, padding: spacing.md },
  actions: { gap: spacing.sm },
  submit: { backgroundColor: colors.primaryDark, marginTop: spacing.sm },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontFamily: typography.family, fontWeight: typography.semibold },
  sectionTitle: { color: colors.slate800, fontFamily: typography.family, fontSize: 19, fontWeight: typography.semibold, marginTop: spacing.lg, marginBottom: spacing.sm },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  status: { color: colors.primaryDark, fontFamily: typography.family, fontWeight: typography.semibold },
  date: { color: colors.slate500, fontFamily: typography.family, fontSize: 13 },
  note: { color: colors.slate600, fontFamily: typography.family, marginTop: spacing.sm },
});
