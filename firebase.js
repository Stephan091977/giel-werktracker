import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAOkm0gqdGv-s4O02084U45xVHR0Aa2mDk",
  authDomain: "giel-pakt-aan.firebaseapp.com",
  projectId: "giel-pakt-aan",
  storageBucket: "giel-pakt-aan.firebasestorage.app",
  messagingSenderId: "15897907025",
  appId: "1:15897907025:web:1a8274315794a0fc650d70"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
