
/* v79: experimental avatar cropper removed; restored original profile media flow. */
/* v84: restore missing profile-media state/helpers */
let cropState=null;
function updateProfileMediaDeleteButtons(){
 const a=document.getElementById('deleteAvatarBtn'),c=document.getElementById('deleteCoverBtn');
 if(a)a.hidden=!(profile?.avatar_url);
 if(c)c.hidden=!(profile?.cover_url);
}
async function deleteProfileMedia(kind){if(!isViewingOwnProfile()){alert('Удалять фотографии можно только в своём профиле.');return}
 if(!me||!profile)return;
 const field=kind==='avatar'?'avatar_url':'cover_url';
 const bucket=kind==='avatar'?'avatars':'covers';
 const current=profile[field];
 if(!current)return;
 if(!confirm(kind==='avatar'?'Удалить аватар?':'Удалить обложку?'))return;

 // Clear the profile first so the image disappears even if storage cleanup fails.
 const {error}=await sb.from('profiles').update({[field]:null}).eq('id',me.id);
 if(error)return alert('Не удалось удалить '+(kind==='avatar'?'аватар':'обложку')+': '+error.message);

 profile={...profile,[field]:null};
 if(kind==='cover'){
   const cover=document.getElementById('profileCover');
   if(cover)cover.style.backgroundImage='';
 }else{
   document.querySelectorAll('#profileAvatar,#topAvatar,.profileAvatar').forEach(el=>{
     if(el.tagName==='IMG')el.removeAttribute('src');
   });
 }
 renderProfile();renderAuth();renderProfileWidget();updateProfileMediaDeleteButtons();

 // Best-effort cleanup of the old file in Storage.
 try{
   const marker='/storage/v1/object/public/'+bucket+'/';
   const pos=current.indexOf(marker);
   if(pos>=0){
     const storagePath=decodeURIComponent(current.slice(pos+marker.length).split('?')[0]);
     const {error:removeError}=await sb.storage.from(bucket).remove([storagePath]);
     if(removeError)console.warn('Storage cleanup failed',removeError);
   }
 }catch(err){console.warn('Storage cleanup failed',err)}
}


/* v98 isolated avatar editor: only intercepts avatar file selection.
   Cover upload and the existing upload()/delete paths remain untouched. */
const avatarEditor={img:null,file:null,zoom:1,x:0,y:0,drag:false,last:null,objectUrl:null};
function ensureAvatarEditor(){
 let modal=document.getElementById('avatarEditorModal');
 if(modal)return modal;
 modal=document.createElement('div');
 modal.id='avatarEditorModal';
 modal.className='avatarEditorModal';
 modal.hidden=true;
 modal.innerHTML=`<div class="avatarEditorCard" role="dialog" aria-modal="true" aria-labelledby="avatarEditorTitle">
   <div class="avatarEditorHead"><b id="avatarEditorTitle">Настроить аватар</b><button type="button" data-ae-close aria-label="Закрыть">×</button></div>
   <div class="avatarEditorStage"><canvas id="avatarEditorCanvas" width="520" height="520"></canvas><div class="avatarEditorRing"></div></div>
   <label class="avatarEditorZoom">Масштаб <input id="avatarEditorZoom" type="range" min="1" max="3" step="0.01" value="1"></label>
   <div class="avatarEditorHint">Перетащи фотографию, чтобы выбрать область</div>
   <div class="avatarEditorActions"><button type="button" data-ae-cancel>Отмена</button><button type="button" class="primary" data-ae-save>Сохранить аватар</button></div>
 </div>`;
 document.body.appendChild(modal);
 const close=()=>{modal.hidden=true;const inp=document.getElementById('avatarInput');if(inp)inp.value='';if(avatarEditor.objectUrl){URL.revokeObjectURL(avatarEditor.objectUrl);avatarEditor.objectUrl=null}};
 modal.querySelector('[data-ae-close]').onclick=close;
 modal.querySelector('[data-ae-cancel]').onclick=close;
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 const canvas=modal.querySelector('#avatarEditorCanvas');
 const point=e=>{const t=e.touches?.[0]||e,r=canvas.getBoundingClientRect();return{x:(t.clientX-r.left)*canvas.width/r.width,y:(t.clientY-r.top)*canvas.height/r.height}};
 const down=e=>{
  if(!avatarEditor.img)return;
  avatarEditor.drag=true;avatarEditor.last=point(e);
  try{canvas.setPointerCapture?.(e.pointerId)}catch(_){}
  e.preventDefault();e.stopPropagation();
 };
 const move=e=>{
  if(!avatarEditor.drag||!avatarEditor.last)return;
  const p=point(e);
  avatarEditor.x+=p.x-avatarEditor.last.x;avatarEditor.y+=p.y-avatarEditor.last.y;
  avatarEditor.last=p;drawAvatarEditor();
  e.preventDefault();e.stopPropagation();
 };
 const up=e=>{
  avatarEditor.drag=false;avatarEditor.last=null;
  try{if(e?.pointerId!=null&&canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId)}catch(_){}
 };
 canvas.addEventListener('pointerdown',down);
 canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',up);
 canvas.addEventListener('pointercancel',up);
 canvas.addEventListener('lostpointercapture',up);
 modal.querySelector('#avatarEditorZoom').oninput=e=>{avatarEditor.zoom=+e.target.value;drawAvatarEditor()};
 modal.querySelector('[data-ae-save]').onclick=saveAvatarEditor;
 return modal;
}
function drawAvatarEditor(){
 const canvas=document.getElementById('avatarEditorCanvas'),img=avatarEditor.img;if(!canvas||!img)return;
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#090b0d';ctx.fillRect(0,0,w,h);
 const base=Math.max(w/img.naturalWidth,h/img.naturalHeight),scale=base*avatarEditor.zoom;
 const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
 const maxX=Math.max(0,(dw-w)/2),maxY=Math.max(0,(dh-h)/2);
 avatarEditor.x=Math.max(-maxX,Math.min(maxX,avatarEditor.x));
 avatarEditor.y=Math.max(-maxY,Math.min(maxY,avatarEditor.y));
 ctx.drawImage(img,(w-dw)/2+avatarEditor.x,(h-dh)/2+avatarEditor.y,dw,dh);
}

const coverEditor={img:null,x:0,y:0,zoom:1,drag:false,last:null};
function ensureCoverEditor(){
 if(document.getElementById('coverEditorModal'))return;
 const modal=document.createElement('div');modal.id='coverEditorModal';modal.hidden=true;
 modal.innerHTML=`<div class="coverEditorCard" role="dialog" aria-modal="true"><div class="coverEditorHead"><b>Настроить обложку</b><button type="button" id="coverEditorClose">×</button></div><div class="coverEditorStage"><canvas id="coverEditorCanvas" width="1200" height="420"></canvas></div><div class="coverEditorHint">Перетащи фото в нужное положение</div><label class="coverEditorZoom">Масштаб <input id="coverEditorZoom" type="range" min="1" max="3" step="0.01" value="1"></label><div class="coverEditorActions"><button type="button" id="coverEditorCancel">Отмена</button><button type="button" id="coverEditorSave">Сохранить обложку</button></div></div>`;
 document.body.appendChild(modal);
 const canvas=modal.querySelector('#coverEditorCanvas');
 const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
 const down=e=>{if(!coverEditor.img)return;coverEditor.drag=true;coverEditor.last=point(e);try{canvas.setPointerCapture?.(e.pointerId)}catch(_){}e.preventDefault();e.stopPropagation()};
 const move=e=>{if(!coverEditor.drag||!coverEditor.last)return;const p=point(e);coverEditor.x+=p.x-coverEditor.last.x;coverEditor.y+=p.y-coverEditor.last.y;coverEditor.last=p;drawCoverEditor();e.preventDefault();e.stopPropagation()};
 const up=e=>{coverEditor.drag=false;coverEditor.last=null;try{if(e?.pointerId!=null&&canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId)}catch(_){}};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);
 modal.querySelector('#coverEditorZoom').addEventListener('input',e=>{coverEditor.zoom=Number(e.target.value)||1;drawCoverEditor()});
 modal.querySelector('#coverEditorClose').onclick=closeCoverEditor;modal.querySelector('#coverEditorCancel').onclick=closeCoverEditor;modal.querySelector('#coverEditorSave').onclick=saveCoverEditor;
 modal.addEventListener('click',e=>{if(e.target===modal)closeCoverEditor()});
}
function drawCoverEditor(){
 const canvas=document.getElementById('coverEditorCanvas'),img=coverEditor.img;if(!canvas||!img)return;
 const ctx=canvas.getContext('2d'),cw=canvas.width,ch=canvas.height,base=Math.max(cw/img.naturalWidth,ch/img.naturalHeight),scale=base*coverEditor.zoom,w=img.naturalWidth*scale,h=img.naturalHeight*scale;
 const maxX=Math.max(0,(w-cw)/2),maxY=Math.max(0,(h-ch)/2);coverEditor.x=Math.max(-maxX,Math.min(maxX,coverEditor.x));coverEditor.y=Math.max(-maxY,Math.min(maxY,coverEditor.y));
 ctx.clearRect(0,0,cw,ch);ctx.drawImage(img,(cw-w)/2+coverEditor.x,(ch-h)/2+coverEditor.y,w,h);
}
function openCoverEditor(file){
 if(!isViewingOwnProfile())return alert('Редактировать обложку можно только в своём профиле.');
 if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))return alert('Используйте PNG, JPG или WEBP.');
 ensureCoverEditor();const img=new Image(),url=URL.createObjectURL(file);
 img.onload=()=>{URL.revokeObjectURL(url);coverEditor.img=img;coverEditor.x=0;coverEditor.y=0;coverEditor.zoom=1;document.getElementById('coverEditorZoom').value='1';document.getElementById('coverEditorModal').hidden=false;drawCoverEditor()};
 img.onerror=()=>{URL.revokeObjectURL(url);alert('Не удалось открыть изображение.')};img.src=url;
}
function closeCoverEditor(){const m=document.getElementById('coverEditorModal');if(m)m.hidden=true;coverEditor.img=null;coverEditor.drag=false;coverEditor.last=null}
async function saveCoverEditor(){
 if(!isViewingOwnProfile())return closeCoverEditor();const canvas=document.getElementById('coverEditorCanvas');if(!canvas||!coverEditor.img)return;
 const btn=document.getElementById('coverEditorSave');if(btn)btn.disabled=true;
 try{const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('blob')),'image/jpeg',0.88));const edited=new File([blob],`cover-${Date.now()}.jpg`,{type:'image/jpeg'});edited.__coverEdited=true;closeCoverEditor();await upload('cover',edited)}
 catch(e){console.error(e);alert('Не удалось подготовить обложку.')}finally{if(btn)btn.disabled=false}
}

function openAvatarEditor(file){if(!isViewingOwnProfile()){const inp=$('#avatarInput');if(inp)inp.value='';return}
 if(!file||!file.type.startsWith('image/'))return alert('Выбери изображение.');
 if(file.size>8*1024*1024)return alert('Исходная фотография слишком большая. Максимум 8 МБ.');
 const modal=ensureAvatarEditor();
 if(avatarEditor.objectUrl)URL.revokeObjectURL(avatarEditor.objectUrl);
 avatarEditor.objectUrl=URL.createObjectURL(file);avatarEditor.file=file;avatarEditor.zoom=1;avatarEditor.x=0;avatarEditor.y=0;
 modal.querySelector('#avatarEditorZoom').value='1';
 const img=new Image();avatarEditor.img=img;
 img.onload=()=>{modal.hidden=false;drawAvatarEditor()};
 img.onerror=()=>alert('Не удалось открыть изображение.');
 img.src=avatarEditor.objectUrl;
}
async function saveAvatarEditor(){if(!isViewingOwnProfile())return;
 const canvas=document.getElementById('avatarEditorCanvas');if(!canvas||!avatarEditor.img)return;
 const btn=document.querySelector('#avatarEditorModal [data-ae-save]');if(btn)btn.disabled=true;
 try{
  const out=document.createElement('canvas');out.width=768;out.height=768;
  const ctx=out.getContext('2d'),src=canvas;
  ctx.drawImage(src,0,0,src.width,src.height,0,0,out.width,out.height);
  const blob=await new Promise(resolve=>out.toBlob(resolve,'image/jpeg',0.9));
  if(!blob)throw new Error('Не удалось подготовить изображение');
  const file=new File([blob],`avatar-${Date.now()}.jpg`,{type:'image/jpeg'});
  document.getElementById('avatarEditorModal').hidden=true;
  await upload('avatar',file);
  if(avatarEditor.objectUrl){URL.revokeObjectURL(avatarEditor.objectUrl);avatarEditor.objectUrl=null}
 }catch(err){console.error('avatar editor',err);alert('Не удалось сохранить аватар: '+err.message)}
 finally{if(btn)btn.disabled=false}
}

function setupProfileTools(){
 if(!$('#deleteAvatarBtn')){const i=$('#avatarInput');if(i){const b=document.createElement('button');b.type='button';b.id='deleteAvatarBtn';b.className='deleteMediaBtn avatarDeleteIcon';b.title='Удалить аватар';b.setAttribute('aria-label','Удалить аватар');b.textContent='×';b.onclick=e=>{e.preventDefault();e.stopPropagation();deleteProfileMedia('avatar')};const lab=i.closest('label');(lab||i).insertAdjacentElement('afterend',b)}}
 if(!$('#deleteCoverBtn')){const i=$('#coverInput');if(i){const b=document.createElement('button');b.type='button';b.id='deleteCoverBtn';b.className='deleteMediaBtn';b.textContent='Удалить обложку';b.onclick=()=>deleteProfileMedia('cover');i.insertAdjacentElement('afterend',b)}}
 updateProfileMediaDeleteButtons();
 if($('#cropModal'))return;
 const crop=document.createElement('div');crop.id='cropModal';crop.className='cropModal';crop.hidden=true;crop.innerHTML=`<div class="cropCard"><div class="cropHead"><b id="cropTitle">Настройка изображения</b><button data-crop-close>×</button></div><div class="cropStage"><canvas id="cropCanvas" width="420" height="420"></canvas><div id="cropMask" class="cropMask round"></div></div><label class="cropZoom">Масштаб <input id="cropZoom" type="range" min="1" max="3" step=".01" value="1"></label><div class="cropHint">Перетаскивайте фотографию мышью или пальцем</div><div class="cropActions"><button data-crop-cancel>Отмена</button><button class="primary" data-crop-save>Сохранить</button></div></div>`;
 document.body.appendChild(crop);crop.querySelector('[data-crop-close]').onclick=crop.querySelector('[data-crop-cancel]').onclick=()=>crop.hidden=true;$('#cropZoom').oninput=e=>{if(cropState){cropState.zoom=+e.target.value;drawCrop()}};
 const cv=$('#cropCanvas');let drag=false,last=null;const pt=e=>{const t=e.touches?.[0]||e;return{x:t.clientX,y:t.clientY}};const down=e=>{if(!cropState)return;drag=true;last=pt(e);e.preventDefault()};const move=e=>{if(!drag)return;const q=pt(e);cropState.x+=q.x-last.x;cropState.y+=q.y-last.y;last=q;drawCrop();e.preventDefault()};const up=()=>drag=false;cv.addEventListener('mousedown',down);cv.addEventListener('mousemove',move);window.addEventListener('mouseup',up);cv.addEventListener('touchstart',down,{passive:false});cv.addEventListener('touchmove',move,{passive:false});window.addEventListener('touchend',up);
 crop.querySelector('[data-crop-save]').onclick=saveCrop;
 setupSettingsPanel();
}
function openCropper(file,type='avatar'){
 if(!file?.type?.startsWith('image/'))return alert('Выберите изображение.');const img=new Image();img.onload=()=>{cropState={img,type,x:0,y:0,zoom:1};$('#cropTitle').textContent=type==='avatar'?'Настройка аватара':'Настройка обложки';$('#cropMask').className='cropMask '+(type==='avatar'?'round':'cover');$('#cropZoom').value=1;$('#cropModal').hidden=false;drawCrop()};img.src=URL.createObjectURL(file)
}
function drawCrop(){const c=$('#cropCanvas'),ctx=c.getContext('2d'),st=cropState;if(!st)return;ctx.clearRect(0,0,c.width,c.height);const base=Math.max(c.width/st.img.width,c.height/st.img.height),sc=base*st.zoom,w=st.img.width*sc,h=st.img.height*sc;ctx.drawImage(st.img,(c.width-w)/2+st.x,(c.height-h)/2+st.y,w,h)}
async function saveCrop(){
 const st=cropState;if(!st||!me)return;const src=$('#cropCanvas'),out=document.createElement('canvas');if(st.type==='avatar'){out.width=out.height=720;out.getContext('2d').drawImage(src,0,0,420,420,0,0,720,720)}else{out.width=1600;out.height=600;out.getContext('2d').drawImage(src,0,131,420,158,0,0,1600,600)}
 out.toBlob(async blob=>{if(!blob)return;const bucket=st.type==='avatar'?'avatars':'covers',path=`${me.id}/${Date.now()}.webp`;const {error}=await sb.storage.from(bucket).upload(path,blob,{contentType:'image/webp',upsert:true});if(error)return alert(error.message);const {data}=sb.storage.from(bucket).getPublicUrl(path),field=st.type==='avatar'?'avatar_url':'cover_url';const {error:e}=await sb.from('profiles').update({[field]:data.publicUrl}).eq('id',me.id);if(e)return alert(e.message);profile={...profile,[field]:data.publicUrl};$('#cropModal').hidden=true;renderProfile();alert(st.type==='avatar'?'Аватар обновлён.':'Обложка обновлена.')},'image/webp',.88)
}
function setupSettingsPanel(){
 if($('#accountSettings'))return;const el=document.createElement('div');el.id='accountSettings';el.className='settingsModal';el.hidden=true;el.innerHTML=`<div class="settingsCard"><div class="settingsHead"><b>Настройки аккаунта</b><button data-settings-close>×</button></div><label>Кто может писать в личку<select id="dmPrivacy"><option value="everyone">Все пользователи</option><option value="friends">Только друзья</option><option value="nobody">Никто</option></select></label><h4>Уведомления</h4><label><input id="nDm" type="checkbox"> Личные сообщения</label><label><input id="nFriends" type="checkbox"> Заявки в друзья</label><label><input id="nReplies" type="checkbox"> Ответы</label><label><input id="nReactions" type="checkbox"> Реакции</label><label><input id="nSystem" type="checkbox"> Системные</label><hr><button id="changePasswordBtn">Сменить пароль</button><button id="logoutAllBtn">Выйти со всех устройств</button><button class="primary" id="saveSettingsBtn">Сохранить настройки</button></div>`;document.body.appendChild(el);el.querySelector('[data-settings-close]').onclick=()=>el.hidden=true;$('#saveSettingsBtn').onclick=saveAccountSettings;$('#changePasswordBtn').onclick=changeMyPassword;$('#logoutAllBtn').onclick=logoutAllSessions
}
function openAccountSettings(){setupProfileTools();$('#dmPrivacy').value=profile.dm_privacy||'everyone';$('#nDm').checked=profile.notify_dm!==false;$('#nFriends').checked=profile.notify_friends!==false;$('#nReplies').checked=profile.notify_replies!==false;$('#nReactions').checked=profile.notify_reactions!==false;$('#nSystem').checked=profile.notify_system!==false;$('#accountSettings').hidden=false}
async function saveAccountSettings(){const args={p_dm_privacy:$('#dmPrivacy').value,p_notify_dm:$('#nDm').checked,p_notify_friends:$('#nFriends').checked,p_notify_replies:$('#nReplies').checked,p_notify_reactions:$('#nReactions').checked,p_notify_system:$('#nSystem').checked};const {error}=await sb.rpc('update_my_preferences',args);if(error)return alert(error.message);Object.assign(profile,{dm_privacy:args.p_dm_privacy,notify_dm:args.p_notify_dm,notify_friends:args.p_notify_friends,notify_replies:args.p_notify_replies,notify_reactions:args.p_notify_reactions,notify_system:args.p_notify_system});$('#accountSettings').hidden=true;alert('Настройки сохранены.')}
async function changeMyPassword(){const a=prompt('Новый пароль (минимум 6 символов):');if(!a)return;if(a.length<6)return alert('Пароль слишком короткий.');const b=prompt('Повторите новый пароль:');if(a!==b)return alert('Пароли не совпадают.');const {error}=await sb.auth.updateUser({password:a});if(error)return alert(error.message);alert('Пароль изменён.')}
async function logoutAllSessions(){if(!confirm('Выйти со всех устройств, включая это?'))return;const {error}=await sb.auth.signOut({scope:'global'});if(error)return alert(error.message);location.reload()}


function updateAdminUI(){
 let b=$('#adminNavBtn');if(profile?.is_admin){if(!b){b=document.createElement('button');b.id='adminNavBtn';b.className='adminNavBtn';b.innerHTML='⚙ Модерация <span id="adminNavCount" hidden></span>';const host=$('#logoutBtn')?.parentElement||document.querySelector('header');host?.insertBefore(b,$('#logoutBtn')||null);b.onclick=openAdminPanel}b.hidden=false;refreshAdminStats()}else if(b)b.hidden=true
}

const cfg=window.APP_CONFIG||{};const ready=cfg.supabaseUrl&&!cfg.supabaseUrl.includes('PASTE_')&&cfg.supabaseAnonKey&&!cfg.supabaseAnonKey.includes('PASTE_');const sb=ready?supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;let me=null,profile=null,profiles=[],onlineIds=new Set();const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);const esc=s=>{const d=document.createElement('div');d.textContent=s??'';return d.innerHTML};
const DEMO_PROFILES=[
{id:'demo1',nickname:'Виталий_77',donation_total:12500,subscription_active:true,friend:true,bio:'На связи. Уважение к людям — прежде всего.'},
{id:'demo2',nickname:'Старый_двор',donation_total:8700,subscription_active:true,friend:true,bio:'Старые друзья и спокойный разговор. Без лишнего шума.',message_count:811,reputation:93},
{id:'demo3',nickname:'Кирилл_МСК',donation_total:6400,subscription_active:true,bio:'Москва. Всегда на связи с нормальными людьми.',message_count:476,reputation:72},
{id:'demo4',nickname:'Закон_вор',donation_total:5200,subscription_active:false,bio:'Ценю слово, уважение и честный разговор.',message_count:305,reputation:61},
{id:'demo5',nickname:'Андрей_74',donation_total:950,subscription_active:true,friend:true,bio:'Челябинск. За взаимное уважение.',message_count:228,reputation:54},
{id:'demo6',nickname:'Тихий',donation_total:120,subscription_active:false,bio:'Больше слушаю, чем говорю.',message_count:119,reputation:38},
{id:'demo7',nickname:'Брат_по_понятиям',donation_total:100,subscription_active:false,bio:'Свои люди всегда найдут общий язык.',message_count:97,reputation:35},
{id:'demo8',nickname:'Лёха_Сибирь',donation_total:0,subscription_active:false},
{id:'demo9',nickname:'Димон_Вор',donation_total:0,subscription_active:false},
{id:'demo10',nickname:'Мурманск_51',donation_total:0,subscription_active:false}
];
const DEMO_MESSAGES=[
{user_id:'demo1',body:'Всем уважение! Кто сегодня на связи?',created_at:new Date(Date.now()-16*60000).toISOString(),profiles:DEMO_PROFILES[0]},
{user_id:'demo2',body:'Заходим, общаемся, не забываем про уважение.',created_at:new Date(Date.now()-14*60000).toISOString(),profiles:DEMO_PROFILES[1]},
{user_id:'demo3',body:'Жизнь — это не только про деньги, братва...',created_at:new Date(Date.now()-12*60000).toISOString(),profiles:DEMO_PROFILES[2]},
{user_id:'demo5',body:'Всем добра и крепкого здоровья! 👊',created_at:new Date(Date.now()-8*60000).toISOString(),profiles:DEMO_PROFILES[4]}
];
let peopleFilter='all';
function tier(n=0){return n>=10000?'Авторитет':n>=5000?'Блатной':n>=500?'Старший':n>=100?'Бродяга':'Обычный пользователь'}
function tierSlug(n=0){return n>=10000?'avtoritet':n>=5000?'blatnoy':n>=500?'starshiy':n>=100?'brodyaga':'regular'}
function tierCrown(p={}){return (p.donation_total||0)>=100?`<span class=\"tier-crown\" title=\"${esc(tier(p.donation_total))}\">♛</span>`:''}
function glowClass(p={}){const s=tierSlug(p.donation_total||0);return `tier-${s}${p.subscription_active&&['starshiy','blatnoy','avtoritet'].includes(s)?' subscriber-glow':''}`}
function avatarHTML(p,size=''){return `<div class="avatar ${size}">${p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc((p?.nickname||'?')[0].toUpperCase())}</div>`}
function setView(name){$$('.view').forEach(v=>v.classList.remove('active'));$('#view-'+name)?.classList.add('active');$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='profile'&&!me&&ready){openAuth();setView('chat');return}if(name==='profile'){viewedProfile=null;if(me)loadProfile().then(()=>{renderProfile();renderAuth();renderProfileWidget()});else renderProfile();}if(name==='users')renderUsers(profiles);window.scrollTo({top:0,behavior:'smooth'})}$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function openAuth(){if(!ready){alert('Сейчас сайт работает в демонстрационном режиме. Реальная регистрация включится после подключения базы.');return}$('#authModal').classList.add('show')}$('#authClose').onclick=()=>$('#authModal').classList.remove('show');
let payMode='once';function openSupport(){$('#supportModal').classList.add('show')}$('#supportClose').onclick=()=>$('#supportModal').classList.remove('show');$('#supportBtn').onclick=openSupport;$('#supportBtn2').onclick=openSupport;const mobileSupportBtn=$('#mobileSupportBtn');if(mobileSupportBtn)mobileSupportBtn.onclick=openSupport;$$('[data-paymode]').forEach(b=>b.onclick=()=>{payMode=b.dataset.paymode;$$('[data-paymode]').forEach(x=>x.classList.toggle('active',x===b))});$$('.supportLevels button').forEach(b=>b.onclick=()=>{const label=payMode==='monthly'?'ежемесячная подписка':'разовая поддержка';alert('Выбрано: '+label+' от '+b.dataset.amount+' ₽. Для настоящего списания нужно подключить платёжного провайдера и webhook.')});
function renderAd(){const ad=cfg.advertising||{};$('#adLink').href=ad.link||'#';if(ad.image){$('#adImage').style.backgroundImage=`linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.35)),url('${ad.image}')`;$('#adImage').innerHTML=''}}renderAd();
async function refreshSession(){
  if(!sb)return renderAuth();
  const {data:{session}}=await sb.auth.getSession();
  me=session?.user||null;
  profile=null;
  if(me) await loadProfile();
  renderAuth();
  renderProfileWidget();
  if(profile) renderProfile();
  if(sb){await Promise.allSettled([loadMessages(),loadUsers()]);}
}
async function loadProfile(){
  if(!me){profile=null;return}
  let {data,error}=await sb.from('profiles').select('*').eq('id',me.id).maybeSingle();
  if((error||!data)){
    const repaired=await sb.rpc('ensure_my_profile');
    if(!repaired.error){
      const retry=await sb.from('profiles').select('*').eq('id',me.id).maybeSingle();
      data=retry.data; error=retry.error;
    }
  }
  profile=data||null;
}
function renderAuth(){
  const area=$('#authArea');
  if(me){
    const nick=profile?.nickname||me.user_metadata?.nickname||'Пользователь';
    const p=profile||{nickname:nick,donation_total:0,subscription_active:false,avatar_url:null};
    area.innerHTML=`<div class="authUser ${glowClass(p)}">${avatarHTML(p)}<div><b>${esc(nick)}${tierCrown(p)}</b><small>● Онлайн</small></div><button class="tiny" id="logout">Выйти</button></div>`;
    $('#logout').onclick=async()=>{await sb.auth.signOut();location.reload()}
  }else{
    area.innerHTML='<button class="authBtn" id="loginOpen">Войти</button>';
    $('#loginOpen').onclick=openAuth
  }
}
async function nicknameLoginEmail(nickname){
  const normalized=nickname.trim().toLowerCase().normalize('NFKC');
  const bytes=new TextEncoder().encode(normalized);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${hash}@users.invalid`;
}
function validNickname(n){return n.length>=3&&n.length<=24&&/^[\p{L}\p{N}_-]+$/u.test(n)}
$('#registerBtn').onclick=async()=>{
  const nickname=$('#nickname').value.trim().normalize('NFKC'),password=$('#password').value,repeat=$('#passwordRepeat').value,msg=$('#authMsg');
  if(!validNickname(nickname)){msg.textContent='Ник: 3–24 символа, только буквы, цифры, _ и -.';return}
  if(password.length<6){msg.textContent='Пароль — минимум 6 символов.';return}
  if(password!==repeat){msg.textContent='Пароли не совпадают.';return}
  msg.textContent='Создаём аккаунт…';
  try{
    const {data:payload,error:invokeError}=await sb.functions.invoke('register-nickname',{
      body:{nickname,password}
    });
    if(invokeError){
      let detail='Не удалось связаться с сервером регистрации.';
      try{
        const ctx=invokeError.context;
        if(ctx&&typeof ctx.json==='function'){
          const body=await ctx.json();
          if(body?.error) detail=body.error;
        }
      }catch(_){}
      msg.textContent=detail;
      return
    }
    if(payload?.error){msg.textContent=payload.error;return}
    const email=payload?.login_email||await nicknameLoginEmail(nickname);
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){msg.textContent='Аккаунт создан, но автоматический вход не удался. Нажмите «Войти».';return}
    msg.textContent='Аккаунт создан. Вы вошли на сайт.';
    $('#authModal').classList.remove('show');
    await refreshSession();await Promise.all([loadMessages(),loadUsers()]);connectPresence()
  }catch(e){msg.textContent='Нет связи с сервером регистрации.'}
};
$('#loginBtn').onclick=async()=>{
  const nickname=$('#nickname').value.trim().normalize('NFKC'),password=$('#password').value,msg=$('#authMsg');
  if(!validNickname(nickname)){msg.textContent='Введите свой ник.';return}
  if(!password){msg.textContent='Введите пароль.';return}
  msg.textContent='Входим…';
  const email=await nicknameLoginEmail(nickname);
  const {error}=await sb.auth.signInWithPassword({email,password});
  msg.textContent=error?'Неверный ник или пароль. Если аккаунт создан в старой тестовой версии, зарегистрируйте новый ник.':'';
  if(!error){$('#authModal').classList.remove('show');await refreshSession();await Promise.all([loadMessages(),loadUsers()]);connectPresence();connectDirectInbox();connectUserBlocks();connectChatPins();connectDirectMessages()}
};
function renderProfileWidget(){const p=profile;if(!p){if(me){const nick=me.user_metadata?.nickname||'Пользователь';$('#widgetNick').textContent=nick;$('#widgetOnline').textContent='в сети';$('#tierStat').textContent='Без ранга';$('#supportStat').textContent='0 ₽';$('#widgetAvatar').textContent=nick[0]?.toUpperCase()||'?';return}$('#widgetNick').textContent='Гость';$('#widgetOnline').textContent='не авторизован';$('#tierStat').textContent='—';$('#supportStat').textContent='0 ₽';$('#widgetAvatar').textContent='?';return}$('#widgetNick').textContent=p.nickname;$('#widgetOnline').textContent='в сети';$('#tierStat').textContent=tier(p.donation_total);$('#supportStat').textContent=(p.donation_total||0)+' ₽';$('#widgetAvatar').innerHTML=p.avatar_url?`<img src="${esc(p.avatar_url)}">`:esc(p.nickname[0].toUpperCase())};const wn=$('#widgetNick');if(wn){wn.classList.add('profileNickDirect');wn.setAttribute('role','link');wn.tabIndex=0;wn.onclick=()=>goToUserProfile(p)}
let viewedProfile=null;
function isViewingOwnProfile(){if(!me)return false;const shown=viewedProfile||profile;return !!shown&&String(shown.id)===String(me.id)}
function enforceProfileMediaOwnership(){const own=isViewingOwnProfile();const controls=[$('#avatarInput'),$('#coverInput'),$('#deleteAvatarBtn'),$('#deleteCoverBtn')];controls.forEach(el=>{if(!el)return;el.disabled=!own;el.hidden=!own;el.style.display=own?'':'none';el.style.pointerEvents=own?'':'none';const host=el.tagName==='INPUT'?(el.closest('label')||el):el;if(host!==el){host.hidden=!own;host.style.display=own?'':'none'}});const edit=$('#editProfileBtn')||document.querySelector('[data-edit-profile]');if(edit){edit.hidden=!own;edit.disabled=!own;edit.style.display=own?'':'none'}if(!own){const ed=$('#profileEditor');if(ed)ed.classList.remove('show')}return own}
function renderProfile(){setupProfileTools();updateAdminUI();const p=viewedProfile||profile||(me?{id:me.id,nickname:me.user_metadata?.nickname||'Пользователь',donation_total:0,subscription_active:false,reputation:0}:(!ready?DEMO_PROFILES[0]:null));if(!p)return;const amount=p.donation_total||0,slug=tierSlug(amount),name=tier(amount);$('#profileNick').textContent=p.nickname;$('#profileOnline').textContent='в сети';$('#profileTier').textContent=name;$('#profileTier').className='tierBadge tier-'+slug;$('#subscriptionBadge').textContent=p.subscription_active?'♛ Подписка активна':'Без активной подписки';$('#profileCrown').innerHTML=amount>=100?'♛':'';$('#profileIdentityCard').className='profileIdentityCard '+glowClass(p);$('#tierInfo').textContent=name;$('#rankDescription').textContent=amount>=10000?'Высшая ступень поддержки сообщества.':amount>=5000?'Золотой знак участника и особый статус.':amount>=500?'Серебряный знак поддержки сообщества.':amount>=100?'Первый донатерский статус и бронзовый знак.':'Поддержите проект, чтобы получить особый знак рядом с ником.';$('#profileSupportTotal').textContent=amount.toLocaleString('ru-RU')+' ₽';$('#profileReputation').textContent=p.reputation??0;$('#profileMessageCount').textContent=p.message_count??0;$('#profileSince').textContent=p.created_at?new Date(p.created_at).toLocaleDateString('ru-RU',{month:'short',year:'numeric'}):'2026';$('#bio').value=p.bio||'';$('#nicknameEdit').value=p.nickname||'';$('#bioDisplay').textContent=p.bio||'Пользователь пока ничего о себе не рассказал.';const own=isViewingOwnProfile();
 const avatarInput=$('#avatarInput'),coverInput=$('#coverInput'),deleteAvatar=$('#deleteAvatarBtn'),deleteCover=$('#deleteCoverBtn');
 if(avatarInput){const host=avatarInput.closest('label')||avatarInput;host.hidden=!own;avatarInput.disabled=!own}
 if(coverInput){const host=coverInput.closest('label')||coverInput;host.hidden=!own;coverInput.disabled=!own}
 if(deleteAvatar)deleteAvatar.hidden=!own;
 if(deleteCover)deleteCover.hidden=!own;
 const editor=$('#profileEditor');if(editor&&!own)editor.classList.remove('show');const editBtn=$('#editProfileBtn')||document.querySelector('[data-edit-profile]');if(editBtn)editBtn.hidden=!own;if(own&&editBtn&&!$('#accountSettingsBtn')){const b=document.createElement('button');b.id='accountSettingsBtn';b.type='button';b.textContent='⚙ Настройки';b.className=editBtn.className;b.onclick=openAccountSettings;editBtn.insertAdjacentElement('afterend',b)}else if($('#accountSettingsBtn'))$('#accountSettingsBtn').hidden=!own;const bioInput=$('#bio');if(bioInput)bioInput.readOnly=!own;const nickInput=$('#nicknameEdit');if(nickInput)nickInput.readOnly=!own;$('#profileAvatar').innerHTML=p.avatar_url?`<img src="${esc(p.avatar_url)}">`:esc(p.nickname[0].toUpperCase());if(p.cover_url)$('#profileCover').style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.72)),url('${p.cover_url}')`;const levels=[100,500,5000,10000];const next=levels.find(x=>amount<x);const prev=amount>=5000?5000:amount>=500?500:amount>=100?100:0;const target=next||10000;const pct=next?Math.max(0,Math.min(100,((amount-prev)/(target-prev))*100)):100;$('#rankProgressFill').style.width=pct+'%';$('#rankNext').textContent=next?`До следующего статуса — ${(next-amount).toLocaleString('ru-RU')} ₽`:'Максимальный статус достигнут';const rc=$('#rankCrown');rc.style.fontSize=slug==='avtoritet'?'76px':slug==='blatnoy'?'64px':slug==='starshiy'?'54px':slug==='brodyaga'?'44px':'38px';rc.style.color=slug==='avtoritet'?'#ffcf42':slug==='blatnoy'?'#ffc72d':slug==='starshiy'?'#d7dde1':'#b66b3c';;enforceProfileMediaOwnership();if(viewedProfile&&me&&String(viewedProfile.id)!==String(me.id))ensureViewedProfileActions(viewedProfile);else{const va=$('#viewedProfileActions');if(va)va.hidden=true}}
async function upload(kind,file){if(!file)return;if(kind==='cover'&&!file.__coverEdited){openCoverEditor(file);return}if(!isViewingOwnProfile()){alert('Редактировать фотографии можно только в своём профиле.');return}if(!me){alert('Сессия не найдена. Войдите в аккаунт заново.');return}if(file.size>5*1024*1024){alert('Максимальный размер файла — 5 МБ.');return}if(!/^image\/(png|jpeg|webp)$/.test(file.type)){alert('Используйте PNG, JPG или WEBP.');return}const ext=file.name.split('.').pop();const path=`${me.id}/${kind}-${Date.now()}.${ext}`;const bucket=kind==='avatar'?'avatars':'covers';const max=kind==='avatar'?2*1024*1024:5*1024*1024;if(file.size>max){alert(kind==='avatar'?'Аватар — максимум 2 МБ.':'Обложка — максимум 5 МБ.');return}const {error}=await sb.storage.from(bucket).upload(path,file,{upsert:true});if(error){console.error('storage upload',error);return alert('Ошибка загрузки файла: '+error.message)}const {data}=sb.storage.from(bucket).getPublicUrl(path);const {error:updateError}=await sb.from('profiles').update({[kind==='avatar'?'avatar_url':'cover_url']:data.publicUrl}).eq('id',me.id);if(updateError){console.error('profile media update',updateError);return alert('Файл загружен, но профиль не обновился: '+updateError.message)}await loadProfile();await loadUsers();viewedProfile=null;const inp=document.getElementById(kind==='avatar'?'avatarInput':'coverInput');if(inp)inp.value='';renderProfile();renderAuth();renderProfileWidget();updateProfileMediaDeleteButtons()}
$('#avatarInput').onchange=e=>{const shown=viewedProfile||profile;if(!me||!shown||String(shown.id)!==String(me.id)){e.target.value='';return}openAvatarEditor(e.target.files[0])};
$('#coverInput').onchange=e=>{const shown=viewedProfile||profile;if(!me||!shown||String(shown.id)!==String(me.id)){e.target.value='';return}upload('cover',e.target.files[0])};$('#editProfileBtn').onclick=()=>{$('#profileEditor').classList.add('show');$('#bioDisplay').style.display='none'};$('#cancelProfileEdit').onclick=()=>{$('#profileEditor').classList.remove('show');$('#bioDisplay').style.display='block';renderProfile()};$('#saveProfile').onclick=async()=>{if(!ready){$('#bioDisplay').textContent=$('#bio').value.trim()||'Пользователь пока ничего о себе не рассказал.';$('#profileNick').textContent=$('#nicknameEdit').value.trim()||'Виталий_77';$('#profileEditor').classList.remove('show');$('#bioDisplay').style.display='block';return}if(!me)return openAuth();const nickname=$('#nicknameEdit').value.trim();if(nickname.length<3)return alert('Ник должен быть не короче 3 символов.');const {error}=await sb.from('profiles').update({nickname,bio:$('#bio').value.trim()}).eq('id',me.id);if(error)return alert(error.message);await loadProfile();renderProfile();renderAuth();renderProfileWidget();$('#profileEditor').classList.remove('show');$('#bioDisplay').style.display='block'};
let demoMessages=DEMO_MESSAGES.map((m,i)=>({...m,id:'dm'+i,reactions:i===0?{'👊':2,'🔥':1}:i===1?{'👍':3}:{}}));let currentRows=demoMessages,replyTo=null,directUser=null;
function setReply(m){replyTo=m;$('#replyPreview').hidden=false;$('#replyText').textContent=(m.profiles?.nickname||'Пользователь')+': '+m.body;$('#messageInput').focus()}
async function loadMessages(){
 if(!sb)return;
 const {data,error}=await sb.from('messages').select('id,body,created_at,user_id,reply_to,profiles(nickname,avatar_url,donation_total,subscription_active)').order('created_at',{ascending:true}).limit(120);
 if(error){console.error('loadMessages',error);$('#messages').innerHTML='<div class="empty">Не удалось загрузить сообщения. Обновите страницу.</div>';return}
 const rows=data||[], byId=new Map(rows.map(x=>[Number(x.id),x]));
 const ids=rows.map(x=>x.id);
 let reactionRows=[];
 if(ids.length){const rr=await sb.from('message_reactions').select('message_id,user_id,emoji').in('message_id',ids);reactionRows=rr.data||[]}
 for(const m of rows){
   if(m.reply_to&&byId.has(Number(m.reply_to))){const q=byId.get(Number(m.reply_to));m.reply={nick:q.profiles?.nickname||'Пользователь',text:q.body}}
   m.reactions={};
   for(const r of reactionRows.filter(x=>String(x.message_id)===String(m.id)))m.reactions[r.emoji]=(m.reactions[r.emoji]||0)+1;
 }
 renderMessages(rows);
 if(me){const count=rows.filter(m=>m.user_id===me.id).length;$('#messageStat').textContent=count}
if(!directUser)await loadChatPin();updateProfileMediaDeleteButtons();if(viewedProfile)ensureViewedProfileActions(viewedProfile);else{$('#viewedProfileActions')&&($('#viewedProfileActions').hidden=true)}
}
async function loadUsers(){if(!sb)return;const {data,error}=await sb.from('profiles').select('*').order('donation_total',{ascending:false}).limit(100);if(error){console.error('loadUsers',error);return}profiles=data||[];renderPeople(profiles);renderUsers(profiles);renderDonors(profiles);if(me)await loadDirectInbox()}

/* v92: local nickname links only — no global event interception */
function openNickProfile(uid){
 const p=profiles.find(x=>String(x.id)===String(uid)) ||
         (profile&&String(profile.id)===String(uid)?profile:null);
 if(!p)return false;
 goToUserProfile(p);
 return false;
}
function profileNickHtml(p,extraClass=''){
 if(!p?.id)return esc(p?.nickname||'Пользователь');
 const uid=String(p.id).replace(/'/g,"&#39;");
 return `<span class="profileNickDirect ${extraClass}" role="link" tabindex="0" data-open-user-nick="${esc(String(p.id))}" onclick="event.stopPropagation();openNickProfile('${uid}');return false">${esc(p.nickname||'Пользователь')}</span>`;
}

document.addEventListener('keydown',e=>{
 if((e.key!=='Enter'&&e.key!==' ')||!e.target.matches?.('[data-open-user-nick]'))return;
 e.preventDefault();e.stopPropagation();openNickProfile(e.target.dataset.openUserNick);
});

function renderPeople(list){const base=peopleFilter==='friends'?list:list;const filtered=base.slice(0,12);$('#onlineUsers').innerHTML=filtered.map(p=>{const on=onlineIds.has(p.id);return `<div class="person ${glowClass(p)}" data-person-id="${esc(p.id)}">${avatarHTML(p)}<div class="personMeta"><b>${profileNickHtml(p)}${tierCrown(p)}</b><small>${on?'● в сети':'○ не в сети'} · ${esc(tier(p.donation_total))}</small></div></div>`}).join('')||'<div class="empty">Пока никого</div>';$('#onlineUsers').querySelectorAll('[data-person-id]').forEach(el=>el.onclick=()=>{const p=profiles.find(p=>String(p.id)===el.dataset.personId),f=p&&friendshipWith(p.id);if(f?.status==='accepted')goToUserProfile(p);else openUserProfile(p)});const n=onlineIds.size||filtered.length;$('#onlineCount').textContent=n;$('#onlineCount2').textContent=n}
function renderUsers(list){
 const grid=$('#usersGrid');if(!grid)return;
 $('#usersFound').textContent=list.length;
 grid.innerHTML=list.map(p=>{
  const slug=tierSlug(p.donation_total||0),isOnline=onlineIds.has(p.id);
  return `<article class="panel userCard ${glowClass(p)}" data-user-id="${esc(p.id)}" tabindex="0"><div class="userCardTop">${avatarHTML(p)}<div class="userCardName"><h3><span class="profileNickDirect usersPageNick" role="link" tabindex="0">${esc(p.nickname||'Пользователь')}</span>${tierCrown(p)}</h3><span class="userStatus ${isOnline?'online':'offline'}">${isOnline?'● Сейчас онлайн':'○ Не в сети'}</span></div></div><div class="userRank"><span class="userRankCrown ${slug}">${slug==='regular'?'•':'♛'}</span><div class="userRankText"><b>${esc(tier(p.donation_total))}</b><small>${(p.donation_total||0).toLocaleString('ru-RU')} ₽ поддержки${p.subscription_active?' · подписка активна':''}</small></div></div><p class="userCardBio">${esc(p.bio||'Участник сообщества «КТО ПО ЖИЗНИ».')}</p><button type="button" class="userCardAction">Открыть профиль →</button></article>`
 }).join('')||'<div class="panel empty">По выбранным условиям никого не найдено.</div>';

 grid.onclick=e=>{
  const trigger=e.target.closest('.usersPageNick,.userCardAction');
  if(!trigger)return;
  const card=trigger.closest('.userCard[data-user-id]');
  if(!card)return;
  const user=profiles.find(x=>String(x.id)===String(card.dataset.userId));
  if(!user)return;
  e.preventDefault();
  e.stopPropagation();
  goToUserProfile(user);
 };
 grid.onkeydown=e=>{
  if((e.key!=='Enter'&&e.key!==' ')||!e.target.matches('.usersPageNick'))return;
  e.preventDefault();
  const card=e.target.closest('.userCard[data-user-id]');
  const user=card&&profiles.find(x=>String(x.id)===String(card.dataset.userId));
  if(user)goToUserProfile(user);
 };
}
function renderDonors(list){const d=list.filter(p=>p.donation_total>0).slice(0,5);$('#donorTop').innerHTML=d.map((p,i)=>`<div class="rankRow"><b>${i+1}.</b><span><button type="button" class="profileNickLink" data-profile-link="${esc(p.id)}">${esc(p.nickname)}</button></span><b>${p.donation_total} ₽</b></div>`).join('')||'<small>Пока нет донатов.</small>'}
function applyPeopleFilter(){let list=profiles;const q=$('#userSearch').value.toLowerCase();if(q)list=list.filter(p=>p.nickname.toLowerCase().includes(q));if(peopleFilter==='friends'){const ids=new Set(friendships.filter(f=>f.status==='accepted').map(f=>String(f.requester_id)===String(me?.id)?String(f.addressee_id):String(f.requester_id)));list=list.filter(p=>ids.has(String(p.id)));}if(peopleFilter==='donors')list=list.filter(p=>(p.donation_total||0)>=100);renderPeople(list)}$('#userSearch').oninput=applyPeopleFilter;$$('#peopleTabs button').forEach(b=>b.onclick=()=>{peopleFilter=b.dataset.filter;$$('#peopleTabs button').forEach(x=>x.classList.toggle('active',x===b));applyPeopleFilter()});

function connectUserBlocks(){if(!sb||!me)return;sb.channel('user-blocks-v48').on('postgres_changes',{event:'*',schema:'public',table:'user_blocks'},async()=>{await loadUserBlocks();if(viewedProfile)ensureViewedProfileActions(viewedProfile)}).subscribe()}
function connectDirectInbox(){
 if(!sb||!me)return;
 sb.channel('direct-inbox-v44').on('postgres_changes',{event:'*',schema:'public',table:'direct_messages'},()=>loadDirectInbox()).subscribe();
}
function connectPresence(){if(!sb||!me)return;const ch=sb.channel('online-users',{config:{presence:{key:me.id}}});ch.on('presence',{event:'sync'},()=>{const st=ch.presenceState();onlineIds=new Set(Object.keys(st));renderPeople(profiles)}).subscribe(async status=>{if(status==='SUBSCRIBED')await ch.track({user_id:me.id,online_at:new Date().toISOString()})})}
function setNoticeCount(value){const el=$('#noticeCount');if(!el)return;const n=Math.max(0,Number(value)||0);el.textContent=String(n);el.hidden=n===0}
setNoticeCount(0);
if($('#typingIndicator')) $('#typingIndicator').textContent='';
$('#bellBtn').onclick=e=>{e.stopPropagation();$('#noticeMenu').classList.toggle('show');setNoticeCount(0)};document.addEventListener('click',e=>{if(!e.target.closest('.noticeWrap'))$('#noticeMenu').classList.remove('show')});

function addDirectMessageNotice(message,sender){
  const feed=$('#noticeFeed'), count=$('#noticeCount');
  const nick=sender?.nickname||'Пользователь';
  if(feed){
    feed.querySelector('.noticeEmpty')?.remove();
    const row=document.createElement('div');
    row.className='noticeEvent directNotice';
    row.innerHTML=`💬 <b>${esc(nick)}</b> написал вам<small>${esc((message.body||'').slice(0,70))}</small>`;
    row.onclick=()=>{const p=profiles.find(x=>String(x.id)===String(message.sender_id));if(p)openDirectChat(p);$('#noticeMenu').classList.remove('show')};
    feed.prepend(row);
    while(feed.children.length>12)feed.lastElementChild.remove();
  }
  if(count) setNoticeCount(Math.min(99,(Number(count.textContent)||0)+1));
  if(document.hidden && 'Notification' in window && Notification.permission==='granted'){
    new Notification(`Сообщение от ${nick}`,{body:(message.body||'').slice(0,120)});
  }
}
async function handleIncomingDirect(payload){
  const m=payload.new;
  if(!me||String(m.recipient_id)!==String(me.id))return;
  let sender=profiles.find(p=>String(p.id)===String(m.sender_id));
  if(!sender){
    const {data}=await sb.from('profiles').select('*').eq('id',m.sender_id).maybeSingle();
    sender=data||null;
    if(sender&&!profiles.some(p=>String(p.id)===String(sender.id)))profiles.push(sender);
  }
  addDirectMessageNotice(m,sender);
  if(directUser&&String(directUser.id)===String(m.sender_id)) await openDirectChat(sender||directUser);
}
let directInboxChannel=null;
function connectDirectMessages(){
  if(!sb||!me)return;
  if(directInboxChannel) sb.removeChannel(directInboxChannel);

  directInboxChannel=sb.channel(`dm-inbox-${me.id}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages',filter:`recipient_id=eq.${me.id}`},handleIncomingDirect)
    .subscribe();
}

function clearReply(){replyTo=null;$('#replyPreview').hidden=true}$('#cancelReply').onclick=clearReply;

function mediaHTML(body){
 const raw=String(body||'').trim(), safe=esc(raw);
 if(/^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,}/i.test(raw)||/^https:\/\/youtu\.be\/[A-Za-z0-9_-]{6,}/i.test(raw)){
   const m=raw.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);if(m)return `<div class="videoEmbed"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="YouTube video" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div><a class="mediaLink" href="${safe}" target="_blank" rel="noopener noreferrer">Открыть на YouTube ↗</a>`;
 }
 if(/^https:\/\/(?:www\.)?vk\.com\/video_ext\.php\?/i.test(raw))return `<div class="videoEmbed vkEmbed"><iframe src="${safe}" title="VK Видео" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
 if(/^https:\/\/(?:www\.)?(?:vk\.com|vkvideo\.ru)\//i.test(raw))return `<a class="vkVideoCard" href="${safe}" target="_blank" rel="noopener noreferrer">▶ Видео VK<br><small>Для обычной ссылки VK не отдаёт безопасный embed-код. Открыть ролик ↗</small></a>`;
 if(/^https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?$/i.test(raw))return `<a href="${safe}" target="_blank" rel="noopener noreferrer"><img class="chatImage" src="${safe}" loading="lazy" alt="Изображение"></a>`;
 if(/^https?:\/\/\S+\.(?:mp3|ogg|wav|m4a|aac|webm)(?:\?\S*)?$/i.test(raw))return `<audio class="chatAudio" controls preload="metadata" src="${safe}"></audio>`;
 return safe.replace(/(https?:\/\/[^\s<]+)/g,'<a class="messageLink" href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
async function compressChatImage(file){
 const img=await createImageBitmap(file),max=1600,scale=Math.min(1,max/Math.max(img.width,img.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
 canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close?.();
 let q=.82,blob=await new Promise(r=>canvas.toBlob(r,'image/webp',q));
 while(blob&&blob.size>2*1024*1024&&q>.45){q-=.1;blob=await new Promise(r=>canvas.toBlob(r,'image/webp',q))}
 if(!blob)throw new Error('Не удалось обработать изображение.');
 if(blob.size>2*1024*1024)throw new Error('Изображение после сжатия всё ещё больше 2 МБ.');
 return new File([blob],(file.name.replace(/\.[^.]+$/,'')||'image')+'.webp',{type:'image/webp'});
}
function chatMediaPathFromUrl(url){
 try{const u=new URL(url);const mark='/storage/v1/object/public/chat-media/';const i=u.pathname.indexOf(mark);return i<0?'':decodeURIComponent(u.pathname.slice(i+mark.length))}catch{return ''}
}
async function deleteChatMediaForBody(body){
 const path=chatMediaPathFromUrl(String(body||'').trim());if(!path||!me||!path.startsWith(me.id+'/'))return;
 const {error}=await sb.functions.invoke('delete-chat-media',{body:{path}});
 if(error)console.warn('media cleanup:',error.message);
}
async function uploadChatMedia(file){
 const mediaBtn=$('#mediaBtn');if(mediaBtn){mediaBtn.disabled=true;mediaBtn.dataset.oldText=mediaBtn.textContent;mediaBtn.textContent='…'}
 if(!me||!sb||!file)return;
 let image=file.type.startsWith('image/'),audio=file.type.startsWith('audio/');
 if(!image&&!audio)return alert('Можно загрузить изображение или аудиофайл.');
 try{
   if(image)file=await compressChatImage(file);
   if(audio&&file.size>10*1024*1024)return alert('Музыка: максимум 10 МБ.');
   const {data:usage,error:ue}=await sb.rpc('my_chat_media_usage');
   if(ue)return alert(ue.message);
   const used=Number(usage?.[0]?.total_bytes||0),count=Number(usage?.[0]?.file_count||0);
   if(count>=100)return alert('Лимит: максимум 100 файлов на аккаунт.');
   if(used+file.size>100*1024*1024)return alert('Лимит хранилища: 100 МБ на аккаунт. Удалите старые медиа-сообщения.');
   const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase();
   const path=`${me.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
   const {error}=await sb.storage.from('chat-media').upload(path,file,{contentType:file.type,upsert:false});
   if(error)return alert(error.message);
   const {error:re}=await sb.rpc('register_chat_media',{p_path:path,p_type:image?'image':'audio',p_size:file.size});
   if(re){await sb.functions.invoke('delete-chat-media',{body:{path}});return alert(re.message)}
   const {data}=sb.storage.from('chat-media').getPublicUrl(path),url=data?.publicUrl;
   if(!url)return alert('Не удалось получить ссылку на файл.');
   const input=$('#messageInput');input.value=url;input.dispatchEvent(new Event('input'));$('#composer').requestSubmit();
 }catch(e){alert(e?.message||'Не удалось загрузить файл.')}finally{if(mediaBtn){mediaBtn.disabled=false;mediaBtn.textContent=mediaBtn.dataset.oldText||'📎'}}
}

function renderMessages(rows){currentRows=rows;const box=$('#messages');box.innerHTML='';if(!rows.length){box.innerHTML='<div class="empty">Пока сообщений нет. Напишите первым.</div>';return}rows.forEach((m,idx)=>{const p=m.profiles||{};const r=document.createElement('div');r.className='msg '+glowClass(p)+(me&&m.user_id===me.id?' me':'');const time=new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});const quoted=m.reply?`<div class="quoted">↪ <b>${esc(m.reply.nick)}</b> · ${esc(m.reply.text)}</div>`:'';const reacts=Object.entries(m.reactions||{}).map(([emoji,n])=>`<button class="reaction" data-react="${emoji}">${emoji} ${n}</button>`).join('');r.innerHTML=`<div class="ava">${p.avatar_url?`<img src="${esc(p.avatar_url)}">`:esc((p.nickname||'?')[0])}</div><div class="msgBody"><div class="meta"><span class="chatNick profileNickDirect" role="link" tabindex="0" data-open-user-nick="${esc(m.user_id)}" onclick="event.stopPropagation();openNickProfile('${String(m.user_id).replace(/'/g,'&#39;')}');return false">${esc(p.nickname||'Пользователь')}${tierCrown(p)}</span> · ${esc(tier(p.donation_total))}<time>${time}</time></div>${quoted}<div class="bubble">${mediaHTML(m.body)}</div>${directUser&&me&&String(m.user_id)===String(me.id)?`<small class="readTick" title="${m.read_at?'Прочитано':'Доставлено'}">${m.read_at?'✓✓':'✓'}</small>`:''}<div class="reactions">${reacts}</div><div class="msgActions"><button data-reply>↩ Ответить</button><button data-quick>♡ Реакция</button><button data-more>•••</button></div></div>`;r.querySelector('[data-reply]').onclick=()=>setReply(m);r.querySelector('[data-quick]').onclick=e=>openReactionPicker(e.currentTarget,m);r.querySelector('[data-more]').onclick=e=>openMessageMenu(e.currentTarget,m);r.querySelectorAll('[data-react]').forEach(b=>b.onclick=()=>addReaction(m,b.dataset.react));box.appendChild(r)});box.scrollTop=box.scrollHeight}
async function deleteOwnMessage(m){
 if(!me||!sb)return;
 if(String(m.user_id)!==String(me.id))return alert('Можно удалить только своё сообщение.');
 if(!confirm('Удалить это сообщение?'))return;
 let error=null;
 if(directUser){
   const result=await sb.from('direct_messages').delete().eq('id',m.id).eq('sender_id',me.id);
   error=result.error;
 }else{
   const result=await sb.from('messages').delete().eq('id',m.id).eq('user_id',me.id);
   error=result.error;
 }
 if(error)return alert(error.message);await deleteChatMediaForBody(m.body);
 if(directUser)await openDirectChat(directUser); else await loadMessages();
}

async function reportUserOrMessage(userId,m=null){
 if(!me||String(userId)===String(me.id))return;
 const reason=prompt('Причина жалобы (минимум 3 символа):');if(!reason)return;if(reason.trim().length<3)return alert('Опишите причину чуть подробнее.');
 const row={reporter_id:me.id,reported_user_id:userId,reason:reason.trim()};
 if(m){if(directUser)row.direct_message_id=m.id;else row.message_id=m.id}
 const {error}=await sb.from('reports').insert(row);if(error)return alert(error.message);alert('Жалоба отправлена модерации.');
}
function setupAdminPanel(){
 if($('#adminPanel'))return;
 const el=document.createElement('div');el.id='adminPanel';el.className='adminPanel adminFull';el.hidden=true;
 el.innerHTML=`<div class="adminShell">
 <div class="adminTop"><div><small>КТО ПО ЖИЗНИ</small><h2>Панель модерации</h2></div><div class="adminTopActions"><button type="button" class="adminBackBtn" data-admin-back>← Вернуться на сайт</button><button type="button" class="adminCloseBtn" data-admin-close aria-label="Закрыть">×</button></div></div>
 <div class="adminStats" id="adminStats"></div>
 <div class="adminTabs"><button data-atab="reports" class="active">Новые жалобы <b id="adminReportBadge">0</b></button><button data-atab="users">Пользователи</button><button data-atab="limits">Ограничения</button><button data-atab="log">Журнал</button></div>
 <div class="adminBody"><div id="adminReports"></div></div></div>`;
 document.body.appendChild(el);
 const closeAdmin=()=>{
   el.hidden=true;
   document.body.classList.remove('admin-open');
   document.documentElement.classList.remove('admin-page-open');
 };
 el.querySelector('[data-admin-close]').onclick=closeAdmin;
 el.querySelector('[data-admin-back]').onclick=closeAdmin;el.querySelectorAll('[data-atab]').forEach(b=>b.onclick=()=>{el.querySelectorAll('[data-atab]').forEach(x=>x.classList.toggle('active',x===b));renderAdminTab(b.dataset.atab)});el.onclick=e=>{if(e.target===el)el.hidden=true};
}
async function openAdminPanel(){
 if(!profile?.is_admin)return;
 setupAdminPanel();
 $('#adminPanel').hidden=false;
 document.body.classList.add('admin-open');
 document.documentElement.classList.add('admin-page-open');
 window.scrollTo({top:0,left:0,behavior:'instant'});
 await refreshAdminStats();
 renderAdminTab('reports');
}
async function refreshAdminStats(){const {data}=await sb.rpc('admin_dashboard_data');if(!data)return;$('#adminStats').innerHTML=`<div><b>${data.open_reports}</b><span>Новых жалоб</span></div><div><b>${data.active_mutes}</b><span>Активных мутов</span></div><div><b>${data.active_bans}</b><span>Активных банов</span></div><div><b>${data.users}</b><span>Пользователей</span></div>`;$('#adminReportBadge').textContent=data.open_reports;const nav=$('#adminNavCount');if(nav){nav.textContent=data.open_reports;nav.hidden=!data.open_reports}}
async function renderAdminTab(tab){
 const box=$('#adminReports');if(!box)return;box.innerHTML='<div class="empty">Загрузка…</div>';
 if(tab==='reports'){const {data}=await sb.from('reports').select('*').eq('status','open').order('created_at',{ascending:false}).limit(100);box.innerHTML=(data||[]).map(reportCard).join('')||'<div class="adminEmpty">Новых жалоб нет</div>';bindAdminReportActions(box)}
 if(tab==='users'){box.innerHTML=`<div class="adminSearch"><input id="adminUserSearch" placeholder="Поиск пользователя по нику"><button id="adminUserSearchBtn">Найти</button></div><div id="adminUserResults"></div>`;$('#adminUserSearchBtn').onclick=adminSearchUsers;$('#adminUserSearch').onkeydown=e=>{if(e.key==='Enter')adminSearchUsers()}}
 if(tab==='limits'){const [{data:mutes},{data:bans}]=await Promise.all([sb.from('user_mutes').select('*').gt('muted_until',new Date().toISOString()),sb.from('profiles').select('id,nickname,banned_until,ban_reason').gt('banned_until',new Date().toISOString())]);box.innerHTML=`<h3>Муты</h3>${(mutes||[]).map(x=>limitCard(x.user_id,'Мут до '+new Date(x.muted_until).toLocaleString('ru-RU'),x.reason,'unmute')).join('')||'<div class="adminEmpty">Нет активных мутов</div>'}<h3>Баны</h3>${(bans||[]).map(x=>limitCard(x.id,x.banned_until?.startsWith('9999')?'Постоянный бан':'Бан до '+new Date(x.banned_until).toLocaleString('ru-RU'),x.ban_reason,'unban')).join('')||'<div class="adminEmpty">Нет активных банов</div>'}`;bindLimitButtons(box)}
 if(tab==='log'){const {data}=await sb.from('moderation_log').select('*').order('created_at',{ascending:false}).limit(200);box.innerHTML=(data||[]).map(x=>`<div class="logRow"><b>${esc(x.action)}</b><span>${esc(profiles.find(p=>String(p.id)===String(x.target_user_id))?.nickname||'—')}</span><small>${new Date(x.created_at).toLocaleString('ru-RU')}${x.reason?' · '+esc(x.reason):''}</small></div>`).join('')||'<div class="adminEmpty">Журнал пуст</div>'}
}
function reportCard(r){const p=profiles.find(x=>String(x.id)===String(r.reported_user_id));return `<div class="adminReport"><div class="adminReportMain"><b>${esc(p?.nickname||'Пользователь')}</b><small>${new Date(r.created_at).toLocaleString('ru-RU')}</small><p>${esc(r.reason)}</p></div><div class="adminActions">${r.message_id||r.direct_message_id?`<button data-delmsg="${r.message_id||r.direct_message_id}" data-direct="${r.direct_message_id?'1':'0'}">Удалить сообщение</button>`:''}<button data-mute="${r.reported_user_id}">Мут 1 ч</button><button data-mute24="${r.reported_user_id}">Мут 24 ч</button><button data-ban="${r.reported_user_id}">Бан 24 ч</button><button data-ban7="${r.reported_user_id}">Бан 7 дней</button><button class="danger" data-banforever="${r.reported_user_id}">Бан навсегда</button><button data-actioned="${r.id}">Закрыть</button><button data-dismiss="${r.id}">Отклонить</button></div></div>`}
function bindAdminReportActions(box){
 box.querySelectorAll('[data-delmsg]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить сообщение?'))return;const {error}=await sb.rpc('admin_delete_message',{p_message:Number(b.dataset.delmsg),p_direct:b.dataset.direct==='1'});if(error)return alert(error.message);renderAdminTab('reports')});
 [['data-mute','mute',60],['data-mute24','mute',1440],['data-ban','ban',1440],['data-ban7','ban',10080],['data-banforever','ban',null]].forEach(([a,act,min])=>box.querySelectorAll('['+a+']').forEach(b=>b.onclick=()=>adminModerate(b.getAttribute(a),act,min)));
 box.querySelectorAll('[data-actioned]').forEach(b=>b.onclick=()=>updateReport(Number(b.dataset.actioned),'actioned'));box.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=()=>updateReport(Number(b.dataset.dismiss),'dismissed'));
}
async function updateReport(id,status){const {error}=await sb.rpc('admin_update_report',{p_report:id,p_status:status});if(error)return alert(error.message);await refreshAdminStats();renderAdminTab('reports')}
async function adminDeleteUser(uid,nick='пользователя'){
 if(!profile?.is_admin||!uid)return;
 if(String(uid)===String(me?.id))return alert('Свой администраторский профиль удалить нельзя.');
 const first=confirm(`Удалить профиль «${nick}»?\n\nБудут удалены аккаунт, сообщения, личные сообщения, друзья, реакции и блокировки этого пользователя.`);
 if(!first)return;
 const typed=prompt(`Для подтверждения напишите: удалить`);
 if(String(typed||'').trim().toLowerCase()!=='удалить')return alert('Удаление отменено.');
 const {error}=await sb.rpc('admin_delete_user',{p_user:uid});
 if(error)return alert(error.message);
 profiles=profiles.filter(x=>String(x.id)!==String(uid));
 if(viewedProfile&&String(viewedProfile.id)===String(uid)){viewedProfile=null;setView('users')}
 await refreshAdminStats();
 alert(`Профиль «${nick}» удалён.`);
 if($('#adminPanel')&&!$('#adminPanel').hidden)renderAdminTab('users');
}
async function adminSearchUsers(){const q=$('#adminUserSearch').value.trim().toLowerCase(),out=$('#adminUserResults');const rows=profiles.filter(p=>!q||String(p.nickname).toLowerCase().includes(q)).slice(0,50);out.innerHTML=rows.map(p=>`<div class="adminUser"><span>${avatarHTML(p)}<b>${esc(p.nickname)}</b></span><div><button data-uopen="${p.id}">Профиль</button>${String(p.id)!==String(me.id)?`<button data-umute="${p.id}">Мут</button><button data-uban="${p.id}">Бан 7д</button><button class="danger" data-udelete="${p.id}" data-unick="${esc(p.nickname)}">Удалить профиль</button>`:''}</div></div>`).join('')||'<div class="adminEmpty">Никого не найдено</div>';out.querySelectorAll('[data-uopen]').forEach(b=>b.onclick=()=>{const p=profiles.find(x=>String(x.id)===String(b.dataset.uopen));$('#adminPanel').hidden=true;goToUserProfile(p)});out.querySelectorAll('[data-umute]').forEach(b=>b.onclick=()=>adminModerate(b.dataset.umute,'mute',60));out.querySelectorAll('[data-uban]').forEach(b=>b.onclick=()=>adminModerate(b.dataset.uban,'ban',10080));out.querySelectorAll('[data-udelete]').forEach(b=>b.onclick=()=>adminDeleteUser(b.dataset.udelete,b.dataset.unick))}
function limitCard(uid,title,reason,action){const p=profiles.find(x=>String(x.id)===String(uid));return `<div class="limitRow"><div><b>${esc(p?.nickname||'Пользователь')}</b><span>${esc(title)}</span><small>${esc(reason||'Без причины')}</small></div><button data-clear="${uid}" data-action="${action}">Снять</button></div>`}
function bindLimitButtons(box){box.querySelectorAll('[data-clear]').forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc('admin_moderate_user',{p_user:b.dataset.clear,p_action:b.dataset.action,p_minutes:null,p_reason:'Снято администратором'});if(error)return alert(error.message);await refreshAdminStats();renderAdminTab('limits')})}
async function adminModerate(uid,action,minutes){const reason=prompt('Причина действия:')||'';if(action==='ban'&&minutes===null&&!confirm('Выдать постоянный бан?'))return;const {error}=await sb.rpc('admin_moderate_user',{p_user:uid,p_action:action,p_minutes:minutes,p_reason:reason});if(error)return alert(error.message);await refreshAdminStats();alert('Действие применено.');renderAdminTab('reports')}
async function checkRestriction(){if(!sb||!me)return null;const {data}=await sb.rpc('is_current_user_restricted');return data}

function openMessageMenu(anchor,m){
 document.querySelectorAll('.messageMenu').forEach(x=>x.remove());
 const pop=document.createElement('div');pop.className='messageMenu floatingMessageMenu';
 const copy=document.createElement('button');copy.type='button';copy.textContent='Копировать';
 copy.onclick=async e=>{e.stopPropagation();try{await navigator.clipboard?.writeText(m.body||'')}finally{pop.remove()}};
 pop.appendChild(copy);
  if(profile?.is_admin&&!directUser&&Number.isFinite(Number(m.id))){
    const pin=document.createElement('button');pin.type='button';
    pin.textContent=currentChatPin&&String(currentChatPin.message_id)===String(m.id)?'📌 Уже закреплено':'📌 Закрепить сообщение';
    pin.disabled=!!(currentChatPin&&String(currentChatPin.message_id)===String(m.id));
    pin.onclick=async e=>{e.preventDefault();e.stopPropagation();pop.remove();await adminPinChatMessage(m.id)};
    pop.appendChild(pin);
  }
 if(me&&String(m.user_id)!==String(me.id)){const rep=document.createElement('button');rep.type='button';rep.textContent='Пожаловаться';rep.onclick=e=>{e.stopPropagation();pop.remove();reportUserOrMessage(m.user_id,m)};pop.appendChild(rep);}
 if(profile?.is_admin&&me&&String(m.user_id)!==String(me.id)){
   const adminDel=document.createElement('button');adminDel.type='button';adminDel.className='danger';adminDel.textContent='🗑 Удалить как админ';
   adminDel.onclick=async e=>{e.preventDefault();e.stopPropagation();pop.remove();if(!confirm('Удалить это сообщение?'))return;const {error}=await sb.rpc('admin_delete_message',{p_message:Number(m.id),p_direct:Boolean(directUser)});if(error)return alert(error.message)};
   pop.appendChild(adminDel);
   const mute=document.createElement('button');mute.type='button';mute.textContent='🔇 Мут на 1 час';mute.onclick=e=>{e.preventDefault();e.stopPropagation();pop.remove();adminModerate(m.user_id,'mute',60)};pop.appendChild(mute);
   const ban=document.createElement('button');ban.type='button';ban.className='danger';ban.textContent='⛔ Бан на 24 часа';ban.onclick=e=>{e.preventDefault();e.stopPropagation();pop.remove();adminModerate(m.user_id,'ban',1440)};pop.appendChild(ban);
 }
 if(me&&String(m.user_id)===String(me.id)){
   const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='Удалить сообщение';
   del.onclick=async e=>{e.preventDefault();e.stopPropagation();pop.remove();await deleteOwnMessage(m)};
   pop.appendChild(del);
 }
 document.body.appendChild(pop);
 const r=anchor.getBoundingClientRect();
 const w=200;
 let left=Math.min(window.innerWidth-w-10,Math.max(10,r.right-w));
 let top=r.bottom+6;
 pop.style.left=left+'px';pop.style.top=top+'px';
 requestAnimationFrame(()=>{
   const pr=pop.getBoundingClientRect();
   if(pr.bottom>window.innerHeight-8)pop.style.top=Math.max(8,r.top-pr.height-6)+'px';
 });
 const closePopup=ev=>{
   if(!pop.contains(ev.target)&&ev.target!==anchor){
     pop.remove();
     document.removeEventListener('pointerdown',closePopup,true);
     window.removeEventListener('scroll',closeOnScroll,true);
   }
 };
 const closeOnScroll=()=>{pop.remove();document.removeEventListener('pointerdown',closePopup,true);window.removeEventListener('scroll',closeOnScroll,true)};
 setTimeout(()=>document.addEventListener('pointerdown',closePopup,true),120);
 window.addEventListener('scroll',closeOnScroll,true);
}
function openReactionPicker(anchor,m){
 document.querySelectorAll('.reactionPicker').forEach(x=>x.remove());
 const pop=document.createElement('div');pop.className='reactionPicker';
 ['👍','❤️','😂','🔥','👏','🤝','😮','😢','👊','♛'].forEach(emoji=>{
   const b=document.createElement('button');b.type='button';b.textContent=emoji;
   if(emoji==='♛')b.classList.add('crownEmoji');
   b.onclick=async ev=>{ev.stopPropagation();pop.remove();await addReaction(m,emoji)};
   pop.appendChild(b);
 });
 anchor.parentElement.appendChild(pop);
 const closePopup=ev=>{if(!pop.contains(ev.target)&&ev.target!==anchor){pop.remove();document.removeEventListener('pointerdown',closePopup,true)}};
setTimeout(()=>document.addEventListener('pointerdown',closePopup,true),80);
}
async function addReaction(m,emoji){
 if(!me||!sb)return;
 const {data:mine}=await sb.from('message_reactions').select('id').eq('message_id',m.id).eq('user_id',me.id).eq('emoji',emoji).maybeSingle();
 if(mine?.id)await sb.from('message_reactions').delete().eq('id',mine.id);
 else await sb.from('message_reactions').insert({message_id:m.id,user_id:me.id,emoji});
 await loadMessages();
}
async function openDirectChat(p){
 if(!p||String(p.id)===String(me?.id))return;
 if(me&&p)markConversationRead(p.id);await publishTyping(false);$('#typingIndicator').textContent='';directUser=p;setView('chat');document.querySelector('.chatPanel')?.classList.add('directMode');$('#chatTitle').innerHTML=`<span class="directHeadAvatar">${p.avatar_url?`<img src="${esc(p.avatar_url)}">`:esc((p.nickname||'?')[0])}</span><span class="directHeadText"><em>🔒 ЛИЧНЫЙ ДИАЛОГ</em><strong>${esc(p.nickname)}</strong></span>`;$('#chatSubtitle').textContent=onlineIds.has(p.id)?'● Сейчас онлайн':'○ Не в сети';$('#chatPinned').innerHTML=`🔒 Этот разговор видите только вы и <b>${esc(p.nickname)}</b>.`;$('#backToGeneral').hidden=false;
let chatFriendBtn=$('#chatFriendBtn');
if(!chatFriendBtn){chatFriendBtn=document.createElement('button');chatFriendBtn.id='chatFriendBtn';chatFriendBtn.className='tiny chatFriendBtn';$('#backToGeneral').parentElement.appendChild(chatFriendBtn)}
chatFriendBtn.hidden=false;
const ff=friendshipWith(p.id);
if(!ff){chatFriendBtn.textContent='＋ Добавить в друзья';chatFriendBtn.onclick=async()=>{await sendFriendRequest(p.id);await loadFriendships();openDirectChat(p)}}
else if(ff.status==='accepted'){chatFriendBtn.textContent='✓ В друзьях';chatFriendBtn.onclick=()=>openUserProfile(p)}
else if(ff.status==='pending'&&String(ff.addressee_id)===String(me?.id)){chatFriendBtn.textContent='✓ Принять заявку';chatFriendBtn.onclick=async()=>{await answerFriendRequest(ff.id,'accepted');openDirectChat(p)}}
else if(ff.status==='pending'){chatFriendBtn.textContent='⏳ Заявка отправлена';chatFriendBtn.onclick=()=>{}}
else{chatFriendBtn.textContent='＋ Добавить в друзья';chatFriendBtn.onclick=()=>sendFriendRequest(p.id)};if(ready&&me){const {data,error}=await sb.from('direct_messages').select('id,body,created_at,sender_id,recipient_id,read_at').or(`and(sender_id.eq.${me.id},recipient_id.eq.${p.id}),and(sender_id.eq.${p.id},recipient_id.eq.${me.id})`).order('created_at',{ascending:true}).limit(120);if(error){alert(error.message);renderMessages([])}else{const rows=(data||[]).map(m=>({...m,user_id:m.sender_id,profiles:m.sender_id===me.id?profile:p}));renderMessages(rows)}}else{const rows=demoMessages.filter((_,i)=>i<2).map((m,i)=>({...m,id:'private'+i,body:i?'На связи. Пиши, что хотел обсудить.':'Привет. Решил написать лично.',profiles:i?p:DEMO_PROFILES[0]}));renderMessages(rows)}$('#messageInput').placeholder='Сообщение для '+p.nickname+'...';$('#messageInput').focus()}

let currentChatPin=null;
async function loadChatPin(){
 if(!sb||!ready)return;
 const {data,error}=await sb.from('chat_pins').select('message_id,created_at').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(error){console.error('loadChatPin',error);return}
 currentChatPin=data||null;renderChatPin();
}
function renderChatPin(){
 const el=$('#chatPinned');if(!el)return;
 if(!currentChatPin){el.innerHTML='📌 <b>Закреплено:</b> Уважайте друг друга. Без оскорблений.';return}
 const m=currentRows.find(x=>String(x.id)===String(currentChatPin.message_id));
 if(!m){el.innerHTML='📌 <b>Закреплённое сообщение</b>';return}
 const author=m.profiles?.nickname||'Пользователь';
 el.innerHTML=`📌 <b>${esc(author)}:</b> ${esc(m.body||'')}${profile?.is_admin?' <button type="button" id="unpinChatMessageBtn">Открепить</button>':''}`;
 const b=$('#unpinChatMessageBtn');if(b)b.onclick=adminUnpinChatMessage;
}
async function adminPinChatMessage(id){if(!profile?.is_admin||directUser)return;const {error}=await sb.rpc('admin_pin_message',{p_message:Number(id)});if(error)return alert(error.message);await loadChatPin()}
async function adminUnpinChatMessage(){if(!profile?.is_admin)return;const {error}=await sb.rpc('admin_unpin_message');if(error)return alert(error.message);currentChatPin=null;renderChatPin()}
function connectChatPins(){if(!sb||!me)return;sb.channel('chat-pins-v104').on('postgres_changes',{event:'*',schema:'public',table:'chat_pins'},()=>loadChatPin()).subscribe()}

async function openGeneralChat(){await publishTyping(false);$('#typingIndicator').textContent='';directUser=null;document.querySelector('.chatPanel')?.classList.remove('directMode');$('#chatTitle').textContent='🔴 Общий чат';$('#chatSubtitle').textContent='#общение · общий разговор';renderChatPin();$('#backToGeneral').hidden=true;if($('#chatFriendBtn'))$('#chatFriendBtn').hidden=true;$('#messageInput').placeholder='Написать сообщение...';renderMessages(ready?currentRows:demoMessages)}$('#backToGeneral').onclick=openGeneralChat;
$('#composer').onsubmit=async e=>{
 e.preventDefault();
 // Prevent the browser from submitting/reloading the form while we await
 // restriction checks. A reload used to drop directUser and reopen general chat.
 const restriction=await checkRestriction();if(restriction==='banned'){alert('Ваш аккаунт временно заблокирован.');return}if(restriction==='muted'){alert('У вас временный мут. Отправка сообщений недоступна.');return}const input=$('#messageInput'),body=input.value.trim();if(!body)return;if(!ready){const p=DEMO_PROFILES[0];const m={id:'local'+Date.now(),user_id:p.id,body,created_at:new Date().toISOString(),profiles:p,reactions:{},reply:replyTo?{nick:replyTo.profiles?.nickname||'Пользователь',text:replyTo.body.slice(0,80)}:null};if(directUser){currentRows=[...currentRows,m];renderMessages(currentRows)}else{demoMessages.push(m);renderMessages(demoMessages)}input.value='';$('#charCount').textContent='0/500';clearReply();return}if(!me)return openAuth();let error=null;const dmTarget=directUser;
if(dmTarget){const result=await sb.rpc('send_direct_message',{to_user:dmTarget.id,message_body:body});error=result.error}else{const replyId=replyTo?.id&&Number.isInteger(Number(replyTo.id))?Number(replyTo.id):null;const result=await sb.rpc('send_general_message',{message_body:body,p_reply_to:replyId});error=result.error}if(error)alert(error.message);else{input.value='';publishTyping(false);clearReply();if(dmTarget)await openDirectChat(dmTarget)}};
let typingChannel=null,typingStopTimer=null,typingReady=false,pendingTyping=false;
function currentTypingRoom(){return directUser&&me?`dm:${[me.id,directUser.id].sort().join(':')}`:'general'}
function showRemoteTyping(payload){
 if(!payload||!me||payload.user_id===me.id)return;
 if(payload.room!==currentTypingRoom())return;
 const t=$('#typingIndicator');
 if(!payload.typing){t.textContent='';return}
 t.textContent=`${payload.nickname||'Пользователь'} печатает...`;
 clearTimeout(t._hideTimer);t._hideTimer=setTimeout(()=>{t.textContent=''},2200);
}
function connectTyping(){
 if(!sb||!me)return;
 if(typingChannel)sb.removeChannel(typingChannel);
 typingReady=false;
 typingChannel=sb.channel('chat-typing-v31',{config:{broadcast:{self:false,ack:true}}})
   .on('broadcast',{event:'typing'},({payload})=>showRemoteTyping(payload))
   .subscribe(status=>{
     typingReady=status==='SUBSCRIBED';
     if(typingReady&&pendingTyping){pendingTyping=false;publishTyping(true)}
   });
}
async function publishTyping(isTyping){
 if(!typingChannel||!me)return;
 if(!typingReady){if(isTyping)pendingTyping=true;return}
 await typingChannel.send({type:'broadcast',event:'typing',payload:{
   room:currentTypingRoom(),user_id:me.id,
   nickname:profile?.nickname||me.user_metadata?.nickname||'Пользователь',
   typing:isTyping
 }});
}
$('#messageInput').addEventListener('input',e=>{
 $('#charCount').textContent=e.target.value.length+'/500';
 const active=Boolean(e.target.value.trim());
 publishTyping(active);
 clearTimeout(typingStopTimer);
 if(active)typingStopTimer=setTimeout(()=>publishTyping(false),1800);
});
$('#emojiBtn').onclick=()=>{const old=$('.emojiPop');if(old){old.remove();return}const pop=document.createElement('div');pop.className='emojiPop';['👊','👍','🔥','♛','🤝','💬'].forEach(x=>{const b=document.createElement('button');b.type='button';b.textContent=x;if(x==='♛')b.classList.add('crownEmoji');b.onclick=()=>{$('#messageInput').value+=x;pop.remove();$('#messageInput').focus()};pop.appendChild(b)});$('#composer').appendChild(pop)};let usersPageFilter='all';function applyUsersPage(){let list=profiles;const q=($('#usersSearch')?.value||'').trim().toLowerCase();if(q)list=list.filter(p=>p.nickname.toLowerCase().includes(q));if(usersPageFilter==='online')list=list.filter(p=>onlineIds.has(p.id));else if(usersPageFilter!=='all')list=list.filter(p=>tierSlug(p.donation_total||0)===usersPageFilter);renderUsers(list)};$('#usersSearch')?.addEventListener('input',applyUsersPage);$$('[data-users-filter]').forEach(b=>b.addEventListener('click',()=>{usersPageFilter=b.dataset.usersFilter;$$('[data-users-filter]').forEach(x=>x.classList.toggle('active',x===b));applyUsersPage()}));


let dmRows=[],dmUnreadByUser={};
async function loadDirectInbox(){
 if(!sb||!me){dmRows=[];dmUnreadByUser={};return}
 const {data,error}=await sb.from('direct_messages').select('id,body,created_at,sender_id,recipient_id,read_at').or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`).order('created_at',{ascending:false}).limit(300);
 if(error)return;
 dmRows=data||[];dmUnreadByUser={};
 for(const m of dmRows)if(String(m.recipient_id)===String(me.id)&&!m.read_at)dmUnreadByUser[m.sender_id]=(dmUnreadByUser[m.sender_id]||0)+1;
 renderConversationList();
}
function conversationPeers(){
 const map=new Map();
 for(const m of dmRows){
  const peer=String(m.sender_id)===String(me?.id)?m.recipient_id:m.sender_id;
  if(!map.has(String(peer)))map.set(String(peer),m);
 }
 return [...map.entries()].map(([id,last])=>({profile:profiles.find(p=>String(p.id)===id),last})).filter(x=>x.profile);
}
function renderConversationList(){
 const box=$('#conversationList');if(!box)return;
 const rows=conversationPeers();
 box.innerHTML=rows.map(({profile:p,last})=>{const n=dmUnreadByUser[p.id]||0;return `<button type="button" class="conversationRow ${n?'hasUnread':''}" data-conversation="${esc(p.id)}">${avatarHTML(p)}<span class="conversationMeta"><b><span class="profileNickLink" role="button" tabindex="0" data-profile-link="${esc(p.id)}">${esc(p.nickname)}${tierCrown(p)}</span></b><small>${esc((last.body||'').replace(/^https?:\/\/\S+$/,'Медиа / ссылка').slice(0,42))}</small></span><span class="conversationSide"><small>${new Date(last.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small>${n?`<i>${Math.min(99,n)}</i>`:''}</span></button>`}).join('')||'<div class="empty">Личных диалогов пока нет</div>';
 box.querySelectorAll('[data-conversation]').forEach(b=>b.onclick=()=>openDirectChat(profiles.find(p=>String(p.id)===b.dataset.conversation)));
 const total=Object.values(dmUnreadByUser).reduce((a,b)=>a+b,0),badge=$('#dmTotalBadge');if(badge){badge.textContent=Math.min(99,total);badge.hidden=!total}
}
async function markConversationRead(uid){
 if(!sb||!me)return;await sb.rpc('mark_direct_messages_read',{p_sender:uid});await loadDirectInbox();
}
function setupConversationList(){
 const side=$('.chatSidebar')||$('#onlineUsers')?.parentElement;if(!side||$('#conversationList'))return;
 const wrap=document.createElement('section');wrap.className='conversationSection';wrap.innerHTML=`<div class="conversationTitle">Сообщения <span id="dmTotalBadge" hidden>0</span><button type="button" id="openFriendsManager">Друзья</button></div><div id="conversationList"><div class="empty">Личных диалогов пока нет</div></div>`;
 const tabs=$('#peopleTabs');if(tabs&&tabs.parentElement===side)side.insertBefore(wrap,tabs);else side.insertBefore(wrap,side.firstChild);$('#openFriendsManager')?.addEventListener('click',openFriendsPanel);
}


function setupFriendsPanel(){
 if($('#friendsPanel'))return;
 const panel=document.createElement('div');panel.id='friendsPanel';panel.className='friendsPanel';panel.hidden=true;
 panel.innerHTML=`<div class="friendsPanelCard"><div class="friendsPanelHead"><b>Друзья и заявки</b><button type="button" data-close>×</button></div><div id="friendsPanelBody"></div></div>`;
 document.body.appendChild(panel);panel.querySelector('[data-close]').onclick=()=>panel.hidden=true;panel.onclick=e=>{if(e.target===panel)panel.hidden=true};
}
function renderFriendsPanel(){
 setupFriendsPanel();const body=$('#friendsPanelBody');if(!body||!me)return;
 const accepted=friendships.filter(f=>f.status==='accepted'),incoming=friendships.filter(f=>f.status==='pending'&&String(f.addressee_id)===String(me.id)),outgoing=friendships.filter(f=>f.status==='pending'&&String(f.requester_id)===String(me.id));
 const peer=(f)=>profiles.find(p=>String(p.id)===String(f.requester_id===me.id?f.addressee_id:f.requester_id));
 const row=(p,actions)=>p?`<div class="friendManageRow" data-friend-user="${esc(p.id)}">${avatarHTML(p)}<span><b><button type="button" class="profileNickLink" data-profile-link="${esc(p.id)}">${esc(p.nickname)}${tierCrown(p)}</button></b><small>${onlineIds.has(p.id)?'● в сети':'○ не в сети'}</small></span><div>${actions}</div></div>`:'';
 body.innerHTML=`<h4>Друзья (${accepted.length})</h4>${accepted.map(f=>{const p=peer(f);return row(p,`<button data-msg="${p?.id||''}">Написать</button><button data-remove="${f.id}">Удалить</button>`)}).join('')||'<div class="empty">Пока нет друзей</div>'}<h4>Входящие (${incoming.length})</h4>${incoming.map(f=>{const p=peer(f);return row(p,`<button data-accept="${f.id}">Принять</button><button data-decline="${f.id}">Отклонить</button>`)}).join('')||'<div class="empty">Нет входящих заявок</div>'}<h4>Исходящие (${outgoing.length})</h4>${outgoing.map(f=>{const p=peer(f);return row(p,`<button data-remove="${f.id}">Отменить</button>`)}).join('')||'<div class="empty">Нет исходящих заявок</div>'}`;
 body.querySelectorAll('[data-friend-user]').forEach(r=>r.querySelector('span').onclick=()=>goToUserProfile(profiles.find(p=>String(p.id)===r.dataset.friendUser)));
 body.querySelectorAll('[data-msg]').forEach(b=>b.onclick=()=>{const p=profiles.find(x=>String(x.id)===b.dataset.msg);$('#friendsPanel').hidden=true;openDirectChat(p)});
 body.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{await answerFriendRequest(b.dataset.accept,'accepted');renderFriendsPanel()});
 body.querySelectorAll('[data-decline]').forEach(b=>b.onclick=async()=>{await answerFriendRequest(b.dataset.decline,'declined');renderFriendsPanel()});
 body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{await removeFriend(b.dataset.remove);renderFriendsPanel()});
}
function openFriendsPanel(){renderFriendsPanel();$('#friendsPanel').hidden=false}


let userBlocks=[];
async function loadUserBlocks(){if(!sb||!me){userBlocks=[];return}const {data}=await sb.from('user_blocks').select('*');userBlocks=data||[]}
function blockRelation(uid){return userBlocks.find(b=>(String(b.blocker_id)===String(me?.id)&&String(b.blocked_id)===String(uid))||(String(b.blocked_id)===String(me?.id)&&String(b.blocker_id)===String(uid)))}
async function toggleBlockUser(p){
 if(!p||!me||String(p.id)===String(me.id))return;
 const rel=blockRelation(p.id),mine=rel&&String(rel.blocker_id)===String(me.id);
 if(rel&&!mine)return alert('Этот пользователь заблокировал взаимодействие с вами.');
 if(mine){if(!confirm(`Разблокировать ${p.nickname}?`))return;const {error}=await sb.from('user_blocks').delete().eq('blocker_id',me.id).eq('blocked_id',p.id);if(error)return alert(error.message)}
 else{if(!confirm(`Заблокировать ${p.nickname}? Он не сможет писать вам и отправлять заявки в друзья.`))return;const {error}=await sb.from('user_blocks').insert({blocker_id:me.id,blocked_id:p.id});if(error)return alert(error.message)}
 await loadUserBlocks();renderProfile();
}

let friendships=[];
async function loadFriendships(){
 if(!sb||!me){friendships=[];userBlocks=[];return}
 await loadUserBlocks();
 const {data,error}=await sb.from('friendships').select('*').order('created_at',{ascending:false});
 if(!error){friendships=data||[];if(typeof peopleFilter!=='undefined'&&peopleFilter==='friends')applyPeopleFilter();}
}
function friendshipWith(uid){
 return friendships.find(f=>String(f.requester_id)===String(uid)||String(f.addressee_id)===String(uid));
}
function addFriendNotice(f){
 if(!me||String(f.addressee_id)!==String(me.id)||f.status!=='pending')return;
 const sender=profiles.find(x=>String(x.id)===String(f.requester_id)),feed=$('#noticeFeed');
 if(feed){
   feed.querySelector('.noticeEmpty')?.remove();
   const row=document.createElement('div');row.className='noticeEvent friendNotice';
   row.innerHTML=`🤝 <b>${esc(sender?.nickname||'Пользователь')}</b> хочет добавить вас в друзья<div class="friendNoticeActions"><button data-accept>Принять</button><button data-decline>Отклонить</button></div>`;
   row.querySelector('[data-accept]').onclick=async e=>{e.stopPropagation();await answerFriendRequest(f.id,'accepted');row.remove()};
   row.querySelector('[data-decline]').onclick=async e=>{e.stopPropagation();await answerFriendRequest(f.id,'declined');row.remove()};
   feed.prepend(row);
 }
 const count=$('#noticeCount');if(count)setNoticeCount(Math.min(99,(Number(count.textContent)||0)+1));
}
async function sendFriendRequest(uid){
 if(!me||String(uid)===String(me.id))return;
 const existing=friendshipWith(uid);
 if(existing){
   if(existing.status==='accepted')return alert('Вы уже друзья.');
   if(existing.status==='pending')return alert('Заявка уже отправлена.');
   await sb.from('friendships').delete().eq('id',existing.id);
 }
 const {error}=await sb.rpc('send_friend_request',{to_user:uid});
 if(error)return alert(error.message);
 await loadFriendships();alert('Заявка в друзья отправлена.');
}
async function answerFriendRequest(id,status){
 const {error}=await sb.from('friendships').update({status,updated_at:new Date().toISOString()}).eq('id',id);
 if(error)return alert(error.message);
 await loadFriendships();
 if(peopleFilter==='friends')applyPeopleFilter();
}
async function removeFriend(id){
 if(!confirm('Удалить из друзей?'))return;
 const {error}=await sb.from('friendships').delete().eq('id',id);
 if(error)return alert(error.message);
 await loadFriendships();
}
function updateFriendButton(p){
 const b=$('#userPopupFriend');if(!b)return;
 if(!me||String(p.id)===String(me.id)){b.hidden=true;return}
 b.hidden=false;const f=friendshipWith(p.id);
 if(!f){b.textContent='＋ Добавить в друзья';b.onclick=()=>sendFriendRequest(p.id);return}
 if(f.status==='accepted'){b.textContent='✓ В друзьях';b.onclick=()=>removeFriend(f.id);return}
 if(f.status==='pending'&&String(f.addressee_id)===String(me.id)){
   b.textContent='✓ Принять заявку';b.onclick=async()=>{await answerFriendRequest(f.id,'accepted');updateFriendButton(p)};return
 }
 if(f.status==='pending'){b.textContent='⏳ Заявка отправлена';b.onclick=()=>{};return}
 b.textContent='＋ Добавить в друзья';b.onclick=()=>sendFriendRequest(p.id);
}
function ensureViewedProfileActions(p){
 let bar=$('#viewedProfileActions');const host=$('#profileIdentityCard')?.parentElement||$('#view-profile');
 if(!host)return;if(!bar){bar=document.createElement('div');bar.id='viewedProfileActions';bar.className='viewedProfileActions';host.appendChild(bar)}
 const own=!me||String(p.id)===String(me.id);bar.hidden=own;if(own)return;
 const f=friendshipWith(p.id),rel=blockRelation(p.id),mine=rel&&String(rel.blocker_id)===String(me.id);
 bar.innerHTML=`<button type="button" data-profile-msg>💬 Написать</button><button type="button" data-profile-friend>${f?.status==='accepted'?'✓ В друзьях':f?.status==='pending'&&String(f.addressee_id)===String(me?.id)?'✓ Принять заявку':f?.status==='pending'?'⏳ Заявка отправлена':'＋ Добавить в друзья'}</button><button type="button" class="danger" data-profile-block>${mine?'Разблокировать':'Заблокировать'}</button><button type="button" data-profile-report>⚑ Пожаловаться</button>${profile?.is_admin?`<button type="button" data-admin-mute>Мут 1ч</button><button type="button" data-admin-ban>Бан 24ч</button><button type="button" class="danger" data-admin-banforever>Бан навсегда</button><button type="button" data-admin-clear>Снять ограничения</button><button type="button" class="danger adminDeleteProfileBtn" data-admin-delete-user>Удалить профиль</button>`:''}`;
 bar.querySelector('[data-profile-msg]').onclick=()=>{if(rel)return alert('Личные сообщения между вами заблокированы.');openDirectChat(p)};
 bar.querySelector('[data-profile-friend]').onclick=async()=>{if(rel)return alert('Заявки в друзья между вами заблокированы.');const current=friendshipWith(p.id);if(current?.status==='accepted')return;if(current?.status==='pending'&&String(current.addressee_id)===String(me?.id)){await answerFriendRequest(current.id,'accepted');ensureViewedProfileActions(p);return}if(current?.status==='pending')return;await sendFriendRequest(p.id);ensureViewedProfileActions(p)};
 bar.querySelector('[data-profile-block]').onclick=()=>toggleBlockUser(p);bar.querySelector('[data-profile-report]').onclick=()=>reportUserOrMessage(p.id);if(profile?.is_admin){bar.querySelector('[data-admin-mute]').onclick=()=>adminModerate(p.id,'mute',60);bar.querySelector('[data-admin-ban]').onclick=()=>adminModerate(p.id,'ban',1440);bar.querySelector('[data-admin-banforever]').onclick=()=>adminModerate(p.id,'ban',null);bar.querySelector('[data-admin-delete-user]').onclick=()=>adminDeleteUser(p.id,p.nickname);bar.querySelector('[data-admin-clear]').onclick=async()=>{await sb.rpc('admin_moderate_user',{p_user:p.id,p_action:'unmute',p_minutes:null,p_reason:null});await sb.rpc('admin_moderate_user',{p_user:p.id,p_action:'unban',p_minutes:null,p_reason:null});alert('Ограничения сняты.')}}
}
function goToUserProfile(p){if(!p)return;$('#userProfileModal')?.classList.remove('show');$('#friendsPanel')&&($('#friendsPanel').hidden=true);$$('.view').forEach(v=>v.classList.remove('active'));$('#view-profile')?.classList.add('active');$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='profile'));viewedProfile=p;renderProfile();window.scrollTo({top:0,behavior:'smooth'})}
function openUserProfile(p){if(!p)return;const amount=p.donation_total||0,slug=tierSlug(amount),isOnline=onlineIds.has(p.id);$('#userPopupAvatar').innerHTML=avatarHTML(p);$('#userPopupNick').textContent=p.nickname;$('#userPopupCrown').textContent=amount>=100?'♛':'';$('#userPopupCrown').className='userRankCrown '+slug;$('#userPopupOnline').textContent=isOnline?'● Сейчас онлайн':'○ Не в сети';$('#userPopupOnline').style.color=isOnline?'#49d482':'#7d858a';$('#userPopupTier').textContent=tier(amount);$('#userPopupSubscription').textContent=p.subscription_active?'♛ Подписка активна':'Без подписки';$('#userPopupBio').textContent=p.bio||'Пользователь пока ничего о себе не рассказал.';$('#userPopupMessages').textContent=p.message_count||Math.max(18,Math.round(amount/25));$('#userPopupRep').textContent=p.reputation||Math.max(12,Math.round((amount+500)/160));$('#userPopupSupport').textContent=amount.toLocaleString('ru-RU')+' ₽';addRespectControlsToPopup(p);$('#userProfileModal').classList.add('show');const self=String(p.id)===String(me?.id);$('#userPopupMessage').hidden=self;$('#userPopupMessage').onclick=self?null:()=>{$('#userProfileModal').classList.remove('show');openDirectChat(p)};updateFriendButton(p)}
document.addEventListener('click',e=>{const open=e.target.closest?.('[data-open-profile]');if(!open)return;e.preventDefault();e.stopPropagation();const p=profiles.find(x=>String(x.id)===String(open.dataset.openProfile));if(p)openUserProfile(p)});document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const c=e.target.closest?.('.userCard');if(!c)return;const p=profiles.find(x=>String(x.id)===String(c.dataset.userId));if(p)openUserProfile(p)});$('#userProfileClose')?.addEventListener('click',()=>$('#userProfileModal').classList.remove('show'));$('#userProfileModal')?.addEventListener('click',e=>{if(e.target.id==='userProfileModal')e.currentTarget.classList.remove('show')});
function setupMediaUpload(){
 const emoji=$('#emojiBtn');if(!emoji||$('#mediaBtn'))return;
 const b=document.createElement('button');b.type='button';b.id='mediaBtn';b.className='iconBtn mediaBtn';b.title='Фото до 2 МБ после сжатия · музыка до 10 МБ';b.textContent='📎';
 const inp=document.createElement('input');inp.type='file';inp.id='mediaInput';inp.accept='image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm';inp.hidden=true;
 b.onclick=()=>inp.click();inp.onchange=async()=>{const f=inp.files?.[0];inp.value='';if(f)await uploadChatMedia(f)};
 emoji.parentElement.insertBefore(b,emoji.nextSibling);emoji.parentElement.appendChild(inp);
}
async function init(){setupMediaUpload();setupConversationList();renderAuth();renderProfileWidget();if(!ready){profiles=DEMO_PROFILES;onlineIds=new Set(DEMO_PROFILES.slice(0,6).map(p=>p.id));renderMessages(demoMessages);renderPeople(profiles);renderUsers(profiles);renderDonors(profiles);$('#onlineCount').textContent=onlineIds.size;$('#onlineCount2').textContent=onlineIds.size;$('#authArea').innerHTML='<span class="demoBadge">ДЕМО ДО ПОДКЛЮЧЕНИЯ</span>';return}if(sb){await refreshSession();await Promise.allSettled([loadMessages(),loadUsers()]);if(me){try{await loadFriendships()}catch(e){console.error('friends init',e)}connectPresence();connectDirectMessages();connectTyping();
sb.channel('friendships-live').on('postgres_changes',{event:'INSERT',schema:'public',table:'friendships'},async payload=>{await loadFriendships();addFriendNotice(payload.new)}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'friendships'},async()=>{await loadFriendships()}).on('postgres_changes',{event:'DELETE',schema:'public',table:'friendships'},async()=>{await loadFriendships()}).subscribe();
}sb.channel('public-chat').on('postgres_changes',{event:'*',schema:'public',table:'messages'},loadMessages).subscribe();sb.channel('reactions-live').on('postgres_changes',{event:'*',schema:'public',table:'message_reactions'},loadMessages).subscribe();sb.channel('profiles-live').on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},async()=>{await loadUsers();if(me)await loadProfile();renderProfileWidget()}).subscribe();sb.auth.onAuthStateChange(()=>setTimeout(refreshSession,0))}}init();


// Demo UI for future server-confirmed donation events. Real events must come only from a payment webhook/backend.
const demoDonationEvents=[
 {nickname:'Тихий',amount:100,kind:'donation'},
 {nickname:'Андрей_74',amount:500,kind:'rank'},
 {nickname:'Кирилл_МСК',amount:5000,kind:'rank'},
 {nickname:'Виталий_77',amount:10000,kind:'rank'},
 {nickname:'Аноним',amount:5000,kind:'anonymous'}
];
let demoDonationIndex=0;
function donationEventTier(amount){return amount>=10000?'avtoritet':amount>=5000?'blatnoy':amount>=500?'starshiy':'brodyaga'}
function donationEventTitle(amount,kind){if(kind==='rank'&&amount>=10000)return 'В НАШИХ РЯДАХ НОВЫЙ АВТОРИТЕТ';if(kind==='rank')return 'НОВАЯ СТУПЕНЬ ПОДДЕРЖКИ';return 'СВОИ ПОДДЕРЖИВАЮТ СВОИХ'}
function showDonationSignal(ev){
 const amount=Number(ev.amount)||0, slug=donationEventTier(amount), nickname=ev.nickname||'Аноним';
 const wrap=$('#donationSignals'); if(!wrap)return;
 if(wrap.parentElement!==document.body)document.body.appendChild(wrap);
 const card=document.createElement('div');card.className='donationSignal '+slug;
 const rank=tier(amount); const who=nickname==='Аноним'?'Аноним':esc(nickname);
 card.innerHTML=`<strong>${donationEventTitle(amount,ev.kind)}</strong><b>${who}</b> поддержал проект на <span class="signalAmount">${amount.toLocaleString('ru-RU')} ₽</span><p>${amount>=100?`Статус: ${esc(rank)} ♛`:'Спасибо за поддержку сообщества.'}</p>`;
 wrap.appendChild(card); setTimeout(()=>card.remove(),7700);
 addDonationNotice({nickname,amount,rank});
}
function addDonationNotice(ev){
 const feed=$('#noticeFeed');if(!feed)return;feed.querySelector('.noticeEmpty')?.remove();
 const row=document.createElement('div');row.className='noticeEvent';row.innerHTML=`♛ <b>${esc(ev.nickname)}</b> поддержал проект · ${Number(ev.amount).toLocaleString('ru-RU')} ₽<small>${esc(ev.rank)} · только что</small>`;feed.prepend(row);
 while(feed.children.length>12)feed.lastElementChild.remove();
 const count=$('#noticeCount');setNoticeCount(Math.min(99,(Number(count.textContent)||0)+1));
}
$('#demoDonationBtn')?.addEventListener('click',()=>{showDonationSignal(demoDonationEvents[demoDonationIndex%demoDonationEvents.length]);demoDonationIndex++;});

// v84: cover uses direct upload handler only.
// v84: avatar uses direct upload handler only.
queueMicrotask(()=>{
 if(typeof openUserProfile==='function'){
   const _openUserProfile=openUserProfile;
   openUserProfile=function(p,...args){
     const r=_openUserProfile.call(this,p,...args);
     setTimeout(()=>{
       if(!profile?.is_admin||!p||String(p.id)===String(me?.id))return;
       const modal=[...document.querySelectorAll('.modal,.profile-modal,.user-modal')].find(x=>!x.hidden&&getComputedStyle(x).display!=='none')||document.body;
       if(modal.querySelector('.adminModalDeleteBtn'))return;
       const actions=modal.querySelector('.profile-actions,.modal-actions,.user-actions')||[...modal.querySelectorAll('button')].find(b=>/Добавить в друзья|Написать/.test(b.textContent))?.parentElement;
       if(!actions)return;
       const b=document.createElement('button');b.type='button';b.className='adminModalDeleteBtn';b.textContent='🗑 Удалить профиль';
       b.onclick=e=>{e.preventDefault();e.stopPropagation();adminDeleteUser(p.id,p.nickname)};
       actions.appendChild(b);
     },0);
     return r;
   }
 }
});


document.addEventListener('click',e=>{
 const del=e.target.closest?.('[data-admin-delete-user],.adminCardDeleteBtn');
 if(!del)return;
 e.preventDefault();e.stopPropagation();
 const uid=del.dataset.adminDeleteUser||del.closest('[data-user-id]')?.dataset.userId;
 const u=profiles.find(x=>String(x.id)===String(uid));
 if(u)adminDeleteUser(u.id,u.nickname);
});

const usersGridObserver=new MutationObserver(()=>injectAdminUserDeleteButtons());
document.addEventListener('DOMContentLoaded',()=>{
 const g=$('#usersGrid');if(g){usersGridObserver.observe(g,{childList:true,subtree:true});injectAdminUserDeleteButtons()}
});


document.addEventListener('click',e=>{
 const link=e.target.closest?.('[data-profile-link]');
 if(!link)return;
 e.preventDefault();e.stopPropagation();
 const uid=link.dataset.profileLink;
 const u=profiles.find(x=>String(x.id)===String(uid))||(profile&&String(profile.id)===String(uid)?profile:null);
 if(u)openUserProfile(u);
});
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'&&e.key!==' ')return;
 const link=e.target.closest?.('[data-profile-link]');
 if(!link)return;
 e.preventDefault();e.stopPropagation();
 const u=profiles.find(x=>String(x.id)===String(link.dataset.profileLink));
 if(u)openUserProfile(u);
});


document.addEventListener('DOMContentLoaded',()=>{
 const btn=document.getElementById('deleteCoverBtn');
 if(btn){
   const fresh=btn.cloneNode(true);
   btn.replaceWith(fresh);
   fresh.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();deleteProfileMedia('cover')});
 }
});


/* v86: clickable nicknames everywhere */
document.addEventListener('click',e=>{
 const el=e.target.closest?.('[data-profile-link]');
 if(!el)return;
 const uid=el.dataset.profileLink;
 const u=profiles.find(x=>String(x.id)===String(uid)) ||
         (profile&&String(profile.id)===String(uid)?profile:null);
 if(!u)return;
 e.preventDefault();
 e.stopPropagation();
 openUserProfile(u);
},true);


/* v87: framed user cards + their nicknames open profiles */
document.addEventListener('click',e=>{
 const card=e.target.closest?.('[data-user-id],.userCard,.user-card,.personCard,.person-card');
 if(!card)return;
 if(e.target.closest('button,a,input,textarea,select,[data-admin-delete-user],[data-friend-action]'))return;
 const uid=card.dataset.userId||card.dataset.profileId||card.querySelector?.('[data-profile-link]')?.dataset.profileLink;
 if(!uid)return;
 const u=profiles.find(x=>String(x.id)===String(uid))||(profile&&String(profile.id)===String(uid)?profile:null);
 if(!u)return;
 e.preventDefault();e.stopPropagation();
 openUserProfile(u);
},true);



