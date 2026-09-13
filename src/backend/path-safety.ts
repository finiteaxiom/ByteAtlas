import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, dirname, sep } from 'node:path';
export function within(root: string, target: string): boolean { const rel = relative(root, target); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)); }
export async function checkedPath(root: string, relativePath: string, allowLink = false): Promise<{
    path: string;
    link: boolean;
}> {
    // Roots are canonicalized when a world is created.  Re-stat it for every
    // checked child so a later junction replacement is still rejected, without
    // resolving the same root path again for every entry in a large directory.
    const rootInfo = await lstat(root).catch(() => { throw Error('ROOT_UNAVAILABLE'); });
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
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
