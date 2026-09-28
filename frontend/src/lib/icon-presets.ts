import {
  Bot, Brain, Search, Shield, BarChart3, Rocket,
  FlaskConical, Package, Palette, Zap, Wrench, Globe,
  FileText, Lock, Lightbulb, Target,
  User, Diamond, Star, Puzzle,
  type LucideIcon,
} from 'lucide-react';

// Skill icon presets - use lucide icon keys stored in icon_path
export const SKILL_ICON_PRESETS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: 'bot', icon: Bot, label: '机器人' },
  { key: 'brain', icon: Brain, label: '智能' },
  { key: 'search', icon: Search, label: '搜索' },
  { key: 'shield', icon: Shield, label: '安全' },
  { key: 'chart', icon: BarChart3, label: '数据' },
  { key: 'rocket', icon: Rocket, label: '速度' },
  { key: 'flask', icon: FlaskConical, label: '实验' },
  { key: 'package', icon: Package, label: '打包' },
  { key: 'palette', icon: Palette, label: '创意' },
  { key: 'zap', icon: Zap, label: '效率' },
  { key: 'wrench', icon: Wrench, label: '工具' },
  { key: 'globe', icon: Globe, label: '网络' },
  { key: 'filetext', icon: FileText, label: '文档' },
  { key: 'lock', icon: Lock, label: '加密' },
  { key: 'lightbulb', icon: Lightbulb, label: '灵感' },
  { key: 'target', icon: Target, label: '精准' },
];

// Avatar presets
export const AVATAR_PRESETS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: 'user', icon: User, label: '用户' },
  { key: 'brain', icon: Brain, label: '智能' },
  { key: 'target', icon: Target, label: '精准' },
  { key: 'diamond', icon: Diamond, label: '品质' },
  { key: 'star', icon: Star, label: '之星' },
  { key: 'puzzle', icon: Puzzle, label: '协作' },
  { key: 'zap', icon: Zap, label: '效率' },
  { key: 'bot', icon: Bot, label: '机器人' },
];

// Lookup map for SkillIcon / TopBar / UserHoverCard
const iconMap = new Map<string, LucideIcon>();
for (const p of [...SKILL_ICON_PRESETS, ...AVATAR_PRESETS]) {
  iconMap.set(p.key, p.icon);
}

export function getLucideIcon(key: string): LucideIcon | undefined {
  return iconMap.get(key);
}
