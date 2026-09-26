const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const toggle=$('.menu-toggle'), nav=$('nav');
toggle?.addEventListener('click',()=>{nav.style.display=nav.style.display==='flex'?'none':'flex';nav.style.position='absolute';nav.style.top='70px';nav.style.left='0';nav.style.right='0';nav.style.padding='20px 6vw';nav.style.background='rgba(255,253,242,.98)';nav.style.flexDirection='column';nav.style.alignItems='stretch'});
$$('nav a').forEach(a=>a.addEventListener('click',()=>{if(innerWidth<901)nav.style.display='none'}));

let menu=[];
async function loadMenu(){
  try { menu=await fetch('/api/menu').then(r=>r.json()); renderMenu(); }
  catch { /* static cards remain as fallback */ }
}
function renderMenu(){
  const grid=$('.menu-grid'); if(!grid||!Array.isArray(menu)) return;
  grid.innerHTML=menu.map(item=>`<article class="dish ${item.name.startsWith('Sprout')?'featured':''}">
    <div class="dish-img"><img src="${item.image}" alt="${item.name}" loading="lazy"><span>${item.prices.map(p=>`${p.size} · ₹${p.price}`).join(' | ')}</span></div>
    <h3>${item.name}</h3><p>${item.description}</p>
    <button class="order-btn" data-id="${item.id}">Add to order →</button></article>`).join('');
  $$('.order-btn').forEach(b=>b.onclick=()=>openOrder(Number(b.dataset.id)));
}
function openOrder(id){
  const item=menu.find(x=>x.id===id); if(!item) return;
  const size=item.prices[0];
  const modal=document.createElement('div'); modal.className='modal-backdrop'; modal.innerHTML=`<div class="modal"><button class="modal-close">×</button><span class="eyebrow">ORDER BOWL</span><h2>${item.name}</h2><p>${item.description}</p><label>Size<select id="order-size">${item.prices.map(p=>`<option value="${p.size}">${p.size} — ₹${p.price}</option>`).join('')}</select></label><label>Quantity<input id="order-qty" type="number" min="1" max="20" value="1"></label><form id="order-form"><input name="customerName" placeholder="Your name" required><input name="phone" placeholder="Phone number" required><select name="area"><option value="sonari">Sonari delivery</option><option value="nazira">Nazira delivery</option><option value="pickup">Self pickup</option></select><textarea name="address" placeholder="Delivery address" required></textarea><textarea name="notes" placeholder="Notes (optional)"></textarea><button class="btn primary" type="submit">Place order</button></form><div id="order-result"></div></div>`;
  document.body.append(modal); $('.modal-close',modal).onclick=()=>modal.remove();
  $('#order-form',modal).onsubmit=async e=>{e.preventDefault(); const fd=new FormData(e.target); const selected=item.prices.find(p=>p.size===$('#order-size',modal).value); const body={customerName:fd.get('customerName'),phone:fd.get('phone'),area:fd.get('area'),address:fd.get('address'),notes:fd.get('notes'),items:[{menuItemId:id,size:selected.size,quantity:Number($('#order-qty',modal).value)}]}; const out=$('#order-result',modal); try{const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=await r.json(); if(!r.ok) throw new Error(data.error); out.innerHTML=`<div class="success">Order #${data.orderId} received. Total: ₹${data.total}. We’ll contact you shortly.</div>`; e.target.reset();}catch(err){out.innerHTML=`<div class="error">${err.message}</div>`;}};
}
loadMenu();
