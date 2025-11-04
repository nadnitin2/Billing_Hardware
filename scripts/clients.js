import { 
  getFirestore, collection, addDoc, getDocs, updateDoc, doc, query, where, getDoc, arrayUnion 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { app } from '../pages/firebase-config.js';
import { generateAccountNumber, formatDate } from '../utils/helpers.js';

const db = getFirestore(app);
const clientCol = collection(db, 'clients');
const invoiceCol = collection(db, 'invoices');

const clientTable = document.getElementById('clientTable');
const transactionTableBody = document.getElementById('transactionTableBody');
const transactionSection = document.getElementById('transactionSection');
const histClientName = document.getElementById('histClientName');
const fromDateInput = document.getElementById('fromDate');
const toDateInput = document.getElementById('toDate');
const applyFilterBtn = document.getElementById('applyFilter');
const clearFilterBtn = document.getElementById('clearFilter');
const downloadPDFBtn = document.getElementById('downloadPDF');
const downloadExcelBtn = document.getElementById('downloadExcel');
const form = document.getElementById('addClientForm');

let currentClientId = null;
let currentClientName = '';
let allPaymentsGlobal = [];

// Show & Hide Bootstrap Loader
function showLoader(text = "Loading...") {
  const loader = document.getElementById('globalLoader');
  document.getElementById('loaderText').textContent = text;
  loader.classList.remove('d-none');
}

function hideLoader() {
  const loader = document.getElementById('globalLoader');
  loader.classList.add('d-none');
}

// Add Client
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Adding...`;

  const data = {
    accountNo: generateAccountNumber(),
    name: form.clientName.value.trim(),
    contact: form.contact.value.trim(),
    address: form.address.value.trim(),
    active: true,
    transactions: []
  };

  try {
    await addDoc(clientCol, data);
    form.reset();
    await loadClients();
    alert("Client added successfully!");
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Add Client";
  }
});

// Load Clients
async function loadClients() {
  showLoader("Loading Clients...");
  clientTable.innerHTML = "";

  try {
    const snap = await getDocs(clientCol);
    
    if (snap.empty) {
      clientTable.innerHTML = `<tr class="no-clients-row"><td colspan="6" class="text-center text-muted">No clients found</td></tr>`;
    } else {
      snap.forEach((docSnap) => {
        const c = docSnap.data();
        const status = c.active ? "Active" : "Disabled";
        const btnLabel = c.active ? "Disable" : "Enable";
        const btnClass = c.active ? "btn-danger" : "btn-success";

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${c.accountNo}</td>
          <td>${c.name}</td>
          <td>${c.contact || '-'}</td>
          <td>${c.address || '-'}</td>
          <td>${status}</td>
          <td>
            <button class="btn ${btnClass} btn-sm me-1" onclick="confirmDisable('${docSnap.id}', ${c.active})">
              ${btnLabel}
            </button>
            <button class="btn btn-info btn-sm" onclick="showTransactions('${docSnap.id}', '${c.name}')">
              History
            </button>
          </td>
        `;
        clientTable.appendChild(row);
      });
    }
  } catch (err) {
    clientTable.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Error: ${err.message}</td></tr>`;
  } finally {
    hideLoader();
  }
}

// Show Transactions
window.showTransactions = async (clientId, clientName) => {
  currentClientId = clientId;
  currentClientName = clientName;
  histClientName.textContent = clientName;
  transactionSection.style.display = 'block';

  showLoader(`Loading ${clientName}'s Transactions...`);

  transactionTableBody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center">
        <div class="spinner-border spinner-border-sm text-primary"></div>
        <span class="ms-2">Loading...</span>
      </td>
    </tr>
  `;

  try {
    const q = query(invoiceCol, where("client", "==", clientName));
    const qSnap = await getDocs(q);

    allPaymentsGlobal = [];

    qSnap.forEach(doc => {
      const inv = doc.data();
      const isCancelled = inv.cancelled || false;
      if (inv.payments && Array.isArray(inv.payments)) {
        inv.payments.forEach(p => {
          const paymentDate = new Date(p.timestamp || p.date);
          allPaymentsGlobal.push({
            ...p,
            invoiceId: doc.id,
            invoiceNo: inv.invoiceNo,
            paymentDate,
            cancelled: isCancelled
          });
        });
      }
    });

    renderTransactions(allPaymentsGlobal);

  } catch (err) {
    console.error(err);
    transactionTableBody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Error: ${err.message}</td></tr>`;
  } finally {
    hideLoader();
  }
};

// Render with Filter
function renderTransactions(payments) {
  const from = fromDateInput.value ? new Date(fromDateInput.value) : null;
  const to = toDateInput.value ? new Date(toDateInput.value) : null;

  let filtered = payments;

  if (from || to) {
    filtered = payments.filter(p => {
      const d = p.paymentDate;
      if (from && d < from) return false;
      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        if (d > toEnd) return false;
      }
      return true;
    });
  }

  filtered.sort((a, b) => b.paymentDate - a.paymentDate);

  transactionTableBody.innerHTML = '';

  if (filtered.length === 0) {
    transactionTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No transactions found</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const amountClass = p.cancelled ? 'cancelled-amount' : '';
    const row = document.createElement('tr');
    row.className = p.cancelled ? 'table-warning' : '';
    row.innerHTML = `
      <td>${formatDate(p.paymentDate)}</td>
      <td>
        <a href="javascript:void(0)" 
           onclick="openInvoicePreview('${p.invoiceId}')"
           class="text-primary text-decoration-underline">
          ${p.invoiceNo}
        </a>
        ${p.cancelled ? ' <span class="badge bg-secondary badge-small">Cancelled</span>' : ''}
      </td>
      <td class="${amountClass}">Rs.${p.amount.toFixed(2)}</td>
      <td><span class="badge bg-info">${p.mode || 'Cash'}</span></td>
      <td><small>${p.txn || '-'}</small></td>
      <td><small>${p.remarks || '-'}</small></td>
    `;
    transactionTableBody.appendChild(row);
  });
}

// Apply Filter
applyFilterBtn.addEventListener('click', () => {
  if (allPaymentsGlobal.length > 0) renderTransactions(allPaymentsGlobal);
});

// Clear Filter
clearFilterBtn.addEventListener('click', () => {
  fromDateInput.value = '';
  toDateInput.value = '';
  if (allPaymentsGlobal.length > 0) renderTransactions(allPaymentsGlobal);
});

// Download PDF
downloadPDFBtn.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(`Transaction History - ${currentClientName}`, 14, 15);

  const from = fromDateInput.value ? `From: ${fromDateInput.value}` : '';
  const to = toDateInput.value ? `To: ${toDateInput.value}` : '';
  doc.setFontSize(10);
  doc.text(`${from} ${to}`, 14, 25);

  const headers = [['Date', 'Invoice', 'Amount', 'Mode', 'Txn ID', 'Remarks']];
  const rows = Array.from(transactionTableBody.querySelectorAll('tr'));
  const data = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    return cells.map((cell, i) => {
      let text = cell.innerText.replace(/Cancelled/g, '').trim();
      if (i === 2) {
        const num = text.replace(/[^\d.]/g, '');
        text = `Rs.${parseFloat(num).toFixed(2)}`;
      }
      return text;
    });
  });

  doc.autoTable({
    head: headers,
    body: data,
    startY: 35,
    theme: 'striped',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [41, 128, 185] }
  });

  doc.save(`${currentClientName}_transactions.pdf`);
});

// Download Excel
downloadExcelBtn.addEventListener('click', () => {
  let csv = 'Date,Invoice,Amount,Mode,Txn ID,Remarks\n';
  transactionTableBody.querySelectorAll('tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    const rowData = Array.from(cells).map(cell => `"${cell.innerText.replace(/"/g, '""').replace(/Cancelled/g, '')}"`);
    csv += rowData.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentClientName}_transactions.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Disable / Enable Client
window.confirmDisable = async (id, active) => {
  const action = active ? "disable" : "enable";
  if (!confirm(`Are you sure you want to ${action} this client?`)) return;

  try {
    await updateDoc(doc(db, 'clients', id), { active: !active });
    alert(`Client ${action}d successfully`);
    await loadClients();
    if (currentClientId === id) transactionSection.style.display = 'none';
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// Real-time Search
const clientSearchInput = document.getElementById('clientSearch');
clientSearchInput.addEventListener('input', () => {
  const query = clientSearchInput.value.trim().toLowerCase();
  const rows = clientTable.querySelectorAll('tr');

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0 || row.classList.contains('no-clients-row')) {
      row.style.display = '';
      return;
    }

    const accountNo = cells[0].textContent.toLowerCase();
    const name = cells[1].textContent.toLowerCase();
    const contact = cells[2].textContent.toLowerCase();

    const matches = accountNo.includes(query) || name.includes(query) || contact.includes(query);
    row.style.display = matches ? '' : 'none';
  });

  const visibleRows = Array.from(rows).filter(r => r.style.display !== 'none' && !r.classList.contains('no-clients-row'));
  if (visibleRows.length === 0 && query) {
    if (!document.querySelector('.no-results-row')) {
      const nr = document.createElement('tr');
      nr.className = 'no-results-row';
      nr.innerHTML = `<td colspan="6" class="text-center text-muted">No clients match "${query}"</td>`;
      clientTable.appendChild(nr);
    }
  } else {
    const nr = document.querySelector('.no-results-row');
    if (nr) nr.remove();
  }
});

// Invoice Preview in New Window
window.openInvoicePreview = async (invoiceId) => {
  showLoader("Opening Invoice Preview...");

  try {
    const invRef = doc(db, 'invoices', invoiceId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) throw new Error("Invoice not found!");

    const inv = invSnap.data();

    const clientSnap = await getDocs(clientCol);
    let clientInfo = { name: inv.client, accountNo: "-", contact: "-", address: "-" };
    clientSnap.forEach(dc => {
      const c = dc.data();
      if (c.name === inv.client) clientInfo = c;
    });

    const paid = inv.paidAmount || 0;
    const pending = (inv.total || 0) - paid;

    const cancelledRemark = inv.cancelled
      ? `<div class="text-center text-danger fw-bold fs-5 mb-2 border border-danger rounded p-1">Cancelled Invoice</div>`
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
          <p><strong>Subtotal:</strong> ₹${inv.subtotal.toFixed(2)}</p>
          <p><strong>GST (18%):</strong> ₹${inv.gst.toFixed(2)}</p>
          <p><strong>Total:</strong> ₹${inv.total.toFixed(2)}</p>
          <p><strong>Paid:</strong> ₹${paid.toFixed(2)}</p>
          <p><strong>Pending:</strong> ₹${pending.toFixed(2)}</p>
          <h6><strong>Payable:</strong> ₹${inv.payable.toFixed(2)}</h6>
        </div>
        <div class="mt-3">
          <label><strong>Terms & Conditions:</strong></label>
          <ol style="margin-left:15px; line-height:1.4;">
            <li>Goods once sold will not be taken back.</li>
            <li>Warranty as per manufacturer only.</li>
            <li>Please check items before leaving counter.</li>
            <li>All disputes subject to Latur jurisdiction only.</li>
          </ol>
        </div>
        <div class="d-flex justify-content-between mt-4">
          <div class="text-center" style="width:40%;">
            <div style="border:1px dashed #999; height:60px;"></div>
            <p class="mt-1"><strong>Stamp</strong></p>
          </div>
          <div class="text-center" style="width:40%;">
            <div style="border-bottom:1px solid #000; height:50px;"></div>
            <p class="mt-1"><strong>Authorized Signature</strong></p>
          </div>
        </div>
      </div>
    `;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`
      <html>
        <head>
          <title>${inv.invoiceNo}</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body>${html}</body>
      </html>
    `);
    win.document.close();

  } catch (err) {
    console.error(err);
    alert("Error loading invoice preview: " + err.message);
  } finally {
    hideLoader();
  }
};

// Initial Load
loadClients();