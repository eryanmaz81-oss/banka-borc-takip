'use strict';
const STORAGE_KEY='erdal_finans_v2_data';
const APP_VERSION='2.1.0';
const OLD_KEYS=['bankDebts','bankaBorclarim','erdal_finans_data'];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const today=()=>new Date().toISOString().slice(0,10);
const currentPeriod=()=>today().slice(0,7);
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
const dateTR=s=>s?new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(s+'T12:00:00')):'—';
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
let state={version:2,records:[],payments:[],activePeriod:currentPeriod()};
let filterType='all';
let confirmAction=null;
let deferredPrompt=null;

function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function load(){
  try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){state={...state,...JSON.parse(raw)};return;}}
  catch(e){console.warn(e)}
  migrateOld();
}
function migrateOld(){
  for(const key of OLD_KEYS){
    try{const raw=localStorage.getItem(key);if(!raw)continue;const parsed=JSON.parse(raw);const arr=Array.isArray(parsed)?parsed:(parsed.records||parsed.debts||[]);
      if(arr.length){state.records=arr.map(x=>({id:x.id||uid(),type:x.type==='card'?'card':'loan',bank:x.bank||x.bankName||'Banka',name:x.name||x.recordName||x.title||'Borç',installment:Number(x.installment||x.installmentAmount||x.monthlyPayment||0),remainingInstallments:Number(x.remainingInstallments||x.installmentsLeft||0),remainingDebt:Number(x.remainingDebt||x.currentDebt||x.totalDebt||0),statementAmount:Number(x.statementAmount||x.monthDue||0),cardLimit:Number(x.cardLimit||x.limit||0),dueDate:x.dueDate||x.nextPaymentDate||today(),notes:x.notes||'',createdAt:x.createdAt||new Date().toISOString()}));save();toast('Eski kayıtlar V2’ye aktarıldı');return;}
    }catch(e){}
  }
}
function periodOf(date){return (date||'').slice(0,7)}
function paymentFor(id,period=state.activePeriod){return state.payments.find(p=>p.recordId===id&&p.period===period)}
function dueAmount(r){return r.type==='loan'?Number(r.installment||0):Number(r.statementAmount||0)}
function statusOf(r){const p=paymentFor(r.id);if(p?.status==='paid')return'paid';if(periodOf(r.dueDate)===state.activePeriod&&r.dueDate<today())return'overdue';return'pending'}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function activeRecords(){return state.records.filter(r=>periodOf(r.dueDate)<=state.activePeriod)}
function render(){
  $('#activePeriod').value=state.activePeriod;
  const all=activeRecords();
  const dueThis=all.filter(r=>periodOf(r.dueDate)===state.activePeriod);
  const totalDebt=state.records.reduce((s,r)=>s+(r.type==='loan'?Number(r.remainingDebt||0):Number(r.remainingDebt||0)),0);
  const unpaid=dueThis.filter(r=>statusOf(r)!=='paid'); const paid=dueThis.filter(r=>statusOf(r)==='paid'); const overdue=dueThis.filter(r=>statusOf(r)==='overdue');
  $('#totalDebt').textContent=money(totalDebt);$('#monthDue').textContent=money(unpaid.reduce((s,r)=>s+dueAmount(r),0));$('#monthDueCount').textContent=`${unpaid.length} ödeme`;
  $('#monthPaid').textContent=money(paid.reduce((s,r)=>s+(paymentFor(r.id)?.amount||dueAmount(r)),0));$('#monthPaidCount').textContent=`${paid.length} ödeme`;
  $('#overdueTotal').textContent=money(overdue.reduce((s,r)=>s+dueAmount(r),0));$('#overdueCount').textContent=`${overdue.length} ödeme`;
  renderList();renderHistory();renderReports();
}
function renderList(){
  const stat=$('#statusFilter').value;let rows=activeRecords().filter(r=>filterType==='all'||r.type===filterType).filter(r=>stat==='all'||statusOf(r)===stat).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  $('#emptyState').hidden=rows.length>0;
  $('#debtList').innerHTML=rows.map(r=>{const st=statusOf(r);const p=paymentFor(r.id);return `<article class="debt-card ${r.type==='card'?'card-type':''} ${st}">
    <div class="debt-head"><div><h3>${esc(r.bank)}</h3><p>${esc(r.name)}</p></div><span class="badge ${st}">${st==='paid'?'Ödendi':st==='overdue'?'Gecikti':r.type==='loan'?'Kredi':'Kart'}</span></div>
    <div class="amount-main">${money(r.remainingDebt)}</div><div class="amount-caption">${r.type==='loan'?'Toplam kalan kredi borcu':'Güncel toplam kart borcu'}</div>
    <div class="detail-grid"><div class="detail"><span>Son ödeme</span><strong>${dateTR(r.dueDate)}</strong></div><div class="detail"><span>${r.type==='loan'?'Taksit tutarı':'Dönem borcu'}</span><strong>${money(dueAmount(r))}</strong></div>
    ${r.type==='loan'?`<div class="detail"><span>Kalan taksit</span><strong>${r.remainingInstallments||0}</strong></div>`:`<div class="detail"><span>Kart limiti</span><strong>${r.cardLimit?money(r.cardLimit):'—'}</strong></div>`}
    <div class="detail"><span>Bu ay durumu</span><strong>${p?.paidAt?dateTR(p.paidAt.slice(0,10)):'Bekliyor'}</strong></div></div>
    ${r.notes?`<p class="note">${esc(r.notes)}</p>`:''}
    <div class="card-actions"><button class="pay-btn" data-pay="${r.id}">${st==='paid'?'Ödemeyi geri al':'Ödendi işaretle'}</button><button class="edit-btn" data-edit="${r.id}">Düzenle</button><button class="delete-btn" data-delete="${r.id}">Sil</button></div></article>`}).join('');
}
function renderHistory(){
 const rows=[...state.payments].filter(p=>p.status==='paid').sort((a,b)=>b.paidAt.localeCompare(a.paidAt));
 $('#historyList').innerHTML=rows.length?rows.map(p=>{const r=state.records.find(x=>x.id===p.recordId);return `<div class="history-item card"><strong>${esc(r?.bank||'Silinmiş kayıt')} — ${money(p.amount)}</strong><small>${dateTR(p.paidAt.slice(0,10))} · ${p.period}</small></div>`}).join(''):'<div class="empty-state card"><h2>Henüz ödeme geçmişi yok</h2><p>Ödendi olarak işaretlenen kayıtlar burada görünür.</p></div>';
}
function renderReports(){
 const groups={};state.records.forEach(r=>groups[r.bank]=(groups[r.bank]||0)+Number(r.remainingDebt||0));const max=Math.max(1,...Object.values(groups));
 $('#reportList').innerHTML=Object.keys(groups).length?Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([bank,val])=>`<div class="report-row card"><strong>${esc(bank)} — ${money(val)}</strong><div class="bar"><i style="width:${Math.round(val/max*100)}%"></i></div></div>`).join(''):'<div class="empty-state card"><h2>Rapor için kayıt ekle</h2></div>';
}
function openForm(type,id=''){
 const r=state.records.find(x=>x.id===id);$('#recordId').value=id;$('#recordType').value=r?.type||type;const t=r?.type||type;
 $('#formTitle').textContent=id?'Kaydı düzenle':t==='loan'?'Kredi ekle':'Kredi kartı ekle';$('#loanFields').hidden=t!=='loan';$('#cardFields').hidden=t!=='card';
 $('#bankName').value=r?.bank||'';$('#recordName').value=r?.name||'';$('#installmentAmount').value=r?.installment||'';$('#remainingInstallments').value=r?.remainingInstallments||'';$('#loanRemainingDebt').value=t==='loan'?(r?.remainingDebt||''):'';$('#cardTotalDebt').value=t==='card'?(r?.remainingDebt||''):'';$('#cardStatementAmount').value=r?.statementAmount||'';$('#cardLimit').value=r?.cardLimit||'';$('#dueDate').value=r?.dueDate||`${state.activePeriod}-01`;$('#paymentStatus').value=statusOf(r||{})==='paid'?'paid':'pending';$('#notes').value=r?.notes||'';$('#debtDialog').showModal();
}
function submitForm(e){e.preventDefault();const id=$('#recordId').value;const type=$('#recordType').value;const old=state.records.find(r=>r.id===id);const r={id:id||uid(),type,bank:$('#bankName').value.trim(),name:$('#recordName').value.trim(),installment:Number($('#installmentAmount').value||0),remainingInstallments:Number($('#remainingInstallments').value||0),remainingDebt:Number(type==='loan'?$('#loanRemainingDebt').value:$('#cardTotalDebt').value)||0,statementAmount:Number($('#cardStatementAmount').value||0),cardLimit:Number($('#cardLimit').value||0),dueDate:$('#dueDate').value,notes:$('#notes').value.trim(),createdAt:old?.createdAt||new Date().toISOString()};
 if(!r.bank||!r.name||!r.dueDate)return toast('Zorunlu alanları doldur'); if(id)state.records=state.records.map(x=>x.id===id?r:x);else state.records.push(r);
 const wantsPaid=$('#paymentStatus').value==='paid';const existing=paymentFor(r.id);if(wantsPaid&&!existing)state.payments.push({id:uid(),recordId:r.id,period:state.activePeriod,status:'paid',amount:dueAmount(r),paidAt:new Date().toISOString()});if(!wantsPaid&&existing)state.payments=state.payments.filter(p=>p!==existing);
 save();$('#debtDialog').close();render();toast(id?'Kayıt güncellendi':'Kayıt eklendi');
}
function togglePaid(id){const r=state.records.find(x=>x.id===id);const p=paymentFor(id);if(p){state.payments=state.payments.filter(x=>x!==p);toast('Ödeme geri alındı')}else{state.payments.push({id:uid(),recordId:id,period:state.activePeriod,status:'paid',amount:dueAmount(r),paidAt:new Date().toISOString()});toast('Ödeme kaydedildi')}save();render()}
function removeRecord(id){confirmBox('Kaydı sil','Bu borç kaydı ve ödeme geçmişi silinecek.',()=>{state.records=state.records.filter(r=>r.id!==id);state.payments=state.payments.filter(p=>p.recordId!==id);save();render();toast('Kayıt silindi')})}
function copyPrevious(){const [y,m]=state.activePeriod.split('-').map(Number);const prev=new Date(y,m-2,1);const prevP=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;const candidates=state.records.filter(r=>periodOf(r.dueDate)===prevP);if(!candidates.length)return toast('Önceki ayda kopyalanacak kayıt yok');let count=0;candidates.forEach(r=>{if(state.records.some(x=>x.bank===r.bank&&x.name===r.name&&periodOf(x.dueDate)===state.activePeriod))return;const day=r.dueDate.slice(8,10);state.records.push({...r,id:uid(),dueDate:`${state.activePeriod}-${day}`,createdAt:new Date().toISOString()});count++});save();render();toast(`${count} kayıt yeni aya kopyalandı`)}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
function exportJson(){download(`erdal-finans-yedek-${today()}.json`,JSON.stringify(state,null,2),'application/json')}
function exportCsv(){const rows=[['Tür','Banka','Kayıt','Son Ödeme','Aylık Tutar','Toplam Borç','Durum'],...activeRecords().map(r=>[r.type==='loan'?'Kredi':'Kart',r.bank,r.name,r.dueDate,dueAmount(r),r.remainingDebt,statusOf(r)])];download(`finans-${state.activePeriod}.csv`,rows.map(x=>x.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8')}
function importJson(file){const fr=new FileReader();fr.onload=()=>{try{const x=JSON.parse(fr.result);if(!Array.isArray(x.records)||!Array.isArray(x.payments))throw Error();state={...state,...x,version:2};save();render();toast('Yedek geri yüklendi')}catch(e){toast('Geçersiz yedek dosyası')}};fr.readAsText(file)}
function confirmBox(title,text,action){$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;confirmAction=action;$('#confirmDialog').showModal()}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
function switchView(name){$$('.view-panel').forEach(x=>x.classList.toggle('active',x.id===`view-${name}`));$$('.bottom-nav button').forEach(x=>x.classList.toggle('active',x.dataset.nav===name));if(name==='settings')$('#settingsDialog').showModal()}
function bind(){
 $('#debtForm').addEventListener('submit',submitForm);$$('[data-open-form]').forEach(b=>b.onclick=()=>openForm(b.dataset.openForm));$$('.close-modal').forEach(b=>b.onclick=()=>$('#debtDialog').close());$('.close-settings').onclick=()=>$('#settingsDialog').close();$('#menuBtn').onclick=()=>$('#settingsDialog').showModal();
 $('#activePeriod').onchange=e=>{state.activePeriod=e.target.value;save();render()};$('#copyPreviousBtn').onclick=copyPrevious;$('#statusFilter').onchange=renderList;$$('[data-filter]').forEach(b=>b.onclick=()=>{$$('[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');filterType=b.dataset.filter;renderList()});
 $('#debtList').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.pay)togglePaid(b.dataset.pay);if(b.dataset.edit)openForm('',b.dataset.edit);if(b.dataset.delete)removeRecord(b.dataset.delete)};
 $('#exportBtn').onclick=exportJson;$('#exportCsvBtn').onclick=exportCsv;$('#importInput').onchange=e=>e.target.files[0]&&importJson(e.target.files[0]);$('#clearDataBtn').onclick=()=>confirmBox('Tüm verileri sil','Bu işlem geri alınamaz. Önce yedek indirmen önerilir.',()=>{localStorage.removeItem(STORAGE_KEY);state={version:2,records:[],payments:[],activePeriod:currentPeriod()};render();$('#settingsDialog').close();toast('Tüm veriler silindi')});
 $('#confirmCancel').onclick=()=>$('#confirmDialog').close();$('#confirmOk').onclick=()=>{confirmAction?.();confirmAction=null;$('#confirmDialog').close()};$$('.bottom-nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.nav));
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false});$('#installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else toast('Safari: Paylaş → Ana Ekrana Ekle')};
}
load();bind();render();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
