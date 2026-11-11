/* Shared financial state, optimistic locking, and retained correction events. */
var FINANCE_COLLECTIONS=['suppliers','accounts','purchases','payments','allocations','defaults','transfers','cashEntries','platformMonths','afterSales','supplierCredits','settings'];
function financeStartDate(state){var row=(state.settings||[]).find(function(x){return x.id==='accounting';});return row&&row.start_date||'';}
function financeChanges(before,after){var changes={};FINANCE_COLLECTIONS.forEach(function(k){var a=before[k]||[],b=after[k]||[];if(JSON.stringify(a)===JSON.stringify(b))return;changes[k]=k==='allocations'?{before:a,after:b}:{before:a.filter(function(x){return !b.some(function(y){return JSON.stringify(x)===JSON.stringify(y);});}),after:b.filter(function(x){return !a.some(function(y){return JSON.stringify(x)===JSON.stringify(y);});})};});return changes;}
function financeReverseChanges(current,changes){
 var next=JSON.parse(JSON.stringify(current));
 Object.keys(changes).forEach(function(k){if(!FINANCE_COLLECTIONS.includes(k))throw new Error('更正資料格式不正確');var patch=changes[k],rows=next[k]||[];
  if(k==='allocations'){if(JSON.stringify(rows)!==JSON.stringify(patch.after))throw new Error('這筆已有後續抵扣，請先處理後續紀錄');next[k]=JSON.parse(JSON.stringify(patch.before));return;}
  function key(row){return row.id||row.product_id;}
  patch.after.forEach(function(row){var saved=rows.find(function(x){return key(x)===key(row);});if(!saved||JSON.stringify(saved)!==JSON.stringify(row))throw new Error('這筆已有後續修改，不能直接撤回');});
  patch.before.forEach(function(row){if(rows.some(function(x){return key(x)===key(row);})&&!patch.after.some(function(x){return key(x)===key(row);}))throw new Error('更正會覆蓋後續資料，已停止');});
  next[k]=rows.filter(function(row){return !patch.after.some(function(x){return key(x)===key(row);});}).concat(JSON.parse(JSON.stringify(patch.before)));
 });
 if(financeStartDate(current)!==financeStartDate(next)&&['purchases','payments','cashEntries','transfers','platformMonths','supplierCredits'].some(function(k){return (next[k]||[]).length;}))throw new Error('已有往來，不可撤回或改寫財務起算日');
 procurementValidateState(next);return next;
}
(function(){
 var database=!window.LOCAL_TEST_CONFIG.demoOnly&&(window.LOCAL_TEST_CONFIG.environment==='production'&&location.origin===window.LOCAL_TEST_CONFIG.siteOrigin);
 window.financeDatabaseEnabled=database;
 var row=null,scope='',writing=false,pending=null,history=[],localReason='',localReverse=null;
 var labels={suppliers:'廠商',accounts:'帳戶',purchases:'採購',payments:'付款',allocations:'抵扣',defaults:'商品預設',transfers:'轉帳／卡費',cashEntries:'收支',platformMonths:'平台撥款',afterSales:'售後',supplierCredits:'廠商補償',settings:'財務起算日'};
 function identity(){return String(userId)+'/'+String(storeId||'');}
 function empty(){return {version:1,suppliers:[{id:'walnut',name:'胡桃',kind:'串流平台',active:true},{id:'chenglong',name:'宬龍',kind:'串流平台',active:true},{id:'salmon',name:'鮭魚',kind:'遊戲代儲',active:true},{id:'taobao',name:'淘寶',kind:'海外採購',active:true},{id:'official',name:'官方平台',kind:'海外採購',active:true}],accounts:[],purchases:[],payments:[],allocations:[],defaults:[],transfers:[],cashEntries:[],platformMonths:[],afterSales:[],supplierCredits:[]};}
 function scoped(query){query=query.eq('user_id',userId);return storeId?query.eq('store_id',storeId):query.is('store_id',null);}
 window.financeWriteBusy=function(){return writing;};
 window.openFinanceStart=function(){var start=financeStartDate(procurementState)||'2026-11-01';$('procurementModalTitle').textContent='設定財務起算日';$('procurementForm').innerHTML=procurementField('從哪一天開始記這套帳？','financeStartDate','<input id="financeStartDate" type="date" value="'+start+'">')+'<p class="hint">舊訂單保留。報表只計起算日後的服務與交易；銀行、卡款及廠商餘額另填期初。已有採購或收付款後不可直接改日期。</p>';$('procurementSave').onclick=async function(){try{var date=$('financeStartDate').value;procurementValidateDate(date);if(['purchases','payments','cashEntries','transfers','platformMonths','supplierCredits'].some(function(k){return (procurementState[k]||[]).length;})&&date!==financeStartDate(procurementState))throw new Error('已有往來，不可直接改起算日');var next=procurementCopy();next.settings=[{id:'accounting',start_date:date}];if(isDemo)procurementCommit(next);else await procurementCommit(next);closeModal();toast('財務起算日已儲存，舊訂單保留','ok');}catch(e){toast(e.message,'err');}};closeModal();openModal('procurementModal');};

 window.financeDefaultsPlan=function(prefix,items){
  if(!database||isDemo||scope!==identity()||writing)throw new Error('請等待財務資料載入完成');
  validatePurchaseDefaults(prefix);var supplier=$(prefix+'_source').value,account=$(prefix+'_payAccount').value,mode=$(prefix+'_purchaseMode').value;
  if(supplier&&(!procurementState.suppliers.some(function(x){return x.id===supplier&&x.active;})||(account&&!procurementState.accounts.some(function(x){return x.id===account;}))||!['individual','shared'].includes(mode)))throw new Error('採購預設的貨源或帳戶無效');
  var next=JSON.parse(JSON.stringify(procurementState)),sameBatch=prefix==='pb'&&productBatchEditing&&productBatchEditing.defaults===productBatchDefaultsSignature();
  items.forEach(function(p){var existing=next.defaults.find(function(d){return d.product_id===String(p.id);});if(sameBatch&&products.some(function(x){return x.id===p.id;}))return;next.defaults=next.defaults.filter(function(d){return d.product_id!==String(p.id);});if(supplier)next.defaults.push({product_id:String(p.id),supplier_id:supplier,mode:mode,...(account?{account_id:account}:{})});});
  return JSON.stringify(next)===JSON.stringify(procurementState)?null:next;
 };
 window.financeSaveRevision=function(){return row?row.revision:0;};
 window.financeAcceptProductSave=function(result){if(result){row={revision:result.revision,payload:result.payload};procurementState=result.payload;}};

 window.financeDatabaseLoad=async function(){var stamp=identity(),result=await scoped(sb.from('mwj_finance_state').select('*')).maybeSingle();if(result.error)throw new Error('財務資料讀取失敗，未改用本機舊資料');if(stamp!==identity())return;row=result.data;scope=stamp;pending=null;var data=row?row.payload:empty();procurementValidateState(data);procurementState=data;};
 window.financeDatabaseCommit=function(next,reason,reverses){
  if(!financeStartDate(next)&&['purchases','payments','cashEntries','transfers','platformMonths','supplierCredits'].some(function(k){return (next[k]||[]).length;}))return Promise.reject(new Error('請先到財務設定選擇起算日'));
  if(writing)return Promise.reject(new Error('財務正在儲存，請勿重複送出'));
  if(!database||isDemo||!userId||scope!==identity())return Promise.reject(new Error('財務資料尚未載入，請重新整理'));
  procurementValidateState(next);var text=JSON.stringify(next),stamp=scope;
  if(!pending||pending.text!==text)pending={text:text,id:crypto.randomUUID(),revision:row?row.revision:0};
  writing=true;if($('procurementSave'))$('procurementSave').disabled=true;
  return sb.rpc('mwj_commit_finance',{p_store:storeId||null,p_payload:next,p_revision:pending.revision,p_operation:pending.id,p_reason:reason||$('procurementModalTitle').textContent||'日常記帳',p_reverses:reverses||null}).then(function(result){
   if(result.error)throw new Error('財務未確認儲存成功；可能有資料衝突或連線問題。請重新讀取核對，不要重建同一筆');
   if(identity()!==stamp)throw new Error('已送出，但店舖已切換，請重新讀取確認');
   row={revision:result.data.revision,payload:result.data.payload};procurementState=result.data.payload;pending=null;renderProcurement();return result.data;
  }).finally(function(){writing=false;if($('procurementSave'))$('procurementSave').disabled=false;});
 };
 window.financeLocalAudit=function(before,after){var events=JSON.parse(localStorage.getItem('preview-finance-history-v1')||'[]'),changes=financeChanges(before,after);if(!Object.keys(changes).length)return;events.push({id:procurementId(),reason:localReason||($('procurementModalTitle')&&$('procurementModalTitle').textContent)||'日常記帳',changes:changes,reverses:localReverse,created_at:new Date().toISOString(),revision:events.length+1});localStorage.setItem('preview-finance-history-v1',JSON.stringify(events));};
 async function readHistory(){if(isDemo)return JSON.parse(localStorage.getItem('preview-finance-history-v1')||'[]').reverse();if(!database||scope!==identity())throw new Error('請先載入財務資料');var result=await scoped(sb.from('mwj_finance_events').select('id,revision,reason,changes,reverses,created_at')).order('revision',{ascending:false}).limit(100);if(result.error)throw new Error('無法載入入帳歷程');return result.data;}
 window.openFinanceHistory=async function(){
  try{history=await readHistory();$('procurementModalTitle').textContent='入帳歷程／更正錯帳';$('procurementForm').innerHTML='<p class="hint">保留原紀錄與更正原因。撤回後重新輸入正確資料；已有後續付款、抵扣或修改時會阻擋，避免帳目斷開。顯示最近 100 筆。</p>'+history.map(function(e){var changed=Object.keys(e.changes).map(function(k){return labels[k]||k;}).join('、'),reversed=history.some(function(x){return x.reverses===e.id;});return '<article class="card finance-section"><strong>'+esc(e.reason)+'</strong><p class="hint">'+esc(new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(e.created_at)))+' · '+esc(changed)+'</p><button class="btn sm ghost" '+(reversed?'disabled':'')+' data-finance-correction="'+productAttr(e.id)+'">'+(reversed?'已更正':'撤回並更正')+'</button></article>';}).join('');$('procurementForm').onclick=function(event){var button=event.target.closest('[data-finance-correction]');if(button)openFinanceCorrection(button.dataset.financeCorrection);};$('procurementSave').hidden=true;closeModal();openModal('procurementModal');}catch(e){toast(e.message,'err');}
 };
 window.openFinanceCorrection=function(id){var event=history.find(function(e){return e.id===id;});if(!event)return;try{financeReverseChanges(procurementState,event.changes);}catch(e){return toast(e.message,'err');}
  $('procurementModalTitle').textContent='撤回這次入帳';$('procurementForm').onclick=null;$('procurementForm').innerHTML='<p>'+esc(event.reason)+'</p>'+procurementField('更正原因（必填）','financeCorrectionReason','<input id="financeCorrectionReason" placeholder="例如金額輸入錯誤，撤回後重新登記">')+'<p class="hint">只更正帳目，不執行退款、轉帳或撤銷外部交易。原入帳紀錄仍保留。</p>';$('procurementSave').hidden=false;
  $('procurementSave').onclick=async function(){try{var reason=$('financeCorrectionReason').value.trim();if(!reason)throw new Error('請填寫更正原因');var next=financeReverseChanges(procurementState,event.changes);if(isDemo){localReason='更正：'+reason;localReverse=id;try{procurementCommit(next);}finally{localReason='';localReverse=null;}}else await financeDatabaseCommit(next,'更正：'+reason,id);closeModal();toast('已更正，原紀錄保留；請重新登記正確資料','ok');}catch(e){toast(e.message,'err');}};
 };
 // Reset the shared modal's history-only controls before every ordinary form.
 var originalOpenModal=openModal;openModal=function(id){if(id==='procurementModal'&&$('procurementModalTitle').textContent!=='入帳歷程／更正錯帳'){$('procurementSave').hidden=false;$('procurementForm').onclick=null;}return originalOpenModal(id);};
})();
