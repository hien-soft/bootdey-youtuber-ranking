const fs = require('fs');
const path = require('path');

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
                const key = trimmed.slice(0, eqIdx).trim();
                const val = trimmed.slice(eqIdx + 1).trim();
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    }
}

loadEnvFile();

// Fallback trích xuất trực tiếp từ Supabase.txt nếu chưa có env
if (!process.env.SUPABASE_URL) {
    const supabaseTxtPath = path.join(__dirname, 'Supabase.txt');
    if (fs.existsSync(supabaseTxtPath)) {
        const content = fs.readFileSync(supabaseTxtPath, 'utf8');
        const urlMatch = content.match(/https:\/\/[^\s]+/);
        const keyMatch = content.match(/Publishable key:\s*([^\s]+)/i);
        const passMatch = content.match(/Password:\s*([^\s]+)/i);
        if (urlMatch) process.env.SUPABASE_URL = urlMatch[0];
        if (keyMatch) process.env.SUPABASE_KEY = keyMatch[1];
        if (passMatch) process.env.SUPABASE_DB_PASSWORD = passMatch[1];
    }
}

// Fallback trích xuất trực tiếp từ youtube.txt nếu chưa có env
if (!process.env.YOUTUBE_API_KEY) {
    const youtubeTxtPath = path.join(__dirname, 'youtube.txt');
    if (fs.existsSync(youtubeTxtPath)) {
        const content = fs.readFileSync(youtubeTxtPath, 'utf8');
        const keyMatch = content.match(/API_KEY=([^\s]+)/) || content.match(/key=([a-zA-Z0-9_\-]+)/);
        if (keyMatch) process.env.YOUTUBE_API_KEY = keyMatch[1];
    }
}

const config = {
    supabaseUrl: process.env.SUPABASE_URL || 'https://hrntvsgqvkdgxmddfrdq.supabase.co',
    supabaseKey: process.env.SUPABASE_KEY || 'sb_publishable_nWb75GYTqTBaTbzM66ooyA_A1-ZqSAr',
    supabaseDbPassword: process.env.SUPABASE_DB_PASSWORD || 'tdtNUCQgNvgSoiej',
    youtubeApiKey: process.env.YOUTUBE_API_KEY || 'AIzaSyCoccJ_YSStOgdLxct49Td3PA9z6e4aJ_A',
    port: parseInt(process.env.PORT, 10) || 3000
};

module.exports = config;
