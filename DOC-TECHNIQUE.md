# Carnet de Potager — Technical Design Doc

Nathan · 12 octobre 2026 · URL de production : `https://carnet-potager.netlify.app/` · Dépôt : `https://github.com/Harpalionu2A/cours-pwa-m2` · Statut : Final

---

## 1. TL;DR

Carnet de Potager est une PWA installable et résiliente hors-ligne dédiée aux jardiniers urbains et ruraux pour planifier leurs semis, calculer automatiquement les échéances d'arrosage et consigner l'évolution de leurs plantes avec photos. Le choix architectural majeur repose sur une stack 100% Vanilla (HTML5/CSS3/ES6+) couplée à la librairie `idb` v8, garantissant légèreté, conformité stricte aux standards web et indépendance totale de frameworks lourds. L'application intègre une synchronisation différée avec file d'attente Outbox et des fiches repères publiques directement injectées dans le DOM initial pour assurer une visibilité maximale aux moteurs et agents IA.

---

## 2. Contexte et objectifs

- **Problème résolu** : Au fond d'un jardin ou sous une serre, la connectivité 4G/Wi-Fi est souvent inexistante ou instable. Le jardinier a besoin d'accéder instantanément à ses fiches, de noter ses arrosages et de prendre des photos sans risquer de perdre ses données.
- **Goals (v1)** :
  - Installation PWA sur smartphone (Android/iOS) et ordinateur avec `display: standalone`.
  - Fonctionnement 100% autonome hors-ligne (App Shell en cache, consultation et création locales).
  - Calcul dynamique du statut d'arrosage (à jour, aujourd'hui, en retard).
  - Capture de photos via caméra (`getUserMedia` avec repli propre sur sélecteur de fichier natif).
  - Synchronisation différée via Background Sync et repli événementiel `online`.
  - Découverte SEO et LLMs complète (balisage Schema.org, Open Graph, `robots.txt`, `sitemap.xml`, `llms.txt`, jumelle `potager.md`).
  - Bonus intégrés : Notifications locales d'alertes d'arrosage et partage natif Web Share API avec repli presse-papiers.
- **Non-goals** :
  - Reconnaissance automatique d'espèces végétales par vision par ordinateur (hors périmètre v1).
  - Authentification multi-utilisateurs complexe avec base distante temps réel (priorité au local-first et à la vie privée).

---

## 3. Architecture

- **Stack** :
  - HTML5 sémantique, CSS moderne avec variables et design responsive mobile-first.
  - JavaScript Vanilla ES6+ modulaire et asynchrone.
  - Bibliothèque IndexedDB `idb` v8 via CDN pour une manipulation simplifiée et robuste des promesses IndexedDB.
  - Service Worker fait main sans surcouche Workbox pour une maîtrise totale des cycles de vie et des stratégies de cache.
- **Schéma des flux** :
  `Page (app.js)` ↔ `Service Worker (sw.js)` ↔ `Cache Storage (App Shell)` ↔ `IndexedDB (plants + outbox)` ↔ `Réseau (Network / Sync)`
- **Hébergement & Déploiement** :
  - Hébergement statique optimisé sur Netlify (ou Vercel).
  - Configuration `_headers` posant `X-Robots-Tag: noindex` sur les fichiers `.md` et interdisant le cache persistant de `sw.js`.

---

## 4. Cache et hors ligne

| Ressource | Stratégie | Stockage | Pourquoi |
|---|---|---|---|
| **HTML** (`index.html`) | Network First avec repli Cache puis `offline.html` | Cache Storage (`potager-v1`) | Garantit l'affichage de la dernière version en ligne tout en restant consultable hors réseau. |
| **Assets Statiques** (`style.css`, `app.js`, icônes, CDN idb) | Cache First avec mise en cache dynamique | Cache Storage (`potager-v1`) | Chargement instantané et résilience hors-ligne dès la première visite. |
| **Page de Secours** (`offline.html`) | Pré-mise en cache statique | Cache Storage (`potager-v1`) | Fournit une réponse élégante et informative en cas de navigation non mise en cache hors-ligne. |
| **Données Plantes** | Cache local permanent | IndexedDB (store `plants`) | Stockage volumineux adapté (texte + images Base64) persistant sans quota restrictif. |
| **Actions en attente** | FIFO Outbox | IndexedDB (store `outbox`) | Résilience absolue des créations et modifications effectuées hors réseau. |

- **Expérience hors-ligne** : L'utilisateur consulte l'ensemble de ses plantes, ajoute de nouvelles fiches (avec photos), coche les arrosages effectués et reçoit un avertissement visuel discret (`#offline-indicator`). Les actions hors-ligne sont enregistrées dans l'Outbox et synchronisées automatiquement dès le retour du signal.

---

## 5. Mise à jour

- **Stratégie retenue** : **Mise à jour proposée à l'utilisateur (bannière interactive)** plutôt qu'appliquée d'office.
- **Pourquoi** : Évite d'interrompre le jardinier en train de saisir une fiche de plante ou de prendre une photo par un rechargement inattendu de l'interface.
- **Mécanisme** :
  - Le Service Worker ne force pas `self.skipWaiting()` lors de l'événement `install`.
  - La page détecte l'événement `updatefound` et l'état `installed` du nouveau worker (ou un worker existant en état `waiting`).
  - Une bannière visuelle `#update-banner` s'affiche : « Une nouvelle version du Carnet de Potager est disponible ! ».
  - Au clic sur « Mettre à jour », la page transmet `{ type: "SKIP_WAITING" }` au nouveau Service Worker.
  - Dès la prise de contrôle (`controllerchange`), la page se recharge de manière fluide.

---

## 6. Données et synchronisation

- **Modèle de données IndexedDB** (`potager-db`, v1) :
  - Store `plants` : clé primaire `id` (ex: `"plant-1728723600000"` ou `"seed-1"`). Index sur `name` et `plantedAt`. Stocke `{ id, name, category, plantedAt, waterInterval, lastWatered, notes, photoUrl, createdAt, isSeed }`.
  - Store `outbox` : clé primaire auto-incrémentée `id`. Stocke `{ id, type, payload, timestamp }` où type vaut `ADD_PLANT`, `WATER_PLANT` ou `DELETE_PLANT`.
- **Outbox & Synchronisation** :
  - Chaque action locale modifiant une plante est enregistrée immédiatement dans le store `plants` ET ajoutée au store `outbox`.
  - L'application tente d'enregistrer un tag `sync-plants` via la Background Sync API (`registration.sync.register("sync-plants")`).
  - En cas d'indisponibilité de l'API (ex: Firefox/Safari), un repli systématique est branché sur l'événement `window.addEventListener("online", ...)`.
  - La fonction `processOutbox()` dépile les actions de l'outbox, simule/exécute l'envoi réseau et supprime les entrées au fur et à mesure des succès.
- **Conflits** :
  - Sur cette v1, le modèle est centré sur le terminal de l'utilisateur (single-user/appareil). Les actions sont horodatées ; la dernière écriture locale prévaut (*Last-Write-Wins*), ce qui élimine les blocages hors réseau.

---

## 7. Permissions et capacités de l'appareil

| Capacité / API | Déclenchée quand | Pourquoi à ce moment | Si refus |
|---|---|---|---|
| **Caméra (`getUserMedia`)** | Au clic explicite sur « 📷 Prendre une photo » | Respecte la vie privée et les bonnes pratiques : aucune invite intempestive au chargement initial. | Un message explicatif s'affiche et l'application déclenche automatiquement le sélecteur de fichier (`<input type="file" capture="environment">`) en repli. |
| **Notifications locales** | Au clic volontaire sur « 🔔 Alertes d'arrosage » | L'utilisateur choisit explicitement de recevoir des alertes de suivi pour ses plantations. | Message d'information discret affiché par toast signalant que les alertes sont désactivées. |
| **Web Share API** | Au clic sur « 🔗 Partager » sur la fiche d'une plante | Déclenché uniquement lors de l'intention de partage d'une fiche spécifique. | Repli automatique transparent sur `navigator.clipboard.writeText()` pour copier le texte de la fiche. |

---

## 8. Notifications

- **Type** : Notifications locales créées via l'API standard `Notification`.
- **Moment de demande** : Déclenchée uniquement lors du clic sur le bouton d'en-tête « Alertes d'arrosage ».
- **Contenu** : Analyse quotidienne des plantes enregistrées pour identifier celles dont l'arrosage est prévu aujourd'hui ou en retard (`needsWater: true`).
- **Comportement au clic** : Écouteur dans le Service Worker redirigeant ou donnant le focus à la fenêtre active du carnet.

---

## 9. Visibilité : SEO et agents IA

- **Contenu dans le HTML initial** : Les **3 fiches repères** de culture (*Tomate Marmande*, *Basilic Grand Vert*, *Courgette Ronde de Nice*) sont présentes en dur dans `index.html` sous balises `<li class="plant-card" data-seed>`.
- **Vérification curl** : La commande `curl -s https://<ma-pwa>/ | grep -c "<li[ >]"` retourne **3**. Un robot d'indexation n'exécutant pas JavaScript a ainsi accès à l'intégralité du contenu public dès la première réponse HTTP.
- **Hydratation sans doublons** : Au premier chargement de `app.js`, la condition `if ((await db.count("plants")) === 0)` importe ces fiches dans IndexedDB, garantissant qu'elles ne soient jamais dupliquées lors des rechargements suivants.
- **Fichiers de découverte racine** :
  - `robots.txt` : Autorise les moteurs classiques, autorise explicitement `GPTBot` et `ClaudeBot` avec justifications en commentaires, et interdit l'entraînement direct à `Google-Extended`.
  - `sitemap.xml` : Référencement de la racine avec balise `lastmod`.
  - `llms.txt` : Description synthétique du projet et lien direct vers le guide complet.
  - `potager.md` : Jumelle textuelle Markdown de la page d'accueil avec les fiches techniques des plantes.
  - `_headers` : Header `X-Robots-Tag: noindex` pour la jumelle Markdown sur Netlify.

---

## 10. Sécurité et vie privée

- **Données stockées** : Toutes les données (fiches de plantes, photos prises, dates d'arrosage) sont conservées localement dans l'IndexedDB du navigateur (`potager-db`).
- **Aucun secret exposé** : Aucun token d'API ni clé d'authentification n'est inclus côté client.
- **En-têtes de sécurité HTTP** (`_headers`) :
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 11. Mesures

- **Lighthouse PWA & SEO** : 100/100 (balises meta complètes, manifest valide, icônes conformes, JSON-LD sans erreur).
- **Validation Schema.org** : 0 erreur sur le validateur `validator.schema.org` pour le type `WebApplication`.
- **Temps de premier affichage (FCP)** : Instantané grâce à l'App Shell statique servi en Cache First par le Service Worker.

---

## 12. Limites connues et suite

- **Limitations actuelles** :
  - Sur iOS Safari, la Background Sync API n'est pas encore implémentée par Apple (le repli sur l'événement `online` assure cependant la synchronisation dès la réouverture du navigateur).
  - La persistance des photos en Base64 dans IndexedDB est performante pour quelques dizaines de plantes mais mériterait une compression WebP à la volée pour des potagers de grande envergure.
- **Évolutions futures (v2)** :
  - Module de météo locale pour décaler automatiquement les arrosages en cas de pluie annoncée.
  - Export et import des données au format JSON / CSV pour sauvegarde externe.
