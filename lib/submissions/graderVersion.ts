/**
 * POST /api/submissions の graderVersion 検証(02§3.1 "422 grader_version_unsupported")。
 * 採点器本体(T-107b)は未実装のため、実際の採点ハーネスのバージョンとは照合できない。
 * ここでは形式(semver: major.minor.patch)とサポート対象メジャーバージョンの
 * ホワイトリストのみを検証する。T-107bでgraderVersion定数が導入され次第、
 * SUPPORTED_GRADER_MAJOR_VERSIONS をそちらの値に合わせて更新すること。
 */
export const SUPPORTED_GRADER_MAJOR_VERSIONS: readonly number[] = [1];

interface ParsedGraderVersion {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseGraderVersion(version: string): ParsedGraderVersion | null {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isSupportedGraderVersion(version: string): boolean {
  const parsed = parseGraderVersion(version);
  if (!parsed) {
    return false;
  }
  return SUPPORTED_GRADER_MAJOR_VERSIONS.includes(parsed.major);
}
