// Home-screen section toggles, persisted in the app_setting KV table.
import { getSetting, setSetting } from '@/db/repositories';

export type HomePrefKey = 'recentlyAdded' | 'continueWatching' | 'youtubeShows' | 'favorites';

export type HomePrefs = Record<HomePrefKey, boolean>;

const KEYS: Record<HomePrefKey, string> = {
  recentlyAdded: 'show_recently_added',
  continueWatching: 'show_continue_watching',
  youtubeShows: 'show_youtube_shows', // reserved: no YouTube section yet
  favorites: 'show_favorites',
};

/** Defaults are ON; any stored value other than '0' counts as ON. */
export async function getHomePrefs(): Promise<HomePrefs> {
  const [ra, cw, yt, fav] = await Promise.all([
    getSetting(KEYS.recentlyAdded),
    getSetting(KEYS.continueWatching),
    getSetting(KEYS.youtubeShows),
    getSetting(KEYS.favorites),
  ]);
  return {
    recentlyAdded: ra !== '0',
    continueWatching: cw !== '0',
    youtubeShows: yt !== '0',
    favorites: fav !== '0',
  };
}

export async function setHomePref(key: HomePrefKey, value: boolean): Promise<void> {
  await setSetting(KEYS[key], value ? '1' : '0');
}
