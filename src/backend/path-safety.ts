import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, dirname, sep } from 'node:path';
export function within(root: string, target: string): boolean { const rel = relative(root, target); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)); }
export async function checkedPath(root: string, relativePath: string, allowLink = false): Promise<{
    path: string;
    link: boolean;
}> {
    const rootReal = await realpath(root).catch(() => { throw Error('ROOT_UNAVAILABLE'); });
    // A root replaced with a link must not silently change the authorized world.
    if (relative(root, rootReal) !== '')
        throw Error('OUTSIDE_ROOT');
    const target = resolve(root, relativePath);
    if (!within(root, target))
        throw Error('OUTSIDE_ROOT');
    let current = root;
    const pieces = relative(root, target).split(sep).filter(Boolean);
    for (let i = 0; i < pieces.length; i++) {
        current = resolve(current, pieces[i]!);
        const info = await lstat(current);
        if (info.isSymbolicLink()) {
            if (allowLink && i === pieces.length - 1) {
                if (!within(root, await realpath(dirname(current))))
                    throw Error('OUTSIDE_ROOT');
                return { path: target, link: true };
            }
            throw Error('OUTSIDE_ROOT');
        }
    }
    if (!within(root, await realpath(target)))
        throw Error('OUTSIDE_ROOT');
    return { path: target, link: false };
}
