// Expo inlines `EXPO_PUBLIC_` variables when Metro bundles the app, from `.env`. Jest reads
// `process.env` at run time and loads no `.env` file, so the variables are set here, with the
// committed development values, independent of any local override. A test that needs another
// configuration sets it and restores these values afterwards.
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';
process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
