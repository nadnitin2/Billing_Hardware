import { app } from '../pages/firebase-config.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc // <--- addDoc function import केले
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const db = getFirestore(app);
const stockCol = collection(db, 'stock');
const purchaseEntryCol = collection(db, 'purchase_history');
const stockTable = document.getElementById('stockTable');
const itemMasterForm = document.getElementById('addItemMasterForm');
const masterUpdateBtn = document.getElementById('masterUpdateBtn');
const purchaseEntryForm = document.getElementById('addPurchaseEntryForm');
const purchaseItemSelect = document.getElementById('purchaseItem');
const searchInput = document.getElementById('searchInput');
const unitSelect = document.getElementById('unit');

// New inputs for Purchase Entry
const purchaseInvoiceNoInput = document.getElementById('purchaseInvoiceNo');
const purchaseInvoiceDateInput = document.getElementById('purchaseInvoiceDate');

// Purchase History Modal Elements
const purchaseHistoryTableBody = document.getElementById('purchaseHistoryTableBody');

let currentEditId = null;

// Populate unit dropdown
const units = ['pcs', 'kg', 'litre', 'box', 'mtr', 'set'];
unitSelect.innerHTML = '<option value="">Select Unit</option>';
units.forEach(unit => {
  const opt = document.createElement('option');
  opt.value = unit;
  opt.textContent = unit;
  unitSelect.appendChild(opt);
});

// Helper functions for Loader
function showLoader(text = "Loading...") {
  document.getElementById('loaderText').textContent = text;
  document.getElementById('globalLoader').classList.remove('d-none');
}
function hideLoader() {
  document.getElementById('globalLoader').classList.add('d-none');
}

// Helper to calculate total value including GST
function calculateTotalValue(price, qty, gstRate) {
  const netValue = price * qty;
  const gstAmount = netValue * (gstRate / 100);
  return {
    netValue: netValue,
    gstAmount: gstAmount,
    totalValue: netValue + gstAmount
  };
}


// --------------------------- 1. ITEM MASTER LOGIC (ADD/EDIT) ---------------------------
itemMasterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;

  const data = {
    name: itemMasterForm.name.value.trim(),
    brand: itemMasterForm.brand.value.trim(),
    unit: itemMasterForm.unit.value,
    price: parseFloat(itemMasterForm.salePrice.value), // Sale Price
    gstRate: parseFloat(itemMasterForm.gstRate.value), // GST Rate
    qty: 0,
    purchasePrice: 0
  };

  try {
    if (currentEditId) {
      // Keep current quantity, purchase price if editing master details
      const currentStockSnap = await getDoc(doc(db, 'stock', currentEditId));
      if (currentStockSnap.exists()) {
        data.qty = currentStockSnap.data().qty || 0;
        data.purchasePrice = currentStockSnap.data().purchasePrice || 0;
      }

      const stockRef = doc(db, 'stock', currentEditId);
      await updateDoc(stockRef, data);
      currentEditId = null;
      masterUpdateBtn.textContent = "Add Item";
    } else {
      // Standardize ID to avoid duplicates
      const newId = `${data.name.toLowerCase().trim()}_${data.brand.toLowerCase().trim()}`
        .replace(/[^\w\s]/gi, '')
        .replace(/\s+/g, '_');

      const existingDoc = await getDoc(doc(db, 'stock', newId));
      if (existingDoc.exists()) {
        alert("Item Master already exists! Use Purchase Entry to add quantity.");
        btn.disabled = false;
        btn.innerHTML = "Add Item";
        return;
      }
      data.qty = 0; // New item starts with 0 qty
      await setDoc(doc(db, 'stock', newId), data);
    }
    itemMasterForm.reset();
    loadStock();
  } catch (err) {
    alert("Error saving Item Master: " + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = currentEditId ? `<i class="bi bi-arrow-repeat"></i> Update Master` : `<i class="bi bi-plus-circle"></i> Add Item`;
  }
});

// --------------------------- 2. PURCHASE ENTRY LOGIC ---------------------------
purchaseEntryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Updating...`;
  showLoader("Recording Purchase and Updating Stock...");

  const itemId = purchaseEntryForm.purchaseItem.value;
  const qtyBought = parseFloat(purchaseEntryForm.purchaseQty.value);
  const rateBought = parseFloat(purchaseEntryForm.purchaseRate.value);
  const vendor = purchaseEntryForm.vendorName.value.trim();

  // Capture Invoice Details
  const invoiceNo = purchaseInvoiceNoInput.value.trim();
  const invoiceDate = purchaseInvoiceDateInput.value;

  if (!itemId || qtyBought <= 0 || rateBought <= 0 || !vendor || !invoiceNo || !invoiceDate) {
    alert('Please fill all required fields correctly.');
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-box-arrow-in-down"></i> Update Stock`;
    hideLoader();
    return;
  }

  try {
    const stockRef = doc(db, 'stock', itemId);
    const stockSnap = await getDoc(stockRef);

    if (!stockSnap.exists()) throw new Error("Item Master not found!");

    const currentStock = stockSnap.data();
    const newQty = (currentStock.qty || 0) + qtyBought;

    // Calculate purchase values (for history)
    const purchaseValues = calculateTotalValue(rateBought, qtyBought, currentStock.gstRate || 0);

    // Create Purchase History Record
    const purchaseData = {
      itemId,
      name: currentStock.name,
      brand: currentStock.brand,
      qty: qtyBought,
      unit: currentStock.unit,
      purchaseRate: rateBought, // Excl GST
      gstRate: currentStock.gstRate || 0,
      gstAmount: purchaseValues.gstAmount, // ITC Amount
      totalValue: purchaseValues.totalValue, // Incl GST
      vendor,
      invoiceNo: invoiceNo,
      invoiceDate: invoiceDate,
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString()
    };
    await addDoc(purchaseEntryCol, purchaseData);

    // Update Stock Master: Increase Qty and Update Last Purchase Price
    await updateDoc(stockRef, {
      qty: newQty,
      purchasePrice: rateBought // Store the new purchase rate (Excl GST)
    });

    purchaseEntryForm.reset();

    // Set default date for next entry
    purchaseInvoiceDateInput.value = new Date().toISOString().split('T')[0];

    loadStock();
    alert(`Purchase of ${qtyBought} ${currentStock.unit} recorded. Stock updated!`);

  } catch (err) {
    console.error(err);
    alert("Error processing purchase: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-box-arrow-in-down"></i> Update Stock`;
    hideLoader();
  }
});


// --------------------------- 3. STOCK LIST LOGIC ---------------------------
const debouncedLoadStock = debounce(loadStock, 300);
searchInput.addEventListener('input', debouncedLoadStock);

async function loadStock() {
  showLoader("Loading Stock List...");
  stockTable.innerHTML = "";
  purchaseItemSelect.innerHTML = '<option value="">Select Item to Buy</option>';

  const snap = await getDocs(stockCol);
  const keyword = searchInput.value.toLowerCase().trim();
  const seenIds = new Set();
  let itemsForPurchaseDropdown = [];
  let lowStockItems = [];
  let outOfStockItems = [];
  let otherStockItems = [];

  snap.forEach(docSnap => {
    const id = docSnap.id;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const s = docSnap.data();

    // Calculate total values including GST (using Sale Price for valuation)
    const values = calculateTotalValue(s.price, s.qty, s.gstRate || 0);
    const matches =
      s.name.toLowerCase().includes(keyword) ||
      s.brand.toLowerCase().includes(keyword);

    itemsForPurchaseDropdown.push({ id, name: s.name, brand: s.brand, unit: s.unit });

    const isLowStock = s.qty < 5 && s.qty > 0;
    const isOutOfStock = s.qty === 0;

    if (matches) {
      let rowClass = '';
      if (isOutOfStock) rowClass = 'out-of-stock-row';
      else if (isLowStock) rowClass = 'low-stock-row';

      const lowStockIndicator = isOutOfStock
        ? '<span class="badge bg-secondary ms-2">OUT OF STOCK</span>'
        : (isLowStock ? '<span class="badge bg-danger ms-2">LOW STOCK!</span>' : '');

      const rowHtml = `
        <tr class="${rowClass}">
          <td>${s.name} (${s.brand})</td>
          <td>${s.unit}</td>
          <td>${s.gstRate || 0}%</td>
          <td>₹${s.price.toFixed(2)}</td>
          <td>${s.qty} ${lowStockIndicator}</td>
          <td>₹${values.gstAmount.toFixed(2)}</td>
          <td>₹${values.totalValue.toFixed(2)}</td>
          <td>
            <button class="btn btn-sm btn-warning" onclick="editStock('${id}')" title="Edit Master Details"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteStock('${id}')" title="Delete Master Item"><i class="bi bi-trash"></i></button>
          </td>
        </tr>
      `;

      if (isOutOfStock) {
        outOfStockItems.push(rowHtml);
      } else if (isLowStock) {
        lowStockItems.push(rowHtml);
      } else {
        otherStockItems.push(rowHtml);
      }
    }
  });

  // Display Out of Stock first, then Low Stock, then others
  stockTable.innerHTML = outOfStockItems.join('') + lowStockItems.join('') + otherStockItems.join('');

  if (stockTable.innerHTML === '') {
    stockTable.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No matching stock items found.</td></tr>';
  }

  // Populate Purchase Entry dropdown
  itemsForPurchaseDropdown.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.name} (${item.brand}) - ${item.unit}`;
    purchaseItemSelect.appendChild(opt);
  });

  hideLoader();
}

window.editStock = async (id) => {
  const ref = doc(db, 'stock', id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const s = snap.data();

    // Switch to Item Master tab
    new bootstrap.Tab(document.getElementById('master-tab')).show();

    itemMasterForm.name.value = s.name;
    itemMasterForm.brand.value = s.brand;
    itemMasterForm.unit.value = s.unit;
    itemMasterForm.salePrice.value = s.price;
    itemMasterForm.gstRate.value = s.gstRate || 18;

    currentEditId = id;
    masterUpdateBtn.innerHTML = `<i class="bi bi-arrow-repeat"></i> Update Master`;
  }
};

window.deleteStock = async (id) => {
  if (confirm("Are you sure you want to delete this stock item? This will remove all master data, quantity, and sales links.")) {
    await deleteDoc(doc(db, 'stock', id));
    loadStock();
  }
};

// --------------------------- 4. PURCHASE HISTORY LOGIC ---------------------------

window.showPurchaseHistory = async () => {
  showLoader("Loading Purchase History...");

  const snap = await getDocs(purchaseEntryCol);
  purchaseHistoryTableBody.innerHTML = '';

  if (snap.empty) {
    purchaseHistoryTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No purchase entries recorded.</td></tr>';
    hideLoader();
    new bootstrap.Modal(document.getElementById('purchaseHistoryModal')).show();
    return;
  }

  let historyData = [];
  snap.forEach(doc => {
    const d = doc.data();
    historyData.push(d);
  });

  // Sort by timestamp (most recent first)
  historyData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  historyData.forEach(d => {
    // Safe check for fields
    const purchaseRate = d.purchaseRate || 0;
    const gstAmount = d.gstAmount || 0;
    const totalValue = d.totalValue || 0;
    const gstRate = d.gstRate || 0;
    const qty = d.qty || 0;
    const unit = d.unit || 'pcs';

    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td>${d.invoiceDate || 'N/A'}</td>
            <td>${d.name} (${d.brand})</td>
            <td>${d.vendor || 'N/A'}</td>
            <td>${d.invoiceNo || 'N/A'}</td> 
            <td>${qty} ${unit}</td>
            <td>₹${purchaseRate.toFixed(2)}</td>
            <td>${gstRate}%</td>
            <td>₹${gstAmount.toFixed(2)}</td>
            <td>₹${totalValue.toFixed(2)}</td>
        `;
    purchaseHistoryTableBody.appendChild(tr);
  });

  hideLoader();
  new bootstrap.Modal(document.getElementById('purchaseHistoryModal')).show();
};

window.downloadPurchaseHistory = (format) => {
  const tableId = 'purchaseHistoryTableBody';
  const table = document.getElementById(tableId).closest('table');
  const filename = 'Purchase_History_ITC_Report';

  if (table.querySelector('tbody').children.length === 0 || table.querySelector('tbody').children[0].colSpan > 1) {
    return alert("No data to export!");
  }

  if (format === 'excel') {
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } else if (format === 'pdf') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text(filename, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 14, 22);

    doc.autoTable({
      html: table,
      startY: 30,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [28, 97, 184], textColor: 255 },
      columnStyles: {
        5: { halign: 'right' }, // Rate
        7: { halign: 'right' }, // GST Amt
        8: { halign: 'right' }  // Total
      }
    });
    doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
};


// Debounce function
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

// Initial Load
loadStock();

// Set default date for purchase invoice date field
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  if (purchaseInvoiceDateInput) {
    purchaseInvoiceDateInput.value = today;
  }
});
