/* Database adapter staged for local integration; not enabled by the offline UI. */
function createQuickNotesRepository(client, ownerId, shopId) {
  if(!client||!ownerId)throw new Error('記事需要登入');
  var shop=shopId||null;
  function scoped(query){query=query.eq('user_id',ownerId);return shop?query.eq('store_id',shop):query.is('store_id',null);}
  function decode(row){return {id:row.id,date:row.note_date,product:row.product_text,done:row.done,revision:row.revision};}
  function check(result){if(result.error)throw new Error('記事儲存或讀取失敗，請確認連線與權限後再試');return result.data;}
  function payload(note){
    if(typeof note.product!=='string'||!note.product.trim()||Array.from(note.product.trim()).length>500)throw new Error('商品記事須為 1～500 字');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(note.date)||new Date(note.date+'T00:00:00Z').toISOString().slice(0,10)!==note.date)throw new Error('請選擇有效日期');
    if(typeof note.done!=='boolean')throw new Error('記事狀態不正確');
    return {note_date:note.date,product_text:note.product.trim(),done:note.done};
  }
  return {
    list:async function(){var result=await scoped(client.from('mwj_quick_notes').select('id,note_date,product_text,done,revision')).order('note_date',{ascending:false});return (check(result)||[]).map(decode);},
    create:async function(note){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(note.id||''))throw new Error('記事識別碼不正確');
      var input=Object.assign(payload(note),{id:note.id,user_id:ownerId,store_id:shop});
      var result=await client.from('mwj_quick_notes').insert(input).select('id,note_date,product_text,done,revision').single();
      if(result.error&&result.error.code==='23505'){
        var existing=check(await scoped(client.from('mwj_quick_notes').select('id,note_date,product_text,done,revision')).eq('id',note.id).maybeSingle());
        if(existing&&existing.note_date===input.note_date&&existing.product_text===input.product_text&&existing.done===input.done)return decode(existing);
        throw new Error('記事識別碼已存在，請重新載入，避免覆蓋');
      }
      return decode(check(result));
    },
    update:async function(note){
      if(!Number.isInteger(note.revision)||note.revision<1)throw new Error('缺少版本，請重新載入記事');
      var result=await scoped(client.from('mwj_quick_notes').update(payload(note))).eq('id',note.id).eq('revision',note.revision).select('id,note_date,product_text,done,revision').maybeSingle();
      var saved=check(result);if(!saved)throw new Error('記事已由其他視窗修改，或已無權存取；請重新載入');return decode(saved);
    }
  };
}
