const SPIN_GROUP_REGEX = /\{([^{}]+)\}/g;

export function resolveSpinnableText(text: string): string {
  return text.replace(SPIN_GROUP_REGEX, (_match, group: string) => {
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

export function extractVariants(text: string): string[][] {
  const groups: string[][] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(SPIN_GROUP_REGEX.source, SPIN_GROUP_REGEX.flags);

  while ((match = regex.exec(text)) !== null) {
    groups.push(match[1].split('|'));
  }

  return groups;
}

export function countTotalVariants(text: string): number {
  const groups = extractVariants(text);
  if (groups.length === 0) return 1;
  return groups.reduce((product, group) => product * group.length, 1);
}
