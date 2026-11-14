/**
 * supabase-client.js
 * Cung cấp kết nối trực tiếp từ Web Frontend tới Supabase Database (bảng channels).
 * Lấy dữ liệu trực tiếp từ Supabase; tự động fallback sang CHANNELS_DATA nếu offline.
 */

const SUPABASE_CONFIG = {
    url: 'https://hrntvsgqvkdgxmddfrdq.supabase.co',
    key: 'sb_publishable_nWb75GYTqTBaTbzM66ooyA_A1-ZqSAr'
};

/**
 * Lấy danh sách kênh từ Supabase REST API
 * Trả về đối tượng { source: 'supabase'|'local', data: Array }
 */
async function fetchChannelsFromSupabase() {
    try {
        const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/channels?select=*&order=subscribers.desc`;
        const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_CONFIG.key,
                'Authorization': `Bearer ${SUPABASE_CONFIG.key}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                console.log(`[Supabase Live] Đã tải thành công ${data.length} kênh từ Supabase.`);
                return {
                    source: 'supabase',
                    data: data
                };
            }
        } else {
            console.warn(`[Supabase] HTTP ${res.status}: Không thể lấy dữ liệu, dùng fallback.`);
        }
    } catch (err) {
        console.warn('[Supabase Fallback] Chuyển sang dữ liệu cục bộ:', err.message);
    }

    const fallback = (typeof CHANNELS_DATA !== 'undefined' && Array.isArray(CHANNELS_DATA))
        ? CHANNELS_DATA
        : [];
    return {
        source: 'local',
        data: fallback
    };
}
