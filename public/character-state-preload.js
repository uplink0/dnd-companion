(() => {
  const KEY='dnd.activeCharacterId';
  const nativeFetch=window.fetch.bind(window);
  const activeId=()=>localStorage.getItem(KEY)||null;

  const refreshProfile=async()=>{
    try{
      const profile=document.querySelector('.profile');
      if(!profile)return;
      const id=activeId();
      const avatar=profile.querySelector('.avatar');
      const label=profile.querySelector('span:nth-of-type(2)');
      if(!id){if(avatar)avatar.textContent='?';if(label)label.textContent='Игрок';return;}
      const response=await nativeFetch(`/api/characters/${encodeURIComponent(id)}/summary`);
      if(!response.ok)return;
      const character=await response.json();
      if(avatar)avatar.textContent=String(character.name||'?')[0];
      if(label)label.textContent=character.name||'Игрок';
    }catch{}
  };

  window.dndActiveCharacterId=activeId;
  window.dndSetActiveCharacter=(id)=>{localStorage.setItem(KEY,id);window.dispatchEvent(new CustomEvent('dnd:active-character-changed',{detail:{id}}));refreshProfile();};
  window.dndClearActiveCharacter=()=>{localStorage.removeItem(KEY);window.dispatchEvent(new CustomEvent('dnd:active-character-changed',{detail:{id:null}}));refreshProfile();};

  window.fetch=async(input,init={})=>{
    const requestUrl=typeof input==='string'?input:input.url;
    const url=new URL(requestUrl,location.origin);
    if(!url.pathname.startsWith('/api/')||url.pathname.startsWith('/api/player/'))return nativeFetch(input,init);
    const id=activeId();
    const method=String(init.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
    if(!id)return nativeFetch(input,init);
    if(url.pathname.endsWith('/bootstrap'))url.searchParams.set('characterId',id);
    if(method!=='POST'||typeof init.body!=='string')return nativeFetch(url.toString(),init);
    let body;try{body=JSON.parse(init.body)}catch{return nativeFetch(input,init)}
    if(url.pathname.endsWith('/messages')||url.pathname.endsWith('/rolls'))body.characterId=id;
    if(url.pathname.endsWith('/damage')||url.pathname.endsWith('/healing'))body.actorId=id;
    if(url.pathname.endsWith('/effects'))body.sourceId=id;
    if(url.pathname.endsWith('/accept')&&url.pathname.includes('/quests/'))body.characterId=id;
    if(url.pathname.endsWith('/identify')&&url.pathname.includes('/items/'))body.characterId=id;
    if(url.pathname.endsWith('/party/recruit'))body.actorId=id;
    const headers=new Headers(init.headers||{});if(!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    return nativeFetch(url.toString(),{...init,headers,body:JSON.stringify(body)});
  };

  window.addEventListener('dnd:active-character-changed',()=>refreshProfile());
  window.addEventListener('DOMContentLoaded',()=>refreshProfile());
})();
