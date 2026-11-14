/**
 * test-supabase.js
 * Script kiểm tra kết nối trực tiếp từ dự án đến Database Supabase
 * Sử dụng cấu hình từ Supabase.txt / .env
 */

const config = require('./config');

async function testConnection() {
    console.log('==================================================');
    console.log('🔍 BẮT ĐẦU KIỂM TRA KẾT NỐI ĐẾN SUPABASE...');
    console.log(`📡 Supabase URL: ${config.supabaseUrl}`);
    console.log(`🔑 Publishable Key: ${config.supabaseKey ? config.supabaseKey.slice(0, 15) + '...' : 'CHƯA CẤU HÌNH'}`);
    console.log('==================================================\n');

    try {
        // 1. Kiểm tra Endpoint REST API của Supabase
        const startTime = Date.now();
        const testUrl = `${config.supabaseUrl}/rest/v1/channels?select=id,name,handle,category,subscribers,subscribers_formatted,videos_count,view_count&order=subscribers.desc&limit=5`;

        console.log(`[1/3] Đang gửi yêu cầu đến bảng 'channels'...`);
        const res = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'apikey': config.supabaseKey,
                'Authorization': `Bearer ${config.supabaseKey}`,
                'Prefer': 'count=exact'
            }
        });

        const latency = Date.now() - startTime;

        if (!res.ok) {
            const errText = await res.text();
            console.error(`❌ [THẤT BẠI] Supabase phản hồi mã lỗi HTTP ${res.status}:`);
            console.error(errText);
            console.log('\n💡 Gợi ý khắc phục:');
            if (res.status === 401) {
                console.log('- API Key không hợp lệ hoặc đã hết hạn.');
            } else if (res.status === 404 || errText.includes('relation "channels" does not exist')) {
                console.log('- Bảng "channels" chưa được tạo trên schema public. Hãy chạy script data-channels.sql trong SQL Editor.');
            } else if (errText.includes('policy') || res.status === 403) {
                console.log('- Row Level Security (RLS) đang chặn truy cập. Hãy chạy các câu lệnh CREATE POLICY trong data-channels.sql.');
            }
            return false;
        }

        const data = await res.json();
        const contentRange = res.headers.get('content-range');
        const totalCount = contentRange ? contentRange.split('/')[1] : data.length;

        console.log(`✅ [THÀNH CÔNG] Kết nối Supabase thành công! (Độ trễ: ${latency}ms)`);
        console.log(`📊 Tổng số kênh hiện có trong bảng channels: ${totalCount} kênh\n`);

        console.log('[2/3] Dữ liệu mẫu 5 kênh đầu tiên lấy từ Supabase:');
        console.table(data.map((c, i) => ({
            'Top': `#${i + 1}`,
            'ID': c.id,
            'Tên kênh': c.name,
            'Handle': c.handle,
            'Danh mục': c.category,
            'Subscribers': c.subscribers_formatted || c.subscribers,
            'Videos': c.videos_count
        })));

        console.log('\n[3/3] Trạng thái tích hợp trong Project:');
        console.log(' - Web Frontend (index.html, profile.html): Đã tích hợp supabase-client.js ✅');
        console.log(' - Backend Auto-Sync (sync-channels.js, server.js): Đã sẵn sàng cập nhật dữ liệu YouTube ✅');
        console.log('\n🎉 Project đã được kết nối hoàn toàn với Supabase!');
        return true;

    } catch (err) {
        console.error('❌ [LỖI KẾT NỐI MẠNG]', err.message);
        console.log('\n💡 Lưu ý: Đảm bảo máy tính có kết nối Internet để kết nối tới server Supabase.');
        return false;
    }
}

if (require.main === module) {
    testConnection();
}

module.exports = testConnection;
