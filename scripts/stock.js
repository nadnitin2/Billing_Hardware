import { app } from '../pages/firebase-config.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const db = getFirestore(app);
const stockCol = collection(db, 'stock');
const stockTable = document.getElementById('stockTable');
const form = document.getElementById('addStockForm');
const updateBtn = document.getElementById('updateBtn');
const searchInput = document.getElementById('searchInput');
const unitSelect = document.getElementById('unit');

// Populate unit dropdown
const units = ['pcs', 'kg', 'litre', 'box', 'mtr', 'set'];
unitSelect.innerHTML = '<option value="">Select Unit</option>';
units.forEach(unit => {
  const opt = document.createElement('option');
  opt.value = unit;
  opt.textContent = unit;
  unitSelect.appendChild(opt);
});

let currentEditId = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    name: form.name.value.trim(),
    brand: form.brand.value.trim(),
    unit: form.unit.value,
    price: parseFloat(form.price.value),
    qty: parseFloat(form.qty.value)
  };

  try {
    if (currentEditId) {
      const stockRef = doc(db, 'stock', currentEditId);
      await updateDoc(stockRef, data);
      currentEditId = null;
      updateBtn.textContent = "Add Stock";
    } else {
      // Standardize ID to avoid duplicates
      const newId = `${data.name.toLowerCase().trim()}_${data.brand.toLowerCase().trim()}`
        .replace(/[^\w\s]/gi, '') // remove special characters
        .replace(/\s+/g, '_');    // spaces to underscores

      // Check if ID already exists
      const existingDoc = await getDoc(doc(db, 'stock', newId));
      if (existingDoc.exists()) {
        alert("Item with this name and brand already exists!");
        return;
      }

      await setDoc(doc(db, 'stock', newId), data);
    }
    form.reset();
    loadStock();
  } catch (err) {
    alert("Error saving stock: " + err.message);
    console.error(err);
  }
});

// Debounce function to limit search calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Load stock with debounced search
const debouncedLoadStock = debounce(loadStock, 300);

searchInput.addEventListener('input', debouncedLoadStock);

async function loadStock() {
  stockTable.innerHTML = ""; // Clear table
  const snap = await getDocs(stockCol);
  const keyword = searchInput.value.toLowerCase().trim();
  const seenIds = new Set(); // Track rendered IDs to avoid duplicates

  snap.forEach(docSnap => {
    const id = docSnap.id;
    if (seenIds.has(id)) return; // Skip if already rendered
    seenIds.add(id);

    const s = docSnap.data();
    const total = (s.price * s.qty).toFixed(2);
    const matches =
      s.name.toLowerCase().includes(keyword) ||
      s.brand.toLowerCase().includes(keyword);

    if (s.qty > 0 && matches) {
      stockTable.innerHTML += `
        <tr class="${s.qty < 5 ? 'table-danger' : ''}">
          <td>${s.name}</td>
          <td>${s.brand}</td>
          <td>${s.unit}</td>
          <td>₹${s.price}</td>
          <td>${s.qty}</td>
          <td>₹${total}</td>
          <td>
            <button class="btn btn-sm btn-warning" onclick="editStock('${id}')">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteStock('${id}')">🗑️</button>
          </td>
        </tr>
      `;
    }
  });
}

window.editStock = async (id) => {
  const ref = doc(db, 'stock', id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const s = snap.data();
    form.name.value = s.name;
    form.brand.value = s.brand;
    form.unit.value = s.unit;
    form.price.value = s.price;
    form.qty.value = s.qty;
    currentEditId = id;
    updateBtn.textContent = "Update Stock";
  }
};

window.deleteStock = async (id) => {
  if (confirm("Are you sure you want to delete this stock item?")) {
    await deleteDoc(doc(db, 'stock', id));
    loadStock();
  }
};

loadStock();