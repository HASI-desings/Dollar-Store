import { tx, req, put } from './db.js';
// Exact-text dictionary. A watcher swaps matching text on screen, so every page is covered without changing each file.
const P = (ru, ur) => ({ ru, ur });
const W = {
  Sell: P('Farokht', 'فروخت'), Receipts: P('Raseedein', 'رسیدیں'), Money: P('Paisa', 'پیسہ'), More: P('Mazeed', 'مزید'), Review: P('Dekhein', 'دیکھیں'),
  'Make bill': P('Bill banayein', 'بل بنائیں'), 'Your bill': P('Aap ka bill', 'آپ کا بل'), Udhaar: P('Udhaar', 'ادھار'), Expenses: P('Kharchay', 'اخراجات'),
  'Stock lots': P('Maal ke lot', 'مال کے لاٹ'), 'Close the day': P('Din band karein', 'دن بند کریں'), Reports: P('Reports', 'رپورٹس'), Settings: P('Settings', 'ترتیبات'),
  Cash: P('Naqad', 'نقد'), Credit: P('Udhaar', 'ادھار'), Hold: P('Rok lein', 'روکیں'), Clear: P('Saaf karein', 'صاف کریں'), Total: P('Kul', 'کل'),
  'Discount (Rs)': P('Riayat (Rs)', 'رعایت (Rs)'), 'Cash received (Rs)': P('Wusool naqad (Rs)', 'وصول شدہ نقد (Rs)'), 'Customer name': P('Gahak ka naam', 'گاہک کا نام'),
  '+ Category': P('+ Qisam', '+ زمرہ'), '+ Price': P('+ Qeemat', '+ قیمت'), 'Held bills': P('Rokay hue bill', 'روکے ہوئے بل'), 'Reprint / share': P('Dobara print / share', 'دوبارہ پرنٹ / شیئر'),
  'No receipts yet': P('Abhi koi raseed nahi', 'ابھی کوئی رسید نہیں'), Done: P('Mukammal', 'مکمل'), Save: P('Mehfooz karein', 'محفوظ کریں'), Receive: P('Wusool karein', 'وصول کریں'),
  Remind: P('Yaad dihani', 'یاد دہانی'), Statement: P('Hisaab', 'حساب'), 'Total owed': P('Kul baqaya', 'کل واجب الادا'), '+ Expense': P('+ Kharcha', '+ خرچہ'), Recurring: P('Har mahine', 'ہر مہینے'),
  Withdrawal: P('Nikalwana', 'نکلوانا'), 'This month': P('Is mahine', 'اس مہینے'), 'Expected cash today': P('Aaj ka mutawaqqa naqad', 'آج کا متوقع نقد'), 'Close day': P('Din band karein', 'دن بند کریں'),
  Sales: P('Farokht', 'فروخت'), Refunds: P('Wapsiyan', 'واپسیاں'), Net: P('Khalis', 'خالص'), Today: P('Aaj', 'آج'), Week: P('Hafta', 'ہفتہ'), Month: P('Mahina', 'مہینہ'), Year: P('Saal', 'سال'),
  'Export CSV': P('CSV export', 'CSV ایکسپورٹ'), 'Backup now': P('Abhi backup', 'ابھی بیک اپ'), 'Shop details': P('Dukaan ki tafseel', 'دکان کی تفصیل'), 'Staff and roles': P('Amla aur kirdar', 'عملہ اور کردار'),
  Insights: P('Mashwaray', 'مشورے'), Goals: P('Ahdaaf', 'اہداف'), Dismiss: P('Khatam', 'ختم'), 'Set goals': P('Ahdaaf muqarrar karein', 'اہداف مقرر کریں'), Continue: P('Aage', 'آگے'), Finish: P('Khatam', 'ختم'),
  'Start 7-day trial': P('7 din ka trial', '7 دن کی آزمائش'), Activate: P('Fa\'al karein', 'فعال کریں'), 'Sign in': P('Sign in', 'سائن ان'), 'Close lot': P('Lot band karein', 'لاٹ بند کریں'), 'Back on shelf': P('Shelf par wapas', 'شیلف پر واپس'), Damaged: P('Kharab', 'خراب')
};
const D = { ru: {}, ur: {} };
for (const [k, v] of Object.entries(W)) { D.ru[k] = v.ru; D.ur[k] = v.ur; }
export let lang = 'en';
export const t = k => (D[lang] && D[lang][k]) || k;
const apply = () => { document.documentElement.lang = lang === 'ur' ? 'ur' : 'en'; document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'; };
export async function load() { lang = (await tx(['settings'], 'readonly', s => req(s.settings.get('lang'))))?.value || 'en'; apply(); }
export async function setLang(l) { lang = l; apply(); await put('settings', { key: 'lang', value: l }); }
// Translate text nodes as they appear. Only exact matches change, so user data is never touched.
export function watch() {
  const tr = n => {
    if (lang === 'en' || !n) return;
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); let x;
    while ((x = w.nextNode())) { const k = x.nodeValue.trim(), v = D[lang][k]; if (v && v !== k) x.nodeValue = x.nodeValue.replace(k, v); }
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => tr(n.nodeType === 3 ? n.parentNode : n)))).observe(document.body, { childList: true, subtree: true });
  tr(document.body);
}
