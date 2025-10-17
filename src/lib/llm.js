import { query } from "@solidjs/router";

// Server-side function to get LLM response
export const getLLMResponse = query(async (selectedText) => {
  "use server";
  
  // Mock response for now - replace with actual LLM integration later
  return {
    text: `This feature is coming soon.`,
    timestamp: new Date().toISOString()
  };
}, "llm-response");
