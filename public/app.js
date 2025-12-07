/**
 * Project KJV - Client JavaScript
 * Robust bidirectional infinite scroll Bible reader
 */

(function () {
  'use strict';

  // ============ State ============
  const state = {
    toc: null,
    totalChapters: 0,
    // Track loaded chapter indices
    loadedIndices: new Set(),
    minLoaded: Infinity,
    maxLoaded: -1,
    // Loading state
    isLoadingForward: false,
    isLoadingBackward: false,
    // Current position
    currentChapter: null,
    // UI state
    sidebarOpen: false,
    expandedBook: null,
  };

  // ============ DOM ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    sidebar: $('#sidebar'),
    menuBtn: $('#menu-btn'),
    themeBtn: $('#theme-btn'),
    overlay: $('#overlay'),
    otBooks: $('#ot-books'),
    ntBooks: $('#nt-books'),
    bibleScroll: $('#bible-scroll'),
    scrollContent: $('#scroll-content'),
    currentLocation: $('#current-location'),
    selectionMenu: $('#selection-menu'),
    copyBtn: $('#copy-btn'),
    toast: $('#toast'),
  };

  // ============ Config ============
  const CONFIG = {
    LOAD_THRESHOLD: 800,      // px from edge to trigger load
    CHAPTERS_PER_LOAD: 4,     // chapters to load at once
    INITIAL_LOAD: 5,          // chapters on initial load
    SCROLL_DEBOUNCE: 16,      // ms debounce for scroll
  };

  // ============ API ============
  async function fetchToc() {
    const res = await fetch('/api/toc');
    return res.json();
  }

  async function fetchChapters(start, count) {
    const res = await fetch(`/api/chapters?start=${start}&count=${count}`);
    return res.json();
  }

  async function findChapter(book, chapter) {
    const res = await fetch(`/api/find?book=${encodeURIComponent(book)}&chapter=${chapter}`);
    return res.json();
  }

  // ============ Theme ============
  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (_) {}
  }

  // ============ Sidebar ============
  function openSidebar() {
    state.sidebarOpen = true;
    els.sidebar.classList.add('open');
    els.overlay.classList.add('visible');
  }

  function closeSidebar() {
    state.sidebarOpen = false;
    els.sidebar.classList.remove('open');
    els.overlay.classList.remove('visible');
  }

  // ============ Chapter Rendering ============
  function createChapterElement(chapter) {
    const div = document.createElement('div');
    div.className = 'chapter';
    div.dataset.index = chapter.globalIndex;
    div.dataset.book = chapter.bookName;
    div.dataset.chapter = chapter.chapterNumber;

    let html = '';

    // Testament divider for Matthew 1
    if (chapter.testament === 'nt' && chapter.bookName === 'Matthew' && chapter.chapterNumber === 1) {
      html += `<div class="testament-divider"><span>New Testament</span></div>`;
    }

    html += `
      <div class="chapter-header">
        <h2 class="chapter-book">${chapter.bookName}</h2>
        <div class="chapter-num">Chapter ${chapter.chapterNumber}</div>
      </div>
      <div class="verses">
        ${chapter.verses.map(v => `
          <div class="verse" data-verse="${v.number}">
            <span class="verse-number">${v.number}</span>
            <span class="verse-text">${v.text}</span>
          </div>
        `).join('')}
      </div>
    `;

    div.innerHTML = html;
    return div;
  }

  // ============ Core Loading Functions ============
  
  /**
   * Load chapters forward (append to bottom)
   */
  async function loadForward() {
    if (state.isLoadingForward) return;
    if (state.maxLoaded >= state.totalChapters - 1) return;

    state.isLoadingForward = true;

    try {
      const startIndex = state.maxLoaded + 1;
      const data = await fetchChapters(startIndex, CONFIG.CHAPTERS_PER_LOAD);

      data.chapters.forEach(chapter => {
        if (state.loadedIndices.has(chapter.globalIndex)) return;

        const el = createChapterElement(chapter);
        els.scrollContent.appendChild(el);

        state.loadedIndices.add(chapter.globalIndex);
        state.maxLoaded = Math.max(state.maxLoaded, chapter.globalIndex);
        if (state.minLoaded === Infinity) {
          state.minLoaded = chapter.globalIndex;
        }
      });
    } catch (err) {
      console.error('Error loading forward:', err);
    } finally {
      state.isLoadingForward = false;
    }
  }

  /**
   * Load chapters backward (prepend to top)
   * This is the tricky part - we need to preserve scroll position
   */
  async function loadBackward() {
    if (state.isLoadingBackward) return;
    if (state.minLoaded <= 0) return;

    state.isLoadingBackward = true;

    try {
      const endIndex = state.minLoaded - 1;
      const startIndex = Math.max(0, endIndex - CONFIG.CHAPTERS_PER_LOAD + 1);
      const count = endIndex - startIndex + 1;

      if (count <= 0) {
        state.isLoadingBackward = false;
        return;
      }

      // Record scroll position relative to first visible element
      const scrollContainer = els.bibleScroll;
      const firstChapter = els.scrollContent.firstElementChild;
      const scrollTopBefore = scrollContainer.scrollTop;
      const firstChapterTopBefore = firstChapter ? firstChapter.offsetTop : 0;

      const data = await fetchChapters(startIndex, count);

      // Sort chapters in reverse order for prepending
      const chaptersToAdd = data.chapters
        .filter(ch => !state.loadedIndices.has(ch.globalIndex))
        .sort((a, b) => b.globalIndex - a.globalIndex);

      // Create a document fragment for batch insertion
      const fragment = document.createDocumentFragment();
      const elements = [];

      chaptersToAdd.forEach(chapter => {
        const el = createChapterElement(chapter);
        elements.unshift(el); // Reverse to maintain order
        state.loadedIndices.add(chapter.globalIndex);
        state.minLoaded = Math.min(state.minLoaded, chapter.globalIndex);
      });

      // Add elements to fragment in correct order
      elements.forEach(el => fragment.appendChild(el));

      // Prepend all at once
      els.scrollContent.insertBefore(fragment, els.scrollContent.firstChild);

      // Restore scroll position
      // The content above has grown, so we need to adjust
      if (firstChapter) {
        const firstChapterTopAfter = firstChapter.offsetTop;
        const heightAdded = firstChapterTopAfter - firstChapterTopBefore;
        scrollContainer.scrollTop = scrollTopBefore + heightAdded;
      }
    } catch (err) {
      console.error('Error loading backward:', err);
    } finally {
      state.isLoadingBackward = false;
    }
  }

  /**
   * Initial load around a specific index
   */
  async function loadAround(centerIndex) {
    // Clear existing content
    els.scrollContent.innerHTML = '';
    state.loadedIndices.clear();
    state.minLoaded = Infinity;
    state.maxLoaded = -1;

    // Calculate range to load
    const halfLoad = Math.floor(CONFIG.INITIAL_LOAD / 2);
    const startIndex = Math.max(0, centerIndex - halfLoad);
    const endIndex = Math.min(state.totalChapters - 1, startIndex + CONFIG.INITIAL_LOAD - 1);
    const count = endIndex - startIndex + 1;

    try {
      const data = await fetchChapters(startIndex, count);

      data.chapters.forEach(chapter => {
        const el = createChapterElement(chapter);
        els.scrollContent.appendChild(el);

        state.loadedIndices.add(chapter.globalIndex);
        state.minLoaded = Math.min(state.minLoaded, chapter.globalIndex);
        state.maxLoaded = Math.max(state.maxLoaded, chapter.globalIndex);
      });

      return true;
    } catch (err) {
      console.error('Error loading initial chapters:', err);
      return false;
    }
  }

  // ============ Scroll Handling ============
  function checkScrollPosition() {
    const container = els.bibleScroll;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Distance from top
    const distanceFromTop = scrollTop;
    // Distance from bottom
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Load backward if near top
    if (distanceFromTop < CONFIG.LOAD_THRESHOLD && !state.isLoadingBackward) {
      loadBackward();
    }

    // Load forward if near bottom
    if (distanceFromBottom < CONFIG.LOAD_THRESHOLD && !state.isLoadingForward) {
      loadForward();
    }

    // Update current chapter display
    updateCurrentChapter();
  }

  function updateCurrentChapter() {
    const container = els.bibleScroll;
    const containerRect = container.getBoundingClientRect();
    const chapters = $$('.chapter');

    let visibleChapter = null;

    for (const ch of chapters) {
      const rect = ch.getBoundingClientRect();
      // Check if chapter header is visible or chapter takes up most of viewport
      if (rect.top <= containerRect.top + 150 && rect.bottom > containerRect.top + 100) {
        visibleChapter = ch;
      }
    }

    // Fallback to first visible
    if (!visibleChapter) {
      for (const ch of chapters) {
        const rect = ch.getBoundingClientRect();
        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          visibleChapter = ch;
          break;
        }
      }
    }

    if (visibleChapter) {
      const book = visibleChapter.dataset.book;
      const chapter = parseInt(visibleChapter.dataset.chapter);
      const index = parseInt(visibleChapter.dataset.index);

      if (!state.currentChapter || state.currentChapter.index !== index) {
        state.currentChapter = { book, chapter, index };
        els.currentLocation.textContent = `${book} ${chapter}`;
        updateActiveChapter(book, chapter);
      }
    }
  }

  // Throttled scroll handler using requestAnimationFrame
  let scrollTicking = false;
  function handleScroll() {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        checkScrollPosition();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }

  // ============ Navigation ============
  async function navigateToChapter(bookName, chapterNum) {
    try {
      const data = await findChapter(bookName, chapterNum);
      if (data.error) {
        console.error('Chapter not found');
        return;
      }

      const targetIndex = data.globalIndex;

      // Load chapters around target
      const loaded = await loadAround(targetIndex);
      if (!loaded) return;

      // Find and scroll to the target chapter
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        const container = els.bibleScroll;
        
        // If it's the first chapter, just scroll to absolute top
        if (targetIndex === 0) {
          container.scrollTop = 0;
        } else {
          const targetEl = $(`.chapter[data-index="${targetIndex}"]`);
          if (targetEl) {
            // Scroll the chapter to the top of the scroll container
            // Subtract padding to maintain consistent spacing above the chapter header
            // This matches the top padding of .scroll-content (40px desktop, 32px tablet, 24px mobile)
            const containerRect = container.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const topPadding = parseInt(getComputedStyle(els.scrollContent).paddingTop, 10);
            const offset = targetRect.top - containerRect.top + container.scrollTop - topPadding;

            container.scrollTop = offset;
          }
        }

        // Update state
        state.currentChapter = { book: bookName, chapter: chapterNum, index: targetIndex };
        els.currentLocation.textContent = `${bookName} ${chapterNum}`;
        updateActiveChapter(bookName, chapterNum);
        updateUrl(bookName, chapterNum);

        // Trigger a check to potentially load more chapters
        setTimeout(checkScrollPosition, 100);
      }, 50);
    } catch (err) {
      console.error('Navigation error:', err);
    }
  }

  function updateUrl(bookName, chapterNum) {
    const url = new URL(window.location);
    url.searchParams.set('book', bookName);
    url.searchParams.set('chapter', chapterNum);
    window.history.replaceState({}, '', url);
  }

  function updateActiveChapter(bookName, chapterNum) {
    $$('.chapter-btn.active').forEach(btn => btn.classList.remove('active'));

    const bookItem = $(`.book-item[data-book="${bookName}"]`);
    if (bookItem) {
      const btn = bookItem.querySelector(`.chapter-btn[data-chapter="${chapterNum}"]`);
      if (btn) btn.classList.add('active');
    }
  }

  // ============ Navigation Sidebar ============
  function renderBook(book) {
    const div = document.createElement('div');
    div.className = 'book-item';
    div.dataset.book = book.name;

    let chaptersHtml = '';
    for (let i = 1; i <= book.chapters; i++) {
      chaptersHtml += `<button class="chapter-btn" data-chapter="${i}">${i}</button>`;
    }

    div.innerHTML = `
      <div class="book-header" tabindex="0" role="button" aria-expanded="false">
        <span class="book-name">${book.name}</span>
        <svg class="book-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="chapters-grid">${chaptersHtml}</div>
    `;

    const header = div.querySelector('.book-header');
    const chaptersGrid = div.querySelector('.chapters-grid');

    header.addEventListener('click', () => {
      const wasExpanded = div.classList.contains('expanded');

      $$('.book-item.expanded').forEach(b => {
        if (b !== div) {
          b.classList.remove('expanded');
          b.querySelector('.book-header').setAttribute('aria-expanded', 'false');
        }
      });

      div.classList.toggle('expanded', !wasExpanded);
      header.setAttribute('aria-expanded', String(!wasExpanded));
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });

    chaptersGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.chapter-btn');
      if (!btn) return;

      navigateToChapter(book.name, parseInt(btn.dataset.chapter));
      if (window.innerWidth <= 900) closeSidebar();
    });

    return div;
  }

  function renderNavigation() {
    if (!state.toc) return;

    els.otBooks.innerHTML = '';
    els.ntBooks.innerHTML = '';

    state.toc.ot.forEach(book => els.otBooks.appendChild(renderBook(book)));
    state.toc.nt.forEach(book => els.ntBooks.appendChild(renderBook(book)));
  }

  // ============ Selection & Copy ============
  function getSelectionInfo() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    // Get the actual selected text
    const selectedText = selection.toString().trim();
    if (!selectedText) return null;

    const range = selection.getRangeAt(0);
    const verses = [];

    // Find all verses that intersect with the selection
    $$('.verse').forEach(verse => {
      if (range.intersectsNode(verse)) {
        const chapter = verse.closest('.chapter');
        const verseTextEl = verse.querySelector('.verse-text');
        
        verses.push({
          book: chapter.dataset.book,
          chapter: parseInt(chapter.dataset.chapter),
          verse: parseInt(verse.dataset.verse),
          element: verse,
          textElement: verseTextEl,
        });
      }
    });

    if (verses.length === 0) return null;

    return {
      selectedText,
      verses,
      range,
    };
  }

  function formatReference(verses) {
    if (!verses || verses.length === 0) return '';

    const first = verses[0];
    const last = verses[verses.length - 1];

    if (verses.length === 1) {
      return `${first.book} ${first.chapter}:${first.verse}`;
    } else if (first.book === last.book && first.chapter === last.chapter) {
      return `${first.book} ${first.chapter}:${first.verse}-${last.verse}`;
    } else {
      return `${first.book} ${first.chapter}:${first.verse} - ${last.book} ${last.chapter}:${last.verse}`;
    }
  }

  function formatCopyText(selectionInfo) {
    if (!selectionInfo) return null;

    const reference = formatReference(selectionInfo.verses);
    const text = selectionInfo.selectedText;

    return `${reference}\n"${text}"`;
  }

  function showSelectionMenu(x, y) {
    // Adjust position to stay in viewport
    const menuWidth = 90;
    const menuHeight = 40;

    x = Math.max(10, Math.min(x - menuWidth / 2, window.innerWidth - menuWidth - 10));
    y = Math.max(10, y - menuHeight - 10);

    els.selectionMenu.style.left = `${x}px`;
    els.selectionMenu.style.top = `${y}px`;
    els.selectionMenu.classList.add('visible');
  }

  function hideSelectionMenu() {
    els.selectionMenu.classList.remove('visible');
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    setTimeout(() => els.toast.classList.remove('visible'), 2000);
  }

  async function copySelection() {
    const selectionInfo = getSelectionInfo();
    if (!selectionInfo) return;

    const text = formatCopyText(selectionInfo);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard');
    } catch (err) {
      console.error('Copy failed:', err);
      showToast('Failed to copy');
    }

    hideSelectionMenu();
    window.getSelection().removeAllRanges();
  }

  function handleSelectionChange() {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      hideSelectionMenu();
      return;
    }

    // Check if selection is in bible content
    if (!els.scrollContent.contains(selection.anchorNode) ||
        !els.scrollContent.contains(selection.focusNode)) {
      hideSelectionMenu();
      return;
    }

    // Make sure we have valid verse selection
    const selectionInfo = getSelectionInfo();
    if (!selectionInfo) {
      hideSelectionMenu();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    showSelectionMenu(rect.left + rect.width / 2, rect.top);
  }

  // ============ Event Listeners ============
  function setupEventListeners() {
    els.themeBtn.addEventListener('click', toggleTheme);
    els.menuBtn.addEventListener('click', () => state.sidebarOpen ? closeSidebar() : openSidebar());
    els.overlay.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSidebar();
        hideSelectionMenu();
      }
    });

    els.bibleScroll.addEventListener('scroll', handleScroll, { passive: true });

    document.addEventListener('selectionchange', handleSelectionChange);
    els.copyBtn.addEventListener('click', copySelection);

    document.addEventListener('mousedown', (e) => {
      if (!els.selectionMenu.contains(e.target)) {
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed) {
            hideSelectionMenu();
          }
        }, 10);
      }
    });

    window.addEventListener('popstate', () => {
      const initial = getInitialChapter();
      if (initial) navigateToChapter(initial.book, initial.chapter);
    });
  }

  // ============ Init ============
  function getInitialChapter() {
    const params = new URLSearchParams(window.location.search);
    const book = params.get('book');
    const chapter = params.get('chapter') || '1';
    return book ? { book, chapter: parseInt(chapter) } : null;
  }

  async function init() {
    try {
      state.toc = await fetchToc();
      state.totalChapters = state.toc.totalChapters;

      renderNavigation();
      setupEventListeners();

      const initial = getInitialChapter();
      await navigateToChapter(
        initial?.book || 'Genesis',
        initial?.chapter || 1
      );
    } catch (err) {
      console.error('Init error:', err);
      els.scrollContent.innerHTML = `
        <div class="loading">Failed to load. Please refresh the page.</div>
      `;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
