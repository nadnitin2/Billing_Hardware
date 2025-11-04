export function formatCurrency(amount) {
  return parseFloat(amount).toFixed(2);
}

export function calculateGST(subtotal, gstRate) {
  const gstAmount = (subtotal * gstRate) / 100;
  const totalAmount = subtotal + gstAmount;
  return {
    gstAmount: parseFloat(gstAmount.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2))
  };
}

export function generateAccountNumber() {
  return 'AC' + Date.now().toString().slice(-6);
}

export function formatDate(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDate(dateStr) {
  const [yyyy, mm, dd] = dateStr.split('-');
  return new Date(+yyyy, mm - 1, +dd);
}
