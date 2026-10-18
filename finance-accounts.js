/* Account balances are local ledger estimates; never connect to a bank. */
function financeAccountBalance(state,id,asOf){
  var account=state.accounts.find(function(a){return a.id===id;});if(!account)throw new Error('找不到帳戶');
  if(!account.opening_date||!Number.isSafeInteger(account.opening_amount))return null;
  if(asOf<account.opening_date)return null;
  var amount=account.opening_amount;
  state.payments.filter(function(p){return p.account_id===id&&p.date>=account.opening_date&&p.date<=asOf;}).forEach(function(p){amount+=account.kind==='card'?p.amount:-p.amount;});
  (state.transfers||[]).filter(function(t){return t.date>=account.opening_date&&t.date<=asOf;}).forEach(function(t){if(t.from_id===id)amount-=t.amount;if(t.to_id===id)amount+=account.kind==='card'?-t.amount:t.amount;});
  if(typeof ledgerCashEffects==='function')amount+=ledgerCashEffects(state,id,account.opening_date,asOf);
  return amount;
}
function financeSaveAccount(state,input){
  input.name=String(input.name||'').trim();if(!input.name)throw new Error('請填寫帳戶名稱');
  if(!['bank','card'].includes(input.kind))throw new Error('帳戶類型不正確');
  if(state.accounts.some(function(a){return a.id!==input.id&&a.name.normalize('NFKC').toLowerCase()===input.name.normalize('NFKC').toLowerCase();}))throw new Error('帳戶名稱已存在');
  procurementValidateDate(input.opening_date);if(!Number.isSafeInteger(input.opening_amount)||input.opening_amount<0)throw new Error('期初金額須為零或正數');
  var old=state.accounts.find(function(a){return a.id===input.id;});
  if(old){
    var used=(state.cashEntries||[]).some(function(e){return e.account_id===input.id;})||state.payments.some(function(p){return p.account_id===input.id;})||(state.transfers||[]).some(function(t){return t.from_id===input.id||t.to_id===input.id;});
    if(used&&old.kind!==input.kind)throw new Error('已有紀錄的帳戶不可改變類型，請新增帳戶');
    if(used&&old.opening_date&&(old.opening_date!==input.opening_date||old.opening_amount!==input.opening_amount))throw new Error('已有金流且期初已設定，不能直接改寫；需另做期初更正流程');
  }
  if(input.kind==='card'&&(!Number.isInteger(input.close_day)||input.close_day<1||input.close_day>31||!Number.isInteger(input.due_day)||input.due_day<1||input.due_day>31))throw new Error('信用卡結帳日與繳款日須為 1～31 日');
  if(input.debit_account_id&&!state.accounts.some(function(a){return a.id===input.debit_account_id&&a.kind==='bank';}))throw new Error('扣款帳戶須為銀行帳戶');
  if(old)Object.assign(old,input);else state.accounts.push(input);return state;
}
function financeTransfer(state,input){
  if((state.transfers||[]).some(function(t){return t.id===input.id;}))throw new Error('此筆已登記，請勿重複送出');
  procurementValidateDate(input.date);if(input.date>today())throw new Error('只登記已發生轉帳或扣款');
  if(!Number.isSafeInteger(input.amount)||input.amount<=0)throw new Error('金額須大於零');
  var from=state.accounts.find(function(a){return a.id===input.from_id;}),to=state.accounts.find(function(a){return a.id===input.to_id;});
  if(!from||!to||from.id===to.id||from.kind!=='bank')throw new Error('請選擇不同的銀行轉出帳戶與目的帳戶');
  if(input.kind==='card_repayment'?to.kind!=='card':input.kind!=='bank_transfer'||to.kind!=='bank')throw new Error('轉帳類型與目的帳戶不符');
  if(!from.opening_date||!to.opening_date||input.date<from.opening_date||input.date<to.opening_date)throw new Error('請先設定兩個帳戶期初，日期不可早於起算日');
  var available=financeAccountBalance(state,from.id,input.date);if(available<input.amount)throw new Error('已登記的來源資金不足，請先確認期初及金流是否完整');
  if(to.kind==='card'&&input.amount>financeAccountBalance(state,to.id,input.date))throw new Error('超過目前登記的營業卡款；私人卡費不在這裡核銷');
  state.transfers=state.transfers||[];state.transfers.push(input);return state;
}
function financeValidate(state){
  if(state.transfers&&!Array.isArray(state.transfers))throw new Error('資金移轉資料異常');
  var ids=new Set();(state.transfers||[]).forEach(function(t){
    var from=state.accounts.find(function(a){return a.id===t.from_id;}),to=state.accounts.find(function(a){return a.id===t.to_id;});
    if(!t.id||ids.has(t.id)||!from||!to||from.id===to.id||from.kind!=='bank'||!Number.isSafeInteger(t.amount)||t.amount<=0)throw new Error('資金移轉關聯異常');ids.add(t.id);procurementValidateDate(t.date);
    if(!['bank_transfer','card_repayment'].includes(t.kind)||(t.kind==='card_repayment'?to.kind!=='card':to.kind!=='bank'))throw new Error('移轉用途不正確');
  });
  state.accounts.forEach(function(a){if(a.opening_date){procurementValidateDate(a.opening_date);if(!Number.isSafeInteger(a.opening_amount)||a.opening_amount<0)throw new Error('期初金額異常');if(a.kind==='card'){var dates=[a.opening_date].concat(state.payments.map(function(p){return p.date;}),(state.cashEntries||[]).map(function(e){return e.date;}),(state.transfers||[]).map(function(t){return t.date;}));dates.forEach(function(date){if(date>=a.opening_date&&financeAccountBalance(state,a.id,date)<0)throw new Error('卡款紀錄出現超額核銷，請核對日期與金額');});}}});
}
function financeEstimatedCycle(payment,account){
  if(!account.close_day)return '未設定結帳日';var date=payment.date.split('-').map(Number),last=new Date(Date.UTC(date[0],date[1],0)).getUTCDate();
  var month=date[1]-1+(date[2]>Math.min(account.close_day,last)?1:0);return new Date(Date.UTC(date[0],month,1)).toISOString().slice(0,7);
}
function openFinanceAccount(id){
  if(procurementState.invalid)return toast('資料異常，請先排查','err');var account=procurementState.accounts.find(function(a){return a.id===id;});
  $('procurementModalTitle').textContent=account?'編輯帳戶與期初':'新增帳戶與期初';
  $('procurementForm').innerHTML='<input id="financeAccountId" type="hidden" value="'+productAttr(account?account.id:procurementId())+'">'+procurementField('帳戶名稱（不用填完整帳號）','financeName','<input id="financeName" value="'+productAttr(account?account.name:'')+'">')+procurementField('帳戶類型','financeKind',procurementSelect('financeKind',[{id:'bank',name:'銀行／營業資金'},{id:'card',name:'信用卡（只記營業部分）'}],account?account.kind:'bank','onchange="toggleFinanceCardFields()"'))+'<div class="form-row">'+procurementField('期初起算日','financeOpeningDate','<input id="financeOpeningDate" type="date" value="'+(account&&account.opening_date?account.opening_date:(typeof financeStartDate==='function'&&financeStartDate(procurementState)||'2026-11-01'))+'">')+procurementField('期初資金／未繳營業卡款','financeOpeningAmount','<input id="financeOpeningAmount" type="number" min="0" step="0.01" value="'+(account&&Number.isSafeInteger(account.opening_amount)?account.opening_amount/100:'')+'">')+'</div><div id="financeCardFields"><div class="form-row">'+procurementField('每月結帳日','financeCloseDay','<input id="financeCloseDay" type="number" min="1" max="31" value="'+(account&&account.close_day||'')+'">')+procurementField('每月繳款日','financeDueDay','<input id="financeDueDay" type="number" min="1" max="31" value="'+(account&&account.due_day||'')+'">')+'</div>'+procurementField('銀行自動扣款帳戶','financeDebitAccount',procurementSelect('financeDebitAccount',[{id:'',name:'尚未指定'}].concat(procurementState.accounts.filter(function(a){return a.kind==='bank';})),account&&account.debit_account_id))+'</div><p class="hint">期初為起算日開始前的金額；起算日當天的新金流另外計入。先設定銀行再指定卡費扣款帳戶。結帳日只供帳期估算，實際仍以銀行入帳及帳單為準。此版不連銀行，也不包含私人消費。</p>';
  ['financeKind','financeDebitAccount'].forEach(procurementDropdown);toggleFinanceCardFields();
  $('procurementSave').onclick=async function(){try{var next=procurementCopy();financeSaveAccount(next,{id:$('financeAccountId').value,name:$('financeName').value,kind:$('financeKind').value,opening_date:$('financeOpeningDate').value,opening_amount:procurementMoney($('financeOpeningAmount').value),close_day:Number($('financeCloseDay').value),due_day:Number($('financeDueDay').value),debit_account_id:$('financeKind').value==='card'?$('financeDebitAccount').value:''});if(isDemo)procurementCommit(next);else await procurementCommit(next);closeModal();toast('帳戶與期初已儲存，各採購入口共用此帳戶清單','ok');}catch(e){toast(e.message,'err');}};closeModal();openModal('procurementModal');
}
function toggleFinanceCardFields(){$('financeCardFields').hidden=$('financeKind').value!=='card';}
function openFinanceTransfer(){
  $('procurementModalTitle').textContent='記錄已發生轉帳／繳卡費';$('procurementForm').innerHTML='<input id="financeTransferId" type="hidden" value="'+procurementId()+'">'+procurementField('類型','financeTransferKind',procurementSelect('financeTransferKind',[{id:'bank_transfer',name:'銀行間轉帳（例如先轉入扣款帳戶）'},{id:'card_repayment',name:'銀行已實際扣繳營業卡費'}],'bank_transfer','onchange="refreshFinanceDestination()"'))+procurementField('實際日期','financeTransferDate','<input id="financeTransferDate" type="date" value="'+today()+'">')+procurementField('轉出銀行帳戶','financeFrom',procurementSelect('financeFrom',procurementState.accounts.filter(function(a){return a.kind==='bank';})))+procurementField('轉入／被結清帳戶','financeTo',procurementSelect('financeTo',[]))+procurementField('本次營業金額','financeTransferAmount','<input id="financeTransferAmount" type="number" min="0.01" step="0.01">')+'<p class="hint">只有記錄，不執行轉帳；銀行間轉帳不減卡款，實際扣繳才減卡款。兩種動作都不再計採購成本。</p>';
  ['financeTransferKind','financeFrom'].forEach(procurementDropdown);refreshFinanceDestination();$('procurementSave').onclick=async function(){try{var next=procurementCopy();financeTransfer(next,{id:$('financeTransferId').value,date:$('financeTransferDate').value,kind:$('financeTransferKind').value,from_id:$('financeFrom').value,to_id:$('financeTo').value,amount:procurementMoney($('financeTransferAmount').value)});if(isDemo)procurementCommit(next);else await procurementCommit(next);closeModal();toast('資金移轉已登記，沒有重複增加成本','ok');}catch(e){toast(e.message,'err');}};closeModal();openModal('procurementModal');
}
function refreshFinanceDestination(){var kind=$('financeTransferKind').value==='card_repayment'?'card':'bank';$('financeTo').innerHTML=procurementHtmlOptions(procurementState.accounts.filter(function(a){return a.kind===kind;}));procurementDropdown('financeTo');}
function renderFinanceAccounts(){
  if(!$('financeAccounts'))return;if(procurementState.invalid){$('financeAccounts').textContent='資料異常，已停止寫入';return;}
  var state=procurementState;
  $('financeAccounts').innerHTML=state.accounts.map(function(a){var balance=financeAccountBalance(state,a.id,today()),bank=state.accounts.find(function(b){return b.id===a.debit_account_id;});return '<article class="card supplier-card"><div class="renewal-step-head"><h3>'+esc(a.name)+'</h3><span class="badge inactive">'+(a.kind==='card'?'信用卡':'銀行')+'</span></div><p class="finance-balance">'+(balance===null?'待設定／尚未起算':'NT$'+fmtN(balance/100))+'</p><p class="order-sub">'+(a.kind==='card'?'已登記營業卡款，含未出帳部分':'已登記資金試算，尚未含未登記收款')+'</p><p class="hint">'+(a.opening_date?'起算 '+esc(a.opening_date):'尚未設定期初')+(a.kind==='card'?' · 結帳 '+(a.close_day||'未設定')+' 日／繳款 '+(a.due_day||'未設定')+' 日 · 扣款帳戶 '+esc(bank?bank.name:'未指定'):'')+'</p><button class="btn sm ghost" data-action="financeAccount" data-id="'+productAttr(a.id)+'">帳戶／期初設定</button></article>';}).join('');
  var cards=state.payments.concat((state.cashEntries||[]).filter(function(e){return e.kind==='expense';})).filter(function(p){return state.accounts.some(function(a){return a.id===p.account_id&&a.kind==='card';});});
  $('financeCardPayments').innerHTML='<h3>營業刷卡紀錄</h3><p class="hint">帳期為交易日估算，尚非銀行核定帳單；期初卡款不分配到某張帳單，不把全部未繳款當本期到期應繳。</p><div class="table-scroll"><table><thead><tr><th>日期</th><th>信用卡</th><th>預估結帳月份</th><th class="text-right">營業刷卡金額</th></tr></thead><tbody>'+cards.slice().reverse().map(function(p){var a=state.accounts.find(function(a){return a.id===p.account_id;});return '<tr><td>'+esc(p.date)+'</td><td>'+esc(a.name)+'</td><td>'+esc(financeEstimatedCycle(p,a))+'</td><td class="text-right">'+fmtN(p.amount/100)+'</td></tr>';}).join('')+'</tbody></table></div>';
  $('financeTransferHistory').innerHTML='<h3>資金移轉紀錄</h3><div class="table-scroll"><table><thead><tr><th>日期</th><th>用途</th><th>來源 → 目的</th><th class="text-right">金額</th></tr></thead><tbody>'+(state.transfers||[]).slice().reverse().map(function(t){return '<tr><td>'+esc(t.date)+'</td><td>'+esc(t.kind==='card_repayment'?'實際繳卡費':'銀行間轉帳')+'</td><td>'+esc(state.accounts.find(function(a){return a.id===t.from_id;}).name)+' → '+esc(state.accounts.find(function(a){return a.id===t.to_id;}).name)+'</td><td class="text-right">'+fmtN(t.amount/100)+'</td></tr>';}).join('')+'</tbody></table></div>';
}
if(!procurementState.invalid){try{financeValidate(procurementState);}catch(error){procurementState={invalid:true};}}
