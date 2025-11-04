// // scripts/auth-check.js
// import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
// import { app } from "../pages/firebase-config.js";

// export function checkAuth() {
//   const auth = getAuth(app);

//   return new Promise((resolve, reject) => {
//     onAuthStateChanged(auth, user => {
//       if (user) {
//         resolve(user); // ✅ Logged in
//       } else {
//         alert("🚫 Please login first!");
//         window.location.href = "login.html"; // 🔁 Redirect to login
//         reject("Not logged in");
//       }
//     });
//   });
// }


