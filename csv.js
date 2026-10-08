// CSV helpers with no browser APIs, so they can be tested in Node.
export function parseCsv(text) {
  const t = String(text).replace(/^\uFEFF/, ''), first = t.split(/\r?\n/)[0] || '';
  const d = first.includes(',') ? ',' : first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// Columns: category,label,price (label optional: category,price also works). A header row is skipped.
export function readPrices(text) {
  const rows = parseCsv(text), out = [], errors = [];
  if (rows.length > 5001) return { out, errors: ['Too many rows (max 5000).'] };
  rows.forEach((r, i) => {
    const c = r.map(x => x.trim()); if (c.every(x => x === '')) return;
    const [cat, label, price] = c.length >= 3 ? [c[0], c[1], c[2]] : [c[0], '', c[1]];
    if (i === 0 && !/^\d+$/.test(price || '')) return;
    const p = Number(price);
    if (!cat || cat.length > 40) errors.push('Line ' + (i + 1) + ': category missing or too long.');
    else if (label.length > 40) errors.push('Line ' + (i + 1) + ': name too long.');
    else if (!Number.isInteger(p) || p <= 0 || p > 1000000) errors.push('Line ' + (i + 1) + ': price must be whole rupees.');
    else out.push({ category: cat, label, price: p });
  });
  return { out, errors };
}
// Works out what an import would add. Same category + name + price is skipped as a duplicate.
export function planImport(rows, cats, prices) {
  const key = s => String(s).trim().toLowerCase(), cm = new Set(cats.map(c => key(c.name)));
  const seen = new Set(prices.map(p => { const c = cats.find(x => x.id === p.category_id); return c ? key(c.name) + '|' + key(p.label || '') + '|' + p.amount : ''; }));
  const newCats = [], add = [], fresh = new Set(); let dupes = 0;
  for (const r of rows) {
    const ck = key(r.category); if (!cm.has(ck) && !fresh.has(ck)) { fresh.add(ck); newCats.push(r.category); }
    const k = ck + '|' + key(r.label) + '|' + r.price;
    if (seen.has(k)) { dupes++; continue; } seen.add(k); add.push(r);
  }
  return { newCats, add, dupes };
}
