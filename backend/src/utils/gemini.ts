// Llama a la API REST de Gemini directo (sin el SDK de Firebase: el backend
// ya tiene su propia clave segura, no hace falta la capa que Firebase AI
// Logic agrega para apps sin servidor). Si no hay clave configurada, el
// resumen simplemente no se arma con IA — el resto de la app sigue andando.
const MODEL = "gemini-2.0-flash";

export async function generateText(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!response.ok) {
      console.error("[gemini] error HTTP", response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? text.trim() : null;
  } catch (err) {
    console.error("[gemini] error de red", err);
    return null;
  }
}
