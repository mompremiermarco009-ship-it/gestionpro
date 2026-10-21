const $ = (s, r = document) => r.querySelector(s);
const ADMIN_EMAIL = "mompremiermarc09@gmail.com"; // Votre email admin

window.addEventListener("supabase:ready", async () => {
  const { data } = await sb.auth.getSession();
  
  // Vérification de sécurité : Si ce n'est pas l'admin, on le dégage
  if (!data.session || data.session.user.email !== ADMIN_EMAIL) {
    alert("Accès refusé. Vous n'êtes pas l'administrateur.");
    window.location.href = "index.html";
    return;
  }

  // Charger l'annonce actuelle
  const { data: annonce } = await sb.from("annonces").select("*").eq("active", true).single();
  if (annonce) $("#announcementInput").value = annonce.message;

  // Bouton Publier
  $("#btnPublishAnnouncement").addEventListener("click", async () => {
    const msg = $("#announcementInput").value.trim();
    if (!msg) return;
    
    // On désactive toutes les anciennes annonces
    await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    
    // On crée la nouvelle
    const { error } = await sb.from("annonces").insert({ message: msg, active: true });
    
    if (!error) $("#adminStatus").innerHTML = "<span style='color:var(--green)'>✅ Annonce publiée avec succès !</span>";
    else $("#adminStatus").innerHTML = "<span style='color:var(--red)'>❌ Erreur : " + error.message + "</span>";
  });

  // Bouton Retirer
  $("#btnRemoveAnnouncement").addEventListener("click", async () => {
    await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    $("#announcementInput").value = "";
    $("#adminStatus").innerHTML = "<span style='color:var(--yellow-dark)'>✅ Annonce retirée.</span>";
  });
});
