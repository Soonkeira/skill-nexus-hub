export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  nickname: string | null;
  employee_id: string | null;
  department: string | null;
  avatar_url: string | null;
  email?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export type SkillVisibility = 'public' | 'private';

export interface SkillTrustStatus {
  review_status: 'no_version' | 'pending' | 'approved' | 'rejected' | string;
  security_status: 'not_checked' | 'pending' | 'passed' | 'warning' | string;
  documentation_status: 'missing' | 'needs_work' | 'complete' | string;
  latest_version: string | null;
  reviewed_at: string | null;
  labels: string[];
  warnings: string[];
}

export interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tags: string[] | null;
  visibility: SkillVisibility;
  icon_path: string | null;
  versions: { version: string }[] | null;
  latest_version_id: string | null;
  owner_id: string;
  owner_name: string | null;
  owner_nickname: string | null;
  owner_department: string | null;
  created_at: string;
  updated_at: string;
  download_count: number;
  trust: SkillTrustStatus | null;
}

export type VersionStatus = 'pending' | 'approved' | 'rejected';

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  readme: string | null;
  changelog: string | null;
  file_path: string;
  original_filename: string | null;
  file_size: number;
  checksum: string;
  publisher_id: string;
  status: VersionStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface InstallTarget {
  id: string;
  name: string;
  display_name: string;
  global_path: string;
  project_path: string | null;
  description: string | null;
}

export interface Comment {
  id: string;
  content: string;
  user_id: string;
  username: string;
  parent_id: string | null;
  created_at: string;
  replies?: Comment[];
}

export interface ApiToken {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export type FeedbackType = 'bug' | 'usage' | 'suggestion' | 'other';
export type FeedbackStatus = 'pending' | 'processing' | 'resolved' | 'closed';

export interface LocalSkillReport {
  id: string;
  skill_name: string;
  skill_slug: string;
  local_ref: string | null;
  relative_directory: string;
  agent_target: string | null;
  device_id: string | null;
  has_skill_md: boolean;
  has_skill_yaml: boolean;
  file_count: number;
  total_size: number;
  detected_at: string;
}

export interface LocalPublishItem {
  id: string;
  local_ref: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  changelog: string | null;
  visibility: SkillVisibility;
  status: 'pending' | 'completed' | 'failed';
  error_message: string | null;
}

export interface LocalPublishRequest {
  id: string;
  status: 'pending' | 'processing' | 'partial' | 'completed' | 'failed';
  created_at: string;
  items: LocalPublishItem[];
}

export interface DeviceInfo {
  device_id: string;
  device_name: string | null;
  last_scanned_at: string;
  skill_count: number;
}

export interface Feedback {
  id: string;
  user_id: string;
  username: string | null;
  title: string;
  feedback_type: FeedbackType;
  description: string;
  status: FeedbackStatus;
  admin_reply: string | null;
  replied_by: string | null;
  replier_name: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  provider_type: string;
  base_url: string;
  model_name: string;
  api_key_configured: boolean;
  is_default: boolean;
  max_tokens: number;
  temperature: number;
  created_at: string;
}

export interface SkillAnalysis {
  id: string;
  skill_id: string;
  version_id: string;
  provider_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  summary: string | null;
  usage_guide: string | null;
  effects: string | null;
  use_cases: string | null;
  quality_score: number | null;
  warnings: string | null;
  error_message: string | null;
  analyzed_at: string | null;
  created_at: string;
  is_ai_generated: boolean;
}
