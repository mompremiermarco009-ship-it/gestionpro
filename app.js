"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let transactions = [];
let products = [];
let movements = [];
let settings = { nom: "Mon Entreprise", devise: "HTG", taux_change: 144, taux_charges: 0 };
let entrepriseId = null;
let userEmail = null;

let currentPeriod = "month";
let rentPeriod = "month";
let histSort = { key: "date", dir: "desc" };
let prodSort = { key: "nom", dir: "asc" };
let rentSort = { key: "benefice", dir: "desc" };
let dailyGran = "week";
let tendanceGran = "week";
let currentUnitCost = 0;

const CATEGORIES = {
  vente:   ["Ventes marchandises","Ventes services","Autre entrée"],
  depense: ["Achats","Loyer","Salaires","Électricité","Eau","Transport","Internet","Taxes","Réparations","Autre dépense"]
};

function toLocalISO(d){ d = d instanceof Date ? d : new Date(d); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayISO(){ return toLocalISO(new Date()); }
function monthKey(s){ return s.slice(0,7); }
function fmtMoney(n){ return new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)+" "+(settings.devise||"HTG"); }
function fmtMoneyShort(n){ n=Number(n)||0; const a=Math.abs(n); let s; if(a>=1e6)s=(n/1e6).toFixed(1)+"M";else if(a>=1e3)s=(n/1e3).toFixed(1)+"k";else s=n.toFixed(0); return s+" "+(settings.devise||"HTG"); }
function fmtDate(iso){ if(!iso)return""; const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function weekKey(dateStr){
  const d=new Date(dateStr+"T00:00:00"); const t=new Date(d.valueOf());
  const dayNr=(d.getDay()+6)%7; t.setDate(t.getDate()-dayNr+3);
  const ft=t.valueOf(); t.setMonth(0,1);
  if(t.getDay()!==4)t.setMonth(0,1+((4-t.getDay())+7)%7);
  const w=1+Math.ceil((ft-t)/604800000);
  return `${d.getFullYear()}-S${String(w).padStart(2,"0")}`;
}

let toastTimer=null;
function toast(msg,kind=""){ const el=$("#toast"); if(!el)return; el.textContent=msg; el.className="toast show "+kind; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{el.className="toast "+kind;},3000); }
function applyTheme(d){ document.body.classList.toggle("dark",d); const b=$("#themeToggle"); if(b)b.innerHTML = d?'<i data-lucide="sun"></i>':'<i data-lucide="moon"></i>'; try{localStorage.setItem("gp_theme",d?"dark":"light");}catch{} lucide.createIcons(); }
applyTheme((()=>{ try{const v=localStorage.getItem("gp_theme"); if(v)return v==="dark";}catch{} return matchMedia("(prefers-color-scheme: dark)").matches; })());

let confirmResolver=null;
function showConfirm(opts={}){
  const {title="Confirmer",message="Es-tu sûr ?",icon="alert-triangle",kind="warning",okText="Confirmer",cancelText="Annuler"}=opts;
  return new Promise(resolve=>{
    const modal=$("#confirmModal"); if(!modal){resolve(window.confirm(message.replace(/<[^>]*>/g,"")));return;}
    $("#confirmTitle").textContent=title;
    $("#confirmMessage").innerHTML=message;
    $("#confirmIcon").innerHTML=`<i data-lucide="${icon}"></i>`;
    $("#confirmOk").textContent=okText;
    const cb=$("#confirmCancel");
    if(cancelText===""){cb.style.display="none";$(".confirm-actions").classList.add("single");}
    else{cb.style.display="";cb.textContent=cancelText;$(".confirm-actions").classList.remove("single");}
    modal.classList.remove("danger","info","success");
    if(kind==="danger")modal.classList.add("danger");
    else if(kind==="info")modal.classList.add("info");
    else if(kind==="success")modal.classList.add("success");
    modal.classList.add("open"); modal.setAttribute("aria-hidden","false");
    lucide.createIcons();
    confirmResolver=resolve;
  });
}
function closeConfirm(r){ const m=$("#confirmModal"); if(m){m.classList.remove("open");m.setAttribute("aria-hidden","true");} if(confirmResolver){confirmResolver(r);confirmResolver=null;} }

async function logout(){
  const ok=await showConfirm({title:"Se déconnecter ?",message:"Tu pourras te reconnecter à tout moment.",icon:"log-out",kind:"info",okText:"Se déconnecter"});
  if(!ok)return;
  await sb.auth.signOut();
  window.location.href = "auth.html";
}

async function chargerAnnonce() {
  const { data, error } = await sb.from("annonces").select("message").eq("active", true).single();
  const bar = document.getElementById("adminAnnouncementBar");
  const text = document.getElementById("announcementText");
  
  if (!error && data && data.message) {
    text.textContent = data.message;
    bar.classList.remove("hidden");
    document.getElementById("closeAnnouncement").onclick = () => bar.classList.add("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

async function initDashboard(){
  const { data } = await sb.auth.getSession();
  if(!data.session){ 
    window.location.href = "auth.html";
    return;
  }
  
  userEmail = data.session.user.email; 
  
  const { data: profil, error: errP } = await sb.from("profils").select("entreprise_id, role").eq("id", data.session.user.id).single();
  if(errP || !profil){ 
    toast("Profil introuvable","error"); 
    window.location.href = "auth.html";
    return; 
  }
  
  entrepriseId = profil.entreprise_id;
  
  try {
    await Promise.all([chargerEntreprise(), chargerProduits(), chargerOperations(), chargerMouvements()]);
    await chargerAnnonce();
    await proposerMigration();
  } catch(e) {
    console.error("Erreur chargement", e);
  }

  $("#loadingScreen").classList.add("hidden");
  $("#appScreen").classList.remove("hidden");
  renderAll();
  
  sb.auth.onAuthStateChange(async (event, session) => {
    if(event==="SIGNED_OUT"){ 
      window.location.href = "auth.html"; 
    }
  });
}

async function chargerEntreprise(){
  const {data,error}=await sb.from("entreprises").select("*").eq("id",entrepriseId).single();
  if(!error && data){ settings={nom:data.nom,devise:data.devise,taux_change:Number(data.taux_change)||144,taux_charges:Number(data.taux_charges)}; }
}
async function chargerProduits(){
  const {data,error}=await sb.from("produits").select("*").order("nom");
  if(error){ toast("Erreur chargement produits","error"); return; }
  products=(data||[]).map(p=>({id:p.id,nom:p.nom,prix_achat:Number(p.prix_achat),prix_vente:Number(p.prix_vente),quantite:p.quantite,seuil:p.seuil,import_details:p.import_details}));
}
async function chargerOperations(){
  const {data,error}=await sb.from("operations").select("*").order("date",{ascending:false});
  if(error){ toast("Erreur chargement opérations","error"); return; }
  transactions=(data||[]).map(o=>({id:o.id,date:o.date,type:o.type,categorie:o.categorie,description:o.description||"",montant:Number(o.montant),produit_id:o.produit_id,quantite:o.quantite,prix_unitaire:o.prix_unitaire!=null?Number(o.prix_unitaire):null,prix_achat_unitaire:o.prix_achat_unitaire!=null?Number(o.prix_achat_unitaire):null}));
}
async function chargerMouvements(){
  const {data,error}=await sb.from("mouvements").select("*").order("date",{ascending:false}).limit(200);
  if(error){ toast("Erreur chargement mouvements","error"); return; }
  movements=(data||[]).map(m=>({id:m.id,date:m.date,produit_id:m.produit_id,type:m.type,quantite:m.quantite,note:m.note||""}));
}

/* ===== MIGRATION ET SAUVEGARDE ===== */
async function proposerMigration(){
  let ancienTx=[], ancienProduits=[], ancienMv=[], ancienSet=null;
  try{
    ancienTx=JSON.parse(localStorage.getItem("gp_transactions")||"[]");
    ancienProduits=JSON.parse(localStorage.getItem("gp_products")||"[]");
    ancienMv=JSON.parse(localStorage.getItem("gp_movements")||"[]");
    ancienSet=JSON.parse(localStorage.getItem("gp_settings")||"null");
  }catch{return;}
  if(!ancienTx.length && !ancienProduits.length) return;
  if(products.length>0 || transactions.length>0) return;
  const total = ancienTx.length + ancienProduits.length;
  const ok = await showConfirm({title:"Importer tes données locales ?",message:`J'ai trouvé <strong>${total} enregistrement(s)</strong> dans ce navigateur.<br><br>Les importer dans ton compte Supabase ?`,icon:"download-cloud",kind:"info",okText:"Importer",cancelText:"Ignorer"});
  if(!ok) return;
  await migrerVersCloud(ancienTx, ancienProduits, ancienMv, ancienSet);
}

async function migrerVersCloud(oldTx, oldP, oldMv, oldSet){
  toast("Migration en cours…");
  if(oldSet){
    await sb.from("entreprises").update({
      nom: oldSet.company||settings.nom,
      devise: oldSet.currency||settings.devise,
      taux_change: oldSet.tauxChange||settings.taux_change,
      taux_charges: oldSet.chargesRate||settings.taux_charges
    }).eq("id",entrepriseId);
    await chargerEntreprise();
  }
  const idMap={};
  for(const p of oldP){
    const {data,error}=await sb.from("produits").insert({
      entreprise_id:entrepriseId, nom:p.nom,
      prix_achat:Number(p.prixAchat)||0, prix_vente:Number(p.prixVente)||0,
      quantite:Math.max(0,parseInt(p.quantite,10)||0), seuil:parseInt(p.seuil,10)||5,
      import_details:p.importDetails||null
    }).select().single();
    if(!error && data) idMap[p.id]=data.id;
  }
  for(const t of oldTx){
    const newPid = t.produitId ? idMap[t.produitId]||null : null;
    await sb.from("operations").insert({
      entreprise_id:entrepriseId, date:t.date, type:t.type, categorie:t.categorie,
      description:t.description||"", montant:Number(t.montant)||0,
      produit_id:newPid, quantite:t.quantite||null,
      prix_unitaire:t.prixUnitaire!=null?t.prixUnitaire:null,
      prix_achat_unitaire:t.prixAchatUnitaire!=null?t.prixAchatUnitaire:null
    });
  }
  for(const m of oldMv){
    const newPid=idMap[m.produitId];
    if(!newPid) continue;
    await sb.from("mouvements").insert({
      entreprise_id:entrepriseId, date:m.date||todayISO(),
      produit_id:newPid, type:m.type||"entree",
      quantite:Number(m.quantite)||0, note:m.note||""
    });
  }
  try{
    localStorage.removeItem("gp_transactions");
    localStorage.removeItem("gp_products");
    localStorage.removeItem("gp_movements");
    localStorage.removeItem("gp_settings");
  }catch{}
  await Promise.all([chargerProduits(),chargerOperations(),chargerMouvements()]);
  toast("Migration terminée ✅","success");
}

function exportBackup(){
  const d={exportedAt:new Date().toISOString(),settings,transactions,products,movements};
  const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json;charset=utf-8"});
  const u=URL.createObjectURL(b);const a=document.createElement("a");
  a.href=u;a.download=`gestionpro_backup_${todayISO()}.json`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);
  toast("Sauvegarde créée","success");
}

/* ===== CALCULS ===== */
function getPeriodRange(key){
  const now=new Date();
  const s=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0);
  const e=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59);
  switch(key){
    case "today":return{from:toLocalISO(s(now)),to:toLocalISO(e(now))};
    case "week":{const f=new Date(now);f.setDate(f.getDate()-6);return{from:toLocalISO(s(f)),to:toLocalISO(e(now))};}
    case "month":return{from:toLocalISO(new Date(now.getFullYear(),now.getMonth(),1)),to:toLocalISO(e(now))};
    case "lastMonth":{const f=new Date(now.getFullYear(),now.getMonth()-1,1);const t=new Date(now.getFullYear(),now.getMonth(),0,23,59,59);return{from:toLocalISO(f),to:toLocalISO(t)};}
    case "quarter":{const q=Math.floor(now.getMonth()/3)*3;return{from:toLocalISO(new Date(now.getFullYear(),q,1)),to:toLocalISO(e(now))};}
    case "year":return{from:toLocalISO(new Date(now.getFullYear(),0,1)),to:toLocalISO(e(now))};
    default:return{from:"0000-01-01",to:"9999-12-31"};
  }
}
function periodLabel(k){return{today:"Aujourd’hui",week:"7 derniers jours",month:"Ce mois",lastMonth:"Mois dernier",quarter:"Ce trimestre",year:"Cette année",all:"Toutes les données"}[k]||k;}

function filterTx(list,{from,to,type,categorie,query}={}){
  return list.filter(t=>{
    if(from&&t.date<from)return false; if(to&&t.date>to)return false;
    if(type&&type!=="all"&&t.type!==type)return false;
    if(categorie&&categorie!=="all"&&t.categorie!==categorie)return false;
    if(query){const q=query.toLowerCase();if(!((t.description||"")+" "+t.categorie).toLowerCase().includes(q))return false;}
    return true;
  });
}
function sum(l){return l.reduce((s,t)=>s+Number(t.montant||0),0);}

function computeTotals(l){
  const inL = l.filter(t => t.type === "vente");
  const outL = l.filter(t => t.type === "depense");
  const totalVentes = sum(inL);
  const totalDepenses = sum(outL);

  let totalAchats = 0;
  inL.forEach(t => {
      let pa = t.prix_achat_unitaire;
      if (pa == null && t.produit_id) {
          const p = products.find(prod => prod.id === t.produit_id);
          if (p) pa = p.prix_achat;
      }
      if (pa != null) {
          totalAchats += (Number(pa) * Number(t.quantite || 1));
      }
  });

  const beneficeBrut = totalVentes - totalAchats; 
  const beneficeNet = beneficeBrut - totalDepenses; 
  const marge = totalVentes > 0 ? (beneficeBrut / totalVentes) * 100 : 0;

  return {entrees: totalVentes, sorties: totalDepenses, cogs: totalAchats, beneficeBrut: beneficeBrut, beneficeNet: beneficeNet, charges: 0, marge: marge, countIn: inL.length, countOut: outL.length};
}

function groupByMonth(l){const m=new Map();l.forEach(t=>{const k=monthKey(t.date);if(!m.has(k))m.set(k,{month:k,entrees:0,sorties:0});const r=m.get(k);if(t.type==="vente")r.entrees+=Number(t.montant);else r.sorties+=Number(t.montant);});return Array.from(m.values()).sort((a,b)=>a.month.localeCompare(b.month));}
function groupByCategory(l,type){const m=new Map();l.filter(t=>t.type===type).forEach(t=>{const k=t.categorie||"Autre";m.set(k,(m.get(k)||0)+Number(t.montant));});return Array.from(m.entries()).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);}
function getProduct(id){return products.find(p=>p.id===id);}

function productStockCost(){
  return products.reduce((s,p) => s + ((Number(p.prix_achat) || 0) * (Number(p.quantite) || 0)), 0);
}

function productStockValue(){return products.reduce((s,p)=>s+(Number(p.prix_vente)||0)*(Number(p.quantite)||0),0);}
function lowStockProducts(){return products.filter(p=>Number(p.quantite)<=Number(p.seuil));}

function computeRentability(from,to){
  const txV=transactions.filter(t=>t.type==="vente"&&t.date>=from&&t.date<=to);
  const map=new Map();
  txV.forEach(t=>{
    let key,nom,pa;
    if(t.produit_id){
      const p=getProduct(t.produit_id);
      key="prod:"+t.produit_id;
      nom=p?p.nom:(t.description||"Produit supprimé");
      pa=t.prix_achat_unitaire!=null?t.prix_achat_unitaire:(p?Number(p.prix_achat):0);
    } else {
      const l=t.description||t.categorie||"Vente libre";
      key="libre:"+l; nom=l; pa=0;
    }
    if(!map.has(key))map.set(key,{key,nom,qteVendue:0,ca:0,cout:0,benefice:0,produit_id:t.produit_id});
    const r=map.get(key);
    const q=Number(t.quantite||1),ca=Number(t.montant||0),c=pa*q;
    r.qteVendue+=q; r.ca+=ca; r.cout+=c; r.benefice+=(ca-c);
  });
  const rows=Array.from(map.values()).map(r=>({...r,cout:Math.round(r.cout*100)/100,ca:Math.round(r.ca*100)/100,benefice:Math.round(r.benefice*100)/100,marge:r.ca>0?(r.benefice/r.ca)*100:0}));
  const totalCA=rows.reduce((s,r)=>s+r.ca,0),totalCout=rows.reduce((s,r)=>s+r.cout,0),totalBenefice=rows.reduce((s,r)=>s+r.benefice,0);
  const totalMarge=totalCA>0?(totalBenefice/totalCA)*100:0;
  const enPerte=rows.filter(r=>r.benefice<0);
  let best=null; rows.forEach(r=>{if(!best||r.benefice>best.benefice)best=r;});
  return{rows,totalCA,totalCout,totalBenefice,totalMarge,enPerte,best};
}

/* ===== RENDU ===== */
function renderCompanyName(){
  $("#companyName").textContent=settings.nom||"Mon Entreprise";
  const c=$("#setCompany");if(c)c.value=settings.nom||"";
  const cur=$("#setCurrency");if(cur)cur.value=settings.devise||"HTG";
  const ch=$("#setCharges");if(ch)ch.value=settings.taux_charges||0;
  const tx=$("#setTauxChange");if(tx)tx.value=settings.taux_change||144;
  const ue=$("#userEmail"); if(ue) ue.textContent=userEmail||"";
  const si=$("#storageInfo"); if(si) si.textContent=`${transactions.length} opération(s), ${products.length} produit(s), ${movements.length} mouvement(s)`;
}

function renderKPI(){
  const {from,to}=getPeriodRange(currentPeriod);
  const list=filterTx(transactions,{from,to});
  const t=computeTotals(list);
  $("#kpiEntrees").textContent=fmtMoney(t.entrees);
  $("#kpiEntreesCount").textContent=`${t.countIn} opération(s)`;
  $("#kpiSorties").textContent=fmtMoney(t.sorties);
  $("#kpiSortiesCount").textContent=`${t.countOut} opération(s)`;
  $("#kpiBenefice").textContent=fmtMoney(t.beneficeBrut);
  $("#kpiMarge").textContent=`Marge : ${t.marge.toFixed(1)} %`;
  $("#kpiNet").textContent=fmtMoney(t.beneficeNet);
  $("#kpiCharges").textContent=`Charges : ${fmtMoney(t.charges)}`;
  $("#periodLabel").textContent=periodLabel(currentPeriod);
  $("#kpiStockValue").textContent=fmtMoney(productStockValue());
  $("#kpiStockCount").textContent=`${products.length} produit(s)`;
  $("#alertPerte").classList.toggle("hidden",t.beneficeNet>=0);
  const low=lowStockProducts();
  const aEl=$("#alertStock");
  if(low.length){$("#alertStockCount").textContent=low.length;aEl.classList.remove("hidden");}else aEl.classList.add("hidden");
  const badge=$("#stockBadge");
  if(badge){if(low.length){badge.textContent=low.length;badge.classList.remove("hidden");}else badge.classList.add("hidden");}
}

// ... (Les fonctions de rendu renderRecentTable, drawPeriodChart, drawMonthlyChart, drawDonutChart, drawTendanceChart, renderSaleGrid, renderDepTable, renderStock, renderRentabilite, renderTendances, renderHistorique, renderRapports, renderAll sont identiques à votre ancien code et doivent être collées ici. Je ne les répète pas pour la lisibilité, mais vous devez les garder) ...

/* ===== ACTIONS ===== */
let saleProductId=null;
function openSaleModal(id){
  const p=getProduct(id);if(!p)return;
  saleProductId=id;
  $("#saleProductInfo").innerHTML=`<strong>${escapeHtml(p.nom)}</strong><small>Stock : ${p.quantite} — Prix vente : ${fmtMoney(p.prix_vente)} — Coût unit. : ${fmtMoney(p.prix_achat)}</small>`;
  $("#saleQte").value=1;
  $("#saleDate").value=todayISO();
  $("#salePrix").value=p.prix_vente;
  updateSaleTotal();
  $("#saleModal").classList.add("open");$("#saleModal").setAttribute("aria-hidden","false");
  setTimeout(()=>$("#saleQte").focus(),100);
  lucide.createIcons();
}
function closeSaleModal(){$("#saleModal").classList.remove("open");$("#saleModal").setAttribute("aria-hidden","true");saleProductId=null;}
function updateSaleTotal(){
  const p=getProduct(saleProductId);if(!p)return;
  const q=parseInt($("#saleQte").value,10)||0;
  const pr=parseFloat($("#salePrix").value)||0;
  const t=q*pr;
  $("#saleTotal").textContent=fmtMoney(t);
  const cost=q*Number(p.prix_achat);
  const prof=t-cost;
  const mb=$("#saleMargin");
  if(mb){
    if(prof<0){mb.className="sale-margin loss";mb.innerHTML=`<i data-lucide="trending-down" style="width:18px;height:18px;"></i> Perte : ${fmtMoney(prof)} (coût : ${fmtMoney(cost)})`;}
    else if(prof>0){mb.className="sale-margin profit";mb.innerHTML=`<i data-lucide="trending-up" style="width:18px;height:18px;"></i> Bénéfice : ${fmtMoney(prof)} (coût : ${fmtMoney(cost)})`;}
    else{mb.className="sale-margin";mb.textContent=`Aucun bénéfice (coût : ${fmtMoney(cost)})`;}
  }
  const h=$("#saleHint");
  if(q>p.quantite){h.innerHTML=`<i data-lucide="alert-triangle" style="width:14px;height:14px;"></i> Stock insuffisant : ${p.quantite} disponible(s).`;h.style.color="var(--red-dark)";}
  else{h.textContent=`Stock après vente : ${p.quantite-q}.`;h.style.color="var(--muted)";}
  lucide.createIcons();
}
async function handleSaleSubmit(e){
  e.preventDefault();
  const p=getProduct(saleProductId);if(!p)return;
  const q=parseInt($("#saleQte").value,10),pr=parseFloat($("#salePrix").value),dt=$("#saleDate").value;
  if(!Number.isFinite(q)||q<=0){toast("Quantité invalide","error");return;}
  if(!Number.isFinite(pr)||pr<0){toast("Prix invalide","error");return;}
  if(!dt){toast("Date obligatoire","error");return;}
  if(q>p.quantite){await showConfirm({title:"Stock insuffisant",message:`Il n'y a que <strong>${p.quantite}</strong> unité(s).`,icon:"alert-circle",kind:"info",okText:"Compris",cancelText:""});return;}
  const btn=e.target.querySelector("button[type=submit]");
  if(btn){btn.disabled=true;btn.innerHTML="Enregistrement…";}
  const {data,error}=await sb.rpc("vendre_produit",{p_produit_id:p.id,p_quantite:q,p_prix_unitaire:pr,p_date:dt});
  if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="check" style="width:18px;height:18px;"></i> Confirmer';}
  if(error){toast("Erreur : "+error.message,"error");return;}
  await Promise.all([chargerProduits(),chargerOperations(),chargerMouvements()]);
  toast(`Vente : ${fmtMoney(data?.montant||q*pr)} ✅`,"success");
  closeSaleModal();renderAll();
}

// ... (handleDepenseSubmit, handleDeleteOperation, setProdMode, updateLocalCalc, updateImportCalc, updateLiveMargin, openProductModal, closeProductModal, handleProductSubmit, handleDeleteProduct, openMovementModal, closeMovementModal, handleMovementSubmit, handleSettingsSubmit restent identiques à votre ancien code, collez-les ici) ...

/* ===== INITIALISATION ===== */
function buildPDFReport(){
  const period=$("#reportPeriod")?.value||"month";
  const {from,to}=getPeriodRange(period);
  const list=filterTx(transactions,{from,to});
  const t=computeTotals(list);
  $("#pdfCompany").textContent=settings.nom||"Mon Entreprise";
  $("#pdfDate").textContent="Généré le "+fmtDate(todayISO());
  $("#pdfPeriodLabel").textContent="Période : "+periodLabel(period);
  $("#pdfEntrees").textContent=fmtMoney(t.entrees);
  $("#pdfSorties").textContent=fmtMoney(t.sorties);
  $("#pdfBenefice").textContent=fmtMoney(t.beneficeBrut);
  $("#pdfCharges").textContent=fmtMoney(t.charges);
  $("#pdfNet").textContent=fmtMoney(t.beneficeNet);
  $("#pdfMarge").textContent=t.marge.toFixed(1)+" %";
  $("#pdfStockCount").textContent=products.length;
  $("#pdfStockValue").textContent=fmtMoney(productStockCost());
  $("#pdfStockSale").textContent=fmtMoney(productStockValue());
  $("#pdfStockAlerts").textContent=lowStockProducts().length;
  const catIn=groupByCategory(list,"vente"),catOut=groupByCategory(list,"depense");
  const rt=(sel,rows,tot)=>{const tb=document.querySelector(sel);if(!tb)return;if(!rows.length){tb.innerHTML=`<tr><td colspan="3" style="text-align:center;color:#888">Aucune donnée</td></tr>`;return;}tb.innerHTML=rows.map(r=>`<tr><td>${escapeHtml(r.label)}</td><td class="num">${fmtMoney(r.value)}</td><td class="num">${tot>0?((r.value/tot)*100).toFixed(1):0} %</td></tr>`).join("");};
  rt("#pdfCatInTable tbody",catIn,catIn.reduce((s,r)=>s+r.value,0));
  rt("#pdfCatOutTable tbody",catOut,catOut.reduce((s,r)=>s+r.value,0));
  const rent=computeRentability(from,to);
  const rtb=document.querySelector("#pdfRentTable tbody");
  if(rtb){rtb.innerHTML=rent.rows.length?rent.rows.map(r=>`<tr><td>${escapeHtml(r.nom)}</td><td class="num">${r.qteVendue}</td><td class="num">${fmtMoney(r.ca)}</td><td class="num">${fmtMoney(r.cout)}</td><td class="num">${fmtMoney(r.benefice)}</td></tr>`).join(""):`<tr><td colspan="5" style="text-align:center;color:#888">Aucune vente</td></tr>`;}
  const months=groupByMonth(transactions).slice(-12).reverse();
  const mtb=document.querySelector("#pdfMonthlyTable tbody");
  if(mtb){const mf=["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];mtb.innerHTML=months.map(m=>{const b=m.entrees-m.sorties,mg=m.entrees>0?(b/m.entrees)*100:0;const [y,mm]=m.month.split("-");return `<tr><td>${mf[parseInt(mm,10)-1]} ${y}</td><td class="num">${fmtMoney(m.entrees)}</td><td class="num">${fmtMoney(m.sorties)}</td><td class="num">${fmtMoney(b)}</td><td class="num">${mg.toFixed(1)} %</td></tr>`;}).join("");}
  const topMap=new Map();
  list.filter(t=>t.type==="vente").forEach(tx=>{const n=tx.produit_id?(getProduct(tx.produit_id)?.nom||tx.description||"—"):(tx.description||tx.categorie||"Autre");topMap.set(n,(topMap.get(n)||0)+Number(tx.quantite||1));});
  const top=Array.from(topMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const ttb=document.querySelector("#pdfTopTable tbody");
  if(ttb){ttb.innerHTML=top.length?top.map(([n,q],i)=>`<tr><td>${i+1}. ${escapeHtml(n)}</td><td class="num">${q} vente(s)</td></tr>`).join(""):`<tr><td colspan="2" style="text-align:center;color:#888">Aucune vente</td></tr>`;}
  $("#pdfGenDate").textContent=new Date().toLocaleString("fr-FR");
}

function initInstallBanner() {
  const banner = document.getElementById("installBanner");
  const closeBtn = document.getElementById("closeBanner");
  if (!banner || !closeBtn) return;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!isStandalone) {
    setTimeout(() => {
      banner.classList.remove("hidden");
      void banner.offsetWidth; 
      banner.classList.add("show");
      lucide.createIcons();
    }, 1500);
  }
  closeBtn.addEventListener("click", () => {
    banner.classList.remove("show");
    setTimeout(() => banner.classList.add("hidden"), 300);
  });
}

function bindUI(){
  $("#logoutBtn")?.addEventListener("click",logout);
  $("#saleForm")?.addEventListener("submit",handleSaleSubmit);
  $("#saleQte")?.addEventListener("input",updateSaleTotal);
  $("#salePrix")?.addEventListener("input",updateSaleTotal);
  $("#saleClose")?.addEventListener("click",closeSaleModal);
  $("#saleCancel")?.addEventListener("click",closeSaleModal);
  $("#saleModal")?.addEventListener("click",e=>{if(e.target.id==="saleModal")closeSaleModal();});
  $("#depenseForm")?.addEventListener("submit",handleDepenseSubmit);
  $("#productForm")?.addEventListener("submit",handleProductSubmit);
  $("#productClose")?.addEventListener("click",closeProductModal);
  $("#productCancel")?.addEventListener("click",closeProductModal);
  $("#productModal")?.addEventListener("click",e=>{if(e.target.id==="productModal")closeProductModal();});
  $("#btnNewProduct")?.addEventListener("click",()=>openProductModal());
  $("#prodModeLocal")?.addEventListener("click",()=>setProdMode("local"));
  $("#prodModeImport")?.addEventListener("click",()=>setProdMode("import"));

  ["prodAchatTotal","prodAchatQte"].forEach(id=>document.getElementById(id)?.addEventListener("input",updateLocalCalc));
  ["prodUsdPrix","prodUsdLivraison","prodUsdTransport","prodUsdAutres","prodTaux","prodUsdQte"].forEach(id=>document.getElementById(id)?.addEventListener("input",updateImportCalc));
  $("#prodPrixVente")?.addEventListener("input",updateLiveMargin);

  $("#movementForm")?.addEventListener("submit",handleMovementSubmit);
  $("#movementClose")?.addEventListener("click",closeMovementModal);
  $("#movementCancel")?.addEventListener("click",closeMovementModal);
  $("#movementModal")?.addEventListener("click",e=>{if(e.target.id==="movementModal")closeMovementModal();});
  $("#btnNewMovement")?.addEventListener("click",openMovementModal);
  $$(".type-btn[data-mov-type]").forEach(b=>b.addEventListener("click",()=>{
    movType=b.dataset.movType;$$(".type-btn[data-mov-type]").forEach(x=>x.classList.toggle("active",x===b));
    const h={entree:"Entrée : ajoute au stock.",sortie:"Retire du stock.",correction:"Fixe la quantité exacte."};
    $("#movHint").textContent=h[movType];
  }));
  $("#formSettings")?.addEventListener("submit",handleSettingsSubmit);
  $("#btnBackup")?.addEventListener("click",exportBackup);
  $("#themeToggle")?.addEventListener("click",()=>{const d=!document.body.classList.contains("dark");applyTheme(d);});
  $("#btnExportPDF")?.addEventListener("click",()=>{buildPDFReport();setTimeout(()=>window.print(),100);});
  $("#btnPrint")?.addEventListener("click",()=>{buildPDFReport();setTimeout(()=>window.print(),100);});
  $("#confirmOk")?.addEventListener("click",()=>closeConfirm(true));
  $("#confirmCancel")?.addEventListener("click",()=>closeConfirm(false));
  $("#confirmModal")?.addEventListener("click",e=>{if(e.target.id==="confirmModal")closeConfirm(false);});
  
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&$("#confirmModal")?.classList.contains("open"))closeConfirm(false);
    if(e.key==="Enter"&&$("#confirmModal")?.classList.contains("open"))closeConfirm(true);
    if(e.key==="Escape"){
      if($("#saleModal")?.classList.contains("open"))closeSaleModal();
      if($("#productModal")?.classList.contains("open"))closeProductModal();
      if($("#movementModal")?.classList.contains("open"))closeMovementModal();
    }
  });

  initInstallBanner();
}

async function start(){
  bindUI();
  bindNav();
  bindDelegation();
  
  const n=new Date();const f=new Date(n.getFullYear(),n.getMonth(),1);
  $("#histFrom") && ($("#histFrom").value=toLocalISO(f));
  $("#histTo") && ($("#histTo").value=todayISO());
  $("#depDate") && ($("#depDate").value=todayISO());
  updateDepenseCategories();
  lucide.createIcons();
  
  await initDashboard();
}

window.addEventListener("supabase:ready",start);
if(window.sb) start();
