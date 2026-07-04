// app.js - Core application logic for Krithi's Birthday Memory Board

document.addEventListener("DOMContentLoaded", () => {
  // --- Data & Display Configurations ---
  const CATEGORY_DISPLAY_NAMES = {
    "General": "General Moments",
    "Alvin": "With Alvin",
    "Chinmayee": "With Chinmayee",
    "Dhanya": "With Dhanya",
    "grp photos": "Group Photos",
    "Kruti": "With Kruti",
    "Maurya": "With Maurya",
    "Pranav": "With Pranav",
    "Taran": "With Taran"
  };



  // --- State Initialization ---
  let currentCategory = "all";
  let activeMemoriesList = []; // Flattened list of currently filtered memories
  let currentImageIndex = 0;
  let slideshowIntervalId = null;
  
  // Persistent data from localStorage
  const LIKED_STORAGE_KEY = "krithi_birthday_likes";
  const LIKES_COUNT_KEY = "krithi_birthday_likes_count";
  const WISHES_STORAGE_KEY = "krithi_birthday_wishes";

  let likedImages = new Set(JSON.parse(localStorage.getItem(LIKED_STORAGE_KEY) || "[]"));
  let likesCountMap = JSON.parse(localStorage.getItem(LIKES_COUNT_KEY) || "{}");
  let guestbookWishes = JSON.parse(localStorage.getItem(WISHES_STORAGE_KEY) || "[]");
  // Clean up any old default placeholder wishes starting with 'def-' from previous runs
  guestbookWishes = guestbookWishes.filter(w => !w.id.startsWith("def-"));
  localStorage.setItem(WISHES_STORAGE_KEY, JSON.stringify(guestbookWishes));

  // --- Real-time Cloud Sync Configuration ---
  // Option A: Firebase Firestore (Recommended)
  // Paste your Web App credentials here to sync in real-time across users:
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAHa5lvbeZC0Ft6IQfuucyCbm8_KAHUsls",
    authDomain: "krithi-bday-scrapbook.firebaseapp.com",
    projectId: "krithi-bday-scrapbook",
    storageBucket: "krithi-bday-scrapbook.firebasestorage.app",
    messagingSenderId: "601249588152",
    appId: "1:601249588152:web:c2c7aff87b0974e3cda54d",
    measurementId: "G-J03QGPVDWV"
  };

  // Option B: KVDB.io Key-Value Database (Easiest zero-config fallback)
  const KVDB_BASE = "https://kvdb.io/Qpw3YLeevQiJQ2Ekh2C6h1";

  // --- Wordle Game Configuration ---
  const WORDLE_WORDS = ["GMEET", "SWEET", "FUNNY", "DRAMA", "REELS", "COORG"];
  const WORDLE_HINTS = {
    "GMEET": "Where we spent hours talking during lockdowns! 💻",
    "SWEET": "Just like you! 🍬",
    "FUNNY": "For all the inside jokes and laughter! 😂",
    "DRAMA": "Because life is boring without a little spice! 🎭",
    "REELS": "For all the late-night Instagram sharing sessions! 📱",
    "COORG": "The beautiful hills where you've made amazing memories! ⛰️"
  };

  let wordleTargetWord = "";
  let wordleGuesses = [];
  let wordleCurrentGuess = "";
  let wordleGameOver = false;
  let wordlePlayedWords = new Set();

  let db = null;
  let useFirebase = false;

  if (FIREBASE_CONFIG && typeof firebase !== "undefined") {
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      useFirebase = true;
      console.log("Firebase Firestore initialized successfully.");
    } catch (e) {
      console.warn("Firebase initialization failed. Falling back to local/KVDB.", e);
    }
  }

  let lastFetchedWishesJson = "";
  let lastFetchedLikesJson = "";

  async function syncFromCloud() {
    if (useFirebase) return; // Firebase keeps sync via real-time snapshots
    
    try {
      // Fetch wishes from KVDB
      const wishesRes = await fetch(`${KVDB_BASE}/wishes`);
      if (wishesRes.ok) {
        const cloudWishesText = await wishesRes.text();
        if (cloudWishesText !== lastFetchedWishesJson && cloudWishesText.trim()) {
          lastFetchedWishesJson = cloudWishesText;
          const cloudWishes = JSON.parse(cloudWishesText);
          if (Array.isArray(cloudWishes)) {
            guestbookWishes = cloudWishes.filter(w => !w.id.startsWith("def-"));
            localStorage.setItem(WISHES_STORAGE_KEY, JSON.stringify(guestbookWishes));
            renderWishes();
          }
        }
      }
      
      // Fetch likes from KVDB
      const likesRes = await fetch(`${KVDB_BASE}/likes`);
      if (likesRes.ok) {
        const cloudLikesText = await likesRes.text();
        if (cloudLikesText !== lastFetchedLikesJson && cloudLikesText.trim()) {
          lastFetchedLikesJson = cloudLikesText;
          const cloudLikes = JSON.parse(cloudLikesText);
          if (cloudLikes && typeof cloudLikes === 'object') {
            likesCountMap = cloudLikes;
            localStorage.setItem(LIKES_COUNT_KEY, JSON.stringify(likesCountMap));
            if (lightbox.open) {
              const currentFile = activeMemoriesList[currentImageIndex];
              if (currentFile) {
                const likesCount = likesCountMap[currentFile.id] || 0;
                lightboxLikeCount.textContent = likesCount;
              }
            }
            renderCards();
          }
        }
      }
    } catch (e) {
      console.warn("Failed to sync with cloud database. Running in local fallback mode.", e);
    }
  }

  // --- Real-time Firebase Firestore Listeners ---
  function setupFirebaseSync() {
    if (!useFirebase || !db) return;

    // Listen to wishes changes
    db.collection("wishes").orderBy("timestamp", "asc").onSnapshot((snapshot) => {
      const wishes = [];
      snapshot.forEach((doc) => {
        wishes.push({ id: doc.id, ...doc.data() });
      });
      guestbookWishes = wishes.filter(w => !w.id.startsWith("def-"));
      localStorage.setItem(WISHES_STORAGE_KEY, JSON.stringify(guestbookWishes));
      renderWishes();
    }, (error) => {
      console.error("Firebase wishes sync failed:", error);
    });

    // Listen to likes changes
    db.collection("likes").onSnapshot((snapshot) => {
      const likes = {};
      snapshot.forEach((doc) => {
        likes[doc.id] = doc.data().count || 0;
      });
      likesCountMap = likes;
      localStorage.setItem(LIKES_COUNT_KEY, JSON.stringify(likesCountMap));
      if (lightbox.open) {
        const currentFile = activeMemoriesList[currentImageIndex];
        if (currentFile) {
          const likesCount = likesCountMap[currentFile.id] || 0;
          lightboxLikeCount.textContent = likesCount;
        }
      }
      renderCards();
    }, (error) => {
      console.error("Firebase likes sync failed:", error);
    });
  }

  async function saveWishesToCloud() {
    if (useFirebase && db) {
      try {
        for (const wish of guestbookWishes) {
          await db.collection("wishes").doc(wish.id).set({
            author: wish.author,
            text: wish.text,
            timestamp: wish.timestamp
          });
        }
      } catch (e) {
        console.error("Failed to save wishes to Firebase:", e);
      }
      return;
    }

    try {
      lastFetchedWishesJson = JSON.stringify(guestbookWishes);
      await fetch(`${KVDB_BASE}/wishes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: lastFetchedWishesJson
      });
    } catch (e) {
      console.warn("Failed to save wishes to cloud.", e);
    }
  }

  async function saveLikesToCloud() {
    if (useFirebase && db) {
      try {
        for (const id in likesCountMap) {
          await db.collection("likes").doc(id).set({
            count: likesCountMap[id]
          });
        }
      } catch (e) {
        console.error("Failed to save likes to Firebase:", e);
      }
      return;
    }

    try {
      lastFetchedLikesJson = JSON.stringify(likesCountMap);
      await fetch(`${KVDB_BASE}/likes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: lastFetchedLikesJson
      });
    } catch (e) {
      console.warn("Failed to save likes to cloud.", e);
    }
  }

  // --- Background Image Preloading for Lightbox ---
  function preloadAdjacentImages() {
    const total = activeMemoriesList.length;
    if (total <= 1) return;

    const nextIndex = (currentImageIndex + 1) % total;
    const prevIndex = (currentImageIndex - 1 + total) % total;

    const nextFile = activeMemoriesList[nextIndex];
    const prevFile = activeMemoriesList[prevIndex];

    if (nextFile) {
      const imgNext = new Image();
      imgNext.src = `https://drive.google.com/thumbnail?id=${nextFile.id}&sz=w1600`;
    }
    if (prevFile) {
      const imgPrev = new Image();
      imgPrev.src = `https://drive.google.com/thumbnail?id=${prevFile.id}&sz=w1600`;
    }
  }

  // --- DOM Elements ---
  const statsCounter = document.getElementById("stats-counter");
  const filterBar = document.getElementById("filter-bar");
  const galleryGrid = document.getElementById("gallery-grid");
  
  // Lightbox elements
  const lightbox = document.getElementById("lightbox-modal");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxFolder = document.getElementById("lightbox-folder");

  const lightboxClose = document.getElementById("lightbox-close");
  const lightboxPrev = document.getElementById("lightbox-prev");
  const lightboxNext = document.getElementById("lightbox-next");
  const lightboxLikeBtn = document.getElementById("lightbox-like-btn");
  const lightboxLikeCount = document.getElementById("lightbox-like-count");
  const lightboxAutoplay = document.getElementById("lightbox-autoplay");

  // Guestbook elements
  const wishForm = document.getElementById("wish-form");
  const wishText = document.getElementById("wish-text");
  const wishName = document.getElementById("wish-name");
  const wishesContainer = document.getElementById("wishes-container");

  // --- Initialize Application ---
  function init() {
    renderFilters();
    filterMemories("all");
    renderWishes();
    setupEventListeners();
    
    if (useFirebase) {
      setupFirebaseSync();
    } else {
      // Sync with cloud database and start polling every 10 seconds
      syncFromCloud();
      setInterval(syncFromCloud, 10000);
    }
  }

  // --- Helper: Get total images count ---
  function getTotalImagesCount() {
    let count = 0;
    for (const cat in MEMORIES_DATA) {
      count += MEMORIES_DATA[cat].length;
    }
    return count;
  }

  // --- Render Filters (Pills) ---
  function renderFilters() {
    filterBar.innerHTML = "";
    
    // Add "All" category button
    const totalCount = getTotalImagesCount();
    const allBtn = document.createElement("button");
    allBtn.className = "filter-btn active";
    allBtn.id = "filter-btn-all";
    allBtn.setAttribute("role", "tab");
    allBtn.setAttribute("aria-selected", "true");
    allBtn.innerHTML = `All Memories 📸`;
    allBtn.addEventListener("click", () => selectCategory("all", allBtn));
    filterBar.appendChild(allBtn);

    // Add individual folder buttons
    for (const key in MEMORIES_DATA) {
      if (MEMORIES_DATA[key].length === 0) continue;
      
      const btn = document.createElement("button");
      btn.className = "filter-btn";
      btn.id = `filter-btn-${key.replace(/\s+/g, '-')}`;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      
      const displayName = CATEGORY_DISPLAY_NAMES[key] || key;
      btn.innerHTML = `${displayName}`;
      btn.addEventListener("click", () => selectCategory(key, btn));
      filterBar.appendChild(btn);
    }
  }

  function selectCategory(category, activeBtnElement) {
    // Update active visual state of buttons
    document.querySelectorAll(".filter-btn").forEach(btn => {
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
    });
    activeBtnElement.classList.add("active");
    activeBtnElement.setAttribute("aria-selected", "true");
    
    filterMemories(category);
  }

  // --- Filter and Render Memory Cards ---
  function filterMemories(category) {
    currentCategory = category;
    activeMemoriesList = [];

    if (category === "all") {
      // Flatten all categories
      for (const cat in MEMORIES_DATA) {
        MEMORIES_DATA[cat].forEach(file => {
          activeMemoriesList.push({ ...file, folder: cat });
        });
      }
      // Shuffle slightly or order by folder to make it look interesting?
      // Let's sort alphabetically by folder first, then file name to make it look organized.
      activeMemoriesList.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
      
      if (statsCounter) {
        statsCounter.innerHTML = `✨ <strong>${activeMemoriesList.length}</strong> memories, infinite laughs, and warm wishes for our favorite person`;
      }
    } else {
      MEMORIES_DATA[category].forEach(file => {
        activeMemoriesList.push({ ...file, folder: category });
      });
      activeMemoriesList.sort((a, b) => a.name.localeCompare(b.name));
      
      const displayName = CATEGORY_DISPLAY_NAMES[category] || category;
      if (statsCounter) {
        statsCounter.innerHTML = `📸 Reliving <strong>${activeMemoriesList.length}</strong> beautiful moments in <strong>${displayName}</strong>`;
      }
    }

    renderCards();
  }

  // --- Render Image Cards into Pinterest Grid ---
  function renderCards() {
    galleryGrid.innerHTML = "";

    if (activeMemoriesList.length === 0) {
      galleryGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--color-text-muted);">
          <p style="font-size: 1.2rem; font-family: var(--font-serif); font-style: italic;">No photos found in this folder yet.</p>
        </div>
      `;
      return;
    }

    activeMemoriesList.forEach((file, index) => {
      const card = document.createElement("article");
      card.className = "gallery-card";
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `Photo ${file.name} in category ${CATEGORY_DISPLAY_NAMES[file.folder] || file.folder}`);
      
      // Google Drive image source (Using thumbnail link: sz=w800 for cards, s=w1600 for lightbox)
      const imgSrc = `https://drive.google.com/thumbnail?id=${file.id}&sz=w800`;
      
      // Setup likes
      const likesCount = likesCountMap[file.id] || 0;
      const isLiked = likedImages.has(file.id);

      // Web Guidance: First 2 images above-the-fold get fetchpriority="high". Remaining get loading="lazy".
      const isLcpCandidate = index < 2;
      const loadingAttr = isLcpCandidate ? "" : 'loading="lazy"';
      const priorityAttr = isLcpCandidate ? 'fetchpriority="high"' : '';

      card.innerHTML = `
        <div class="card-media">
          <img class="card-img" src="${imgSrc}" alt="${file.name}" ${loadingAttr} ${priorityAttr}>
        </div>
        <div class="card-details">
          <div class="card-meta">
            <span class="card-category">${CATEGORY_DISPLAY_NAMES[file.folder] || file.folder}</span>
            <button class="card-likes ${isLiked ? 'liked' : ''}" data-id="${file.id}" aria-label="Heart photo">
              <svg class="heart-svg" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <span class="like-count-num">${likesCount}</span>
            </button>
          </div>
        </div>
      `;

      // --- Interaction: Click to Open Lightbox ---
      card.addEventListener("click", (e) => {
        // Prevent click if we clicked the heart button specifically
        if (e.target.closest(".card-likes")) return;
        openLightbox(index);
      });

      // Keyboard support for Enter key on card
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          openLightbox(index);
        }
      });

      // --- Interaction: Double Click to Like/Heart ---
      let lastTap = 0;
      card.addEventListener("touchstart", (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
          triggerHeartPop(card, file.id);
        }
        lastTap = currentTime;
      });

      card.addEventListener("dblclick", () => {
        triggerHeartPop(card, file.id);
      });

      // Single-click Heart button logic
      const likeBtn = card.querySelector(".card-likes");
      likeBtn.addEventListener("click", () => {
        toggleLike(file.id, likeBtn);
      });

      galleryGrid.appendChild(card);
    });
  }

  // Clean filename for visual displaying
  function cleanFileName(name) {
    // Strip file extension and common camera prefixes
    let clean = name.replace(/\.[^/.]+$/, ""); // strip extension
    clean = clean.replace(/^(IMG[-_]|DSC[-_]|FullSizeRender)/i, ""); // strip camera prefixes
    if (clean.trim() === "" || /^\d+$/.test(clean)) {
      return "Memory Details";
    }
    return clean.replace(/[-_]/g, " ").trim();
  }

  // --- Toggle Like State ---
  function toggleLike(id, likeBtnElement) {
    const likeCountNum = likeBtnElement.querySelector(".like-count-num");
    let currentCount = likesCountMap[id] || 0;

    if (likedImages.has(id)) {
      // Unlike
      likedImages.delete(id);
      currentCount = Math.max(0, currentCount - 1);
      likesCountMap[id] = currentCount;
      likeBtnElement.classList.remove("liked");
    } else {
      // Like
      likedImages.add(id);
      currentCount += 1;
      likesCountMap[id] = currentCount;
      likeBtnElement.classList.add("liked");
    }

    likeCountNum.textContent = currentCount;
    
    // Save to storage
    localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(Array.from(likedImages)));
    localStorage.setItem(LIKES_COUNT_KEY, JSON.stringify(likesCountMap));
    
    // Save to cloud
    saveLikesToCloud();
    
    // If the lightbox is currently open on this image, sync it
    if (lightbox.open && activeMemoriesList[currentImageIndex]?.id === id) {
      lightboxLikeCount.textContent = currentCount;
      if (likedImages.has(id)) {
        lightboxLikeBtn.classList.add("liked");
      } else {
        lightboxLikeBtn.classList.remove("liked");
      }
    }
  }

  // Double tap/click custom heart animation
  function triggerHeartPop(cardElement, id) {
    // Only add a heart if not already liked
    if (!likedImages.has(id)) {
      const likeBtn = cardElement.querySelector(".card-likes");
      toggleLike(id, likeBtn);
    }
    
    // Add heart pop graphic overlay
    const mediaContainer = cardElement.querySelector(".card-media");
    const heart = document.createElement("div");
    heart.className = "heart-pop";
    heart.innerHTML = `<svg viewBox="0 0 24 24" width="80" height="80"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#eb5757" stroke="#ffffff" stroke-width="1.5"></path></svg>`;
    
    mediaContainer.appendChild(heart);
    setTimeout(() => {
      heart.remove();
    }, 600);
  }

  // --- Lightbox Accessible Modal Controllers ---
  function openLightbox(index) {
    stopSlideshow();
    currentImageIndex = index;
    updateLightboxContent();
    lightbox.showModal();
    document.body.style.overflow = "hidden"; // Prevent background scrolling
  }

  function closeLightbox() {
    stopSlideshow();
    lightbox.close();
    document.body.style.overflow = ""; // Re-enable background scrolling
  }

  function updateLightboxContent() {
    const file = activeMemoriesList[currentImageIndex];
    if (!file) return;

    // Use full size preview (sz=w1600)
    lightboxImg.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1600`;
    lightboxImg.alt = file.name;
    
    // Smooth transition
    lightboxImg.classList.remove("fade-transition");
    void lightboxImg.offsetWidth; // trigger reflow
    lightboxImg.classList.add("fade-transition");

    lightboxFolder.textContent = CATEGORY_DISPLAY_NAMES[file.folder] || file.folder;


    // Likes count state
    const likesCount = likesCountMap[file.id] || 0;
    lightboxLikeCount.textContent = likesCount;
    if (likedImages.has(file.id)) {
      lightboxLikeBtn.classList.add("liked");
    } else {
      lightboxLikeBtn.classList.remove("liked");
    }

    // Preload next and previous images
    preloadAdjacentImages();
  }

  function navigateLightbox(direction) {
    if (direction === "next") {
      currentImageIndex = (currentImageIndex + 1) % activeMemoriesList.length;
    } else {
      currentImageIndex = (currentImageIndex - 1 + activeMemoriesList.length) % activeMemoriesList.length;
    }
    updateLightboxContent();
  }

  // --- Autoplay Slideshow System ---
  function toggleSlideshow() {
    if (slideshowIntervalId) {
      stopSlideshow();
    } else {
      startSlideshow();
    }
  }

  function startSlideshow() {
    slideshowIntervalId = setInterval(() => {
      navigateLightbox("next");
    }, 3000);
    lightboxAutoplay.classList.add("active");
    lightboxAutoplay.innerHTML = `<span class="play-icon">⏸</span> Pause`;
  }

  function stopSlideshow() {
    if (slideshowIntervalId) {
      clearInterval(slideshowIntervalId);
      slideshowIntervalId = null;
    }
    lightboxAutoplay.classList.remove("active");
    lightboxAutoplay.innerHTML = `<span class="play-icon">▶</span> Slideshow`;
  }

  // --- Guestbook Wishes Rendering & Storage ---
  function renderWishes() {
    wishesContainer.innerHTML = "";
    
    // Sort wishes by timestamp descending
    const sortedWishes = [...guestbookWishes].sort((a, b) => b.timestamp - a.timestamp);

    sortedWishes.forEach(wish => {
      const card = document.createElement("div");
      card.className = "wish-card";
      
      const dateString = new Date(wish.timestamp).toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric' 
      });

      card.innerHTML = `
        <p class="wish-text">"${wish.text}"</p>
        <div class="wish-meta">
          <span class="wish-author">— ${wish.author}</span>
          <span class="wish-date">${dateString}</span>
          ${wish.id.startsWith("def-") ? '' : `<button class="wish-delete-btn" data-id="${wish.id}" aria-label="Delete wish">✕ Remove</button>`}
        </div>
      `;

      // Wire up deletion for user-created wishes
      const deleteBtn = card.querySelector(".wish-delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
          deleteWish(wish.id);
        });
      }

      wishesContainer.appendChild(card);
    });
  }

  function addWish(text, author) {
    const newWish = {
      id: "wish-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      author: author.trim(),
      text: text.trim(),
      timestamp: Date.now()
    };

    guestbookWishes.push(newWish);
    localStorage.setItem(WISHES_STORAGE_KEY, JSON.stringify(guestbookWishes));
    renderWishes();
    
    // Save to cloud
    saveWishesToCloud();
  }

  function deleteWish(id) {
    guestbookWishes = guestbookWishes.filter(w => w.id !== id);
    localStorage.setItem(WISHES_STORAGE_KEY, JSON.stringify(guestbookWishes));
    renderWishes();
    
    // Save to cloud
    saveWishesToCloud();
    
    if (useFirebase && db) {
      db.collection("wishes").doc(id).delete().catch(e => {
        console.error("Failed to delete wish from Firebase:", e);
      });
    }
  }

  // --- Event Listeners Mapping ---
  function setupEventListeners() {
    // Section Tab Switching
    const tabBtnMemories = document.getElementById("tab-btn-memories");
    const tabBtnWishes = document.getElementById("tab-btn-wishes");
    const tabBtnWordle = document.getElementById("tab-btn-wordle");
    
    const memoriesSection = document.getElementById("memories-section");
    const wishesSection = document.getElementById("wishes-section");
    const wordleSection = document.getElementById("wordle-section");

    function selectTab(activeTabBtn, activeSection) {
      [tabBtnMemories, tabBtnWishes, tabBtnWordle].forEach(btn => {
        if (btn) {
          btn.classList.remove("active");
          btn.setAttribute("aria-selected", "false");
        }
      });
      [memoriesSection, wishesSection, wordleSection].forEach(section => {
        if (section) {
          section.classList.add("hidden");
        }
      });
      activeTabBtn.classList.add("active");
      activeTabBtn.setAttribute("aria-selected", "true");
      activeSection.classList.remove("hidden");
    }

    tabBtnMemories.addEventListener("click", () => {
      selectTab(tabBtnMemories, memoriesSection);
    });

    tabBtnWishes.addEventListener("click", () => {
      selectTab(tabBtnWishes, wishesSection);
    });

    tabBtnWordle.addEventListener("click", () => {
      selectTab(tabBtnWordle, wordleSection);
      if (!wordleTargetWord) {
        initWordleGame();
      }
    });

    // Lightbox Controls
    lightboxClose.addEventListener("click", closeLightbox);
    lightboxPrev.addEventListener("click", () => navigateLightbox("prev"));
    lightboxNext.addEventListener("click", () => navigateLightbox("next"));
    lightboxAutoplay.addEventListener("click", toggleSlideshow);
    
    lightboxLikeBtn.addEventListener("click", () => {
      const currentFile = activeMemoriesList[currentImageIndex];
      if (currentFile) {
        // Find corresponding element in the gallery grid and toggle
        const gridLikesBtn = document.querySelector(`.card-likes[data-id="${currentFile.id}"]`);
        toggleLike(currentFile.id, lightboxLikeBtn);
        if (gridLikesBtn) {
          const currentCount = likesCountMap[currentFile.id] || 0;
          gridLikesBtn.querySelector(".like-count-num").textContent = currentCount;
          if (likedImages.has(currentFile.id)) {
            gridLikesBtn.classList.add("liked");
          } else {
            gridLikesBtn.classList.remove("liked");
          }
        }
      }
    });

    // Close lightbox on click outside the content container
    lightbox.addEventListener("click", (e) => {
      const dialogDimensions = lightbox.getBoundingClientRect();
      if (
        e.clientX < dialogDimensions.left ||
        e.clientX > dialogDimensions.right ||
        e.clientY < dialogDimensions.top ||
        e.clientY > dialogDimensions.bottom
      ) {
        closeLightbox();
      }
    });

    // Keyboard support for Lightbox
    window.addEventListener("keydown", (e) => {
      if (!lightbox.open) return;
      if (e.key === "ArrowRight") {
        stopSlideshow();
        navigateLightbox("next");
      } else if (e.key === "ArrowLeft") {
        stopSlideshow();
        navigateLightbox("prev");
      } else if (e.key === "Escape") {
        closeLightbox();
      }
    });

    // Guestbook form submission
    wishForm.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const text = wishText.value;
      const author = wishName.value;
      
      if (text.trim() && author.trim()) {
        addWish(text, author);
        wishText.value = "";
        wishName.value = "";
        
        // Scroll smoothly to the top of the wishes container to see the newly pinned wish
        wishesContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // --- Wordle Game Engine Implementation ---
  const wordleGrid = document.getElementById("wordle-grid");
  const wordleKeyboard = document.getElementById("wordle-keyboard");
  const wordleMessageBox = document.getElementById("wordle-message-box");
  const wordleStatusText = document.getElementById("wordle-status-text");
  const wordleResetBtn = document.getElementById("wordle-reset-btn");

  function initWordleGame() {
    if (wordlePlayedWords.size >= WORDLE_WORDS.length) {
      wordlePlayedWords.clear();
    }
    const availableWords = WORDLE_WORDS.filter(w => !wordlePlayedWords.has(w));
    wordleTargetWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    
    wordleGuesses = [];
    wordleCurrentGuess = "";
    wordleGameOver = false;
    if (wordleMessageBox) wordleMessageBox.classList.add("hidden");

    renderWordleGrid();
    renderWordleKeyboard();
  }

  function renderWordleGrid() {
    if (!wordleGrid) return;
    wordleGrid.innerHTML = "";

    for (let r = 0; r < 6; r++) {
      const rowDiv = document.createElement("div");
      rowDiv.className = "wordle-row";
      rowDiv.setAttribute("role", "row");

      const guess = wordleGuesses[r] || "";
      for (let c = 0; c < 5; c++) {
        const tile = document.createElement("div");
        tile.className = "wordle-tile";
        tile.setAttribute("role", "gridcell");

        let letter = "";
        if (r < wordleGuesses.length) {
          letter = guess[c] || "";
        } else if (r === wordleGuesses.length) {
          letter = wordleCurrentGuess[c] || "";
          if (letter) {
            tile.classList.add("pop");
          }
        }

        tile.textContent = letter;

        if (r < wordleGuesses.length) {
          const resultClass = getTileResultClass(letter, c, wordleTargetWord);
          tile.classList.add(resultClass);
          tile.classList.add("flip");
          tile.style.animationDelay = `${c * 100}ms`;
        }

        rowDiv.appendChild(tile);
      }
      wordleGrid.appendChild(rowDiv);
    }
  }

  function getTileResultClass(letter, index, target) {
    if (target[index] === letter) {
      return "correct";
    }
    if (target.includes(letter)) {
      return "present";
    }
    return "absent";
  }

  const KEYBOARD_LAYOUT = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["enter", "z", "x", "c", "v", "b", "n", "m", "backspace"]
  ];

  function renderWordleKeyboard() {
    if (!wordleKeyboard) return;
    wordleKeyboard.innerHTML = "";

    const keyStates = {};
    for (let r = 0; r < wordleGuesses.length; r++) {
      const guess = wordleGuesses[r];
      for (let c = 0; c < 5; c++) {
        const char = guess[c];
        const state = getTileResultClass(char, c, wordleTargetWord);
        if (state === "correct") {
          keyStates[char] = "correct";
        } else if (state === "present" && keyStates[char] !== "correct") {
          keyStates[char] = "present";
        } else if (state === "absent" && !keyStates[char]) {
          keyStates[char] = "absent";
        }
      }
    }

    KEYBOARD_LAYOUT.forEach(rowKeys => {
      const rowDiv = document.createElement("div");
      rowDiv.className = "keyboard-row";

      rowKeys.forEach(keyText => {
        const btn = document.createElement("button");
        btn.className = "key";
        btn.textContent = keyText === "backspace" ? "⌫" : keyText;
        
        if (keyText === "enter" || keyText === "backspace") {
          btn.classList.add("wide-key");
        }

        const charState = keyStates[keyText.toUpperCase()];
        if (charState) {
          btn.classList.add(charState);
        }

        btn.addEventListener("click", () => {
          handleWordleInput(keyText);
        });

        rowDiv.appendChild(btn);
      });
      wordleKeyboard.appendChild(rowDiv);
    });
  }

  function handleWordleInput(key) {
    if (wordleGameOver) return;

    const lowerKey = key.toLowerCase();

    if (lowerKey === "backspace" || lowerKey === "back" || lowerKey === "⌫") {
      wordleCurrentGuess = wordleCurrentGuess.slice(0, -1);
      renderWordleGrid();
    } else if (lowerKey === "enter") {
      submitWordleGuess();
    } else if (/^[a-z]$/.test(lowerKey)) {
      if (wordleCurrentGuess.length < 5) {
        wordleCurrentGuess += lowerKey.toUpperCase();
        renderWordleGrid();
      }
    }
  }

  function submitWordleGuess() {
    if (wordleCurrentGuess.length < 5) {
      alert("Word must be 5 letters!");
      return;
    }

    wordleGuesses.push(wordleCurrentGuess);
    const lastGuess = wordleCurrentGuess;
    wordleCurrentGuess = "";

    renderWordleGrid();
    renderWordleKeyboard();

    setTimeout(() => {
      if (lastGuess === wordleTargetWord) {
        wordleGameOver = true;
        wordlePlayedWords.add(wordleTargetWord);
        const hint = WORDLE_HINTS[wordleTargetWord] || "";
        if (wordleStatusText) {
          wordleStatusText.innerHTML = `🎉 Beautifully done! You solved it!<br><br><strong>"${wordleTargetWord}"</strong><br><span style="font-size: 0.95rem; font-style: italic; opacity: 0.9;">${hint}</span>`;
        }
        if (wordleMessageBox) wordleMessageBox.classList.remove("hidden");
      } else if (wordleGuesses.length >= 6) {
        wordleGameOver = true;
        if (wordleStatusText) {
          wordleStatusText.innerHTML = `Nice try! The word was <strong>"${wordleTargetWord}"</strong>.<br>Let's play another one!`;
        }
        if (wordleMessageBox) wordleMessageBox.classList.remove("hidden");
      }
    }, 600);
  }

  // Hook up physical keyboard triggers
  window.addEventListener("keydown", (e) => {
    const wordleSection = document.getElementById("wordle-section");
    if (wordleSection && !wordleSection.classList.contains("hidden")) {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
        return;
      }
      
      if (e.key === "Backspace") {
        handleWordleInput("backspace");
      } else if (e.key === "Enter") {
        handleWordleInput("enter");
      } else {
        handleWordleInput(e.key);
      }
    }
  });

  if (wordleResetBtn) {
    wordleResetBtn.addEventListener("click", initWordleGame);
  }

  // Start the application
  init();
});
