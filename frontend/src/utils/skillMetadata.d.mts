export type SkillMarkdownMetadata = {
  name?: string;
  version?: string;
  description?: string;
};

export function parseSkillMarkdownMetadata(content: string): SkillMarkdownMetadata | null;

export function readSkillPackageMetadata(file: File): Promise<SkillMarkdownMetadata | null>;

export function formatSkillUploadError(detail: unknown): string;

export function formatSkillPublishError(error: unknown): string;
