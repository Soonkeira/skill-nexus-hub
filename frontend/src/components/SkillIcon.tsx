import type { Skill } from '@/lib/types';
import { getLucideIcon } from '@/lib/icon-presets';

const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444', '#6366F1'];

export default function SkillIcon({ skill, index, size = 'md' }: { skill: Skill; index: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = COLORS[index % COLORS.length];
  const dimensions = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const iconSize = size === 'sm' ? 20 : size === 'lg' ? 28 : 22;
  const fontSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  const iconPath = skill.icon_path;

  const isImage = iconPath && (iconPath.startsWith('http') || iconPath.startsWith('data:'));
  const LucideIcon = iconPath ? getLucideIcon(iconPath) : undefined;
  // Keep backward compat: old emoji icon_paths still render as emoji
  const isEmoji = iconPath && /\p{Emoji}/u.test(iconPath) && iconPath.length <= 8 && !iconPath.startsWith('http') && !iconPath.startsWith('data:');

  return (
    <div className={`${dimensions} rounded-[10px] flex items-center justify-center overflow-hidden`} style={{ backgroundColor: color }}>
      {isImage ? (
        <img src={iconPath!} alt={skill.name} className="w-full h-full object-cover" />
      ) : LucideIcon ? (
        <LucideIcon size={iconSize} className="text-white" strokeWidth={2} />
      ) : isEmoji ? (
        <span className={fontSize}>{iconPath}</span>
      ) : (
        <span className={`text-white ${fontSize} font-bold`}>{skill.name.charAt(0)}</span>
      )}
    </div>
  );
}
