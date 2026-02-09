
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'buffer';

const API_ENDPOINT = 'https://opendata.samtrafiken.se/gtfs-rt-sweden/sl/ServiceAlertsSweden.pb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.RT_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured on the server.' });
  }

  try {
    const fullUrl = `${API_ENDPOINT}?key=${apiKey}`;
    const apiResponse = await fetch(fullUrl);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return res.status(apiResponse.status).send(`Upstream API Error: ${apiResponse.statusText} - ${errorText}`);
    }

    const buffer = await apiResponse.arrayBuffer();
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
    
    return res.status(200).send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('Error in service-alerts proxy:', error);
    return res.status(500).json({ error: 'Failed to fetch service alerts.' });
  }
}
