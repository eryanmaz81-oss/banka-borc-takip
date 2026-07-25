'use strict';

const STORAGE_KEY = 'erdal-finans-v2-data';
const SETTINGS_KEY = 'erdal-finans-v2-settings';

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

const els = {
  activePeriod: document.querySelector('#activePeriod'),
  debtList: document.querySelector('#debtList'),
  emptyState: document.querySelector('#emptyState'),
  statusFilter: document.querySelector('#statusFilter'),
  debtDialog: document.querySelector('#debtDialog'),
  settingsDialog: document.querySelector('#settingsDialog'),
  confirmDialog: document.querySelector('#confirmDialog'),
  debtForm: document.querySelector('#debtForm'),
  recordId: document.querySelector('#recordId'),
  recordType: document.querySelector('#recordType'),
  bankName: document.querySelector('#bankName'),
  recordName: document.querySelector('#recordName'),
  installmentAmount: document.querySelector('#installmentAmount'),
  remainingInstallments: document.querySelector('#remainingInstallments'),
  loanRemainingDebt: document.querySelector('#loanRemainingDebt'),
  cardTotalDebt: document.querySelector('#cardTotalDebt'),
  cardStatementAmount: document.querySelector('#cardStatementAmount'),
  cardLimit: document.querySelector('#cardLimit'),
  dueDate: document.querySelector('#dueDate'),
  paymentStatus: document.querySelector('#paymentStatus'),
  notes: document.querySelector('#notes'),
  loanFields: document.querySelector('#loanFields'),
  cardFields: document.querySelector('#cardFields'),
  formTitle: document.querySelector('#formTitle'),
  formEyebrow: document.querySelector('#formEyebrow'),
  totalDebt: document.querySelector('#totalDebt'),
  monthDue: document.querySelector('#monthDue'),
  monthDueCount: document.querySelector('#monthDueCount'),
  monthPaid: document.querySelector('#monthPaid'),
  monthPaidCount: document.querySelector('#monthPaidCount'),
  overdueTotal: document.querySelector('#overdueTotal'),
  overdueCount: document.querySelector('#overdueCount'),
  toast: document.querySelector('#toast'),
  importInput: document.querySelector('#importInput'),
  installBtn: document.querySelector('#installBtn')
};

let state = loadData();
let activeTypeFilter = 'all';
let deferredPrompt = null;
let confirmAction = null;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.records)) return parsed;
  } catch (error) {
    console.warn('Kayıtlar okunamadı', error);
  }
  return { version: 2, records: [] };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function periodOf(dateString) {
  return String(dateString || '').slice(0, 7);
}

function statusOf(record) {
  if (record.paymentStatus === 'paid') return 'paid';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${record.dueDate}T00:00:00`);
  return due < today ? 'overdue' : 'pending';
}

function dueAmount(record) {
  return record.type === 'loan' ? num(record.installmentAmount) : num(record.cardStatementAmount);
}

function remainingDebt(record) {
  return record.type === 'loan' ? num(record.loanRemainingDebt) : num(record.cardTotalDebt);
}

function selectedRecords() {
  return state.records.filter(record => record.period === els.activePeriod.value);
}

function render() {
  const periodRecords = selectedRecords();
  const statusValue = els.statusFilter.value;
  const filtered = periodRecords
    .filter(r => activeTypeFilter === 'all' || r.type === activeTypeFilter)
    .filter(r => statusValue === 'all' || statusOf(r) === statusValue)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  els.debtList.innerHTML = filtered.map(debtCardTemplate).join('');
  els.emptyState.hidden = periodRecords.length !== 0;
  els.debtList.hidden = filtered.length === 0;

  if (periodRecords.length > 0 && filtered.length === 0) {
    els.debtList.hidden = false;
    els.debtList.innerHTML = '<section class="empty-state card"><h2>Bu filtrede kayıt bulunamadı</h2><p>Başka bir tür veya ödeme durumu seçebilirsin.</p></section>';
  }

  renderSummary(periodRecords);
  bindCardActions();
}

function renderSummary(records) {
  const totalDebt = records.reduce((sum, r) => sum + remainingDebt(r), 0);
  const pending = records.filter(r => statusOf(r) !== 'paid');
  const paid = records.filter(r => statusOf(r) === 'paid');
  const overdue = records.filter(r => statusOf(r) === 'overdue');

  els.totalDebt.textContent = money.format(totalDebt);
  els.monthDue.textContent = money.format(pending.reduce((sum, r) => sum + dueAmount(r), 0));
  els.monthDueCount.textContent = `${pending.length} ödeme`;
  els.monthPaid.textContent = money.format(paid.reduce((sum, r) => sum + dueAmount(r), 0));
  els.monthPaidCount.textContent = `${paid.length} ödeme`;
  els.overdueTotal.textContent = money.format(overdue.reduce((sum, r) => sum + dueAmount(r), 0));
  els.overdueCount.textContent = `${overdue.length} ödeme`;
}

function debtCardTemplate(record) {
  const status = statusOf(record);
  const labels = { pending: 'Bekliyor', paid: 'Ödendi', overdue: 'Gecikti' };
  const icon = record.type === 'loan' ? 'K' : '₺';
  const metrics = record.type === 'loan'
    ? [
        ['Aylık taksit', money.format(num(record.installmentAmount))],
        ['Kalan borç', money.format(num(record.loanRemainingDebt))],
        ['Kalan taksit', `${num(record.remainingInstallments)} adet`]
      ]
    : [
        ['Bu dönem', money.format(num(record.cardStatementAmount))],
        ['Toplam borç', money.format(num(record.cardTotalDebt))],
        ['Kullanılabilir limit', record.cardLimit ? money.format(Math.max(0, num(record.cardLimit) - num(record.cardTotalDebt))) : '—']
      ];

  return `
    <article class="debt-card ${status === 'overdue' ? 'overdue' : ''}" data-id="${record.id}">
      <div class="debt-head">
        <div class="debt-title">
          <div class="type-badge ${record.type}">${icon}</div>
          <div>
            <h3>${escapeHtml(record.recordName)}</h3>
            <p>${escapeHtml(record.bankName)} · Son ödeme ${dateFmt.format(new Date(`${record.dueDate}T00:00:00`))}</p>
          </div>
        </div>
        <span class="status-chip ${status}">${labels[status]}</span>
      </div>
      <div class="debt-body">
        ${metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('')}
      </div>
      ${record.notes ? `<p class="debt-note">${escapeHtml(record.notes)}</p>` : ''}
      <div class="debt-actions">
        <button class="${status === 'paid' ? 'undo-btn' : 'pay-btn'}" data-action="toggle-paid">${status === 'paid' ? 'Ödemeyi geri al' : 'Ödendi işaretle'}</button>
        <button data-action="edit">Düzenle</button>
        <button class="delete-btn" data-action="delete">Sil</button>
      </div>
    </article>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function bindCardActions() {
  document.querySelectorAll('.debt-card [data-action]').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.debt-card');
      const record = state.records.find(r => r.id === card.dataset.id);
      if (!record) return;
      const action = button.dataset.action;
      if (action === 'edit') openForm(record.type, record);
      if (action === 'toggle-paid') togglePaid(record);
      if (action === 'delete') askConfirm('Kaydı sil', `${record.recordName} kaydı silinecek. Bu işlem geri alınamaz.`, () => deleteRecord(record.id));
    });
  });
}

function openForm(type, record = null) {
  els.debtForm.reset();
  els.recordType.value = type;
  els.recordId.value = record?.id || '';
  els.loanFields.hidden = type !== 'loan';
  els.cardFields.hidden = type !== 'card';
  els.formTitle.textContent = `${type === 'loan' ? 'Kredi' : 'Kredi kartı'} ${record ? 'düzenle' : 'ekle'}`;
  els.formEyebrow.textContent = record ? 'KAYDI DÜZENLE' : 'YENİ KAYIT';

  const period = els.activePeriod.value;
  els.dueDate.value = record?.dueDate || `${period}-01`;

  if (record) {
    els.bankName.value = record.bankName;
    els.recordName.value = record.recordName;
    els.installmentAmount.value = record.installmentAmount || '';
    els.remainingInstallments.value = record.remainingInstallments ?? '';
    els.loanRemainingDebt.value = record.loanRemainingDebt || '';
    els.cardTotalDebt.value = record.cardTotalDebt || '';
    els.cardStatementAmount.value = record.cardStatementAmount || '';
    els.cardLimit.value = record.cardLimit || '';
    els.paymentStatus.value = record.paymentStatus;
    els.notes.value = record.notes || '';
  }

  els.debtDialog.showModal();
  setTimeout(() => els.bankName.focus(), 50);
}

function handleSubmit(event) {
  event.preventDefault();
  const type = els.recordType.value;
  const dueDate = els.dueDate.value;
  if (!dueDate) return showToast('Son ödeme tarihini gir');

  const record = {
    id: els.recordId.value || uid(),
    type,
    period: periodOf(dueDate),
    bankName: els.bankName.value.trim(),
    recordName: els.recordName.value.trim(),
    dueDate,
    paymentStatus: els.paymentStatus.value,
    notes: els.notes.value.trim(),
    installmentAmount: type === 'loan' ? num(els.installmentAmount.value) : 0,
    remainingInstallments: type === 'loan' ? Math.floor(num(els.remainingInstallments.value)) : 0,
    loanRemainingDebt: type === 'loan' ? num(els.loanRemainingDebt.value) : 0,
    cardTotalDebt: type === 'card' ? num(els.cardTotalDebt.value) : 0,
    cardStatementAmount: type === 'card' ? num(els.cardStatementAmount.value) : 0,
    cardLimit: type === 'card' ? num(els.cardLimit.value) : 0,
    updatedAt: new Date().toISOString()
  };

  if (!record.bankName || !record.recordName) return showToast('Banka ve kayıt adını gir');
  if (type === 'loan' && record.installmentAmount <= 0) return showToast('Aylık taksit tutarını gir');
  if (type === 'card' && record.cardStatementAmount <= 0) return showToast('Bu dönem ödenecek tutarı gir');

  const index = state.records.findIndex(r => r.id === record.id);
  if (index >= 0) state.records[index] = record;
  else state.records.push(record);

  saveData();
  els.activePeriod.value = record.period;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ activePeriod: record.period }));
  els.debtDialog.close();
  render();
  showToast(index >= 0 ? 'Kayıt güncellendi' : 'Kayıt eklendi');
}

function togglePaid(record) {
  record.paymentStatus = record.paymentStatus === 'paid' ? 'pending' : 'paid';
  record.updatedAt = new Date().toISOString();
  saveData();
  render();
  showToast(record.paymentStatus === 'paid' ? 'Ödendi olarak işaretlendi' : 'Ödeme bekliyor olarak değiştirildi');
}

function deleteRecord(id) {
  state.records = state.records.filter(r => r.id !== id);
  saveData();
  render();
  showToast('Kayıt silindi');
}

function previousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function copyPreviousMonth() {
  const target = els.activePeriod.value;
  const source = previousPeriod(target);
  const sourceRecords = state.records.filter(r => r.period === source);
  if (!sourceRecords.length) return showToast('Önceki ayda kopyalanacak kayıt yok');
  if (state.records.some(r => r.period === target)) {
    return askConfirm('Bu ayda kayıt var', 'Önceki ayın kayıtları mevcut kayıtlara eklenecek. Devam edilsin mi?', () => performCopy(sourceRecords, target));
  }
  performCopy(sourceRecords, target);
}

function performCopy(sourceRecords, target) {
  const [, targetMonth] = target.split('-').map(Number);
  const [targetYear] = target.split('-').map(Number);
  const copied = sourceRecords.map(record => {
    const oldDay = Number(record.dueDate.slice(8, 10));
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const day = Math.min(oldDay, lastDay);
    const dueDate = `${target}-${String(day).padStart(2, '0')}`;
    return {
      ...record,
      id: uid(),
      period: target,
      dueDate,
      paymentStatus: 'pending',
      remainingInstallments: record.type === 'loan' ? Math.max(0, num(record.remainingInstallments) - 1) : 0,
      loanRemainingDebt: record.type === 'loan' ? Math.max(0, num(record.loanRemainingDebt) - num(record.installmentAmount)) : 0,
      updatedAt: new Date().toISOString()
    };
  });
  state.records.push(...copied);
  saveData();
  render();
  showToast(`${copied.length} kayıt bu aya kopyalandı`);
}

function exportBackup() {
  downloadBlob(JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), `erdal-finans-yedek-${Date.now()}.json`, 'application/json');
  showToast('Yedek indirildi');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported || !Array.isArray(imported.records)) throw new Error('Geçersiz dosya');
      askConfirm('Yedeği geri yükle', 'Mevcut veriler yedekteki kayıtlarla değiştirilecek.', () => {
        state = { version: 2, records: imported.records };
        saveData();
        render();
        els.settingsDialog.close();
        showToast('Yedek geri yüklendi');
      });
    } catch {
      showToast('Geçerli bir yedek dosyası seç');
    } finally {
      els.importInput.value = '';
    }
  };
  reader.readAsText(file);
}

function exportCsv() {
  const rows = selectedRecords();
  if (!rows.length) return showToast('Bu ayda indirilecek kayıt yok');
  const header = ['Tür','Banka','Kayıt','Son Ödeme','Durum','Bu Ay Ödenecek','Toplam Kalan Borç','Kalan Taksit','Not'];
  const body = rows.map(r => [
    r.type === 'loan' ? 'Kredi' : 'Kredi Kartı', r.bankName, r.recordName, r.dueDate,
    statusOf(r) === 'paid' ? 'Ödendi' : statusOf(r) === 'overdue' ? 'Gecikti' : 'Bekliyor',
    dueAmount(r), remainingDebt(r), r.type === 'loan' ? r.remainingInstallments : '', r.notes || ''
  ]);
  const csv = '\uFEFF' + [header, ...body].map(row => row.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(';')).join('\n');
  downloadBlob(csv, `erdal-finans-${els.activePeriod.value}.csv`, 'text/csv;charset=utf-8');
  showToast('CSV indirildi');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function askConfirm(title, text, action) {
  document.querySelector('#confirmTitle').textContent = title;
  document.querySelector('#confirmText').textContent = text;
  confirmAction = action;
  els.confirmDialog.showModal();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function clearAllData() {
  state = { version: 2, records: [] };
  saveData();
  render();
  els.settingsDialog.close();
  showToast('Tüm veriler silindi');
}

function setupEvents() {
  document.querySelectorAll('[data-open-form]').forEach(btn => btn.addEventListener('click', () => openForm(btn.dataset.openForm)));
  document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => els.debtDialog.close()));
  document.querySelectorAll('.close-settings').forEach(btn => btn.addEventListener('click', () => els.settingsDialog.close()));
  document.querySelector('#menuBtn').addEventListener('click', () => els.settingsDialog.showModal());
  document.querySelector('[data-nav="settings"]').addEventListener('click', () => els.settingsDialog.showModal());
  document.querySelector('[data-nav="payments"]').addEventListener('click', () => { els.statusFilter.value = 'pending'; render(); showToast('Bekleyen ödemeler gösteriliyor'); });
  document.querySelector('[data-nav="reports"]').addEventListener('click', () => { els.settingsDialog.showModal(); showToast('Raporu CSV olarak indirebilirsin'); });
  document.querySelector('[data-nav="home"]').addEventListener('click', () => { els.statusFilter.value = 'all'; activeTypeFilter = 'all'; document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all')); render(); });

  els.debtForm.addEventListener('submit', handleSubmit);
  els.activePeriod.addEventListener('change', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ activePeriod: els.activePeriod.value }));
    render();
  });
  els.statusFilter.addEventListener('change', render);
  document.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    activeTypeFilter = btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
    render();
  }));
  document.querySelector('#copyPreviousBtn').addEventListener('click', copyPreviousMonth);
  document.querySelector('#exportBtn').addEventListener('click', exportBackup);
  document.querySelector('#exportCsvBtn').addEventListener('click', exportCsv);
  els.importInput.addEventListener('change', event => event.target.files[0] && importBackup(event.target.files[0]));
  document.querySelector('#clearDataBtn').addEventListener('click', () => askConfirm('Tüm verileri sil', 'Bütün kredi ve kredi kartı kayıtların kalıcı olarak silinecek.', clearAllData));
  document.querySelector('#confirmCancel').addEventListener('click', () => { confirmAction = null; els.confirmDialog.close(); });
  document.querySelector('#confirmOk').addEventListener('click', () => { const action = confirmAction; confirmAction = null; els.confirmDialog.close(); action?.(); });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    els.installBtn.hidden = false;
  });
  els.installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.hidden = true;
  });
}

function setupPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
  }
}

function init() {
  const settings = loadSettings();
  els.activePeriod.value = settings.activePeriod || currentMonth();
  setupEvents();
  setupPwa();
  render();
}

init();
