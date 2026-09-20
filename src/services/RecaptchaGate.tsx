import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { getCloudConfig } from './cloudConfig';

export interface RecaptchaHandle {
  /** Firebase's ApplicationVerifier contract. */
  type: 'recaptcha';
  verify: () => Promise<string>;
  reset: () => void;
}

/**
 * Phone verification through the Firebase web SDK needs a reCAPTCHA token, and
 * reCAPTCHA needs a DOM. This hosts the widget in a WebView and hands the token
 * back, which is what the deprecated expo-firebase-recaptcha did before it
 * started pulling in modules that no longer build.
 */
function buildHtml(apiKey: string, authDomain: string, projectId: string, appId: string) {
  const config = JSON.stringify({ apiKey, authDomain, projectId, appId });
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #container { display: flex; align-items: center; justify-content: center; padding: 16px; }
    </style>
  </head>
  <body>
    <div id="container"><div id="recaptcha"></div></div>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
    <script>
      var post = function (message) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      };
      try {
        firebase.initializeApp(${config});
        var verifier = new firebase.auth.RecaptchaVerifier('recaptcha', {
          size: 'normal',
          callback: function (token) { post({ type: 'token', token: token }); },
          'expired-callback': function () { post({ type: 'expired' }); },
          'error-callback': function () { post({ type: 'error', message: 'reCAPTCHA failed' }); },
        });
        verifier.render().then(function () { post({ type: 'ready' }); }).catch(function (e) {
          post({ type: 'error', message: String(e && e.message ? e.message : e) });
        });
      } catch (e) {
        post({ type: 'error', message: String(e && e.message ? e.message : e) });
      }
    </script>
  </body>
</html>`;
}

export const RecaptchaGate = forwardRef<RecaptchaHandle>((_props, ref) => {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const pending = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);

  const settle = (token: string | null, error?: string) => {
    const current = pending.current;
    pending.current = null;
    setVisible(false);
    if (!current) return;
    if (token) current.resolve(token);
    else current.reject(new Error(error ?? 'Verification cancelled'));
  };

  useImperativeHandle(ref, () => ({
    type: 'recaptcha' as const,
    verify: () =>
      new Promise<string>((resolve, reject) => {
        pending.current = { resolve, reject };
        setVisible(true);
      }),
    reset: () => settle(null, 'Verification reset'),
  }));

  const config = visible ? getCloudConfig() : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => settle(null)}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <Text style={[styles.title, { color: theme.text }]}>Quick security check</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Confirms the request is coming from a real device before we text you a code.
          </Text>
          <View style={styles.webWrap}>
            {config && (
              <WebView
                originWhitelist={['*']}
                javaScriptEnabled
                source={{
                  html: buildHtml(config.apiKey, config.authDomain, config.projectId, config.appId),
                  baseUrl: `https://${config.authDomain}`,
                }}
                style={styles.web}
                onError={({ nativeEvent }) =>
                  settle(null, `The security check could not load: ${nativeEvent.description ?? 'no connection'}`)
                }
                onHttpError={({ nativeEvent }) =>
                  settle(null, `The security check could not load (HTTP ${nativeEvent.statusCode}).`)
                }
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'token') settle(data.token);
                    else if (data.type === 'error') settle(null, data.message);
                    else if (data.type === 'expired') settle(null, 'The check expired. Try again.');
                  } catch {
                    settle(null, 'Verification failed');
                  }
                }}
              />
            )}
          </View>
          <Pressable onPress={() => settle(null)} style={styles.cancel}>
            <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

RecaptchaGate.displayName = 'RecaptchaGate';

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: { width: '100%', maxHeight: '88%', borderRadius: radius.xl, padding: spacing.lg },
  title: { fontSize: fontSizes.md, fontWeight: '700' },
  subtitle: { fontSize: fontSizes.sm, marginTop: spacing.xxs, marginBottom: spacing.md },
  webWrap: { height: 440, maxHeight: '70%', overflow: 'hidden', borderRadius: radius.md },
  web: { flex: 1, backgroundColor: 'transparent' },
  cancel: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
});
