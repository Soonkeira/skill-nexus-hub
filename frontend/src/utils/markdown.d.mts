export type PackageFile = { path: string };

export function resolvePackagePath(basePath: string | null | undefined, target: string): string | null;
export function findDocumentationPath(files: PackageFile[]): string | null;
