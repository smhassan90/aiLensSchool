const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '/* hawknexa-upload-signing */';

/**
 * Release builds require android/keystore.properties (see mobile/signing/README.md).
 * Debug builds use debug.keystore only.
 */
function withAndroidUploadSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes(MARKER)) {
      return mod;
    }

    contents = contents.replace(
      'signingConfigs {',
      `${MARKER}
    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }

    signingConfigs {`,
    );

    contents = contents.replace(
      /signingConfigs \{\s*debug \{[\s\S]*?\}\s*\}/,
      `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (!keystorePropertiesFile.exists()) {
                throw new GradleException(
                    "Release signing requires android/keystore.properties. Copy mobile/signing/play-upload.properties.example and run scripts/sync-android-signing.ps1"
                )
            }
            def releaseStore = file(keystoreProperties['storeFile'])
            if (!releaseStore.exists()) {
                throw new GradleException("Release keystore not found: " + releaseStore.getAbsolutePath())
            }
            storeFile releaseStore
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }`,
    );

    contents = contents.replace(
      /buildTypes \{\s*debug \{\s*signingConfig signingConfigs\.release/,
      'buildTypes {\n        debug {\n            signingConfig signingConfigs.debug',
    );

    contents = contents.replace(
      /release \{\s*\/\/ Caution![\s\S]*?signingConfig signingConfigs\.debug/,
      `release {
            signingConfig signingConfigs.release`,
    );

    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = withAndroidUploadSigning;
