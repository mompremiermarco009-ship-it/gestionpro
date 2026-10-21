const $ = (s, r = document) => r.querySelector(s);

// ⚠️ METTEZ VOTRE EMAIL ICI (Celui avec lequel vous vous connectez)
const ADMIN_EMAIL = "mompremiermarc09@gmail.com"; 

window.addEventListener("supabase:ready", async () => {
  try {
    const { data } = await sb.auth.getSession();
    
    // 1. Si pas de session OU si l'email ne correspond pas -> Redirection immédiate
    if (!data.session || data.session.user.email !== ADMIN_EMAIL) {
      window.location.href = "index.html";
      return; // On arrête le script ici, l'utilisateur ne verra jamais l'admin
    }

    // 2. Si on arrive ici, c'est le bon admin. On lève le rideau !
    $("#securityScreen").classList.add("hidden");
    $("#adminPanel").classList.remove("hidden");
    lucide.createIcons();

    // 3. Charger l'annonce actuelle
    const { data: annonce } = await sb.from("annonces").select("*").eq("active", true).single();
    if (annonce) $("#announcementInput").value = annonce.message;

    // 4. Bouton Publier
    $("#btnPublishAnnouncement").addEventListener("click", async () => {
      const msg = $("#announcementInput").value.trim();
      if (!msg) return;
      
      // Désactiver les anciennes
      await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      // Insérer la nouvelle
      const { error } = await sb.from("annonces").insert({ message: msg, active: true });
      
      // Petit toast de confirmation simple
      if (!error) {
        const btn = $("#btnPublishAnnouncement");
        btn.textContent = "✅ Publié !";
        btn.style.background = "var(--green-dark)";
        setTimeout(() => { btn.textContent = "Publier l'annonce"; btn.style.background = ""; }, 2000);
      }
    });

    // 5. Bouton Retirer
    $("#btnRemoveAnnouncement").addEventListener("click", async () => {
      await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      $("#announcementInput").value = "";
      const btn = $("#btnRemoveAnnouncement");
      btn.textContent = "✅ Retiré !";
      setTimeout(() => { btn.textContent = "Retirer"; }, 2000);
    });

  } catch (e) {
    // En cas d'erreur, on redirige par sécurité
    window.location.href = "index.html";
  }
});
