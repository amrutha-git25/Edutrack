
import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";

// Firebase configuration for EduTrack
const firebaseConfig = {
  apiKey: "AIzaSyCBiWf_j42sop6JDkNHBjBFpiBcp5IPUWI",
  authDomain: "edutrack-8bc0b.firebaseapp.com",
  projectId: "edutrack-8bc0b",
  storageBucket: "edutrack-8bc0b.firebasestorage.app",
  messagingSenderId: "895387389403",
  appId: "1:895387389403:web:650737af9621cd7cce6bfe",
  measurementId: "G-4VRGQJ4RCN",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Functions
export const functions = getFunctions(app, "us-central1");

export default app;
