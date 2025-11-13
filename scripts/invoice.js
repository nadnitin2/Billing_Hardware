import { app } from "../pages/firebase-config.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc,
  query, where, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const db = getFirestore(app);
const invoiceCol = collection(db, 'invoices');
const stockCol = collection(db, 'stock');
const clientCol = collection(db, 'clients');
const settingsDoc = doc(db, 'settings', 'gst');

const invoiceForm = document.getElementById('invoiceForm');
const addItemBtn = document.getElementById('addItem');
const itemSelect = document.getElementById('item');
const qtyInput = document.getElementById('qty');
const rateInput = document.getElementById('rate');
const itemDiscInput = document.getElementById('itemDisc');
const subtotalEl = document.getElementById('subtotal');
const gstPercentEl = document.getElementById('gstPercent');
const gstAmountEl = document.getElementById('gstAmount');
const totalAmountEl = document.getElementById('totalAmount');
const payableAmountEl = document.getElementById('payableAmount');
const clientSelect = document.getElementById('client');
const searchClientList = document.getElementById('searchClientList');
const invoiceListTable = document.getElementById('invoiceList');
const invoiceTable = document.getElementById('invoiceTable');

const payModalClient = document.getElementById('payModalClient');
const payModalInv = document.getElementById('payModalInv');
const payModalDue = document.getElementById('payModalDue');
const payAmt = document.getElementById('payAmt');
const recordPaymentBtn = document.getElementById("recordPayment");

let invoiceItems = [];
let globalGstRate = 0.18;
let stockMap = {};
let clientMap = {};
let invoiceCache = [];
let currentInvoiceId = null;

// PERFECT DATE FORMATTER - Handles DD-MM-YYYY, YYYY-MM-DD, Timestamp
function formatDateToDDMMYYYY(dateInput) {
  if (!dateInput) return 'NaN-NaN-NaN';

  let date;
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        date = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        // DD-MM-YYYY
        date = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    }
  } else if (dateInput.toDate) {
    date = dateInput.toDate();
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) return 'NaN-NaN-NaN';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function getTodayDDMMYYYY() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
}

function getTodayISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Fetch GST Rate
async function fetchGSTRate() {
  const snap = await getDoc(settingsDoc);
  if (snap.exists()) {
    globalGstRate = +snap.data().rate / 100;
    gstPercentEl.textContent = snap.data().rate;
  }
}

// GST FIX: applyGst parameter
function calculateLineItemValue(qty, rate, discount, gstRate, applyGst = true) {
  const netValue = qty * rate * (1 - discount / 100);
  const gstAmount = applyGst ? netValue * (gstRate / 100) : 0;
  const totalValue = netValue + gstAmount;
  return {
    netValue: parseFloat(netValue.toFixed(2)),
    gstAmount: parseFloat(gstAmount.toFixed(2)),
    totalValue: parseFloat(totalValue.toFixed(2))
  };
}

// Update Summary
function updateSummary() {
  let subtotal = 0, totalGst = 0, maxGstRate = 0;
  const applyGst = document.querySelector('input[name="gstOption"]:checked').value === 'yes';

  invoiceItems.forEach(item => {
    const line = calculateLineItemValue(item.qty, item.rate, item.discount, item.gstRate, applyGst);
    subtotal += line.netValue;
    if (applyGst) {
      totalGst += line.gstAmount;
      if (item.gstRate > maxGstRate) maxGstRate = item.gstRate;
    }
  });

  const total = subtotal + totalGst;
  subtotalEl.textContent = subtotal.toFixed(2);
  gstAmountEl.textContent = totalGst.toFixed(2);
  totalAmountEl.textContent = total.toFixed(2);
  payableAmountEl.textContent = total.toFixed(2);
  gstPercentEl.textContent = applyGst && maxGstRate > 0 ? maxGstRate.toFixed(0) : '0';
  gstPercentEl.parentElement.style.display = applyGst ? '' : 'none';
}

// Render Table
function renderInvoiceTable() {
  invoiceTable.innerHTML = '';
  if (invoiceItems.length === 0) {
    invoiceTable.innerHTML = `<tr><td colspan="10" class="text-center text-muted">Add items to start invoicing.</td></tr>`;
    updateSummary();
    return;
  }

  const applyGst = document.querySelector('input[name="gstOption"]:checked').value === 'yes';

  invoiceItems.forEach((it, idx) => {
    const line = calculateLineItemValue(it.qty, it.rate, it.discount, it.gstRate, applyGst);
    invoiceTable.innerHTML += `
      <tr>
        <td style="width:22%; font-size:0.9rem;">${it.name} (${it.brand || 'N/A'})</td>
        <td style="width:8%;">${it.unit || 'pcs'}</td>
        <td style="width:8%;">${it.qty}</td>
        <td style="width:10%;">Rs. ${it.rate.toFixed(2)}</td>
        <td style="width:8%;">${it.discount}%</td>
        <td style="width:10%;">Rs. ${line.netValue.toFixed(2)}</td>
        <td style="width:8%;">${applyGst ? it.gstRate.toFixed(0) : 0}%</td>
        <td style="width:10%;">Rs. ${line.gstAmount.toFixed(2)}</td>
        <td style="width:10%;">Rs. ${line.totalValue.toFixed(2)}</td>
        <td style="width:6%;"><button class="btn btn-sm btn-danger" onclick="removeItem(${idx})">X</button></td>
      </tr>`;
  });
  updateSummary();
}
window.removeItem = idx => { invoiceItems.splice(idx, 1); renderInvoiceTable(); };

// Add Item Handler
function addItemHandler() {
  const id = itemSelect.value;
  const qty = +qtyInput.value;
  const rate = +rateInput.value;
  const discount = +itemDiscInput.value || 0;

  if (!id || !qty || !rate) return alert('Fill all fields');
  const st = stockMap[id];
  if (!st) return alert('Item not found');
  if (st.qty < qty) return alert(`Only ${st.qty} available!`);

  invoiceItems.push({
    id, name: st.name, brand: st.brand || 'N/A', unit: st.unit || 'pcs',
    qty, rate, discount, gstRate: st.gstRate || (globalGstRate * 100)
  });

  renderInvoiceTable();
  itemSelect.value = qtyInput.value = itemDiscInput.value = '';
  $('#item').val(null).trigger('change');
}

function onItemChange() {
  const id = $(itemSelect).val();
  const st = stockMap[id];
  rateInput.value = st?.price ? st.price.toFixed(2) : '0.00';
}

// Populate Clients & Items
async function populateClientsAndItems() {
  const loadingOption = '<option selected disabled>Loading clients...</option>';
  clientSelect.innerHTML = loadingOption;
  searchClientList.innerHTML = loadingOption;

  const clientSnap = await getDocs(clientCol);
  clientSelect.innerHTML = '';
  searchClientList.innerHTML = '<option value="All">All Clients</option>';

  clientSnap.forEach(dc => {
    const c = dc.data();
    clientMap[c.name] = c;
    [clientSelect, searchClientList].forEach(sel => {
      const op = document.createElement('option');
      op.value = c.name;
      op.textContent = `${c.name} (${c.accountNo || ''})`;
      sel.append(op);
    });
  });

  const stockSnap = await getDocs(stockCol);
  stockSnap.forEach(dc => {
    const s = dc.data();
    const gstRate = parseFloat(s.gstRate) || (globalGstRate * 100);
    stockMap[dc.id] = { ...s, gstRate, price: parseFloat(s.price) || 0 };
    if (s.qty > 0) {
      const op = document.createElement('option');
      op.value = dc.id;
      op.textContent = `${s.name} (${s.brand || 'No Brand'}) - ${s.unit || 'pcs'} (GST ${gstRate.toFixed(0)}%)`;
      itemSelect.append(op);
    }
  });
}

// Load Invoices - DATE 100% FIXED
window.loadInvoices = async () => {
  const clientName = searchClientList.value;
  if (!clientName || clientName === 'All') {
    invoiceListTable.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Select client to load invoices</td></tr>`;
    invoiceCache = [];
    return;
  }

  invoiceListTable.innerHTML = `<tr><td colspan="6" class="text-center">Loading...</td></tr>`;
  const q = query(invoiceCol, where("client", "==", clientName));
  const snap = await getDocs(q);
  invoiceListTable.innerHTML = snap.empty ? `<tr><td colspan="6" class="text-center text-muted">No invoices</td></tr>` : '';
  invoiceCache = [];

  const invoices = [];
  snap.forEach(d => {
    const data = d.data();
    data.id = d.id;
    invoices.push(data);
  });

  // SORT BY ISO DATE (PERFECT ORDER)
  invoices.sort((a, b) => {
    const dateA = a.dateISO || a.date || '0000-00-00';
    const dateB = b.dateISO || b.date || '0000-00-00';
    return dateB.localeCompare(dateA);
  });

  invoices.forEach(inv => {
    invoiceCache.push(inv);
    const paid = inv.paidAmount || 0;
    const pending = inv.payable - paid;
    let status = 'Pending', badge = 'bg-danger';
    if (inv.cancelled) { status = 'Cancelled'; badge = 'bg-secondary'; }
    else if (inv.cleared) { status = 'Cleared'; badge = 'bg-success'; }
    else if (paid > 0) { status = 'Partial'; badge = 'bg-warning'; }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDateToDDMMYYYY(inv.date || inv.dateISO)}</td>
      <td>${inv.client}</td>
      <td>${inv.items.length}</td>
      <td>Rs. ${Number(inv.payable).toFixed(2)}</td>
      <td><span class="badge ${badge}">${status}</span></td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-secondary" onclick="viewInvoice('${inv.id}')">View</button>
        <button class="btn btn-sm btn-info" onclick="printInvoice('${inv.id}')">Print</button>
        <button class="btn btn-sm btn-warning" onclick="downloadPDF('${inv.id}')">PDF</button>
        ${!inv.cleared && !inv.cancelled ? `<button class="btn btn-sm btn-success" onclick="openPaymentModal('${inv.id}')">Pay</button>` : ''}
        ${!inv.cancelled ? `<button class="btn btn-sm btn-danger" onclick="cancelInvoice('${inv.id}')">Cancel</button>` : ''}
      </td>`;
    invoiceListTable.appendChild(row);
  });
};

// VIEW + PRINT + PDF
async function generateInvoiceWindow(invoiceId, autoPrint = false) {
  const inv = invoiceCache.find(i => i.id === invoiceId) || (await getDoc(doc(db, 'invoices', invoiceId))).data();
  if (!inv) return alert("Invoice not found!");

  const clientSnap = await getDocs(clientCol);
  let clientInfo = { name: inv.client, accountNo: "-", contact: "-", address: "-" };
  clientSnap.forEach(d => { if (d.data().name === inv.client) clientInfo = d.data(); });

  let totalSubtotal = 0, totalGst = 0;

  // MAIN FIX: Invoice madhe withoutGST field asel tar GST 0
  const applyGst = !inv.withoutGST;

  const rows = inv.items.map(it => {
    const gstRate = it.gstRate || 18;
    const line = calculateLineItemValue(it.qty, it.rate, it.discount, gstRate, applyGst);
    totalSubtotal += line.netValue;
    totalGst += line.gstAmount;
    return `<tr>
      <td style="font-size:9.5px;padding:1.5px;">${it.name} (${it.brand || 'N/A'})</td>
      <td style="font-size:9.5px;text-align:center;padding:1.5px;">${it.unit || 'pcs'}</td>
      <td style="font-size:9.5px;text-align:center;padding:1.5px;">${it.qty}</td>
      <td style="font-size:9.5px;text-align:center;padding:1.5px;">Rs. ${it.rate.toFixed(2)}</td>
      <td style="font-size:9.5px;text-align:center;padding:1.5px;">${it.discount}%</td>
      <td style="font-size:9.5px;text-align:right;padding:1.5px;">Rs. ${line.netValue.toFixed(2)}</td>
      <td style="font-size:9.5px;text-align:center;padding:1.5px;">${applyGst ? gstRate : 0}%</td>
      <td style="font-size:9.5px;text-align:right;padding:1.5px;">Rs. ${line.gstAmount.toFixed(2)}</td>
      <td style="font-size:9.5px;text-align:right;padding:1.5px;">Rs. ${line.totalValue.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const paid = inv.paidAmount || 0;
  const pending = inv.payable - paid;
  const displayDate = formatDateToDDMMYYYY(inv.date || inv.dateISO);

  // Optional: PDF var "WITHOUT GST" cha stamp
  const withoutGSTOverlay = inv.withoutGST ? `
    <div style="position:fixed;top:20mm;right:15mm;transform:rotate(-20deg);background:#ff9800;color:white;padding:5px 20px;font-weight:bold;font-size:18px;opacity:0.9;z-index:9999;">
      WITHOUT GST
    </div>` : '';

  const cancelledOverlay = inv.cancelled ? `
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);color:#ff0000;font-size:80px;opacity:0.25;font-weight:bold;z-index:9999;pointer-events:none;">
      CANCELLED
    </div>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${inv.invoiceNo}</title>
<style>
  @page { size: A4 portrait; margin: 0 !important; }
  html, body { margin:0 !important; padding:0 !important; height:100%; overflow:hidden; }
  .bill { position: fixed; top: 0; left: 0; width: 210mm; height: 148.5mm; padding: 5mm 6mm; box-sizing: border-box; font-family: Arial, sans-serif; background: white; display: flex; flex-direction: column; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2mm; position: relative; }
  .header img { width: 92px !important; height: auto; position: absolute; left: -3mm; top: -2mm; z-index: 10; }
  .shop-info { text-align: center; flex-grow: 1; margin-left: 75px; margin-right: 70px; }
  .invoice-details { text-align: right; font-size: 9.5px; min-width: 80px; }
  hr { margin: 2.5mm 0; border: 0.6px solid #000; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
  th, td { border: 1px solid #000; padding: 1.8px; font-size: 9.5px; }
  th { background: #f0f0f0; font-weight: bold; }
  .totals { text-align: right; font-size: 10.2px; margin: 2mm 0; line-height: 1.5; }
  .content { flex-grow: 1; }
  .footer { margin-top: 6mm; padding-top: 6mm; border-top: 1px dashed #000; display: flex; justify-content: space-between; position: relative; }
  .terms { position: absolute; top: -24mm; left: 0; right: 0; font-size: 8.3px; line-height: 1.25; }
  .terms ol { margin: 1mm 0; padding-left: 16px; }
  .sign { width: 90px; text-align: center; font-weight: bold; font-size: 10.5px; }
  .sign .box { height: 42px; margin-bottom: 4px; border: 2px dashed #000; }
  .sign .line { border-bottom: 3px solid #000; }
</style>
</head>
<body>
${withoutGSTOverlay}
${cancelledOverlay}
<div class="bill">
  <div class="header">
    <img src="/assets/logo.png" alt="Kuber Hardware">
    <div class="shop-info">
      <b style="font-size:14.5px;letter-spacing:0.8px;">Kuber Hardware</b><br>
      <small style="font-size:10.2px;line-height:1.4;">
        A/p Kumbhoj tal Hatkangale Maharashtra<br>
        <b>GSTIN: 27AAACK9748R1Z8</b><br>
        Contact: 1234567890
      </small>
    </div>
    <div class="invoice-details">
      Date: <b>${displayDate}</b><br>
      <b style="font-size:12px;">${inv.invoiceNo}</b>
    </div>
  </div>
  <hr>
  <div style="font-size:9.8px;margin-bottom:2mm;line-height:1.35;">
    <b>Customer:</b> ${clientInfo.name}<br>
    <b>Acc No:</b> ${clientInfo.accountNo} | <b>Contact:</b> ${clientInfo.contact}<br>
    <b>Address:</b> ${clientInfo.address}
  </div>
  <table>
    <thead><tr>
      <th style="width:24%;">Item (Brand)</th>
      <th style="width:7%;">Unit</th><th style="width:7%;">Qty</th>
      <th style="width:9%;">Rate</th><th style="width:7%;">Disc</th>
      <th style="width:11%;">Net</th><th style="width:7%;">GST%</th>
      <th style="width:11%;">GST</th><th style="width:11%;">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <b>Subtotal:</b> Rs. ${totalSubtotal.toFixed(2)}<br>
    <b>Total GST:</b> Rs. ${totalGst.toFixed(2)}<br>
    <b>Total:</b> Rs. ${inv.total.toFixed(2)}<br>
    <b>Paid:</b> Rs. ${paid.toFixed(2)} | <b>Pending:</b> Rs. ${pending.toFixed(2)}<br>
    <b style="font-size:13px;">Net Payable: Rs. ${inv.payable.toFixed(2)}</b>
  </div>
  <div class="content"></div>
  <div class="footer">
    <div class="terms">
      <b>Terms & Conditions:</b>
      <ol>
        <li>Goods once sold will not be taken back.</li>
        <li>Warranty as per manufacturer only.</li>
        <li>Please check items before leaving counter.</li>
        <li>All disputes subject to Kolhapur jurisdiction only.</li>
      </ol>
    </div>
    <div class="sign">
      <div class="box"></div>
      <div>Stamp</div>
    </div>
    <div class="sign">
      <div class="box line"></div>
      <div>Authorized Signature</div>
    </div>
  </div>
</div>
<script>
  window.onload = function() {
    ${autoPrint ? `setTimeout(() => { window.print(); setTimeout(() => window.close(), 800); }, 600);` : ''}
  };
</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  if (autoPrint) win.focus();
}
window.viewInvoice = (id) => generateInvoiceWindow(id, false);
window.printInvoice = (id) => generateInvoiceWindow(id, true);
window.downloadPDF = (id) => { viewInvoice(id); alert("Print to Save as PDF"); };

// CANCEL INVOICE
window.cancelInvoice = async (id) => {
  const reason = prompt("Cancel Reason (Required):", "Wrong entry / Customer cancelled");
  if (!reason || reason.trim() === "") return alert("Cancel reason is required!");

  if (!confirm(`Confirm cancel invoice?\nReason: ${reason}\nStock will be restored.`)) return;

  const ref = doc(db, 'invoices', id);
  const snap = await getDoc(ref);
  const inv = snap.data();

  for (const it of inv.items) {
    const stRef = doc(stockCol, it.id);
    const stSnap = await getDoc(stRef);
    if (stSnap.exists()) {
      await updateDoc(stRef, { qty: stSnap.data().qty + it.qty });
    }
  }

  await updateDoc(ref, {
    cancelled: true,
    cancelReason: reason.trim(),
    cancelledAt: new Date()
  });

  alert("Invoice cancelled successfully!\nReason: " + reason);
  await loadInvoices();
};

// SAVE INVOICE - NOW SAVES dateISO
async function saveInvoiceHandler(e) {
  e.preventDefault();
  if (!clientSelect.value || invoiceItems.length === 0) return alert('Required fields missing!');

  const btn = e.submitter;
  btn.disabled = true;
  btn.innerHTML = 'Saving...';

  try {
    await fetchGSTRate();
    const subtotal = parseFloat(subtotalEl.textContent);
    const gst = parseFloat(gstAmountEl.textContent);
    const total = parseFloat(totalAmountEl.textContent);

    const allSnap = await getDocs(invoiceCol);
    const invoiceNo = `INV-${String(allSnap.size + 1).padStart(5, '0')}`;
    const todayDDMM = getTodayDDMMYYYY();
    const todayISO = getTodayISO();

    const applyGst = document.querySelector('input[name="gstOption"]:checked').value === 'yes';

    const data = {
      invoiceNo,
      client: clientSelect.value,
      date: todayDDMM,
      dateISO: todayISO,
      dateTimestamp: new Date(),
      items: invoiceItems,
      subtotal, gst, total,
      payable: total,
      paidAmount: 0,
      payments: [],
      cleared: false,
      withoutGST: !applyGst   // ← HI LINE ADD KELI (MAIN FIX)
    };

    const docRef = await addDoc(invoiceCol, data);
    await updateDoc(docRef, { id: docRef.id });

    for (const it of invoiceItems) {
      const stRef = doc(stockCol, it.id);
      const stSnap = await getDoc(stRef);
      if (stSnap.exists()) {
        await updateDoc(stRef, { qty: stSnap.data().qty - it.qty });
      }
    }

    invoiceItems = [];
    invoiceForm.reset();
    renderInvoiceTable();
    await loadInvoices();
    alert("Invoice Saved Successfully!");
    btn.innerHTML = 'Generate Invoice';
    btn.disabled = false;
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
    btn.innerHTML = 'Generate Invoice';
    btn.disabled = false;
  }
}

// PAYMENT MODAL
window.openPaymentModal = async (id) => {
  currentInvoiceId = id;
  const snap = await getDoc(doc(db, 'invoices', id));
  const inv = snap.data();
  const pending = inv.payable - (inv.paidAmount || 0);
  payModalClient.textContent = inv.client;
  payModalInv.textContent = inv.invoiceNo;
  payModalDue.textContent = pending.toFixed(2);
  payAmt.value = pending.toFixed(2);
  new bootstrap.Modal(document.getElementById('payModal')).show();
};

document.getElementById("recordPayment").addEventListener("click", async () => {
  const amt = parseFloat(payAmt.value) || 0;
  if (amt <= 0) return alert("Enter valid amount!");

  recordPaymentBtn.disabled = true;
  recordPaymentBtn.textContent = 'Recording...';

  try {
    const ref = doc(db, 'invoices', currentInvoiceId);
    const snap = await getDoc(ref);
    const inv = snap.data();
    const newPaid = (inv.paidAmount || 0) + amt;

    await updateDoc(ref, {
      paidAmount: newPaid,
      cleared: newPaid >= inv.payable,
      payments: arrayUnion({
        amount: amt,
        mode: document.getElementById('payMode')?.value || 'Cash',
        txn: document.getElementById('payTxn')?.value || '',
        remarks: document.getElementById('payRemarks')?.value || '',
        timestamp: new Date(),
        date: getTodayDDMMYYYY()
      })
    });

    try {
      const clientQuery = query(clientCol, where("name", "==", inv.client));
      const clientSnap = await getDocs(clientQuery);
      if (!clientSnap.empty) {
        await updateDoc(clientSnap.docs[0].ref, {
          transactions: arrayUnion({
            invoiceId: currentInvoiceId,
            invoiceNo: inv.invoiceNo,
            date: new Date(),
            amount: amt,
            mode: document.getElementById('payMode')?.value || 'Cash',
            txn: document.getElementById('payTxn')?.value || '',
            remarks: document.getElementById('payRemarks')?.value || '',
            cancelled: inv.cancelled || false
          })
        });
      }
    } catch (err) {
      console.log("Client history update skipped:", err);
    }

    bootstrap.Modal.getInstance(document.getElementById('payModal')).hide();
    alert("Payment recorded!");
    await loadInvoices();
  } catch (error) {
    console.error("Payment recording failed:", error);
    alert("Error recording payment: " + error.message);
  } finally {
    recordPaymentBtn.textContent = 'Record Payment';
    recordPaymentBtn.disabled = false;
  }
});

// INIT - FULL
window.addEventListener('DOMContentLoaded', async () => {
  $('#item, #client, #searchClientList').select2({ width: '100%' });
  await fetchGSTRate();
  await populateClientsAndItems();
  renderInvoiceTable();

  document.querySelectorAll('input[name="gstOption"]').forEach(r => r.addEventListener('change', renderInvoiceTable));
  addItemBtn.addEventListener('click', addItemHandler);
  $(itemSelect).on('change', onItemChange);
  invoiceForm.addEventListener('submit', saveInvoiceHandler);
});
