import { createSignal, For, onMount, onCleanup, Show } from "solid-js";
import { getChapters, getBible } from "~/lib/bible";

export default function Home() {
  const [chapters, setChapters] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [nextBookIndex, setNextBookIndex] = createSignal(0);
  const [nextChapterIndex, setNextChapterIndex] = createSignal(0);
  const [darkMode, setDarkMode] = createSignal(false);
  const [navOpen, setNavOpen] = createSignal(false);
  const [bibleStructure, setBibleStructure] = createSignal(null);
  
  let sentinelRef;
  let observer;

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
        3 // Load 3 chapters at a time
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

  const navigateToChapter = async (bookIndex, chapterIndex) => {
    setChapters([]);
    setNextBookIndex(bookIndex);
    setNextChapterIndex(chapterIndex);
    setHasMore(true);
    setNavOpen(false);
    window.scrollTo(0, 0);
    await loadMore();
  };

  onMount(async () => {
    // Load Bible structure for navigation
    const bible = await getBible();
    setBibleStructure(bible);
    
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark-mode');
    }
    
    // Load initial chapters
    loadMore();
    
    // Set up intersection observer for infinite scroll
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading() && hasMore()) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );
    
    if (sentinelRef) {
      observer.observe(sentinelRef);
    }
  });

  onCleanup(() => {
    if (observer && sentinelRef) {
      observer.unobserve(sentinelRef);
    }
  });

  const toggleTheme = () => {
    setDarkMode(!darkMode());
    document.documentElement.classList.toggle('dark-mode');
    localStorage.setItem('theme', !darkMode() ? 'dark' : 'light');
  };

  return (
    <main class="bible-container">
      {/* Fixed Controls */}
      <div class="fixed-controls">
        <button class="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {darkMode() ? '☀️' : '🌙'}
        </button>
        <button class="nav-toggle" onClick={() => setNavOpen(!navOpen())} aria-label="Toggle navigation">
          {navOpen() ? '✕' : '☰'}
        </button>
      </div>

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