const ACTIVE_KEY='dnd.activeCharacterId';
const state={campaignId:'10000000-0000-4000-8000-000000000001',characterId:localStorage.getItem(ACTIVE_KEY)||null,data:null};
const esc=(value)=>String(value??'').replace(/[&<>\"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value)=>new Intl.NumberFormat('ru-RU').format(Number(value||0));
async function request(path,options={}){
  const response=await fetch(path.startsWith('/api/')?path:`/api${path}`,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Ошибка сервера');
  return data;
}
function activeId(){state.characterId=localStorage.getItem(ACTIVE_KEY)||null;return state.characterId;}
function messageMarkup(message){
  const master=message.role==='MASTER';
  return `<div class="message ${master?'master':''}"><span class="${master?'master-seal small':'portrait'}">${master?'✦':'И'}</span><div><div class="speaker">${master?'ИИ-Мастер':'Игрок'} <time>${new Date(message.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${esc(message.body)}</p></div></div>`;
}
function updateChat(){
  const data=state.data;
  if(!data)return;
  const character=data.character;
  const messages=document.querySelector('#messages');
  if(!character){
    if(messages)messages.innerHTML='<div class="message master"><span class="master-seal small">✦</span><div><div class="speaker">ИИ-Мастер</div><p>Сначала выберите персонажа в разделе «Персонажи» и нажмите «Начать игру».</p></div></div>';
    return;
  }
  if(messages)messages.innerHTML=(data.messages||[]).map(messageMarkup).join('');
  const identity=document.querySelector('.hero-identity');
  if(identity)identity.innerHTML=`<span class="hero-avatar">${esc(character.name[0])}</span><div><span class="summary-label">Активный герой</span><h2>${esc(character.name)}</h2><p>${esc(character.biography||'')}</p><div class="identity-tags"><span>${esc(character.class_name)}</span><span>${esc(character.race)}</span><span>Ранг: ${esc(character.rank)}</span></div></div>`;
  const stats=document.querySelectorAll('.hero-stat strong');
  if(stats.length>=4){
    stats[0].textContent=`${character.hp} / ${character.hp_max}${character.temp_hp?` (+${character.temp_hp})`:''}`;
    stats[1].textContent=character.armor_class;
    stats[2].textContent=character.level;
    stats[3].textContent=`${fmt(character.xp)} / ${fmt(character.xp_next)}`;
  }
  const party=document.querySelector('.party-list');
  if(party)party.innerHTML=(data.party||[]).map(member=>`<div class="party-member"><span class="portrait">${esc(member.name[0])}</span><div><strong>${esc(member.name)}</strong><small>${esc(member.class_name)} · ${member.level} уровень</small></div><b>${member.hp} / ${member.hp_max}</b></div>`).join('')||'<div class="state-note">В партии пока нет персонажей.</div>';
  const location=data.locations?.[0];
  const locationCard=document.querySelector('.current-location');
  if(locationCard)locationCard.innerHTML=location?`<div class="location-thumb">⌂</div><strong>${esc(location.name)}</strong><small>${esc(location.description||'')}</small>`:'<div class="state-note">Персонаж ещё не открыл ни одной локации.</div>';
  const form=document.querySelector('#composer');
  if(form)form.onsubmit=sendMessage;
}
async function sendMessage(event){
  event.preventDefault();
  const id=activeId();
  if(!id)return;
  const input=document.querySelector('#chatInput');
  const body=input.value.trim();
  if(!body)return;
  input.disabled=true;
  try{
    const result=await request(`/campaigns/${state.campaignId}/messages`,{method:'POST',body:JSON.stringify({characterId:id,body})});
    state.data.messages.push(result.player,result.master);
    input.value='';
    updateChat();
    const messages=document.querySelector('#messages');
    if(messages)messages.scrollTop=messages.scrollHeight;
  }catch(error){window.alert(error.message)}finally{input.disabled=false;input.focus();}
}
async function load(){
  state.characterId=activeId();
  try{state.data=await request(`/bootstrap?campaignId=${encodeURIComponent(state.campaignId)}${state.characterId?`&characterId=${encodeURIComponent(state.characterId)}`:''}`);updateChat();}
  catch(error){console.error(error);const toast=document.querySelector('#toast');if(toast){toast.textContent=error.message||'Нет соединения с игровой базой';toast.classList.add('show');}}
}
window.addEventListener('dnd:active-character-changed',load);
window.addEventListener('DOMContentLoaded',load);
