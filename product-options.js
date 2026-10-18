/* Product options: shared product identity, one stored row per option. */
function openProductDetail(id) {
  var product = products.find(function(p) { return String(p.id) === String(id); }); if (!product) return;
  function field(label, value) { return '<div><dt>' + esc(label) + '</dt><dd>' + esc(String(value == null || value === '' ? '—' : value)) + '</dd></div>'; }
  var cost = Number(product.cost) || 0, price = Number(product.price) || 0, sp = Number(product.shopee_price) || 0;
  $('productDetailTitle').textContent = product.platform || '商品詳情';
  $('productDetailBody').innerHTML = '<h4>方案內容</h4><dl class="order-detail-grid">' + field('方案', product.version || '標準方案') + field('期間',product.duration) + field('狀態',product.status) + field('成本／件','NT$' + fmtN(cost)) + '</dl><h4>各管道售價與試算</h4><dl class="order-detail-grid">' +
    field('8591 售價','NT$' + fmtN(price)) + field('8591 試算利潤','NT$' + fmtN(price - cost - price * PLATFORM_FEE)) + field('8591 手續費率', (PLATFORM_FEE * 100) + '%') +
    field('蝦皮售價',sp > 0 ? 'NT$' + fmtN(sp) : '未設定') + field('蝦皮試算利潤', sp > 0 ? 'NT$' + fmtN(sp - cost - sp * getShopFee()) : '未設定售價，不試算') + field('蝦皮手續費率',(getShopFee() * 100) + '%') + '</dl><p class="hint">依目前售價、成本與現行手續費試算，尚未計入出單人抽成、退款與其他費用。</p><h4>提供資料</h4><p class="order-detail-note">' + esc(product.required_info || '未設定') + '</p><h4>備註</h4><p class="order-detail-note">' + esc(product.notes || '無備註') + '</p>';
  $('productDetailActions').innerHTML = '<button class="btn ghost" onclick="closeModal()">關閉</button><button class="btn ghost" data-action="deleteProduct" data-id="' + productAttr(product.id) + '">刪除方案</button><button class="btn primary" data-action="editProduct" data-id="' + productAttr(product.id) + '">編輯方案</button>';
  closeModal(); openModal('productDetailModal');
}
function productAttr(value) { return esc(String(value == null ? '' : value)).replace(/"/g, '&quot;'); }
function parseProductDuration(value) {
  var text = String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  var match = text.match(/^(\d+)(天|日|d|days?|週|周|weeks?|w|個月|月|months?|mo|年|years?|y)?$/);
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) return null;
  var unit = match[2] || '月';
  return { count: Number(match[1]), unit: /^(天|日|d|days?)$/.test(unit) ? 'days' : /^(週|周|weeks?|w)$/.test(unit) ? 'weeks' : /^(年|years?|y)$/.test(unit) ? 'years' : 'months' };
}
function productDurationOrder(value) {
  var d = parseProductDuration(value);
  return d ? d.count * ({ days: 1, weeks: 7, months: 30, years: 365 })[d.unit] : Infinity;
}
function productExpiryDate(start, duration) {
  var parsed = parseProductDuration(duration), parts = String(start || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parsed || !parts) return '';
  var date = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
  if (date.toISOString().slice(0, 10) !== start) return '';
  if (parsed.unit === 'days' || parsed.unit === 'weeks') date.setUTCDate(date.getUTCDate() + parsed.count * (parsed.unit === 'weeks' ? 7 : 1));
  else {
    var day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + parsed.count * (parsed.unit === 'years' ? 12 : 1));
    var last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
function setProductExpiry(base, duration) {
  var expiry = productExpiryDate(base, duration);
  dpSetVal('om_expiry', expiry);
  if (!expiry && duration) toast('此期間不自動計算到期日，請依實際情況填寫');
}
function buildProductOptions(platform, entries, shared, existing) {
  platform = String(platform || '').trim();
  if (!platform) throw new Error('請填寫商品名稱');
  if (!entries.length) throw new Error('請至少新增一個方案');
  var seen = Object.create(null);
  function key(p) { return [p.platform, p.version || '標準方案', p.duration].map(function(x) { return String(x || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase(); }).join('\u0000'); }
  (existing || []).forEach(function(p) { seen[key(p)] = true; });
  return entries.map(function(entry, index) {
    var row = { platform: platform, version: String(entry.version || '').trim() || '標準方案', duration: String(entry.duration || '').trim(),
      status: entry.status === '停用' ? '停用' : '啟用', required_info: String(shared.required_info || '').trim(), notes: String(entry.notes || '').trim() || String(shared.notes || '').trim() };
    if (!row.duration) throw new Error('第 ' + (index + 1) + ' 列請填寫期間，例如 7天、3個月或單次');
    ['cost', 'price', 'shopee_price'].forEach(function(field) {
      var raw = String(entry[field] == null ? '' : entry[field]).trim();
      if (!raw && field !== 'shopee_price') throw new Error('第 ' + (index + 1) + ' 列請填寫成本與 8591 售價，免費請填 0');
      var number = raw ? Number(raw) : 0;
      if (!Number.isFinite(number) || number < 0) throw new Error('第 ' + (index + 1) + ' 列的金額必須為零或正數');
      row[field] = number;
    });
    if (seen[key(row)]) throw new Error('第 ' + (index + 1) + ' 列與已有方案重複，請調整方案名稱或期間');
    seen[key(row)] = true;
    return row;
  });
}
var productBatchEditing = null;
function productBatchDefaultsSignature() { return ['_source','_payAccount','_purchaseMode'].map(function(k){return $('pb'+k).value;}).join('\u0000'); }
function openProductBatch(platform) {
  productBatchEditing = null;
  $('pb_platform').readOnly = false;
  document.querySelector('#productBatchModal h3').textContent = '新增商品與多個方案';
  syncCategorySelectors(); $('pb_category').value=categoryId(platform || ''); cdropSetValue('pb_categoryDropdown',$('pb_category').value);
  syncPurchaseDefaults('pb',products.find(function(p){return p.platform===platform;}));
  $('pb_platform').value = platform || '';
  $('pb_platform').onchange=function(){ if(products.some(function(p){return p.platform===this.value.trim();},this)) { $('pb_category').value=categoryId(this.value.trim()); cdropSetValue('pb_categoryDropdown',$('pb_category').value); } };
  $('pb_info').value = ''; $('pb_notes').value = ''; $('pb_rows').innerHTML = '';
  $('pb_save').disabled = false;
  updatePlatformList(); addProductOption(); openModal('productBatchModal');
}
function openProductBatchEdit(platform) {
  var group=products.filter(function(p){return p.platform===platform;}); if(!group.length)return;
  openProductBatch(platform);
  productBatchEditing={platform:platform, snapshots:JSON.stringify(group), defaults:productBatchDefaultsSignature()};
  document.querySelector('#productBatchModal h3').textContent='編輯商品全部方案';
  $('pb_platform').readOnly=true;
  $('pb_info').value=group.every(function(p){return (p.required_info||'')===(group[0].required_info||'');}) ? group[0].required_info||'' : '';
  $('pb_info').placeholder='留空時保留各方案原有提供資料';
  $('pb_rows').innerHTML='';
  group.forEach(function(p){addProductOption();var row=$('pb_rows').lastElementChild;row.dataset.productId=String(p.id);row.querySelectorAll('[data-field]').forEach(function(input){input.value=p[input.dataset.field]==null?'':p[input.dataset.field];});var remove=row.querySelector('button');remove.disabled=true;remove.title='既有方案請改為停用，以保留歷史關聯';});
}
function buildProductBatchUpdates(platform, entries, shared, existing) {
  var ids=entries.filter(function(e){return e.id;}).map(function(e){return String(e.id);});
  if(new Set(ids).size!==ids.length)throw new Error('方案識別重複，請重新開啟編輯');
  ids.forEach(function(id){if(!existing.some(function(p){return String(p.id)===id&&p.platform===platform;}))throw new Error('方案已變更，請重新開啟編輯');});
  if(existing.some(function(p){return p.platform===platform&&ids.indexOf(String(p.id))<0;}))throw new Error('不可移除既有方案，請改為停用');
  var rows=buildProductOptions(platform,entries,shared,existing.filter(function(p){return ids.indexOf(String(p.id))<0;}));
  return rows.map(function(row,i){var original=existing.find(function(p){return String(p.id)===String(entries[i].id);});return Object.assign({},original||{},row, original?{id:original.id,required_info:shared.required_info.trim()?row.required_info:original.required_info||''}:{});});
}
function addProductOption(duration) {
  var row = document.createElement('tr');
  row.innerHTML = '<td><input data-field="version" aria-label="方案名稱" placeholder="標準／家庭／個人"></td>' +
    '<td><input data-field="duration" aria-label="方案期間" list="productDurationChoices" placeholder="例如 7天／3個月"></td>' +
    '<td><input data-field="cost" aria-label="方案成本" type="number" min="0" step="0.01" placeholder="0"></td>' +
    '<td><input data-field="price" aria-label="8591售價" type="number" min="0" step="0.01" placeholder="0"></td>' +
    '<td><input data-field="shopee_price" aria-label="蝦皮售價" type="number" min="0" step="0.01" placeholder="選填"></td>' +
    '<td><select data-field="status" aria-label="方案狀態"><option>啟用</option><option>停用</option></select></td>' +
    '<td><input data-field="notes" aria-label="方案備註" placeholder="選填"></td>' +
    '<td><button type="button" class="btn ghost" aria-label="移除此列方案" onclick="this.closest(\'tr\').remove()">×</button></td>';
  row.querySelector('[data-field="duration"]').value = duration || '';
  var previous = $('pb_rows').lastElementChild;
  if (previous) row.querySelector('[data-field="version"]').value = previous.querySelector('[data-field="version"]').value;
  $('pb_rows').appendChild(row);
}
function saveProductOptions() {
  var button = $('pb_save'); if (button.disabled) return;
  var entries = Array.from($('pb_rows').children).map(function(row) {
    var entry = {id:row.dataset.productId||''}; row.querySelectorAll('[data-field]').forEach(function(input) { entry[input.dataset.field] = input.value; }); return entry;
  });
  var rows;
  if(productBatchEditing) return saveProductBatchEdits(entries);
  try { validatePurchaseDefaults('pb'); }catch(e){return toast(e.message,'err');}
  try { rows = buildProductOptions($('pb_platform').value, entries, { required_info: $('pb_info').value, notes: $('pb_notes').value }, products); }
  catch (error) { return toast(error.message, 'err'); }
  rows.forEach(function(row, i) { row.store_id = storeId; row.user_id = userId; row.fee_type = '百分比'; row.fee_value = PLATFORM_FEE; row.sort_order = products.length + i; });
  button.disabled = true;
  if (isDemo) {
    rows.forEach(function(row, i) { row.id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now() + '-' + i; });
    try{savePurchaseDefaults('pb',rows);}catch(e){button.disabled=false;return toast(e.message,'err');}
    assignProductCategory(rows[0].platform,$('pb_category').value); localStorage.setItem('preview-product-categories-v1',JSON.stringify(categoryState));
    products = products.concat(rows); demoSave(); closeModal(); renderAll(); button.disabled = false;
    return toast('已新增 ' + rows.length + ' 個方案', 'ok');
  }
  sb.from('products').insert(rows).then(function(result) {
    if (result.error) return toast('新增失敗：' + result.error.message, 'err');
    closeModal(); loadAll(); toast('已新增 ' + rows.length + ' 個方案', 'ok');
  }).catch(function() { toast('無法確認新增結果，請重新整理後核對，避免重複送出', 'err'); }).finally(function() { button.disabled = false; });
}
function saveProductBatchEdits(entries) {
  if(!isDemo)return toast('批次修改目前僅開放離線預覽','err');
  var state=productBatchEditing,button=$('pb_save'),rows;
  if(JSON.stringify(products.filter(function(p){return p.platform===state.platform;}))!==state.snapshots)return toast('商品資料已改變，請關閉並重新開啟，避免覆蓋','err');
  try {
    var defaultsChanged=state.defaults!==productBatchDefaultsSignature();
    if(defaultsChanged)validatePurchaseDefaults('pb');
    rows=buildProductBatchUpdates(state.platform,entries,{required_info:$('pb_info').value,notes:$('pb_notes').value},products);
    rows.forEach(function(p){if(!p.id){p.id=crypto.randomUUID();p.store_id=storeId;p.user_id=userId;}});
    button.disabled=true;
    if(defaultsChanged)savePurchaseDefaults('pb',rows);
    assignProductCategory(state.platform,$('pb_category').value);
    localStorage.setItem('preview-product-categories-v1',JSON.stringify(categoryState));
    products=products.filter(function(p){return p.platform!==state.platform;}).concat(rows);
    demoSave(); closeModal(); renderAll(); productBatchEditing=null;
    toast('已同步更新 '+rows.length+' 個方案；歷史訂單不變','ok');
  }catch(e){toast(e.message,'err');}finally{button.disabled=false;}
}
