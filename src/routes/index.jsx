import { createSignal, For, onMount, onCleanup, Show, createEffect } from "solid-js";
import { getChapters, getBible } from "~/lib/bible";
import { getLLMResponse } from "~/lib/llm";

export default function Home() {
  const [chapters, setChapters] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [loadingPrev, setLoadingPrev] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [hasPrev, setHasPrev] = createSignal(false);
  const [nextBookIndex, setNextBookIndex] = createSignal(0);
  const [nextChapterIndex, setNextChapterIndex] = createSignal(0);
  const [prevBookIndex, setPrevBookIndex] = createSignal(0);
  const [prevChapterIndex, setPrevChapterIndex] = createSignal(0);
  const [darkMode, setDarkMode] = createSignal(
    typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark'
  );
  const [navOpen, setNavOpen] = createSignal(false);
  const [bibleStructure, setBibleStructure] = createSignal(null);
  const [selectedText, setSelectedText] = createSignal("");
  const [contextMenuOpen, setContextMenuOpen] = createSignal(false);
  const [contextMenuPosition, setContextMenuPosition] = createSignal({ x: 0, y: 0 });
  const [selectionData, setSelectionData] = createSignal(null);
  const [llmPanelOpen, setLlmPanelOpen] = createSignal(false);
  const [llmResponse, setLlmResponse] = createSignal("");
  const [llmLoading, setLlmLoading] = createSignal(false);
  
  let sentinelRef;
  let topSentinelRef;
  let observer;
  let topObserver;
  let isMouseDown = false;

  // Group chapters by book for better formatting
  const groupedChapters = () => {
    const chapters_array = chapters();
    const grouped = [];
    
    chapters_array.forEach(chapter => {
      const lastGroup = grouped[grouped.length - 1];
      if (lastGroup && lastGroup.bookName === chapter.bookName) {
        lastGroup.chapters.push(chapter);
      } else {
        grouped.push({
          bookName: chapter.bookName,
          bookIndex: chapter.bookIndex,
          chapters: [chapter]
        });
      }
    });
    
    return grouped;
  };

  const loadMore = async () => {
    if (loading() || !hasMore()) return;
    
    setLoading(true);
    try {
      const data = await getChapters(
        nextBookIndex(),
        nextChapterIndex(),
        3
      );
      
      setChapters(prev => [...prev, ...data.chapters]);
      setHasMore(data.hasMore);
      setNextBookIndex(data.nextBookIndex);
      setNextChapterIndex(data.nextChapterIndex);
    } catch (error) {
      console.error("Error loading chapters:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadPrevious = async () => {
    if (loadingPrev() || !hasPrev()) return;
    
    setLoadingPrev(true);
    const scrollHeight = document.documentElement.scrollHeight;
    
    try {
      const bible = await getBible();
      const allBooks = [...bible.ot, ...bible.nt];
      
      let targetBookIndex = prevBookIndex();
      let targetChapterIndex = prevChapterIndex() - 1;
      
      // Handle going to previous book
      if (targetChapterIndex < 0) {
        targetBookIndex--;
        if (targetBookIndex >= 0) {
          targetChapterIndex = allBooks[targetBookIndex].chapters.length - 1;
        }
      }
      
      if (targetBookIndex < 0) {
        setHasPrev(false);
        setLoadingPrev(false);
        return;
      }
      
      // Load 3 chapters backwards
      const chaptersToLoad = [];
      let loadCount = 0;
      let currentBookIdx = targetBookIndex;
      let currentChapterIdx = targetChapterIndex;
      
      while (loadCount < 3 && currentBookIdx >= 0) {
        if (currentChapterIdx >= 0 && currentChapterIdx < allBooks[currentBookIdx].chapters.length) {
          const book = allBooks[currentBookIdx];
          const chapter = book.chapters[currentChapterIdx];
          chaptersToLoad.unshift({
            bookName: book.name,
            bookIndex: currentBookIdx,
            chapterNumber: chapter.number,
            chapterIndex: currentChapterIdx,
            verses: chapter.verses
          });
          loadCount++;
          currentChapterIdx--;
        } else {
          currentBookIdx--;
          if (currentBookIdx >= 0) {
            currentChapterIdx = allBooks[currentBookIdx].chapters.length - 1;
          }
        }
      }
      
      if (chaptersToLoad.length > 0) {
        setChapters(prev => [...chaptersToLoad, ...prev]);
        
        // Update previous indices to the first chapter we just loaded
        const firstChapter = chaptersToLoad[0];
        setPrevBookIndex(firstChapter.bookIndex);
        setPrevChapterIndex(firstChapter.chapterIndex);
        setHasPrev(firstChapter.bookIndex > 0 || firstChapter.chapterIndex > 0);
      } else {
        setHasPrev(false);
      }
      
      // Maintain scroll position
      setTimeout(() => {
        const newScrollHeight = document.documentElement.scrollHeight;
        window.scrollTo(0, newScrollHeight - scrollHeight);
      }, 0);
    } catch (error) {
      console.error("Error loading previous chapters:", error);
    } finally {
      setLoadingPrev(false);
    }
  };

  const navigateToChapter = async (bookIndex, chapterIndex) => {
    setChapters([]);
    setLoading(false);
    setLoadingPrev(false);
    setNavOpen(false);
    
    try {
      const bible = await getBible();
      const allBooks = [...bible.ot, ...bible.nt];
      
      // Calculate where to start loading (2 chapters before target)
      let startBookIndex = bookIndex;
      let startChapterIndex = chapterIndex - 2;
      
      // Adjust if we're going into previous books
      while (startChapterIndex < 0 && startBookIndex > 0) {
        startBookIndex--;
        startChapterIndex = allBooks[startBookIndex].chapters.length + startChapterIndex;
      }
      
      // Don't go below book 0, chapter 0
      if (startChapterIndex < 0) {
        startChapterIndex = 0;
        startBookIndex = 0;
      }
      
      // Load 5 chapters starting from the calculated position
      const data = await getChapters(startBookIndex, startChapterIndex, 5);
      
      setChapters(data.chapters);
      
      // Set up forward loading (continues after the loaded chapters)
      setNextBookIndex(data.nextBookIndex);
      setNextChapterIndex(data.nextChapterIndex);
      setHasMore(data.hasMore);
      
      // Set up backward loading (starts from the first loaded chapter)
      if (data.chapters.length > 0) {
        const firstChapter = data.chapters[0];
        setPrevBookIndex(firstChapter.bookIndex);
        setPrevChapterIndex(firstChapter.chapterIndex);
        setHasPrev(firstChapter.bookIndex > 0 || firstChapter.chapterIndex > 0);
      }
      
      // Find and scroll to the target chapter
      setTimeout(() => {
        // Find the chapter element that matches our target
        const targetChapter = data.chapters.find(
          ch => ch.bookIndex === bookIndex && ch.chapterIndex === chapterIndex
        );
        
        if (targetChapter) {
          // Find the DOM element for this chapter
          const chapterElements = document.querySelectorAll('.chapter');
          for (let elem of chapterElements) {
            const chapterTitle = elem.querySelector('.chapter-number');
            if (chapterTitle && chapterTitle.textContent === `Chapter ${targetChapter.chapterNumber}`) {
              // Get the book section
              const bookSection = elem.closest('.book-section');
              const bookTitle = bookSection?.querySelector('.book-title');
              if (bookTitle && bookTitle.textContent === targetChapter.bookName) {
                // Scroll to this chapter with some offset for better visibility
                const yOffset = -20;
                const y = elem.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
                return;
              }
            }
          }
        }
        
        // Fallback: scroll to top if we can't find the exact chapter
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 100);
    } catch (error) {
      console.error("Error navigating to chapter:", error);
    }
  };

  // Extract verse information from selected text
  const extractVerseReference = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Find all verse elements within the selection
    let element = container.nodeType === 3 ? container.parentElement : container;
    const selectedVerses = new Set();
    let bookName = "";
    let chapterNumber = "";

    // Traverse up to find the book and chapter
    let current = element;
    while (current && !current.classList?.contains('book-section')) {
      current = current.parentElement;
    }
    
    if (current) {
      const bookTitle = current.querySelector('.book-title');
      if (bookTitle) bookName = bookTitle.textContent;
      
      // Find chapter for starting verse
      let chapterElem = element;
      while (chapterElem && !chapterElem.classList?.contains('chapter')) {
        chapterElem = chapterElem.parentElement;
      }
      if (chapterElem) {
        const chapterTitle = chapterElem.querySelector('.chapter-number');
        if (chapterTitle) {
          chapterNumber = chapterTitle.textContent.replace('Chapter ', '');
        }
      }
    }

    // Find all verse elements in selection
    const verseElements = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer.nodeType === 3 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.classList?.contains('verse')) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      if (range.intersectsNode(node)) {
        verseElements.push(node);
      }
    }

    // Also check parent verse elements
    let parent = element;
    while (parent) {
      if (parent.classList?.contains('verse') && range.intersectsNode(parent)) {
        if (!verseElements.includes(parent)) {
          verseElements.push(parent);
        }
      }
      parent = parent.parentElement;
    }

    // Extract verse numbers and organize by book/chapter
    const versesByLocation = {};
    
    verseElements.forEach(verseElem => {
      const verseNumElem = verseElem.querySelector('.verse-number');
      if (verseNumElem) {
        const verseNum = verseNumElem.textContent.trim();
        
        // Find book and chapter for this verse
        let chapterElem = verseElem.closest('.chapter');
        let bookElem = verseElem.closest('.book-section');
        
        if (bookElem && chapterElem) {
          const book = bookElem.querySelector('.book-title')?.textContent || '';
          const chapter = chapterElem.querySelector('.chapter-number')?.textContent.replace('Chapter ', '') || '';
          
          const key = `${book}:${chapter}`;
          if (!versesByLocation[key]) {
            versesByLocation[key] = { book, chapter, verses: [] };
          }
          versesByLocation[key].verses.push(parseInt(verseNum));
        }
      }
    });

    return versesByLocation;
  };

  const formatVerseReference = (versesByLocation) => {
    if (!versesByLocation || Object.keys(versesByLocation).length === 0) {
      return "";
    }

    const locations = Object.values(versesByLocation);
    
    if (locations.length === 1) {
      // Single chapter
      const loc = locations[0];
      const verses = loc.verses.sort((a, b) => a - b);
      if (verses.length === 1) {
        return `${loc.book} ${loc.chapter}:${verses[0]}`;
      } else {
        const ranges = [];
        let start = verses[0];
        let end = verses[0];
        
        for (let i = 1; i < verses.length; i++) {
          if (verses[i] === end + 1) {
            end = verses[i];
          } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = end = verses[i];
          }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        
        return `${loc.book} ${loc.chapter}:${ranges.join(', ')}`;
      }
    } else {
      // Multiple chapters or books
      return locations.map(loc => {
        const verses = loc.verses.sort((a, b) => a - b);
        if (verses.length === 1) {
          return `${loc.book} ${loc.chapter}:${verses[0]}`;
        } else {
          const ranges = [];
          let start = verses[0];
          let end = verses[0];
          
          for (let i = 1; i < verses.length; i++) {
            if (verses[i] === end + 1) {
              end = verses[i];
            } else {
              ranges.push(start === end ? `${start}` : `${start}-${end}`);
              start = end = verses[i];
            }
          }
          ranges.push(start === end ? `${start}` : `${start}-${end}`);
          
          return `${loc.book} ${loc.chapter}:${ranges.join(', ')}`;
        }
      }).join('; ');
    }
  };

  const handleTextSelection = (event) => {
    // Don't show context menu for Ctrl/Shift selections, but close any existing menu
    if (event && (event.ctrlKey || event.shiftKey || event.metaKey)) {
      setContextMenuOpen(false);
      return;
    }

    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0) {
      // Check if selection is within Bible content
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      let element = container.nodeType === 3 ? container.parentElement : container;
      
      // Traverse up to check if we're inside bible-content
      let isInBibleContent = false;
      let current = element;
      while (current) {
        if (current.classList?.contains('bible-content')) {
          isInBibleContent = true;
          break;
        }
        if (current.classList?.contains('nav-drawer') || 
            current.classList?.contains('llm-panel') ||
            current.classList?.contains('fixed-controls')) {
          // Explicitly not in Bible content
          break;
        }
        current = current.parentElement;
      }
      
      if (!isInBibleContent) {
        setContextMenuOpen(false);
        return;
      }
      
      const verseData = extractVerseReference();
      setSelectedText(text);
      setSelectionData(verseData);
      
      // Position context menu at the end of the selection
      const rects = range.getClientRects();
      const lastRect = rects[rects.length - 1] || range.getBoundingClientRect();
      
      setContextMenuPosition({
        x: lastRect.right,
        y: lastRect.bottom + window.scrollY + 8
      });
      setContextMenuOpen(true);
    } else {
      setSelectedText("");
      setSelectionData(null);
      setContextMenuOpen(false);
    }
  };

  const handleCopy = async () => {
    const reference = formatVerseReference(selectionData());
    
    // Get clean text without verse numbers
    const selection = window.getSelection();
    let cleanText = "";
    
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.cloneContents();
      
      // Remove all verse number elements
      const verseNumbers = container.querySelectorAll('.verse-number');
      verseNumbers.forEach(num => num.remove());
      
      // Process each verse paragraph to maintain spacing
      const verses = container.querySelectorAll('.verse');
      if (verses.length > 0) {
        const verseTexts = Array.from(verses).map(v => 
          v.textContent.trim()
        ).filter(t => t.length > 0);
        cleanText = verseTexts.join(' ');
      } else {
        // Fallback if no verse elements found
        cleanText = container.textContent
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    const textToCopy = reference ? `${reference}\n"${cleanText}"` : `"${cleanText}"`;
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setContextMenuOpen(false);
      // Clear selection
      window.getSelection().removeAllRanges();
      setSelectedText("");
      setSelectionData(null);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleExplain = async () => {
    if (!selectedText()) return;
    
    setContextMenuOpen(false);
    setLlmPanelOpen(true);
    setLlmLoading(true);
    
    const reference = formatVerseReference(selectionData());
    const prompt = reference 
      ? `Regarding ${reference}: ${selectedText()}` 
      : selectedText();
    
    try {
      const response = await getLLMResponse(prompt);
      setLlmResponse(response.text);
    } catch (error) {
      console.error("Error fetching LLM response:", error);
      setLlmResponse("Sorry, there was an error processing your request.");
    } finally {
      setLlmLoading(false);
    }
  };

  // Apply theme immediately when darkMode changes
  createEffect(() => {
    if (darkMode()) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  });

  onMount(async () => {
    const bible = await getBible();
    setBibleStructure(bible);
    
    // Load initial chapters
    try {
      const initialData = await getChapters(0, 0, 5);
      setChapters(initialData.chapters);
      setNextBookIndex(initialData.nextBookIndex);
      setNextChapterIndex(initialData.nextChapterIndex);
      setHasMore(initialData.hasMore);
      setHasPrev(false);
    } catch (error) {
      console.error("Error loading initial chapters:", error);
    }
    
    // Set up intersection observer for infinite scroll down
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading() && hasMore()) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );
    
    // Set up intersection observer for infinite scroll up
    topObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingPrev() && hasPrev()) {
          loadPrevious();
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );
    
    if (sentinelRef) {
      observer.observe(sentinelRef);
    }
    
    if (topSentinelRef) {
      topObserver.observe(topSentinelRef);
    }
    
    // Add text selection listener (browser only)
    if (typeof document !== 'undefined') {
      // Track mouse state to avoid showing menu while dragging
      document.addEventListener('mousedown', () => {
        isMouseDown = true;
      });
      
      document.addEventListener('mouseup', (e) => {
        isMouseDown = false;
        handleTextSelection(e);
      });
      
      // Use selectionchange for better mobile support (only when not dragging)
      document.addEventListener('selectionchange', () => {
        // Only handle on mobile (when mouse is not being used for selection)
        if (!isMouseDown) {
          // Small delay to ensure selection is complete
          setTimeout(() => {
            const selection = window.getSelection();
            if (selection.toString().trim()) {
              handleTextSelection();
            }
          }, 100);
        }
      });
      
      // Close context menu when clicking elsewhere or selection is cleared
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.verse-text')) {
          setContextMenuOpen(false);
        }
      });
      
      // Also check on click to catch deselections
      document.addEventListener('click', () => {
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection.toString().trim()) {
            setContextMenuOpen(false);
            setSelectedText("");
            setSelectionData(null);
          }
        }, 10);
      });
    }
  });

  onCleanup(() => {
    if (observer && sentinelRef) {
      observer.unobserve(sentinelRef);
    }
    if (topObserver && topSentinelRef) {
      topObserver.unobserve(topSentinelRef);
    }
    // Remove event listeners (browser only)
    if (typeof document !== 'undefined') {
      document.removeEventListener('mouseup', handleTextSelection);
    }
  });

  const toggleTheme = () => {
    setDarkMode(!darkMode());
  };

  return (
    <main class="bible-container">
      {/* Fixed Controls */}
      <div class="fixed-controls">
        <button class="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            {darkMode() ? (
              // Sun icon for light mode
              <g>
                <circle cx="10" cy="10" r="4" fill="currentColor"/>
                <line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="10" y1="16" x2="10" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="18" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="4" y1="10" x2="2" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="15.5" y1="4.5" x2="14.1" y2="5.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="5.9" y1="14.1" x2="4.5" y2="15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="15.5" y1="15.5" x2="14.1" y2="14.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="5.9" y1="5.9" x2="4.5" y2="4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </g>
            ) : (
              // Moon icon for dark mode
              <path d="M17.39 15.14A7.33 7.33 0 0 1 11.75 1.6c.23-.11.56-.23.79-.34a8.19 8.19 0 0 0-5.41.45 9 9 0 1 0 7 16.58 8.42 8.42 0 0 0 4.29-3.84 5.3 5.3 0 0 1-1.03.69z" fill="black"/>
            )}
          </svg>
        </button>
        <button class="nav-toggle" onClick={() => setNavOpen(!navOpen())} aria-label="Toggle navigation">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            {navOpen() ? (
              // X icon
              <g>
                <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </g>
            ) : (
              // Menu icon
              <g>
                <line x1="3" y1="5" x2="17" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </g>
            )}
          </svg>
        </button>
      </div>

      {/* Context Menu for Selection */}
      <Show when={contextMenuOpen()}>
        <div 
          class="context-menu" 
          style={{
            left: `${contextMenuPosition().x}px`,
            top: `${contextMenuPosition().y}px`
          }}
        >
          <button class="context-menu-item" onClick={handleCopy}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
              <path d="M3 3h10v2H5v8H3V3z" fill="currentColor"/>
            </svg>
            Copy
          </button>
          <button class="context-menu-item" onClick={handleExplain}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
              <text x="10" y="14" font-size="12" fill="currentColor" text-anchor="middle" font-weight="bold">?</text>
            </svg>
            Explain
          </button>
        </div>
      </Show>

      {/* LLM Response Panel */}
      <div class={`llm-panel ${llmPanelOpen() ? 'open' : ''}`}>
        <div class="llm-panel-header">
          <h3 class="llm-panel-title">Response</h3>
          <button class="llm-panel-close" onClick={() => setLlmPanelOpen(false)} aria-label="Close panel">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="llm-panel-content">
          <Show when={llmLoading()}>
            <div class="llm-loading">Thinking...</div>
          </Show>
          <Show when={!llmLoading() && llmResponse()}>
            <p class="llm-response-text">{llmResponse()}</p>
          </Show>
        </div>
      </div>

      {/* LLM Panel Overlay */}
      <Show when={llmPanelOpen()}>
        <div class="llm-overlay" onClick={() => setLlmPanelOpen(false)} />
      </Show>

      {/* Navigation Drawer */}
      <div class={`nav-drawer ${navOpen() ? 'open' : ''}`}>
        <div class="nav-content">
          <h3 class="nav-title">Bible</h3>
          <Show when={bibleStructure()}>
            <div class="nav-section">
              <h4 class="testament-title">Old Testament</h4>
              <For each={bibleStructure().ot}>
                {(book, bookIdx) => (
                  <div class="nav-book">
                    <div class="book-name">{book.name}</div>
                    <div class="chapter-list">
                      <For each={book.chapters}>
                        {(chapter, chapterIdx) => (
                          <button
                            class="chapter-link"
                            onClick={() => navigateToChapter(bookIdx(), chapterIdx())}
                          >
                            {chapter.number}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
            
            <div class="nav-section">
              <h4 class="testament-title">New Testament</h4>
              <For each={bibleStructure().nt}>
                {(book, bookIdx) => (
                  <div class="nav-book">
                    <div class="book-name">{book.name}</div>
                    <div class="chapter-list">
                      <For each={book.chapters}>
                        {(chapter, chapterIdx) => (
                          <button
                            class="chapter-link"
                            onClick={() => navigateToChapter(bibleStructure().ot.length + bookIdx(), chapterIdx())}
                          >
                            {chapter.number}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Overlay */}
      <Show when={navOpen()}>
        <div class="nav-overlay" onClick={() => setNavOpen(false)} />
      </Show>

      <div class="bible-content">
        <div ref={topSentinelRef} class="top-sentinel">
          <Show when={loadingPrev()}>
            <div class="loading">Loading previous chapters...</div>
          </Show>
        </div>
        
        <For each={groupedChapters()}>
          {(bookGroup) => (
            <div class="book-section">
              <h2 class="book-title">{bookGroup.bookName}</h2>
              <For each={bookGroup.chapters}>
                {(chapter) => (
                  <div class="chapter">
                    <h3 class="chapter-number">Chapter {chapter.chapterNumber}</h3>
                    <div class="verses">
                      <For each={chapter.verses}>
                        {(verse) => (
                          <p class="verse">
                            <span class="verse-number">{verse.number}</span>
                            <span class="verse-text">{verse.text}</span>
                          </p>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
        
        <div ref={sentinelRef} class="sentinel">
          <Show when={loading()}>
            <div class="loading">Loading more chapters...</div>
          </Show>
          <Show when={!hasMore() && chapters().length > 0}>
            <div class="end-message">You've reached the end of the Bible</div>
          </Show>
        </div>
      </div>
    </main>
  );
}