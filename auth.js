/**
 * auth.js
 * Quản lý Xác thực (Authentication) & Phân quyền (Role-Based Access Control - RBAC)
 * Tích hợp Supabase Auth (Đăng nhập, Đăng ký, Quên mật khẩu, Quản lý Vai trò)
 */

const AUTH_CONFIG = {
    url: 'https://hrntvsgqvkdgxmddfrdq.supabase.co',
    key: 'sb_publishable_nWb75GYTqTBaTbzM66ooyA_A1-ZqSAr'
};

let supabaseAuthClient = null;

function getAuthClient() {
    if (supabaseAuthClient) return supabaseAuthClient;
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseAuthClient = supabase.createClient(AUTH_CONFIG.url, AUTH_CONFIG.key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            }
        });
        return supabaseAuthClient;
    }
    return null;
}

/**
 * Đăng nhập bằng Email và Mật khẩu
 */
async function authSignIn(email, password) {
    const client = getAuthClient();
    if (!client) throw new Error('Thư viện Supabase SDK chưa được tải.');

    const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password
    });

    if (error) throw error;
    return data;
}

/**
 * Đăng ký tài khoản mới
 */
async function authSignUp(email, password, fullName) {
    const client = getAuthClient();
    if (!client) throw new Error('Thư viện Supabase SDK chưa được tải.');

    const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
            data: {
                full_name: fullName ? fullName.trim() : ''
            }
        }
    });

    if (error) throw error;
    return data;
}

/**
 * Quên mật khẩu: Gửi email liên kết đặt lại mật khẩu
 */
async function authForgotPassword(email) {
    const client = getAuthClient();
    if (!client) throw new Error('Thư viện Supabase SDK chưa được tải.');

    const redirectUrl = window.location.origin + '/login.html?type=reset';
    const { data, error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl
    });

    if (error) throw error;
    return data;
}

/**
 * Đặt lại mật khẩu mới (khi người dùng click link từ email)
 */
async function authUpdatePassword(newPassword) {
    const client = getAuthClient();
    if (!client) throw new Error('Thư viện Supabase SDK chưa được tải.');

    const { data, error } = await client.auth.updateUser({
        password: newPassword
    });

    if (error) throw error;
    return data;
}

/**
 * Đăng xuất
 */
async function authSignOut() {
    const client = getAuthClient();
    if (client) {
        await client.auth.signOut();
    }
    localStorage.removeItem('local_demo_user');
    window.location.reload();
}

/**
 * Lấy thông tin User hiện tại và Phân quyền (Role)
 * Role: 'admin' | 'editor' | 'viewer'
 */
async function authGetCurrentUser() {
    const client = getAuthClient();
    if (!client) {
        const local = localStorage.getItem('local_demo_user');
        return local ? JSON.parse(local) : null;
    }

    try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return null;

        // Lấy role từ bảng profiles
        const { data: profile } = await client
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .maybeSingle();

        const role = (profile && profile.role) ? profile.role : 'viewer';
        const fullName = (profile && profile.full_name) || user.user_metadata?.full_name || user.email.split('@')[0];

        return {
            id: user.id,
            email: user.email,
            fullName,
            role
        };
    } catch (err) {
        console.warn('[Auth] Không thể lấy thông tin user:', err.message);
        return null;
    }
}

/**
 * Trả về màu Badge theo vai trò
 */
function getRoleBadge(role) {
    switch ((role || '').toLowerCase()) {
        case 'admin':
            return '<span class="badge badge-danger px-2 py-1"><i class="fa fa-shield"></i> Quản Trị Viên (Admin)</span>';
        case 'editor':
            return '<span class="badge badge-success px-2 py-1"><i class="fa fa-pencil"></i> Biên Tập Viên (Editor)</span>';
        default:
            return '<span class="badge badge-info px-2 py-1"><i class="fa fa-user"></i> Người Xem (Viewer)</span>';
    }
}

/**
 * Render thanh Auth Bar ở đầu trang web (index.html, profile.html)
 */
async function renderAuthHeaderBar(containerId = 'auth-nav-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = await authGetCurrentUser();

    if (!user) {
        container.innerHTML = `
            <div class="d-flex align-items-center justify-content-between p-2 mb-3 bg-white rounded shadow-sm border">
                <div class="small text-muted">
                    <i class="fa fa-info-circle text-primary"></i> Đăng nhập để sử dụng các tính năng nâng cao (Đồng bộ số liệu, Quản trị kênh).
                </div>
                <div>
                    <a href="login.html" class="btn btn-primary btn-sm px-3">
                        <i class="fa fa-sign-in"></i> Đăng nhập
                    </a>
                </div>
            </div>
        `;
        return;
    }

    const isAdminOrEditor = user.role === 'admin' || user.role === 'editor';
    const syncBtnHtml = isAdminOrEditor ? `
        <button id="admin-sync-btn" class="btn btn-warning btn-sm mr-2 text-dark font-weight-bold" title="Kích hoạt đồng bộ số liệu YouTube API">
            <i class="fa fa-refresh"></i> Đồng bộ YouTube (${user.role.toUpperCase()})
        </button>
    ` : '';

    container.innerHTML = `
        <div class="d-flex flex-wrap align-items-center justify-content-between p-2 mb-3 bg-white rounded shadow-sm border">
            <div class="d-flex align-items-center my-1">
                <i class="fa fa-user-circle fa-2x text-primary mr-2"></i>
                <div>
                    <span class="font-weight-bold text-dark mr-2">${user.fullName || user.email}</span>
                    <small class="text-muted mr-2">(${user.email})</small>
                    ${getRoleBadge(user.role)}
                </div>
            </div>
            <div class="d-flex align-items-center my-1">
                ${syncBtnHtml}
                <button id="auth-logout-btn" class="btn btn-outline-danger btn-sm">
                    <i class="fa fa-sign-out"></i> Đăng xuất
                </button>
            </div>
        </div>
    `;

    // Gắn sự kiện nút Đăng xuất
    const logoutBtn = document.getElementById('auth-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', authSignOut);
    }

    // Gắn sự kiện nút Admin Đồng bộ YouTube
    const syncBtn = document.getElementById('admin-sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async function () {
            const originalText = this.innerHTML;
            this.disabled = true;
            this.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Đang đồng bộ...';

            try {
                const res = await fetch('/api/channels/sync', { method: 'POST' });
                const json = await res.json();
                alert(`✅ ${json.message || 'Đã đồng bộ thành công!'}\nThành công: ${json.result?.updatedCount || 0} kênh.`);
                window.location.reload();
            } catch (err) {
                alert(`❌ Lỗi đồng bộ: ${err.message}`);
            } finally {
                this.disabled = false;
                this.innerHTML = originalText;
            }
        });
    }
}
