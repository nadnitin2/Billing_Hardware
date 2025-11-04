

    // // Load Clients
    // async function loadClients() {
    //   const clientSelect = document.getElementById('clientSelect');
    //   const snap = await db.collection("clients").get();
    //   clientSelect.innerHTML = '<option value="">All Clients</option>';
    //   snap.forEach(doc => {
    //     const d = doc.data();
    //     clientContactMap[d.name] = d.contact || 'N/A';
    //     const opt = document.createElement('option');
    //     opt.value = d.name;
    //     opt.textContent = `${d.name} (${d.contact || 'No Contact'})`;
    //     clientSelect.appendChild(opt);
    //   });
    // }

    // // Daily Summary
    // async function loadDailySummary() {
    //   const from = document.getElementById('summaryFromDate').value;
    //   const to = document.getElementById('summaryToDate').value;
    //   const tbody = document.querySelector('#dailySummaryTable tbody');
    //   tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

    //   let q = db.collection('invoices');
    //   if (from) q = q.where('date', '>=', from);
    //   if (to) q = q.where('date', '<=', to);

    //   const snap = await q.get();
    //   tbody.innerHTML = '';

    //   snap.forEach(doc => {
    //     const d = doc.data();
    //     if (d.cancelled) return; // CANCELLED SKIP!

    //     const tr = document.createElement('tr');
    //     tr.innerHTML = `
    //       <td><strong>${d.invoiceNo}</strong></td>
    //       <td>${d.client}</td>
    //       <td>₹${(d.payable || 0).toFixed(2)}</td>
    //       <td>₹${(d.paidAmount || 0).toFixed(2)}</td>
    //       <td><span class="badge bg-${d.cleared ? 'success' : 'danger'}">${d.cleared ? 'Cleared' : 'Pending'}</span></td>
    //     `;
    //     tbody.appendChild(tr);
    //   });
    // }

    // // Client Report
    // async function loadClientReport() {
    //   const client = document.getElementById('clientSelect').value;
    //   if (!client) return alert("Select a client");
    //   const from = document.getElementById('clientFromDate').value;
    //   const to = document.getElementById('clientToDate').value;
    //   const tbody = document.querySelector('#clientReportTable tbody');
    //   tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

    //   let q = db.collection('invoices').where('client', '==', client);
    //   if (from) q = q.where('date', '>=', from);
    //   if (to) q = q.where('date', '<=', to);

    //   const snap = await q.get();
    //   tbody.innerHTML = '';

    //   snap.forEach(doc => {
    //     const d = doc.data();
    //     if (d.cancelled) return; // SKIP

    //     const tr = document.createElement('tr');
    //     tr.innerHTML = `
    //       <td>${d.invoiceNo}</td>
    //       <td>${d.date}</td>
    //       <td>₹${(d.payable || 0).toFixed(2)}</td>
    //       <td>₹${(d.paidAmount || 0).toFixed(2)}</td>
    //       <td><span class="badge bg-${d.cleared ? 'success' : 'danger'}">${d.cleared ? 'Cleared' : 'Pending'}</span></td>
    //     `;
    //     tbody.appendChild(tr);
    //   });
    // }

    // // Item Report
    // async function loadItemReport() {
    //   const from = document.getElementById('itemFromDate').value;
    //   const to = document.getElementById('itemToDate').value;
    //   const map = {};
    //   const tbody = document.querySelector('#itemReportTable tbody');
    //   tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';

    //   let q = db.collection('invoices');
    //   if (from) q = q.where('date', '>=', from);
    //   if (to) q = q.where('date', '<=', to);

    //   const snap = await q.get();
    //   tbody.innerHTML = '';

    //   snap.forEach(doc => {
    //     const d = doc.data();
    //     if (d.cancelled) return; // SKIP

    //     (d.items || []).forEach(i => {
    //       const key = `${i.name}|${i.unit || 'pcs'}`;
    //       if (!map[key]) map[key] = { qty: 0, total: 0 };
    //       map[key].qty += i.qty;
    //       map[key].total += i.qty * i.rate;
    //     });
    //   });

    //   Object.entries(map).forEach(([k, v]) => {
    //     const [name, unit] = k.split('|');
    //     const tr = document.createElement('tr');
    //     tr.innerHTML = `<td>${name}</td><td>${v.qty}</td><td>${unit}</td><td>₹${v.total.toFixed(2)}</td>`;
    //     tbody.appendChild(tr);
    //   });
    // }

    // // Outstanding Report
    // async function loadOutstanding() {
    //   const from = document.getElementById('outstandingFromDate').value;
    //   const to = document.getElementById('outstandingToDate').value;
    //   const filter = document.querySelector('input[name="outFilter"]:checked').value;
    //   const tbody = document.querySelector('#outstandingTable tbody');
    //   tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';

    //   let q = db.collection('invoices');
    //   if (filter === 'pending') q = q.where('cleared', '==', false);
    //   if (from) q = q.where('date', '>=', from);
    //   if (to) q = q.where('date', '<=', to);

    //   const snap = await q.get();
    //   tbody.innerHTML = '';

    //   snap.forEach(doc => {
    //     const d = doc.data();
    //     if (d.cancelled) return; // SKIP

    //     const contact = clientContactMap[d.client] || 'N/A';
    //     const paid = d.paidAmount || 0;
    //     const pending = (d.payable - paid).toFixed(2);
    //     const status = d.cleared ? 'Cleared' : 'Pending';
    //     const badge = d.cleared ? 'success' : 'danger';

    //     const tr = document.createElement('tr');
    //     tr.innerHTML = `
    //       <td>${d.invoiceNo}</td>
    //       <td>${d.client}</td>
    //       <td>${contact}</td>
    //       <td>${d.date}</td>
    //       <td>₹${(d.payable || 0).toFixed(2)}</td>
    //       <td>₹${paid.toFixed(2)}</td>
    //       <td>₹${pending}</td>
    //       <td><span class="badge bg-${badge}">${status}</span></td>
    //     `;
    //     tbody.appendChild(tr);
    //   });
    // }

    // // CANCELLED INVOICES ONLY
    // async function loadCancelledReport() {
    //   const from = document.getElementById('cancelFromDate').value;
    //   const to = document.getElementById('cancelToDate').value;
    //   const tbody = document.querySelector('#cancelledTable tbody');
    //   tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading... <span class="spinner-border spinner-border-sm"></span></td></tr>';

    //   let q = db.collection('invoices').where('cancelled', '==', true);
    //   if (from) q = q.where('date', '>=', from);
    //   if (to) q = q.where('date', '<=', to);

    //   const snap = await q.get();
    //   tbody.innerHTML = '';

    //   if (snap.empty) {
    //     tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No cancelled invoices found</td></tr>';
    //     return;
    //   }

    //   snap.forEach(doc => {
    //     const d = doc.data();
    //     const contact = clientContactMap[d.client] || 'N/A';
    //     const cancelledDate = d.cancelledDate || d.date;

    //     const tr = document.createElement('tr');
    //     tr.classList.add('table-danger');
    //     tr.innerHTML = `
    //       <td><strong>${d.invoiceNo}</strong></td>
    //       <td>${d.client}</td>
    //       <td>${contact}</td>
    //       <td>${d.date}</td>
    //       <td>${cancelledDate}</td>
    //       <td>₹${(d.payable || 0).toFixed(2)}</td>
    //       <td>${d.cancelReason || '—'}</td>
    //     `;
    //     tbody.appendChild(tr);
    //   });
    // }

    // // Excel & PDF Download
    // function downloadTableToExcel(tableId, filename) {
    //   const table = document.getElementById(tableId);
    //   if (!table || table.querySelector('tbody').children.length === 0) return alert("No data!");
    //   const wb = XLSX.utils.table_to_book(table);
    //   XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
    // }

    // function downloadTableToPDF(tableId, filename) {
    //   const table = document.getElementById(tableId);
    //   if (!table || table.querySelector('tbody').children.length === 0) return alert("No data!");
    //   const { jsPDF } = window.jspdf;
    //   const doc = new jsPDF('l', 'mm', 'a4');
    //   doc.text(`${filename} - ${new Date().toLocaleDateString()}`, 14, 15);
    //   doc.autoTable({ html: `#${tableId}`, startY: 25 });
    //   doc.save(`${filename}_${new Date().toISOString().slice(0,10)}.pdf`);
    // }

    // // Init
    // loadClients();