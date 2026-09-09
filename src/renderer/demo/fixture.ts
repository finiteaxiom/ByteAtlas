import type { Entry } from '../../shared/world/model';

export const ROOT = 'world';
const time = '2026-09-08T04:00:00.000Z';
const dir = (id: string, parentId: string | null, name: string, repository = false): Entry => ({ id, parentId, name, repository, kind: 'directory', bytes: '0', modifiedAt: time, fileType: 'other' });
const file = (id: string, parentId: string, name: string, bytes: string, fileType: Entry['fileType']): Entry => ({ id, parentId, name, kind: 'file', bytes, fileType, modifiedAt: time });

// Fictional data only: names and timestamps never come from the host filesystem.
export const fixture: Entry[] = [
  dir(ROOT, null, '我的工作空间'),
  dir('01-workshop', ROOT, '星河工坊', true), dir('02-gallery', ROOT, '影像花园'),
  dir('03-library', ROOT, '资料馆'), dir('04-archive', ROOT, '归档码头'),
  dir('05-assets', ROOT, '素材仓库'), dir('06-empty', ROOT, '空白花园'),
  file('readme', ROOT, '世界使用说明.md', '16384', 'document'),
  file('ideas', ROOT, '灵感清单.txt', '0', 'document'),
  dir('source', '01-workshop', 'src'), dir('design', '01-workshop', 'design'),
  file('package', '01-workshop', 'package.json', '2700', 'code'),
  file('workshop-readme', '01-workshop', 'README.md', '14800', 'document'),
  dir('components', 'source', 'components'),
  file('main-code', 'source', 'main.ts', '32768', 'code'),
  file('city-code', 'components', 'CityCanvas.tsx', '8200', 'code'),
  file('palette', 'design', '温暖城市配色规范.fig', '4194304', 'other'),
  file('cover', '02-gallery', '日光中的小镇.png', '8388608', 'image'),
  file('garden', '02-gallery', '花园俯瞰.jpg', '3145728', 'image'),
  file('poster', '02-gallery', '城市探索器海报_最终确认版本_超长文件名展示.png', '16777216', 'image'),
  file('guide', '03-library', '设计手册.pdf', '9437184', 'document'),
  file('notes', '03-library', '城市观察笔记.md', '18700', 'document'),
  file('empty-file', '03-library', '尚未开始的故事.txt', '0', 'document'),
  file('archive', '04-archive', '旧项目备份.zip', '2147483648', 'archive'),
  file('huge', '04-archive', '素材母版_64GB.zip', '68719476736', 'archive'),
  ...Array.from({ length: 96 }, (_, i) => file(`asset-${String(i).padStart(3, '0')}`, '05-assets', `微缩建筑贴图_${String(i + 1).padStart(3, '0')}.png`, String((i + 1) * 32768), 'image'))
];
