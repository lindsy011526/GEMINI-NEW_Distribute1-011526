import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.API_KEY || '';

export const generateResponse = async (
  prompt: string,
  modelName: string = 'gemini-3-flash-preview',
  systemInstruction?: string,
  temperature: number = 0.7
): Promise<string> => {
  if (!apiKey) {
    console.error("API Key missing");
    return "Error: API Key is missing in environment variables.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Configure based on input
    const config: any = {
      temperature,
    };
    
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: config
    });

    return response.text || "No response generated.";

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return `Error generating response: ${error.message}`;
  }
};