/**
 * server.js
 * REST API Server tự động cập nhật dữ liệu kênh YouTube vào Database Supabase.
 * Chạy độc lập với Node.js thuần (không cần cài thêm dependencies).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const config = require('./config');
const { syncChannels } = require('./sync-channels');

// Bảng ánh xạ MIME Type để phục vụ giao diện Web và ảnh
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.sql': 'text/plain; charset=utf-8',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

function serveStaticFile(res, reqPath) {
    let safePath = reqPath === '/' ? '/index.html' : reqPath;
    safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(__dirname, safePath);

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(fullPath).pipe(res);
        return true;
    }
    return false;
}

// Biến trạng thái tránh việc gọi sync dồn dập cùng một thời điểm
let isSyncing = false;
let lastSyncResult = null;

function sendJsonResponse(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
    });
    res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Xử lý Preflight CORS
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
        });
        return res.end();
    }

    try {
        // 1. Phục vụ trang tĩnh Web (HTML, CSS, JS, Images, SQL) nếu không phải /api
        if (!pathname.startsWith('/api')) {
            if (serveStaticFile(res, pathname)) {
                return;
            }
        }

        // 2. Route thông tin API docs: GET /api
        if (pathname === '/api') {
            return sendJsonResponse(res, 200, {
                service: 'YouTube Ranking Auto-Sync API & Web Server',
                status: 'running',
                endpoints: {
                    'GET /': 'Trang chủ Bảng xếp hạng YouTube Ranking',
                    'GET /profile.html': 'Trang hồ sơ chi tiết từng kênh',
                    'POST /api/channels/sync': 'Kích hoạt cập nhật tất cả kênh từ YouTube Data API vào Supabase',
                    'GET /api/channels/sync': 'Kích hoạt cập nhật (thuận tiện cho Browser / Webhook Cron)',
                    'POST /api/channels/sync/:id': 'Cập nhật duy nhất một kênh theo ID',
                    'GET /api/status': 'Xem trạng thái và kết quả lần đồng bộ gần nhất',
                    'GET /api/supabase/status': 'Kiểm tra tình trạng kết nối đến Database Supabase'
                },
                targetColumns: [
                    'subscribers',
                    'subscribers_formatted',
                    'videos_count',
                    'view_count'
                ],
                lastSync: lastSyncResult
            });
        }

        // 2. Trạng thái lần sync gần nhất
        if (pathname === '/api/status' && method === 'GET') {
            return sendJsonResponse(res, 200, {
                isSyncing,
                lastSync: lastSyncResult
            });
        }

        // 2b. Kiểm tra kết nối Supabase
        if (pathname === '/api/supabase/status' && method === 'GET') {
            const startCheck = Date.now();
            try {
                const checkUrl = `${config.supabaseUrl}/rest/v1/channels?select=id,name`;
                const checkRes = await fetch(checkUrl, {
                    headers: {
                        'apikey': config.supabaseKey,
                        'Authorization': `Bearer ${config.supabaseKey}`
                    }
                });
                const latency = Date.now() - startCheck;
                if (checkRes.ok) {
                    const data = await checkRes.json();
                    return sendJsonResponse(res, 200, {
                        supabaseConnected: true,
                        supabaseUrl: config.supabaseUrl,
                        latencyMs: latency,
                        channelCount: Array.isArray(data) ? data.length : 0,
                        sampleChannels: Array.isArray(data) ? data.slice(0, 3).map(c => c.name) : []
                    });
                } else {
                    const errBody = await checkRes.text();
                    return sendJsonResponse(res, checkRes.status, {
                        supabaseConnected: false,
                        supabaseUrl: config.supabaseUrl,
                        statusCode: checkRes.status,
                        error: errBody
                    });
                }
            } catch (netErr) {
                return sendJsonResponse(res, 502, {
                    supabaseConnected: false,
                    error: netErr.message
                });
            }
        }

        // 3. Endpoint kích hoạt đồng bộ: POST /api/channels/sync hoặc GET /api/channels/sync
        if (pathname === '/api/channels/sync' && (method === 'POST' || method === 'GET')) {
            if (isSyncing) {
                return sendJsonResponse(res, 429, {
                    success: false,
                    message: 'Tiến trình đồng bộ đang được thực thi. Vui lòng thử lại sau vài giây!'
                });
            }

            const targetId = parsedUrl.query.id || null;
            isSyncing = true;

            try {
                const result = await syncChannels(targetId);
                lastSyncResult = {
                    timestamp: new Date().toISOString(),
                    ...result
                };
                return sendJsonResponse(res, result.success ? 200 : 207, {
                    message: 'Hoàn tất tiến trình cập nhật dữ liệu từ YouTube Data API!',
                    result: lastSyncResult
                });
            } finally {
                isSyncing = false;
            }
        }

        // 4. Endpoint đồng bộ 1 kênh cụ thể: POST /api/channels/sync/:id
        const singleSyncMatch = pathname.match(/^\/api\/channels\/sync\/([a-zA-Z0-9_\-]+)$/);
        if (singleSyncMatch && (method === 'POST' || method === 'GET')) {
            const channelId = singleSyncMatch[1];
            if (isSyncing) {
                return sendJsonResponse(res, 429, {
                    success: false,
                    message: 'Tiến trình đồng bộ đang bận. Vui lòng thử lại sau!'
                });
            }

            isSyncing = true;
            try {
                const result = await syncChannels(channelId);
                return sendJsonResponse(res, result.success ? 200 : 207, {
                    message: `Hoàn tất cập nhật kênh ${channelId}`,
                    result
                });
            } finally {
                isSyncing = false;
            }
        }

        // 404 Route Not Found
        return sendJsonResponse(res, 404, {
            error: 'Not Found',
            message: `Endpoint ${method} ${pathname} không tồn tại. Xem GET / để biết danh sách endpoint khả dụng.`
        });

    } catch (err) {
        console.error('[API Error]', err);
        return sendJsonResponse(res, 500, {
            error: 'Internal Server Error',
            message: err.message
        });
    }
});

const PORT = config.port || 3000;

/**
 * Tự động lên lịch Cronjob chạy mỗi ngày (mặc định 07:00 sáng)
 */
function startDailyCron(hour = 7, minute = 0) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }
    const delayMs = next.getTime() - now.getTime();
    console.log(`⏰ [CRONJOB TỰ ĐỘNG] Đã kích hoạt lịch chạy mỗi ngày lúc ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    console.log(`📅 Lần chạy tiếp theo: ${next.toLocaleString()} (sau ${(delayMs / 3600000).toFixed(1)} giờ)`);

    setTimeout(async () => {
        try {
            console.log(`\n⏰ [CRONJOB] Kích hoạt tự động cập nhật định kỳ mỗi ngày...`);
            await syncChannels();
        } catch (err) {
            console.error(`[CRONJOB ERROR]`, err.message);
        }
        setInterval(async () => {
            try {
                console.log(`\n⏰ [CRONJOB] Kích hoạt tự động cập nhật định kỳ mỗi ngày...`);
                await syncChannels();
            } catch (err) {
                console.error(`[CRONJOB ERROR]`, err.message);
            }
        }, 24 * 60 * 60 * 1000);
    }, delayMs);
}

server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 YouTube Ranking Web & Sync Server đang chạy:`);
    console.log(`🌐 Trang chủ Web:          http://localhost:${PORT}`);
    console.log(`👤 Trang Profile:          http://localhost:${PORT}/profile.html`);
    console.log(`🔄 API Cập nhật YouTube:   POST http://localhost:${PORT}/api/channels/sync`);
    console.log(`📊 Kiểm tra Supabase:      GET  http://localhost:${PORT}/api/supabase/status`);
    console.log(`==================================================`);
    startDailyCron(7, 0);
});

module.exports = server;
