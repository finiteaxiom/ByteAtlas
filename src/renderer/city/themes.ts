import type { FileType } from '../../shared/world/model';
export interface CityTheme {
  id: string; ground: string; road: string; plot: string; foliage: string; roof: string;
  wall: string; ink: string; selection: string; sky: string; types: Record<FileType, string>;
}
export const warmTheme: CityTheme = {
  id: 'warm', ground: '#ddd8b7', road: '#e9e3d3', plot: '#ede9d9', foliage: '#78965a',
  roof: '#bb7961', wall: '#f6eed9', ink: '#344d43', selection: '#d78339', sky: '#f0eee3',
  types: { code: '#80a6a0', document: '#e1c183', image: '#ce947a', archive: '#8d9db1', other: '#aea6be' }
};
// Palette variant validates the theme boundary; this is not the future sci-fi theme.
export const duskTheme: CityTheme = { ...warmTheme, id: 'dusk', sky: '#e9dfd2', ground: '#d8c6aa',
  foliage: '#8f9764', roof: '#aa705d', plot: '#ebdfc9', road: '#e0d0b8', wall: '#f7e3c6' };
