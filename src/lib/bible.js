import { cache } from "@solidjs/router";
import bibleData from "../data/bible.json";

/* The bible.json file has the following structure:
 *          { ot_contents: [String], ot: [Book], nt_contents: [String], nt: [Book] }
 * Book:    { name: String, chapters: [Chapter] }
 * Chapter: { number: Number, verses: [Verse] }
 * Verse:   { number: Number, text: String }
 */

// Server-side cached function to get Bible data
export const getBible = cache(async () => {
  "use server";
  return bibleData;
}, "bible-data");

// Get a specific range of chapters across books
export const getChapters = cache(async (startBookIndex, startChapterIndex, count) => {
  "use server";
  const bible = await getBible();
  const allBooks = [...bible.ot, ...bible.nt];
  
  const result = [];
  let currentBookIndex = startBookIndex;
  let currentChapterIndex = startChapterIndex;
  let chaptersCollected = 0;
  
  while (chaptersCollected < count && currentBookIndex < allBooks.length) {
    const book = allBooks[currentBookIndex];
    
    if (currentChapterIndex < book.chapters.length) {
      const chapter = book.chapters[currentChapterIndex];
      result.push({
        bookName: book.name,
        bookIndex: currentBookIndex,
        chapterNumber: chapter.number,
        chapterIndex: currentChapterIndex,
        verses: chapter.verses
      });
      
      currentChapterIndex++;
      chaptersCollected++;
    } else {
      // Move to next book
      currentBookIndex++;
      currentChapterIndex = 0;
    }
  }
  
  return {
    chapters: result,
    hasMore: currentBookIndex < allBooks.length,
    nextBookIndex: currentBookIndex,
    nextChapterIndex: currentChapterIndex
  };
}, "bible-chapters");