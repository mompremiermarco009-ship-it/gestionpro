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
let authMode = "login";
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

async function initAuth(){
  const { data } = await sb.auth.getSession();
  if(data.session){ userEmail=data.session.user.email; await onLoggedIn(data.session.user); }
  else { showAuthScreen(); }
  sb.auth.onAuthStateChange(async (event, session) => {
    if(event==="SIGNED_IN" && session){ userEmail=session.user.email; await onLoggedIn(session.user); }
    else if(event==="SIGNED_OUT"){ showAuthScreen(); }
  });
}
function showAuthScreen(){ $("#authScreen").classList.remove("hidden"); $("#appScreen").classList.add("hidden"); userEmail=null; entrepriseId=null; products=[]; transactions=[]; movements=[]; }
function showAppScreen(){ $("#authScreen").classList.add("hidden"); $("#appScreen").classList.remove("hidden"); }
function setAuthMode(mode){
  authMode=mode; const isLogin=mode==="login";
  $("#authTabLogin").classList.toggle("active",isLogin);
  $("#authTabSignup").classList.toggle("active",!isLogin);
  $("#authConfirmWrap").classList.toggle("hidden",isLogin);
  $("#authSubmit").textContent=isLogin?"Se connecter":"Créer mon compte";
  $("#authSubtitle").textContent=isLogin?"Connecte-toi pour gérer ton entreprise":"Crée ton compte pour commencer";
  $("#authPassword").setAttribute("autocomplete",isLogin?"current-password":"new-password");
  $("#authStatus").textContent=""; $("#authStatus").className="auth-status";
  $("#authSwitch").innerHTML=isLogin
    ? 'Pas encore de compte ? <button type="button" class="link-btn" id="authSwitchBtn">Créer un compte</button>'
    : 'Déjà un compte ? <button type="button" class="link-btn" id="authSwitchBtn">Se connecter</button>';
  $("#authSwitchBtn")?.addEventListener("click",()=>setAuthMode(isLogin?"signup":"login"));
}
async function handleAuthSubmit(e){
  e.preventDefault();
  const email=$("#authEmail").value.trim(); const pass=$("#authPassword").value;
  const status=$("#authStatus"); const btn=$("#authSubmit");
  status.className="auth-status"; status.textContent="";
  if(authMode==="login"){
    btn.disabled=true; btn.textContent="Connexion…";
    const {error}=await sb.auth.signInWithPassword({email,password:pass});
    btn.disabled=false; btn.textContent="Se connecter";
    if(error){ status.textContent=traduireErreur(error.message); status.classList.add("error"); }
  } else {
    const confirm=$("#authPasswordConfirm").value;
    if(pass!==confirm){ status.textContent="Les mots de passe ne correspondent pas."; status.classList.add("error"); return; }
    if(pass.length<6){ status.textContent="6 caractères minimum."; status.classList.add("error"); return; }
    btn.disabled=true; btn.textContent="Création…";
    const redirectUrl = window.location.origin + window.location.pathname;
    const {error}=await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: redirectUrl } });
    btn.disabled=false; btn.textContent="Créer mon compte";
    if(error){ status.textContent=traduireErreur(error.message); status.classList.add("error"); }
    else { status.textContent="Compte créé ! Vérifie ton email, clique sur le lien."; status.classList.add("success"); }
  }
}
function traduireErreur(msg){
  if(!msg)return"Erreur inconnue";
  if(/invalid login credentials/i.test(msg))return"Email ou mot de passe incorrect.";
  if(/user already registered/i.test(msg))return"Cet email est déjà utilisé.";
  if(/email not confirmed/i.test(msg))return"Email non confirmé.";
  if(/password/i.test(msg))return"Mot de passe trop faible (6 caractères min).";
  return msg;
}
async function logout(){
  const ok=await showConfirm({title:"Se déconnecter ?",message:"Tu pourras te reconnecter à tout moment.",icon:"log-out",kind:"info",okText:"Se déconnecter"});
  if(!ok)return;
  await sb.auth.signOut();
  toast("Déconnecté","success");
}

async function onLoggedIn(user){
  const { data: profil, error: errP } = await sb.from("profils").select("entreprise_id, role").eq("id",user.id).single();
  if(errP || !profil){ toast("Profil introuvable","error"); showAuthScreen(); return; }
  entrepriseId = profil.entreprise_id;
  await Promise.all([chargerEntreprise(),chargerProduits(),chargerOperations(),chargerMouvements()]);
  await proposerMigration();
  showAppScreen();
  renderAll();
  if(window.location.hash && window.location.hash.includes("access_token")){
    history.replaceState(null,"",window.location.pathname);
  }
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

// ====== CORRECTION ICI : CALCUL DU BÉNÉFICE ======
function computeTotals(l){
  const inL=l.filter(t=>t.type==="vente"),outL=l.filter(t=>t.type==="depense");
  const e=sum(inL); // Total Ventes (Chiffre d'affaires)
  const s=sum(outL); // Total Dépenses

  // Calcul du coût d'achat total des produits vendus (COGS)
  let cogs = 0;
  inL.forEach(t => {
      let pa = t.prix_achat_unitaire;
      // Si le prix d'achat n'est pas enregistré dans l'opération, on le récupère du produit
      if (pa == null && t.produit_id) {
          const p = products.find(prod => prod.id === t.produit_id);
          if (p) pa = p.prix_achat;
      }
      if (pa != null) {
          cogs += (Number(pa) * Number(t.quantite || 1));
      }
  });

  // Bénéfice brut = Ventes - Prix d'achat des produits
  const bb = e - cogs; 
  
  // Charges estimées (% du CA)
  const ch = e * (Number(settings.taux_charges) || 0) / 100; 
  
  // Bénéfice net = Bénéfice brut - Dépenses - Charges
  const bn = bb - s - ch; 
  
  // Marge (basée sur le bénéfice brut par rapport aux ventes)
  const m = e > 0 ? (bb / e) * 100 : 0;

  return {entrees:e, sorties:s, cogs:cogs, beneficeBrut:bb, beneficeNet:bn, charges:ch, marge:m, countIn:inL.length, countOut:outL.length};
}
// =================================================

function groupByMonth(l){const m=new Map();l.forEach(t=>{const k=monthKey(t.date);if(!m.has(k))m.set(k,{month:k,entrees:0,sorties:0});const r=m.get(k);if(t.type==="vente")r.entrees+=Number(t.montant);else r.sorties+=Number(t.montant);});return Array.from(m.values()).sort((a,b)=>a.month.localeCompare(b.month));}
function groupByCategory(l,type){const m=new Map();l.filter(t=>t.type===type).forEach(t=>{const k=t.categorie||"Autre";m.set(k,(m.get(k)||0)+Number(t.montant));});return Array.from(m.entries()).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);}
function getProduct(id){return products.find(p=>p.id===id);}

function productStockCost(){return products.reduce((s,p)=>s+(Number(p.prix_achat)||0),0);}
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
  
  // Alerte basée sur le bénéfice NET maintenant
  $("#alertPerte").classList.toggle("hidden",t.beneficeNet>=0);
  
  $("#alertCharges").classList.toggle("hidden",!(settings.taux_charges>0&&t.sorties>0));
  const low=lowStockProducts();
  const aEl=$("#alertStock");
  if(low.length){$("#alertStockCount").textContent=low.length;aEl.classList.remove("hidden");}else aEl.classList.add("hidden");
  const badge=$("#stockBadge");
  if(badge){if(low.length){badge.textContent=low.length;badge.classList.remove("hidden");}else badge.classList.add("hidden");}
}
function renderRecentTable(){
  const {from,to}=getPeriodRange(currentPeriod);
  const list=filterTx(transactions,{from,to}).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  const tbody=$("#recentTable tbody");
  if(!list.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="5">Aucune opération.</td></tr>`;return;}
  tbody.innerHTML=list.map(t=>`<tr><td>${fmtDate(t.date)}</td><td class="type-${t.type}">${t.type==="vente"?"Entrée":"Sortie"}</td><td>${escapeHtml(t.categorie)}</td><td>${escapeHtml(t.description||"—")}</td><td class="num">${t.type==="vente"?"+":"−"} ${fmtMoney(t.montant)}</td></tr>`).join("");
}

const SVGNS="http://www.w3.org/2000/svg";
function svgEl(t,a={},x=""){const e=document.createElementNS(SVGNS,t);for(const k in a)e.setAttribute(k,a[k]);if(x)e.textContent=x;return e;}
function legend(cs,ls){const d=document.createElement("div");d.className="chart-legend";d.innerHTML=cs.map((c,i)=>`<span><i style="background:${c}"></i> ${ls[i]}</span>`).join("");return d;}
function downloadSVGAsPNG(cid,fn){
  const c=document.getElementById(cid);if(!c)return;
  const svg=c.querySelector("svg");if(!svg){toast("Aucun graphique","error");return;}
  const cl=svg.cloneNode(true);cl.setAttribute("xmlns",SVGNS);
  const bg=document.body.classList.contains("dark")?"#0f172a":"#fff";
  const tc=document.body.classList.contains("dark")?"#f1f5f9":"#111827";
  cl.querySelectorAll("text").forEach(t=>t.setAttribute("fill",tc));
  cl.querySelectorAll("line").forEach(l=>l.setAttribute("stroke",tc));
  const sd=new XMLSerializer().serializeToString(cl);
  const s64=btoa(unescape(encodeURIComponent(sd)));
  const img=new Image();
  img.onload=()=>{const cv=document.createElement("canvas");const vb=cl.getAttribute("viewBox").split(" ").map(Number);const sc=2;cv.width=(vb[2]||800)*sc;cv.height=(vb[3]||300)*sc;const cx=cv.getContext("2d");cx.fillStyle=bg;cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);cv.toBlob(b=>{const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=fn+".png";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);toast("Image téléchargée ✅","success");});};
  img.src="data:image/svg+xml;base64,"+s64;
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-download]"); if(!b)return;
  const id=b.dataset.download;
  const t=(b.closest(".card")?.querySelector("h2")?.textContent||"graphique").toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40);
  downloadSVGAsPNG(id,`gestionpro_${t}_${todayISO()}`);
});

function drawPeriodChart(c,gran){
  c.innerHTML="";
  const now=new Date(); let keys=[],labels=[]; const by=new Map();
  if(gran==="day"){for(let i=29;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);keys.push(toLocalISO(d));labels.push(`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`);}}
  else if(gran==="week"){for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i*7);const k=weekKey(toLocalISO(d));if(!keys.includes(k)){keys.push(k);labels.push("S"+(k.split("-S")[1]||k));}}}
  else{const mf=["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);keys.push(toLocalISO(d).slice(0,7));labels.push(mf[d.getMonth()]);}}
  transactions.forEach(t=>{const k=gran==="day"?t.date:gran==="week"?weekKey(t.date):monthKey(t.date);if(!keys.includes(k))return;if(!by.has(k))by.set(k,{entrees:0,sorties:0});const r=by.get(k);if(t.type==="vente")r.entrees+=Number(t.montant);else r.sorties+=Number(t.montant);});
  const data=keys.map((k,i)=>({key:k,label:labels[i],...(by.get(k)||{entrees:0,sorties:0})}));
  if(!data.some(d=>d.entrees>0||d.sorties>0)){c.innerHTML=`<p class="chart-empty">Aucune donnée.</p>`;return;}
  const W=760,H=280,P={t:20,r:20,b:45,l:70};
  const iW=W-P.l-P.r,iH=H-P.t-P.b;
  const mx=Math.max(...data.flatMap(d=>[d.entrees,d.sorties]),1);
  const gW=iW/data.length,bW=gW*0.35;
  const sH=v=>(v/mx)*iH;
  const svg=svgEl("svg",{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:"xMidYMid meet"});
  for(let i=0;i<=4;i++){const y=P.t+(iH/4)*i;svg.appendChild(svgEl("line",{x1:P.l,y1:y,x2:W-P.r,y2:y,stroke:"currentColor","stroke-opacity":.1}));const v=mx-(mx/4)*i;svg.appendChild(svgEl("text",{x:P.l-8,y:y+4,"text-anchor":"end","font-size":10,fill:"currentColor","fill-opacity":.6},fmtMoneyShort(v)));}
  data.forEach((d,i)=>{const gx=P.l+gW*i+gW/2;const hi=sH(d.entrees);if(hi>0)svg.appendChild(svgEl("rect",{x:gx-bW-2,y:P.t+iH-hi,width:bW,height:hi,fill:"#10b981",rx:3}));const ho=sH(d.sorties);if(ho>0)svg.appendChild(svgEl("rect",{x:gx+2,y:P.t+iH-ho,width:bW,height:ho,fill:"#ef4444",rx:3}));const st=gran==="day"?5:1;if(i%st===0||i===data.length-1)svg.appendChild(svgEl("text",{x:gx,y:H-P.b+18,"text-anchor":"middle","font-size":10,fill:"currentColor","fill-opacity":.6},d.label));});
  c.appendChild(svg);c.appendChild(legend(["#10b981","#ef4444"],["Entrées","Sorties"]));
}
function drawMonthlyChart(c,months=12){
  c.innerHTML="";
  const keys=[];const now=new Date();
  for(let i=months-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);keys.push(toLocalISO(d).slice(0,7));}
  const by=new Map();
  transactions.forEach(t=>{const k=monthKey(t.date);if(!by.has(k))by.set(k,{entrees:0,sorties:0});const r=by.get(k);if(t.type==="vente")r.entrees+=Number(t.montant);else r.sorties+=Number(t.montant);});
  const data=keys.map(k=>({month:k,...(by.get(k)||{entrees:0,sorties:0})}));
  if(!data.some(d=>d.entrees>0||d.sorties>0)){c.innerHTML=`<p class="chart-empty">Aucune donnée.</p>`;return;}
  const W=720,H=260,P={t:20,r:20,b:40,l:60};
  const iW=W-P.l-P.r,iH=H-P.t-P.b;
  const mx=Math.max(...data.flatMap(d=>[d.entrees,d.sorties]),1);
  const gW=iW/data.length,bW=gW*0.35;
  const sH=v=>(v/mx)*iH;
  const svg=svgEl("svg",{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:"xMidYMid meet"});
  for(let i=0;i<=4;i++){const y=P.t+(iH/4)*i;svg.appendChild(svgEl("line",{x1:P.l,y1:y,x2:W-P.r,y2:y,stroke:"currentColor","stroke-opacity":.1}));const v=mx-(mx/4)*i;svg.appendChild(svgEl("text",{x:P.l-8,y:y+4,"text-anchor":"end","font-size":10,fill:"currentColor","fill-opacity":.6},fmtMoneyShort(v)));}
  const mf=["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];
  data.forEach((d,i)=>{const gx=P.l+gW*i+gW/2;const m=parseInt(d.month.slice(5),10)-1;const hi=sH(d.entrees);if(hi>0)svg.appendChild(svgEl("rect",{x:gx-bW-2,y:P.t+iH-hi,width:bW,height:hi,fill:"#10b981",rx:3}));const ho=sH(d.sorties);if(ho>0)svg.appendChild(svgEl("rect",{x:gx+2,y:P.t+iH-ho,width:bW,height:ho,fill:"#ef4444",rx:3}));svg.appendChild(svgEl("text",{x:gx,y:H-P.b+16,"text-anchor":"middle","font-size":10,fill:"currentColor","fill-opacity":.6},mf[m]));});
  c.appendChild(svg);c.appendChild(legend(["#10b981","#ef4444"],["Entrées","Sorties"]));
}
function drawDonutChart(c,rows){
  c.innerHTML="";
  if(!rows.length||rows.reduce((s,r)=>s+r.value,0)<=0){c.innerHTML=`<p class="chart-empty">Aucune donnée.</p>`;return;}
  const total=rows.reduce((s,r)=>s+r.value,0);
  const W=400,H=240,cx=120,cy=H/2,r=80,rIn=50;
  const pal=["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316","#14b8a6"];
  const svg=svgEl("svg",{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:"xMidYMid meet"});
  let acc=-Math.PI/2;
  rows.forEach((row,i)=>{const fr=row.value/total,a0=acc,a1=acc+fr*Math.PI*2;acc=a1;
    const x0=cx+Math.cos(a0)*r,y0=cy+Math.sin(a0)*r,x1=cx+Math.cos(a1)*r,y1=cy+Math.sin(a1)*r,x2=cx+Math.cos(a1)*rIn,y2=cy+Math.sin(a1)*rIn,x3=cx+Math.cos(a0)*rIn,y3=cy+Math.sin(a0)*rIn;
    const lg=(a1-a0)>Math.PI?1:0;
    svg.appendChild(svgEl("path",{d:`M${x0},${y0} A${r},${r} 0 ${lg} 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 ${lg} 0 ${x3},${y3} Z`,fill:pal[i%pal.length],stroke:"var(--surface)","stroke-width":2}));
  });
  svg.appendChild(svgEl("text",{x:cx,y:cy-2,"text-anchor":"middle","font-size":11,fill:"currentColor","fill-opacity":.6},"TOTAL"));
  svg.appendChild(svgEl("text",{x:cx,y:cy+16,"text-anchor":"middle","font-size":14,"font-weight":700,fill:"currentColor"},fmtMoneyShort(total)));
  let ly=30;
  rows.slice(0,8).forEach((row,i)=>{const pct=((row.value/total)*100).toFixed(1);svg.appendChild(svgEl("rect",{x:240,y:ly-10,width:12,height:12,rx:3,fill:pal[i%pal.length]}));const l=row.label.length>16?row.label.slice(0,15)+"…":row.label;svg.appendChild(svgEl("text",{x:258,y:ly,"font-size":11,fill:"currentColor"},l));svg.appendChild(svgEl("text",{x:390,y:ly,"text-anchor":"end","font-size":11,"font-weight":700,fill:"currentColor"},pct+" %"));ly+=22;});
  c.appendChild(svg);
}
function drawTendanceChart(c,gran){
  c.innerHTML="";
  const now=new Date();let keys=[],labels=[];const by=new Map();
  if(gran==="day"){for(let i=29;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);keys.push(toLocalISO(d));labels.push(`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`);}}
  else if(gran==="week"){for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i*7);const k=weekKey(toLocalISO(d));if(!keys.includes(k)){keys.push(k);labels.push("S"+(k.split("-S")[1]||k));}}}
  else{const mf=["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);keys.push(toLocalISO(d).slice(0,7));labels.push(mf[d.getMonth()]);}}
  transactions.filter(t=>t.type==="vente").forEach(t=>{const k=gran==="day"?t.date:gran==="week"?weekKey(t.date):monthKey(t.date);if(!keys.includes(k))return;by.set(k,(by.get(k)||0)+Number(t.montant));});
  const data=keys.map((k,i)=>({key:k,label:labels[i],ca:by.get(k)||0}));
  if(!data.some(d=>d.ca>0)){c.innerHTML=`<p class="chart-empty">Aucune vente.</p>`;return;}
  const W=760,H=280,P={t:20,r:20,b:45,l:70};
  const iW=W-P.l-P.r,iH=H-P.t-P.b;
  const mx=Math.max(...data.map(d=>d.ca),1);
  const gW=iW/data.length,bW=gW*0.6;
  const sH=v=>(v/mx)*iH;
  const svg=svgEl("svg",{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:"xMidYMid meet"});
  for(let i=0;i<=4;i++){const y=P.t+(iH/4)*i;svg.appendChild(svgEl("line",{x1:P.l,y1:y,x2:W-P.r,y2:y,stroke:"currentColor","stroke-opacity":.1}));const v=mx-(mx/4)*i;svg.appendChild(svgEl("text",{x:P.l-8,y:y+4,"text-anchor":"end","font-size":10,fill:"currentColor","fill-opacity":.6},fmtMoneyShort(v)));}
  data.forEach((d,i)=>{const gx=P.l+gW*i+gW/2;const h=sH(d.ca);if(h>0)svg.appendChild(svgEl("rect",{x:gx-bW/2,y:P.t+iH-h,width:bW,height:h,fill:"#3b82f6",rx:3}));const st=gran==="day"?5:1;if(i%st===0||i===data.length-1)svg.appendChild(svgEl("text",{x:gx,y:H-P.b+18,"text-anchor":"middle","font-size":10,fill:"currentColor","fill-opacity":.6},d.label));});
  c.appendChild(svg);
}

function renderSaleGrid(){
  const g=$("#saleGrid");if(!g)return;
  const em=$("#saleEmpty");
  const q=($("#saleSearch")?.value||"").toLowerCase();
  const l=products.filter(p=>p.nom.toLowerCase().includes(q));
  if(!l.length){g.innerHTML="";em.classList.remove("hidden");return;}
  em.classList.add("hidden");
  g.innerHTML=l.map(p=>{
    const st=Number(p.quantite)||0,out=st<=0,low=st<=Number(p.seuil);
    return `<article class="sale-card ${out?"out-of-stock":""}"><h3>${escapeHtml(p.nom)}</h3><div class="sale-price">${fmtMoney(p.prix_vente)}</div><div class="sale-stock ${low?"low":""}">${out?"<i data-lucide='x-circle' style='width:14px;height:14px;'></i> Rupture":`Stock : ${st}`}</div><button type="button" data-sell="${escapeHtml(p.id)}" ${out?"disabled":""}>${out?"Indisponible":"<i data-lucide='shopping-cart' style='width:16px;height:16px;margin-right:4px;'></i> Vendre"}</button></article>`;
  }).join("");
  lucide.createIcons();
}
function updateDepenseCategories(){const s=$("#depCategorie");if(!s)return;s.innerHTML=CATEGORIES.depense.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");}
function renderDepTable(){
  const today=todayISO();
  const l=transactions.filter(t=>t.type==="depense"&&t.date===today).sort((a,b)=>b.id.localeCompare(a.id));
  const tb=$("#depTable tbody");if(!tb)return;
  if(!l.length){tb.innerHTML=`<tr class="empty-row"><td colspan="5">Aucune dépense aujourd’hui.</td></tr>`;return;}
  tb.innerHTML=l.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${escapeHtml(t.categorie)}</td><td>${escapeHtml(t.description||"—")}</td><td class="num">− ${fmtMoney(t.montant)}</td><td><button class="row-btn danger" data-del="${t.id}"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td></tr>`).join("");
  lucide.createIcons();
}
function renderStock(){
  const low=lowStockProducts();
  $("#stockTotalProducts").textContent=products.length;
  $("#stockTotalCost").textContent=fmtMoney(productStockCost());
  $("#stockTotalSale").textContent=fmtMoney(productStockValue());
  $("#stockAlerts").textContent=low.length;
  const bx=$("#stockAlertBox");
  if(low.length){$("#stockAlertList").textContent=low.map(p=>`${p.nom} (${p.quantite})`).join(", ");bx.classList.remove("hidden");}else bx.classList.add("hidden");
  const q=($("#stockSearch")?.value||"").toLowerCase();
  let l=products.filter(p=>p.nom.toLowerCase().includes(q));
  const {key,dir}=prodSort,m=dir==="asc"?1:-1;
  l.sort((a,b)=>{
    let va=a[key],vb=b[key];
    if(key==="marge"){va=(a.prix_vente-a.prix_achat);vb=(b.prix_vente-b.prix_achat);}
    if(key==="estimation"){va=(a.prix_vente*a.quantite);vb=(b.prix_vente*b.quantite);}
    if(typeof va==="number"){va=Number(va);vb=Number(vb);}
    if(va<vb)return -1*m;if(va>vb)return 1*m;return 0;
  });
  const tb=$("#productTable tbody");
  if(!l.length){tb.innerHTML=`<tr class="empty-row"><td colspan="7">Aucun produit.</td></tr>`;}
  else{tb.innerHTML=l.map(p=>{
    const mg=(Number(p.prix_vente)||0)-(Number(p.prix_achat)||0);
    const isLow=Number(p.quantite)<=Number(p.seuil);
    const estim=(Number(p.prix_vente)||0)*(Number(p.quantite)||0);
    const tag=p.import_details?' <span title="Import" style="display:inline-flex;align-items:center;color:var(--blue);"><i data-lucide="plane" style="width:14px;height:14px;"></i></span>':'';
    const clsMarge = mg<0 ? "low-stock" : "stock-ok";
    return `<tr><td><strong>${escapeHtml(p.nom)}</strong>${tag}</td><td class="num">${fmtMoney(p.prix_achat)}</td><td class="num">${fmtMoney(p.prix_vente)}</td><td class="num ${clsMarge}">${fmtMoney(mg)}</td><td class="num ${isLow?"low-stock":"stock-ok"}">${p.quantite}</td><td class="num" style="color:var(--purple-dark);font-weight:700">${fmtMoney(estim)}</td><td><div class="row-actions"><button class="row-btn" data-edit-product="${p.id}"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button><button class="row-btn danger" data-del-product="${p.id}"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></div></td></tr>`;
  }).join("");}
  const mb=$("#movementTable tbody");
  const sorted=movements.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  if(!sorted.length){mb.innerHTML=`<tr class="empty-row"><td colspan="5">Aucun mouvement.</td></tr>`;}
  else{const types={entree:"Entrée",sortie:"Sortie",vente:"Vente",correction:"Correction"};mb.innerHTML=sorted.map(m=>{const p=getProduct(m.produit_id);const cls=m.type==="entree"||m.type==="correction"?"type-vente":"type-depense";return `<tr><td>${fmtDate(m.date)}</td><td>${escapeHtml(p?p.nom:"—")}</td><td class="${cls}">${types[m.type]||m.type}</td><td class="num">${m.quantite>0?"+":""}${m.quantite}</td><td>${escapeHtml(m.note||"—")}</td></tr>`;}).join("");}
  lucide.createIcons();
}
function renderRentabilite(){
  const {from,to}=getPeriodRange(rentPeriod);
  const r=computeRentability(from,to);
  $("#rentCATotal").textContent=fmtMoney(r.totalCA);
  $("#rentCATotalSub").textContent=`${r.rows.reduce((s,x)=>s+x.qteVendue,0)} unité(s) vendue(s)`;
  $("#rentCoutTotal").textContent=fmtMoney(r.totalCout);
  $("#rentBeneficeTotal").textContent=fmtMoney(r.totalBenefice);
  $("#rentBeneficeTotal").className="kpi-value "+(r.totalBenefice<0?"trend-down":"trend-up");
  $("#rentMargeMoyenne").textContent=`Marge moyenne : ${r.totalMarge.toFixed(1)} %`;
  const top=r.best;
  $("#rentTopProduct").textContent=top?top.nom:"—";
  $("#rentTopProductSub").textContent=top?`${fmtMoney(top.benefice)} de bénéfice`:"Aucune vente";
  const a=$("#alertProduitsPerte");
  if(r.enPerte.length){$("#alertProduitsPerteCount").textContent=r.enPerte.length;a.classList.remove("hidden");}else a.classList.add("hidden");
  const q=($("#rentSearch")?.value||"").toLowerCase();
  let rows=r.rows.filter(x=>x.nom.toLowerCase().includes(q));
  const {key,dir}=rentSort,m=dir==="asc"?1:-1;
  rows.sort((a,b)=>{let va=a[key],vb=b[key];if(typeof va==="string")return va.localeCompare(vb)*m;if(va<vb)return -1*m;if(va>vb)return 1*m;return 0;});
  const tb=$("#rentTable tbody");
  if(!rows.length){tb.innerHTML=`<tr class="empty-row"><td colspan="7">Aucune vente.</td></tr>`;}
  else{tb.innerHTML=rows.map(row=>{
    const lo=row.benefice<0;
    const bd=lo?`<span class="status-badge loss"><i data-lucide="trending-down" style="width:12px;height:12px;"></i> Perte</span>`:`<span class="status-badge profit"><i data-lucide="trending-up" style="width:12px;height:12px;"></i> Bénéfice</span>`;
    return `<tr><td><strong>${escapeHtml(row.nom)}</strong>${row.produit_id?"":' <small style="color:var(--muted)">(libre)</small>'}</td><td class="num">${row.qteVendue}</td><td class="num">${fmtMoney(row.ca)}</td><td class="num">${fmtMoney(row.cout)}</td><td class="num ${lo?'loss-cell':'profit-cell'}">${fmtMoney(row.benefice)}</td><td class="num ${lo?'loss-cell':'profit-cell'}">${row.marge.toFixed(1)} %</td><td class="status-cell">${bd}</td></tr>`;
  }).join("");}
  const ft=$("#rentFoot");
  if(ft)ft.innerHTML=`<tr><td>Total général</td><td class="num">${r.rows.reduce((s,x)=>s+x.qteVendue,0)}</td><td class="num">${fmtMoney(r.totalCA)}</td><td class="num">${fmtMoney(r.totalCout)}</td><td class="num ${r.totalBenefice<0?'loss-cell':'profit-cell'}">${fmtMoney(r.totalBenefice)}</td><td class="num ${r.totalBenefice<0?'loss-cell':'profit-cell'}">${r.totalMarge.toFixed(1)} %</td><td></td></tr>`;
  lucide.createIcons();
}
function renderTendances(){
  const now=new Date();
  const tm=toLocalISO(new Date(now.getFullYear(),now.getMonth(),1));
  const lm=toLocalISO(new Date(now.getFullYear(),now.getMonth()-1,1));
  const le=toLocalISO(new Date(now.getFullYear(),now.getMonth(),0,23,59,59));
  const tTx=transactions.filter(t=>t.type==="vente"&&t.date>=tm);
  const lTx=transactions.filter(t=>t.type==="vente"&&t.date>=lm&&t.date<=le);
  const caT=sum(tTx),caL=sum(lTx),cT=tTx.length,cL=lTx.length;
  const ticket=cT>0?caT/cT:0;
  $("#tendCA").textContent=fmtMoney(caT);
  const d=caL>0?((caT-caL)/caL)*100:null;
  const cc=$("#tendCACompare");
  if(d===null){cc.textContent=caL===0?"Pas de données le mois dernier":"—";cc.className="kpi-sub";}
  else{const s=d>=0?"+":"";cc.textContent=`${s}${d.toFixed(1)} % vs mois dernier`;cc.className="kpi-sub "+(d>3?"trend-up":d<-3?"trend-down":"trend-flat");}
  const bd=$("#tendBadge"),de=$("#tendDesc");let tr,lb,dc;
  if(cT===0&&cL===0){lb="—";dc="Pas encore de ventes";tr="flat";}
  else if(d===null||Math.abs(d)<5){lb="Stable";dc="Activité régulière";tr="flat";}
  else if(d>=5){lb="En hausse";dc="Ça monte !";tr="up";}
  else{lb="En baisse";dc="Il faut relancer les ventes";tr="down";}
  bd.innerHTML = (tr==='up'?'<i data-lucide="trending-up" style="width:20px;height:20px;"></i> ':(tr==='down'?'<i data-lucide="trending-down" style="width:20px;height:20px;"></i> ':'<i data-lucide="minus" style="width:20px;height:20px;"></i> ')) + lb;
  bd.className="kpi-value trend-"+tr;de.textContent=dc;
  $("#tendCount").textContent=cT;
  const dc2=cL>0?((cT-cL)/cL)*100:null;
  const cc2=$("#tendCountCompare");
  if(dc2===null)cc2.textContent="—";
  else{const s=dc2>=0?"+":"";cc2.textContent=`${s}${dc2.toFixed(1)} % vs mois dernier`;}
  $("#tendTicket").textContent=fmtMoney(ticket);
  drawTendanceChart($("#chartTendance"),tendanceGran);
  drawMonthlyChart($("#chartTendanceMois"),6);
  const tm2=new Map();
  tTx.forEach(t=>{if(t.produit_id){const p=getProduct(t.produit_id);const n=p?p.nom:(t.description||"Produit inconnu");tm2.set(n,(tm2.get(n)||0)+Number(t.quantite||1));}else{const n=t.description||t.categorie||"Autre";tm2.set(n,(tm2.get(n)||0)+1);}});
  const top=Array.from(tm2.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const c=$("#topProducts");
  if(!top.length){c.innerHTML=`<p class="top-empty">Aucune vente ce mois.</p>`;}
  else{const md=["1","2","3","4","5"];c.innerHTML=`<div class="top-list">`+top.map(([n,q],i)=>`<div class="top-item"><span class="top-rank">${md[i]}</span><span class="top-name">${escapeHtml(n)}</span><span class="top-qty">${q} vente(s)</span></div>`).join("")+`</div>`;}
  lucide.createIcons();
}
function renderHistCategorieOptions(){const s=$("#histCat");if(!s)return;const a=new Set();transactions.forEach(t=>a.add(t.categorie));const c=s.value;s.innerHTML=`<option value="all">Toutes</option>`+Array.from(a).sort().map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");if([...s.options].some(o=>o.value===c))s.value=c;}
function renderHistorique(){
  const from=$("#histFrom").value||"0000-01-01",to=$("#histTo").value||"9999-12-31";
  const type=$("#histType").value,cat=$("#histCat").value,q=$("#histSearch").value;
  let l=filterTx(transactions,{from,to,type,categorie:cat,query:q});
  const {key,dir}=histSort,m=dir==="asc"?1:-1;
  l.sort((a,b)=>{let va=a[key],vb=b[key];if(key==="montant"){va=Number(va);vb=Number(vb);}if(va<vb)return -1*m;if(va>vb)return 1*m;return 0;});
  $("#histCount").textContent=l.length;
  const tb=$("#histTable tbody");
  if(!l.length){tb.innerHTML=`<tr class="empty-row"><td colspan="6">Aucune opération.</td></tr>`;return;}
  tb.innerHTML=l.map(t=>`<tr><td>${fmtDate(t.date)}</td><td class="type-${t.type}">${t.type==="vente"?"Entrée":"Sortie"}</td><td>${escapeHtml(t.categorie)}</td><td>${escapeHtml(t.description||"—")}</td><td class="num">${t.type==="vente"?"+":"−"} ${fmtMoney(t.montant)}</td><td><div class="row-actions"><button class="row-btn danger" data-del="${t.id}"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></div></td></tr>`).join("");
  lucide.createIcons();
}
function renderRapports(){
  const period=$("#reportPeriod")?.value||"month",gran=$("#reportGran")?.value||"week";
  const {from,to}=getPeriodRange(period);
  const l=filterTx(transactions,{from,to});
  drawDonutChart($("#chartCatIn"),groupByCategory(l,"vente"));
  drawDonutChart($("#chartCatOut"),groupByCategory(l,"depense"));
  const c=$("#chartReport");
  if(c){
    c.innerHTML="";
    const li=transactions.filter(t=>t.date>=from&&t.date<=to);
    let keys=[],labels=[];const by=new Map();
    if(gran==="day"){const s=new Date(from),e=new Date(to),cur=new Date(s);while(cur<=e){const k=toLocalISO(cur);keys.push(k);labels.push(`${String(cur.getDate()).padStart(2,"0")}/${String(cur.getMonth()+1).padStart(2,"0")}`);cur.setDate(cur.getDate()+1);if(keys.length>90)break;}}
    else if(gran==="week"){const m=new Map();li.forEach(t=>{const k=weekKey(t.date);if(!m.has(k))m.set(k,0);});Array.from(m.keys()).sort().forEach(k=>{keys.push(k);labels.push("S"+(k.split("-S")[1]||k));});}
    else{const m=new Map();li.forEach(t=>{const k=monthKey(t.date);if(!m.has(k))m.set(k,0);});const mf=["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];Array.from(m.keys()).sort().forEach(k=>{keys.push(k);labels.push(mf[parseInt(k.slice(5),10)-1]);});}
    li.forEach(t=>{const k=gran==="day"?t.date:gran==="week"?weekKey(t.date):monthKey(t.date);if(!by.has(k))by.set(k,{entrees:0,sorties:0});const r=by.get(k);if(t.type==="vente")r.entrees+=Number(t.montant);else r.sorties+=Number(t.montant);});
    const data=keys.map((k,i)=>({key:k,label:labels[i],...(by.get(k)||{entrees:0,sorties:0})}));
    if(!data.some(d=>d.entrees>0||d.sorties>0)){c.innerHTML=`<p class="chart-empty">Aucune donnée.</p>`;}
    else{const W=760,H=280,P={t:20,r:20,b:45,l:70};const iW=W-P.l-P.r,iH=H-P.t-P.b;const mx=Math.max(...data.flatMap(d=>[d.entrees,d.sorties]),1);const gW=iW/data.length,bW=gW*0.35;const sH=v=>(v/mx)*iH;const svg=svgEl("svg",{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:"xMidYMid meet"});for(let i=0;i<=4;i++){const y=P.t+(iH/4)*i;svg.appendChild(svgEl("line",{x1:P.l,y1:y,x2:W-P.r,y2:y,stroke:"currentColor","stroke-opacity":.1}));const v=mx-(mx/4)*i;svg.appendChild(svgEl("text",{x:P.l-8,y:y+4,"text-anchor":"end","font-size":10,fill:"currentColor","fill-opacity":.6},fmtMoneyShort(v)));}data.forEach((d,i)=>{const gx=P.l+gW*i+gW/2;const hi=sH(d.entrees);if(hi>0)svg.appendChild(svgEl("rect",{x:gx-bW-2,y:P.t+iH-hi,width:bW,height:hi,fill:"#10b981",rx:3}));const ho=sH(d.sorties);if(ho>0)svg.appendChild(svgEl("rect",{x:gx+2,y:P.t+iH-ho,width:bW,height:ho,fill:"#ef4444",rx:3}));const st=gran==="day"&&data.length>20?5:1;if(i%st===0||i===data.length-1)svg.appendChild(svgEl("text",{x:gx,y:H-P.b+18,"text-anchor":"middle","font-size":10,fill:"currentColor","fill-opacity":.6},d.label));});c.appendChild(svg);c.appendChild(legend(["#10b981","#ef4444"],["Entrées","Sorties"]));}
  }
  const months=groupByMonth(transactions).slice(-12).reverse();
  const tb=$("#summaryTable tbody");
  if(!months.length){tb.innerHTML=`<tr class="empty-row"><td colspan="5">Aucune donnée.</td></tr>`;}
  else{const mf=["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];tb.innerHTML=months.map(m=>{const b=m.entrees-m.sorties,mg=m.entrees>0?(b/m.entrees)*100:0;const [y,mm]=m.month.split("-");const lbl=`${mf[parseInt(mm,10)-1]} ${y}`;const cls=b<0?"type-depense":"type-vente";return `<tr><td>${lbl}</td><td class="num">${fmtMoney(m.entrees)}</td><td class="num">${fmtMoney(m.sorties)}</td><td class="num ${cls}">${fmtMoney(b)}</td><td class="num">${mg.toFixed(1)} %</td></tr>`;}).join("");}
}
function renderAll(){
  renderCompanyName();
  renderKPI();renderRecentTable();
  drawPeriodChart($("#chartDaily"),dailyGran);
  drawMonthlyChart($("#chartMonthly"),12);
  renderSaleGrid();updateDepenseCategories();renderDepTable();
  renderStock();renderRentabilite();renderHistorique();renderRapports();
  renderTendances();renderHistCategorieOptions();
  lucide.createIcons();
}

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
async function handleDepenseSubmit(e){
  e.preventDefault();
  const date=$("#depDate").value,montant=parseFloat($("#depMontant").value),cat=$("#depCategorie").value,desc=$("#depDescription").value.trim(),st=$("#depStatus");
  st.classList.remove("error");
  if(!date){st.textContent="Date obligatoire.";st.classList.add("error");return;}
  if(!Number.isFinite(montant)||montant<=0){st.textContent="Montant invalide.";st.classList.add("error");return;}
  const btn=e.target.querySelector("button[type=submit]");
  if(btn){btn.disabled=true;btn.innerHTML="Enregistrement…";}
  const {data,error}=await sb.rpc("enregistrer_depense",{p_date:date,p_montant:Math.round(montant*100)/100,p_categorie:cat,p_description:desc});
  if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="save" style="width:18px;height:18px;"></i> Enregistrer la dépense';}
  if(error){st.textContent="Erreur : "+error.message;st.classList.add("error");return;}
  st.innerHTML=`<i data-lucide="check" style="width:14px;height:14px;"></i> Dépense enregistrée : ${fmtMoney(montant)}.`;
  e.target.reset();$("#depDate").value=todayISO();updateDepenseCategories();
  await chargerOperations();toast("Dépense enregistrée ✅","success");renderAll();
}
async function handleDeleteOperation(id){
  const tx=transactions.find(t=>t.id===id);if(!tx)return;
  const ok=await showConfirm({title:"Supprimer l'opération ?",message:`<strong>${fmtDate(tx.date)}</strong><br>${escapeHtml(tx.categorie)} — <strong>${fmtMoney(tx.montant)}</strong><br><br>Cette action est irréversible.`,icon:"trash-2",kind:"danger",okText:"Supprimer",cancelText:"Annuler"});
  if(!ok)return;
  const {error}=await sb.rpc("supprimer_operation",{p_operation_id:id});
  if(error){toast("Erreur : "+error.message,"error");return;}
  await Promise.all([chargerProduits(),chargerOperations(),chargerMouvements()]);
  toast("Opération supprimée","success");renderAll();
}

/* ===== PRODUIT ===== */
let editingProductId=null,prodImportMode=false;

function setProdMode(mode){
  prodImportMode=(mode==="import");
  $("#prodModeLocal").classList.toggle("active",!prodImportMode);
  $("#prodModeImport").classList.toggle("active",prodImportMode);
  $("#prodLocalBlock").classList.toggle("hidden",prodImportMode);
  $("#prodImportBlock").classList.toggle("hidden",!prodImportMode);
  
  $("#prodAchatTotal").required = !prodImportMode;
  $("#prodAchatQte").required = !prodImportMode;

  if(prodImportMode)updateImportCalc();
  else updateLocalCalc();
  updateLiveMargin();
}
function updateLocalCalc(){
  const total=parseFloat($("#prodAchatTotal").value)||0;
  const qte=parseInt($("#prodAchatQte").value,10)||1;
  const unit = qte>0 ? total/qte : total;
  currentUnitCost = Math.round(unit*100)/100;
  $("#prodPrixAchatCalc").textContent=fmtMoney(currentUnitCost);
  updateLiveMargin();
  return currentUnitCost;
}
function updateImportCalc(){
  const prixUnit=parseFloat($("#prodUsdPrix").value)||0;
  const livraison=parseFloat($("#prodUsdLivraison").value)||0;
  const transport=parseFloat($("#prodUsdTransport").value)||0;
  const autres=parseFloat($("#prodUsdAutres").value)||0;
  const tx=parseFloat($("#prodTaux").value)||144;
  const qte=parseInt($("#prodUsdQte").value,10)||1;

  const produitsUsd = prixUnit * qte;
  const fraisFixesUsd = livraison + transport + autres;
  const totalUsd = produitsUsd + fraisFixesUsd;
  const totalHtg = totalUsd * tx;
  const unitHtg = qte > 0 ? totalHtg / qte : totalHtg;

  currentUnitCost = Math.round(unitHtg*100)/100;
  $("#prodPrixAchatCalcImport").textContent=fmtMoney(currentUnitCost);
  const hint=$("#prodTauxHint");
  if(hint) hint.textContent = `(${prixUnit} × ${qte}) + ${fraisFixesUsd.toFixed(2)} frais = ${totalUsd.toFixed(2)} USD × ${tx} = ${fmtMoney(totalHtg)} ÷ ${qte} = ${fmtMoney(currentUnitCost)}/unité`;
  updateLiveMargin();
  return currentUnitCost;
}
function getCurrentUnitCost(){ return currentUnitCost; }

function updateLiveMargin(){
  const box=$("#liveMarginBox");
  const txt=$("#liveMarginText");
  if(!box||!txt) return;
  const cost = getCurrentUnitCost();
  const vente = parseFloat($("#prodPrixVente").value)||0;
  if(cost===0){
    box.className="live-margin";
    txt.textContent="Renseigne le prix d'achat pour voir le bénéfice";
    return;
  }
  const diff = vente - cost;
  if(diff < 0){
    box.className="live-margin loss";
    txt.innerHTML=`<i data-lucide="trending-down" style="width:18px;height:18px;"></i> <strong>Perte de ${fmtMoney(Math.abs(diff))}</strong> par unité (coût : ${fmtMoney(cost)})`;
  } else if(diff > 0){
    box.className="live-margin profit";
    txt.innerHTML=`<i data-lucide="trending-up" style="width:18px;height:18px;"></i> <strong>Bénéfice de ${fmtMoney(diff)}</strong> par unité (coût : ${fmtMoney(cost)})`;
  } else {
    box.className="live-margin";
    txt.textContent=`Aucun bénéfice — prix = coût (${fmtMoney(cost)})`;
  }
  lucide.createIcons();
}

function openProductModal(id=null){
  editingProductId=id;const p=id?getProduct(id):null;
  currentUnitCost = 0;
  $("#productTitle").textContent=p?"Modifier le produit":"Nouveau produit";
  $("#prodNom").value=p?p.nom:"";
  $("#prodPrixVente").value=p?p.prix_vente:"";
  $("#prodQuantite").value=p?p.quantite:0;
  $("#prodSeuil").value=p?p.seuil:5;
  const tx=Number(settings.taux_change)||144;$("#prodTaux").value=tx;

  const isImp=p&&p.import_details&&Object.keys(p.import_details).length;
  setProdMode(isImp?"import":"local");

  if(p){
    if(isImp){
      $("#prodUsdPrix").value=p.import_details.prixUnitaireUsd||p.import_details.prix||"";
      $("#prodUsdLivraison").value=p.import_details.livraisonTotale||p.import_details.livraison||"";
      $("#prodUsdTransport").value=p.import_details.transportTotal||p.import_details.transport||"";
      $("#prodUsdAutres").value=p.import_details.autresTotaux||p.import_details.autres||"";
      $("#prodTaux").value=p.import_details.taux||tx;
      $("#prodUsdQte").value=p.import_details.qte||1;
      updateImportCalc();
    }else{
      const qte=p.quantite||1;
      $("#prodAchatTotal").value=(Number(p.prix_achat)*qte).toFixed(2);
      $("#prodAchatQte").value=qte;
      updateLocalCalc();
    }
  }else{
    $("#prodAchatTotal").value="";
    $("#prodAchatQte").value=1;
    $("#prodUsdPrix").value="";$("#prodUsdLivraison").value="";$("#prodUsdTransport").value="";$("#prodUsdAutres").value="";$("#prodUsdQte").value=1;
    $("#prodPrixAchatCalc").textContent="—";$("#prodPrixAchatCalcImport").textContent="—";
  }
  updateLiveMargin();
  $("#productModal").classList.add("open");$("#productModal").setAttribute("aria-hidden","false");
  lucide.createIcons();
}
function closeProductModal(){$("#productModal").classList.remove("open");$("#productModal").setAttribute("aria-hidden","true");editingProductId=null;}

async function handleProductSubmit(e){
  e.preventDefault();
  const nom=$("#prodNom").value.trim();
  const pv=parseFloat($("#prodPrixVente").value);
  const q=parseInt($("#prodQuantite").value,10);
  const s=parseInt($("#prodSeuil").value,10);
  let pa=0,imp=null;

  if(prodImportMode){
    pa=updateImportCalc();
    if(pa<=0){toast("Renseigne au moins un montant","error");return;}
    const _p=parseFloat($("#prodUsdPrix").value)||0;
    const _l=parseFloat($("#prodUsdLivraison").value)||0;
    const _t=parseFloat($("#prodUsdTransport").value)||0;
    const _a=parseFloat($("#prodUsdAutres").value)||0;
    const _q=parseInt($("#prodUsdQte").value,10)||1;
    const _tx=parseFloat($("#prodTaux").value)||144;
    const _totalUsd = (_p*_q) + _l + _t + _a;
    const _totalHtg = _totalUsd * _tx;
    imp={
      prixUnitaireUsd: _p,
      livraisonTotale: _l,
      transportTotal: _t,
      autresTotaux: _a,
      taux: _tx,
      qte: _q,
      coutTotalLot: Math.round(_totalHtg*100)/100,
      coutUnitaireHtg: pa
    };
  } else {
    pa=updateLocalCalc();
    if(pa<=0){toast("Renseigne le prix d'achat","error");return;}
    const totalLot=parseFloat($("#prodAchatTotal").value)||0;
    const qteLot=parseInt($("#prodAchatQte").value,10)||1;
    if(qteLot>1){
      imp={ totalLot, qteLot, mode:"local_total" };
    }
  }

  if(!nom){toast("Nom obligatoire","error");return;}
  if(!Number.isFinite(pa)||pa<0){toast("Prix d'achat invalide","error");return;}
  if(!Number.isFinite(pv)||pv<0){toast("Prix de vente invalide","error");return;}
  if(!Number.isFinite(q)||q<0){toast("Quantité invalide","error");return;}
  if(!Number.isFinite(s)||s<0){toast("Seuil invalide","error");return;}

  if(editingProductId){
    const {error}=await sb.from("produits").update({nom,prix_achat:pa,prix_vente:pv,quantite:q,seuil:s,import_details:imp}).eq("id",editingProductId);
    if(error){toast("Erreur : "+error.message,"error");return;}
    toast("Produit modifié ✅","success");
  } else {
    const {data,error}=await sb.from("produits").insert({entreprise_id:entrepriseId,nom,prix_achat:pa,prix_vente:pv,quantite:q,seuil:s,import_details:imp}).select().single();
    if(error){toast("Erreur : "+error.message,"error");return;}
    if(q>0&&data){
      await sb.from("mouvements").insert({entreprise_id:entrepriseId,date:todayISO(),produit_id:data.id,type:"entree",quantite:q,note:"Stock initial"});
    }
    toast("Produit ajouté ✅","success");
  }
  await Promise.all([chargerProduits(),chargerMouvements()]);
  closeProductModal();renderAll();
}
async function handleDeleteProduct(id){
  const p=getProduct(id);if(!p)return;
  const ok=await showConfirm({title:"Supprimer le produit ?",message:`<strong>${escapeHtml(p.nom)}</strong>`,icon:"trash-2",kind:"danger",okText:"Supprimer"});
  if(!ok)return;
  const {error}=await sb.from("produits").delete().eq("id",id);
  if(error){toast("Erreur : "+error.message,"error");return;}
  await Promise.all([chargerProduits(),chargerMouvements()]);
  toast("Produit supprimé","success");renderAll();
}

let movType="entree";
function openMovementModal(){
  const sel=$("#movProduit");
  sel.innerHTML=products.length?products.map(p=>`<option value="${p.id}">${escapeHtml(p.nom)} (${p.quantite})</option>`).join(""):`<option value="">— Aucun —</option>`;
  $("#movDate").value=todayISO();$("#movQuantite").value=1;$("#movNote").value="";
  movType="entree";
  $$(".type-btn[data-mov-type]").forEach(b=>b.classList.toggle("active",b.dataset.movType==="entree"));
  $("#movHint").textContent="Entrée : ajoute au stock.";
  $("#movementModal").classList.add("open");$("#movementModal").setAttribute("aria-hidden","false");
  lucide.createIcons();
}
function closeMovementModal(){$("#movementModal").classList.remove("open");$("#movementModal").setAttribute("aria-hidden","true");}
async function handleMovementSubmit(e){
  e.preventDefault();
  const pid=$("#movProduit").value,date=$("#movDate").value,q=parseInt($("#movQuantite").value,10),note=$("#movNote").value.trim();
  if(!pid){toast("Sélectionne un produit","error");return;}
  if(!date){toast("Date obligatoire","error");return;}
  if(!Number.isFinite(q)||q<0){toast("Quantité invalide","error");return;}
  const btn=e.target.querySelector("button[type=submit]");
  if(btn){btn.disabled=true;btn.innerHTML="Enregistrement…";}
  const {data,error}=await sb.rpc("ajuster_stock",{p_produit_id:pid,p_type:movType,p_quantite:q,p_note:note||"",p_date:date});
  if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="save" style="width:18px;height:18px;"></i> Enregistrer';}
  if(error){toast("Erreur : "+error.message,"error");return;}
  await Promise.all([chargerProduits(),chargerMouvements()]);
  toast(`Nouveau stock : ${data?.nouvelle_quantite ?? "?"}`,"success");
  closeMovementModal();renderAll();
}
async function handleSettingsSubmit(e){
  e.preventDefault();
  const nom=$("#setCompany").value.trim()||"Mon Entreprise";
  const devise=$("#setCurrency").value;
  const taux_charges=Math.max(0,Math.min(100,parseFloat($("#setCharges").value)||0));
  const taux_change=Math.max(0,parseFloat($("#setTauxChange").value)||144);
  const {error}=await sb.from("entreprises").update({nom,devise,taux_charges,taux_change}).eq("id",entrepriseId);
  if(error){$("#setStatus").textContent="Erreur : "+error.message;$("#setStatus").classList.add("error");return;}
  settings={nom,devise,taux_change,taux_charges};
  $("#setStatus").innerHTML='<i data-lucide="check" style="width:14px;height:14px;"></i> Enregistré ✅';
  renderAll();toast("Paramètres ✅","success");
  lucide.createIcons();
}
function exportBackup(){
  const d={exportedAt:new Date().toISOString(),settings,transactions,products,movements};
  const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json;charset=utf-8"});
  const u=URL.createObjectURL(b);const a=document.createElement("a");
  a.href=u;a.download=`gestionpro_backup_${todayISO()}.json`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);
  toast("Sauvegarde créée","success");
}

function bindNav(){
  $$(".tab").forEach(tab=>tab.addEventListener("click",()=>{
    $$(".tab").forEach(t=>t.classList.toggle("active",t===tab));
    const v=tab.dataset.view;
    $$(".view").forEach(view=>view.classList.toggle("active",view.id==="view-"+v));
    if(v==="dashboard"){renderKPI();renderRecentTable();drawPeriodChart($("#chartDaily"),dailyGran);drawMonthlyChart($("#chartMonthly"),12);}
    if(v==="vente")renderSaleGrid();
    if(v==="depense"){updateDepenseCategories();renderDepTable();}
    if(v==="stock")renderStock();
    if(v==="rentabilite")renderRentabilite();
    if(v==="tendances")renderTendances();
    if(v==="historique"){renderHistCategorieOptions();renderHistorique();}
    if(v==="rapports")renderRapports();
    lucide.createIcons();
  }));
  document.addEventListener("click",e=>{const t=e.target.closest("[data-goto]");if(!t)return;const tab=$$(".tab").find(x=>x.dataset.view===t.dataset.goto);if(tab)tab.click();});
  $$(".period-btn").forEach(b=>b.addEventListener("click",()=>{$$(".period-btn").forEach(x=>x.classList.toggle("active",x===b));currentPeriod=b.dataset.period;renderKPI();renderRecentTable();}));
  $$("[data-rent-period]").forEach(b=>b.addEventListener("click",()=>{$$("[data-rent-period]").forEach(x=>x.classList.toggle("active",x===b));rentPeriod=b.dataset.rentPeriod;renderRentabilite();}));
  $$(".gran-btn").forEach(btn=>btn.addEventListener("click",()=>{
    const parent=btn.closest(".chart-controls");if(!parent)return;
    parent.querySelectorAll(".gran-btn").forEach(b=>b.classList.remove("active"));btn.classList.add("active");
    const gran=btn.dataset.gran;const card=btn.closest(".card");if(!card)return;
    const cid=card.querySelector(".chart-wrap")?.id;
    if(cid==="chartDaily"){dailyGran=gran;drawPeriodChart($("#chartDaily"),gran);}
    else if(cid==="chartTendance"){tendanceGran=gran;drawTendanceChart($("#chartTendance"),gran);}
  }));
  $$("#histTable th[data-sort]").forEach(th=>th.addEventListener("click",()=>{const k=th.dataset.sort;if(histSort.key===k)histSort.dir=histSort.dir==="asc"?"desc":"asc";else{histSort.key=k;histSort.dir="asc";}renderHistorique();}));
  $$("#productTable th[data-sort]").forEach(th=>th.addEventListener("click",()=>{const k=th.dataset.sort;if(prodSort.key===k)prodSort.dir=prodSort.dir==="asc"?"desc":"asc";else{prodSort.key=k;prodSort.dir="asc";}renderStock();}));
  $$("#rentTable th[data-sort]").forEach(th=>th.addEventListener("click",()=>{const k=th.dataset.sort;if(rentSort.key===k)rentSort.dir=rentSort.dir==="asc"?"desc":"asc";else{rentSort.key=k;rentSort.dir="desc";}renderRentabilite();}));
  ["histFrom","histTo","histType","histCat","histSearch"].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener("input",renderHistorique);});
  $("#histReset")?.addEventListener("click",()=>{$("#histFrom").value="";$("#histTo").value="";$("#histType").value="all";$("#histCat").value="all";$("#histSearch").value="";renderHistorique();});
  $("#stockSearch")?.addEventListener("input",renderStock);
  $("#saleSearch")?.addEventListener("input",renderSaleGrid);
  $("#rentSearch")?.addEventListener("input",renderRentabilite);
  $("#reportPeriod")?.addEventListener("change",renderRapports);
  $("#reportGran")?.addEventListener("change",renderRapports);
}
function bindDelegation(){
  document.addEventListener("click",async e=>{
    const delId=e.target.closest("[data-del]")?.dataset.del;
    if(delId){await handleDeleteOperation(delId);return;}
    const sellId=e.target.closest("[data-sell]")?.dataset.sell;if(sellId){openSaleModal(sellId);return;}
    const editP=e.target.closest("[data-edit-product]")?.dataset.editProduct;if(editP){openProductModal(editP);return;}
    const delP=e.target.closest("[data-del-product]")?.dataset.delProduct;if(delP){await handleDeleteProduct(delP);return;}
  });
}
function bindUI(){
  $("#authForm")?.addEventListener("submit",handleAuthSubmit);
  $("#authTabLogin")?.addEventListener("click",()=>setAuthMode("login"));
  $("#authTabSignup")?.addEventListener("click",()=>setAuthMode("signup"));
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
}
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

/* ===== GESTION DU BANDEAU D'INSTALLATION ===== */
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
    }, 1000);
  }

  closeBtn.addEventListener("click", () => {
    banner.classList.remove("show");
    setTimeout(() => banner.classList.add("hidden"), 300);
  });
}

async function start(){
  bindUI();
  bindNav();
  bindDelegation();
  setAuthMode("login");
  await initAuth();
  const n=new Date();const f=new Date(n.getFullYear(),n.getMonth(),1);
  $("#histFrom") && ($("#histFrom").value=toLocalISO(f));
  $("#histTo") && ($("#histTo").value=todayISO());
  $("#depDate") && ($("#depDate").value=todayISO());
  updateDepenseCategories();
  lucide.createIcons();
  
  initInstallBanner();
}
window.addEventListener("supabase:ready",start);
if(window.sb) start();
