-- ========================================================
-- Schema: Phân Quyền (RBAC) & Quản lý User Profiles trong Supabase
-- ========================================================

-- 1. Bảng lưu thông tin chi tiết và quyền hạn (Role) của người dùng
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'viewer', -- 'admin', 'editor', 'viewer'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tạo Index tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. Kích hoạt Row Level Security (RLS) cho bảng profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy 1: Mọi người đã đăng nhập có thể xem profile của chính mình
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy 2: Admin có thể xem toàn bộ danh sách profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Policy 3: Admin có quyền cập nhật quyền (Role) của người khác
DROP POLICY IF EXISTS "Admins can update roles" ON public.profiles;
CREATE POLICY "Admins can update roles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- 3. Trigger tự động tạo bản ghi profile khi có user đăng ký qua Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'viewer' -- Mặc định khi đăng ký là viewer
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gắn trigger vào bảng auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================================
-- 4. Cập nhật RLS Phân Quyền cho bảng channels:
-- - Viewer / Khách: Chỉ được xem (SELECT)
-- - Editor & Admin: Được cập nhật số liệu (UPDATE)
-- - Admin: Toàn quyền thêm, sửa, xóa kênh (INSERT, UPDATE, DELETE)
-- ========================================================

-- Cho phép khách vãng lai và mọi user được xem bảng xếp hạng
DROP POLICY IF EXISTS "Public can view channels" ON public.channels;
CREATE POLICY "Public can view channels"
ON public.channels FOR SELECT
TO public
USING (true);

-- Cho phép Editor và Admin được cập nhật kênh
DROP POLICY IF EXISTS "Editors and Admins can update channels" ON public.channels;
CREATE POLICY "Editors and Admins can update channels"
ON public.channels FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
);

-- Cho phép Admin thêm kênh mới
DROP POLICY IF EXISTS "Only Admins can insert channels" ON public.channels;
CREATE POLICY "Only Admins can insert channels"
ON public.channels FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Cho phép Admin xóa kênh
DROP POLICY IF EXISTS "Only Admins can delete channels" ON public.channels;
CREATE POLICY "Only Admins can delete channels"
ON public.channels FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);
