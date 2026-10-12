// ==========================================================================
// Carnet de Potager — Logique applicative Vanilla JS & PWA
// IndexedDB (idb v8), Service Worker, Outbox Sync, getUserMedia, Notifications, Share API
// ==========================================================================

const DB_NAME = "potager-db";
const DB_VERSION = 1;

let db = null;
let deferredInstallPrompt = null;
let currentPhotoData = null;
let mediaStream = null;

// ==========================================================================
// 1. Initialisation de la base IndexedDB (avec librairie idb v8)
// ==========================================================================

async function initDB() {
  if (!window.idb) {
    console.error("La bibliothèque idb n'est pas chargée.");
    return null;
  }

  return await idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Store 1 : fiches des plantes
      if (!database.objectStoreNames.contains("plants")) {
        const plantStore = database.createObjectStore("plants", { keyPath: "id" });
        plantStore.createIndex("name", "name", { unique: false });
        plantStore.createIndex("plantedAt", "plantedAt", { unique: false });
      }

      // Store 2 : outbox pour synchronisation différée hors-ligne
      if (!database.objectStoreNames.contains("outbox")) {
        database.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
      }
    }
  });
}

// ==========================================================================
// 2. Hydratation initiale depuis le HTML (SEO / Robots)
// ==========================================================================

async function hydrateInitialSeeds() {
  const count = await db.count("plants");
  if (count === 0) {
    console.log("🌱 Première exécution : Hydratation des 3 fiches repères du HTML vers IndexedDB");

    const defaultSeeds = [
      {
        id: "seed-1",
        name: "Tomate Marmande",
        category: "Solanacée",
        plantedAt: "2026-03-15",
        waterInterval: 3,
        lastWatered: getTodayString(),
        notes: "Sol riche et exposition plein soleil. Pailler généreusement au pied pour préserver l'humidité sans mouiller les feuilles.",
        photoUrl: "",
        createdAt: Date.now(),
        isSeed: true
      },
      {
        id: "seed-2",
        name: "Basilic Grand Vert",
        category: "Aromatique",
        plantedAt: "2026-04-10",
        waterInterval: 2,
        lastWatered: getTodayString(),
        notes: "Aime la chaleur et une exposition mi-ombre. Pincer l'extrémité des tiges pour stimuler de nouvelles feuilles et retarder la floraison.",
        photoUrl: "",
        createdAt: Date.now(),
        isSeed: true
      },
      {
        id: "seed-3",
        name: "Courgette Ronde de Nice",
        category: "Cucurbitacée",
        plantedAt: "2026-04-20",
        waterInterval: 4,
        lastWatered: getTodayString(),
        notes: "Plante non coureuse très productive en plein soleil. Apport de compost mûr requis et arrosage régulier et abondant.",
        photoUrl: "",
        createdAt: Date.now(),
        isSeed: true
      }
    ];

    for (const item of defaultSeeds) {
      await db.put("plants", item);
    }
  }
}

// ==========================================================================
// 3. Calculs d'arrosage & Rendu des fiches de plantes
// ==========================================================================

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

function calculateWaterStatus(plant) {
  const refDateStr = plant.lastWatered || plant.plantedAt;
  const refDate = new Date(refDateStr);
  const nextWaterDate = new Date(refDate);
  nextWaterDate.setDate(refDate.getDate() + parseInt(plant.waterInterval, 10));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  nextWaterDate.setHours(0, 0, 0, 0);

  const diffTime = nextWaterDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      statusClass: "status-late",
      label: `En retard (${Math.abs(diffDays)}j)`,
      diffDays,
      needsWater: true
    };
  } else if (diffDays === 0) {
    return {
      statusClass: "status-today",
      label: "Aujourd'hui !",
      diffDays,
      needsWater: true
    };
  } else {
    return {
      statusClass: "status-ok",
      label: `Dans ${diffDays} jour${diffDays > 1 ? "s" : ""}`,
      diffDays,
      needsWater: false
    };
  }
}

async function renderPlants() {
  const plantsListEl = document.getElementById("plants-list");
  const countEl = document.getElementById("plants-count");
  if (!plantsListEl || !db) return;

  const plants = await db.getAll("plants");

  if (countEl) {
    countEl.textContent = `${plants.length} plante${plants.length > 1 ? "s" : ""} enregistrée${plants.length > 1 ? "s" : ""}`;
  }

  // Reconstruction sécurisée du DOM avec textContent et createElement
  plantsListEl.replaceChildren(
    ...plants.map((plant) => {
      const li = document.createElement("li");
      li.className = "plant-card";
      li.dataset.id = plant.id;
      if (plant.isSeed) {
        li.dataset.seed = "true";
      }

      // Image si présente
      if (plant.photoUrl) {
        const img = document.createElement("img");
        img.className = "card-photo";
        img.src = plant.photoUrl;
        img.alt = `Photo de ${plant.name}`;
        li.appendChild(img);
      }

      // En-tête de carte
      const headerDiv = document.createElement("div");
      headerDiv.className = "card-header";

      const titleWrap = document.createElement("div");
      const h3 = document.createElement("h3");
      h3.className = "plant-title";
      h3.textContent = plant.name;
      titleWrap.appendChild(h3);

      if (plant.category) {
        const catTag = document.createElement("span");
        catTag.className = "category-tag";
        catTag.textContent = plant.category;
        titleWrap.appendChild(catTag);
      }
      headerDiv.appendChild(titleWrap);

      const waterBadge = document.createElement("span");
      waterBadge.className = "water-badge";
      waterBadge.textContent = `Arrosage : tous les ${plant.waterInterval}j`;
      headerDiv.appendChild(waterBadge);

      li.appendChild(headerDiv);

      // Corps de carte
      const bodyDiv = document.createElement("div");
      bodyDiv.className = "card-body";

      const plantedP = document.createElement("p");
      plantedP.className = "plant-info";
      plantedP.innerHTML = `<strong>Planté le :</strong> ${plant.plantedAt}`;
      bodyDiv.appendChild(plantedP);

      const waterStatus = calculateWaterStatus(plant);
      const nextWaterP = document.createElement("p");
      nextWaterP.className = "plant-info";
      nextWaterP.innerHTML = `<strong>Prochain arrosage :</strong> `;
      const nextSpan = document.createElement("span");
      nextSpan.className = `next-water ${waterStatus.statusClass}`;
      nextSpan.textContent = waterStatus.label;
      nextWaterP.appendChild(nextSpan);
      bodyDiv.appendChild(nextWaterP);

      if (plant.notes) {
        const notesP = document.createElement("p");
        notesP.className = "plant-notes";
        notesP.textContent = plant.notes;
        bodyDiv.appendChild(notesP);
      }

      li.appendChild(bodyDiv);

      // Actions de la carte
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "card-actions";

      const waterBtn = document.createElement("button");
      waterBtn.type = "button";
      waterBtn.className = "btn btn-sm btn-water";
      waterBtn.textContent = "💧 Arrosé aujourd'hui";
      waterBtn.addEventListener("click", () => handleWaterPlant(plant.id));
      actionsDiv.appendChild(waterBtn);

      const shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "btn btn-sm btn-share";
      shareBtn.textContent = "🔗 Partager";
      shareBtn.addEventListener("click", () => handleSharePlant(plant));
      actionsDiv.appendChild(shareBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-sm btn-danger";
      deleteBtn.textContent = "🗑️";
      deleteBtn.title = "Supprimer la fiche";
      deleteBtn.addEventListener("click", () => handleDeletePlant(plant.id, plant.name));
      actionsDiv.appendChild(deleteBtn);

      li.appendChild(actionsDiv);

      return li;
    })
  );
}

// ==========================================================================
// 4. Actions : Arroser, Partager, Supprimer
// ==========================================================================

async function handleWaterPlant(plantId) {
  const plant = await db.get("plants", plantId);
  if (!plant) return;

  plant.lastWatered = getTodayString();
  await db.put("plants", plant);

  // Ajout à l'outbox pour synchronisation
  await queueOutboxAction("WATER_PLANT", { id: plantId, date: plant.lastWatered });

  await renderPlants();
  showToast(`💧 Arrosage noté pour "${plant.name}" !`);
}

async function handleDeletePlant(plantId, plantName) {
  if (!confirm(`Supprimer définitivement "${plantName}" du carnet ?`)) return;

  await db.delete("plants", plantId);
  await queueOutboxAction("DELETE_PLANT", { id: plantId });

  await renderPlants();
  showToast(`🗑️ "${plantName}" supprimée.`);
}

async function handleSharePlant(plant) {
  const shareData = {
    title: `Fiche Potager : ${plant.name}`,
    text: `🌱 ${plant.name} (${plant.category || "Plante"})\n💧 Arrosage recommandé : tous les ${plant.waterInterval} jours.\n📝 ${plant.notes || "Pas de note particulière."}`,
    url: window.location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      showToast("Fiche partagée avec succès !");
    } catch (err) {
      if (err.name !== "AbortError") {
        copyPlantToClipboard(shareData.text);
      }
    }
  } else {
    copyPlantToClipboard(shareData.text);
  }
}

function copyPlantToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("📋 Fiche copiée dans le presse-papiers !");
    }).catch(() => {
      showToast("Impossible de copier automatiquement.");
    });
  } else {
    showToast("Le partage natif n'est pas supporté sur ce navigateur.");
  }
}

// ==========================================================================
// 5. Gestion de l'Outbox & Synchronisation hors-ligne
// ==========================================================================

async function queueOutboxAction(type, payload) {
  await db.add("outbox", {
    type,
    payload,
    timestamp: Date.now()
  });

  // Déclencher Background Sync si supporté
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("sync-plants");
    } catch (err) {
      console.warn("Background Sync non disponible, repli sur online event", err);
    }
  }

  // Si on est déjà en ligne, traiter directement
  if (navigator.onLine) {
    processOutbox();
  }
}

async function processOutbox() {
  if (!navigator.onLine || !db) return;

  const outboxItems = await db.getAll("outbox");
  if (outboxItems.length === 0) return;

  const syncBadge = document.getElementById("sync-badge");
  if (syncBadge) {
    syncBadge.textContent = "🔄 Synchronisation...";
    syncBadge.className = "badge badge-syncing";
  }

  console.log(`📡 Traitement de l'outbox : ${outboxItems.length} action(s) en attente.`);

  // Simulation d'envoi réseau des opérations en attente
  for (const item of outboxItems) {
    try {
      // Dans un contexte de production, envoi fetch("/api/sync", { ... })
      await new Promise((res) => setTimeout(res, 250));
      await db.delete("outbox", item.id);
    } catch (err) {
      console.error("Échec de synchronisation d'un élément", err);
    }
  }

  if (syncBadge) {
    syncBadge.textContent = "🟢 En ligne";
    syncBadge.className = "badge badge-online";
  }

  showToast("✅ Toutes vos modifications ont été synchronisées !");
}

// ==========================================================================
// 6. Caméra (getUserMedia) & Repli sélection fichier
// ==========================================================================

function setupCameraControls() {
  const cameraBtn = document.getElementById("camera-btn");
  const fileInput = document.getElementById("file-input");
  const cameraModal = document.getElementById("camera-modal");
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");
  const snapBtn = document.getElementById("snap-btn");
  const closeCameraBtn = document.getElementById("close-camera-btn");
  const previewWrap = document.getElementById("photo-preview-wrap");
  const previewImg = document.getElementById("photo-preview");
  const removePhotoBtn = document.getElementById("remove-photo-btn");

  if (!cameraBtn) return;

  cameraBtn.addEventListener("click", async () => {
    // Demande de permission déclenchée strictement au clic utilisateur
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        video.srcObject = mediaStream;
        cameraModal.style.display = "flex";
        cameraModal.hidden = false;
      } catch (err) {
        console.warn("Accès caméra refusé ou indisponible : repli sur fichier", err);
        showToast("📷 Caméra inaccessible. Choisissez une photo dans vos fichiers.");
        fileInput.click();
      }
    } else {
      fileInput.click();
    }
  });

  // Prise de vue depuis la vidéo
  if (snapBtn) {
    snapBtn.addEventListener("click", () => {
      if (!mediaStream) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      currentPhotoData = canvas.toDataURL("image/jpeg", 0.85);
      previewImg.src = currentPhotoData;
      previewWrap.style.display = "flex";
      previewWrap.hidden = false;

      stopCameraStream();
      cameraModal.style.display = "none";
      cameraModal.hidden = true;
      showToast("Photo capturée avec succès !");
    });
  }

  // Fermeture du flux vidéo
  if (closeCameraBtn) {
    closeCameraBtn.addEventListener("click", () => {
      stopCameraStream();
      cameraModal.style.display = "none";
      cameraModal.hidden = true;
    });
  }

  // Repli fichier
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        currentPhotoData = e.target.result;
        previewImg.src = currentPhotoData;
        previewWrap.style.display = "flex";
        previewWrap.hidden = false;
        showToast("Photo importée avec succès !");
      };
      reader.readAsDataURL(file);
    });
  }

  // Suppression de la photo courante
  if (removePhotoBtn) {
    removePhotoBtn.addEventListener("click", () => {
      currentPhotoData = null;
      previewImg.src = "";
      previewWrap.style.display = "none";
      previewWrap.hidden = true;
      if (fileInput) fileInput.value = "";
    });
  }
}

function stopCameraStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

// ==========================================================================
// 7. Formulaire d'ajout de plante
// ==========================================================================

function setupForm() {
  const form = document.getElementById("plant-form");
  if (!form) return;

  // Initialiser la date du jour par défaut
  const dateInput = document.getElementById("plant-date");
  if (dateInput) {
    dateInput.value = getTodayString();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("plant-name").value.trim();
    const category = document.getElementById("plant-category").value.trim();
    const plantedAt = document.getElementById("plant-date").value;
    const waterInterval = parseInt(document.getElementById("plant-interval").value, 10);
    const notes = document.getElementById("plant-notes").value.trim();

    if (!name || !plantedAt || !waterInterval) {
      showToast("Veuillez renseigner tous les champs obligatoires (*).");
      return;
    }

    const newPlant = {
      id: "plant-" + Date.now(),
      name,
      category,
      plantedAt,
      waterInterval,
      lastWatered: plantedAt,
      notes,
      photoUrl: currentPhotoData || "",
      createdAt: Date.now(),
      isSeed: false
    };

    await db.put("plants", newPlant);
    await queueOutboxAction("ADD_PLANT", newPlant);

    // Réinitialisation de l'état
    form.reset();
    if (dateInput) dateInput.value = getTodayString();
    currentPhotoData = null;
    const previewWrap = document.getElementById("photo-preview-wrap");
    if (previewWrap) previewWrap.hidden = true;

    await renderPlants();
    showToast(`🌿 "${name}" ajoutée à votre carnet !`);
  });
}

// ==========================================================================
// 8. Notifications locales d'arrosage
// ==========================================================================

function setupNotificationButton() {
  const notifBtn = document.getElementById("notif-btn");
  if (!notifBtn || !("Notification" in window)) {
    if (notifBtn) notifBtn.hidden = true;
    return;
  }

  if (Notification.permission === "granted") {
    notifBtn.textContent = "🔔 Alertes actives";
  }

  notifBtn.addEventListener("click", async () => {
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        notifBtn.textContent = "🔔 Alertes actives";
        showToast("Notifications d'arrosage activées !");
        checkAndTriggerWateringAlert();
      } else {
        showToast("Notifications refusées dans le navigateur.");
      }
    } else if (Notification.permission === "granted") {
      checkAndTriggerWateringAlert();
    } else {
      showToast("Les notifications sont bloquées dans les paramètres de votre navigateur.");
    }
  });
}

async function checkAndTriggerWateringAlert() {
  if (!db || Notification.permission !== "granted") return;

  const plants = await db.getAll("plants");
  const thirstyPlants = plants.filter((p) => calculateWaterStatus(p).needsWater);

  if (thirstyPlants.length > 0) {
    const names = thirstyPlants.map((p) => p.name).join(", ");
    new Notification("🌱 Carnet de Potager — Arrosage", {
      body: `${thirstyPlants.length} plante(s) ont besoin d'eau aujourd'hui : ${names}`,
      icon: "icons/icon-192.png",
      tag: "watering-alert"
    });
  } else {
    new Notification("🌱 Carnet de Potager", {
      body: "Tout va bien au jardin : aucune plante n'a besoin d'arrosage aujourd'hui !",
      icon: "icons/icon-192.png",
      tag: "watering-ok"
    });
  }
}

// ==========================================================================
// 9. Gestion du cycle de vie PWA : Installation & Mise à jour maîtrisée
// ==========================================================================

function setupPWAControls() {
  const installBtn = document.getElementById("install-btn");
  const updateBanner = document.getElementById("update-banner");
  const updateBtn = document.getElementById("update-btn");
  const offlineIndicator = document.getElementById("offline-indicator");
  const syncBadge = document.getElementById("sync-badge");

  // A. Installation PWA (beforeinstallprompt)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) {
      installBtn.style.display = "inline-flex";
      installBtn.hidden = false;
    }
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === "accepted") {
        showToast("Installation acceptée !");
      }
      deferredInstallPrompt = null;
      installBtn.style.display = "none";
      installBtn.hidden = true;
    });
  }

  window.addEventListener("appinstalled", () => {
    if (installBtn) {
      installBtn.style.display = "none";
      installBtn.hidden = true;
    }
    showToast("Application installée avec succès sur votre écran d'accueil !");
  });

  // B. Détection de connexion en ligne / hors-ligne
  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    if (offlineIndicator) {
      if (isOnline) {
        offlineIndicator.style.display = "none";
        offlineIndicator.setAttribute("hidden", "");
        offlineIndicator.hidden = true;
      } else {
        offlineIndicator.style.display = "flex";
        offlineIndicator.removeAttribute("hidden");
        offlineIndicator.hidden = false;
      }
    }
    if (syncBadge) {
      syncBadge.textContent = isOnline ? "🟢 En ligne" : "📡 Hors ligne";
      syncBadge.className = `badge ${isOnline ? "badge-online" : "badge-offline"}`;
    }
    if (isOnline) {
      processOutbox();
    }
  }

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  updateNetworkStatus();

  // C. Enregistrement du Service Worker & Détection de mise à jour maîtrisée
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      console.log("✅ Service Worker enregistré avec le scope :", reg.scope);

      // Si un worker est déjà en attente (waiting)
      if (reg.waiting) {
        showUpdateBanner(reg.waiting);
      }

      // Si une nouvelle version est en cours d'installation
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });
    }).catch((err) => {
      console.error("❌ Échec d'enregistrement du Service Worker :", err);
    });

    // Recharger la page dès que le nouveau worker prend le contrôle
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // Réception des événements du SW (ex: sync)
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "BACKGROUND_SYNC_TRIGGERED") {
        processOutbox();
      }
    });
  }

  function showUpdateBanner(worker) {
    if (!updateBanner) return;
    updateBanner.style.display = "flex";
    updateBanner.removeAttribute("hidden");
    updateBanner.hidden = false;
    if (updateBtn) {
      updateBtn.onclick = () => {
        updateBtn.disabled = true;
        updateBtn.textContent = "Mise à jour en cours...";
        worker.postMessage({ type: "SKIP_WAITING" });
      };
    }
  }
}

// ==========================================================================
// 10. Toast Helper
// ==========================================================================

let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.display = "block";
  toast.hidden = false;

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.display = "none";
    toast.hidden = true;
  }, 3500);
}

// ==========================================================================
// 11. Initialisation générale au DOMContentLoaded
// ==========================================================================

window.addEventListener("DOMContentLoaded", async () => {
  setupPWAControls();
  setupCameraControls();
  setupForm();
  setupNotificationButton();

  db = await initDB();
  if (db) {
    await hydrateInitialSeeds();
    await renderPlants();
    if (navigator.onLine) {
      processOutbox();
    }
  }
});
