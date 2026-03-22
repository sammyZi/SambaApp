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
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ConnectionScreen, FileBrowserScreen} from './src/screens';
import {DownloadsScreen} from './src/screens/DownloadsScreen';
import {theme} from './src/theme';
import {RootStackParamList} from './src/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={theme.colors.background}
        />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Connection"
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: {backgroundColor: theme.colors.background},
            }}>
            <Stack.Screen name="Connection" component={ConnectionScreen} />
            <Stack.Screen
              name="FileBrowser"
              component={FileBrowserScreen}
              options={{headerShown: false}}
            />
            <Stack.Screen
              name="Downloads"
              component={DownloadsScreen}
              options={{headerShown: false}}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

export default App;
