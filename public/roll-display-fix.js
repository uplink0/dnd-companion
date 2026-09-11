const ROLL_ABILITY_NAMES={STR:'Сила',DEX:'Ловкость',CON:'Телосложение',INT:'Интеллект',WIS:'Мудрость',CHA:'Харизма'};
function formatRollResultCard(root,roll){
  if(!root||!roll)return;
  const sides=Number(roll.sides||20);
  const die=roll.die??roll.dice_total??roll.diceTotal??null;
  const total=roll.total??(die==null?null:Number(die)+Number(roll.modifier||0));
  const modifier=Number(roll.modifier||0);
  const ability=ROLL_ABILITY_NAMES[String(roll.ability||'').toUpperCase()]||'модификатор';
  root.innerHTML=`<strong>🎲 Бросок d${sides}</strong><div>Выпало: <b>${die==null?'—':esc(String(die))}</b> <span class="roll-modifier">${modifier>=0?'+':''}${esc(String(modifier))} ${esc(ability)}</span></div><div>Итог: <b>${total==null?'—':esc(String(total))}</b>${roll.dc!=null?` <span class="roll-outcome">${roll.success?'Успех':'Неудача'} · КС ${esc(String(roll.dc))}</span>`:''}</div>`;
}
async function refreshRollDisplay(){
  const results=[...document.querySelectorAll('.roll-result')];
  if(!results.length)return;
  try{
    const response=await fetch('/api/bootstrap?campaignId=10000000-0000-4000-8000-000000000001');
    if(!response.ok)return;
    const data=await response.json();
    const rolls=(data.messages||[]).filter(message=>message.role==='SYSTEM'&&message.metadata?.roll).map(message=>message.metadata.roll);
    results.forEach((root,index)=>formatRollResultCard(root,rolls[index]));
  }catch{}
}
const observer=new MutationObserver(()=>refreshRollDisplay());
function initRollDisplayFix(){
  const messages=document.querySelector('#messages');
  if(messages)observer.observe(messages,{childList:true,subtree:true});
  refreshRollDisplay();
}
window.addEventListener('DOMContentLoaded',initRollDisplayFix);
window.addEventListener('dnd:page-rendered',event=>{if(event.detail?.page==='chat')setTimeout(initRollDisplayFix,0);});
