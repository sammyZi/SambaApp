/**
 * Samba File Browser App
 * React Native Android app for browsing and downloading files from SMB network shares
 *
 * @format
 */

import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PaperProvider} from 'react-native-paper';
import {ConnectionScreen} from './src/screens';
import {theme} from './src/theme';

function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={theme.colors.background}
        />
        <ConnectionScreen />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

export default App;
