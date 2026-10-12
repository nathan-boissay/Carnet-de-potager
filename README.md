# 🌱 Carnet de Potager — Progressive Web App (PWA)

> Application web progressive installable et résiliente hors-ligne pour la gestion des semis, le calcul d'arrosages et le partage de fiches de culture potagère.
> Projet développé dans le cadre du cours PWA — Master 2 Informatique · Università di Corsica.
> 
> 🌐 **Application déployée :** [https://carnetdepotager.vercel.app/](https://carnetdepotager.vercel.app/)

---

## 🚀 Lancer le projet en local

Pour tester l'application avec la prise en charge complète du Service Worker et des en-têtes HTTP :

```bash
# 1. Se placer dans le dossier du projet
cd Potager

# 2. Lancer un serveur statique local (port 3000 ou libre)
npx serve -l 3000
```

Ouvrez ensuite votre navigateur sur **`http://localhost:3000`**.

---

## 🔍 Commandes de vérification (SEO, Robots & Offline)

Testez la visibilité de l'application conformément aux directives du TP :

```bash
# 1. Vérifier que les 3 fiches de culture publiques sont dans le HTML initial (rendu = 3)
curl -s http://localhost:3000/ | grep -c "<li[ >]"

# 2. Vérifier la réponse de la jumelle Markdown pour agents IA
curl -s http://localhost:3000/potager.md

# 3. Vérifier les fichiers de découverte racine (doivent retourner HTTP 200)
curl -sI http://localhost:3000/robots.txt | head -n 1
curl -sI http://localhost:3000/sitemap.xml | head -n 1
curl -sI http://localhost:3000/llms.txt | head -n 1
```

---

## 🌿 Fonctionnalités implémentées

- **Installable** : Manifest complet (`manifest.json`), `display: "standalone"`, icônes 192x192 et 512x512, bouton d'installation personnalisé (`beforeinstallprompt`).
- **Résilience hors-ligne (App Shell)** : `sw.js` avec mise en cache statique à l'installation, purge des anciens caches, stratégies Cache First (assets) et Network First (navigation), fallback `offline.html`.
- **Mise à jour maîtrisée** : Détection de `updatefound`, bannière interactive « Nouvelle version disponible », transmission de `{ type: "SKIP_WAITING" }` sur validation utilisateur.
- **IndexedDB & Synchronisation** :
  - Bibliothèque `idb` v8.
  - Store `plants` pour la persistance locale des fiches et des photos.
  - Store `outbox` pour l'enregistrement des actions hors-ligne (ajout, arrosage, suppression).
  - Background Sync API (`sync-plants`) avec repli automatique sur l'événement `window.addEventListener("online", ...)`.
- **Capacités matérielles & Bonus** :
  - **Caméra** : Prise de vue en direct via `getUserMedia` avec repli automatique sur sélecteur de fichier (`capture="environment"`). Permission demandée strictement au clic utilisateur.
  - **Notifications d'arrosage (Bonus)** : Analyse locale de l'état d'arrosage de chaque plante et notification système personnalisée.
  - **Web Share API (Bonus)** : Partage natif des fiches de culture potagère avec repli sur le presse-papiers (`navigator.clipboard`).
- **Visibilité & SEO / LLMs** :
  - 3 fiches repères dans le HTML initial (`<li data-seed>`), métadonnées Open Graph, JSON-LD `@type: WebApplication`.
  - Fichiers racine : `robots.txt` (politiques IA motivées), `sitemap.xml`, `llms.txt`, jumelle `potager.md`, et `_headers`.

---

## 📑 Documentation technique

Consultez le document technique d'architecture complet dans [DOC-TECHNIQUE.md](file:///c:/Users/natha/Documents/_MasterInfoCorse/M2/PWA/cours-pwa-m2/Potager/DOC-TECHNIQUE.md).
