// billing-app/scripts/settings.js
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { app } from '../pages/firebase-config.js';

const db = getFirestore(app);
const settingsDoc = doc(db, 'settings', 'gst');

const gstInput = document.getElementById('gstInput');
const currentGst = document.getElementById('currentGst');
const gstForm = document.getElementById('gstForm');

async function loadGST() {
  try {
    const snap = await getDoc(settingsDoc);
    if (snap.exists()) {
      const data = snap.data();
      currentGst.textContent = data.rate;
      gstInput.value = data.rate;
    } else {
      currentGst.textContent = '18';
      gstInput.value = 18;
    }
  } catch (err) {
    alert("Error loading GST: " + err.message);
  }
}

gstForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newRate = parseFloat(gstInput.value);
  try {
    await setDoc(settingsDoc, { rate: newRate });
    currentGst.textContent = newRate;
    alert("GST Updated Successfully");
  } catch (err) {
    alert("Error saving GST: " + err.message);
  }
});

loadGST();
