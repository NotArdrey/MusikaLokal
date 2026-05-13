import Constants from 'expo-constants';

export const isE2EFixtureMode = () => (
  process.env.EXPO_PUBLIC_E2E === '1' ||
  Constants.expoConfig?.extra?.e2eMode === '1' ||
  Constants.expoConfig?.extra?.e2eMode === true
);

export const createE2EImageFixtureUrls = (count = 1) => (
  Array.from({ length: count }, (_, index) => (
    `https://placehold.co/800x600/png?text=E2E+Fixture+${index + 1}`
  ))
);

export const createE2EDocumentFixture = () => ({
  uri: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDAgL0tpZHNbXT4+CmVuZG9iago=',
  name: 'e2e-fixture.pdf',
  mimeType: 'application/pdf',
  type: 'application/pdf',
  size: 128,
});

export const createE2EPlaylistAudioFixture = () => ({
  uri: 'https://example.com/e2e-fixture.mp3',
  name: 'e2e-fixture.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 1024,
  durationSeconds: 30,
  extension: 'mp3',
});
