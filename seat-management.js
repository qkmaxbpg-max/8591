/* Seat release audit trail is local preview metadata, never a platform action. */
function seatOrders(accountId, seat) {
  return orders.filter(function(o){return String(o.service_account_id)===String(accountId) && Number(o.seat_number)===Number(seat) && o.status!=='已取消' && o.status!=='已退款';});
}
function seatReleaseEvents(account) { return (account.preview_seat_events || []).filter(function(e){return !e.undone_at;}); }
function getSeatStatus(accountId) {
  var account=serviceAccounts.find(function(a){return String(a.id)===String(accountId);});if(!account)return [];
  var result=[],date=today();
  for(var seat=1;seat<=account.max_seats;seat++) {
    var assigned=seatOrders(accountId,seat),events=seatReleaseEvents(account).filter(function(e){return e.seat===seat;});
    var released=new Set();events.forEach(function(e){e.order_ids.forEach(function(id){released.add(String(id));});});
    var remaining=assigned.filter(function(o){return !released.has(String(o.id));});
    var current=remaining.filter(function(o){return o.status==='已完成' && (o.start_date||o.order_date||'9999')<=date && o.expiry_date && o.expiry_date>=date;}).sort(function(a,b){return (b.start_date||b.order_date||'').localeCompare(a.start_date||a.order_date||'');});
    var upcoming=remaining.filter(function(o){return o.status!=='已完成' || (o.start_date||o.order_date||'')>date || !o.expiry_date;}).sort(function(a,b){return (a.start_date||a.order_date||'').localeCompare(b.start_date||b.order_date||'');});
    var expired=remaining.filter(function(o){return o.status==='已完成' && o.expiry_date && o.expiry_date<date;}).sort(function(a,b){return b.expiry_date.localeCompare(a.expiry_date);});
    var ref=current[0]||expired[0]||upcoming[0]||null;
    result.push({seat:seat,status:current.length?'occupied':expired.length?'expired':upcoming.length?'reserved':'empty',order:ref,customer:ref?getCustomerName(ref.customer_id):'',expiry:ref?ref.expiry_date||'':'',days_left:ref&&ref.expiry_date?Math.ceil((Date.parse(ref.expiry_date+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000):0,renewal:upcoming[0]||null,release_event:events[events.length-1]||null});
  }
  return result;
}
function applySeatRelease(accountId,seat) {
  if(!isDemo)throw new Error('座位釋放目前僅供本機預覽，未開放正式寫入');
  var account=getSvcAccount(accountId),state=getSeatStatus(accountId).find(function(s){return s.seat===Number(seat);});
  if(!account||!state||state.status!=='expired')throw new Error('只能釋放已到期待移除的座位，請重新確認');
  var assigned=seatOrders(accountId,seat),ids=assigned.filter(function(o){return o.status==='已完成' && o.expiry_date && o.expiry_date<today();}).map(function(o){return String(o.id);});
  account.preview_seat_events=account.preview_seat_events||[];
  account.preview_seat_events.push({id:'seat-release-'+Date.now()+'-'+Math.random().toString(16).slice(2),seat:Number(seat),order_ids:ids,known_order_ids:assigned.map(function(o){return String(o.id);}),customer_name:state.customer,order_no:state.order.order_no||'',released_at:new Date().toISOString(),undone_at:null});
}
function applySeatReleaseUndo(accountId,eventId) {
  if(!isDemo)throw new Error('撤銷釋放目前僅供本機預覽');
  var account=getSvcAccount(accountId),event=account&&(account.preview_seat_events||[]).find(function(e){return e.id===eventId && !e.undone_at;});
  if(!event)throw new Error('找不到可撤銷的釋放紀錄');
  var assigned=seatOrders(accountId,event.seat),state=getSeatStatus(accountId).find(function(s){return s.seat===event.seat;});
  if(assigned.some(function(o){return !event.known_order_ids.includes(String(o.id));}) || state.status==='occupied')throw new Error('座位已有新安排或開始使用，不能直接撤銷；請先核對座位紀錄');
  event.undone_at=new Date().toISOString();
}
function requestSeatRelease(accountId,seat) {
  var state=getSeatStatus(accountId).find(function(s){return s.seat===Number(seat);});if(!state)return;
  confirmAction('確認你已在平台移除「'+state.customer+'」？此操作只記錄移除並釋放座位，不會替你操作平台。'+(state.renewal?' 此席仍有後續預約，釋放後會保留預約，不會標為空位。':''),function(){
    try{applySeatRelease(accountId,seat);demoSave();closeModal();renderAll();renderAccountManager();toast('已記錄移除，歷史訂單保持不變','ok');}catch(e){toast(e.message,'err');}
  });
}
function requestSeatReleaseUndo(accountId,eventId) {
  confirmAction('撤銷這次釋放紀錄？若已有新安排，將阻擋撤銷。',function(){try{applySeatReleaseUndo(accountId,eventId);demoSave();closeModal();renderAll();renderAccountManager();toast('已撤銷釋放，恢復待移除標示','ok');}catch(e){toast(e.message,'err');}});
}
function seatActionButton(label,action,accountId,value) {
  return '<button class="btn sm ghost'+(action==='releaseSeat'?' seat-remove-action':'')+'" data-action="'+action+'" data-id="'+productAttr(accountId)+'" data-seat-value="'+productAttr(value)+'">'+label+'</button>';
}
function renderSeatState(state,accountId) {
  var h='';
  if(state.status==='expired')h+='<div class="seat-expiry text-yellow">已到期，待確認在平台移除</div>';
  if(state.status==='reserved')h+='<div class="seat-customer">已保留座位</div>';
  if(state.renewal)h+='<div class="seat-expiry"><span class="seat-badge green">'+(state.renewal.status==='已完成'?'已預約':'待確認預約')+'</span> '+esc(getCustomerName(state.renewal.customer_id))+' · '+esc(state.renewal.start_date||state.renewal.order_date||'日期待填')+' → '+esc(state.renewal.expiry_date||'未設定')+'</div>';
  if(state.release_event)h+='<div class="seat-release-note">已確認移除 '+esc(state.release_event.customer_name)+' · '+esc(state.release_event.released_at.slice(0,10))+'</div>';
  return h;
}
function renderSeatActions(state,accountId) {
  var h='';
  if(state.status==='expired')h+=seatActionButton('移除','releaseSeat',accountId,state.seat);
  if(state.status==='reserved' && state.renewal)h+='<button class="btn sm ghost" data-action="orderDetail" data-id="'+productAttr(state.renewal.id)+'">查看預約</button>';
  if(state.release_event && state.status!=='occupied')h+=seatActionButton('撤銷釋放','undoSeatRelease',accountId,state.release_event.id);
  return h;
}
function seatReleaseHistory(account) {
  var events=account.preview_seat_events||[];if(!events.length)return '';
  return '<details class="subscription-history-details"><summary>'+esc(account.email)+' · 移除紀錄（'+events.length+'）</summary><div class="subscription-history-scroll"><table><thead><tr><th>座位／原客戶</th><th>原訂單</th><th>確認移除時間（台北）</th><th>狀態</th></tr></thead><tbody>'+events.slice().reverse().map(function(e){return '<tr><td>使用者'+e.seat+' · '+esc(e.customer_name)+'</td><td>'+esc(e.order_no)+'</td><td>'+esc(new Date(e.released_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}))+'</td><td>'+esc(e.undone_at?'已撤銷 · '+new Date(e.undone_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'已確認移除')+'</td></tr>';}).join('')+'</tbody></table></div></details>';
}
