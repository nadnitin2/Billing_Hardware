import { app } from "../pages/firebase-config.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc,
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
const searchClient = document.getElementById('searchClient');
const invoiceListTable = document.getElementById('invoiceList');
const invoiceTable = document.getElementById('invoiceTable');

const payModalClient = document.getElementById('payModalClient');
const payModalInv = document.getElementById('payModalInv');
const payModalDue = document.getElementById('payModalDue');
const payAmt = document.getElementById('payAmt');
const payMode = document.getElementById('payMode');
const payTxn = document.getElementById('payTxn');
const payRemarks = document.getElementById('payRemarks');

let invoiceItems = [], gstRate = 0.18;
let stockMap = {}, invoiceCache = [];
let currentInvoiceId = null;

// ---------- FETCH GST RATE ----------
async function fetchGSTRate() {
  const snap = await getDoc(settingsDoc);
  if (snap.exists()) {
    gstRate = +snap.data().rate / 100;
    gstPercentEl.textContent = snap.data().rate;
  }
}

// ---------- CALCULATION ----------
function updateSummary(applyGst = true) {
  const subtotal = invoiceItems.reduce(
    (s, i) => s + (i.qty * i.rate * (1 - i.discount / 100)),
    0
  );
  const gst = applyGst ? subtotal * gstRate : 0;
  const total = subtotal + gst;

  subtotalEl.textContent = subtotal.toFixed(2);
  gstAmountEl.textContent = gst.toFixed(2);
  totalAmountEl.textContent = total.toFixed(2);
  payableAmountEl.textContent = total.toFixed(2);

  // UI hint
  gstPercentEl.parentElement.style.display = applyGst ? '' : 'none';
}

// ---------- RENDER TABLE ----------
function renderInvoiceTable() {
  invoiceTable.innerHTML = '';
  invoiceItems.forEach((it, idx) => {
    invoiceTable.innerHTML += `
      <tr>
        <td>${it.name} (${it.brand || 'N/A'})</td>
        <td>${it.unit || 'pcs'}</td>
        <td>${it.qty}</td>
        <td>₹${it.rate}</td>
        <td>${it.discount}%</td>
        <td>₹${(it.qty * it.rate * (1 - it.discount / 100)).toFixed(2)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="removeItem(${idx})">Remove</button></td>
      </tr>`;
  });
  // always recalc with current radio state
  const withGst = document.querySelector('input[name="gstOption"]:checked').value === 'yes';
  updateSummary(withGst);
}
window.removeItem = idx => { invoiceItems.splice(idx, 1); renderInvoiceTable(); };

// ---------- ADD ITEM ----------
function addItemHandler() {
  const id = itemSelect.value;
  const qty = +qtyInput.value;
  const rate = +rateInput.value;
  const discount = +itemDiscInput.value || 0;
  if (!id || !qty || !rate) return alert('Fill all fields');
  const st = stockMap[id];
  if (!st || qty > st.qty) return alert('Stock not sufficient!');
  if (invoiceItems.some(item => item.id === id)) return alert('Item already added!');
  invoiceItems.push({
    id, name: st.name, brand: st.brand || 'N/A', unit: st.unit || 'pcs', qty, rate, discount
  });
  renderInvoiceTable();
  itemSelect.value = qtyInput.value = rateInput.value = itemDiscInput.value = '';
}

// ---------- ITEM CHANGE ----------
function onItemChange() {
  const selectedId = $(itemSelect).val();
  const st = stockMap[selectedId];
  rateInput.value = st && st.price ? st.price : '';
}

// ---------- POPULATE CLIENTS + ITEMS ----------
async function populateClientsAndItems() {
  (await getDocs(clientCol)).forEach(dc => {
    const c = dc.data();
    [clientSelect, searchClient].forEach(sel => {
      const op = document.createElement('option');
      op.value = c.name;
      op.textContent = `${c.name} (${c.accountNo || ''})`;
      sel.append(op);
    });
  });
  (await getDocs(stockCol)).forEach(dc => {
    const s = dc.data();
    stockMap[dc.id] = s;
    if (s.qty > 0) {
      const op = document.createElement('option');
      op.value = dc.id;
      op.textContent = `${s.name} (${s.brand || 'No Brand'}) - ${s.unit || 'pcs'}`;
      itemSelect.append(op);
    }
  });
}

// ---------- LOAD INVOICES ----------
window.loadInvoices = async () => {
  const clientName = searchClient.value;
  if (!clientName || clientName === 'All') {
    invoiceListTable.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Select a client to view invoices</td></tr>`;
    invoiceCache = [];
    return;
  }

  invoiceListTable.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Loading ${clientName}...</td></tr>`;
  invoiceCache = [];

  try {
    const q = query(invoiceCol, where("client", "==", clientName));
    const qSnap = await getDocs(q);
    invoiceListTable.innerHTML = '';
    if (qSnap.empty) {
      invoiceListTable.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No invoices found</td></tr>`;
      return;
    }

    const clientInvoices = [];
    qSnap.forEach(doc => { const inv = doc.data(); inv.id = doc.id; clientInvoices.push(inv); });
    clientInvoices.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.invoiceNo.localeCompare(a.invoiceNo)));

    clientInvoices.forEach(inv => {
      invoiceCache.push(inv);
      let badge = 'bg-danger', text = 'Pending';
      if (inv.cancelled) { badge = 'bg-secondary'; text = 'Cancelled'; }
      else if (inv.cleared) { badge = 'bg-success'; text = 'Cleared'; }
      else if (inv.paidAmount > 0) { badge = 'bg-warning text-dark'; text = 'Partial'; }

      const row = document.createElement('tr');
      if (inv.cancelled) row.classList.add('table-danger');
      row.innerHTML = `
        <td>${inv.date}</td>
        <td>${inv.client}</td>
        <td>${inv.items.length}</td>
        <td>₹${Number(inv.payable).toFixed(2)}</td>
        <td><span class="badge ${badge}">${text}</span></td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-secondary" onclick="viewInvoice('${inv.id}')">View</button>
          <button class="btn btn-sm btn-info" onclick="printInvoice('${inv.id}')">Print</button>
          <button class="btn btn-sm btn-warning ms-1" onclick="downloadPDF('${inv.id}')">PDF</button>
          ${!inv.cleared && !inv.cancelled ? `<button class="btn btn-sm btn-success ms-1" onclick="openPaymentModal('${inv.id}')">Pay</button>` : ''}
          ${!inv.cancelled ? `<button class="btn btn-sm btn-danger ms-1" onclick="cancelInvoice('${inv.id}')">Cancel</button>` : '<span class="badge bg-secondary">Cancelled</span>'}
        </td>`;
      invoiceListTable.appendChild(row);
    });

  } catch (err) {
    console.error("Filter error:", err);
    invoiceListTable.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Error: ${err.message}</td></tr>`;
  }
};

// ---------- GST % DISPLAY FOR OLD INVOICES ----------
function getInvoiceGstPercentForDisplay(inv) {
  if (inv && typeof inv.gstRate === 'number') return inv.gstRate;
  const sub = Number(inv?.subtotal || 0);
  const g = Number(inv?.gst || 0);
  if (sub > 0 && g >= 0) {
    const pct = Math.round((g / sub) * 100);
    if (isFinite(pct)) return pct;
  }
  const nowPct = parseFloat(document.getElementById('gstPercent')?.textContent || '18');
  return isNaN(nowPct) ? 18 : nowPct;
}

/* ========================= VIEW INVOICE ========================= */
window.viewInvoice = async (invoiceId) => {
  const inv = invoiceCache.find(i => i.id === invoiceId);
  if (!inv) return alert("Invoice not found!");

  // Fetch client info
  const clientSnap = await getDocs(clientCol);
  let clientInfo = { name: inv.client, accountNo: "-", contact: "-", address: "-" };
  clientSnap.forEach(dc => { const c = dc.data(); if (c.name === inv.client) clientInfo = c; });

  const paid = Number(inv.paidAmount || 0);
  const pending = Number((inv.total || 0) - paid);
  const gstLabelPercent = getInvoiceGstPercentForDisplay(inv);

  const cancelledRemark = inv.cancelled
    ? `<div class="text-center text-danger fw-bold fs-5 mb-2 border border-danger rounded p-1">🚫 Cancelled Invoice</div>`
    : "";

  const html = `
    <div class="container mt-2" style="font-size:13px;">
      ${cancelledRemark}
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div><img src="/assets/logo.png" width="150" alt="Logo"></div>
        <div class="text-center flex-grow-1">
          <h5 class="mb-0"><strong>Kuber Hardware</strong></h5>
          <small>A/p Kumbhoj tal Hatkangale Maharashtra Contact :- 1234567890</small>
        </div>
        <div class="text-end">
          <p class="mb-0"><strong>Date:</strong> ${inv.date}</p>
          <p class="mb-0"><strong>${inv.invoiceNo}</strong></p>
        </div>
      </div>
      <hr class="my-2"/>
      <div class="mb-2">
        <p class="mb-0"><strong>Customer:</strong> ${clientInfo.name}</p>
        <p class="mb-0"><strong>Account No:</strong> ${clientInfo.accountNo}</p>
        <p class="mb-0"><strong>Contact:</strong> ${clientInfo.contact}</p>
        <p class="mb-0"><strong>Address:</strong> ${clientInfo.address}</p>
      </div>
      <table class="table table-bordered table-sm align-middle mt-2">
        <thead class="table-light">
          <tr><th>Item (Brand)</th><th class="text-center">Unit</th><th class="text-center">Qty</th><th class="text-center">Rate</th><th class="text-center">Disc</th><th class="text-end">Amount</th></tr>
        </thead>
        <tbody>
          ${inv.items.map(it => `
            <tr>
              <td>${it.name} (${it.brand || 'N/A'})</td>
              <td class="text-center">${it.unit || 'pcs'}</td>
              <td class="text-center">${it.qty}</td>
              <td class="text-center">₹${it.rate}</td>
              <td class="text-center">${it.discount}%</td>
              <td class="text-end">₹${(it.qty * it.rate * (1 - it.discount / 100)).toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="text-end mt-2">
        <p><strong>Subtotal:</strong> ₹${Number(inv.subtotal).toFixed(2)}</p>
        <p><strong>GST ( ${gstLabelPercent}%):</strong> ₹${Number(inv.gst).toFixed(2)}</p>
        <p><strong>Total:</strong> ₹${Number(inv.total).toFixed(2)}</p>
        <p><strong>Paid:</strong> ₹${paid.toFixed(2)}</p>
        <p><strong>Pending:</strong> ₹${pending.toFixed(2)}</p>
        <h6><strong>Payable:</strong> ₹${Number(inv.payable).toFixed(2)}</h6>
      </div>
      
      <div class="mt-4">
        <strong>Terms & Conditions:</strong>
        <ol class="small ps-4">
          <li>Goods once sold will not be taken back.</li>
          <li>Warranty as per manufacturer only.</li>
          <li>Please check items before leaving counter.</li>
          <li>All disputes subject to Latur jurisdiction only.</li>
        </ol>
      </div>

      <div class="d-flex justify-content-between mt-5">
        <div class="text-center">
          <div style="border:1px dashed #999; height:60px; width:160px;"></div>
          <p class="mt-2"><strong>Stamp</strong></p>
        </div>
        <div class="text-center">
          <div style="border-bottom:2px solid #000; width:160px;"></div>
          <p class="mt-2"><strong>Authorized Signature</strong></p>
        </div>
      </div>
    </div>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`
    <html>
      <head>
        <title>${inv.invoiceNo}</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body>${html}</body>
    </html>`);
  win.document.close();
};

/* ========================= PRINT INVOICE ========================= */
window.printInvoice = async (invoiceId) => {
  const inv = invoiceCache.find(i => i.id === invoiceId);
  if (!inv) return alert("Invoice not found!");

  const clientSnap = await getDocs(clientCol);
  let clientInfo = { name: inv.client, accountNo: "-", contact: "-", address: "-" };
  clientSnap.forEach(dc => { const c = dc.data(); if (c.name === inv.client) clientInfo = c; });

  const paid = Number(inv.paidAmount || 0);
  const pending = Number((inv.total || 0) - paid);
  const gstLabelPercent = getInvoiceGstPercentForDisplay(inv);

  const cancelledRemark = inv.cancelled
    ? `<div class="text-center text-danger fw-bold fs-5 mb-2 border border-danger rounded p-1">🚫 Cancelled Invoice</div>`
    : "";

  const html = `
    <html>
    <head>
      <title>${inv.invoiceNo}</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, sans-serif; font-size: 13px; margin: 10mm auto; width: 190mm; color: #000; }
        table { width:100%; border-collapse: collapse; }
        th, td { border:1px solid #000; padding:4px; }
        th { background-color:#f8f9fa; }
      </style>
    </head>
    <body>
      <div class="container mt-2" style="font-size:13px;">
        ${cancelledRemark}
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div><img src="/assets/logo.png" width="150" alt="Logo"></div>
          <div class="text-center flex-grow-1">
            <h5 class="mb-0"><strong>Kuber Hardware</strong></h5>
            <small>A/p Kumbhoj tal Hatkangale Maharashtra Contact :- 1234567890</small>
          </div>
          <div class="text-end">
            <p class="mb-0"><strong>Date:</strong> ${inv.date}</p>
            <p class="mb-0"><strong>${inv.invoiceNo}</strong></p>
          </div>
        </div>
        <hr class="my-2"/>
        <div class="mb-2">
          <p class="mb-0"><strong>Customer:</strong> ${clientInfo.name}</p>
          <p class="mb-0"><strong>Account No:</strong> ${clientInfo.accountNo}</p>
          <p class="mb-0"><strong>Contact:</strong> ${clientInfo.contact}</p>
          <p class="mb-0"><strong>Address:</strong> ${clientInfo.address}</p>
        </div>
        <table class="table table-bordered table-sm align-middle mt-2">
          <thead class="table-light">
            <tr>
              <th>Item (Brand)</th>
              <th class="text-center">Unit</th>
              <th class="text-center">Qty</th>
              <th class="text-center">Rate</th>
              <th class="text-center">Disc</th>
              <th class="text-end">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${inv.items.map(it => `
              <tr>
                <td>${it.name} (${it.brand || 'N/A'})</td>
                <td class="text-center">${it.unit || 'pcs'}</td>
                <td class="text-center">${it.qty}</td>
                <td class="text-center">₹${it.rate}</td>
                <td class="text-center">${it.discount}%</td>
                <td class="text-end">₹${(it.qty * it.rate * (1 - it.discount / 100)).toFixed(2)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="text-end mt-2">
          <p><strong>Subtotal:</strong> ₹${Number(inv.subtotal).toFixed(2)}</p>
          <p><strong>GST ( ${gstLabelPercent}%):</strong> ₹${Number(inv.gst).toFixed(2)}</p>
          <p><strong>Total:</strong> ₹${Number(inv.total).toFixed(2)}</p>
          <p><strong>Paid:</strong> ₹${paid.toFixed(2)}</p>
          <p><strong>Pending:</strong> ₹${pending.toFixed(2)}</p>
          <h6><strong>Payable:</strong> ₹${Number(inv.payable).toFixed(2)}</h6>
        </div>

        <div class="mt-4" style="page-break-before: auto;">
          <strong>Terms & Conditions:</strong>
          <ol class="small ps-4">
            <li>Goods once sold will not be taken back.</li>
            <li>Warranty as per manufacturer only.</li>
            <li>Please check items before leaving counter.</li>
            <li>All disputes subject to Latur jurisdiction only.</li>
          </ol>
        </div>

        <div class="d-flex justify-content-between mt-5">
          <div class="text-center">
            <div style="border:1px dashed #999; height:60px; width:160px;"></div>
            <p class="mt-2"><strong>Stamp</strong></p>
          </div>
          <div class="text-center">
            <div style="border-bottom:2px solid #000; width:160px;"></div>
            <p class="mt-2"><strong>Authorized Signature</strong></p>
          </div>
        </div>
      </div>
    </body>
    </html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  win.print();
};

/* ========================= DOWNLOAD PDF ========================= */
window.downloadPDF = async (invoiceId, btn) => {
  if (!btn) btn = event?.target?.closest('button') || document.querySelector(`[onclick*="downloadPDF('${invoiceId}')"]`);

  const inv = invoiceCache.find(i => i.id === invoiceId);
  if (!inv) return alert("Invoice not found!");

  const oldText = btn.textContent.trim();
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Preparing...`;

  try {
    const clientSnap = await getDocs(clientCol);
    let clientInfo = { name: inv.client, accountNo: "-", contact: "-", address: "-" };
    clientSnap.forEach(dc => { if (dc.data().name === inv.client) clientInfo = dc.data(); });

    const paid = Number(inv.paidAmount || 0);
    const pending = Number((inv.total || 0) - paid);
    const gstLabelPercent = getInvoiceGstPercentForDisplay(inv);

    const cancelledRemark = inv.cancelled
      ? `<div class="text-center text-danger fw-bold fs-5 mb-2 border border-danger rounded p-1">CANCELLED INVOICE</div>`
      : "";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${inv.invoiceNo}</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, sans-serif; font-size: 13px; color: #000; }
          .container { width: 190mm; margin: auto; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 6px; text-align: center; }
          th { background: #f8f9fa; }
          .text-end { text-align: right; }
        </style>
      </head>
      <body>
        <div class="container">
          ${cancelledRemark}
          <div class="d-flex justify-content-between mb-3">
            <div><img src="/assets/logo.png" width="150" alt="Logo"></div>
            <div class="text-center">
              <h5 class="mb-0 fw-bold">Kuber Hardware</h5>
              <small>A/p Kumbhoj tal Hatkangale Maharashtra<br>Contact: 1234567890</small>
            </div>
            <div class="text-end">
              <p class="mb-0"><strong>Date:</strong> ${inv.date}</p>
              <p class="mb-0 fw-bold fs-4">${inv.invoiceNo}</p>
            </div>
          </div>
          <hr>
          <div class="mb-3">
            <p><strong>Customer:</strong> ${clientInfo.name}</p>
            <p><strong>Account No:</strong> ${clientInfo.accountNo}</p>
            <p><strong>Contact:</strong> ${clientInfo.contact}</p>
            <p><strong>Address:</strong> ${clientInfo.address}</p>
          </div>

          <table>
            <thead>
              <tr><th>Item (Brand)</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Disc</th><th class="text-end">Amount</th></tr>
            </thead>
            <tbody>
              ${inv.items.map(it => `
                <tr>
                  <td>${it.name} (${it.brand || 'N/A'})</td>
                  <td>${it.unit || 'pcs'}</td>
                  <td>${it.qty}</td>
                  <td>₹${it.rate}</td>
                  <td>₹${it.discount}%</td>
                  <td class="text-end">₹${(it.qty * it.rate * (1 - it.discount / 100)).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="text-end fw-bold mt-3">
            <p>Subtotal: ₹${Number(inv.subtotal).toFixed(2)}</p>
            <p>GST ( ${gstLabelPercent}%): ₹${Number(inv.gst).toFixed(2)}</p>
            <p>Total: ₹${Number(inv.total).toFixed(2)}</p>
            <p>Paid: ₹${paid.toFixed(2)}</p>
            <p>Pending: ₹${pending.toFixed(2)}</p>
            <h5>Payable: ₹${Number(inv.payable).toFixed(2)}</h5>
          </div>

          <div class="mt-4">
            <strong>Terms & Conditions:</strong>
            <ol class="small ps-4">
              <li>Goods once sold will not be taken back.</li>
              <li>Warranty as per manufacturer only.</li>
              <li>Please check items before leaving counter.</li>
              <li>All disputes subject to Latur jurisdiction only.</li>
            </ol>
          </div>

          <div class="d-flex justify-content-between mt-5">
            <div class="text-center">
              <div style="border:1px dashed #999; height:60px; width:160px;"></div>
              <p class="mt-2"><strong>Stamp</strong></p>
            </div>
            <div class="text-center">
              <div style="border-bottom:2px solid #000; width:160px;"></div>
              <p class="mt-2"><strong>Authorized Signature</strong></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Need html2canvas + jsPDF already loaded in page.
    if (!window.html2canvas || !window.jspdf?.jsPDF) {
      alert("Missing html2canvas/jsPDF on this page.");
      return;
    }

    const div = document.createElement('div');
    div.innerHTML = html;
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    div.style.width = '210mm';
    document.body.appendChild(div);

    await new Promise(r => setTimeout(r, 500));
    const canvas = await html2canvas(div, { scale: 2, useCORS: true });
    const img = canvas.toDataURL('image/png');

    const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pdfWidth = 210;
    const pdfHeight = 297;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(img, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(img, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(`${inv.invoiceNo}.pdf`);
    document.body.removeChild(div);
    alert("PDF Download Done ✅");
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
};


/* ========================= OPEN PAYMENT MODAL ========================= */
window.openPaymentModal = async (invoiceId) => {
  const docRef = doc(db, 'invoices', invoiceId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return alert("Invoice not found!");

  const inv = snap.data();
  currentInvoiceId = invoiceId;

  const paid = inv.paidAmount || 0;
  const payable = inv.payable || inv.total;
  const pending = payable - paid;

  payModalClient.textContent = inv.client;
  payModalInv.textContent = inv.invoiceNo;
  payModalDue.textContent = pending.toFixed(2);
  payAmt.value = pending > 0 ? pending.toFixed(2) : '0.00';
  payAmt.max = pending.toFixed(2);

  new bootstrap.Modal(document.getElementById('payModal')).show();
};


/* ========================= RECORD PAYMENT ========================= */
document.getElementById("recordPayment").addEventListener("click", async () => {
  const amount = parseFloat(payAmt.value) || 0;
  if (amount <= 0) return alert("Enter valid amount");

  const invRef = doc(db, 'invoices', currentInvoiceId);
  const snap = await getDoc(invRef);
  const inv = snap.data();

  const currentPaid = inv.paidAmount || 0;
  const newPaidTotal = currentPaid + amount;

  const payable = inv.payable || inv.total; // Never change payable
  if (newPaidTotal > payable) {
    return alert(`Cannot pay more than ₹${(payable - currentPaid).toFixed(2)}`);
  }

  const cleared = newPaidTotal >= payable;

  const paymentEntry = {
    amount,
    mode: payMode.value,
    txn: payTxn.value,
    remarks: payRemarks.value,
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString()
  };

  try {
    await updateDoc(invRef, {
      paidAmount: newPaidTotal,
      cleared,
      payments: [...(inv.payments || []), paymentEntry]
    });

    const clientQ = query(clientCol, where("name", "==", inv.client));
    const clientQSnap = await getDocs(clientQ);
    if (!clientQSnap.empty) {
      const clientRef = doc(db, 'clients', clientQSnap.docs[0].id);
      await updateDoc(clientRef, { transactions: arrayUnion(paymentEntry) });
    }

    bootstrap.Modal.getInstance(document.getElementById('payModal')).hide();
    alert("Payment recorded successfully!");
    loadInvoices();

  } catch (err) {
    console.error("Payment error:", err);
    alert("Error: " + err.message);
  }
});


/* ========================= CANCEL INVOICE (optional) ========================= */
window.cancelInvoice = async (invoiceId) => {
  if (!confirm('Cancel this invoice?')) return;
  const ref = doc(db, 'invoices', invoiceId);
  await updateDoc(ref, { cancelled: true });
  loadInvoices();
};

/* ========================= SAVE INVOICE ========================= */
async function saveInvoiceHandler(e) {
  e.preventDefault();
  if (!clientSelect.value || invoiceItems.length === 0) return alert('Required!');

  // ---- client active check ----
  const qSnap = await getDocs(clientCol);
  let clientData = null;
  qSnap.forEach(dc => { if (dc.data().name === clientSelect.value) clientData = dc.data(); });
  if (!clientData || clientData.active === false) return alert('Client not active');

  const btn = e.submitter;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving...`;

  try {
    await fetchGSTRate();

    // ---- GST OPTION ----
    const withGst = document.querySelector('input[name="gstOption"]:checked').value === 'yes';
    const gstRatePercent = withGst ? +(gstPercentEl.textContent || 18) : 0;

    const date = new Date().toISOString().split('T')[0];
    const subtotal = +subtotalEl.textContent;
    const gst = withGst ? +gstAmountEl.textContent : 0;
    const total = subtotal + gst;

    // ---- next invoice number ----
    const allSnap = await getDocs(invoiceCol);
    const invoiceNo = `INV-${String(allSnap.size + 1).padStart(5, '0')}`;

    const data = {
      invoiceNo,
      client: clientSelect.value,
      date,
      items: invoiceItems,
      subtotal,
      gst,
      total,
      payable: total,
      paidAmount: 0,
      payments: [],
      cleared: false,
      gstRate: gstRatePercent        // 0 when without GST
    };

    // ---- save invoice ----
    const docRef = await addDoc(invoiceCol, data);
    await updateDoc(docRef, { id: docRef.id });

    // ---- reduce stock ----
    for (const it of invoiceItems) {
      const stDoc = doc(stockCol, it.id);
      const stSnap = await getDoc(stDoc);
      if (stSnap.exists()) {
        await updateDoc(stDoc, { qty: (stSnap.data().qty || 0) - it.qty });
      }
    }

    // ---- UI reset ----
    invoiceItems = [];
    invoiceForm.reset();
    renderInvoiceTable();
    await loadInvoices();

    btn.innerHTML = `Saved!`;
    setTimeout(() => { btn.innerHTML = `Generate Invoice`; btn.disabled = false; }, 1200);

  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
    btn.innerHTML = `Generate Invoice`;
    btn.disabled = false;
  }
}

/* ========================= INITIAL LOADER ========================= */
window.addEventListener('DOMContentLoaded', async () => {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="globalLoader" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
      <div class="text-center">
        <div class="spinner-border text-primary mb-3" style="width:3rem;height:3rem;"></div>
        <p class="fw-bold">Loading Kuber Hardware...</p>
      </div>
    </div>`);

  $('#item, #client, #searchClient').select2({ width: '100%' });

  await populateClientsAndItems();
  await fetchGSTRate();

  // default summary (with GST)
  updateSummary(true);

  // ---- radio change → recalc ----
  document.querySelectorAll('input[name="gstOption"]').forEach(r => {
    r.addEventListener('change', () => renderInvoiceTable());
  });

  addItemBtn.addEventListener('click', addItemHandler);
  $(itemSelect).on('change', onItemChange);
  invoiceForm.addEventListener('submit', saveInvoiceHandler);

  setTimeout(() => {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.remove();
  }, 800);
});
