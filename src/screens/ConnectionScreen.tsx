import React, {useState, useEffect} from 'react';
import {View, StyleSheet, ScrollView, KeyboardAvoidingView, TouchableOpacity, ActivityIndicator, Switch} from 'react-native';
import {TextInput, Button, Text, HelperText} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SmbModule} from '../native/SmbModule';
import {theme} from '../theme';
import {RootStackParamList} from '../navigation';
import {saveCredentials, loadCredentials, clearCredentials} from '../utils/credentialStore';
import {useConnectionStore} from '../stores/useConnectionStore';

interface DiscoveredServer {
  ip: string;
  hostname: string;
}

export const ConnectionScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  // Zustand store
  const {
    host,
    shareName,
    username,
    password,
    domain,
    isConnecting,
    error,
    setHost,
    setShareName,
    setUsername,
    setPassword,
    setDomain,
    validateAndConnect,
    reset,
  } = useConnectionStore();

  // Local state for UI-specific features
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [scanDone, setScanDone] = useState(false);

  // Load saved credentials on mount and auto-connect
  useEffect(() => {
    const loadSaved = async () => {
      const saved = await loadCredentials();
      if (saved) {
        // Auto-connect with saved credentials
        try {
          await SmbModule.listFiles(
            saved.host,
            saved.shareName,
            '',
            saved.username,
            saved.password,
            saved.domain || null,
          );
          // Success — navigate directly
          navigation.reset({
            index: 0,
            routes: [{
              name: 'FileBrowser',
              params: {credentials: saved},
            }],
          });
        } catch {
          // Auto-connect failed — fill form and let user retry
          setHost(saved.host);
          setShareName(saved.shareName);
          setUsername(saved.username);
          setPassword(saved.password);
          setDomain(saved.domain || '');
          setStayLoggedIn(true);
          setAutoConnecting(false);
        }
      } else {
        setAutoConnecting(false);
      }
    };
    loadSaved();
  }, []);

  const handleConnect = async () => {
    const success = await validateAndConnect();
    
    if (success) {
      const creds = {
        host: host.trim(),
        shareName: shareName.trim(),
        username,
        password,
        domain: domain || undefined,
      };

      // Save or clear credentials based on toggle
      if (stayLoggedIn) {
        await saveCredentials(creds);
      } else {
        await clearCredentials();
      }

      navigation.navigate('FileBrowser', {
        credentials: creds,
      });
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanDone(false);
    setDiscoveredServers([]);

    try {
      const servers = await SmbModule.scanNetwork();
      setDiscoveredServers(servers);
    } catch (err) {
      console.log('Scan failed:', err);
    } finally {
      setIsScanning(false);
      setScanDone(true);
    }
  };

  const handleSelectServer = (ip: string) => {
    setHost(ip);
  };

  if (autoConnecting) {
    return (
      <View style={styles.autoConnectContainer}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>S</Text>
        </View>
        <ActivityIndicator size="large" color={theme.colors.primary} style={{marginTop: 24}} />
        <Text style={styles.autoConnectText}>Connecting...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>S</Text>
            </View>
            <Text style={styles.appTitle}>Samba Browser</Text>
            <Text style={styles.subtitle}>
              Connect to your network share
            </Text>
          </View>

          {/* Scan Section */}
          <View style={styles.scanSection}>
            <View style={styles.scanHeader}>
              <Text style={styles.sectionLabel}>DISCOVER SERVERS</Text>
              <TouchableOpacity
                onPress={handleScan}
                disabled={isScanning}
                style={styles.scanButton}
                activeOpacity={0.7}>
                {isScanning ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Text style={styles.scanButtonText}>
                    {scanDone ? 'Rescan' : 'Scan Network'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {isScanning && (
              <View style={styles.scanStatus}>
                <Text style={styles.scanStatusText}>
                  Scanning local network for SMB servers...
                </Text>
              </View>
            )}

            {scanDone && !isScanning && discoveredServers.length === 0 && (
              <View style={styles.scanStatus}>
                <Text style={styles.scanStatusText}>
                  No SMB servers found on this network
                </Text>
              </View>
            )}

            {discoveredServers.length > 0 && (
              <View style={styles.serverList}>
                {discoveredServers.map((server, index) => (
                  <TouchableOpacity
                    key={server.ip}
                    style={[
                      styles.serverItem,
                      host === server.ip && styles.serverItemSelected,
                      index < discoveredServers.length - 1 && styles.serverItemBorder,
                    ]}
                    onPress={() => handleSelectServer(server.ip)}
                    activeOpacity={0.6}>
                    <View style={styles.serverIcon}>
                      <Text style={styles.serverIconText}>S</Text>
                    </View>
                    <View style={styles.serverInfo}>
                      <Text style={styles.serverIp}>{server.ip}</Text>
                      {server.hostname ? (
                        <Text style={styles.serverHostname}>{server.hostname}</Text>
                      ) : null}
                    </View>
                    {host === server.ip && (
                      <Text style={styles.selectedCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View>
            {/* Server Section */}
            <View style={styles.sectionGap} />
            <Text style={styles.sectionLabel}>SERVER</Text>

            <TextInput
              label="Host Address"
              value={host}
              onChangeText={setHost}
              mode="outlined"
              style={styles.input}
              placeholder="192.168.1.100"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isConnecting}
              left={<TextInput.Icon icon="server" size={18} color={theme.colors.onSurfaceVariant} />}
              error={error !== null && !host.trim()}
              outlineColor={theme.colors.outline}
              activeOutlineColor={theme.colors.primary}
              textColor={theme.colors.onSurface}
              outlineStyle={styles.inputOutline}
            />

            <TextInput
              label="Share Name"
              value={shareName}
              onChangeText={setShareName}
              mode="outlined"
              style={styles.input}
              placeholder="shared"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isConnecting}
              left={<TextInput.Icon icon="folder-network" size={18} color={theme.colors.onSurfaceVariant} />}
              error={error !== null && !shareName.trim()}
              outlineColor={theme.colors.outline}
              activeOutlineColor={theme.colors.primary}
              textColor={theme.colors.onSurface}
              outlineStyle={styles.inputOutline}
            />

            {/* Auth Section */}
            <View style={styles.sectionGap} />
            <Text style={styles.sectionLabel}>AUTHENTICATION</Text>

            <TextInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              mode="outlined"
              style={styles.input}
              placeholder="user"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isConnecting}
              left={<TextInput.Icon icon="account-outline" size={18} color={theme.colors.onSurfaceVariant} />}
              outlineColor={theme.colors.outline}
              activeOutlineColor={theme.colors.primary}
              textColor={theme.colors.onSurface}
              outlineStyle={styles.inputOutline}
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              style={styles.input}
              placeholder="password"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isConnecting}
              left={<TextInput.Icon icon="lock-outline" size={18} color={theme.colors.onSurfaceVariant} />}
              outlineColor={theme.colors.outline}
              activeOutlineColor={theme.colors.primary}
              textColor={theme.colors.onSurface}
              outlineStyle={styles.inputOutline}
            />

            <TextInput
              label="Domain (Optional)"
              value={domain}
              onChangeText={setDomain}
              mode="outlined"
              style={styles.input}
              placeholder="WORKGROUP"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isConnecting}
              left={<TextInput.Icon icon="domain" size={18} color={theme.colors.onSurfaceVariant} />}
              outlineColor={theme.colors.outline}
              activeOutlineColor={theme.colors.primary}
              textColor={theme.colors.onSurface}
              outlineStyle={styles.inputOutline}
            />
          </View>

          {/* Stay Logged In Toggle */}
          <TouchableOpacity
            style={styles.stayLoggedInRow}
            onPress={() => setStayLoggedIn(!stayLoggedIn)}
            activeOpacity={0.7}>
            <Text style={styles.stayLoggedInText}>Stay logged in</Text>
            <Switch
              value={stayLoggedIn}
              onValueChange={setStayLoggedIn}
              trackColor={{false: theme.colors.outline, true: theme.colors.primary + '66'}}
              thumbColor={stayLoggedIn ? theme.colors.primary : theme.colors.surfaceVariant}
            />
          </TouchableOpacity>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <HelperText type="error" visible={true} style={styles.errorText}>
                {error}
              </HelperText>
            </View>
          )}

          {/* Connect Button */}
          <Button
            mode="contained"
            onPress={handleConnect}
            loading={isConnecting}
            disabled={isConnecting}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            icon={isConnecting ? undefined : 'arrow-right'}
            buttonColor={theme.colors.primary}
            textColor="#FFFFFF">
            {isConnecting ? 'Connecting...' : 'Connect to Share'}
          </Button>

          {/* Helper Text */}
          <Text style={styles.helperText}>
            Make sure you're connected to the same network
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 36,
    paddingTop: 56,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  appTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 22,
    color: theme.colors.onBackground,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },

  // Scan section
  scanSection: {
    marginBottom: 4,
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scanButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceVariant,
  },
  scanButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: theme.colors.primary,
  },
  scanStatus: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  scanStatusText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  serverList: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  serverItemSelected: {
    backgroundColor: theme.colors.surfaceVariant,
  },
  serverItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  serverIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  serverIconText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: theme.colors.primary,
  },
  serverInfo: {
    flex: 1,
  },
  serverIp: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  serverHostname: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 1,
  },
  selectedCheck: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: theme.colors.primary,
    marginLeft: 8,
  },

  // Form
  sectionLabel: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 10,
    color: theme.colors.onSurfaceVariant,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    marginBottom: 12,
    backgroundColor: theme.colors.background,
    fontSize: 13,
  },
  inputOutline: {
    borderRadius: 10,
  },
  sectionGap: {
    height: 12,
  },
  errorContainer: {
    backgroundColor: theme.colors.errorContainer || '#FDECEA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error,
  },
  errorText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    margin: 0,
  },
  button: {
    marginTop: 24,
    borderRadius: 12,
    elevation: 4,
    shadowColor: theme.colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonContent: {
    paddingVertical: 10,
    flexDirection: 'row-reverse',
  },
  buttonLabel: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  helperText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 12,
  },
  stayLoggedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  stayLoggedInText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: theme.colors.onSurface,
  },
  autoConnectContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoConnectText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    marginTop: 16,
  },
});
