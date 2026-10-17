GESTIONPRO v1.5 — MENU CLAIR + VENTE/DÉPENSE SÉPARÉES
======================================================

FICHIERS
- index.html, style.css, app.js, README.txt

MENU (8 onglets)
----------------
🏠 Tableau de bord -> vue d’ensemble
🛒 Vente -> cliquer sur un produit pour vendre
📤 Dépense -> formulaire simple
📦 Stock -> ajouter/modifier produits
📈 Tendances -> voir si ça monte ou ça baisse
📜 Historique -> toutes les opérations
📊 Rapports -> analyses par catégorie/mois
⚙️ Paramètres -> nom, devise, sauvegardes

VENDRE (3 secondes)
-------------------
1. Onglet "🛒 Vente"
2. Clique sur le produit que tu veux vendre (bouton vert)
3. Fenêtre : quantité + prix (modifiable pour rabais)
4. Confirmer -> stock déduit + vente enregistrée

AJOUTER UNE DÉPENSE
-------------------
1. Onglet "📤 Dépense"
2. Date (déjà mise), montant, catégorie, description
3. Enregistrer -> visible dans l’historique

STOCK
-----
- Ajouter : bouton "+ Nouveau produit"
- Modifier : icône ✏️ sur la ligne
- Supprimer : icône 🗑️ sur la ligne
- Voir les mouvements : carte "Mouvements récents"

DONNÉES
-------
- localStorage uniquement. Rien en ligne.
- Sauvegarde JSON régulièrement.

LIMITES
-------
- Pas de synchronisation entre appareils.
- Pas de backend.
- Devise par défaut : HTG.