import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const firebaseConfig = {  apiKey: "AIzaSyAcXa1P1vgi8rx00psbQnNOfcbv9CGhyCQ",
  authDomain: "hardwaretest-6f55b.firebaseapp.com",
  projectId: "hardwaretest-6f55b",
  storageBucket: "hardwaretest-6f55b.firebasestorage.app",
  messagingSenderId: "1058965019249",
  appId: "1:1058965019249:web:d12b1d52822a450e0f19d0",
  measurementId: "G-V5QNQS4SLY"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);


// ✅ firebase-config.js (CDN compatible, no import/export)

// const firebaseConfig = {
//   apiKey: "AIzaSyAcXa1P1vgi8rx00psbQnNOfcbv9CGhyCQ",
//   authDomain: "hardwaretest-6f55b.firebaseapp.com",
//   projectId: "hardwaretest-6f55b",
//   storageBucket: "hardwaretest-6f55b.firebasestorage.app",
//   messagingSenderId: "1058965019249",
//   appId: "1:1058965019249:web:d12b1d52822a450e0f19d0",
//   measurementId: "G-V5QNQS4SLY"
// };

// // ✅ Initialize Firebase
// const app = firebase.initializeApp(firebaseConfig);
// const db = firebase.firestore();
// const auth = firebase.auth();

// // ✅ Make accessible globally
// window.db = db;
// window.auth = auth;
