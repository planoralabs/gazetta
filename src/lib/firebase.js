import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAzkxvbyj0zVCqm5Au5y0f1vxTVJovXors",
  authDomain: "gazetta-app.firebaseapp.com",
  projectId: "gazetta-app",
  storageBucket: "gazetta-app.firebasestorage.app",
  messagingSenderId: "230098454970",
  appId: "1:230098454970:web:8f8f46efd0bf0cb8ddf583",
  measurementId: "G-78ZS5TN5DX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
