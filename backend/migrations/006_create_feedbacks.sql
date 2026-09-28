-- Migration: Create feedbacks table
-- Created: 2026-06-08

CREATE TABLE IF NOT EXISTS feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    feedback_type VARCHAR(32) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    admin_reply TEXT,
    replied_by UUID REFERENCES users(id) ON DELETE SET NULL,
    replied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS ix_feedbacks_status ON feedbacks(status);
CREATE INDEX IF NOT EXISTS ix_feedbacks_type ON feedbacks(feedback_type);
CREATE INDEX IF NOT EXISTS ix_feedbacks_created_at ON feedbacks(created_at DESC);
