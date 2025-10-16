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
  const [llmPanelOpen, setLlmPanelOpen] = createSignal(false);
  const [llmResponse, setLlmResponse] = createSignal("");
  const [llmLoading, setLlmLoading] = createSignal(false);
  
  let sentinelRef;
  let topSentinelRef;
  let observer;
  let topObserver;

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

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0) {
      setSelectedText(text);
    } else {
      setSelectedText("");
      setLlmPanelOpen(false);
    }
  };

  const handleLLMQuery = async () => {
    if (!selectedText()) return;
    
    setLlmPanelOpen(true);
    setLlmLoading(true);
    
    try {
      const response = await getLLMResponse(selectedText());
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
      document.addEventListener('mouseup', handleTextSelection);
      document.addEventListener('touchend', handleTextSelection);
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
      document.removeEventListener('touchend', handleTextSelection);
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
        <Show when={selectedText()}>
          <button class="llm-toggle" onClick={handleLLMQuery} aria-label="Ask about selection">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
              <text x="10" y="14" font-size="12" fill="currentColor" text-anchor="middle" font-weight="bold">?</text>
            </svg>
          </button>
        </Show>
      </div>

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