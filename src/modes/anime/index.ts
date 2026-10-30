import type { Mode } from '../../core/mode';
import { allParams, type Params } from '../../core/schema';
import { randomAnime } from './random';
import { renderAnime } from './render';
import { animeCategories, type AnimeParams } from './schema';

function defaults(): Params {
  const out: Params = {};
  for (const def of allParams(animeCategories)) out[def.key] = def.default;
  return out;
}

export const animeMode: Mode = {
  id: 'anime',
  nameKey: 'mode.anime',
  categories: animeCategories,
  defaults,
  randomize: () => randomAnime() as unknown as Params,
  render: (params, idPrefix, view) => renderAnime(params as unknown as AnimeParams, idPrefix, view),
};
