import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import { cloudProviders, isCloudConfigured } from './cloudConfig';
import Constants from 'expo-constants';

// Lets the in-app browser hand control back to the app when the provider
// redirects; harmless to call when auth is never used.
WebBrowser.maybeCompleteAuthSession();

type FirebaseConfigExtra = {
  googleWebClientId?: string;
  googleAndroidClientId?: string;
  googleIosClientId?: string;
  facebookAppId?: string;
};

function extra(): FirebaseConfigExtra {
  return ((Constants.expoConfig?.extra as any)?.firebase ?? {}) as FirebaseConfigExtra;
}

export interface ProviderSignIn {
  available: boolean;
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
}

export function useGoogleSignIn(onSignedIn: () => void): ProviderSignIn {
  const config = extra();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Named per platform rather than a single clientId: a bare clientId is what
  // the provider falls back to, which on Android means sending a web client's
  // id with a native redirect and getting redirect_uri_mismatch instead.
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: config.googleWebClientId,
    androidClientId: config.googleAndroidClientId,
    iosClientId: config.googleIosClientId,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') {
      // Dismissing the sheet is not an error worth shouting about.
      if (response.type === 'error') setError(describe(response.error));
      setBusy(false);
      return;
    }
    const idToken = response.params?.id_token ?? (response.authentication as any)?.idToken;
    const accessToken = response.authentication?.accessToken;
    if (!idToken) {
      setError('Google did not return a sign-in token. Please try again.');
      setBusy(false);
      return;
    }
    (async () => {
      try {
        const { signInWithGoogleIdToken } = require('./auth') as typeof import('./auth');
        await signInWithGoogleIdToken(idToken, accessToken);
        onSignedIn();
      } catch (e) {
        setError(describe(e));
      } finally {
        setBusy(false);
      }
    })();
  }, [response]);

  return {
    available: isCloudConfigured && cloudProviders.google && !!request,
    busy,
    error,
    signIn: async () => {
      setError(null);
      setBusy(true);
      const result = await promptAsync();
      if (result?.type !== 'success') setBusy(false);
    },
  };
}

export function useFacebookSignIn(onSignedIn: () => void): ProviderSignIn {
  const config = extra();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Facebook.useAuthRequest({
    clientId: config.facebookAppId,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') {
      if (response.type === 'error') setError(describe(response.error));
      setBusy(false);
      return;
    }
    const accessToken = response.authentication?.accessToken;
    if (!accessToken) {
      setError('Facebook did not return a sign-in token. Please try again.');
      setBusy(false);
      return;
    }
    (async () => {
      try {
        const { signInWithFacebookToken } = require('./auth') as typeof import('./auth');
        await signInWithFacebookToken(accessToken);
        onSignedIn();
      } catch (e) {
        setError(describe(e));
      } finally {
        setBusy(false);
      }
    })();
  }, [response]);

  return {
    available: isCloudConfigured && cloudProviders.facebook && !!request,
    busy,
    error,
    signIn: async () => {
      setError(null);
      setBusy(true);
      const result = await promptAsync();
      if (result?.type !== 'success') setBusy(false);
    },
  };
}

function describe(error: unknown): string {
  if (!isCloudConfigured) return 'Cloud sync is not set up in this build yet.';
  const { describeAuthError } = require('./auth') as typeof import('./auth');
  return describeAuthError(error);
}
