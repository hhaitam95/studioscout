import { useState } from "react";
import {
  gameDestination,
  gameLinkLabel,
  getGameArtworkSources,
} from "./game-artwork";
import type { PopularGameArtworkMetadata } from "./game-artwork";

export type PopularGame = PopularGameArtworkMetadata;

function gameInitials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join("")
    .toUpperCase() || "VG";
}

function GameCoverArtwork({ game, compact }: { game: PopularGame; compact: boolean }) {
  const sources = getGameArtworkSources(game);
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSource = sources[sourceIndex];

  if (currentSource) {
    return (
      <img
        src={currentSource.url}
        alt={game.title + " game cover"}
        data-artwork-source={currentSource.source}
        data-artwork-layout={currentSource.layout}
        loading="lazy"
        decoding="async"
        onError={() => setSourceIndex(current => current + 1)}
      />
    );
  }

  return (
    <span
      className={compact ? "game-cover-fallback is-compact" : "game-cover-fallback"}
      role="img"
      aria-label={game.title + " cover artwork unavailable"}
    >
      <span className="game-cover-monogram" aria-hidden="true">{gameInitials(game.title)}</span>
      {compact ? null : (
        <>
          <strong>{game.title}</strong>
          <small>No verified cover artwork</small>
        </>
      )}
    </span>
  );
}

function gameReleaseYear(game: PopularGame): number | null {
  if (Number.isInteger(game.releaseYear) && game.releaseYear) return game.releaseYear;
  if (game.steamReleaseDate) {
    const timestamp = Date.parse(game.steamReleaseDate);
    if (Number.isFinite(timestamp)) return new Date(timestamp).getUTCFullYear();
  }
  const stageYear = game.stage?.match(/^released(?:\s+in)?\s+(?:[a-z]+\s+)?(19\d{2}|20\d{2}|21\d{2})\b/i);
  return stageYear ? Number(stageYear[1]) : null;
}

function gameYearLabel(game: PopularGame): string {
  if (game.stage?.toLowerCase().includes("in development")) return "In development";
  return String(gameReleaseYear(game) || "Year unverified");
}

function gameYearTitle(game: PopularGame): string {
  if (game.releaseYear && game.releaseYearSourceUrl) return "Release year source: " + game.releaseYearSourceUrl;
  if (game.stage?.toLowerCase().includes("in development")) return "This title is listed as in development.";
  return gameReleaseYear(game) ? "Release year recorded from available game metadata." : "Release year could not be verified from the available metadata.";
}

function PosterContents({ game }: { game: PopularGame }) {
  return (
    <>
      <span className="game-poster-art">
        <GameCoverArtwork game={game} compact={false} />
        {game.stage ? <span className="game-stage-badge">{game.stage}</span> : null}
      </span>
      <span className="game-poster-caption">
        <strong>{game.title}</strong>
        <small title={gameYearTitle(game)}>{gameYearLabel(game)}</small>
      </span>
    </>
  );
}

export default function GamePoster({ game }: { game: PopularGame }) {
  const destination = gameDestination(game);
  const linkLabel = gameLinkLabel(game);

  if (!destination || !linkLabel) {
    return (
      <span
        className="game-poster-card"
        role="group"
        data-game-title={game.title}
        aria-label={game.title + " · " + gameYearLabel(game) + " · no verified game page"}
        data-release-year={gameReleaseYear(game) || ""}
      >
        <PosterContents game={game} />
      </span>
    );
  }

  return (
    <a
      className="game-poster-card"
      href={destination}
      target="_blank"
      rel="noopener noreferrer"
      title={linkLabel}
      aria-label={linkLabel + " · " + gameYearLabel(game)}
      data-game-title={game.title}
      data-release-year={gameReleaseYear(game) || ""}
    >
      <PosterContents game={game} />
    </a>
  );
}

export function GamePosterStrip({ games }: { games: PopularGame[] }) {
  return (
    <span className="popular-work-list" aria-label={games.map(game => game.title + (gameYearLabel(game) ? " " + gameYearLabel(game) : "")).join(", ")}>
      {games.map(game => {
        const destination = gameDestination(game);
        const linkLabel = gameLinkLabel(game);
        const yearLabel = gameYearLabel(game);
        const releaseYear = gameReleaseYear(game);
        const content = <GameCoverArtwork game={game} compact />;
        const caption = (
          <span className="popular-game-caption">
            <strong title={game.title}>{game.title}</strong>
            <small title={gameYearTitle(game)}>{yearLabel}</small>
          </span>
        );

        return (
          <span className="popular-game-entry" key={game.title}>
            {destination && linkLabel ? (
              <a
                className="popular-game-cover"
                href={destination}
                target="_blank"
                rel="noopener noreferrer"
                title={game.title + (yearLabel ? " " + yearLabel : "")}
                aria-label={linkLabel + (yearLabel ? " " + yearLabel : "")}
                data-game-title={game.title}
                data-release-year={releaseYear || ""}
              >
                {content}
              </a>
            ) : (
              <span
                className="popular-game-cover"
                role="group"
                aria-label={game.title + (yearLabel ? " " + yearLabel : "") + " · no verified game page"}
                data-game-title={game.title}
                data-release-year={gameReleaseYear(game) || ""}
              >
                {content}
              </span>
            )}
            {caption}
          </span>
        );
      })}
    </span>
  );
}
