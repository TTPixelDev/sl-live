
import fs from 'fs';
import path from 'path';
import process from 'process';
import dotenv from 'dotenv';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

// Ladda miljövariabler från .env
dotenv.config();

const DATA_DIR = path.resolve(process.cwd(), 'data/raw');
const OUT_FILE = path.join(DATA_DIR, 'sweden.zip');
const DOWNLOAD_URL = process.env.SWEDEN_ZIP;

async function downloadGTFS() {
    console.log('--- Startar nedladdning av GTFS-data ---');

    if (!DOWNLOAD_URL) {
        console.error('FEL: Miljövariabeln SWEDEN_ZIP saknas i .env filen.');
        console.error('Lägg till: SWEDEN_ZIP=https://din-trafiklab-länk-här');
        process.exit(1);
    }

    // Skapa mappen om den inte finns
    if (!fs.existsSync(DATA_DIR)) {
        console.log(`Skapar mapp: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    try {
        console.log(`Laddar ner från: ${DOWNLOAD_URL}`);
        console.log('Detta kan ta en stund beroende på filstorlek...');

        const response = await fetch(DOWNLOAD_URL);

        if (!response.ok) {
            throw new Error(`Kunde inte ladda ner filen. Status: ${response.status} ${response.statusText}`);
        }

        if (!response.body) {
            throw new Error('Svaret saknar innehåll (body).');
        }

        // Skapa en skrivström till filen
        const fileStream = fs.createWriteStream(OUT_FILE);

        // Konvertera Web Stream till Node Stream och pipea till filen
        // @ts-ignore - Readable.fromWeb finns i nyare Node-versioner
        await finished(Readable.fromWeb(response.body).pipe(fileStream));

        console.log(`\n✅ Nedladdning klar!`);
        console.log(`Fil sparad till: ${OUT_FILE}`);
        console.log(`Filstorlek: ${(fs.statSync(OUT_FILE).size / (1024 * 1024)).toFixed(2)} MB`);
        console.log('\nKör nu "npm run process-gtfs" för att uppdatera appens data.');

    } catch (error) {
        console.error('\n❌ Ett fel uppstod vid nedladdningen:', error);
        process.exit(1);
    }
}

downloadGTFS();
