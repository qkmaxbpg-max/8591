/* Persist renewal, seat audit and ad history on the isolated database. */
(function(){
 if(window.LOCAL_TEST_CONFIG.demoOnly||!(window.LOCAL_TEST_CONFIG.environment==='production'&&location.origin===window.LOCAL_TEST_CONFIG.siteOrigin))return;
 window.operationsDatabaseEnabled=true;
 var orderBusy=false,adBusy=false,seatBusy=false,pendingOrder=null;
 function scope(){return String(userId)+'/'+String(storeId||'');}
 function queryScope(q){q=q.eq('user_id',userId);return storeId?q.eq('store_id',storeId):q.is('store_id',null);}
 window.operationsProject=function(){orders.forEach(function(o){o.preview_renewal_parent=o.renewal_parent_id||'';o.preview_purchase=o.purchase_kind==='first';});serviceAccounts.forEach(function(a){a.preview_seat_events=a.seat_events||[];});adConfigs.forEach(function(a){if(Array.isArray(a.periods))a.preview_periods=a.periods;});};
 var load=phase1Load;phase1Load=async function(){await load();operationsProject();};
 var localOrder=_doSaveOrder;
 _doSaveOrder=async function(obj,id){
  if(isDemo)return localOrder(obj,id);if(orderBusy)return;
  var stamp=scope(),button=document.querySelector('#orderModal .modal-foot .btn.primary');
  try{orderBusy=true;if(button)button.disabled=true;var original=id?orders.find(function(o){return o.id===id;}):null;if(id&&!original)throw new Error('找不到原訂單');
   obj=Object.assign({},obj,{user_id:userId});if(!id){obj.renewal_parent_id=previewRenewalParent||null;obj.purchase_kind=previewRenewalParent?'renewal':'first';var text=JSON.stringify(obj,function(key,value){return key==='order_no'?undefined:value;});if(!pendingOrder||pendingOrder.text!==text)pendingOrder={text:text,id:crypto.randomUUID()};obj.id=pendingOrder.id;}
   var request=id?queryScope(sb.from('orders').update(obj)).eq('id',id):sb.from('orders').insert(obj);if(id)request=original.updated_at?request.eq('updated_at',original.updated_at):request.is('updated_at',null);
   var result=await request.select('id').maybeSingle();
   if(!id&&result.error&&result.error.code==='23505'){var existing=await queryScope(sb.from('orders').select('*')).eq('id',obj.id).maybeSingle();if(!existing.error&&existing.data&&Object.keys(obj).every(function(k){return k==='order_no'?/^MWJ-\d+$/.test(existing.data[k]):existing.data[k]===obj[k];}))result={data:{id:obj.id},error:null};}
   if(result.error||!result.data)throw new Error('訂單未確認儲存成功；可能已被修改、重複續約或座位衝突。請重新讀取確認');
   if(scope()!==stamp)throw new Error('已送出，但店舖已切換，請重新讀取確認');pendingOrder=null;previewRenewalParent='';closeModal();loadAll();toast('訂單與續約關聯已儲存','ok');
  }catch(e){toast(e.message,'err');}finally{orderBusy=false;if(button)button.disabled=false;}
 };
 var localRelease=requestSeatRelease,localUndo=requestSeatReleaseUndo;
 async function saveSeat(accountId,seat,undo){if(seatBusy)return;seatBusy=true;var stamp=scope();try{var result=await sb.rpc('mwj_seat_event',{p_account:accountId,p_seat:Number(seat),p_undo:undo||null});if(result.error)throw new Error('座位已改變或無法儲存，請重新載入確認');if(stamp!==scope())throw new Error('店舖已切換，請重新讀取');var account=getSvcAccount(accountId);account.seat_events=result.data;account.preview_seat_events=result.data;renderAll();renderAccountManager();toast(undo?'已撤銷移除紀錄':'已記錄移除，原訂單保留','ok');}catch(e){toast(e.message,'err');}finally{seatBusy=false;}}
 requestSeatRelease=function(accountId,seat){if(isDemo)return localRelease(accountId,seat);var state=getSeatStatus(accountId).find(function(s){return s.seat===Number(seat);});if(!state)return;confirmAction('確認你已在平台移除「'+state.customer+'」？這裡只記錄移除，不會操作外部平台；後續預約會保留。',function(){closeModal();saveSeat(accountId,seat,null);});};
 requestSeatReleaseUndo=function(accountId,eventId){if(isDemo)return localUndo(accountId,eventId);var account=getSvcAccount(accountId),event=account&&(account.preview_seat_events||[]).find(function(e){return e.id===eventId;});if(!event)return;confirmAction('撤銷這筆移除紀錄？已有新安排時會阻擋。',function(){closeModal();saveSeat(accountId,event.seat,eventId);});};
 window.operationsSaveAd=async function(next,old){if(adBusy)throw new Error('廣告正在儲存');var stamp=scope();adBusy=true;try{var payload={id:next.id,user_id:userId,store_id:storeId||null,platform:next.platform,daily_cost:next.daily_cost,start_date:next.start_date,end_date:next.end_date,active:next.active,notes:next.notes||'',periods:next.preview_periods};var request=old?queryScope(sb.from('ad_configs').update(payload)).eq('id',old.id).eq('revision',old.revision||1):sb.from('ad_configs').insert(payload);var result=await request.select('*').maybeSingle();if(result.error||!result.data)throw new Error('廣告未確認儲存成功，請重新讀取以免覆蓋歷史');if(stamp!==scope())throw new Error('店舖已切換，請重新讀取');var saved=result.data;saved.preview_periods=saved.periods;var index=adConfigs.findIndex(function(c){return c.id===saved.id;});if(index>=0)adConfigs[index]=saved;else adConfigs.unshift(saved);closeModal();renderAll();toast('廣告期間與暫停狀態已儲存','ok');}finally{adBusy=false;}};
})();
