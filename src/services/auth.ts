import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  User,
  deleteUser,
  linkWithCredential,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  AuthCredential,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  providers: string[];
}

export function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    photoURL: user.photoURL,
    providers: user.providerData.map((p) => p.providerId),
  };
}

export function subscribeToAuth(listener: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => listener(toAuthUser(user)));
}

export function currentUser(): AuthUser | null {
  return toAuthUser(getFirebaseAuth().currentUser);
}

/**
 * Signing in with a provider the account already has attached simply returns
 * that account. When someone is already signed in, the new provider is linked
 * to the existing account instead, so one person's expenses never end up split
 * across two accounts.
 */
async function signInOrLink(credential: AuthCredential): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  const existing = auth.currentUser;

  if (existing) {
    try {
      const linked = await linkWithCredential(existing, credential);
      return toAuthUser(linked.user)!;
    } catch (error: any) {
      // Already attached to another account: fall through and sign into it.
      if (error?.code !== 'auth/credential-already-in-use' && error?.code !== 'auth/provider-already-linked') {
        throw error;
      }
    }
  }

  const result = await signInWithCredential(auth, credential);
  return toAuthUser(result.user)!;
}

export function signInWithGoogleIdToken(idToken: string, accessToken?: string): Promise<AuthUser> {
  return signInOrLink(GoogleAuthProvider.credential(idToken, accessToken));
}

export function signInWithPhoneCode(verificationId: string, code: string): Promise<AuthUser> {
  return signInOrLink(PhoneAuthProvider.credential(verificationId, code));
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getFirebaseAuth());
}

export async function deleteAccount(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  await deleteUser(user);
}

/** Maps Firebase error codes to something a person can act on. */
export function describeAuthError(error: any): string {
  switch (error?.code) {
    case 'auth/invalid-verification-code':
      return 'That code is not right. Check the digits and try again.';
    case 'auth/code-expired':
      return 'That code has expired. Send a new one.';
    case 'auth/invalid-phone-number':
      return 'That phone number does not look right.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes before trying again.';
    case 'auth/network-request-failed':
      return 'No connection. Your data is safe on this device — try again when you are back online.';
    case 'auth/account-exists-with-different-credential':
      return 'This account already exists with a different sign-in method. Use that one, then link this from Account.';
    case 'auth/requires-recent-login':
      return 'For security, sign in again before making this change.';
    case 'auth/configuration-not-found':
      return 'Sign-in is not switched on for this project yet. Enable Authentication in the Firebase console, then try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is switched off in the Firebase console. Enable it under Authentication to use it.';
    case 'auth/invalid-app-credential':
    case 'auth/captcha-check-failed':
      return 'The phone sign-in check failed. Confirm the app domain is listed under Authentication to Settings to Authorized domains.';
    case 'auth/unauthorized-domain':
      return 'This domain is not on the authorized list for sign-in. Add it under Authentication to Settings to Authorized domains.';
    default:
      return error?.message ?? 'Something went wrong. Please try again.';
  }
}
