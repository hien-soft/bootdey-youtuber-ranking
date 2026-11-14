/**
 * seed-to-supabase.js
 * Tự động đẩy toàn bộ 21 kênh từ channels-data.js vào bảng channels trên Supabase
 */

const config = require('./config');
const channels = require('./channels-data');

async function seedChannels() {
    console.log('==================================================');
    console.log('🌱 ĐANG ĐẨY DỮ LIỆU KÊNH LÊN SUPABASE...');
    console.log(`📡 URL: ${config.supabaseUrl}`);
    console.log(`📦 Số lượng kênh: ${channels.length}`);
    console.log('==================================================\n');

    try {
        const url = `${config.supabaseUrl}/rest/v1/channels`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': config.supabaseKey,
                'Authorization': `Bearer ${config.supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(channels)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`HTTP ${res.status}: ${err}`);
        }

        const data = await res.json();
        console.log(`✅ [THÀNH CÔNG] Đã đẩy thành công ${Array.isArray(data) ? data.length : channels.length} kênh lên bảng 'channels' trên Supabase!`);
        return true;
    } catch (e) {
        console.error('❌ [LỖI]', e.message);
        return false;
    }
}

if (require.main === module) {
    seedChannels();
}

module.exports = seedChannels;
