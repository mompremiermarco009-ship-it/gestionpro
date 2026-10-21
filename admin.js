const $ = (s, r = document) => r.querySelector(s);

// ⚠️ VOTRE EMAIL ADMIN
const ADMIN_EMAIL = "mompremiermarc09@gmail.com"; 

// Fonction pour basculer entre les écrans
function showScreen(screenId) {
  $("#securityScreen").classList.add("hidden");
  $("#adminLoginScreen").classList.add("hidden");
  $("#adminPanel").classList.add("hidden");
  
  if (screenId === "panel") {
    $("#adminPanel").classList.remove("hidden");
    lucide.createIcons();
  } else if (screenId === "login") {
    $("#adminLoginScreen").classList.remove("hidden");
  }
}

// Vérification initiale au chargement
window.addEventListener("supabase:ready", async () => {
  const { data } = await sb.auth.getSession();
  
  if (data.session && data.session.user.email === ADMIN_EMAIL) {
    // Déjà connecté en tant qu'admin
    initAdminPanel();
  } else if (data.session) {
    // Connecté mais pas admin -> On le déconnecte et on affiche le login
    await sb.auth.signOut();
    showScreen("login");
    $("#adminStatus").textContent = "Cet email n'a pas les droits d'administrateur.";
    $("#adminStatus").className = "auth-status error";
  } else {
    // Pas connecté du tout -> Login
    showScreen("login");
  }
});

// Gestion du formulaire de connexion Admin
$("#adminAuthForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#adminEmail").value.trim();
  const pass = $("#adminPassword").value;
  const status = $("#adminStatus");
  const btn = $("#adminSubmit");

  status.textContent = "";
  btn.disabled = true;
  btn.textContent = "Vérification...";

  // 1. On vérifie d'abord si l'email est le bon
  if (email !== ADMIN_EMAIL) {
    status.textContent = "Accès refusé. Vous n'êtes pas l'administrateur.";
    status.classList.add("error");
    btn.disabled = false;
    btn.textContent = "Se connecter";
    return;
  }

  // 2. On tente la connexion Supabase
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  
  if (error) {
    status.textContent = "Mot de passe incorrect.";
    status.classList.add("error");
    btn.disabled = false;
    btn.textContent = "Se connecter";
  } else {
    // 3. Succès !
    initAdminPanel();
  }
});

// Initialisation du panneau une fois connecté
async function initAdminPanel() {
  showScreen("panel");

  try {
    // Charger l'annonce actuelle
    const { data: annonce } = await sb.from("annonces").select("*").eq("active", true).single();
    if (annonce) $("#announcementInput").value = annonce.message;

    // Bouton Publier
    $("#btnPublishAnnouncement").addEventListener("click", async () => {
      const msg = $("#announcementInput").value.trim();
      if (!msg) return;
      
      await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { error } = await sb.from("annonces").insert({ message: msg, active: true });
      
      if (!error) {
        const btn = $("#btnPublishAnnouncement");
        btn.textContent = "✅ Publié !";
        btn.style.background = "var(--green-dark)";
        setTimeout(() => { btn.textContent = "Publier l'annonce"; btn.style.background = ""; }, 2000);
      }
    });

    // Bouton Retirer
    $("#btnRemoveAnnouncement").addEventListener("click", async () => {
      await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      $("#announcementInput").value = "";
      const btn = $("#btnRemoveAnnouncement");
      btn.textContent = "✅ Retiré !";
      setTimeout(() => { btn.textContent = "Retirer"; }, 2000);
    });

  } catch (e) {
    console.error(e);
  }
}
