const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '/* hawknexa-upload-signing */';

/**
 * Release bundles use android/keystore.properties when present (Play upload key).
 * Falls back to debug keystore for local builds without credentials.
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
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`,
    );

    contents = contents.replace(
      'signingConfig signingConfigs.debug',
      'signingConfig signingConfigs.release',
    );

    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = withAndroidUploadSigning;
