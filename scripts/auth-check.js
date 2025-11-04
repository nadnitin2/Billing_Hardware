import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { app } from "../pages/firebase-config.js";

const auth = getAuth(app);
    
export async function checkAuth() {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged((user) => {
      if (user) {
        resolve(user);
      } else {
        reject("User not logged in");
      }
    });
  });
}
