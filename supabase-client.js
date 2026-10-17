/* =========================================================
   GESTIONPRO — supabase-client.js
   Initialisation du client Supabase + gestion de session
   ========================================================= */

const SUPABASE_URL = "https://hpvjfuuesxmtbhekkxsr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwdmpmdXVlc3htdGJoZWtreHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNzk3ODUsImV4cCI6MjEwNzc1NTc4NX0.ITLpzb5FAk_NKvzOZfDy6LwRtEzpdsCv3WsbStO--yo";

// Charger supabase-js depuis le CDN jsdelivr
(function chargerSupabase() {
  if (window.supabase) { initSupabaseClient(); return; }
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  script.onload = initSupabaseClient;
  script.onerror = () => {
    console.error("Impossible de charger Supabase JS depuis le CDN.");
    document.body.innerHTML = "<div style='padding:2rem;font-family:sans-serif;text-align:center'><h2>Connexion Internet requise</h2><p>Impossible de charger la bibliothèque Supabase. Vérifie ta connexion et recharge la page.</p></div>";
  };
  document.head.appendChild(script);
})();

let sb = null; // client global

function initSupabaseClient() {
  
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  
  });
  window.sb = sb;
  // Déclencher un événement pour dire "client prêt"
  window.dispatchEvent(new Event("supabase:ready"));
}