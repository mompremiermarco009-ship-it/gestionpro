const $ = (s, r = document) => r.querySelector(s);
let authMode = "login";

// Détecter si on vient du bouton "Créer un compte"
if (new URLSearchParams(window.location.search).get("mode") === "signup") {
  authMode = "signup";
}

function setAuthMode(mode) {
  authMode = mode; const isLogin = mode === "login";
  $("#authTabLogin").classList.toggle("active", isLogin);
  $("#authTabSignup").classList.toggle("active", !isLogin);
  $("#authConfirmWrap").classList.toggle("hidden", isLogin);
  $("#authSubmit").textContent = isLogin ? "Se connecter" : "Créer mon compte";
  $("#authSubtitle").textContent = isLogin ? "Connecte-toi pour gérer ton entreprise" : "Crée ton compte pour commencer";
}

$("#authTabLogin")?.addEventListener("click", () => setAuthMode("login"));
$("#authTabSignup")?.addEventListener("click", () => setAuthMode("signup"));

$("#authForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#authEmail").value.trim();
  const pass = $("#authPassword").value;
  const status = $("#authStatus");
  const btn = $("#authSubmit");
  
  status.textContent = ""; btn.disabled = true; btn.textContent = "Chargement...";

  if (authMode === "login") {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { status.textContent = "Email ou mot de passe incorrect."; status.classList.add("error"); }
    else { window.location.href = "dashboard.html"; }
  } else {
    const confirm = $("#authPasswordConfirm").value;
    if (pass !== confirm) { status.textContent = "Les mots de passe ne correspondent pas."; status.classList.add("error"); btn.disabled = false; btn.textContent = "Créer mon compte"; return; }
    
    const { error } = await sb.auth.signUp({ email, password: pass });
    if (error) { status.textContent = error.message; status.classList.add("error"); }
    else { 
      // OUVRIR LA MODALE DE CONFIRMATION
      $("#emailModal").classList.add("open"); 
    }
  }
  btn.disabled = false; btn.textContent = authMode === "login" ? "Se connecter" : "Créer mon compte";
});

$("#closeEmailModal")?.addEventListener("click", () => $("#emailModal").classList.remove("open"));
$("#btnOkEmail")?.addEventListener("click", () => { $("#emailModal").classList.remove("open"); setAuthMode("login"); });

// Vérifier si déjà connecté
window.addEventListener("supabase:ready", async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) window.location.href = "dashboard.html";
  setAuthMode(authMode);
});
