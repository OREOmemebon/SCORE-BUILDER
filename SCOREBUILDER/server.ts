import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Route: Generate Score
  app.post("/api/generate-score", async (req, res) => {
    const { type, payload, difficulty, contentType } = req.body;
    
    // type: 'audio', 'title', 'image'
    // difficulty: 'Elementary', 'Intermediate', 'Advanced'
    // contentType: 'Melody', 'Accompaniment'

    try {
      let prompt = "";
      let parts: any[] = [];

      if (type === 'audio') {
        prompt = `Analyze the provided audio and generate a piano score in ABC notation. 
        Difficulty: ${difficulty}. 
        Content: ${contentType === 'Melody' ? 'Melody only' : 'Accompaniment and melody (Piano Grand Staff)'}.
        Return ONLY valid ABC notation text. Include the title if possible.`;
        parts = [
          { inlineData: { data: payload.data, mimeType: payload.mimeType } },
          { text: prompt }
        ];
      } else if (type === 'title') {
        prompt = `Find information about the song "${payload.title}" and generate a piano score in ABC notation.
        Difficulty: ${difficulty}.
        Content: ${contentType === 'Melody' ? 'Melody only' : 'Accompaniment and melody (Piano Grand Staff)'}.
        Use Google Search to find accurate melody and harmony.
        Return ONLY valid ABC notation text.`;
        parts = [ { text: prompt } ];
      } else if (type === 'image') {
        prompt = `Convert the sheet music image provided into a digital piano score in ABC notation.
        Difficulty: ${difficulty}. (Adjust complexity to this level if necessary, otherwise transcribe accurately).
        Content: ${contentType === 'Melody' ? 'Melody only' : 'Accompaniment and melody (Piano Grand Staff)'}.
        Return ONLY valid ABC notation text.`;
        parts = [
          { inlineData: { data: payload.data, mimeType: payload.mimeType } },
          { text: prompt }
        ];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: { parts },
        config: {
          tools: type === 'title' ? [{ googleSearch: {} }] : [],
          systemInstruction: "You are a professional music transcriber and composer. You excel at converting audio, titles, or images into correct ABC notation for sheet music. Respond with ONLY the ABC notation code, no extra text.",
        }
      });

      const abcNotation = response.text || "";
      res.json({ abc: abcNotation });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
