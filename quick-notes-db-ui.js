/* Enable database notes only for the explicitly configured local integration site. */
(function(){
 if(window.LOCAL_TEST_CONFIG.demoOnly)return;
 var cache=[],scope='',busy=false,draftId='',originalOpen=openQuickNotes,localRead=quickNotesRead,localSave=saveQuickNote,localAction=quickNoteAction;
 window.quickNotesDatabaseEnabled=true;
 function identity(){if(isDemo||!userId)throw new Error('請先登入');return String(userId)+'/'+String(storeId||'');}
 function repo(){return createQuickNotesRepository(initSb(),userId,storeId);}
 quickNotesRead=function(){return isDemo?localRead():cache;};
 openQuickNotes=async function(){
  if(isDemo)return originalOpen();
  if(busy)return;
  try{var current=identity();scope=current;cache=[];draftId=crypto.randomUUID();originalOpen();$('qn_storageHint').textContent='記事與目前登入帳號及店舖同步；不會計入訂單或財務。';$('qn_save').disabled=true;$('qn_list').textContent='正在讀取記事…';busy=true;var loaded=await repo().list();if(identity()!==current)throw new Error('登入或店舖已改變，請重新開啟記事');cache=loaded;renderQuickNotes();}catch(e){$('qn_list').textContent=e.message;toast(e.message,'err');}finally{busy=false;$('qn_save').disabled=false;}
 };
 saveQuickNote=async function(){
  if(isDemo)return localSave();if(busy)return;
  try{if(identity()!==scope)throw new Error('店舖已改變，請重新開啟記事');busy=true;$('qn_save').disabled=true;var id=$('qn_edit').value,old=cache.find(function(n){return n.id===id;});if(id&&!old)throw new Error('記事不存在，請重新讀取');var note={id:id||draftId,date:$('qn_date').value,product:$('qn_product').value,done:old?old.done:false,revision:old&&old.revision};var saved=id?await repo().update(note):await repo().create(note);if(identity()!==scope)throw new Error('記錄已送出，但店舖已切換，請重新讀取確認');cache=cache.filter(function(n){return n.id!==saved.id;}).concat([saved]);draftId=crypto.randomUUID();$('qn_edit').value='';cdropSetValue('qn_productDrop','');$('qn_product').value='';$('qn_save').textContent='記下來';renderQuickNotes();toast('記事已存入測試資料庫','ok');}catch(e){toast(e.message,'err');}finally{busy=false;$('qn_save').disabled=false;}
 };
 quickNoteAction=async function(id,edit){
  if(isDemo)return localAction(id,edit);if(busy)return;
  try{if(identity()!==scope)throw new Error('請重新開啟記事');var note=cache.find(function(n){return n.id===id;});if(!note)return;if(edit){cdropSetValue('qn_productDrop',note.product);cdropInstances.qn_productDrop.state.text=note.product;$('qn_product').value=note.product;$('qn_date').value=note.date;$('qn_edit').value=id;$('qn_save').textContent='儲存修改';return;}busy=true;var saved=await repo().update(Object.assign({},note,{done:!note.done}));if(identity()!==scope)throw new Error('店舖已切換，請重新讀取確認');cache=cache.map(function(n){return n.id===id?saved:n;});renderQuickNotes();}catch(e){toast(e.message,'err');}finally{busy=false;}
 };
})();
