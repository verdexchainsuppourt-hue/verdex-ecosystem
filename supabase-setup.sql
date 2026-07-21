-- Verdex Waitlist Database Setup
-- Run this in Supabase SQL Editor
-- Go to: https://supabase.com/dashboard/project/unbzescopxtmtbrgqlhh/sql/new

-- Create the waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email_sent BOOLEAN DEFAULT FALSE,
  ip_address TEXT,
  user_agent TEXT
);

-- Enable Row Level Security
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to INSERT (join waitlist)
CREATE POLICY "Anyone can join waitlist" 
  ON waitlist FOR INSERT 
  TO anon, service_role 
  WITH CHECK (true);

-- Service role can read all emails
CREATE POLICY "Service role can read waitlist" 
  ON waitlist FOR SELECT 
  TO service_role 
  USING (true);

-- Service role can update (mark email_sent = true)
CREATE POLICY "Service role can update waitlist" 
  ON waitlist FOR UPDATE 
  TO service_role 
  USING (true);

-- Create an index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

-- Create a function to get waitlist count (public)
CREATE OR REPLACE FUNCTION get_waitlist_count()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM waitlist;
$$ LANGUAGE sql SECURITY DEFINER;

-- Allow anyone to see the count (not individual emails)
GRANT EXECUTE ON FUNCTION get_waitlist_count() TO anon;
