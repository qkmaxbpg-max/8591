/* Independent local scratchpad: never creates orders or financial records. */
var quickNotesFilter='pending';
function quickNotesRead(){
  var rows=JSON.parse(localStorage.getItem('preview-quick-notes-v1')||'[]');
  if(!Array.isArray(rows)||rows.some(function(r){return !r||typeof r.id!=='string'||typeof r.product!=='string'||typeof r.date!=='string'||typeof r.done!=='boolean';}))throw new Error('記事資料格式異常，請先保留資料並排查');
  return rows;
}
function quickNotesWrite(rows){localStorage.setItem('preview-quick-notes-v1',JSON.stringify(rows));}
function openQuickNotes(){
  if(typeof displayPreferences==='function')quickNotesFilter=displayPreferences().notes||'pending';
  if(!isDemo&&!window.quickNotesDatabaseEnabled)return toast('記事資料庫尚未就緒','err');
  cdropInit('qn_productDrop',{items:Array.from(new Set(products.map(function(p){return p.platform;}).filter(Boolean))).sort().map(function(name){return {value:name,label:name};}),placeholder:'選商品，或直接打字記事'});
  var input=document.querySelector('[data-cdrop-input="qn_productDrop"]');input.id='qn_product';input.maxLength=500;input.setAttribute('aria-label','商品記事');
  $('qn_date').value=today();$('qn_product').value='';$('qn_edit').value='';
  $('qn_save').textContent='記下來';
  updatePlatformList();renderQuickNotes();openModal('quickNotesModal');
}
function saveQuickNote(){
  if(!isDemo)return;
  try{
    var date=$('qn_date').value,product=$('qn_product').value.trim(),id=$('qn_edit').value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('請選擇有效日期');
    if(!product)throw new Error('請輸入或選擇商品');
    if(product.length>500)throw new Error('商品記事請控制在 500 字內');
    var rows=quickNotesRead();
    if(id){var note=rows.find(function(r){return r.id===id;});if(!note)throw new Error('記事已不存在，請重新開啟');note.date=date;note.product=product;}
    else rows.push({id:crypto.randomUUID(),date:date,product:product,done:false});
    quickNotesWrite(rows);cdropSetValue('qn_productDrop','');cdropClose('qn_productDrop');$('qn_product').value='';$('qn_edit').value='';$('qn_save').textContent='記下來';renderQuickNotes();toast('已記下','ok');
  }catch(e){toast(e.message,'err');}
}
function quickNoteAction(id,edit){
  if(!isDemo)return;
  try{var rows=quickNotesRead(),note=rows.find(function(r){return r.id===id;});if(!note)return;
    if(edit){cdropSetValue('qn_productDrop',note.product);cdropInstances.qn_productDrop.state.text=note.product;$('qn_date').value=note.date;$('qn_product').value=note.product;$('qn_edit').value=note.id;$('qn_save').textContent='儲存修改';return;}
    note.done=!note.done;quickNotesWrite(rows);renderQuickNotes();
  }catch(e){toast(e.message,'err');}
}
function renderQuickNotes(){
  try{var rows=quickNotesRead(),pending=rows.filter(function(r){return !r.done;}).length;
    $('qn_filters').innerHTML=['pending','done','all'].map(function(key,i){return '<button class="btn sm '+(quickNotesFilter===key?'primary':'ghost')+'" onclick="quickNotesFilter=\''+key+'\';renderQuickNotes()">'+['未處理 '+pending,'已處理 '+(rows.length-pending),'全部'][i]+'</button>';}).join('');
    var shown=rows.filter(function(r){return quickNotesFilter==='all'||r.done===(quickNotesFilter==='done');}).sort(function(a,b){return b.date.localeCompare(a.date);});
    $('qn_list').innerHTML=shown.length?'<div class="table-scroll"><table><thead><tr><th>日期</th><th>商品記事</th><th>操作</th></tr></thead><tbody>'+shown.map(function(r){return '<tr><td>'+esc(r.date)+'</td><td class="quick-note-text">'+esc(r.product)+'</td><td><div class="act-group"><button class="btn sm ghost" data-note-id="'+productAttr(r.id)+'" data-note-edit="1">編輯</button><button class="btn sm '+(r.done?'ghost':'primary')+'" data-note-id="'+productAttr(r.id)+'">'+(r.done?'改回未處理':'標為已處理')+'</button></div></td></tr>';}).join('')+'</tbody></table></div>':'<p class="hint">'+(quickNotesFilter==='done'?'還沒有已處理記事。':'目前沒有記事，可以先記一個商品。')+'</p>';
    $('qn_list').onclick=function(e){var b=e.target.closest('[data-note-id]');if(b)quickNoteAction(b.dataset.noteId,b.dataset.noteEdit==='1');};
  }catch(e){$('qn_list').textContent=e.message;}
}
