# Play Store upload signing (local only)

## Safe location on your PC

All signing secrets live here (not in git):

`D:\workspace\aiLensSchool\aiLensSchool\mobile\signing\`

| File | In git? |
|------|---------|
| `README.md`, `play-upload.properties.example` | Yes |
| `play-upload.keystore`, `play-upload.properties`, `upload_certificate.pem`, `LOCAL_SIGNING_BACKUP.md` | **No** |

**Passwords, alias, and SHA-1:** open **`LOCAL_SIGNING_BACKUP.md`** in this folder (gitignored). Copy that file to cloud/USB with the `.keystore`.

## Upload key reset (current setup)

A **new** upload key was generated for Google’s upload key reset flow.

1. In Play Console, request **Upload key reset** and upload **`upload_certificate.pem`** from this folder.
2. Wait for Google’s approval email.
3. Build the AAB:

   ```powershell
   cd D:\workspace\aiLensSchool\aiLensSchool\mobile
   powershell -ExecutionPolicy Bypass -File .\scripts\sync-android-signing.ps1
   powershell -ExecutionPolicy Bypass -File .\scripts\build-release-aab.ps1
   ```

Output: `mobile\release\hawknexa-student-release.aab`

## Previous Play upload key (before reset)

SHA-1 `FE:95:D9:5F:…` — only needed if you recover the **old** keystore instead of using the reset.
