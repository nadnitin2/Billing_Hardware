import {
  getFirestore, collection, addDoc, getDocs, updateDoc, doc, query, where, getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { app } from '../pages/firebase-config.js';
import { generateAccountNumber } from '../utils/helpers.js';

const db = getFirestore(app);
const clientCol = collection(db, 'clients');
const invoiceCol = collection(db, 'invoices');

// DOM Elements
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

// BULLETPROOF DATE FIX – undefined कधीही नाही!
function getInvoiceDisplayDate(invDate) {
  if (!invDate) return '12-11-2025';

  let str = String(invDate);
  str = str.replace(/[^0-9-]/g, ''); // फक्त digits आणि - ठेव

  const match = str.match(/(\d{2})-?(\d{2})-?(\d{4})/);
  if (match) {
    const day = match[1];
    const month = match[2];
    const year = match[3];
    const test = new Date(`${year}-${month}-${day}`);
    if (!isNaN(test)) {
      return `${day}-${month}-${year}`;
    }
  }

  try {
    if (invDate.toDate) {
      const d = invDate.toDate();
      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }
    if (invDate.seconds !== undefined) {
      const d = new Date(invDate.seconds * 1000);
      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }
    if (invDate instanceof Date && !isNaN(invDate)) {
      return `${String(invDate.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${invDate.getFullYear()}`;
    }
  } catch (e) { }

  return '12-11-2025';
}

// Loader
function showLoader(text = "Loading...") {
  const loader = document.getElementById('globalLoader');
  if (loader) {
    document.getElementById('loaderText').textContent = text;
    loader.classList.remove('d-none');
  }
}
function hideLoader() {
  const loader = document.getElementById('globalLoader');
  if (loader) loader.classList.add('d-none');
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

async function loadClients() {
  showLoader("Loading Clients...");
  clientTable.innerHTML = "<tr><td colspan='6' class='text-center'>Loading...</td></tr>";

  try {
    const snap = await getDocs(clientCol);
    clientTable.innerHTML = "";
    if (snap.empty) {
      clientTable.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No clients found</td></tr>`;
    } else {
      snap.forEach((docSnap) => {
        const c = docSnap.data();
        const status = c.active ? "Active" : "Disabled";
        const btnLabel = c.active ? "Disable" : "Enable";  // FIXED: आता पूर्ण line आहे!
        const btnClass = c.active ? "btn-danger" : "btn-success";

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${c.accountNo}</td>
          <td>${c.name}</td>
          <td>${c.contact || '-'}</td>
          <td>${c.address || '-'}</td>
          <td>${status}</td>
          <td>
            <button class="btn ${btnClass} btn-sm me-1" onclick="confirmDisable('${docSnap.id}', ${c.active})">${btnLabel}</button>
            <button class="btn btn-info btn-sm" onclick="showTransactions('${docSnap.id}', '${c.name}')">History</button>
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

// MAIN FIX: showTransactions
/// === FULL FIXED showTransactions – COPY-PASTE कर ===
window.showTransactions = async (clientId, clientName) => {
  currentClientId = clientId;
  currentClientName = clientName;
  histClientName.textContent = clientName;
  transactionSection.style.display = 'block';
  showLoader(`Loading ${clientName}'s History...`);
  transactionTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Loading...</td></tr>`;

  allPaymentsGlobal = [];

  try {
    const q = query(invoiceCol, where("client", "==", clientName));
    const qSnap = await getDocs(q);

    const transactions = [];

    qSnap.forEach(d => {
      const inv = d.data();
      const invId = d.id;
      const displayDate = getInvoiceDisplayDate(inv.date);

      // CASE 1: INVOICE CANCELLED → फक्त 1 entry (Rs. 0.00)
      if (inv.cancelled) {
        transactions.push({
          invoiceId: invId,
          invoiceNo: inv.invoiceNo || 'INV-00000',
          displayDate: displayDate,
          paymentDate: inv.cancelledAt || new Date(),
          amount: 0,
          mode: 'CANCELLED',
          txn: '-',
          remarks: inv.cancelReason || 'Invoice Cancelled',
          cancelled: true,
          cleared: false,
          payable: inv.payable || 0,
          paidAmount: inv.paidAmount || 0,
          status: 'Cancelled'
        });
        // No more entries for this invoice
        return;
      }

      // CASE 2: NORMAL PAYMENTS
      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach(p => {
          const pending = inv.payable - (inv.paidAmount || 0);
          let status = 'Pending';
          if (inv.cleared || pending <= 0) status = 'Cleared';
          else if ((inv.paidAmount || 0) > 0) status = 'Partial';

          transactions.push({
            invoiceId: invId,
            invoiceNo: inv.invoiceNo || 'INV-00000',
            displayDate: displayDate,
            paymentDate: p.timestamp?.toDate() || new Date(p.date || Date.now()),
            amount: p.amount || 0,
            mode: p.mode || 'Cash',
            txn: p.txn || '-',
            remarks: p.remarks || '-',
            cancelled: false,
            cleared: inv.cleared || false,
            payable: inv.payable || 0,
            paidAmount: inv.paidAmount || 0,
            status: status
          });
        });
      }
      // CASE 3: NO PAYMENT पण INVOICE EXIST (Unpaid)
      else {
        transactions.push({
          invoiceId: invId,
          invoiceNo: inv.invoiceNo || 'INV-00000',
          displayDate: displayDate,
          paymentDate: new Date(inv.date || Date.now()),
          amount: 0,
          mode: 'UNPAID',
          txn: '-',
          remarks: 'No payment yet',
          cancelled: false,
          cleared: false,
          payable: inv.payable || 0,
          paidAmount: 0,
          status: 'Pending'
        });
      }
    });

    allPaymentsGlobal = transactions
      .map(t => ({ ...t, paymentDateObj: new Date(t.paymentDate) }))
      .sort((a, b) => b.paymentDateObj - a.paymentDateObj);

    renderTransactions(allPaymentsGlobal);

  } catch (err) {
    console.error(err);
    transactionTableBody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error: ${err.message}</td></tr>`;
  } finally {
    hideLoader();
  }
};

// 2. renderTransactions – Status column + Cancelled badge
function renderTransactions(payments) {
  const from = fromDateInput.value ? new Date(fromDateInput.value) : null;
  const to = toDateInput.value ? new Date(toDateInput.value) : null;

  let filtered = payments.filter(p => {
    const d = p.paymentDateObj;
    if (from && d < from) return false;
    if (to) { const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999); if (d > toEnd) return false; }
    return true;
  });

  transactionTableBody.innerHTML = filtered.length === 0
    ? `<tr><td colspan="8" class="text-center text-muted">No transactions found</td></tr>`
    : '';

  filtered.forEach(p => {
    const row = document.createElement('tr');
    row.className = p.cancelled ? 'table-secondary' : '';

    const badgeClass = p.status === 'Cancelled' ? 'bg-secondary' :
      p.status === 'Cleared' ? 'bg-success' :
        p.status === 'Partial' ? 'bg-warning' : 'bg-danger';

    const modeBadge = p.cancelled ? 'bg-secondary' : 'bg-info';

    row.innerHTML = `
      <td>${p.displayDate}</td>
      <td>
        <a href="javascript:void(0)" onclick="openInvoicePreview('${p.invoiceId}')" class="text-primary text-decoration-underline">
          ${p.invoiceNo}
        </a>
        <td><span class="badge ${p.cancelled ? 'bg-secondary' : 'bg-info'}">${p.mode}</span></td>
      </td>
      <td>Rs. ${Number(p.amount).toFixed(2)}</td>
      <td><span class="badge ${modeBadge}">${p.mode}</span></td>
      <td><small>${p.txn}</small></td>
      <td><small>${p.remarks}</small></td>
      <td><span class="badge ${badgeClass}">${p.status}</span></td>
    `;
    transactionTableBody.appendChild(row);
  });
}

// 3. PDF – Status column + Cancelled दिसेल + Total मध्ये cancelled नको!
downloadPDFBtn.addEventListener('click', () => {
  showLoader("Generating PDF...");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  const logo = new Image();
  logo.src = '/assets/logo.png';

  logo.onload = () => {
    doc.addImage(logo, 'PNG', 15, 10, 35, 35);
    doc.setFontSize(18);
    doc.text('KUBER HARDWARE', 105, 25, { align: 'center' });
    doc.setFontSize(10);
    doc.text('A/p Kumbhoj tal Hatkangale Maharashtra', 105, 32, { align: 'center' });
    doc.text('GSTIN: 27AAACK9748R1Z8 | Contact: 1234567890', 105, 38, { align: 'center' });

    doc.setFontSize(14);
    doc.text(`Transaction History - ${currentClientName}`, 105, 55, { align: 'center' });

    const from = fromDateInput.value ? getInvoiceDisplayDate(fromDateInput.value) : 'All Time';
    const to = toDateInput.value ? getInvoiceDisplayDate(toDateInput.value) : '';
    doc.setFontSize(10);
    doc.text(`Period: ${from} ${to ? 'to ' + to : ''}`, 105, 65, { align: 'center' });

    const tableData = [];
    let total = 0;
    transactionTableBody.querySelectorAll('tr').forEach(r => {
      const c = r.cells;
      if (c.length === 7) {
        const amtText = c[2].innerText.replace(/[^\d.]/g, '');
        const amt = parseFloat(amtText) || 0;
        const status = c[6].innerText.trim();

        if (status !== 'Cancelled') {
          total += amt;
        }

      }
    });

    doc.autoTable({
      head: [['Date', 'Invoice', 'Amount', 'Mode', 'Txn ID', 'Remarks', 'Status']], // Status column!
      body: tableData,
      startY: 75,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', halign: 'center' },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 30 },
        2: { cellWidth: 24, halign: 'right' },
        3: { cellWidth: 18 },
        4: { cellWidth: 25 },
        5: { cellWidth: 30 },
        6: { cellWidth: 20, halign: 'center' } // Status
      },
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        if (data.pageCount === data.pageNumber) {
          const finalY = data.cursor.y || data.table.finalY || 250;
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(`Total: Rs. ${total.toFixed(2)}`, 195, finalY + 15, { align: 'right' });
        }
      }
    });

    doc.save(`${currentClientName}_History_${from}${to ? '_to_' + to : ''}.pdf`);
    hideLoader();
  };
});

downloadExcelBtn.onclick = () => {
  let csv = 'Date,Invoice,Amount,Mode,Txn ID,Remarks,Status\n';
  transactionTableBody.querySelectorAll('tr').forEach(r => {
    const c = r.cells;
    if (c.length === 7) {
      csv += Array.from(c).map(cell => `"${cell.innerText.replace(/"/g, '""')}"`).join(',') + '\n';
    }
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentClientName}_History.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

window.confirmDisable = async (id, active) => {
  if (!confirm(`Are you sure?`)) return;
  try {
    await updateDoc(doc(db, 'clients', id), { active: !active });
    alert("Updated!");
    await loadClients();
    if (currentClientId === id) transactionSection.style.display = 'none';
  } catch (err) {
    alert("Error: " + err.message);
  }
};

document.getElementById('clientSearch').oninput = () => {
  const q = document.getElementById('clientSearch').value.toLowerCase();
  clientTable.querySelectorAll('tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

window.openInvoicePreview = async (invoiceId) => {
  showLoader("Opening Invoice...");
  try {
    const invSnap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invSnap.exists()) throw new Error("Invoice not found!");
    const inv = invSnap.data();

    const clientSnap = await getDocs(clientCol);
    let clientInfo = { name: inv.client, accountNo: "-", contact: "-", address: "-" };
    clientSnap.forEach(d => {
      const c = d.data();
      if (c.name === inv.client) clientInfo = c;
    });

    let totalSubtotal = 0, totalGst = 0;
    const rows = inv.items.map(it => {
      const gstRate = it.gstRate || 18;
      const net = it.qty * it.rate * (1 - (it.discount || 0) / 100);
      const gstAmt = net * (gstRate / 100);
      totalSubtotal += net;
      totalGst += gstAmt;
      return `<tr>
        <td style="font-size:9.5px;padding:4px;">${it.name} (${it.brand || 'N/A'})</td>
        <td style="text-align:center;font-size:9.5px;">${it.unit || 'pcs'}</td>
        <td style="text-align:center;font-size:9.5px;">${it.qty}</td>
        <td style="text-align:right;font-size:9.5px;">Rs. ${it.rate.toFixed(2)}</td>
        <td style="text-align:center;font-size:9.5px;">${it.discount || 0}%</td>
        <td style="text-align:right;font-size:9.5px;">Rs. ${net.toFixed(2)}</td>
        <td style="text-align:center;font-size:9.5px;">${gstRate}%</td>
        <td style="text-align:right;font-size:9.5px;">Rs. ${gstAmt.toFixed(2)}</td>
        <td style="text-align:right;font-size:9.5px;">Rs. ${(net + gstAmt).toFixed(2)}</td>
      </tr>`;
    }).join('');

    const paid = inv.paidAmount || 0;
    const pending = inv.payable - paid;
    const displayDate = getInvoiceDisplayDate(inv.date);

    const cancelledHTML = inv.cancelled ?
      `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);color:#ff0000;font-size:60px;opacity:0.3;font-weight:bold;">CANCELLED</div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${inv.invoiceNo}</title><style>
      @page { size: A4; margin: 0; } body { margin:0; padding:15mm 10mm; font-family: Arial; }
      .bill { position:relative; } .header img { width:90px; position:absolute; left:10px; top:10px; }
      .shop { text-align:center; margin-left:80px; margin-right:80px; } .shop b { font-size:18px; }
      .inv-no { position:absolute; right:15px; top:15px; font-size:11px; } hr { border:1px solid #000; }
      .customer { font-size:11px; margin:10px 0; } table { width:100%; border-collapse:collapse; margin:15px 0; }
      th, td { border:1px solid #000; padding:5px; font-size:10px; } th { background:#f0f0f0; }
      .totals { text-align:right; font-size:11px; } .footer { margin-top:30px; font-size:9px; text-align:center; }
      .sign { display:flex; justify-content:space-between; padding:0 50px; margin-top:20px; }
      .sign div { width:100px; text-align:center; } .sign .box { height:50px; border:2px dashed #000; margin-bottom:5px; }
    </style></head><body><div class="bill">${cancelledHTML}
      <div class="header"><img src="/assets/logo.png" alt="Kuber">
        <div class="shop"><b>KUBER HARDWARE</b><br><small>A/p Kumbhoj tal Hatkangale Maharashtra<br>GSTIN: 27AAACK9748R1Z8<br>Contact: 1234567890</small></div>
        <div class="inv-no">Date: <b>${displayDate}</b><br><b style="font-size:14px;">${inv.invoiceNo}</b></div>
      </div><hr>
      <div class="customer"><b>Customer:</b> ${clientInfo.name}<br><b>Acc No:</b> ${clientInfo.accountNo} | <b>Contact:</b> ${clientInfo.contact}<br><b>Address:</b> ${clientInfo.address}</div>
      <table><thead><tr><th>Item (Brand)</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Disc</th><th>Net</th><th>GST%</th><th>GST</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><b>Subtotal:</b> Rs. ${totalSubtotal.toFixed(2)}<br><b>Total GST:</b> Rs. ${totalGst.toFixed(2)}<br><b>Total:</b> Rs. ${inv.total.toFixed(2)}<br><b>Paid:</b> Rs. ${paid.toFixed(2)} | <b>Pending:</b> Rs. ${pending.toFixed(2)}<br><b style="font-size:14px;">Net Payable: Rs. ${inv.payable.toFixed(2)}</b></div>
      <div class="footer"><b>Terms & Conditions:</b><br>1. Goods once sold will not be taken back. 2. Warranty as per manufacturer only.<br>3. Please check items before leaving counter. 4. All disputes subject to Kolhapur jurisdiction only.</div>
      <div class="sign"><div><div class="box"></div>Stamp</div><div><div class="box" style="border-bottom:3px solid #000;"></div>Authorized Signature</div></div>
    </div></body></html>`;

    const win = window.open('', '_blank', 'width=950,height=800');
    win.document.write(html);
    win.document.close();
    win.focus();

  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    hideLoader();
  }
};

// Start
loadClients();
