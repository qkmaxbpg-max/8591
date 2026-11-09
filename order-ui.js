/* Order presentation. Uses stored order values; never recalculates old rows. */
var previewRenewalParent = '';
function renewalFamily(order) {
  var root=order,seen=new Set();
  while(root.preview_renewal_parent && !seen.has(String(root.id))) {
    seen.add(String(root.id));
    var parent=orders.find(function(o){return String(o.id)===String(root.preview_renewal_parent);});
    if(!parent)break;root=parent;
  }
  var result=[],queue=[root],visited=new Set();
  while(queue.length) {
    var current=queue.shift();if(visited.has(String(current.id)))continue;
    visited.add(String(current.id));result.push(current);
    orders.filter(function(o){return String(o.preview_renewal_parent || '')===String(current.id);}).forEach(function(o){queue.push(o);});
  }
  return result;
}
function renewalLabel(order) {
  if(!order.preview_renewal_parent)return order.preview_purchase ? '首購' : '';
  var count=0,current=order,seen=new Set();
  while(current && current.preview_renewal_parent && !seen.has(String(current.id))) {
    seen.add(String(current.id));count++;current=orders.find(function(o){return String(o.id)===String(current.preview_renewal_parent);});
  }
  return '第 '+count+' 次續約';
}
function renewalTimeline(order) {
  var family=renewalFamily(order);
  if(family.length<2 && !order.preview_purchase)return '<p class="hint">此訂單尚無已確認的前後期關聯，不按客戶或商品名稱猜測。</p>';
  return '<h4>續約歷程 · '+family.length+' 期</h4><ol class="renewal-timeline">'+family.map(function(o){
    return '<li class="'+(String(o.id)===String(order.id)?'current':'')+'"><div class="renewal-step-head"><strong>'+esc(renewalLabel(o)||'前期訂單')+'</strong><span>'+statusBadge(o.status)+'</span></div><p>'+esc(o.order_no || '')+' · '+esc(o.platform || '')+' · '+esc(o.duration || '')+'</p><p class="order-sub">服務期間 '+esc(o.start_date || '未設定')+' → '+esc(o.expiry_date || '未設定')+' ｜ NT$'+fmtN((o.qty||1)*(o.unit_price||0))+'</p><button class="btn sm ghost" data-action="orderDetail" data-id="'+productAttr(o.id)+'">'+(String(o.id)===String(order.id)?'目前查看':'查看此期')+'</button></li>';
  }).join('')+'</ol>';
}
function subscriptionPhase(o) {
  if (o.status === '已取消' || o.status === '已退款') return o.status;
  if (o.status !== '已完成') return '待確認開通';
  if ((o.start_date || o.order_date || '') > today()) return '已排程續期';
  if (o.expiry_date && o.expiry_date < today()) return '已到期';
  return '目前使用中';
}
function renderSubscriptionRenewals(filter,q) {
  var families=[],seen=new Set();
  orders.forEach(function(o){
    if(!o.preview_renewal_parent)return;
    var family=renewalFamily(o),key=String(family[0].id);if(typeof categoryMatches==='function' && !family.some(function(row){return categoryMatches(row.platform,categoryFilter || 'all');}))return;if(seen.has(key))return;seen.add(key);
    var match=family.some(function(row){
      var phase=subscriptionPhase(row);
      if(filter==='active')return phase==='目前使用中';
      if(filter==='expiring')return phase==='目前使用中' && row.expiry_date && row.expiry_date<=adShiftDate(today(),7);
      if(filter==='expired')return phase==='已到期';
      return true;
    });
    var text=family.map(function(row){return [row.order_no,row.platform,row.version,row.duration,getCustomerName(row.customer_id),row.notes].join(' ');}).join(' ').toLowerCase();
    if(match && (!q || text.includes(q)))families.push(family);
  });
  $('subsRenewalHistory').innerHTML=families.map(function(family){
    var current=family.find(function(o){return subscriptionPhase(o)==='目前使用中';});
    var focus=current || family[family.length-1];
    var upcoming=family.filter(function(o){var phase=subscriptionPhase(o);return phase==='待確認開通'||phase==='已排程續期';}).sort(function(a,b){return (a.start_date||'').localeCompare(b.start_date||'');});
    var next=upcoming[0];
    function action(o,label){return '<button class="btn sm ghost" data-action="orderDetail" data-id="'+productAttr(o.id)+'">'+label+'</button>';}
    var summary='<div class="subscription-current"><div><span class="order-sub">'+(current?'目前使用中':'最近一期 · '+esc(subscriptionPhase(focus)))+'</span><p class="subscription-dates">'+esc(focus.start_date||'未設定')+' <span>→</span> '+esc(focus.expiry_date||'未設定')+'</p><p class="order-sub">'+esc(renewalLabel(focus)||'前期訂單')+' · '+esc(focus.version||'')+' · '+esc(focus.duration||'')+'</p></div>'+action(focus,'查看此期')+'</div>';
    if(next && (!current || next.id!==current.id))summary+='<div class="subscription-next"><div><span class="badge inactive">'+esc(subscriptionPhase(next))+'</span> <span>'+esc(next.start_date||'日期待確認')+' → '+esc(next.expiry_date||'日期待確認')+'</span>'+(upcoming.length>1?'<span class="order-sub"> · 共 '+upcoming.length+' 期待處理／排程</span>':'')+'</div>'+action(next,'查看下一期')+'</div>';
    return '<section class="card subscription-history"><div class="card-head"><div><h3>'+esc(getCustomerName(focus.customer_id)||'未指定客戶')+' · '+esc(focus.platform)+'</h3><p class="order-sub">共 '+family.length+' 期 · 每期訂單獨立保留</p></div></div><div class="subscription-history-body">'+summary+'<details class="subscription-history-details"><summary>查看完整續約紀錄 <span>'+family.length+' 期</span></summary><div class="subscription-history-scroll" tabindex="0" role="region" aria-label="續約紀錄"><table class="subscription-history-table"><thead><tr><th>期別／單號</th><th>服務期間</th><th>狀態</th><th class="text-right">金額</th><th>操作</th></tr></thead><tbody>'+family.slice().reverse().map(function(o){var phase=subscriptionPhase(o);return '<tr class="'+(phase==='目前使用中'?'current':'')+'"><td><strong>'+esc(renewalLabel(o)||'前期訂單')+'</strong><div class="order-sub">'+esc(o.order_no||'')+'</div></td><td>'+esc(o.start_date||'未設定')+' → '+esc(o.expiry_date||'未設定')+'</td><td>'+esc(phase)+'</td><td class="text-right">NT$'+fmtN((o.qty||1)*(o.unit_price||0))+'</td><td>'+action(o,'詳情')+'</td></tr>';}).join('')+'</tbody></table></div><p class="hint">最新期別在上方。待確認開通不代表已開始提供服務。</p></details></div></section>';
  }).join('');
  return families.length;
}
function orderUiRows() {
  var q = ($('orderSearch').value || '').trim().toLowerCase();
  return orders.filter(function(o) {
    if ($('orderStatusFilter').value && o.status !== $('orderStatusFilter').value) return false;
    if ($('orderChannelFilter').value && (o.channel || '8591') !== $('orderChannelFilter').value) return false;
    if (!mpIsAll('mpOrders')) {
      var date = o.order_date || '';
      if (mpIsYear('mpOrders') ? date.slice(0, 4) !== mpGetYear('mpOrders') : date.slice(0, 7) !== mpGetYM('mpOrders')) return false;
    }
    return !q || [o.order_no, o.platform, o.version, o.duration, o.notes, getAgentName(o.agent_id), getCustomerName(o.customer_id)].join(' ').toLowerCase().includes(q);
  }).sort(function(a,b) { return (b.order_date || '').localeCompare(a.order_date || '') || (b.order_no || '').localeCompare(a.order_no || ''); });
}
function orderExpiryLabel(o) {
  if (!o.expiry_date) return '未設定到期日';
  if (o.status !== '已完成') return '';
  var remaining = Math.ceil((Date.parse(o.expiry_date + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')) / 86400000);
  if (!Number.isFinite(remaining)) return '請確認日期';
  return remaining < 0 ? '已到期' : remaining === 0 ? '今天到期' : '剩餘 ' + remaining + ' 天';
}
function renderOrders() {
  var list = orderUiRows();
  $('orderResults').textContent = '符合條件 ' + list.length + ' 筆｜點「詳情」查看成本、手續費與備註';
  if (!list.length) { $('orderList').innerHTML = '<div class="empty"><div class="icon">📋</div><p>' + (orders.length ? '沒有符合條件的訂單，請調整月份或篩選' : '尚無訂單，從新增訂單開始') + '</p></div>'; return; }
  var h = '<div class="table-scroll"><table class="orders-table"><thead><tr><th>訂單／日期</th><th>客戶／管道</th><th>商品／方案</th><th class="text-right">訂單金額</th><th>狀態</th><th>到期日</th><th class="sticky-col">操作</th></tr></thead><tbody>';
  list.forEach(function(o) {
    h += '<tr><td><strong>' + esc(o.order_no || '未編號') + '</strong>' + (renewalLabel(o) ? '<div class="renewal-label '+(o.preview_renewal_parent?'is-renewal':'')+'">'+esc(renewalLabel(o))+'</div>' : '') + '<div class="order-sub">' + esc(o.order_date || '') + '</div>' + (o.preview_renewal_parent ? '<div class="order-sub">接續 '+esc((orders.find(function(p){return String(p.id)===String(o.preview_renewal_parent);}) || {}).order_no || '前期訂單')+'</div>' : '') + '</td>' +
      '<td>' + esc(getCustomerName(o.customer_id) || '未指定客戶') + '<div class="order-sub">' + channelBadge(o.channel) + '</div></td>' +
      '<td><strong>' + esc(o.platform || '') + '</strong><div class="order-sub">' + esc([o.version, o.duration].filter(Boolean).join(' · ') || '未指定方案') + ' · ' + esc(String(o.qty || 1)) + ' 件</div></td>' +
      '<td class="text-right">NT$' + fmtN((o.qty || 1) * (o.unit_price || 0)) + '</td><td>' + statusBadge(o.status) + '</td>' +
      '<td>' + esc(o.expiry_date || '—') + '<div class="order-sub">' + esc(orderExpiryLabel(o)) + '</div></td>' +
      '<td class="sticky-col"><div class="act-group"><button class="act-btn" data-action="orderDetail" data-id="' + productAttr(o.id) + '">詳情</button><button class="act-btn edit" data-action="editOrder" data-id="' + productAttr(o.id) + '">編輯</button></div></td></tr>';
  });
  $('orderList').innerHTML = h + '</tbody></table></div>';
}
function openOrderDetail(id) {
  var o = orders.find(function(row) { return String(row.id) === String(id); }); if (!o) return;
  var p = orderProfit(o);
  function field(label, value) { return '<div><dt>' + esc(label) + '</dt><dd>' + esc(String(value == null || value === '' ? '—' : value)) + '</dd></div>'; }
  $('orderDetailTitle').textContent = o.order_no || '訂單詳情';
  $('orderDetailBody').innerHTML = renewalTimeline(o) + '<h4>訂單內容</h4><dl class="order-detail-grid">' +
    field('客戶', getCustomerName(o.customer_id)) + field('出單人', getAgentName(o.agent_id)) + field('商品', o.platform) + field('方案／期間', [o.version,o.duration].filter(Boolean).join(' · ')) + field('下單日期',o.order_date) + field('訂閱開始',o.start_date) + field('到期日期',o.expiry_date) + field('狀態',o.status) + '</dl>' +
    '<h4>成交金額</h4><dl class="order-detail-grid">' + field('數量',o.qty || 1) + field('售價／件','NT$' + fmtN(o.unit_price || 0)) + field('訂單金額','NT$' + fmtN(p.rev)) + field('成本合計','NT$' + fmtN(p.cost)) + field('手續費（訂單費率）','NT$' + fmtN(p.fee)) + field('訂單試算利潤','NT$' + fmtN(p.profit)) + '</dl><p class="hint">試算沿用目前系統算法，尚未反映分期收入認列與退款調整。</p>' +
    '<h4>備註</h4><p class="order-detail-note">' + esc(o.notes || '無備註') + '</p>' +
    '<div class="order-service-plan"><h4>續約與售後</h4><p>續約會建立新一期；預設接原到期日，已到期則從今天開始，日期可修改。</p>' +
    (o.status === '已完成' ? '<button class="btn sm primary" data-action="renewOrder" data-id="' + productAttr(o.id) + '">建立續約訂單</button>' : '<p class="hint">此訂單尚非已完成狀態，請先確認服務情況。</p>') +
    '<p class="hint">每期金額、日期與前後期關聯分開保留；不覆蓋舊訂單。</p><h4>無法使用與售後</h4><p>記錄無法使用日期與原因；每筆自行輸入退款金額，另記供應商補償。</p><p class="hint">登記退款、待退款與實際退付分開。請由下方「售後處理」登記；系統不執行轉帳。</p></div>';
  $('orderDetailActions').innerHTML = '<button class="btn ghost" data-action="afterSale" data-id="'+productAttr(o.id)+'">售後處理</button><button class="btn ghost" data-action="createProcurement" data-id="'+productAttr(o.id)+'">帶入採購</button><button class="btn ghost" onclick="closeModal()">關閉</button>' + (!o.product_id ? '<button class="btn ghost" data-action="saveCommonProduct" data-id="' + productAttr(o.id) + '">存成常用商品</button>' : '') + '<button class="btn ghost" data-action="deleteOrder" data-id="' + productAttr(o.id) + '">刪除訂單</button><button class="btn primary" data-action="editOrder" data-id="' + productAttr(o.id) + '">編輯訂單</button>';
  closeModal(); openModal('orderDetailModal');
}
function initOrderProductChoices(item) {
  var selected = item && products.find(function(p) { return String(p.id) === String(item.product_id); });
  var platform = selected ? selected.platform : item ? item.platform || '' : '';
  var names = Array.from(new Set(products.filter(function(p) { return p.status === '啟用' && categoryMatches(p.platform,$('orderCategoryFilter').value || 'all'); }).map(function(p) { return p.platform; })));
  if (platform && !names.includes(platform)) names.push(platform);
  cdropInit('om_platformDrop', {items:names.sort().map(function(name) { return {value:name,label:name}; }), value:platform, placeholder:'先選擇商品', onSelect:function(value) {
    $('om_product').value = ''; initOrderPlanChoices(value, '', null);
    $('om_unitPrice').value = ''; $('om_unitCost').value = ''; dpSetVal('om_expiry',''); $('om_seatGroup').style.display = 'none'; $('om_svcAcct').value = ''; $('om_seat').value = ''; calcOrderPreview();
  }});
  initOrderPlanChoices(platform, item ? String(item.product_id || '') : '', item);
  $('om_product').value = item ? item.product_id || '' : '';
}
function initOrderPlanChoices(platform, selected, original) {
  var items = products.filter(function(p) { return p.platform === platform && (p.status === '啟用' || String(p.id) === selected); }).sort(compareProductPlans).map(function(p) {
    return {value:String(p.id), label:[p.version || '標準方案',p.duration].filter(Boolean).join(' · '), tag:'NT$' + fmtN(p.price), sub:p.status === '啟用' ? '' : '歷史停用方案'};
  });
  if (selected && !items.some(function(p) {return p.value === selected;}) && original) items.push({value:selected,label:[original.version, original.duration].filter(Boolean).join(' · ') || '歷史方案',sub:'沿用原訂單紀錄'});
  cdropInit('om_productDrop',{items:items,value:selected,placeholder:platform ? '再選擇方案與期間' : '請先選商品',onSelect:function(value) {$('om_product').value=value; onProductSelect();}});
}
function syncOrderProductMode() {
  var temporary = $('om_productMode').value === 'temporary';
  $('om_manualGroup').style.display = temporary ? '' : 'none';
  $('om_productGroup').style.display = temporary ? 'none' : '';
  if (temporary) $('om_seatGroup').style.display = 'none';
}
function changeOrderProductMode() {
  $('om_product').value = ''; cdropSetValue('om_platformDrop',''); initOrderPlanChoices('', '', null);
  $('om_unitPrice').value = ''; $('om_unitCost').value = '';
  $('om_svcAcct').value = ''; $('om_seat').value = ''; $('om_seatGroup').style.display = 'none';
  dpSetVal('om_expiry',''); syncOrderProductMode(); calcOrderPreview();
}
function prepareRenewalProduct(order) {
  previewRenewalParent = String(order.id);
  initOrderProductChoices(order);
  $('om_productMode').value = order.product_id ? 'catalog' : 'temporary';
  $('om_manualName').value = order.product_id ? '' : order.platform || '';
  $('om_manualVersion').value = order.product_id ? '' : order.version || '';
  $('om_manualDuration').value = order.product_id ? '' : order.duration || '';
  if (!order.product_id) {
    renderPersonalSelect(order.platform || '');
    $('om_unitPrice').value = order.unit_price || 0; $('om_unitCost').value = order.unit_cost || 0;
  }
  syncOrderProductMode();
}
function saveCommonProduct(id) {
  var order = orders.find(function(o) { return String(o.id) === String(id); }); if (!order || order.product_id) return;
  closeModal(); openProductBatch(order.platform);
  var row = $('pb_rows').firstElementChild;
  var fields = {version:order.version || '',duration:order.duration || '',cost:order.unit_cost || 0,price:order.unit_price || 0};
  Object.keys(fields).forEach(function(field) { row.querySelector('[data-field="' + field + '"]').value = fields[field]; });
  if (order.channel === '蝦皮') row.querySelector('[data-field="shopee_price"]').value = order.unit_price || 0;
  toast('請確認期間與各管道售價，再儲存為常用商品；原訂單保持不變');
}
