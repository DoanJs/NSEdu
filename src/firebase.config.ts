// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

// config for NSEdu

const firebaseConfig = {
  apiKey: "AIzaSyALYdihXMiuSe8IX9ZrnLk5LI5A8j3VUBI",
  authDomain: "nsedu-e94bd.firebaseapp.com",
  databaseURL:
    "https://nsedu-e94bd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nsedu-e94bd",
  storageBucket: "nsedu-e94bd.firebasestorage.app",
  messagingSenderId: "830824227797",
  appId: "1:830824227797:web:a9a455f7ebb7aa9b19935c",
  measurementId: "G-PWZ5M6FDWZ",
};

// setLogLevel("debug");
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, "asia-southeast1");
const rtdb = getDatabase(app);
// const analytics = getAnalytics(app);
export { auth, db, functions, rtdb };
