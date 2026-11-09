const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** Production mode is available only when Firebase is configured through env vars. */
export const FIREBASE_ENABLED = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

/** 'firestore' works on the free Spark plan; 'storage' needs the Blaze plan (since Feb 2026). */
export const IMAGE_BACKEND: 'firestore' | 'storage' = env.VITE_IMAGE_BACKEND === 'storage' ? 'storage' : 'firestore';

/** How long a cached session may be used offline without re-authenticating. */
export const OFFLINE_SESSION_DAYS = 30;
