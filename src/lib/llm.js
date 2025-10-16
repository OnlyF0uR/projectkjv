import { query } from "@solidjs/router";

// Server-side function to get LLM response
export const getLLMResponse = query(async (selectedText) => {
  "use server";
  
  // Mock response for now - replace with actual LLM integration later
  return {
    text: `You selected: "${selectedText}"\n\nThis is a mock response from the server. In the future, this will contain insights, explanations, or analysis from an LLM about the selected Bible text.`,
    timestamp: new Date().toISOString()
  };
}, "llm-response");
