-- =============================================================================
-- SUPER SURPRISE BOX: Supabase PostgreSQL Schema & RLS Security Rules
-- =============================================================================

-- 1. BOXES TABLE (Holds all 15,051 box records)
CREATE TABLE IF NOT EXISTS public.boxes (
    id INTEGER PRIMARY KEY,
    serial VARCHAR(16) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_by TEXT,
    claimed_at TIMESTAMPTZ,
    opened BOOLEAN NOT NULL DEFAULT FALSE,
    opened_at TIMESTAMPTZ,
    result VARCHAR(16),
    prize_name TEXT,
    claim_code TEXT,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-speed search, filtering, and pagination across 15,051 records
CREATE INDEX IF NOT EXISTS idx_boxes_serial ON public.boxes(serial);
CREATE INDEX IF NOT EXISTS idx_boxes_status ON public.boxes(status);
CREATE INDEX IF NOT EXISTS idx_boxes_is_hidden ON public.boxes(is_hidden);
CREATE INDEX IF NOT EXISTS idx_boxes_status_hidden ON public.boxes(status, is_hidden);

-- 2. PRIZES TABLE (Holds all 100 official winning prize assignments & admin settings)
CREATE TABLE IF NOT EXISTS public.prizes (
    id SERIAL PRIMARY KEY,
    serial VARCHAR(16) NOT NULL UNIQUE REFERENCES public.boxes(serial) ON DELETE CASCADE,
    prize_name TEXT NOT NULL,
    is_card_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    custom_note TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prizes_serial ON public.prizes(serial);

-- 3. CUSTOMERS TABLE (Enforces private link sessions, claims, and one-time opening)
CREATE TABLE IF NOT EXISTS public.customers (
    token VARCHAR(64) PRIMARY KEY,
    assigned_box VARCHAR(16) REFERENCES public.boxes(serial),
    has_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    opened BOOLEAN NOT NULL DEFAULT FALSE,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    opened_at TIMESTAMPTZ,
    result VARCHAR(16),
    prize_name TEXT,
    claim_code TEXT,
    batch_id INTEGER NOT NULL DEFAULT 1,
    customer_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_assigned_box ON public.customers(assigned_box);

-- 4. ADMIN_SETTINGS TABLE (Batch metadata & configuration)
CREATE TABLE IF NOT EXISTS public.admin_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Service Role (Backend Server) has full bypass privileges
DROP POLICY IF EXISTS "Service role full access on boxes" ON public.boxes;
CREATE POLICY "Service role full access on boxes" ON public.boxes
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on prizes" ON public.prizes;
CREATE POLICY "Service role full access on prizes" ON public.prizes
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on customers" ON public.customers;
CREATE POLICY "Service role full access on customers" ON public.customers
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on admin_settings" ON public.admin_settings;
CREATE POLICY "Service role full access on admin_settings" ON public.admin_settings
    FOR ALL USING (auth.role() = 'service_role');

-- Public Anon Read-Only access for public box grid (only non-hidden boxes)
DROP POLICY IF EXISTS "Public can view non-hidden boxes" ON public.boxes;
CREATE POLICY "Public can view non-hidden boxes" ON public.boxes
    FOR SELECT USING (is_hidden = FALSE);

-- Public can read prize list (winning prize names, but without revealing which serials if hidden)
DROP POLICY IF EXISTS "Public can view active prizes" ON public.prizes;
CREATE POLICY "Public can view active prizes" ON public.prizes
    FOR SELECT USING (is_card_hidden = FALSE);
