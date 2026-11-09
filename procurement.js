/* Local-only procurement prototype. All amounts are integer TWD cents. */
var procurementState=(function(){
  var raw=null; // Production never restores financial state from preview storage.
  if(raw){try{var value=JSON.parse(raw);procurementValidateState(value);return value;}catch(e){}return {invalid:true};}
  return {version:1,suppliers:[{id:'walnut',name:'胡桃',kind:'串流平台',active:true},{id:'chenglong',name:'宬龍',kind:'串流平台',active:true},{id:'salmon',name:'鮭魚',kind:'遊戲代儲',active:true},{id:'taobao',name:'淘寶',kind:'海外採購',active:true},{id:'official',name:'官方平台',kind:'海外採購',active:true}],accounts:[],purchases:[],payments:[],allocations:[],defaults:[]};
})();
function procurementValidateState(state){
  if(!state||state.version!==1||!['suppliers','accounts','purchases','payments','allocations','defaults'].every(function(key){return Array.isArray(state[key]);}))throw new Error('採購資料結構不完整');
  ['suppliers','accounts','purchases','payments'].forEach(function(key){if(state[key].some(function(row){return !row||typeof row.id!=='string'||!row.id;})||new Set(state[key].map(function(row){return row.id;})).size!==state[key].length)throw new Error('採購資料識別碼異常');});
  ['purchases','payments'].forEach(function(key){state[key].forEach(function(row){if(!Number.isSafeInteger(row.amount)||row.amount<0||!state.suppliers.some(function(s){return s.id===row.supplier_id;}))throw new Error('採購或付款金額／貨源異常');});});
  state.payments.forEach(function(p){if(!['settlement','advance'].includes(p.kind)||!state.accounts.some(function(a){return a.id===p.account_id;}))throw new Error('付款帳戶或用途異常');});
  state.allocations.forEach(function(a){var p=state.purchases.find(function(p){return p.id===a.purchase_id;}),payment=state.payments.concat(state.supplierCredits||[]).find(function(p){return p.id===a.payment_id;});if(!p||!payment||p.supplier_id!==payment.supplier_id||!Number.isSafeInteger(a.amount)||a.amount<=0)throw new Error('付款抵付關聯異常');});
  state.purchases.forEach(function(p){if(procurementDue(state,p)<0)throw new Error('採購抵付款超過原金額');});
  state.payments.forEach(function(p){var allocated=state.allocations.filter(function(a){return a.payment_id===p.id;}).reduce(function(sum,a){return sum+a.amount;},0);if(allocated>p.amount||(p.kind==='settlement'&&allocated!==p.amount))throw new Error('付款分攤金額不一致');});
  if(typeof ledgerValidate==='function')ledgerValidate(state);
  if(typeof financeValidate==='function')financeValidate(state);
}
function procurementCopy(){if(typeof financeWriteBusy==='function'&&financeWriteBusy())throw new Error('正在儲存財務資料，請稍候');if(procurementState.invalid)throw new Error('本機採購資料格式異常，已停止寫入；請先保留資料再排查');procurementValidateState(procurementState);return JSON.parse(JSON.stringify(procurementState));}
function procurementMoney(value){var text=String(value).trim();if(!/^\d+(\.\d{1,2})?$/.test(text))throw new Error('金額須為零或正數，最多兩位小數');var cents=Math.round(Number(text)*100);if(!Number.isSafeInteger(cents)||cents>99999999999)throw new Error('金額超出可用範圍');return cents;}
function procurementId(){return crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}
function procurementCommit(next){if(!isDemo&&window.financeDatabaseEnabled)return financeDatabaseCommit(next);if(!isDemo)throw new Error('財務資料庫尚未就緒');procurementValidateState(next);if(typeof financeLocalAudit==='function')financeLocalAudit(procurementState,next);localStorage.setItem('preview-procurement-v1',JSON.stringify(next));procurementState=next;renderProcurement();}
function procurementDue(state,purchase){if(purchase.opening&&purchase.date>today())return 0;return purchase.amount-state.allocations.filter(function(a){return a.purchase_id===purchase.id;}).reduce(function(sum,a){return sum+a.amount;},0);}
function procurementPaymentLabel(state,purchase){
  var due=procurementDue(state,purchase);
  if(due===purchase.amount&&due>0)return '尚未付款';
  if(due>0)return '舊版部分付款 · 待結清 NT$'+fmtN(due/100);
  if(!purchase.amount)return '零元採購';
  var linked=state.allocations.filter(function(a){return a.purchase_id===purchase.id;}).map(function(a){return state.payments.find(function(p){return p.id===a.payment_id;});});
  if(linked.every(function(p){return p&&p.kind==='advance';}))return '預付款已全額抵扣';
  if(linked.every(function(p){return p&&state.accounts.some(function(a){return a.id===p.account_id&&a.kind==='card';});}))return '已刷卡（卡費未結清）';
  return '已全額支付';
}
function procurementAdvance(state,supplier){return (typeof ledgerAdvancePools==='function'?ledgerAdvancePools(state):state.payments.filter(function(p){return p.kind==='advance';})).filter(function(p){return p.supplier_id===supplier;}).reduce(function(sum,p){return sum+p.amount-state.allocations.filter(function(a){return a.payment_id===p.id;}).reduce(function(total,a){return total+a.amount;},0);},0);}
function procurementValidateDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('日期不正確');}
function procurementAdd(state,input){
  if(state.purchases.some(function(p){return p.id===input.id;}))throw new Error('此採購已儲存，請勿重複送出');
  if(!['individual','shared'].includes(input.mode))throw new Error('採購模式不正確');
  var supplier=state.suppliers.find(function(s){return s.id===input.supplier_id&&s.active;});if(!supplier)throw new Error('請選擇啟用貨源');
  procurementValidateDate(input.date);if(!input.title.trim()||!Number.isSafeInteger(input.amount)||input.amount<0)throw new Error('請確認商品與金額');
  if(input.order_id&&state.purchases.some(function(p){return p.order_id===input.order_id;}))throw new Error('此訂單已有採購紀錄，請先查看原紀錄，避免成本重複');
  if(input.mode==='shared'){if(!input.service_account_id||!input.service_start||!input.service_end)throw new Error('共用帳號月費需選帳號並填服務起訖日');procurementValidateDate(input.service_start);procurementValidateDate(input.service_end);if(input.service_end<input.service_start)throw new Error('服務結束不可早於開始');if(input.order_id)throw new Error('共用帳號月費不可當成單一客戶的完整成本');if(state.purchases.some(function(p){return p.mode==='shared'&&p.service_account_id===input.service_account_id&&p.service_start<=input.service_end&&p.service_end>=input.service_start;}))throw new Error('此帳號已有重疊服務期間的月費，請先核對，避免重複記帳');}
  state.purchases.push(Object.assign({},input,{supplier_name:supplier.name}));return state;
}
function procurementPay(state,input){
  if(state.payments.some(function(p){return p.id===input.id;}))throw new Error('此付款已登記，請勿重複送出');
  if(!state.suppliers.some(function(s){return s.id===input.supplier_id&&s.active;}))throw new Error('貨源不存在或已停用');
  if(!state.accounts.some(function(a){return a.id===input.account_id;}))throw new Error('請選擇付款帳戶');
  if(!Number.isSafeInteger(input.amount)||input.amount<=0)throw new Error('付款金額須大於零');procurementValidateDate(input.date);if(input.date>today())throw new Error('此處只登記已發生付款，不可使用未來日期');
  var due=state.purchases.filter(function(p){return p.supplier_id===input.supplier_id;}).sort(function(a,b){return a.date.localeCompare(b.date);});
  if(input.kind==='settlement'){
    if(input.purchase_ids){if(new Set(input.purchase_ids).size!==input.purchase_ids.length||input.purchase_ids.some(function(id){return !due.some(function(p){return p.id===id&&procurementDue(state,p)>0;});}))throw new Error('所選採購不存在、貨源不同或已付款');due=due.filter(function(p){return input.purchase_ids.includes(p.id);});}
    var fullAmount=due.reduce(function(sum,p){return sum+procurementDue(state,p);},0);
    if(input.amount!==fullAmount)throw new Error('付款須一次付清所選採購，不接受部分付款；預付款請另選儲值');
    due.forEach(function(p){var amount=procurementDue(state,p);if(amount>0)state.allocations.push({payment_id:input.id,purchase_id:p.id,amount:amount});});
  }else if(input.kind!=='advance')throw new Error('付款類型不正確');
  state.payments.push(input);return state;
}
function procurementApplyAdvance(state,supplier,purchaseIds){
  var payments=(typeof ledgerAdvancePools==='function'?ledgerAdvancePools(state):state.payments.filter(function(p){return p.kind==='advance';})).filter(function(p){return p.supplier_id===supplier;});
  var purchases=state.purchases.filter(function(p){return p.supplier_id===supplier&&procurementDue(state,p)>0;}).sort(function(a,b){return a.date.localeCompare(b.date);});
  if(purchaseIds){if(new Set(purchaseIds).size!==purchaseIds.length||purchaseIds.some(function(id){return !purchases.some(function(p){return p.id===id;});}))throw new Error('所選採購已付清或不屬於此貨源');purchases=purchases.filter(function(p){return purchaseIds.includes(p.id);});}
  var required=purchases.reduce(function(sum,p){return sum+procurementDue(state,p);},0);
  if(!required)throw new Error('沒有未付採購');
  if(procurementAdvance(state,supplier)<required)throw new Error('預付款不足以全額抵扣，請先補款；沒有扣除任何餘額');
  payments.forEach(function(payment){var available=payment.amount-state.allocations.filter(function(a){return a.payment_id===payment.id;}).reduce(function(sum,a){return sum+a.amount;},0);purchases.forEach(function(purchase){var amount=Math.min(available,procurementDue(state,purchase));if(amount>0){state.allocations.push({payment_id:payment.id,purchase_id:purchase.id,amount:amount});available-=amount;}});});return state;
}
function procurementHtmlOptions(rows,value){return rows.map(function(row){return '<option value="'+productAttr(row.id)+'"'+(row.id===value?' selected':'')+'>'+esc(row.name||row.platform+' · '+row.version+' · '+row.duration)+'</option>';}).join('');}
function procurementDropdown(id){var select=$(id),container=$(id+'Drop');if(!select||!container)return;select.hidden=true;cdropInit(id+'Drop',{items:Array.from(select.options).map(function(o){return {value:o.value,label:o.textContent};}),value:select.value,placeholder:'搜尋或選擇',onSelect:function(value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}});container.querySelector('input').setAttribute('aria-label',select.getAttribute('aria-label')||'選項');}
function procurementField(label,id,html){return '<div class="form-group"><label for="'+id+'">'+label+'</label>'+html+'</div>';}
function procurementSelect(id,rows,value,extra){return '<select id="'+id+'" aria-label="'+id+'" '+(extra||'')+'>'+procurementHtmlOptions(rows,value)+'</select><div id="'+id+'Drop"></div>';}
function openProcurement(orderId){
  if(procurementState.invalid)return toast('採購資料格式異常，請先排查','err');
  var order=orders.find(function(o){return String(o.id)===String(orderId);});
  if(order&&procurementState.purchases.some(function(p){return p.order_id===String(order.id);}))return toast('此訂單已有採購，請至採購帳本查看','err');
  var product=order&&products.find(function(p){return String(p.id)===String(order.product_id);});
  var preset=procurementState.defaults.find(function(d){return product&&d.product_id===String(product.id);});
  if(order&&preset&&preset.mode==='shared')return toast('此商品採共用月費；請從採購帳本新增月費，不把整筆帳號成本重複放入客戶訂單','err');
  $('procurementModalTitle').textContent='新增採購｜只登記，不執行付款';
  $('procurementForm').innerHTML='<input id="purchaseDraftId" type="hidden" value="'+procurementId()+'"><input id="purchaseOrderId" type="hidden" value="'+productAttr(order?order.id:'')+'">'+
    procurementField('叫貨日期','purchaseDate','<input id="purchaseDate" type="date" value="'+today()+'">')+
    procurementField('貨源','purchaseSupplier',procurementSelect('purchaseSupplier',procurementState.suppliers.filter(function(s){return s.active;}),preset&&preset.supplier_id))+
    procurementField('付款帳戶預設（只帶入，不代表已付款）','purchasePayAccount',procurementSelect('purchasePayAccount',procurementState.accounts,preset&&preset.account_id))+
    procurementField('商品／叫貨摘要','purchaseTitle','<input id="purchaseTitle" value="'+productAttr(order?[order.platform,order.version,order.duration].filter(Boolean).join(' · '):'')+'" placeholder="LINE 叫貨內容摘要">')+
    procurementField('採購金額合計（台幣）','purchaseAmount','<input id="purchaseAmount" type="number" min="0" step="0.01" value="'+(order?(order.unit_cost||0)*(order.qty||1):'')+'">')+
    procurementField('付款狀態','purchasePaymentStatus',procurementSelect('purchasePaymentStatus',[{id:'paid',name:'已付款／已刷卡（全額）'},{id:'unpaid',name:'尚未付款'},{id:'advance',name:'預付款全額抵扣'}],preset&&preset.supplier_id&&!preset.account_id?'unpaid':'paid'))+
    procurementField('採購模式','purchaseMode',procurementSelect('purchaseMode',[{id:'individual',name:'一對一採購'},{id:'shared',name:'共用帳號月費'}],preset?preset.mode:'individual','onchange="toggleProcurementShared()"'))+
    '<div id="purchaseShared"><p class="hint">月費先登記一次，不重複加到每位客戶；座位成本分攤尚未啟用。</p>'+procurementField('對應共用帳號','purchaseServiceAccount',procurementSelect('purchaseServiceAccount',[{id:'',name:'請選共用帳號'}].concat(serviceAccounts.filter(function(a){return a.status==='啟用';}).map(function(a){return {id:String(a.id),name:a.platform+' · '+a.email};}))))+'<div class="form-row">'+procurementField('帳單服務起日','purchaseStart','<input id="purchaseStart" type="date">')+procurementField('帳單服務迄日','purchaseEnd','<input id="purchaseEnd" type="date">')+'</div></div>'+
    procurementField('LINE／叫貨備註（選填）','purchaseNote','<textarea id="purchaseNote" placeholder="例如訊息日期、叫貨內容；不需要貼帳密"></textarea>')+'<p class="hint">'+(order?'對應 '+esc(order.order_no)+'，成本帶自原訂單；不回寫訂單歷史成本。':'沒有對應客戶訂單的採購，也可直接登記。')+'</p>';
  ['purchaseSupplier','purchasePayAccount','purchasePaymentStatus','purchaseMode','purchaseServiceAccount'].forEach(procurementDropdown);toggleProcurementShared();
  $('procurementSave').onclick=saveProcurement;closeModal();openModal('procurementModal');
}
function toggleProcurementShared(){$('purchaseShared').hidden=$('purchaseMode').value!=='shared';}
async function saveProcurement(){
  try{var next=procurementCopy(),input={id:$('purchaseDraftId').value,date:$('purchaseDate').value,supplier_id:$('purchaseSupplier').value,default_account_id:$('purchasePayAccount').value,title:$('purchaseTitle').value.trim(),amount:procurementMoney($('purchaseAmount').value),order_id:$('purchaseOrderId').value,mode:$('purchaseMode').value,service_account_id:$('purchaseServiceAccount').value,service_start:$('purchaseStart').value,service_end:$('purchaseEnd').value,note:$('purchaseNote').value.trim()};procurementAdd(next,input);settleNewProcurement(next,input,$('purchasePaymentStatus').value);if(isDemo)procurementCommit(next);else await procurementCommit(next);closeModal();toast('採購與付款狀態已一起儲存','ok');}catch(e){toast(e.message,'err');}
}
function openSupplierPayment(supplier,purchaseId){
  if(procurementState.invalid)return toast('採購資料格式異常，請先排查','err');
  $('procurementModalTitle').textContent='全額結清／預付款登記';
  $('procurementForm').innerHTML='<input id="paymentDraftId" type="hidden" value="'+procurementId()+'">'+procurementField('日期','paymentDate','<input id="paymentDate" type="date" value="'+today()+'">')+procurementField('貨源','paymentSupplier',procurementSelect('paymentSupplier',procurementState.suppliers.filter(function(s){return s.active;}),supplier,'onchange="refreshFullPaymentRows()"'))+procurementField('用途','paymentKind',procurementSelect('paymentKind',[{id:'settlement',name:'全額結清所選採購'},{id:'advance',name:'預付款／儲值'}],'settlement','onchange="refreshFullPaymentRows()"'))+procurementField('付款帳戶','paymentAccount',procurementSelect('paymentAccount',procurementState.accounts))+'<div id="paymentPurchases"></div>'+procurementField('金額（結清時自動合計）','paymentAmount','<input id="paymentAmount" type="number" min="0.01" step="0.01">')+'<p class="hint">結清只勾選採購，不重填付款金額；信用卡仍代表刷卡，並非卡費已繳。此操作只記錄已發生付款，不會轉帳。</p>';
  ['paymentSupplier','paymentKind','paymentAccount'].forEach(procurementDropdown);refreshFullPaymentRows(purchaseId);
  $('procurementSave').onclick=async function(){try{var next=procurementCopy();procurementPay(next,{id:$('paymentDraftId').value,date:$('paymentDate').value,supplier_id:$('paymentSupplier').value,kind:$('paymentKind').value,account_id:$('paymentAccount').value,amount:procurementMoney($('paymentAmount').value),purchase_ids:$('paymentKind').value==='settlement'?Array.from($('paymentPurchases').querySelectorAll('input:checked')).map(function(box){return box.value;}):undefined});if(isDemo)procurementCommit(next);else await procurementCommit(next);closeModal();toast('已登記全額付款／預付款','ok');}catch(e){toast(e.message,'err');}};closeModal();openModal('procurementModal');
}
function refreshFullPaymentRows(selected){
  var settlement=$('paymentKind').value==='settlement';$('paymentAmount').readOnly=settlement;
  $('paymentPurchases').innerHTML=settlement?procurementState.purchases.filter(function(p){return p.supplier_id===$('paymentSupplier').value&&procurementDue(procurementState,p)>0;}).map(function(p){return '<label class="full-payment-row"><input type="checkbox" value="'+productAttr(p.id)+'" '+(!selected||p.id===selected?'checked':'')+' onchange="updateFullPaymentAmount()"><span>'+esc(p.title)+' · NT$'+fmtN(procurementDue(procurementState,p)/100)+'</span></label>';}).join(''):'';
  if(settlement)updateFullPaymentAmount();else $('paymentAmount').value='';
}
function updateFullPaymentAmount(){var ids=Array.from($('paymentPurchases').querySelectorAll('input:checked')).map(function(box){return box.value;});$('paymentAmount').value=(procurementState.purchases.filter(function(p){return ids.includes(p.id);}).reduce(function(sum,p){return sum+procurementDue(procurementState,p);},0)/100).toFixed(2);}
function settleNewProcurement(state,purchase,status){
  if(status==='unpaid'||!purchase.amount)return state;
  if(status==='advance')return procurementApplyAdvance(state,purchase.supplier_id,[purchase.id]);
  if(status!=='paid')throw new Error('付款狀態不正確');
  return procurementPay(state,{id:'purchase-payment-'+purchase.id,date:purchase.date,supplier_id:purchase.supplier_id,kind:'settlement',account_id:purchase.default_account_id,amount:purchase.amount,purchase_ids:[purchase.id]});
}
function applySupplierAdvance(id){confirmAction('確認全額抵扣此貨源所有未付採購？餘額不足時不抵扣，不產生新的轉帳。',async function(){try{var next=procurementCopy();procurementApplyAdvance(next,id);if(isDemo)procurementCommit(next);else await procurementCommit(next);toast('已記錄預付款抵扣','ok');}catch(e){toast(e.message,'err');}});}
function renderProcurement(){
  if(typeof renderFinanceAccounts==='function')renderFinanceAccounts();
  if(typeof renderFinanceLedger==='function')renderFinanceLedger();
  if(typeof renderFinanceReports==='function')renderFinanceReports();
  if(!$('procurementList'))return;
  if(procurementState.invalid){$('procurementList').textContent='本機資料格式異常，已停止寫入。';return;}
  var state=procurementState,q=($('procurementSearch').value||'').toLowerCase(),supplier=$('procurementSupplierFilter').value;
  var old=supplier;$('procurementSupplierFilter').innerHTML='<option value="">全部貨源</option>'+procurementHtmlOptions(state.suppliers);$('procurementSupplierFilter').value=old;procurementDropdown('procurementSupplierFilter');
  var rows=state.purchases.filter(function(p){return (!supplier||p.supplier_id===supplier)&&(!q||[p.title,p.supplier_name,p.note,'PO-'+p.id.slice(0,8)].join(' ').toLowerCase().includes(q));});
  var due=rows.reduce(function(sum,p){return sum+procurementDue(state,p);},0),cost=rows.reduce(function(sum,p){return sum+p.amount;},0);
  $('procurementStats').innerHTML=statCard('篩選採購金額','NT$'+fmtN(cost/100),'採購登記，非本期認列成本')+statCard('尚未付款／抵扣','NT$'+fmtN(due/100),'已支付與預付款抵扣分開記錄');
  $('procurementList').innerHTML=rows.length?'<div class="table-scroll"><table class="procurement-table"><thead><tr><th>叫貨日期／編號</th><th>貨源／摘要</th><th class="text-right">採購金額</th><th>付款狀態</th><th>操作</th></tr></thead><tbody>'+rows.slice().reverse().map(function(p){return '<tr><td>'+esc(p.date)+'<div class="order-sub">PO-'+esc(p.id.slice(0,8))+'</div></td><td><strong>'+esc(p.supplier_name)+'</strong><div>'+esc(p.title)+'</div><div class="order-sub">'+esc(p.note||'')+(p.mode==='shared'?' · 共用月費 '+esc(p.service_start)+' → '+esc(p.service_end):'')+'</div></td><td class="text-right">'+fmtN(p.amount/100)+'</td><td>'+procurementPaymentLabel(state,p)+'</td><td>'+(procurementDue(state,p)>0?'<button class="btn sm ghost" data-action="supplierPayment" data-id="'+productAttr(p.supplier_id)+'" data-purchase-id="'+productAttr(p.id)+'">全額結清</button>':'')+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty">沒有符合條件的採購。可新增，或從訂單詳情帶入。</div>';
  $('supplierList').innerHTML=state.suppliers.map(function(s){var due=state.purchases.filter(function(p){return p.supplier_id===s.id;}).reduce(function(sum,p){return sum+procurementDue(state,p);},0);return '<div class="card supplier-card"><h3>'+esc(s.name)+'</h3><p class="order-sub">'+esc(s.kind)+' · 台幣</p><p>預付可用 NT$'+fmtN(procurementAdvance(state,s.id)/100)+' ｜ 未付貨款 NT$'+fmtN(due/100)+'</p><div class="act-group"><button class="btn sm ghost" data-action="supplierOpening" data-id="'+productAttr(s.id)+'">期初設定</button><button class="btn sm ghost" data-action="supplierCompensation" data-id="'+productAttr(s.id)+'">登記補償</button><button class="btn sm ghost" data-action="supplierPayment" data-id="'+productAttr(s.id)+'">登記付款／預付</button><button class="btn sm ghost" data-action="supplierAdvance" data-id="'+productAttr(s.id)+'">使用預付款抵扣</button></div></div>';}).join('');
  $('supplierPaymentHistory').innerHTML='<h3>已登記付款紀錄</h3><div class="table-scroll"><table><thead><tr><th>日期</th><th>貨源</th><th>付款用途</th><th>帳戶</th><th class="text-right">金額</th></tr></thead><tbody>'+state.payments.slice().reverse().map(function(p){var account=state.accounts.find(function(a){return a.id===p.account_id;});return '<tr><td>'+esc(p.date)+'</td><td>'+esc((state.suppliers.find(function(s){return s.id===p.supplier_id;})||{}).name||'歷史貨源')+'</td><td>'+esc(p.kind==='advance'?'預付款':'支付貨款')+'</td><td>'+esc(account?account.name:'歷史帳戶')+(account&&account.kind==='card'?' · 刷卡未結清':'')+'</td><td class="text-right">'+fmtN(p.amount/100)+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function syncPurchaseDefaults(prefix,product){
  if(procurementState.invalid)return;
  var preset=product&&procurementState.defaults.find(function(d){return d.product_id===String(product.id);});
  [[prefix+'_source',procurementState.suppliers.filter(function(s){return s.active;}),preset&&preset.supplier_id], [prefix+'_payAccount',procurementState.accounts,preset&&preset.account_id], [prefix+'_purchaseMode',[{id:'individual',name:'一對一採購'},{id:'shared',name:'共用帳號月費'}],preset&&preset.mode]].forEach(function(spec){var select=$(spec[0]);select.innerHTML='<option value="">尚未設定</option>'+procurementHtmlOptions(spec[1],spec[2]);select.value=spec[2]||'';procurementDropdown(spec[0]);});
}
function savePurchaseDefaults(prefix,items){
  var supplier=$(prefix+'_source').value,account=$(prefix+'_payAccount').value,mode=$(prefix+'_purchaseMode').value;
  if(!supplier&&!account&&!mode){var cleared=procurementCopy();items.forEach(function(p){cleared.defaults=cleared.defaults.filter(function(d){return d.product_id!==String(p.id);});});if(!isDemo)throw new Error('僅本機預覽');localStorage.setItem('preview-procurement-v1',JSON.stringify(cleared));procurementState=cleared;return;}
  validatePurchaseDefaults(prefix);
  var next=procurementCopy();items.forEach(function(product){next.defaults=next.defaults.filter(function(d){return d.product_id!==String(product.id);});next.defaults.push({product_id:String(product.id),supplier_id:supplier,mode:mode,...(account?{account_id:account}:{})});});
  if(!isDemo)throw new Error('採購預設尚未開放正式寫入');localStorage.setItem('preview-procurement-v1',JSON.stringify(next));procurementState=next;
}
function validatePurchaseDefaults(prefix){var values=['_source','_payAccount','_purchaseMode'].map(function(field){return $(prefix+field).value;});if(values.some(Boolean)&&(!values[0]||!values[2]))throw new Error('請選擇貨源及採購模式；付款帳戶可等付款時再選');}
function openSupplierEditor(){
  if(procurementState.invalid)return toast('採購資料格式異常，請先排查','err');
  $('procurementModalTitle').textContent='新增貨源';$('procurementForm').innerHTML=procurementField('名稱','newSupplierName','<input id="newSupplierName" maxlength="80">')+procurementField('類型／備註','newSupplierKind','<input id="newSupplierKind" placeholder="例如串流、遊戲代儲、官方平台">')+'<p class="hint">所有商品與採購共用此貨源清單。此處不需輸入銀行帳號或密碼。</p>';
  $('procurementSave').onclick=async function(){try{var next=procurementCopy(),name=$('newSupplierName').value.trim();if(!name||next.suppliers.some(function(s){return s.name.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase();}))throw new Error('名稱不可空白或重複');next.suppliers.push({id:procurementId(),name:name,kind:$('newSupplierKind').value.trim(),active:true});if(isDemo)procurementCommit(next);else await procurementCommit(next);closeModal();toast('貨源已新增，可在商品預設及採購選用','ok');}catch(e){toast(e.message,'err');}};closeModal();openModal('procurementModal');
}
function setWorkspace(workspace){
  document.querySelectorAll('#tabBar .tab').forEach(function(button){button.hidden=(button.dataset.workspace||'operations')!==workspace;});
  $('workspaceLabel').textContent=workspace==='finance'?'財務管理':'營運管理';$('workspaceDrawer').hidden=true;
  switchTab(workspace==='finance'?'procurement':'dashboard');
  if(workspace==='finance'){switchTab('financeOverview');renderProcurement();}
}
function toggleWorkspaceDrawer(){$('workspaceDrawer').hidden=!$('workspaceDrawer').hidden;}
function financeHistory(tab){
  switchTab(tab);
  if(tab==='procurement'||tab==='suppliers')renderProcurement();
  else renderFinanceLedger();
}
async function seedProcurementDemo(){if(window.LOCAL_TEST_CONFIG.environment==='production')return toast('正式網站不載入虛構資料','err');
  try{var next=procurementCopy();if(next.samples_loaded)return toast('範例已載入，不會重複新增');
    [{id:'sample-purchase-walnut',supplier_id:'walnut',title:'虛構串流會員 × 2',amount:60000},{id:'sample-purchase-chenglong',supplier_id:'chenglong',title:'虛構會員方案',amount:45000},{id:'sample-purchase-salmon',supplier_id:'salmon',title:'虛構遊戲代儲',amount:20000}].forEach(function(p){procurementAdd(next,Object.assign(p,{date:today(),order_id:'',mode:'individual',note:'虛構範例，非正式交易'}));});
    procurementPay(next,{id:'sample-payment-advance',supplier_id:'walnut',date:today(),kind:'advance',account_id:'demo-bank',amount:100000});
    procurementPay(next,{id:'sample-payment-full',supplier_id:'chenglong',date:today(),kind:'settlement',account_id:'demo-bank',amount:45000});
    procurementPay(next,{id:'sample-payment-card',supplier_id:'salmon',date:today(),kind:'settlement',account_id:'demo-card',amount:20000});
    next.samples_loaded=true;if(isDemo)procurementCommit(next);else await procurementCommit(next);toast('已載入虛構採購、預付款、全額付款與刷卡範例','ok');
  }catch(e){toast(e.message,'err');}
}
