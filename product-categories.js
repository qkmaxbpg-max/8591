/* One authoritative category state for every local preview entry point. */
var categoryState=(function(){
  try {var saved=JSON.parse(localStorage.getItem('preview-product-categories-v1'));if(saved && Array.isArray(saved.categories) && saved.assignments)return saved;}catch(e){}
  return {categories:['影視','音樂','修圖與剪輯','交友軟體','資訊工具','VPN','體育賽事','遊戲代儲'].map(function(name,i){return {id:'category-'+i,name:name,active:true};}),assignments:{}};
})();
var categoryFilter='',categoryCaller='';
function categoryId(platform){return Object.prototype.hasOwnProperty.call(categoryState.assignments,platform)?categoryState.assignments[platform]:'';}
function categoryMatches(platform,id){return id==='all'||id===undefined||id===null?true:id==='uncategorized'?!categoryId(platform):categoryId(platform)===id;}
function categoryUsage(id){return Array.from(new Set(products.map(function(p){return p.platform;}))).filter(function(name){return categoryId(name)===id;}).length;}
function categoryOptions(value,all){
  var html=all?'<option value="all">全部分類</option><option value="uncategorized">未分類</option>':'<option value="">未分類</option>';
  categoryState.categories.forEach(function(c){if(c.active||c.id===value||all)html+='<option value="'+productAttr(c.id)+'">'+esc(c.name)+(c.active?'':'（已停用）')+'</option>';});return html;
}
function syncCategorySelectors(){
  document.querySelectorAll('[data-category-select]').forEach(function(select){var value=select.value;select.innerHTML=categoryOptions(value,select.dataset.categorySelect==='filter');select.value=value; if(select.selectedIndex<0)select.value=select.dataset.categorySelect==='filter'?'all':''; mountCategoryDropdown(select);});
}
function mountCategoryDropdown(select){
  if(!select.id)return;
  var containerId=select.id+'Dropdown',container=$(containerId);
  if(!container){container=document.createElement('div');container.id=containerId;container.className='category-dropdown';select.insertAdjacentElement('afterend',container);}
  select.hidden=true;select.style.display='none';select.tabIndex=-1;
  var items=Array.from(select.options).map(function(option){return {value:option.value,label:option.textContent};});
  cdropInit(containerId,{items:items,value:select.value,placeholder:'搜尋或選擇分類',onSelect:function(value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}});
  var input=container.querySelector('input');
  if(input){input.setAttribute('aria-label',select.getAttribute('aria-label')||'商品分類');input.id=select.id+'Input';var label=document.querySelector('label[for="'+select.id+'"]');if(label)label.htmlFor=input.id;}
}
function categoryCommit(){
  if(!isDemo&&window.phase1DatabaseEnabled)return phase1SaveCategories();
  localStorage.setItem('preview-product-categories-v1',JSON.stringify(categoryState));
  syncCategorySelectors();renderProducts();renderSubscriptions();
}
function renameCategory(id,name){
  name=String(name||'').trim();if(!name)throw new Error('分類名稱不可空白');
  if(categoryState.categories.some(function(c){return c.id!==id&&c.name.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase();}))throw new Error('分類名稱已存在');
  var category=categoryState.categories.find(function(c){return c.id===id;});if(!category)throw new Error('找不到分類');category.name=name;
}
function assignProductCategory(platform,id){
  if(id && !categoryState.categories.some(function(c){return c.id===id&&c.active;}))throw new Error('請選擇啟用的分類');
  if(id)Object.defineProperty(categoryState.assignments,platform,{value:id,writable:true,enumerable:true,configurable:true});else delete categoryState.assignments[platform];
}
function categoryFilterChanged(select){
  categoryFilter=select.value;
  ['productCategoryFilter','subscriptionCategoryFilter'].forEach(function(id){$(id).value=categoryFilter;cdropSetValue(id+'Dropdown',categoryFilter);});renderProducts();renderSubscriptions();
}
function changeOrderCategory(){
  $('om_product').value='';$('om_unitPrice').value='';$('om_unitCost').value='';
  $('om_svcAcct').value='';$('om_seat').value='';$('om_seatGroup').style.display='none';
  dpSetVal('om_expiry','');initOrderProductChoices(null);calcOrderPreview();
}
function openCategoryManager(){
  categoryCaller='';document.querySelectorAll('.modal.show').forEach(function(modal){categoryCaller=modal.id;modal.classList.remove('show');});
  renderCategoryManager();openModal('categoryManagerModal');
}
function closeCategoryManager(){
  $('categoryManagerModal').classList.remove('show');
  if(categoryCaller){openModal(categoryCaller);categoryCaller='';}else closeModal();
}
function categoryOperation(action,id,value){
  if(!isDemo&&!window.phase1DatabaseEnabled)return toast('分類資料庫尚未就緒','err');
  if(!isDemo&&phase1IsBusy())return toast('正在儲存，請稍候');
  try{
    if(action==='rename')renameCategory(id,value);
    if(action==='add'){
      var name=$('categoryNewName').value.trim();if(!name)throw new Error('請填寫分類名稱');
      if(categoryState.categories.some(function(c){return c.name.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase();}))throw new Error('分類名稱已存在');
      var added='category-local-'+Date.now()+'-'+Math.random().toString(16).slice(2);
      categoryState.categories.push({id:added,name:name,active:true});$('categoryNewName').value='';
      if(categoryCaller==='productBatchModal')$('pb_category').dataset.newCategory=added;
    }
    var index=categoryState.categories.findIndex(function(c){return c.id===id;});
    if(action==='up'||action==='down'){
      var target=index+(action==='up'?-1:1);if(index>=0&&target>=0&&target<categoryState.categories.length){var temp=categoryState.categories[index];categoryState.categories[index]=categoryState.categories[target];categoryState.categories[target]=temp;}
    }
    if(action==='toggle'){
      if(categoryState.categories[index].active&&categoryUsage(id))throw new Error('此分類仍有商品，請先在下方移轉商品，再停用');
      categoryState.categories[index].active=!categoryState.categories[index].active;
    }
    if(action==='assign')assignProductCategory(id,value);
    categoryCommit();renderCategoryManager();
    if($('pb_category').dataset.newCategory){$('pb_category').value=$('pb_category').dataset.newCategory;cdropSetValue('pb_categoryDropdown',$('pb_category').value);delete $('pb_category').dataset.newCategory;}
  }catch(e){toast(e.message,'err');renderCategoryManager();}
}
function renderCategoryManager(){
  $('categoryManagerList').innerHTML=categoryState.categories.map(function(c){return '<div class="category-manage-row" data-category-id="'+productAttr(c.id)+'"><button type="button" class="category-drag-handle" aria-label="按住拖曳排序；也可用鍵盤上下鍵移動" title="按住拖曳排序"><span></span><span></span><span></span></button><input aria-label="分類名稱" value="'+productAttr(c.name)+'" data-id="'+productAttr(c.id)+'" onchange="categoryOperation(\'rename\',this.dataset.id,this.value)"><span class="hint">'+categoryUsage(c.id)+' 商品</span><button class="btn sm ghost" data-id="'+productAttr(c.id)+'" onclick="categoryOperation(\'toggle\',this.dataset.id)">'+(c.active?'停用':'啟用')+'</button></div>';}).join('');
  bindCategoryDrag();
  $('categoryAssignments').innerHTML=Array.from(new Set(products.map(function(p){return p.platform;}))).sort().map(function(name,index){return '<div class="form-row"><span>'+esc(name)+'</span><select id="categoryAssignment'+index+'" data-category-select="assign" aria-label="商品分類" data-platform="'+productAttr(name)+'" onchange="categoryOperation(\'assign\',this.dataset.platform,this.value)">'+categoryOptions(categoryId(name),false)+'</select></div>';}).join('');
  $('categoryAssignments').querySelectorAll('select').forEach(function(select){select.value=categoryId(select.dataset.platform);});
  syncCategorySelectors();
}
function reorderCategories(ids){
  var categories=categoryState.categories;
  if(ids.length!==categories.length || new Set(ids).size!==categories.length || ids.some(function(id){return !categories.some(function(c){return c.id===id;});}))throw new Error('分類排序不完整，請重新整理後確認');
  categoryState.categories=ids.map(function(id){return categories.find(function(c){return c.id===id;});});
}
function bindCategoryDrag(){
  var list=$('categoryManagerList');if(list.dataset.dragBound)return;list.dataset.dragBound='1';
  list.addEventListener('pointerdown',function(event){
    var handle=event.target.closest('.category-drag-handle');if(!handle||(!isDemo&&!window.phase1DatabaseEnabled)||(!isDemo&&phase1IsBusy())||event.button!==0)return;
    event.preventDefault();var row=handle.closest('.category-manage-row'),original=Array.from(list.children),pointer=event.pointerId;
    row.classList.add('dragging');
    function move(e){
      if(e.pointerId!==pointer)return;e.preventDefault();
      var hit=document.elementFromPoint(e.clientX,e.clientY),target=hit&&hit.closest('.category-manage-row');
      if(target&&target!==row&&target.parentElement===list){var box=target.getBoundingClientRect();list.insertBefore(row,e.clientY<box.top+box.height/2?target:target.nextSibling);}
      var body=list.closest('.modal-body'),bounds=body.getBoundingClientRect();if(e.clientY<bounds.top+40)body.scrollTop-=16;else if(e.clientY>bounds.bottom-40)body.scrollTop+=16;
    }
    function finish(e){
      if(e.pointerId!==pointer)return;
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);
      row.classList.remove('dragging');
      if(e.type!=='pointerup'){original.forEach(function(child){list.appendChild(child);});return;}
      var snapshot=JSON.stringify(categoryState);
      try{
        var rows=Array.from(list.children),names=rows.map(function(child){return child.querySelector('input').value.trim();});
        if(names.some(function(name){return !name;}) || new Set(names.map(function(name){return name.normalize('NFKC').toLowerCase();})).size!==names.length)throw new Error('分類名稱不可空白或重複');
        reorderCategories(rows.map(function(child){return child.dataset.categoryId;}));
        categoryState.categories.forEach(function(c,index){c.name=names[index];});categoryCommit();if(isDemo)toast('分類排序已同步更新','ok');
      }catch(error){categoryState=JSON.parse(snapshot);original.forEach(function(child){list.appendChild(child);});toast(error.message,'err');}
    }
    function cancel(e){finish(e);}
    document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);
  });
  list.addEventListener('keydown',function(event){
    var handle=event.target.closest('.category-drag-handle');if(!handle||(!isDemo&&!window.phase1DatabaseEnabled)||(!isDemo&&phase1IsBusy())||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();var row=handle.closest('.category-manage-row'),id=row.dataset.categoryId;
    categoryOperation(event.key==='ArrowUp'?'up':'down',id);
    var handles=list.querySelectorAll('.category-drag-handle');Array.from(handles).forEach(function(button){if(button.closest('.category-manage-row').dataset.categoryId===id)button.focus();});
  });
}
