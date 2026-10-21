const $ = (s, r = document) => r.querySelector(s);
const ADMIN_EMAIL = "dieudlynv@gmail.com"; // REMPLACEZ PAR VOTRE EMAIL SUPABASE

window.addEventListener("supabase:ready", async () => {
  const { data } = await sb.auth.getSession();
  
  if (!data.session || data.session.user.email !== ADMIN_EMAIL) {
    alert("Accès refusé.");
    window.location.href = "index.html";
    return;
  }

  // Charger les utilisateurs
  // Note: Pour voir les utilisateurs, vous avez besoin de la clé "service_role" côté serveur. 
  // Pour ce prototype, on va juste simuler avec une table 'profils' si vous en avez une.
  // Sinon, affichez un message générique.
  $("#usersTable tbody").innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--muted)">Fonctionnalité réservée au serveur (Sécurité Supabase).</td></tr>`;

  // Charger l'annonce actuelle
  const { data: annonce } = await sb.from("annonces").select("*").eq("active", true).single();
  if (annonce) $("#announcementInput").value = annonce.message;

  // Publier
  $("#btnPublishAnnouncement").addEventListener("click", async () => {
    const msg = $("#announcementInput").value.trim();
    if (!msg) return;
    
    // Désactiver les anciennes
    await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    // Créer la nouvelle
    const { error } = await sb.from("annonces").insert({ message: msg, active: true });
    
    if (!error) $("#adminStatus").innerHTML = "✅ Annonce publiée !";
    else $("#adminStatus").innerHTML = "❌ Erreur : " + error.message;
  });

  // Retirer
  $("#btnRemoveAnnouncement").addEventListener("click", async () => {
    await sb.from("annonces").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    $("#announcementInput").value = "";
    $("#adminStatus").innerHTML = "✅ Annonce retirée.";
  });
});
