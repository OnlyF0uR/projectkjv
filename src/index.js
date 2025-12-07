/**
 * Project KJV - Cloudflare Worker
 * Serves the King James Bible with API endpoints for navigation and content
 */

import bible from './bible.json';

// Build a flat list of all chapters for easy navigation
const allChapters = [];
let globalIndex = 0;

// Process Old Testament
bible.ot.forEach((book, bookIndex) => {
	book.chapters.forEach((chapter, chapterIndex) => {
		allChapters.push({
			globalIndex: globalIndex++,
			testament: 'ot',
			bookIndex,
			bookName: book.name,
			chapterNumber: parseInt(chapter.number),
			verses: chapter.verses,
		});
	});
});

// Process New Testament
bible.nt.forEach((book, bookIndex) => {
	book.chapters.forEach((chapter, chapterIndex) => {
		allChapters.push({
			globalIndex: globalIndex++,
			testament: 'nt',
			bookIndex,
			bookName: book.name,
			chapterNumber: parseInt(chapter.number),
			verses: chapter.verses,
		});
	});
});

// Build table of contents
const tableOfContents = {
	ot: bible.ot.map((book, index) => ({
		name: book.name,
		chapters: book.chapters.length,
		startIndex: allChapters.findIndex((c) => c.testament === 'ot' && c.bookName === book.name),
	})),
	nt: bible.nt.map((book, index) => ({
		name: book.name,
		chapters: book.chapters.length,
		startIndex: allChapters.findIndex((c) => c.testament === 'nt' && c.bookName === book.name),
	})),
	totalChapters: allChapters.length,
};

// Find chapter index by book name and chapter number
function findChapterIndex(bookName, chapterNum) {
	return allChapters.findIndex(
		(c) => c.bookName.toLowerCase() === bookName.toLowerCase() && c.chapterNumber === parseInt(chapterNum)
	);
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// CORS headers for API routes
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// API Routes
		if (url.pathname.startsWith('/api/')) {
			const jsonHeaders = {
				'Content-Type': 'application/json',
				...corsHeaders,
			};

			// GET /api/toc - Table of contents
			if (url.pathname === '/api/toc') {
				return new Response(JSON.stringify(tableOfContents), {
					headers: jsonHeaders,
				});
			}

			// GET /api/chapters?start=0&count=5 - Get chapters for infinite scroll
			if (url.pathname === '/api/chapters') {
				const start = parseInt(url.searchParams.get('start') || '0');
				const count = parseInt(url.searchParams.get('count') || '3');

				// Clamp values
				const safeStart = Math.max(0, Math.min(start, allChapters.length - 1));
				const safeCount = Math.max(1, Math.min(count, 10));

				const chapters = allChapters.slice(safeStart, safeStart + safeCount).map((chapter) => ({
					globalIndex: chapter.globalIndex,
					testament: chapter.testament,
					bookName: chapter.bookName,
					chapterNumber: chapter.chapterNumber,
					verses: chapter.verses,
					isFirstOfTestament: chapter.globalIndex === 0 || (chapter.testament === 'nt' && chapter.chapterNumber === 1 && chapter.bookName === 'Matthew'),
				}));

				return new Response(
					JSON.stringify({
						chapters,
						hasMore: safeStart + safeCount < allChapters.length,
						hasPrevious: safeStart > 0,
						totalChapters: allChapters.length,
					}),
					{ headers: jsonHeaders }
				);
			}

			// GET /api/chapter/:book/:chapter - Get specific chapter
			if (url.pathname.match(/^\/api\/chapter\/.+\/\d+$/)) {
				const parts = url.pathname.split('/');
				const chapterNum = parts.pop();
				const bookName = decodeURIComponent(parts.pop());

				const index = findChapterIndex(bookName, chapterNum);

				if (index === -1) {
					return new Response(JSON.stringify({ error: 'Chapter not found' }), {
						status: 404,
						headers: jsonHeaders,
					});
				}

				return new Response(
					JSON.stringify({
						chapter: allChapters[index],
						globalIndex: index,
					}),
					{ headers: jsonHeaders }
				);
			}

			// GET /api/find?book=Genesis&chapter=1 - Find chapter index
			if (url.pathname === '/api/find') {
				const bookName = url.searchParams.get('book');
				const chapterNum = url.searchParams.get('chapter') || '1';

				if (!bookName) {
					return new Response(JSON.stringify({ error: 'Book name required' }), {
						status: 400,
						headers: jsonHeaders,
					});
				}

				const index = findChapterIndex(bookName, chapterNum);

				if (index === -1) {
					return new Response(JSON.stringify({ error: 'Chapter not found' }), {
						status: 404,
						headers: jsonHeaders,
					});
				}

				return new Response(JSON.stringify({ globalIndex: index }), {
					headers: jsonHeaders,
				});
			}

			return new Response(JSON.stringify({ error: 'Not found' }), {
				status: 404,
				headers: jsonHeaders,
			});
		}

		// For non-API routes, let static assets handle it (configured in wrangler.jsonc)
		return new Response('Not Found', { status: 404 });
	},
};
