
import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_ENDPOINT = 'https://transport.integration.sl.se/v1/lines?transport_authority_id=1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const response = await fetch(API_ENDPOINT);
    if (!response.ok) throw new Error(response.statusText);
    
    // Hämta text för att kunna manipulera stora heltal (gid) innan JSON-parsning
    let text = await response.text();
    
    // Slå in gid-värden i citattecken för att förhindra precisionsförlust i JavaScript
    // Matchar "gid": 12345... och ersätter med "gid": "12345..."
    text = text.replace(/"gid":\s*([0-9]+)/g, '"gid": "$1"');
    
    // Verifiera att det går att parsa
    const data = JSON.parse(text);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800'); // Cacha i 24h
    return res.status(200).json(data);
  } catch (error) {
    console.error("Contractor fetch error:", error);
    return res.status(500).json({ error: 'Failed to fetch contractor data' });
  }
}
