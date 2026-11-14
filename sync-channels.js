/**
 * sync-channels.js
 * Tự động cập nhật số liệu YouTube (subscribers, subscribers_formatted, videos_count, view_count)
 * từ YouTube Data API v3 vào Database Supabase (bảng channels) và đồng bộ channels-data.js.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Định dạng số người đăng ký theo chuẩn K, M, B
 * VD: 375000000 -> "375M", 10200000 -> "10.2M", 75400 -> "75.4K"
 */
function formatSubscribers(num) {
    if (!num || isNaN(num) || num <= 0) return '0';
    const n = Number(num);
    if (n >= 1e9) {
        return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (n >= 1e6) {
        return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (n >= 1e3) {
        return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return n.toLocaleString();
}

/**
 * Lấy danh sách ID các kênh cần cập nhật:
 * Ưu tiên lấy từ bảng channels trên Supabase; nếu chưa có thì lấy từ channels-data.js
 */
async function getChannelList() {
    try {
        const url = `${config.supabaseUrl}/rest/v1/channels?select=id,name,handle`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': config.supabaseKey,
                'Authorization': `Bearer ${config.supabaseKey}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                console.log(`[Supabase] Tìm thấy ${data.length} kênh trong database.`);
                return data;
            }
        }
    } catch (err) {
        console.warn(`[Supabase] Không thể lấy danh sách kênh từ REST API: ${err.message}. Chuyển sang dùng channels-data.js.`);
    }

    // Fallback sang file channels-data.js cục bộ
    try {
        const localData = require('./channels-data.js');
        console.log(`[Local] Dùng danh sách ${localData.length} kênh từ channels-data.js.`);
        return localData.map(c => ({ id: c.id, name: c.name, handle: c.handle }));
    } catch (err) {
        throw new Error(`Không thể tìm thấy danh sách kênh để đồng bộ: ${err.message}`);
    }
}

/**
 * Gọi YouTube Data API v3 để lấy số liệu thống kê (Statistics)
 * Hỗ trợ batching tối đa 50 kênh / 1 request YouTube (chỉ tốn 1 quota unit)
 * Tự động fallback tìm kiếm theo handle nếu ID kênh bị lệch.
 */
async function fetchYouTubeStatistics(channelList) {
    if (!config.youtubeApiKey) {
        throw new Error('Chưa cấu hình YOUTUBE_API_KEY trong .env hoặc youtube.txt!');
    }

    const channelIds = channelList.map(c => c.id);
    const CHUNK_SIZE = 50;
    const statsMap = new Map();

    for (let i = 0; i < channelIds.length; i += CHUNK_SIZE) {
        const chunk = channelIds.slice(i, i + CHUNK_SIZE);
        const idsParam = chunk.join(',');
        const ytUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(idsParam)}&key=${config.youtubeApiKey}`;

        console.log(`[YouTube API] Đang lấy thống kê đợt ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} kênh)...`);
        const res = await fetch(ytUrl);

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Lỗi YouTube Data API (${res.status}): ${errText}`);
        }

        const json = await res.json();
        const items = json.items || [];

        for (const item of items) {
            const stats = item.statistics || {};
            const snippet = item.snippet || {};
            const isHiddenSub = Boolean(stats.hiddenSubscriberCount);

            const subscribers = isHiddenSub ? 0 : (parseInt(stats.subscriberCount, 10) || 0);
            const subscribers_formatted = isHiddenSub ? 'Hidden' : formatSubscribers(subscribers);
            const videos_count = parseInt(stats.videoCount, 10) || 0;
            const view_count = parseInt(stats.viewCount, 10) || 0;

            statsMap.set(item.id, {
                id: item.id,
                name: snippet.title || '',
                subscribers,
                subscribers_formatted,
                videos_count,
                view_count,
                updated_at: new Date().toISOString()
            });
        }
    }

    // 2. Tự động fallback tìm theo @handle cho các kênh chưa có kết quả từ ID
    for (const ch of channelList) {
        if (!statsMap.has(ch.id) && ch.handle) {
            const cleanHandle = ch.handle.replace(/^@/, '');
            try {
                const handleUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(cleanHandle)}&key=${config.youtubeApiKey}`;
                const hRes = await fetch(handleUrl);
                if (hRes.ok) {
                    const hJson = await hRes.json();
                    if (hJson.items && hJson.items.length > 0) {
                        const item = hJson.items[0];
                        const stats = item.statistics || {};
                        const snippet = item.snippet || {};
                        const isHiddenSub = Boolean(stats.hiddenSubscriberCount);

                        const subscribers = isHiddenSub ? 0 : (parseInt(stats.subscriberCount, 10) || 0);
                        const subscribers_formatted = isHiddenSub ? 'Hidden' : formatSubscribers(subscribers);
                        const videos_count = parseInt(stats.videoCount, 10) || 0;
                        const view_count = parseInt(stats.viewCount, 10) || 0;

                        console.log(`[YouTube API] Đã tìm thấy kênh '${ch.name}' qua handle '${ch.handle}'!`);
                        statsMap.set(ch.id, {
                            id: ch.id,
                            name: snippet.title || ch.name,
                            subscribers,
                            subscribers_formatted,
                            videos_count,
                            view_count,
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            } catch (hErr) {
                // Bỏ qua lỗi handle
            }
        }
    }

    return statsMap;
}

/**
 * Cập nhật các cột vào database Supabase (bảng channels)
 * Cập nhật: subscribers, subscribers_formatted, videos_count, view_count, updated_at
 */
async function updateSupabaseChannel(channelData) {
    const url = `${config.supabaseUrl}/rest/v1/channels?id=eq.${encodeURIComponent(channelData.id)}`;
    const payload = {
        subscribers: channelData.subscribers,
        subscribers_formatted: channelData.subscribers_formatted,
        videos_count: channelData.videos_count,
        view_count: channelData.view_count,
        updated_at: channelData.updated_at
    };

    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    return await res.json();
}

/**
 * Đồng bộ ngược vào file channels-data.js cục bộ để giữ giao diện web tĩnh luôn mới nhất
 */
function updateLocalChannelsDataFile(statsMap) {
    const filePath = path.join(__dirname, 'channels-data.js');
    if (!fs.existsSync(filePath)) return;

    try {
        let channels = require('./channels-data.js');
        let modified = false;

        channels = channels.map(ch => {
            const updated = statsMap.get(ch.id);
            if (updated) {
                modified = true;
                return {
                    ...ch,
                    subscribers: updated.subscribers,
                    subscribers_formatted: updated.subscribers_formatted,
                    videos_count: updated.videos_count,
                    view_count: updated.view_count
                };
            }
            return ch;
        });

        if (modified) {
            const fileContent = `// Dữ liệu kênh YouTube (Tự động cập nhật qua YouTube Data API v3)
const CHANNELS_DATA = ${JSON.stringify(channels, null, 4)};

// Universal export cho Node.js / module loader
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CHANNELS_DATA;
}
`;
            fs.writeFileSync(filePath, fileContent, 'utf8');
            console.log('[Local] Đã đồng bộ số liệu mới vào channels-data.js.');
        }
    } catch (err) {
        console.warn('[Local] Không thể cập nhật channels-data.js:', err.message);
    }
}

/**
 * Hàm điều phối chính để đồng bộ dữ liệu
 */
async function syncChannels(targetChannelId = null) {
    const startTime = Date.now();
    console.log(`\n==================================================`);
    console.log(`[${new Date().toLocaleString()}] Bắt đầu đồng bộ số liệu YouTube...`);
    console.log(`==================================================`);

    // 1. Lấy danh sách kênh
    const channels = await getChannelList();
    const targetChannels = targetChannelId
        ? channels.filter(c => c.id === targetChannelId)
        : channels;

    if (targetChannels.length === 0) {
        return {
            success: false,
            message: targetChannelId ? `Không tìm thấy kênh có ID ${targetChannelId}` : 'Không có kênh nào để cập nhật.',
            total: 0,
            updated: 0
        };
    }

    const channelIds = targetChannels.map(c => c.id);

    // 2. Lấy dữ liệu từ YouTube Data API (kèm fallback theo @handle)
    const statsMap = await fetchYouTubeStatistics(targetChannels);
    console.log(`[YouTube API] Đã lấy thành công số liệu của ${statsMap.size}/${channelIds.length} kênh.`);

    // 3. Cập nhật vào Supabase
    const results = [];
    const errors = [];

    for (const [id, stats] of statsMap.entries()) {
        const chInfo = targetChannels.find(c => c.id === id) || {};
        const chName = chInfo.name || stats.name || id;

        try {
            await updateSupabaseChannel(stats);
            console.log(` ✓ [OK] ${chName}: ${stats.subscribers_formatted} Subs | ${stats.videos_count} Videos | ${stats.view_count.toLocaleString()} Views`);
            results.push({
                id,
                name: chName,
                subscribers: stats.subscribers,
                subscribers_formatted: stats.subscribers_formatted,
                videos_count: stats.videos_count,
                view_count: stats.view_count
            });
        } catch (dbErr) {
            console.error(` ✗ [FAIL] ${chName} (${id}): ${dbErr.message}`);
            errors.push({
                id,
                name: chName,
                error: dbErr.message
            });
        }
    }

    // 4. Cập nhật file cục bộ
    updateLocalChannelsDataFile(statsMap);

    const executionTimeMs = Date.now() - startTime;
    console.log(`==================================================`);
    console.log(`Hoàn thành trong ${executionTimeMs}ms! Thành công: ${results.length}, Thất bại: ${errors.length}`);
    console.log(`==================================================\n`);

    return {
        success: errors.length === 0,
        executionTimeMs,
        total: channelIds.length,
        updatedCount: results.length,
        failedCount: errors.length,
        updated: results,
        errors
    };
}

// Nếu chạy trực tiếp từ dòng lệnh: node sync-channels.js [channel_id]
if (require.main === module) {
    const argChannelId = process.argv[2] || null;
    syncChannels(argChannelId)
        .then(res => {
            if (!res.success && res.failedCount > 0) {
                process.exitCode = 1;
            }
        })
        .catch(err => {
            console.error('[LỖI NGHIÊM TRỌNG]', err);
            process.exit(1);
        });
}

module.exports = {
    syncChannels,
    formatSubscribers,
    fetchYouTubeStatistics
};
