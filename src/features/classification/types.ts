export type ScannedFile = {
  relativePath: string;
  fileName: string;
  sizeBytes: number | null;
  uri: string;
  modifiedAt: number | null;
};

export type ClassificationResult = {
  kind: 'movie' | 'series' | 'season' | 'episode' | 'unknown';
  confidence: number;
  evidence: string[];
  suggestedTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  parentRelativePath?: string;
  needsReview: boolean;
};

export type EpisodeGroup = {
  seriesPath: string;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  confidence: number;
  needsReview: boolean;
  evidence: string[];
  files: ScannedFile[];
};

export type MovieGroup = {
  title: string;
  confidence: number;
  needsReview: boolean;
  evidence: string[];
  file: ScannedFile;
};

export type SeriesGroup = {
  path: string;
  title: string;
  confidence: number;
  needsReview: boolean;
  evidence: string[];
  episodes: EpisodeGroup[];
};

export type ClassifiedLibrary = {
  movies: MovieGroup[];
  series: SeriesGroup[];
};
