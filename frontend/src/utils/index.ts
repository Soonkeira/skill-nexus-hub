import type { UserRole, CollaboratorRole, VersionStatus, SkillVisibility } from "@/lib/types"

export function roleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    admin: "管理员",
    user: "用户",
  }
  return map[role] || role
}

export function roleBadgeClass(role: UserRole): string {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
  const map: Record<UserRole, string> = {
    admin: `${base} bg-red-100 text-red-700`,
    user: `${base} bg-gray-100 text-gray-600`,
  }
  return map[role] || base
}

export function collabRoleLabel(role: CollaboratorRole): string {
  const map: Record<CollaboratorRole, string> = {
    owner: "所有者",
    editor: "编辑者",
    viewer: "查看者",
  }
  return map[role] || role
}

export function versionStatusLabel(status: VersionStatus): string {
  const map: Record<VersionStatus, string> = {
    pending: "待审批",
    approved: "已通过",
    rejected: "已拒绝",
  }
  return map[status] || status
}

export function versionStatusClass(status: VersionStatus): string {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
  const map: Record<VersionStatus, string> = {
    pending: `${base} bg-yellow-100 text-yellow-800`,
    approved: `${base} bg-green-100 text-green-800`,
    rejected: `${base} bg-red-100 text-red-800`,
  }
  return map[status] || base
}

export function visibilityLabel(v: SkillVisibility): string {
  return v === "public" ? "公开" : "私有"
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-|-$/g, "")
}

const AVATAR_COLORS = [
  ["#6366f1", "#818cf8"],
  ["#ec4899", "#f472b6"],
  ["#14b8a6", "#5eead4"],
  ["#f59e0b", "#fbbf24"],
  ["#ef4444", "#f87171"],
  ["#8b5cf6", "#a78bfa"],
  ["#06b6d4", "#67e8f9"],
  ["#10b981", "#34d399"],
  ["#f97316", "#fb923c"],
  ["#3b82f6", "#60a5fa"],
]

export function avatarColor(name: string): [string, string] {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] as [string, string]
}

export function displayName(user: { username: string; nickname?: string | null }): string {
  return user.nickname || user.username
}
