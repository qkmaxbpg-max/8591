/* One local ledger for receipts, expenses, platform settlements and after-sales. */
function ledgerRows(state,key){return state[key]||[];}
function ledgerMoney(value){return procurementMoney(value);}
function ledgerInRange(date,start,end){return date>=start&&date<=end;}
function ledgerEntry(state,entry){
  var rows=ledgerRows(state,'cashEntries');if(rows.some(function(r){return r.id===entry.id;}))throw new Error('這筆已入帳，請勿重複送出');
  if(!['receipt','expense','refund','compensation','capital_in','capital_out'].includes(entry.kind))throw new Error('收支用途不正確');
  procurementValidateDate(entry.date);if(entry.date>today())throw new Error('只登記已發生收支');
  if(!Number.isSafeInteger(entry.amount)||entry.amount<=0||!entry.note.trim())throw new Error('請填寫用途及大於零的金額');
  var account=state.accounts.find(function(a){return a.id===entry.account_id;});if(!account)throw new Error('請選帳戶');
  if(account.kind==='card'&&!['expense','compensation'].includes(entry.kind))throw new Error('此用途請選銀行帳戶');
  if(entry.order_id&&entry.kind==='receipt'&&rows.some(function(r){return r.kind==='receipt'&&r.order_id===entry.order_id;}))throw new Error('此訂單已有收款，不可重複登記');
  if(entry.case_id&&entry.kind==='refund'&&rows.some(function(r){return r.kind==='refund'&&r.case_id===entry.case_id;}))throw new Error('此案件已退付');
  if(entry.platform_month_id&&rows.some(function(r){return r.platform_month_id===entry.platform_month_id;}))throw new Error('該月撥款已登記');
  state.cashEntries=rows.concat([entry]);return state;
}
function ledgerPlatformSave(state,input){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))throw new Error('月份不正確');
  if(!['8591','蝦皮'].includes(input.platform))throw new Error('平台不正確');
  if(ledgerRows(state,'platformMonths').some(function(r){return r.platform===input.platform&&r.month===input.month;}))throw new Error('此平台月份已登記；更正請使用後續沖正流程，避免重複收款');
  ['opening','sales','fees','refunds','payout','closing'].forEach(function(key){if(!Number.isSafeInteger(input[key])||input[key]<0)throw new Error('請完整填寫非負金額');});
  if(!Number.isSafeInteger(input.adjustment))throw new Error('其他調整金額不正確');
  if(input.adjustment&&!input.adjustment_note.trim())throw new Error('其他調整請說明原因；不可直接將差異當手續費');
  var previous=ledgerRows(state,'platformMonths').filter(function(r){return r.platform===input.platform;}).sort(function(a,b){return b.month.localeCompare(a.month);})[0];
  if(previous){var next=new Date(previous.month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);if(next.toISOString().slice(0,7)!==input.month)throw new Error('請依月份接續登記，避免期初銜接錯誤');if(input.opening!==previous.closing)throw new Error('期初須等於上月實際期末餘額');}
  input.expected=input.opening+input.sales-input.fees-input.refunds+input.adjustment-input.payout;
  input.difference=input.closing-input.expected;
  if(input.difference&&!input.difference_note.trim())throw new Error('尚有差異，請填待查說明；不會自動塞入費用');
  if(input.payout){procurementValidateDate(input.payout_date);if(input.payout_date.slice(0,7)!==input.month)throw new Error('撥款彙總日須在本月份；填該月最後實際收款日');if(!state.accounts.some(function(a){return a.id===input.account_id&&a.kind==='bank';}))throw new Error('平台撥款請選銀行帳戶');ledgerEntry(state,{id:'platform-receipt-'+input.id,kind:'receipt',date:input.payout_date,account_id:input.account_id,amount:input.payout,note:input.platform+' '+input.month+' 撥款彙總',platform_month_id:input.id});}
  state.platformMonths=ledgerRows(state,'platformMonths').concat([input]);return state;
}
function ledgerCaseSave(state,input){
  if(ledgerRows(state,'afterSales').some(function(c){return c.id===input.id;}))throw new Error('此案件已登記');
  procurementValidateDate(input.date);if(input.date>today()||!input.reason.trim())throw new Error('請填實際異常日期及原因');
  if(!['refund','replace','extend'].includes(input.action))throw new Error('售後方式不正確');
  var order=orders.find(function(o){return String(o.id)===input.order_id;});if(!order)throw new Error('請選原訂單');
  if(input.action==='refund'){
    var total=ledgerRows(state,'afterSales').filter(function(c){return c.order_id===input.order_id&&c.action==='refund';}).reduce(function(sum,c){return sum+c.amount;},0);
    if(!Number.isSafeInteger(input.amount)||input.amount<=0||total+input.amount>Math.round((order.qty||1)*(order.unit_price||0)*100))throw new Error('退款不可超過原訂單金額（含已登記退款）');
    if(input.service_end){procurementValidateDate(input.service_end);if(input.service_end>input.date)throw new Error('終止日不可晚於本次異常日期');}
  }else input.amount=0;
  if(input.action==='extend'&&(!Number.isInteger(input.days)||input.days<=0||input.days>3660))throw new Error('請填正確補償天數');
  input.order_no=order.order_no||'';input.platform=order.platform||'';input.paid_at=null;
  state.afterSales=ledgerRows(state,'afterSales').concat([input]);return state;
}
function ledgerRefundPaid(state,id,account,date){
  var row=ledgerRows(state,'afterSales').find(function(c){return c.id===id;});if(!row||row.action!=='refund'||row.paid_at)throw new Error('此案件不能重複退付');
  if(date<row.date)throw new Error('實退日不可早於案件日');
  ledgerEntry(state,{id:'case-refund-'+id,kind:'refund',date:date,account_id:account,amount:row.amount,note:'客戶退款 '+row.order_no,case_id:id,order_id:row.order_id});row.paid_at=date;return state;
}
function ledgerCredit(state,input){
  procurementValidateDate(input.date);if(input.date>today()&&input.kind!=='opening')throw new Error('補償只記已實際收到的金額');
  if(!state.suppliers.some(function(s){return s.id===input.supplier_id;})||!Number.isSafeInteger(input.amount)||input.amount<=0)throw new Error('請確認廠商與金額');
  if(ledgerRows(state,'supplierCredits').some(function(c){return c.id===input.id;}))throw new Error('廠商餘額已登記');
  state.supplierCredits=ledgerRows(state,'supplierCredits').concat([input]);return state;
}
function ledgerSupplierOpening(state,input){
  var supplier=state.suppliers.find(function(s){return s.id===input.supplier_id;});if(!supplier||supplier.opening_date)throw new Error('此廠商期初已設定，不直接覆蓋');
  procurementValidateDate(input.date);if([input.advance,input.payable].some(function(n){return !Number.isSafeInteger(n)||n<0;}))throw new Error('期初金額須為非負金額');
  if(state.purchases.some(function(p){return p.supplier_id===supplier.id;})||state.payments.some(function(p){return p.supplier_id===supplier.id;})||ledgerRows(state,'supplierCredits').some(function(p){return p.supplier_id===supplier.id;}))throw new Error('此廠商已有往來；請保留歷史，期初轉換需先核對，不直接疊加');
  supplier.opening_date=input.date;
  if(input.advance)ledgerCredit(state,{id:input.id+'-advance',supplier_id:supplier.id,date:input.date,amount:input.advance,kind:'opening',note:'期初預付款'});
  if(input.payable)procurementAdd(state,{id:input.id+'-payable',supplier_id:supplier.id,date:input.date,amount:input.payable,title:'期初未付貨款',order_id:'',mode:'individual',opening:true});
  return state;
}
function ledgerAdvancePools(state){return state.payments.filter(function(p){return p.kind==='advance';}).concat(ledgerRows(state,'supplierCredits')).filter(function(p){return p.date<=today();});}
function ledgerCashEffects(state,id,start,end){
  var account=state.accounts.find(function(a){return a.id===id;});if(!account)return 0;
  return ledgerRows(state,'cashEntries').filter(function(e){return e.account_id===id&&ledgerInRange(e.date,start,end);}).reduce(function(sum,e){var incoming=['receipt','compensation','capital_in'].includes(e.kind);return sum+(account.kind==='card'?(incoming?-e.amount:e.amount):(incoming?e.amount:-e.amount));},0);
}
function ledgerValidate(state){
  ['cashEntries','platformMonths','afterSales','supplierCredits'].forEach(function(key){if(state[key]&&!Array.isArray(state[key]))throw new Error('財務資料集合異常');var rows=ledgerRows(state,key);if(new Set(rows.map(function(r){return r.id;})).size!==rows.length)throw new Error('財務資料識別碼重複');});
  ledgerRows(state,'cashEntries').forEach(function(e){procurementValidateDate(e.date);var account=state.accounts.find(function(a){return a.id===e.account_id;});if(!e.id||!['receipt','expense','refund','compensation','capital_in','capital_out'].includes(e.kind)||!Number.isSafeInteger(e.amount)||e.amount<=0||!account||(account.kind==='card'&&!['expense','compensation'].includes(e.kind)))throw new Error('收支關聯、用途或金額異常');});
  ledgerRows(state,'supplierCredits').forEach(function(c){procurementValidateDate(c.date);if(!['opening','compensation'].includes(c.kind)||state.payments.some(function(p){return p.id===c.id;})||!Number.isSafeInteger(c.amount)||c.amount<=0||!state.suppliers.some(function(s){return s.id===c.supplier_id;}))throw new Error('廠商餘額異常');var used=state.allocations.filter(function(a){return a.payment_id===c.id;}).reduce(function(sum,a){return sum+a.amount;},0);if(used>c.amount)throw new Error('廠商餘額超額抵扣');});
  ledgerRows(state,'afterSales').forEach(function(c){if(c.paid_at&&!ledgerRows(state,'cashEntries').some(function(e){return e.kind==='refund'&&e.case_id===c.id&&e.amount===c.amount;}))throw new Error('退款案件缺少實際付款紀錄');});
  ledgerRows(state,'platformMonths').forEach(function(m){if(m.payout&&!ledgerRows(state,'cashEntries').some(function(e){return e.platform_month_id===m.id&&e.amount===m.payout;}))throw new Error('平台撥款缺少收款紀錄');});
}
function ledgerSelectField(label,id,rows,value,extra){return procurementField(label,id,procurementSelect(id,rows,value,extra));}
function ledgerOpen(title,html,selects,save){
  $('procurementModalTitle').textContent=title;$('procurementForm').innerHTML=html;selects.forEach(procurementDropdown);
  $('procurementSave').onclick=async function(){try{var next=procurementCopy();save(next);if(isDemo)procurementCommit(next);else await procurementCommit(next);closeModal();toast('已入帳，相關頁面同步更新','ok');}catch(e){toast(e.message,'err');}};closeModal();openModal('procurementModal');
}
function openLedgerEntry(kind){
  var draft=procurementId();
  ledgerOpen('新增收支｜只登記實際發生款項',ledgerSelectField('用途','ledgerKind',[{id:'receipt',name:'客戶實際收款（非平台撥款）'},{id:'expense',name:'營業費用（非商品成本）'},{id:'capital_in',name:'業主投入（不是收入）'},{id:'capital_out',name:'業主提領（不是費用）'}],kind||'expense')+procurementField('日期','ledgerDate','<input id="ledgerDate" type="date" value="'+today()+'">')+ledgerSelectField('帳戶','ledgerAccount',procurementState.accounts)+procurementField('台幣金額','ledgerAmount','<input id="ledgerAmount" type="number" min="0.01" step="0.01">')+procurementField('用途／費用類別','ledgerNote','<input id="ledgerNote" placeholder="例如廣告實際付款、系統月費、業主投入">')+'<p class="hint">採購成本請用採購帳本；平台撥款用平台月結，不要再當客戶收款。廣告頁按日費用是估算，此處登記實付費用，不會再疊加廣告估算。</p>',['ledgerKind','ledgerAccount'],function(next){ledgerEntry(next,{id:draft,kind:$('ledgerKind').value,date:$('ledgerDate').value,account_id:$('ledgerAccount').value,amount:ledgerMoney($('ledgerAmount').value),note:$('ledgerNote').value.trim()});});
}
function openPlatformMonth(){
  var draft=procurementId(),month=today().slice(0,7);
  var fields=ledgerSelectField('平台','platformName',[{id:'8591',name:'8591（手動提領）'},{id:'蝦皮',name:'蝦皮（自動撥款）'}],'8591','onchange="prefillPlatformMonth()"')+procurementField('月份','platformMonth','<input id="platformMonth" type="month" value="'+month+'" onchange="prefillPlatformMonth()">');
  [['opening','期初平台餘額'],['sales','本月成交／入帳總額（自動參考，可調整）'],['fees','本月實際手續費'],['refunds','平台扣除退款'],['payout','銀行實收撥款合計'],['closing','平台實際期末餘額']].forEach(function(pair){fields+=procurementField(pair[1],'platform_'+pair[0],'<input id="platform_'+pair[0]+'" type="number" min="0" step="0.01">');});
  fields+=procurementField('其他調整（正數增加、負數減少）','platform_adjustment','<input id="platform_adjustment" type="number" step="0.01" value="0">')+procurementField('調整原因（有調整時必填）','platform_adjustment_note','<input id="platform_adjustment_note">')+procurementField('差異待查說明（有差異時必填）','platform_difference_note','<input id="platform_difference_note">')+procurementField('本月最後實際撥入日','platformPayoutDate','<input id="platformPayoutDate" type="date">')+ledgerSelectField('撥入銀行（彙總至同一帳戶）','platformAccount',procurementState.accounts.filter(function(a){return a.kind==='bank';}))+'<p class="hint">期初＋成交－費用－退款＋調整－撥款＝預期餘額。撥款可能包含上月訂單，差異不自動算費用。月彙總以最後撥入日入帳，無法還原月內逐日餘額；同月多銀行入帳暫需先另行彙整。</p>';
  ledgerOpen('每月平台彙總｜不再逐筆核對',fields,['platformName','platformAccount'],function(next){var input={id:draft,month:$('platformMonth').value,platform:$('platformName').value,account_id:$('platformAccount').value,payout_date:$('platformPayoutDate').value,adjustment_note:$('platform_adjustment_note').value.trim(),difference_note:$('platform_difference_note').value.trim()};['opening','sales','fees','refunds','payout','closing'].forEach(function(key){input[key]=ledgerMoney($('platform_'+key).value);});var raw=$('platform_adjustment').value;input.adjustment=(raw.startsWith('-')?-1:1)*ledgerMoney(raw.replace(/^[-+]/,''));ledgerPlatformSave(next,input);});prefillPlatformMonth();
}
function prefillPlatformMonth(){
  var platform=$('platformName').value,month=$('platformMonth').value;if(!month)return;
  var previous=ledgerRows(procurementState,'platformMonths').filter(function(m){return m.platform===platform&&m.month<month;}).sort(function(a,b){return b.month.localeCompare(a.month);})[0];
  $('platform_opening').value=previous?(previous.closing/100).toFixed(2):'';
  $('platform_sales').value=(orders.filter(function(o){return (o.channel||'8591')===platform&&(o.order_date||'').slice(0,7)===month&&['已完成','已退款'].includes(o.status);}).reduce(function(sum,o){return sum+Math.round((o.qty||1)*(o.unit_price||0)*100);},0)/100).toFixed(2);
  $('platform_fees').value='';
}
function openAfterSale(orderId){
  var draft=procurementId(),choices=orders.map(function(o){return {id:String(o.id),name:[o.order_no,o.platform,getCustomerName(o.customer_id)].filter(Boolean).join(' · ')};});
  ledgerOpen('售後案件｜原訂單保持不變',ledgerSelectField('原訂單','caseOrder',choices,orderId)+procurementField('異常日期','caseDate','<input id="caseDate" type="date" value="'+today()+'">')+ledgerSelectField('本次處理','caseAction',[{id:'refund',name:'退款（先記待退付）'},{id:'replace',name:'換帳號（記錄處理，不改原帳密）'},{id:'extend',name:'補天數（記錄補償，日期另確認）'}])+procurementField('退款金額（只在退款時使用）','caseAmount','<input id="caseAmount" type="number" min="0" step="0.01">')+procurementField('服務終止日（退款後已停止服務才填）','caseServiceEnd','<input id="caseServiceEnd" type="date">')+procurementField('補償天數（只在補天數時使用）','caseDays','<input id="caseDays" type="number" min="1" max="3660">')+procurementField('原因／處理說明','caseReason','<textarea id="caseReason"></textarea>')+'<p class="hint">可為同張訂單建立不同後續處理，保留歷程；仍可使用時終止日留空；填終止日會在本次案件日結清剩餘服務收入與個別成本；原訂單狀態及平台座位請另行確認。不自動執行退款、通知、換帳號或延長平台會員。</p>',['caseOrder','caseAction'],function(next){ledgerCaseSave(next,{id:draft,order_id:$('caseOrder').value,date:$('caseDate').value,action:$('caseAction').value,amount:$('caseAction').value==='refund'?ledgerMoney($('caseAmount').value):0,service_end:$('caseAction').value==='refund'?$('caseServiceEnd').value:'',days:Number($('caseDays').value),reason:$('caseReason').value.trim()});});
}
function openRefundPayment(id){
  var row=ledgerRows(procurementState,'afterSales').find(function(c){return c.id===id;});if(!row)return;
  ledgerOpen('記錄已退付 NT$'+fmtN(row.amount/100),procurementField('實際退付日期','refundDate','<input id="refundDate" type="date" value="'+today()+'">')+ledgerSelectField('實際退款銀行','refundAccount',procurementState.accounts.filter(function(a){return a.kind==='bank';}))+'<p class="hint">只在你已實際退給客戶後登記，不會執行轉帳。平台直接扣除的退款請登記平台月結，不要在此重複記銀行退付。</p>',['refundAccount'],function(next){ledgerRefundPaid(next,id,$('refundAccount').value,$('refundDate').value);});
}
function openSupplierCompensation(supplier){
  var draft=procurementId();ledgerOpen('供應商已到帳補償',ledgerSelectField('貨源','creditSupplier',procurementState.suppliers,supplier)+procurementField('實際收到日期','creditDate','<input id="creditDate" type="date" value="'+today()+'">')+ledgerSelectField('收到方式','creditMethod',[{id:'bank',name:'退回銀行'},{id:'card',name:'退回信用卡'},{id:'advance',name:'增加預付餘額／抵下次貨款'}])+ledgerSelectField('銀行／信用卡（抵貨款時忽略）','creditAccount',procurementState.accounts)+procurementField('台幣金額','creditAmount','<input id="creditAmount" type="number" min="0.01" step="0.01">')+procurementField('補償說明','creditNote','<textarea id="creditNote"></textarea>')+'<p class="hint">只記已收到補償；承諾補償可先寫案件備註。退回預付款本金不是補償收益，本版先不在此記本金退款。</p>',['creditSupplier','creditMethod','creditAccount'],function(next){var amount=ledgerMoney($('creditAmount').value),note=$('creditNote').value.trim();if(!note)throw new Error('請填補償原因');if($('creditMethod').value==='advance')ledgerCredit(next,{id:draft,supplier_id:$('creditSupplier').value,date:$('creditDate').value,amount:amount,kind:'compensation',note:note});else{var account=next.accounts.find(function(a){return a.id===$('creditAccount').value;});if(!account||account.kind!==$('creditMethod').value)throw new Error('退款方式與帳戶類型不符');ledgerEntry(next,{id:draft,kind:'compensation',supplier_id:$('creditSupplier').value,date:$('creditDate').value,account_id:account.id,amount:amount,note:note});}});
}
function openSupplierOpening(supplier){
  var draft=procurementId();ledgerOpen('廠商期初｜不新增採購成本或現金流',ledgerSelectField('廠商','openingSupplier',procurementState.suppliers,supplier)+procurementField('起算日','supplierOpeningDate','<input id="supplierOpeningDate" type="date" value="2026-11-01">')+procurementField('期初預付款餘額','supplierOpeningAdvance','<input id="supplierOpeningAdvance" type="number" min="0" step="0.01" value="0">')+procurementField('期初未付貨款','supplierOpeningDue','<input id="supplierOpeningDue" type="number" min="0" step="0.01" value="0">')+'<p class="hint">僅限尚無往來的廠商，已有紀錄不疊加期初，避免重算。兩種餘額分開保留。</p>',['openingSupplier'],function(next){ledgerSupplierOpening(next,{id:draft,supplier_id:$('openingSupplier').value,date:$('supplierOpeningDate').value,advance:ledgerMoney($('supplierOpeningAdvance').value),payable:ledgerMoney($('supplierOpeningDue').value)});});
}
function renderFinanceLedger(){
  if(!$('ledgerEntries')||procurementState.invalid)return;var state=procurementState;
  var names={receipt:'收款',expense:'營業費用',refund:'客戶退款',compensation:'供應商補償',capital_in:'業主投入',capital_out:'業主提領'};
  $('ledgerEntries').innerHTML='<div class="table-scroll"><table><thead><tr><th>日期</th><th>用途</th><th>帳戶</th><th>摘要</th><th class="text-right">金額</th></tr></thead><tbody>'+ledgerRows(state,'cashEntries').slice().reverse().map(function(e){return '<tr><td>'+esc(e.date)+'</td><td>'+esc(names[e.kind]||e.kind)+'</td><td>'+esc((state.accounts.find(function(a){return a.id===e.account_id;})||{}).name)+'</td><td>'+esc(e.note)+'</td><td class="text-right">'+fmtN(e.amount/100)+'</td></tr>';}).join('')+'</tbody></table></div>';
  $('platformMonthsList').innerHTML='<div class="table-scroll"><table><thead><tr><th>月份／平台</th><th class="text-right">成交</th><th class="text-right">實際手續費</th><th class="text-right">銀行實收</th><th class="text-right">期末平台餘額</th><th>差異</th></tr></thead><tbody>'+ledgerRows(state,'platformMonths').slice().reverse().map(function(m){return '<tr><td>'+esc(m.month)+' · '+esc(m.platform)+'</td><td class="text-right">'+fmtN(m.sales/100)+'</td><td class="text-right">'+fmtN(m.fees/100)+'</td><td class="text-right">'+fmtN(m.payout/100)+'</td><td class="text-right">'+fmtN(m.closing/100)+'</td><td class="'+(m.difference?'text-yellow':'text-green')+'">'+(m.difference?'待查 NT$'+fmtN(m.difference/100)+' · '+esc(m.difference_note):'已平衡')+'</td></tr>';}).join('')+'</tbody></table></div>';
  $('afterSalesList').innerHTML='<div class="table-scroll"><table><thead><tr><th>日期／訂單</th><th>處理</th><th>說明</th><th>進度</th><th>操作</th></tr></thead><tbody>'+ledgerRows(state,'afterSales').slice().reverse().map(function(c){return '<tr><td>'+esc(c.date)+'<div class="order-sub">'+esc(c.order_no)+'</div></td><td>'+esc(c.action==='refund'?'退款 NT$'+fmtN(c.amount/100):c.action==='replace'?'換帳號':'補 '+c.days+' 天')+'</td><td>'+esc(c.reason)+'</td><td>'+esc(c.action==='refund'?(c.paid_at?'已實退 '+c.paid_at:'待退付'):'已登記處理')+'</td><td>'+(c.action==='refund'&&!c.paid_at?'<button class="btn sm ghost" data-action="refundPaid" data-id="'+productAttr(c.id)+'">登記已退付</button>':'')+'</td></tr>';}).join('')+'</tbody></table></div>';
}
async function seedFinanceLedgerDemo(){if(window.LOCAL_TEST_CONFIG.environment==='production')return toast('正式網站不載入虛構資料','err');
  try{
    var next=procurementCopy();if(next.full_finance_samples)return toast('完整範例已載入，不會重複新增');
    var bank=next.accounts.find(function(a){return a.id==='demo-bank';});if(!bank)throw new Error('找不到測試銀行，請保留資料並確認帳戶設定');
    if(!bank.opening_date){bank.opening_date=today().slice(0,7)+'-01';bank.opening_amount=100000;}
    ledgerEntry(next,{id:'full-demo-expense',kind:'expense',date:today(),account_id:bank.id,amount:1000,note:'虛構系統費用（範例）'});
    ledgerEntry(next,{id:'full-demo-owner',kind:'capital_in',date:today(),account_id:bank.id,amount:5000,note:'虛構業主投入（範例，不算收入）'});
    var month=today().slice(0,7);
    if(!ledgerRows(next,'platformMonths').some(function(m){return m.platform==='8591';}))ledgerPlatformSave(next,{id:'full-demo-platform',month:month,platform:'8591',account_id:bank.id,payout_date:today(),opening:0,sales:100000,fees:3000,refunds:0,payout:80000,closing:17000,adjustment:0,adjustment_note:'',difference_note:'',fixture:true});
    ledgerCredit(next,{id:'full-demo-compensation',supplier_id:'walnut',date:today(),amount:2000,kind:'compensation',note:'虛構已到帳廠商補償，可抵下次貨款'});
    var order=orders.find(function(o){return o.id==='preview-renewal-order-1';});
    if(order&&!ledgerRows(next,'afterSales').some(function(c){return c.order_id===String(order.id)&&c.action==='refund';}))ledgerCaseSave(next,{id:'full-demo-case',order_id:String(order.id),date:today(),action:'refund',amount:1000,reason:'虛構退款範例，尚未實退，不是正式交易'});
    next.full_finance_samples=true;if(isDemo)procurementCommit(next);else await procurementCommit(next);toast('完整虛構範例已載入；原有資料未覆蓋','ok');
  }catch(e){toast(e.message,'err');}
}
if(!procurementState.invalid){try{procurementValidateState(procurementState);}catch(error){procurementState={invalid:true};}}
