import { createSignal, For, onMount, onCleanup, Show } from "solid-js";
import { getChapters } from "~/lib/bible";

export default function Home() {
  const [chapters, setChapters] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [nextBookIndex, setNextBookIndex] = createSignal(0);
  const [nextChapterIndex, setNextChapterIndex] = createSignal(0);
  
  let sentinelRef;
  let observer;

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

  onMount(() => {
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

  return (
    <main class="bible-container">
      <div class="bible-content">
        <For each={chapters()}>
          {(chapter) => (
            <div class="chapter">
              <h2 class="chapter-title">
                {chapter.bookName} {chapter.chapterNumber}
              </h2>
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